import {
  applyInventoryProjectionCas,
  rollbackInventoryProjectionCas,
} from './inventoryStockCas.ts';
import { assertActiveBranch, BranchProtectionError } from './branchProtection.ts';
import { appendAuditEvent } from './auditEvent.ts';

export const INVENTORY_MOVEMENT_TYPES = Object.freeze([
  'INITIAL_BALANCE',
  'RESERVE',
  'RELEASE',
  'CONSUME',
  'RETURN',
  'SALE',
  'ADJUST_IN',
  'ADJUST_OUT',
  'REVERSAL',
]);

const RESERVATION_TRANSITIONS = Object.freeze({
  RELEASE: { from: 'RESERVED', to: 'RELEASED', timestamp: 'released_at', key: 'release_operation_key' },
  CONSUME: { from: 'RESERVED', to: 'CONSUMED', timestamp: 'consumed_at', key: 'consume_operation_key' },
  RETURN: { from: 'CONSUMED', to: 'RETURNED', timestamp: 'returned_at', key: 'return_operation_key' },
});

export class InventoryCommandError extends Error {
  constructor(message, code = 'INVENTORY_COMMAND_FAILED', status = 409, details = {}) {
    super(message);
    this.name = 'InventoryCommandError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function finitePositive(value, label = 'quantity') {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InventoryCommandError(`${label} debe ser mayor a cero`, 'INVENTORY_QUANTITY_INVALID', 422);
  }
  return parsed;
}

function finiteNonNegative(value, label) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new InventoryCommandError(`${label} no es valido`, 'INVENTORY_PROJECTION_INVALID', 409);
  }
  return parsed;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function commandFingerprint(input, movements) {
  return sha256(JSON.stringify(stable({
    organization_id: input.organizationId,
    branch_id: input.branchId,
    operation_key: input.operationKey,
    reference_type: input.referenceType || null,
    reference_id: input.referenceId || null,
    reason: input.reason || null,
    movements: movements.map(item => ({
      inventory_id: item.inventoryId,
      movement_type: item.movementType,
      quantity: item.quantity,
      reservation_id: item.reservationId || null,
      work_order_id: item.workOrderId || null,
      quote_id: item.quoteId || null,
      available_delta: item.availableDelta ?? null,
      reserved_delta: item.reservedDelta ?? null,
      reversal_of: item.reversalOf || null,
    })),
  })));
}

function normalizeMovements(rawMovements) {
  if (!Array.isArray(rawMovements) || rawMovements.length === 0) {
    throw new InventoryCommandError('Se requiere al menos un movimiento', 'INVENTORY_MOVEMENTS_REQUIRED', 400);
  }
  const normalized = rawMovements.map(raw => {
    const movementType = String(raw.movementType || '').trim().toUpperCase();
    if (!INVENTORY_MOVEMENT_TYPES.includes(movementType)) {
      throw new InventoryCommandError(`Movimiento no soportado: ${movementType}`, 'INVENTORY_MOVEMENT_INVALID', 422);
    }
    const inventoryId = String(raw.inventoryId || '').trim();
    if (!inventoryId) throw new InventoryCommandError('inventoryId es requerido', 'INVENTORY_ID_REQUIRED', 400);
    return {
      inventoryId,
      movementType,
      quantity: finitePositive(raw.quantity),
      reservationId: raw.reservationId || null,
      workOrderId: raw.workOrderId || null,
      quoteId: raw.quoteId || null,
      availableDelta: raw.availableDelta == null ? null : Number(raw.availableDelta),
      reservedDelta: raw.reservedDelta == null ? null : Number(raw.reservedDelta),
      reversalOf: raw.reversalOf || null,
    };
  }).sort((left, right) => {
    const inventoryOrder = left.inventoryId.localeCompare(right.inventoryId);
    return inventoryOrder || left.movementType.localeCompare(right.movementType)
      || String(left.reservationId || '').localeCompare(String(right.reservationId || ''));
  });
  const duplicateInventory = normalized.find((item, index) => index > 0 && normalized[index - 1].inventoryId === item.inventoryId);
  if (duplicateInventory) {
    throw new InventoryCommandError(
      `Una operacion multi-item solo puede mutar una vez el inventario ${duplicateInventory.inventoryId}`,
      'INVENTORY_DUPLICATE_RESOURCE',
      422,
    );
  }
  return normalized.map((item, index) => ({ ...item, index }));
}

function unwrap(result) {
  return result?.data ?? result;
}

async function correlationUuid(operationKey) {
  const hex = await sha256(String(operationKey));
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function createBase44InventoryLockAdapter(base44) {
  const invoke = async payload => {
    const result = unwrap(await base44.functions.invoke('resourceLockLite', payload));
    if (result?.success === true) return result;
    const code = result?.code === 'LOCK_FINGERPRINT_CONFLICT'
      ? 'INVENTORY_IDEMPOTENCY_CONFLICT'
      : (result?.code || 'INVENTORY_LOCK_FAILED');
    throw new InventoryCommandError(result?.message || 'No fue posible adquirir el lock de inventario', code, code === 'LOCK_ACQUIRE_TIMEOUT' ? 423 : 409, {
      retryable: result?.retryable ?? true,
    });
  };
  return {
    async acquire({ organizationId, operationKey, fingerprint, resources }) {
      const result = await invoke({
        action: 'acquireMany',
        operation: 'inventory-command',
        correlation_id: await correlationUuid(operationKey),
        request_fingerprint: fingerprint,
        resources: resources.map(id => `inventory:${id}`).sort(),
        timeout_ms: 10000,
      });
      return result.lease;
    },
    async assertOwned({ operationKey, lease }) {
      await invoke({
        action: 'assertOwned', operation: 'inventory-command',
        correlation_id: await correlationUuid(operationKey), lease,
      });
      return true;
    },
    async release({ operationKey, lease }) {
      await invoke({
        action: 'releaseMany', operation: 'inventory-command',
        correlation_id: await correlationUuid(operationKey), lease,
      });
      return true;
    },
  };
}

async function findOne(entity, query) {
  const records = await entity.filter(query, '-created_date', 2);
  if ((records || []).length > 1) {
    throw new InventoryCommandError('Se encontraron registros duplicados', 'INVENTORY_DUPLICATE_STATE', 409, { query });
  }
  return records?.[0] || null;
}

function calculateProjection(inventory, movement) {
  const availableBefore = finiteNonNegative(inventory.cantidad_disponible, 'AVAILABLE');
  const reservedBefore = finiteNonNegative(inventory.cantidad_reservada, 'RESERVED');
  const quantity = movement.quantity;
  let availableDelta = 0;
  let reservedDelta = 0;
  switch (movement.movementType) {
    case 'INITIAL_BALANCE':
      if (availableBefore !== 0 || reservedBefore !== 0) {
        throw new InventoryCommandError('INITIAL_BALANCE solo se permite sobre inventario en cero', 'INVENTORY_INITIAL_BALANCE_CONFLICT', 409);
      }
      availableDelta = quantity;
      break;
    case 'ADJUST_IN':
    case 'RETURN':
      availableDelta = quantity;
      break;
    case 'ADJUST_OUT':
    case 'SALE':
      availableDelta = -quantity;
      break;
    case 'RESERVE':
      availableDelta = -quantity;
      reservedDelta = quantity;
      break;
    case 'RELEASE':
      availableDelta = quantity;
      reservedDelta = -quantity;
      break;
    case 'CONSUME':
      reservedDelta = -quantity;
      break;
    case 'REVERSAL':
      if (!Number.isFinite(movement.availableDelta) || !Number.isFinite(movement.reservedDelta)) {
        throw new InventoryCommandError('La reversion requiere deltas explicitos', 'INVENTORY_REVERSAL_INVALID', 422);
      }
      availableDelta = movement.availableDelta;
      reservedDelta = movement.reservedDelta;
      break;
    default:
      throw new InventoryCommandError('Movimiento no soportado', 'INVENTORY_MOVEMENT_INVALID', 422);
  }
  const availableAfter = availableBefore + availableDelta;
  const reservedAfter = reservedBefore + reservedDelta;
  if (availableAfter < 0) {
    throw new InventoryCommandError(
      `Stock disponible insuficiente. Disponible: ${availableBefore}, solicitado: ${quantity}`,
      'INVENTORY_INSUFFICIENT_AVAILABLE', 409,
      { available: availableBefore, requested: quantity },
    );
  }
  if (reservedAfter < 0) {
    throw new InventoryCommandError(
      `Reserva insuficiente. Reservado: ${reservedBefore}, solicitado: ${quantity}`,
      'INVENTORY_INSUFFICIENT_RESERVED', 409,
      { reserved: reservedBefore, requested: quantity },
    );
  }
  return {
    availableBefore, reservedBefore, availableAfter, reservedAfter,
    availableDelta, reservedDelta,
    onHandDelta: availableDelta + reservedDelta,
  };
}

async function loadReservation(entities, input, movement) {
  if (movement.movementType === 'RESERVE') {
    if (!movement.workOrderId) {
      throw new InventoryCommandError('RESERVE requiere workOrderId', 'INVENTORY_WORK_ORDER_REQUIRED', 422);
    }
    let reservation = await findOne(entities.InventarioReserva, {
      organization_id: input.organizationId,
      reserve_operation_key: input.operationKey,
      inventario_id: movement.inventoryId,
    });
    if (reservation?.state === 'RELEASED' && reservation.failure_compensated === true) {
      const reopened = await entities.InventarioReserva.updateMany({
        id: reservation.id,
        organization_id: input.organizationId,
        state: 'RELEASED',
        reserve_operation_key: input.operationKey,
        failure_compensated: true,
      }, { $set: { state: 'PENDING', failure_compensated: false } });
      if (reopened?.updated !== 1) {
        throw new InventoryCommandError('La reserva compensada cambio antes del reintento', 'INVENTORY_RESERVATION_CONCURRENT_UPDATE', 409);
      }
      reservation = await findOne(entities.InventarioReserva, { id: reservation.id, organization_id: input.organizationId });
    }
    if (reservation) return { reservation, created: false, previousState: reservation.state };
    const data = {
      organization_id: input.organizationId,
      branch_id: input.branchId,
      work_order_id: movement.workOrderId,
      inventory_id: movement.inventoryId,
      inventario_id: movement.inventoryId,
      quote_id: movement.quoteId || null,
      quantity: movement.quantity,
      state: 'PENDING',
      reserve_operation_key: input.operationKey,
      created_by: input.actorId,
      reserved_at: new Date().toISOString(),
    };
    try {
      reservation = await entities.InventarioReserva.create(data);
    } catch (error) {
      reservation = await findOne(entities.InventarioReserva, {
        organization_id: input.organizationId,
        reserve_operation_key: input.operationKey,
        inventario_id: movement.inventoryId,
      });
      if (!reservation) throw error;
    }
    return { reservation, created: true, previousState: null };
  }
  const transition = RESERVATION_TRANSITIONS[movement.movementType];
  if (!transition) return { reservation: null, created: false, previousState: null };
  const query = movement.reservationId
    ? { id: movement.reservationId, organization_id: input.organizationId }
    : {
      organization_id: input.organizationId,
      branch_id: input.branchId,
      work_order_id: movement.workOrderId,
      inventario_id: movement.inventoryId,
      state: transition.from,
    };
  const reservation = await findOne(entities.InventarioReserva, query);
  if (!reservation) {
    throw new InventoryCommandError('Reserva de inventario no encontrada', 'INVENTORY_RESERVATION_NOT_FOUND', 404);
  }
  if (reservation.branch_id !== input.branchId || reservation.inventory_id !== movement.inventoryId && reservation.inventario_id !== movement.inventoryId) {
    throw new InventoryCommandError('La reserva no pertenece al inventario o sucursal autorizada', 'INVENTORY_RESERVATION_SCOPE_MISMATCH', 403);
  }
  if (Number(reservation.quantity) !== movement.quantity) {
    throw new InventoryCommandError('La cantidad no coincide con la reserva', 'INVENTORY_RESERVATION_QUANTITY_MISMATCH', 409);
  }
  if (reservation.state === transition.to && reservation[transition.key] === input.operationKey) {
    return { reservation, created: false, previousState: transition.from, alreadyCommitted: true };
  }
  if (reservation.state !== transition.from) {
    throw new InventoryCommandError(`La reserva esta en estado ${reservation.state}`, 'INVENTORY_RESERVATION_STATE_CONFLICT', 409);
  }
  return { reservation, created: false, previousState: reservation.state };
}

async function commitReservation(entities, input, movement, reservationContext) {
  const reservation = reservationContext.reservation;
  if (!reservation) return null;
  const now = new Date().toISOString();
  const transition = movement.movementType === 'RESERVE'
    ? { from: 'PENDING', to: 'RESERVED', timestamp: 'reserved_at', key: 'reserve_operation_key' }
    : RESERVATION_TRANSITIONS[movement.movementType];
  if (reservation.state === transition.to && reservation[transition.key] === input.operationKey) return reservation;
  let result;
  try {
    result = await entities.InventarioReserva.updateMany({
      id: reservation.id,
      organization_id: input.organizationId,
      state: transition.from,
    }, { $set: {
      state: transition.to,
      [transition.key]: input.operationKey,
      [transition.timestamp]: now,
      last_operation_key: input.operationKey,
    } });
  } catch (error) {
    const reconciled = await findOne(entities.InventarioReserva, { id: reservation.id, organization_id: input.organizationId });
    if (reconciled?.state === transition.to && reconciled?.[transition.key] === input.operationKey) return reconciled;
    throw error;
  }
  if (result?.updated !== 1) {
    const reconciled = await findOne(entities.InventarioReserva, { id: reservation.id, organization_id: input.organizationId });
    if (reconciled?.state === transition.to && reconciled?.[transition.key] === input.operationKey) return reconciled;
    throw new InventoryCommandError('La reserva cambio durante la operacion', 'INVENTORY_RESERVATION_CONCURRENT_UPDATE', 409);
  }
  return findOne(entities.InventarioReserva, { id: reservation.id, organization_id: input.organizationId });
}

async function restoreReservation(entities, input, movement, context) {
  if (!context?.reservation) return;
  if (context.created) {
    await entities.InventarioReserva.updateMany({
      id: context.reservation.id,
      organization_id: input.organizationId,
    }, { $set: { state: 'RELEASED', released_at: new Date().toISOString(), failure_compensated: true } });
    return;
  }
  if (!context.previousState) return;
  await entities.InventarioReserva.updateMany({
    id: context.reservation.id,
    organization_id: input.organizationId,
  }, { $set: { state: context.previousState, failure_compensated: true } });
}

function ledgerData(input, movement, projection, fingerprint, movementKey, reservationId) {
  return {
    organization_id: input.organizationId,
    branch_id: input.branchId,
    inventario_id: movement.inventoryId,
    inventory_id: movement.inventoryId,
    movement_key: movementKey,
    movement_type: movement.movementType,
    quantity: movement.quantity,
    quantity_delta: projection.onHandDelta,
    available_delta: projection.availableDelta,
    reserved_delta: projection.reservedDelta,
    available_before: projection.availableBefore,
    available_after: projection.availableAfter,
    reserved_before: projection.reservedBefore,
    reserved_after: projection.reservedAfter,
    reference_type: input.referenceType || null,
    reference_id: input.referenceId || null,
    work_order_id: movement.workOrderId || null,
    quote_id: movement.quoteId || null,
    reservation_id: reservationId || null,
    operation_key: input.operationKey,
    fingerprint,
    reversal_of: movement.reversalOf || null,
    modificado_por: input.actorId,
    actor_user_id: input.actorId,
    effective_at: new Date().toISOString(),
    motivo: input.reason || movement.movementType,
    campo: 'cantidad_disponible',
    valor_anterior: String(projection.availableBefore),
    valor_nuevo: String(projection.availableAfter),
  };
}

async function createLedger(entities, data) {
  try {
    return await entities.InventarioHistorial.create(data);
  } catch (error) {
    const existing = await findOne(entities.InventarioHistorial, {
      organization_id: data.organization_id,
      movement_key: data.movement_key,
    });
    if (existing?.fingerprint === data.fingerprint) return existing;
    if (existing) {
      throw new InventoryCommandError('El movement_key ya existe con otro fingerprint', 'INVENTORY_IDEMPOTENCY_CONFLICT', 409);
    }
    throw error;
  }
}

async function loadInventory(entities, input, movement) {
  const inventory = await findOne(entities.Inventario, {
    id: movement.inventoryId,
    organization_id: input.organizationId,
  });
  if (!inventory) throw new InventoryCommandError('Producto de inventario no encontrado', 'INVENTORY_NOT_FOUND', 404);
  if (!inventory.branch_id || inventory.branch_id !== input.branchId) {
    throw new InventoryCommandError('El producto pertenece a otra sucursal', 'INVENTORY_CROSS_BRANCH_DENIED', 403);
  }
  return inventory;
}

async function applyMovement(entities, input, movement, fingerprint) {
  const baseMovementKey = `${input.operationKey}:${movement.index}`;
  const priorAttempts = await entities.InventarioHistorial.filter({
    organization_id: input.organizationId,
    operation_key: input.operationKey,
    inventario_id: movement.inventoryId,
  }, 'effective_at', 500);
  const matchingAttempts = (priorAttempts || []).filter(row => row.movement_key === baseMovementKey
    || String(row.movement_key || '').startsWith(`${baseMovementKey}:retry:`));
  const movementKey = matchingAttempts.length === 0
    ? baseMovementKey
    : `${baseMovementKey}:retry:${matchingAttempts.length}`;
  const inventory = await loadInventory(entities, input, movement);
  const reservationContext = await loadReservation(entities, input, movement);
  const projection = calculateProjection(inventory, movement);
  const movementDate = new Date().toISOString().split('T')[0];
  let cas;
  try {
    cas = await applyInventoryProjectionCas(entities.Inventario, {
      inventoryId: movement.inventoryId,
      organizationId: input.organizationId,
      branchId: input.branchId,
      expectedAvailable: projection.availableBefore,
      expectedReserved: projection.reservedBefore,
      newAvailable: projection.availableAfter,
      newReserved: projection.reservedAfter,
      movementDate,
      operationKey: input.operationKey,
      movementKey,
    });
  } catch (error) {
    const reconciled = await loadInventory(entities, input, movement);
    if (reconciled.last_inventory_operation_key === input.operationKey
      && reconciled.last_inventory_movement_key === movementKey
      && Number(reconciled.cantidad_disponible) === projection.availableAfter
      && Number(reconciled.cantidad_reservada || 0) === projection.reservedAfter) {
      cas = { updated: 1, recovered_ambiguous_update: true };
    } else {
      await restoreReservation(entities, input, movement, reservationContext).catch(() => null);
      throw error;
    }
  }
  if (cas?.updated !== 1) {
    await restoreReservation(entities, input, movement, reservationContext).catch(() => null);
    const current = await loadInventory(entities, input, movement);
    calculateProjection(current, movement);
    throw new InventoryCommandError('El inventario cambio durante la operacion', 'INVENTORY_CONCURRENT_UPDATE', 409, { retryable: true });
  }

  let ledger;
  try {
    ledger = await createLedger(entities, ledgerData(
      input, movement, projection, fingerprint, movementKey, reservationContext.reservation?.id,
    ));
  } catch (ledgerError) {
    const rollback = await rollbackInventoryProjectionCas(entities.Inventario, {
      inventoryId: movement.inventoryId,
      organizationId: input.organizationId,
      branchId: input.branchId,
      expectedAvailable: projection.availableAfter,
      expectedReserved: projection.reservedAfter,
      previousAvailable: projection.availableBefore,
      previousReserved: projection.reservedBefore,
      previousMovementDate: inventory.fecha_ultimo_movimiento || null,
      operationKey: input.operationKey,
      movementKey,
    });
    await restoreReservation(entities, input, movement, reservationContext).catch(() => null);
    if (rollback?.updated !== 1) {
      throw new InventoryCommandError(
        'Fallo el ledger y no fue posible confirmar la compensacion',
        'INVENTORY_COMPENSATION_INCOMPLETE', 500,
        { cause: ledgerError.message, inventory_id: movement.inventoryId },
      );
    }
    throw new InventoryCommandError('Fallo el ledger; la proyeccion fue revertida', 'INVENTORY_LEDGER_WRITE_FAILED', 500, {
      cause: ledgerError.message,
    });
  }

  let reservation = reservationContext.reservation;
  try {
    reservation = await commitReservation(entities, input, movement, reservationContext);
  } catch (reservationError) {
    const rollback = await rollbackInventoryProjectionCas(entities.Inventario, {
      inventoryId: movement.inventoryId,
      organizationId: input.organizationId,
      branchId: input.branchId,
      expectedAvailable: projection.availableAfter,
      expectedReserved: projection.reservedAfter,
      previousAvailable: projection.availableBefore,
      previousReserved: projection.reservedBefore,
      previousMovementDate: inventory.fecha_ultimo_movimiento || null,
      operationKey: input.operationKey,
      movementKey,
    });
    await restoreReservation(entities, input, movement, reservationContext).catch(() => null);
    if (rollback?.updated === 1) {
      await createLedger(entities, {
        ...ledgerData(input, {
          ...movement,
          movementType: 'REVERSAL',
          reversalOf: ledger.id,
        }, {
          availableBefore: projection.availableAfter,
          reservedBefore: projection.reservedAfter,
          availableAfter: projection.availableBefore,
          reservedAfter: projection.reservedBefore,
          availableDelta: -projection.availableDelta,
          reservedDelta: -projection.reservedDelta,
          onHandDelta: -projection.onHandDelta,
        }, fingerprint, `${movementKey}:reservation-compensation`, reservation?.id),
        operation_key: `${input.operationKey}:reservation-compensation`,
      }).catch(() => null);
    }
    throw new InventoryCommandError('No fue posible confirmar la reserva', 'INVENTORY_RESERVATION_COMMIT_FAILED', 500, {
      cause: reservationError.message,
    });
  }

  return {
    inventory_id: movement.inventoryId,
    movement_id: ledger.id,
    movement_key: movementKey,
    movement_type: movement.movementType,
    available_before: projection.availableBefore,
    available_after: projection.availableAfter,
    reserved_before: projection.reservedBefore,
    reserved_after: projection.reservedAfter,
    reservation_id: reservation?.id || null,
  };
}

async function compensateApplied(entities, input, applied, fingerprint) {
  const errors = [];
  for (const result of [...applied].reverse()) {
    try {
      const current = await findOne(entities.Inventario, {
        id: result.inventory_id,
        organization_id: input.organizationId,
        branch_id: input.branchId,
      });
      if (!current) throw new Error('inventory_missing');
      const reversalKey = `${input.operationKey}:automatic-reversal:${result.movement_id}`;
      const reversalMovement = {
        inventoryId: result.inventory_id,
        movementType: 'REVERSAL',
        quantity: Math.max(1, Math.abs((result.available_after - result.available_before) + (result.reserved_after - result.reserved_before))),
        availableDelta: result.available_before - result.available_after,
        reservedDelta: result.reserved_before - result.reserved_after,
        reversalOf: result.movement_id,
        index: 0,
      };
      await applyMovement(entities, {
        ...input,
        operationKey: reversalKey,
        referenceType: 'INTERNAL_REVERSAL',
        referenceId: result.movement_id,
        reason: `Compensacion automatica de ${input.operationKey}`,
      }, reversalMovement, fingerprint);
      if (result.reservation_id) {
        const backwards = {
          RESERVE: { from: 'RESERVED', to: 'RELEASED', key: 'reserve_operation_key' },
          CONSUME: { from: 'CONSUMED', to: 'RESERVED', key: 'consume_operation_key' },
          RELEASE: { from: 'RELEASED', to: 'RESERVED', key: 'release_operation_key' },
          RETURN: { from: 'RETURNED', to: 'CONSUMED', key: 'return_operation_key' },
        }[result.movement_type];
        if (backwards) {
          const restored = await entities.InventarioReserva.updateMany({
            id: result.reservation_id,
            organization_id: input.organizationId,
            state: backwards.from,
            [backwards.key]: input.operationKey,
          }, { $set: { state: backwards.to, failure_compensated: true } });
          if (restored?.updated !== 1) throw new Error('reservation_compensation_ownership_lost');
        }
      }
    } catch (error) {
      errors.push(`${result.inventory_id}:${error.code || error.message}`);
    }
  }
  return errors;
}

async function replayResult(entities, input, movements, fingerprint) {
  const rows = await entities.InventarioHistorial.filter({
    organization_id: input.organizationId,
    operation_key: input.operationKey,
  }, 'effective_at', 500);
  if ((rows || []).some(row => row.fingerprint !== fingerprint)) {
    throw new InventoryCommandError('La operation key fue reutilizada con otro payload', 'INVENTORY_IDEMPOTENCY_CONFLICT', 409);
  }
  const primary = [];
  const businessReversed = new Set();
  for (const movement of movements) {
    const baseMovementKey = `${input.operationKey}:${movement.index}`;
    const candidates = (rows || []).filter(row => row.movement_key === baseMovementKey
      || String(row.movement_key || '').startsWith(`${baseMovementKey}:retry:`));
    let committed = null;
    for (const candidate of [...candidates].reverse()) {
      const reversals = await entities.InventarioHistorial.filter({
        organization_id: input.organizationId,
        reversal_of: candidate.id,
      }, '-effective_at', 20);
      const automaticallyReversed = (reversals || []).some(row => {
        const key = String(row.operation_key || '');
        return key.includes(':automatic-reversal:') || key.includes(':reservation-compensation');
      });
      if (!automaticallyReversed) {
        committed = candidate;
        if ((reversals || []).length > 0) businessReversed.add(candidate.id);
        break;
      }
    }
    if (committed) primary.push(committed);
  }
  if (primary.length !== movements.length) return null;
  for (const row of primary) {
    if (row.reservation_id && !businessReversed.has(row.id)) {
      const reservation = await findOne(entities.InventarioReserva, {
        id: row.reservation_id,
        organization_id: input.organizationId,
      });
      const movement = movements.find(item => `${input.operationKey}:${item.index}` === row.movement_key);
      if (reservation && movement) {
        await commitReservation(entities, input, movement, {
          reservation, created: movement.movementType === 'RESERVE', previousState: reservation.state,
        });
      }
    }
  }
  return {
    success: true,
    operation_key: input.operationKey,
    fingerprint,
    idempotent: true,
    results: primary.map(row => ({
      inventory_id: row.inventario_id,
      movement_id: row.id,
      movement_key: row.movement_key,
      movement_type: row.movement_type,
      available_before: row.available_before,
      available_after: row.available_after,
      reserved_before: row.reserved_before,
      reserved_after: row.reserved_after,
      reservation_id: row.reservation_id || null,
    })),
  };
}

export async function executeInventoryCommand(base44, rawInput, providedLockAdapter = null) {
  const input = {
    ...rawInput,
    organizationId: String(rawInput?.organizationId || '').trim(),
    branchId: String(rawInput?.branchId || '').trim(),
    actorId: String(rawInput?.actorId || '').trim(),
    operationKey: String(rawInput?.operationKey || '').trim(),
  };
  if (!input.organizationId || !input.branchId || !input.actorId || !input.operationKey) {
    throw new InventoryCommandError(
      'organizationId, branchId, actorId y operationKey son requeridos',
      'INVENTORY_COMMAND_CONTEXT_REQUIRED', 400,
    );
  }
  const movements = normalizeMovements(input.movements);
  const isRecoveryOnly = movements.every(movement => movement.type === 'REVERSAL');
  if (!isRecoveryOnly) {
    try {
      await assertActiveBranch(base44, input.organizationId, input.branchId, {
        code: 'INVENTORY_BRANCH_INACTIVE',
        status: 409,
        message: 'La sucursal esta inactiva y no admite mutaciones ordinarias de inventario.',
      });
    } catch (error) {
      if (error instanceof BranchProtectionError) {
        throw new InventoryCommandError(error.message, error.code, error.status, error.details);
      }
      throw error;
    }
  }
  const fingerprint = await commandFingerprint(input, movements);
  if (input.fingerprint && input.fingerprint !== fingerprint) {
    throw new InventoryCommandError('El fingerprint no coincide con el comando', 'INVENTORY_FINGERPRINT_MISMATCH', 409);
  }
  const entities = base44.asServiceRole.entities;
  const auditCommitted = async result => {
    const movementIds = (result.results || []).map(row => row.movement_id).filter(Boolean).sort();
    if (movementIds.length !== (result.results || []).length || movementIds.length === 0) {
      throw new InventoryCommandError('La operacion no produjo identidad durable para auditoria', 'AUDIT_OPERATION_ID_SOURCE_REQUIRED', 500);
    }
    const auditOperationId = `inventory-command:${await sha256(movementIds)}`;
    const audit = await appendAuditEvent(base44, {
      eventType: 'INVENTORY_COMMAND_COMMITTED',
      principalClass: input.principalClass || 'HUMAN_MEMBER',
      actorUserId: input.principalClass === 'CUSTOMER_TOKEN' ? null : input.actorId,
      actorPrimaryRole: input.actorPrimaryRole || null,
      organizationId: input.organizationId,
      branchId: input.branchId,
      resourceType: 'InventarioHistorial',
      resourceId: input.operationKey,
      commandPolicyId: 'CP-INV-001',
      correlationId: input.correlationId || input.operationKey,
      auditOperationId,
      operationKey: input.operationKey,
      outcome: result.idempotent ? 'IDEMPOTENT_REPLAY' : 'COMMITTED',
      newState: { movement_count: result.results?.length || 0 },
      metadata: {
        reference_type: input.referenceType || null,
        reference_id: input.referenceId || null,
        movements: (result.results || []).map(row => ({ movement_id: row.movement_id, movement_type: row.movement_type, inventory_id: row.inventory_id, reservation_id: row.reservation_id || null })),
      },
    });
    return { ...result, audit_event_id: audit.event.id };
  };
  const preexisting = await replayResult(entities, input, movements, fingerprint);
  if (preexisting) return auditCommitted(preexisting);

  const lockAdapter = providedLockAdapter || createBase44InventoryLockAdapter(base44);
  const lease = await lockAdapter.acquire({
    organizationId: input.organizationId,
    operationKey: input.operationKey,
    fingerprint,
    resources: movements.map(item => item.inventoryId),
  });
  const applied = [];
  try {
    await lockAdapter.assertOwned({ operationKey: input.operationKey, lease });
    const replay = await replayResult(entities, input, movements, fingerprint);
    if (replay) return auditCommitted(replay);
    for (const movement of movements) {
      await lockAdapter.assertOwned({ operationKey: input.operationKey, lease });
      const committed = await replayResult(entities, input, [movement], fingerprint);
      if (committed) applied.push(committed.results[0]);
      else applied.push(await applyMovement(entities, input, movement, fingerprint));
    }
    return auditCommitted({
      success: true,
      operation_key: input.operationKey,
      fingerprint,
      idempotent: false,
      results: applied,
    });
  } catch (error) {
    if (applied.length > 0) {
      const compensationErrors = await compensateApplied(entities, input, applied, fingerprint);
      if (compensationErrors.length > 0) {
        throw new InventoryCommandError(
          'La operacion fallo y su compensacion requiere revision',
          'INVENTORY_MULTI_ITEM_COMPENSATION_INCOMPLETE', 500,
          { cause: error.message, compensation_errors: compensationErrors },
        );
      }
    }
    throw error;
  } finally {
    try { await lockAdapter.release({ operationKey: input.operationKey, lease }); }
    catch (error) { console.error('[inventoryMutationService] lock release failed:', error.message); }
  }
}

export async function reverseInventoryCommand(base44, input, lockAdapter = null) {
  const entities = base44.asServiceRole.entities;
  const original = await entities.InventarioHistorial.filter({
    organization_id: input.organizationId,
    operation_key: input.operationKey,
  }, 'effective_at', 500);
  const primary = [];
  for (const row of (original || []).filter(item => !item.reversal_of && item.movement_type !== 'REVERSAL')) {
    const reversals = await entities.InventarioHistorial.filter({
      organization_id: input.organizationId,
      reversal_of: row.id,
    }, '-effective_at', 20);
    if (!(reversals || []).length) primary.push(row);
  }
  if (primary.length === 0) {
    const replay = await entities.InventarioHistorial.filter({
      organization_id: input.organizationId,
      operation_key: input.reversalOperationKey,
    }, 'effective_at', 500);
    if (replay?.length) {
      return {
        success: true,
        operation_key: input.reversalOperationKey,
        idempotent: true,
        results: replay.map(row => ({
          inventory_id: row.inventario_id,
          movement_id: row.id,
          movement_key: row.movement_key,
          movement_type: row.movement_type,
          available_before: row.available_before,
          available_after: row.available_after,
          reserved_before: row.reserved_before,
          reserved_after: row.reserved_after,
          reservation_id: row.reservation_id || null,
        })),
      };
    }
    throw new InventoryCommandError('No se encontraron movimientos para revertir', 'INVENTORY_REVERSAL_SOURCE_NOT_FOUND', 404);
  }
  const duplicateInventory = primary.find((row, index) => index > 0
    && primary.slice(0, index).some(candidate => candidate.inventario_id === row.inventario_id));
  if (duplicateInventory) {
    throw new InventoryCommandError('Existen multiples movimientos activos para el mismo inventario', 'INVENTORY_DUPLICATE_STATE', 409);
  }
  const result = await executeInventoryCommand(base44, {
    organizationId: input.organizationId,
    branchId: input.branchId,
    actorId: input.actorId,
    operationKey: input.reversalOperationKey,
    referenceType: 'INTERNAL_REVERSAL',
    referenceId: input.operationKey,
    reason: input.reason || `Reversion de ${input.operationKey}`,
    movements: primary.map(row => ({
      inventoryId: row.inventario_id,
      movementType: 'REVERSAL',
      quantity: Math.max(1, Math.abs(Number(row.quantity_delta || 0))),
      availableDelta: -Number(row.available_delta || 0),
      reservedDelta: -Number(row.reserved_delta || 0),
      reversalOf: row.id,
    })),
  }, lockAdapter);
  for (const row of primary.filter(item => item.reservation_id)) {
    const backwards = {
      RESERVE: { from: 'RESERVED', to: 'RELEASED', key: 'reserve_operation_key' },
      CONSUME: { from: 'CONSUMED', to: 'RESERVED', key: 'consume_operation_key' },
      RELEASE: { from: 'RELEASED', to: 'RESERVED', key: 'release_operation_key' },
      RETURN: { from: 'RETURNED', to: 'CONSUMED', key: 'return_operation_key' },
    }[row.movement_type];
    if (!backwards) continue;
    const reservation = await findOne(entities.InventarioReserva, {
      id: row.reservation_id,
      organization_id: input.organizationId,
    });
    if (reservation?.state === backwards.to && reservation?.last_operation_key === input.reversalOperationKey) continue;
    const restored = await entities.InventarioReserva.updateMany({
      id: row.reservation_id,
      organization_id: input.organizationId,
      state: backwards.from,
      [backwards.key]: input.operationKey,
    }, { $set: {
      state: backwards.to,
      last_operation_key: input.reversalOperationKey,
      failure_compensated: true,
    } });
    if (restored?.updated !== 1) {
      throw new InventoryCommandError(
        'La proyeccion fue revertida pero el estado de reserva requiere revision',
        'INVENTORY_REVERSAL_RESERVATION_INCOMPLETE', 500,
        { reservation_id: row.reservation_id },
      );
    }
  }
  return result;
}
