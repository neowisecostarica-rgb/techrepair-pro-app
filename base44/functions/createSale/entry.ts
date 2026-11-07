// base44/functions/createSale/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";

// base44/functions/_shared/inventoryStockCas.ts
async function applyInventoryProjectionCas(entity, input) {
  const query = {
    id: input.inventoryId,
    organization_id: input.organizationId,
    cantidad_disponible: input.expectedAvailable
  };
  if (Number(input.expectedReserved) === 0) {
    query.$or = [
      { cantidad_reservada: 0 },
      { cantidad_reservada: null },
      { cantidad_reservada: { $exists: false } }
    ];
  } else query.cantidad_reservada = input.expectedReserved;
  if (input.branchId) query.branch_id = input.branchId;
  const set = {
    cantidad_disponible: input.newAvailable,
    cantidad_reservada: input.newReserved,
    fecha_ultimo_movimiento: input.movementDate,
    last_inventory_operation_key: input.operationKey,
    last_inventory_movement_key: input.movementKey
  };
  if (input.legacySaleId) set.last_sale_id = input.legacySaleId;
  if (input.legacySaleOperationKey) set.last_sale_operation_key = input.legacySaleOperationKey;
  return entity.updateMany(query, { $set: set });
}
async function rollbackInventoryProjectionCas(entity, input) {
  const query = {
    id: input.inventoryId,
    organization_id: input.organizationId,
    cantidad_disponible: input.expectedAvailable,
    last_inventory_operation_key: input.operationKey,
    last_inventory_movement_key: input.movementKey
  };
  if (Number(input.expectedReserved) === 0) {
    query.$or = [
      { cantidad_reservada: 0 },
      { cantidad_reservada: null },
      { cantidad_reservada: { $exists: false } }
    ];
  } else query.cantidad_reservada = input.expectedReserved;
  if (input.branchId) query.branch_id = input.branchId;
  const unset = {
    last_inventory_operation_key: "",
    last_inventory_movement_key: ""
  };
  if (input.legacySaleId) unset.last_sale_id = "";
  if (input.legacySaleOperationKey) unset.last_sale_operation_key = "";
  return entity.updateMany(query, {
    $set: {
      cantidad_disponible: input.previousAvailable,
      cantidad_reservada: input.previousReserved,
      fecha_ultimo_movimiento: input.previousMovementDate ?? null
    },
    $unset: unset
  });
}

// base44/functions/_shared/branchProtection.ts
var BranchProtectionError = class extends Error {
  code;
  status;
  details;
  constructor(message, code = "BRANCH_PROTECTION_FAILED", status = 409, details = {}) {
    super(message);
    this.name = "BranchProtectionError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
};
async function assertActiveBranch(base44, organizationId, branchId, options = {}) {
  if (!organizationId || !branchId) {
    throw new BranchProtectionError(
      options.message || "La operacion requiere una sucursal activa.",
      options.code || "ACTIVE_BRANCH_REQUIRED",
      options.status || 409
    );
  }
  const branches = await base44.asServiceRole.entities.Branch.filter({
    id: branchId,
    organization_id: organizationId,
    active: true
  }, "-created_date", 1);
  const branch = branches?.[0] || null;
  if (!branch) {
    throw new BranchProtectionError(
      options.message || "La sucursal no existe, no pertenece a la organizacion o esta inactiva.",
      options.code || "BRANCH_INACTIVE",
      options.status || 409,
      { branch_id: branchId }
    );
  }
  return branch;
}

// base44/functions/_shared/auditEvent.ts
var MAX_TEXT = 240;
function clean(value, max = MAX_TEXT) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}
function cleanObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value));
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value ?? null;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function immutableIdentity(event) {
  return stable({
    event_type: event.event_type,
    principal_class: event.principal_class,
    actor_user_id: event.actor_user_id,
    effective_technician_user_id: event.effective_technician_user_id,
    resource_type: event.resource_type,
    resource_id: event.resource_id,
    command_policy_id: event.command_policy_id,
    operation_semantics: event.operation_semantics || {}
  });
}
function assertCompatible(existing, candidate) {
  if (JSON.stringify(immutableIdentity(existing)) === JSON.stringify(immutableIdentity(candidate))) return;
  const error = new Error("AUDIT_OPERATION_ID_COLLISION");
  error.code = "AUDIT_OPERATION_ID_COLLISION";
  throw error;
}
async function findExisting(base44, event) {
  const existing = await base44.asServiceRole.entities.AuditEvent.filter({
    organization_id: event.organization_id,
    audit_operation_id: event.audit_operation_id
  }, "-created_date", 2);
  if (existing?.length > 1) {
    for (const record of existing) assertCompatible(record, event);
    const error = new Error("AUDIT_OPERATION_ID_AMBIGUOUS");
    error.code = "AUDIT_OPERATION_ID_AMBIGUOUS";
    throw error;
  }
  if (existing?.length === 1) {
    assertCompatible(existing[0], event);
    return existing[0];
  }
  return null;
}
function buildAuditEvent(input) {
  const event = {
    event_type: clean(input.eventType),
    principal_class: clean(input.principalClass),
    actor_user_id: clean(input.actorUserId),
    actor_primary_role: clean(input.actorPrimaryRole),
    effective_technician_user_id: clean(input.effectiveTechnicianUserId),
    organization_id: clean(input.organizationId),
    branch_id: clean(input.branchId),
    resource_type: clean(input.resourceType),
    resource_id: clean(input.resourceId),
    command_policy_id: clean(input.commandPolicyId),
    correlation_id: clean(input.correlationId),
    external_correlation_id: clean(input.externalCorrelationId || input.correlationId),
    audit_operation_id: clean(input.auditOperationId),
    operation_key: clean(input.operationKey),
    operation_semantics: cleanObject(input.operationSemantics),
    outcome: clean(input.outcome) || "COMMITTED",
    prior_state: cleanObject(input.priorState),
    new_state: cleanObject(input.newState),
    custody_snapshot: cleanObject(input.custodySnapshot),
    metadata: cleanObject(input.metadata),
    occurred_at: input.occurredAt || (/* @__PURE__ */ new Date()).toISOString()
  };
  for (const field of ["event_type", "principal_class", "organization_id", "resource_type", "resource_id", "command_policy_id", "correlation_id", "audit_operation_id"]) {
    if (!event[field]) throw new Error(`AUDIT_EVENT_FIELD_REQUIRED:${field}`);
  }
  return event;
}
var AUDIT_LEASE_MS = 6e4;
var AUDIT_WAIT_MS = 8e3;
var AUDIT_RETRY_MS = 55;
var auditWait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function auditLockError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
async function lockAuditOrganization(base44, organizationId) {
  const orgs = base44.asServiceRole.entities.Organization;
  if (!orgs?.filter || !orgs?.updateMany) throw auditLockError("AUDIT_LOCK_UNAVAILABLE");
  const token = crypto.randomUUID();
  const until = Date.now() + AUDIT_WAIT_MS;
  while (Date.now() <= until) {
    const now = Date.now();
    const lockData = { audit_lock_token: token, audit_lock_at: new Date(now).toISOString() };
    let claim;
    try {
      claim = await orgs.updateMany({
        id: organizationId,
        $or: [
          { audit_lock_token: { $exists: false } },
          { audit_lock_token: null },
          { audit_lock_token: "" }
        ]
      }, { $set: lockData });
    } catch (error) {
      const org2 = (await orgs.filter({ id: organizationId }, "-created_date", 1))?.[0];
      if (org2?.audit_lock_token === token) return { token, orgs };
      throw auditLockError("AUDIT_LOCK_WRITE_UNCERTAIN");
    }
    if (claim?.updated === 1) return { token, orgs };
    const org = (await orgs.filter({ id: organizationId }, "-created_date", 1))?.[0];
    if (!org) throw auditLockError("AUDIT_ORGANIZATION_NOT_FOUND");
    if (org.audit_lock_token === token) return { token, orgs };
    const lockedAt = Date.parse(org.audit_lock_at || "");
    if (org.audit_lock_token && Number.isFinite(lockedAt) && now - lockedAt > AUDIT_LEASE_MS) {
      const recovered = await orgs.updateMany({
        id: organizationId,
        audit_lock_token: org.audit_lock_token,
        audit_lock_at: org.audit_lock_at
      }, { $set: lockData });
      if (recovered?.updated === 1) return { token, orgs };
    }
    if (Date.now() >= until) break;
    await auditWait(Math.min(AUDIT_RETRY_MS, until - Date.now()));
  }
  throw auditLockError("AUDIT_LOCK_TIMEOUT");
}
async function appendAuditEvent(base44, input) {
  const event = buildAuditEvent(input);
  const lock = await lockAuditOrganization(base44, event.organization_id);
  try {
    const existing = await findExisting(base44, event);
    if (existing) return { event: existing, duplicate: true };
    try {
      const created = await base44.asServiceRole.entities.AuditEvent.create(event);
      return { event: created, duplicate: false };
    } catch (error) {
      const reconciled = await findExisting(base44, event);
      if (reconciled) return { event: reconciled, duplicate: true, reconciled: true };
      throw error;
    }
  } finally {
    try {
      const released = await lock.orgs.updateMany({
        id: event.organization_id,
        audit_lock_token: lock.token
      }, { $unset: { audit_lock_token: "", audit_lock_at: "" } });
      if (released?.updated !== 1) {
        console.warn("[auditEvent] Audit lock owner changed during operation");
      }
    } catch (error) {
      console.error("[auditEvent] Audit lock release uncertain", error?.message);
    }
  }
}

// base44/functions/_shared/inventoryMutationService.ts
var INVENTORY_MOVEMENT_TYPES = Object.freeze([
  "INITIAL_BALANCE",
  "RESERVE",
  "RELEASE",
  "CONSUME",
  "RETURN",
  "SALE",
  "ADJUST_IN",
  "ADJUST_OUT",
  "REVERSAL"
]);
var RESERVATION_TRANSITIONS = Object.freeze({
  RELEASE: { from: "RESERVED", to: "RELEASED", timestamp: "released_at", key: "release_operation_key" },
  CONSUME: { from: "RESERVED", to: "CONSUMED", timestamp: "consumed_at", key: "consume_operation_key" },
  RETURN: { from: "CONSUMED", to: "RETURNED", timestamp: "returned_at", key: "return_operation_key" }
});
var InventoryCommandError = class extends Error {
  constructor(message, code = "INVENTORY_COMMAND_FAILED", status = 409, details = {}) {
    super(message);
    this.name = "InventoryCommandError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
};
function finitePositive(value, label = "quantity") {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InventoryCommandError(`${label} debe ser mayor a cero`, "INVENTORY_QUANTITY_INVALID", 422);
  }
  return parsed;
}
function finiteNonNegative(value, label) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new InventoryCommandError(`${label} no es valido`, "INVENTORY_PROJECTION_INVALID", 409);
  }
  return parsed;
}
function stable2(value) {
  if (Array.isArray(value)) return value.map(stable2);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable2(value[key])]));
}
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function commandFingerprint(input, movements) {
  return sha256(JSON.stringify(stable2({
    organization_id: input.organizationId,
    branch_id: input.branchId,
    operation_key: input.operationKey,
    reference_type: input.referenceType || null,
    reference_id: input.referenceId || null,
    reason: input.reason || null,
    movements: movements.map((item) => ({
      inventory_id: item.inventoryId,
      movement_type: item.movementType,
      quantity: item.quantity,
      reservation_id: item.reservationId || null,
      work_order_id: item.workOrderId || null,
      quote_id: item.quoteId || null,
      available_delta: item.availableDelta ?? null,
      reserved_delta: item.reservedDelta ?? null,
      reversal_of: item.reversalOf || null
    }))
  })));
}
function normalizeMovements(rawMovements) {
  if (!Array.isArray(rawMovements) || rawMovements.length === 0) {
    throw new InventoryCommandError("Se requiere al menos un movimiento", "INVENTORY_MOVEMENTS_REQUIRED", 400);
  }
  const normalized = rawMovements.map((raw) => {
    const movementType = String(raw.movementType || "").trim().toUpperCase();
    if (!INVENTORY_MOVEMENT_TYPES.includes(movementType)) {
      throw new InventoryCommandError(`Movimiento no soportado: ${movementType}`, "INVENTORY_MOVEMENT_INVALID", 422);
    }
    const inventoryId = String(raw.inventoryId || "").trim();
    if (!inventoryId) throw new InventoryCommandError("inventoryId es requerido", "INVENTORY_ID_REQUIRED", 400);
    return {
      inventoryId,
      movementType,
      quantity: finitePositive(raw.quantity),
      reservationId: raw.reservationId || null,
      workOrderId: raw.workOrderId || null,
      quoteId: raw.quoteId || null,
      availableDelta: raw.availableDelta == null ? null : Number(raw.availableDelta),
      reservedDelta: raw.reservedDelta == null ? null : Number(raw.reservedDelta),
      reversalOf: raw.reversalOf || null
    };
  }).sort((left, right) => {
    const inventoryOrder = left.inventoryId.localeCompare(right.inventoryId);
    return inventoryOrder || left.movementType.localeCompare(right.movementType) || String(left.reservationId || "").localeCompare(String(right.reservationId || ""));
  });
  const duplicateInventory = normalized.find((item, index) => index > 0 && normalized[index - 1].inventoryId === item.inventoryId);
  if (duplicateInventory) {
    throw new InventoryCommandError(
      `Una operacion multi-item solo puede mutar una vez el inventario ${duplicateInventory.inventoryId}`,
      "INVENTORY_DUPLICATE_RESOURCE",
      422
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
function createBase44InventoryLockAdapter(base44) {
  const invoke = async (payload) => {
    const result = unwrap(await base44.functions.invoke("resourceLockLite", payload));
    if (result?.success === true) return result;
    const code = result?.code === "LOCK_FINGERPRINT_CONFLICT" ? "INVENTORY_IDEMPOTENCY_CONFLICT" : result?.code || "INVENTORY_LOCK_FAILED";
    throw new InventoryCommandError(result?.message || "No fue posible adquirir el lock de inventario", code, code === "LOCK_ACQUIRE_TIMEOUT" ? 423 : 409, {
      retryable: result?.retryable ?? true
    });
  };
  return {
    async acquire({ organizationId, operationKey, fingerprint: fingerprint2, resources }) {
      const result = await invoke({
        action: "acquireMany",
        operation: "inventory-command",
        correlation_id: await correlationUuid(operationKey),
        request_fingerprint: fingerprint2,
        resources: resources.map((id) => `inventory:${id}`).sort(),
        timeout_ms: 1e4
      });
      return result.lease;
    },
    async assertOwned({ operationKey, lease }) {
      await invoke({
        action: "assertOwned",
        operation: "inventory-command",
        correlation_id: await correlationUuid(operationKey),
        lease
      });
      return true;
    },
    async release({ operationKey, lease }) {
      await invoke({
        action: "releaseMany",
        operation: "inventory-command",
        correlation_id: await correlationUuid(operationKey),
        lease
      });
      return true;
    }
  };
}
async function findOne(entity, query) {
  const records = await entity.filter(query, "-created_date", 2);
  if ((records || []).length > 1) {
    throw new InventoryCommandError("Se encontraron registros duplicados", "INVENTORY_DUPLICATE_STATE", 409, { query });
  }
  return records?.[0] || null;
}
function calculateProjection(inventory, movement) {
  const availableBefore = finiteNonNegative(inventory.cantidad_disponible, "AVAILABLE");
  const reservedBefore = finiteNonNegative(inventory.cantidad_reservada, "RESERVED");
  const quantity = movement.quantity;
  let availableDelta = 0;
  let reservedDelta = 0;
  switch (movement.movementType) {
    case "INITIAL_BALANCE":
      if (availableBefore !== 0 || reservedBefore !== 0) {
        throw new InventoryCommandError("INITIAL_BALANCE solo se permite sobre inventario en cero", "INVENTORY_INITIAL_BALANCE_CONFLICT", 409);
      }
      availableDelta = quantity;
      break;
    case "ADJUST_IN":
    case "RETURN":
      availableDelta = quantity;
      break;
    case "ADJUST_OUT":
    case "SALE":
      availableDelta = -quantity;
      break;
    case "RESERVE":
      availableDelta = -quantity;
      reservedDelta = quantity;
      break;
    case "RELEASE":
      availableDelta = quantity;
      reservedDelta = -quantity;
      break;
    case "CONSUME":
      reservedDelta = -quantity;
      break;
    case "REVERSAL":
      if (!Number.isFinite(movement.availableDelta) || !Number.isFinite(movement.reservedDelta)) {
        throw new InventoryCommandError("La reversion requiere deltas explicitos", "INVENTORY_REVERSAL_INVALID", 422);
      }
      availableDelta = movement.availableDelta;
      reservedDelta = movement.reservedDelta;
      break;
    default:
      throw new InventoryCommandError("Movimiento no soportado", "INVENTORY_MOVEMENT_INVALID", 422);
  }
  const availableAfter = availableBefore + availableDelta;
  const reservedAfter = reservedBefore + reservedDelta;
  if (availableAfter < 0) {
    throw new InventoryCommandError(
      `Stock disponible insuficiente. Disponible: ${availableBefore}, solicitado: ${quantity}`,
      "INVENTORY_INSUFFICIENT_AVAILABLE",
      409,
      { available: availableBefore, requested: quantity }
    );
  }
  if (reservedAfter < 0) {
    throw new InventoryCommandError(
      `Reserva insuficiente. Reservado: ${reservedBefore}, solicitado: ${quantity}`,
      "INVENTORY_INSUFFICIENT_RESERVED",
      409,
      { reserved: reservedBefore, requested: quantity }
    );
  }
  return {
    availableBefore,
    reservedBefore,
    availableAfter,
    reservedAfter,
    availableDelta,
    reservedDelta,
    onHandDelta: availableDelta + reservedDelta
  };
}
async function loadReservation(entities, input, movement) {
  if (movement.movementType === "RESERVE") {
    if (!movement.workOrderId) {
      throw new InventoryCommandError("RESERVE requiere workOrderId", "INVENTORY_WORK_ORDER_REQUIRED", 422);
    }
    let reservation2 = await findOne(entities.InventarioReserva, {
      organization_id: input.organizationId,
      reserve_operation_key: input.operationKey,
      inventario_id: movement.inventoryId
    });
    if (reservation2?.state === "RELEASED" && reservation2.failure_compensated === true) {
      const reopened = await entities.InventarioReserva.updateMany({
        id: reservation2.id,
        organization_id: input.organizationId,
        state: "RELEASED",
        reserve_operation_key: input.operationKey,
        failure_compensated: true
      }, { $set: { state: "PENDING", failure_compensated: false } });
      if (reopened?.updated !== 1) {
        throw new InventoryCommandError("La reserva compensada cambio antes del reintento", "INVENTORY_RESERVATION_CONCURRENT_UPDATE", 409);
      }
      reservation2 = await findOne(entities.InventarioReserva, { id: reservation2.id, organization_id: input.organizationId });
    }
    if (reservation2) return { reservation: reservation2, created: false, previousState: reservation2.state };
    const data = {
      organization_id: input.organizationId,
      branch_id: input.branchId,
      work_order_id: movement.workOrderId,
      inventory_id: movement.inventoryId,
      inventario_id: movement.inventoryId,
      quote_id: movement.quoteId || null,
      quantity: movement.quantity,
      state: "PENDING",
      reserve_operation_key: input.operationKey,
      created_by: input.actorId,
      reserved_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    try {
      reservation2 = await entities.InventarioReserva.create(data);
    } catch (error) {
      reservation2 = await findOne(entities.InventarioReserva, {
        organization_id: input.organizationId,
        reserve_operation_key: input.operationKey,
        inventario_id: movement.inventoryId
      });
      if (!reservation2) throw error;
    }
    return { reservation: reservation2, created: true, previousState: null };
  }
  const transition = RESERVATION_TRANSITIONS[movement.movementType];
  if (!transition) return { reservation: null, created: false, previousState: null };
  const query = movement.reservationId ? { id: movement.reservationId, organization_id: input.organizationId } : {
    organization_id: input.organizationId,
    branch_id: input.branchId,
    work_order_id: movement.workOrderId,
    inventario_id: movement.inventoryId,
    state: transition.from
  };
  const reservation = await findOne(entities.InventarioReserva, query);
  if (!reservation) {
    throw new InventoryCommandError("Reserva de inventario no encontrada", "INVENTORY_RESERVATION_NOT_FOUND", 404);
  }
  if (reservation.branch_id !== input.branchId || reservation.inventory_id !== movement.inventoryId && reservation.inventario_id !== movement.inventoryId) {
    throw new InventoryCommandError("La reserva no pertenece al inventario o sucursal autorizada", "INVENTORY_RESERVATION_SCOPE_MISMATCH", 403);
  }
  if (Number(reservation.quantity) !== movement.quantity) {
    throw new InventoryCommandError("La cantidad no coincide con la reserva", "INVENTORY_RESERVATION_QUANTITY_MISMATCH", 409);
  }
  if (reservation.state === transition.to && reservation[transition.key] === input.operationKey) {
    return { reservation, created: false, previousState: transition.from, alreadyCommitted: true };
  }
  if (reservation.state !== transition.from) {
    throw new InventoryCommandError(`La reserva esta en estado ${reservation.state}`, "INVENTORY_RESERVATION_STATE_CONFLICT", 409);
  }
  return { reservation, created: false, previousState: reservation.state };
}
async function commitReservation(entities, input, movement, reservationContext) {
  const reservation = reservationContext.reservation;
  if (!reservation) return null;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const transition = movement.movementType === "RESERVE" ? { from: "PENDING", to: "RESERVED", timestamp: "reserved_at", key: "reserve_operation_key" } : RESERVATION_TRANSITIONS[movement.movementType];
  if (reservation.state === transition.to && reservation[transition.key] === input.operationKey) return reservation;
  let result;
  try {
    result = await entities.InventarioReserva.updateMany({
      id: reservation.id,
      organization_id: input.organizationId,
      state: transition.from
    }, { $set: {
      state: transition.to,
      [transition.key]: input.operationKey,
      [transition.timestamp]: now,
      last_operation_key: input.operationKey
    } });
  } catch (error) {
    const reconciled = await findOne(entities.InventarioReserva, { id: reservation.id, organization_id: input.organizationId });
    if (reconciled?.state === transition.to && reconciled?.[transition.key] === input.operationKey) return reconciled;
    throw error;
  }
  if (result?.updated !== 1) {
    const reconciled = await findOne(entities.InventarioReserva, { id: reservation.id, organization_id: input.organizationId });
    if (reconciled?.state === transition.to && reconciled?.[transition.key] === input.operationKey) return reconciled;
    throw new InventoryCommandError("La reserva cambio durante la operacion", "INVENTORY_RESERVATION_CONCURRENT_UPDATE", 409);
  }
  return findOne(entities.InventarioReserva, { id: reservation.id, organization_id: input.organizationId });
}
async function restoreReservation(entities, input, movement, context) {
  if (!context?.reservation) return;
  if (context.created) {
    await entities.InventarioReserva.updateMany({
      id: context.reservation.id,
      organization_id: input.organizationId
    }, { $set: { state: "RELEASED", released_at: (/* @__PURE__ */ new Date()).toISOString(), failure_compensated: true } });
    return;
  }
  if (!context.previousState) return;
  await entities.InventarioReserva.updateMany({
    id: context.reservation.id,
    organization_id: input.organizationId
  }, { $set: { state: context.previousState, failure_compensated: true } });
}
function ledgerData(input, movement, projection, fingerprint2, movementKey, reservationId) {
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
    fingerprint: fingerprint2,
    reversal_of: movement.reversalOf || null,
    modificado_por: input.actorId,
    actor_user_id: input.actorId,
    effective_at: (/* @__PURE__ */ new Date()).toISOString(),
    motivo: input.reason || movement.movementType,
    campo: "cantidad_disponible",
    valor_anterior: String(projection.availableBefore),
    valor_nuevo: String(projection.availableAfter)
  };
}
async function createLedger(entities, data) {
  try {
    return await entities.InventarioHistorial.create(data);
  } catch (error) {
    const existing = await findOne(entities.InventarioHistorial, {
      organization_id: data.organization_id,
      movement_key: data.movement_key
    });
    if (existing?.fingerprint === data.fingerprint) return existing;
    if (existing) {
      throw new InventoryCommandError("El movement_key ya existe con otro fingerprint", "INVENTORY_IDEMPOTENCY_CONFLICT", 409);
    }
    throw error;
  }
}
async function loadInventory(entities, input, movement) {
  const inventory = await findOne(entities.Inventario, {
    id: movement.inventoryId,
    organization_id: input.organizationId
  });
  if (!inventory) throw new InventoryCommandError("Producto de inventario no encontrado", "INVENTORY_NOT_FOUND", 404);
  if (!inventory.branch_id || inventory.branch_id !== input.branchId) {
    throw new InventoryCommandError("El producto pertenece a otra sucursal", "INVENTORY_CROSS_BRANCH_DENIED", 403);
  }
  return inventory;
}
async function applyMovement(entities, input, movement, fingerprint2) {
  const baseMovementKey = `${input.operationKey}:${movement.index}`;
  const priorAttempts = await entities.InventarioHistorial.filter({
    organization_id: input.organizationId,
    operation_key: input.operationKey,
    inventario_id: movement.inventoryId
  }, "effective_at", 500);
  const matchingAttempts = (priorAttempts || []).filter((row) => row.movement_key === baseMovementKey || String(row.movement_key || "").startsWith(`${baseMovementKey}:retry:`));
  const movementKey = matchingAttempts.length === 0 ? baseMovementKey : `${baseMovementKey}:retry:${matchingAttempts.length}`;
  const inventory = await loadInventory(entities, input, movement);
  const reservationContext = await loadReservation(entities, input, movement);
  const projection = calculateProjection(inventory, movement);
  const movementDate = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
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
      movementKey
    });
  } catch (error) {
    const reconciled = await loadInventory(entities, input, movement);
    if (reconciled.last_inventory_operation_key === input.operationKey && reconciled.last_inventory_movement_key === movementKey && Number(reconciled.cantidad_disponible) === projection.availableAfter && Number(reconciled.cantidad_reservada || 0) === projection.reservedAfter) {
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
    throw new InventoryCommandError("El inventario cambio durante la operacion", "INVENTORY_CONCURRENT_UPDATE", 409, { retryable: true });
  }
  let ledger;
  try {
    ledger = await createLedger(entities, ledgerData(
      input,
      movement,
      projection,
      fingerprint2,
      movementKey,
      reservationContext.reservation?.id
    ));
  } catch (ledgerError) {
    const rollback2 = await rollbackInventoryProjectionCas(entities.Inventario, {
      inventoryId: movement.inventoryId,
      organizationId: input.organizationId,
      branchId: input.branchId,
      expectedAvailable: projection.availableAfter,
      expectedReserved: projection.reservedAfter,
      previousAvailable: projection.availableBefore,
      previousReserved: projection.reservedBefore,
      previousMovementDate: inventory.fecha_ultimo_movimiento || null,
      operationKey: input.operationKey,
      movementKey
    });
    await restoreReservation(entities, input, movement, reservationContext).catch(() => null);
    if (rollback2?.updated !== 1) {
      throw new InventoryCommandError(
        "Fallo el ledger y no fue posible confirmar la compensacion",
        "INVENTORY_COMPENSATION_INCOMPLETE",
        500,
        { cause: ledgerError.message, inventory_id: movement.inventoryId }
      );
    }
    throw new InventoryCommandError("Fallo el ledger; la proyeccion fue revertida", "INVENTORY_LEDGER_WRITE_FAILED", 500, {
      cause: ledgerError.message
    });
  }
  let reservation = reservationContext.reservation;
  try {
    reservation = await commitReservation(entities, input, movement, reservationContext);
  } catch (reservationError) {
    const rollback2 = await rollbackInventoryProjectionCas(entities.Inventario, {
      inventoryId: movement.inventoryId,
      organizationId: input.organizationId,
      branchId: input.branchId,
      expectedAvailable: projection.availableAfter,
      expectedReserved: projection.reservedAfter,
      previousAvailable: projection.availableBefore,
      previousReserved: projection.reservedBefore,
      previousMovementDate: inventory.fecha_ultimo_movimiento || null,
      operationKey: input.operationKey,
      movementKey
    });
    await restoreReservation(entities, input, movement, reservationContext).catch(() => null);
    if (rollback2?.updated === 1) {
      await createLedger(entities, {
        ...ledgerData(input, {
          ...movement,
          movementType: "REVERSAL",
          reversalOf: ledger.id
        }, {
          availableBefore: projection.availableAfter,
          reservedBefore: projection.reservedAfter,
          availableAfter: projection.availableBefore,
          reservedAfter: projection.reservedBefore,
          availableDelta: -projection.availableDelta,
          reservedDelta: -projection.reservedDelta,
          onHandDelta: -projection.onHandDelta
        }, fingerprint2, `${movementKey}:reservation-compensation`, reservation?.id),
        operation_key: `${input.operationKey}:reservation-compensation`
      }).catch(() => null);
    }
    throw new InventoryCommandError("No fue posible confirmar la reserva", "INVENTORY_RESERVATION_COMMIT_FAILED", 500, {
      cause: reservationError.message
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
    reservation_id: reservation?.id || null
  };
}
async function compensateApplied(entities, input, applied, fingerprint2) {
  const errors = [];
  for (const result of [...applied].reverse()) {
    try {
      const current = await findOne(entities.Inventario, {
        id: result.inventory_id,
        organization_id: input.organizationId,
        branch_id: input.branchId
      });
      if (!current) throw new Error("inventory_missing");
      const reversalKey = `${input.operationKey}:automatic-reversal:${result.movement_id}`;
      const reversalMovement = {
        inventoryId: result.inventory_id,
        movementType: "REVERSAL",
        quantity: Math.max(1, Math.abs(result.available_after - result.available_before + (result.reserved_after - result.reserved_before))),
        availableDelta: result.available_before - result.available_after,
        reservedDelta: result.reserved_before - result.reserved_after,
        reversalOf: result.movement_id,
        index: 0
      };
      await applyMovement(entities, {
        ...input,
        operationKey: reversalKey,
        referenceType: "INTERNAL_REVERSAL",
        referenceId: result.movement_id,
        reason: `Compensacion automatica de ${input.operationKey}`
      }, reversalMovement, fingerprint2);
      if (result.reservation_id) {
        const backwards = {
          RESERVE: { from: "RESERVED", to: "RELEASED", key: "reserve_operation_key" },
          CONSUME: { from: "CONSUMED", to: "RESERVED", key: "consume_operation_key" },
          RELEASE: { from: "RELEASED", to: "RESERVED", key: "release_operation_key" },
          RETURN: { from: "RETURNED", to: "CONSUMED", key: "return_operation_key" }
        }[result.movement_type];
        if (backwards) {
          const restored = await entities.InventarioReserva.updateMany({
            id: result.reservation_id,
            organization_id: input.organizationId,
            state: backwards.from,
            [backwards.key]: input.operationKey
          }, { $set: { state: backwards.to, failure_compensated: true } });
          if (restored?.updated !== 1) throw new Error("reservation_compensation_ownership_lost");
        }
      }
    } catch (error) {
      errors.push(`${result.inventory_id}:${error.code || error.message}`);
    }
  }
  return errors;
}
async function replayResult(entities, input, movements, fingerprint2) {
  const rows = await entities.InventarioHistorial.filter({
    organization_id: input.organizationId,
    operation_key: input.operationKey
  }, "effective_at", 500);
  if ((rows || []).some((row) => row.fingerprint !== fingerprint2)) {
    throw new InventoryCommandError("La operation key fue reutilizada con otro payload", "INVENTORY_IDEMPOTENCY_CONFLICT", 409);
  }
  const primary = [];
  const businessReversed = /* @__PURE__ */ new Set();
  for (const movement of movements) {
    const baseMovementKey = `${input.operationKey}:${movement.index}`;
    const candidates = (rows || []).filter((row) => row.movement_key === baseMovementKey || String(row.movement_key || "").startsWith(`${baseMovementKey}:retry:`));
    let committed = null;
    for (const candidate of [...candidates].reverse()) {
      const reversals = await entities.InventarioHistorial.filter({
        organization_id: input.organizationId,
        reversal_of: candidate.id
      }, "-effective_at", 20);
      const automaticallyReversed = (reversals || []).some((row) => {
        const key = String(row.operation_key || "");
        return key.includes(":automatic-reversal:") || key.includes(":reservation-compensation");
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
        organization_id: input.organizationId
      });
      const movement = movements.find((item) => `${input.operationKey}:${item.index}` === row.movement_key);
      if (reservation && movement) {
        await commitReservation(entities, input, movement, {
          reservation,
          created: movement.movementType === "RESERVE",
          previousState: reservation.state
        });
      }
    }
  }
  return {
    success: true,
    operation_key: input.operationKey,
    fingerprint: fingerprint2,
    idempotent: true,
    results: primary.map((row) => ({
      inventory_id: row.inventario_id,
      movement_id: row.id,
      movement_key: row.movement_key,
      movement_type: row.movement_type,
      available_before: row.available_before,
      available_after: row.available_after,
      reserved_before: row.reserved_before,
      reserved_after: row.reserved_after,
      reservation_id: row.reservation_id || null
    }))
  };
}
async function executeInventoryCommand(base44, rawInput, providedLockAdapter = null) {
  const input = {
    ...rawInput,
    organizationId: String(rawInput?.organizationId || "").trim(),
    branchId: String(rawInput?.branchId || "").trim(),
    actorId: String(rawInput?.actorId || "").trim(),
    operationKey: String(rawInput?.operationKey || "").trim()
  };
  if (!input.organizationId || !input.branchId || !input.actorId || !input.operationKey) {
    throw new InventoryCommandError(
      "organizationId, branchId, actorId y operationKey son requeridos",
      "INVENTORY_COMMAND_CONTEXT_REQUIRED",
      400
    );
  }
  const movements = normalizeMovements(input.movements);
  const isRecoveryOnly = movements.every((movement) => movement.type === "REVERSAL");
  if (!isRecoveryOnly) {
    try {
      await assertActiveBranch(base44, input.organizationId, input.branchId, {
        code: "INVENTORY_BRANCH_INACTIVE",
        status: 409,
        message: "La sucursal esta inactiva y no admite mutaciones ordinarias de inventario."
      });
    } catch (error) {
      if (error instanceof BranchProtectionError) {
        throw new InventoryCommandError(error.message, error.code, error.status, error.details);
      }
      throw error;
    }
  }
  const fingerprint2 = await commandFingerprint(input, movements);
  if (input.fingerprint && input.fingerprint !== fingerprint2) {
    throw new InventoryCommandError("El fingerprint no coincide con el comando", "INVENTORY_FINGERPRINT_MISMATCH", 409);
  }
  const entities = base44.asServiceRole.entities;
  const auditCommitted = async (result) => {
    const movementIds = (result.results || []).map((row) => row.movement_id).filter(Boolean).sort();
    if (movementIds.length !== (result.results || []).length || movementIds.length === 0) {
      throw new InventoryCommandError("La operacion no produjo identidad durable para auditoria", "AUDIT_OPERATION_ID_SOURCE_REQUIRED", 500);
    }
    const auditOperationId = `inventory-command:${await sha256(movementIds)}`;
    const audit = await appendAuditEvent(base44, {
      eventType: "INVENTORY_COMMAND_COMMITTED",
      principalClass: input.principalClass || "HUMAN_MEMBER",
      actorUserId: input.principalClass === "CUSTOMER_TOKEN" ? null : input.actorId,
      actorPrimaryRole: input.actorPrimaryRole || null,
      organizationId: input.organizationId,
      branchId: input.branchId,
      resourceType: "InventarioHistorial",
      resourceId: input.operationKey,
      commandPolicyId: "CP-INV-001",
      correlationId: input.correlationId || input.operationKey,
      auditOperationId,
      operationKey: input.operationKey,
      outcome: result.idempotent ? "IDEMPOTENT_REPLAY" : "COMMITTED",
      newState: { movement_count: result.results?.length || 0 },
      metadata: {
        reference_type: input.referenceType || null,
        reference_id: input.referenceId || null,
        movements: (result.results || []).map((row) => ({ movement_id: row.movement_id, movement_type: row.movement_type, inventory_id: row.inventory_id, reservation_id: row.reservation_id || null }))
      }
    });
    return { ...result, audit_event_id: audit.event.id };
  };
  const preexisting = await replayResult(entities, input, movements, fingerprint2);
  if (preexisting) return auditCommitted(preexisting);
  const lockAdapter = providedLockAdapter || createBase44InventoryLockAdapter(base44);
  const lease = await lockAdapter.acquire({
    organizationId: input.organizationId,
    operationKey: input.operationKey,
    fingerprint: fingerprint2,
    resources: movements.map((item) => item.inventoryId)
  });
  const applied = [];
  try {
    await lockAdapter.assertOwned({ operationKey: input.operationKey, lease });
    const replay = await replayResult(entities, input, movements, fingerprint2);
    if (replay) return auditCommitted(replay);
    for (const movement of movements) {
      await lockAdapter.assertOwned({ operationKey: input.operationKey, lease });
      const committed = await replayResult(entities, input, [movement], fingerprint2);
      if (committed) applied.push(committed.results[0]);
      else applied.push(await applyMovement(entities, input, movement, fingerprint2));
    }
    return auditCommitted({
      success: true,
      operation_key: input.operationKey,
      fingerprint: fingerprint2,
      idempotent: false,
      results: applied
    });
  } catch (error) {
    if (applied.length > 0) {
      const compensationErrors = await compensateApplied(entities, input, applied, fingerprint2);
      if (compensationErrors.length > 0) {
        throw new InventoryCommandError(
          "La operacion fallo y su compensacion requiere revision",
          "INVENTORY_MULTI_ITEM_COMPENSATION_INCOMPLETE",
          500,
          { cause: error.message, compensation_errors: compensationErrors }
        );
      }
    }
    throw error;
  } finally {
    try {
      await lockAdapter.release({ operationKey: input.operationKey, lease });
    } catch (error) {
      console.error("[inventoryMutationService] lock release failed:", error.message);
    }
  }
}
async function reverseInventoryCommand(base44, input, lockAdapter = null) {
  const entities = base44.asServiceRole.entities;
  const original = await entities.InventarioHistorial.filter({
    organization_id: input.organizationId,
    operation_key: input.operationKey
  }, "effective_at", 500);
  const primary = [];
  for (const row of (original || []).filter((item) => !item.reversal_of && item.movement_type !== "REVERSAL")) {
    const reversals = await entities.InventarioHistorial.filter({
      organization_id: input.organizationId,
      reversal_of: row.id
    }, "-effective_at", 20);
    if (!(reversals || []).length) primary.push(row);
  }
  if (primary.length === 0) {
    const replay = await entities.InventarioHistorial.filter({
      organization_id: input.organizationId,
      operation_key: input.reversalOperationKey
    }, "effective_at", 500);
    if (replay?.length) {
      return {
        success: true,
        operation_key: input.reversalOperationKey,
        idempotent: true,
        results: replay.map((row) => ({
          inventory_id: row.inventario_id,
          movement_id: row.id,
          movement_key: row.movement_key,
          movement_type: row.movement_type,
          available_before: row.available_before,
          available_after: row.available_after,
          reserved_before: row.reserved_before,
          reserved_after: row.reserved_after,
          reservation_id: row.reservation_id || null
        }))
      };
    }
    throw new InventoryCommandError("No se encontraron movimientos para revertir", "INVENTORY_REVERSAL_SOURCE_NOT_FOUND", 404);
  }
  const duplicateInventory = primary.find((row, index) => index > 0 && primary.slice(0, index).some((candidate) => candidate.inventario_id === row.inventario_id));
  if (duplicateInventory) {
    throw new InventoryCommandError("Existen multiples movimientos activos para el mismo inventario", "INVENTORY_DUPLICATE_STATE", 409);
  }
  const result = await executeInventoryCommand(base44, {
    organizationId: input.organizationId,
    branchId: input.branchId,
    actorId: input.actorId,
    operationKey: input.reversalOperationKey,
    referenceType: "INTERNAL_REVERSAL",
    referenceId: input.operationKey,
    reason: input.reason || `Reversion de ${input.operationKey}`,
    movements: primary.map((row) => ({
      inventoryId: row.inventario_id,
      movementType: "REVERSAL",
      quantity: Math.max(1, Math.abs(Number(row.quantity_delta || 0))),
      availableDelta: -Number(row.available_delta || 0),
      reservedDelta: -Number(row.reserved_delta || 0),
      reversalOf: row.id
    }))
  }, lockAdapter);
  for (const row of primary.filter((item) => item.reservation_id)) {
    const backwards = {
      RESERVE: { from: "RESERVED", to: "RELEASED", key: "reserve_operation_key" },
      CONSUME: { from: "CONSUMED", to: "RESERVED", key: "consume_operation_key" },
      RELEASE: { from: "RELEASED", to: "RESERVED", key: "release_operation_key" },
      RETURN: { from: "RETURNED", to: "CONSUMED", key: "return_operation_key" }
    }[row.movement_type];
    if (!backwards) continue;
    const reservation = await findOne(entities.InventarioReserva, {
      id: row.reservation_id,
      organization_id: input.organizationId
    });
    if (reservation?.state === backwards.to && reservation?.last_operation_key === input.reversalOperationKey) continue;
    const restored = await entities.InventarioReserva.updateMany({
      id: row.reservation_id,
      organization_id: input.organizationId,
      state: backwards.from,
      [backwards.key]: input.operationKey
    }, { $set: {
      state: backwards.to,
      last_operation_key: input.reversalOperationKey,
      failure_compensated: true
    } });
    if (restored?.updated !== 1) {
      throw new InventoryCommandError(
        "La proyeccion fue revertida pero el estado de reserva requiere revision",
        "INVENTORY_REVERSAL_RESERVATION_INCOMPLETE",
        500,
        { reservation_id: row.reservation_id }
      );
    }
  }
  return result;
}

// base44/functions/_shared/controlledPilotAuthority.ts
function cleanId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function inspectControlledPilotConfiguration(organization) {
  if (organization?.controlled_pilot_mode !== true) {
    return { enabled: false, valid: true, operatorUserId: null, branchId: null };
  }
  const operatorUserId = cleanId(organization.controlled_pilot_operator_user_id);
  const branchId = cleanId(organization.controlled_pilot_branch_id);
  return {
    enabled: true,
    valid: Boolean(operatorUserId && branchId),
    operatorUserId,
    branchId
  };
}
function evaluateControlledPilotHumanAccess({ organization, user, account, isSuperAdmin = false }) {
  const configuration = inspectControlledPilotConfiguration(organization);
  if (!configuration.enabled) return { ok: true, pilotMode: false };
  if (!configuration.valid) {
    return {
      ok: false,
      status: 503,
      code: "CONTROLLED_PILOT_CONFIGURATION_INVALID",
      error: "La configuracion del piloto controlado es invalida; toda mutacion permanece bloqueada"
    };
  }
  if (isSuperAdmin) {
    return {
      ok: false,
      status: 403,
      code: "CONTROLLED_PILOT_OPERATOR_REQUIRED",
      error: "El superadmin no puede mutar una organizacion en piloto controlado"
    };
  }
  const exactOperator = user?.id === configuration.operatorUserId && account?.user_id === configuration.operatorUserId && account?.organization_id === organization?.id && account?.status === "active" && account?.role === "ORG_ADMIN";
  if (!exactOperator) {
    return {
      ok: false,
      status: 403,
      code: "CONTROLLED_PILOT_OPERATOR_REQUIRED",
      error: "Solo el operador designado puede actuar durante el piloto controlado"
    };
  }
  return {
    ok: true,
    pilotMode: true,
    operatorUserId: configuration.operatorUserId,
    branchId: configuration.branchId
  };
}

// base44/functions/_shared/roleCapabilities.ts
var AUTHORIZATION_PRESET_VERSION = "TRP_MULTIUSER_V1";
var TENANT_ROLES = Object.freeze([
  "ORG_ADMIN",
  "BRANCH_ADMIN",
  "TECHNICIAN",
  "SALES",
  "INVENTORY",
  "CUSTOMER_SERVICE"
]);
var CAPABILITIES = Object.freeze([
  "ORG_ADMINISTRATION",
  "BRANCH_ADMINISTRATION",
  "USER_ADMINISTRATION",
  "RECEPTION_OPERATIONS",
  "CUSTOMER_READ_OPERATIONAL",
  "CUSTOMER_SERVICE_OPERATIONS",
  "TECHNICAL_WORK",
  "TECHNICAL_SUPERVISION",
  "TECHNICAL_ASSIGNMENT",
  "QUOTE_OPERATIONS",
  "SALE_OPERATIONS",
  "COMMERCIAL_READ",
  "FINANCIAL_READ",
  "INVENTORY_READ",
  "INVENTORY_OPERATIONS",
  "INVENTORY_ADMINISTRATION",
  "DELIVERY_OPERATIONS",
  "CRM_OPERATIONS",
  "AGENDA_OPERATIONS"
]);
var ROLE_CAPABILITY_PRESETS = Object.freeze({
  ORG_ADMIN: CAPABILITIES,
  BRANCH_ADMIN: [
    "BRANCH_ADMINISTRATION",
    "RECEPTION_OPERATIONS",
    "CUSTOMER_READ_OPERATIONAL",
    "CUSTOMER_SERVICE_OPERATIONS",
    "TECHNICAL_WORK",
    "TECHNICAL_SUPERVISION",
    "TECHNICAL_ASSIGNMENT",
    "QUOTE_OPERATIONS",
    "SALE_OPERATIONS",
    "COMMERCIAL_READ",
    "FINANCIAL_READ",
    "INVENTORY_READ",
    "INVENTORY_OPERATIONS",
    "INVENTORY_ADMINISTRATION",
    "DELIVERY_OPERATIONS",
    "CRM_OPERATIONS",
    "AGENDA_OPERATIONS"
  ],
  TECHNICIAN: [
    "CUSTOMER_READ_OPERATIONAL",
    "TECHNICAL_WORK",
    "COMMERCIAL_READ",
    "INVENTORY_READ",
    "INVENTORY_OPERATIONS"
  ],
  SALES: [
    "RECEPTION_OPERATIONS",
    "CUSTOMER_READ_OPERATIONAL",
    "CUSTOMER_SERVICE_OPERATIONS",
    "TECHNICAL_ASSIGNMENT",
    "QUOTE_OPERATIONS",
    "SALE_OPERATIONS",
    "COMMERCIAL_READ",
    "INVENTORY_READ",
    "DELIVERY_OPERATIONS",
    "CRM_OPERATIONS",
    "AGENDA_OPERATIONS"
  ],
  INVENTORY: [
    "CUSTOMER_READ_OPERATIONAL",
    "COMMERCIAL_READ",
    "INVENTORY_READ",
    "INVENTORY_OPERATIONS",
    "INVENTORY_ADMINISTRATION"
  ],
  CUSTOMER_SERVICE: [
    "RECEPTION_OPERATIONS",
    "CUSTOMER_READ_OPERATIONAL",
    "CUSTOMER_SERVICE_OPERATIONS",
    "COMMERCIAL_READ",
    "DELIVERY_OPERATIONS",
    "AGENDA_OPERATIONS"
  ]
});
function normalizeTenantRole(role) {
  if (role === "SUPPORT") return "CUSTOMER_SERVICE";
  return TENANT_ROLES.includes(role) ? role : null;
}
function getRoleCapabilities(role) {
  const normalizedRole = normalizeTenantRole(role);
  return normalizedRole ? [...ROLE_CAPABILITY_PRESETS[normalizedRole] || []] : [];
}
function getRoleScope(role) {
  const normalizedRole = normalizeTenantRole(role);
  if (!normalizedRole) return null;
  return normalizedRole === "ORG_ADMIN" ? "ORGANIZATION" : "SINGLE_BRANCH";
}

// base44/functions/_shared/userAuthorization.ts
function isCanonicalActiveUserAccount(account) {
  return account?.status === "active";
}
function getUserDataField(user, field) {
  return user?.data?.[field] ?? user?.[field] ?? null;
}
function isCanonicalSuperAdmin(user) {
  return user?.role === "admin";
}
async function loadActiveOrganization(base44, organizationId) {
  if (!organizationId) return null;
  const organizations = await base44.asServiceRole.entities.Organization.filter({
    id: organizationId,
    status: "active"
  }, "-created_date", 2);
  return organizations?.length === 1 ? organizations[0] : null;
}
async function loadActiveBranch(base44, organizationId, branchId) {
  if (!organizationId || !branchId) return null;
  const branches = await base44.asServiceRole.entities.Branch.filter({
    id: branchId,
    organization_id: organizationId,
    active: true
  }, "-created_date", 2);
  return branches?.length === 1 ? branches[0] : null;
}
async function loadCanonicalMemberships(base44, user) {
  const [byUserId, byEmail] = await Promise.all([
    base44.asServiceRole.entities.UserAccount.filter({ user_id: user.id }, "-created_date", 100),
    user.email ? base44.asServiceRole.entities.UserAccount.filter({ user_email: user.email }, "-created_date", 100) : Promise.resolve([])
  ]);
  const unique = /* @__PURE__ */ new Map();
  for (const account of [...byUserId || [], ...byEmail || []]) {
    if (account?.id) unique.set(account.id, account);
  }
  return [...unique.values()];
}
async function resolveIdentitySnapshot(base44, user) {
  if (!user?.id) return { ok: false, status: 401, error: "No autenticado" };
  const isSuperAdmin = isCanonicalSuperAdmin(user);
  const memberships = isSuperAdmin ? [] : await loadCanonicalMemberships(base44, user);
  const activeMemberships = memberships.filter(
    (account) => account.user_id === user.id && account.organization_id && isCanonicalActiveUserAccount(account)
  );
  const pendingInvitations = memberships.filter(
    (account) => account.user_email === user.email && account.organization_id && account.status === "invited" && (!account.user_id || account.user_id === user.id)
  );
  const persistedOrganizationId = getUserDataField(user, "organization_id");
  const impersonatingOrganizationId = isSuperAdmin ? getUserDataField(user, "impersonating_org_id") : null;
  const activeAccount = isSuperAdmin ? null : activeMemberships.find((account) => account.organization_id === persistedOrganizationId) || (activeMemberships.length === 1 ? activeMemberships[0] : null);
  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name || null,
      platform_role: user.role,
      is_super_admin: isSuperAdmin,
      organization_id: isSuperAdmin ? impersonatingOrganizationId : activeAccount?.organization_id || null,
      impersonating_org_id: impersonatingOrganizationId,
      impersonating_started_at: isSuperAdmin ? getUserDataField(user, "impersonating_started_at") : null
    },
    memberships,
    activeMemberships,
    pendingInvitations,
    activeAccount,
    isSuperAdmin
  };
}
async function resolveAuthorizedContext(base44, user, options = {}) {
  const {
    organizationHint = null,
    allowedRoles = [],
    requireOrganization = true
  } = options;
  const identity = await resolveIdentitySnapshot(base44, user);
  if (!identity.ok) return identity;
  if (identity.isSuperAdmin) {
    const impersonatedOrgId = identity.user.impersonating_org_id;
    if (organizationHint && organizationHint !== impersonatedOrgId) {
      return { ok: false, status: 403, error: "La organizacion solicitada no coincide con la impersonacion autorizada" };
    }
    if (requireOrganization && !impersonatedOrgId) {
      return { ok: false, status: 403, error: "Inicia una impersonacion autorizada antes de continuar" };
    }
    const organization2 = impersonatedOrgId ? await loadActiveOrganization(base44, impersonatedOrgId) : null;
    if (impersonatedOrgId && !organization2) {
      return { ok: false, status: 403, code: "ORGANIZATION_INACTIVE", error: "La organizacion no existe o no esta activa" };
    }
    if (organization2) {
      const pilotAccess2 = evaluateControlledPilotHumanAccess({ organization: organization2, user, account: null, isSuperAdmin: true });
      if (!pilotAccess2.ok) return pilotAccess2;
    }
    return {
      ok: true,
      organizationId: impersonatedOrgId || null,
      role: impersonatedOrgId ? "ORG_ADMIN" : "SUPER_ADMIN",
      persistedRole: "SUPER_ADMIN",
      normalizedRole: impersonatedOrgId ? "ORG_ADMIN" : null,
      capabilities: impersonatedOrgId ? getRoleCapabilities("ORG_ADMIN") : [],
      scope: impersonatedOrgId ? "ORGANIZATION" : "PLATFORM",
      branchId: null,
      principalClass: impersonatedOrgId ? "HUMAN_MEMBER" : "PLATFORM_ADMIN",
      presetVersion: AUTHORIZATION_PRESET_VERSION,
      organization: organization2,
      branch: null,
      account: null,
      isSuperAdmin: true,
      isImpersonating: Boolean(impersonatedOrgId),
      identity
    };
  }
  const activeAccounts = identity.activeMemberships;
  const persistedOrgId = identity.user.organization_id;
  const requestedOrgId = organizationHint || persistedOrgId || null;
  const matchingAccounts = requestedOrgId ? activeAccounts.filter((candidate) => candidate.organization_id === requestedOrgId) : [];
  if (matchingAccounts.length > 1) {
    return {
      ok: false,
      status: 409,
      code: "MEMBERSHIP_AMBIGUOUS",
      error: "Existen multiples membresias activas para la organizacion"
    };
  }
  const account = requestedOrgId ? matchingAccounts[0] || null : activeAccounts.length === 1 ? activeAccounts[0] : null;
  if (!account) {
    const error = activeAccounts.length > 1 ? "Selecciona una organizacion valida antes de continuar" : "No existe una membresia activa para esta organizacion";
    return { ok: false, status: 403, error };
  }
  const normalizedRole = normalizeTenantRole(account.role);
  if (!normalizedRole) {
    return { ok: false, status: 403, code: "ROLE_UNKNOWN", error: "La membresia tiene un rol no autorizado" };
  }
  const normalizedAllowedRoles = allowedRoles.map(normalizeTenantRole).filter(Boolean);
  if (normalizedAllowedRoles.length > 0 && !normalizedAllowedRoles.includes(normalizedRole)) {
    return { ok: false, status: 403, error: "Tu rol no permite realizar esta accion" };
  }
  const organization = await loadActiveOrganization(base44, account.organization_id);
  if (!organization) {
    return { ok: false, status: 403, code: "ORGANIZATION_INACTIVE", error: "La organizacion no existe o no esta activa" };
  }
  const pilotAccess = evaluateControlledPilotHumanAccess({ organization, user, account, isSuperAdmin: false });
  if (!pilotAccess.ok) return pilotAccess;
  const scope = getRoleScope(normalizedRole);
  const effectiveBranchId = pilotAccess.pilotMode ? pilotAccess.branchId : account.branch_id;
  const branch = scope === "SINGLE_BRANCH" || pilotAccess.pilotMode ? await loadActiveBranch(base44, account.organization_id, effectiveBranchId) : null;
  if ((scope === "SINGLE_BRANCH" || pilotAccess.pilotMode) && !branch) {
    return { ok: false, status: 403, code: "BRANCH_INACTIVE", error: "La sucursal canonica no existe o no esta activa" };
  }
  return {
    ok: true,
    organizationId: account.organization_id,
    role: normalizedRole,
    persistedRole: account.role,
    normalizedRole,
    capabilities: getRoleCapabilities(normalizedRole),
    scope,
    branchId: branch?.id || null,
    principalClass: "HUMAN_MEMBER",
    presetVersion: AUTHORIZATION_PRESET_VERSION,
    organization,
    branch,
    account,
    isSuperAdmin: false,
    isImpersonating: false,
    pilotMode: pilotAccess.pilotMode === true,
    pilotOperatorUserId: pilotAccess.operatorUserId || null,
    pilotBranchId: pilotAccess.branchId || null,
    identity
  };
}

// base44/functions/_shared/operationalAuthorization.ts
var ALL_OPERATIONAL_ROLES = [
  "ORG_ADMIN",
  "BRANCH_ADMIN",
  "TECHNICIAN",
  "SALES",
  "INVENTORY",
  "CUSTOMER_SERVICE"
];
var ADMIN_ROLES = ["ORG_ADMIN", "BRANCH_ADMIN"];
var COMMERCIAL_ROLES = ["ORG_ADMIN", "BRANCH_ADMIN", "SALES"];
var CUSTOMER_ROLES = ["ORG_ADMIN", "BRANCH_ADMIN", "SALES", "CUSTOMER_SERVICE"];
var TECHNICAL_ROLES = ["ORG_ADMIN", "BRANCH_ADMIN", "TECHNICIAN"];
var INVENTORY_READ_ROLES = ["ORG_ADMIN", "BRANCH_ADMIN", "TECHNICIAN", "SALES", "INVENTORY"];
var OPERATIONAL_ENTITY_POLICIES = Object.freeze({
  ActividadTecnica: { read: ALL_OPERATIONAL_ROLES, create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ["ORG_ADMIN"], scope: "work_order" },
  BloqueoTecnico: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ADMIN_ROLES, scope: "work_order" },
  Branch: { read: ALL_OPERATIONAL_ROLES, create: [], update: [], delete: [], scope: "branch" },
  CategoriaInventario: { read: INVENTORY_READ_ROLES, create: [], update: [], delete: [], scope: "organization" },
  Cita: { read: ALL_OPERATIONAL_ROLES, create: ["ORG_ADMIN", "BRANCH_ADMIN", "TECHNICIAN", "SALES"], update: ["ORG_ADMIN", "BRANCH_ADMIN", "TECHNICIAN", "SALES"], delete: ADMIN_ROLES, scope: "branch" },
  Cliente: { read: CUSTOMER_ROLES, create: CUSTOMER_ROLES, update: CUSTOMER_ROLES, delete: ["ORG_ADMIN"], scope: "customer" },
  ComprobanteVentaLog: { read: COMMERCIAL_ROLES, create: COMMERCIAL_ROLES, update: [], delete: [], scope: "sale" },
  Cotizacion: { read: [...COMMERCIAL_ROLES, "TECHNICIAN", "CUSTOMER_SERVICE"], create: COMMERCIAL_ROLES, update: COMMERCIAL_ROLES, delete: ["ORG_ADMIN"], scope: "quote" },
  DiagnosticMasterRecord: { read: [...TECHNICAL_ROLES, "SALES", "CUSTOMER_SERVICE"], create: [], update: [], delete: [], scope: "work_order" },
  Diagnostico: { read: [...TECHNICAL_ROLES, "SALES", "CUSTOMER_SERVICE"], create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ["ORG_ADMIN"], scope: "work_order" },
  DiagnosticoDocumento: { read: [...TECHNICAL_ROLES, "SALES", "CUSTOMER_SERVICE"], create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ["ORG_ADMIN"], scope: "diagnostic_document" },
  DiagnosticoEvidencia: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: [], delete: ["ORG_ADMIN"], scope: "work_order" },
  DiagnosticoResultado: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: [], delete: ["ORG_ADMIN"], scope: "work_order" },
  DiagnosticoTecnico: { read: [...TECHNICAL_ROLES, "SALES", "CUSTOMER_SERVICE"], create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ["ORG_ADMIN"], scope: "work_order" },
  EntregaLog: { read: COMMERCIAL_ROLES, create: [], update: [], delete: [], scope: "work_order" },
  Equipo: { read: [...CUSTOMER_ROLES, "TECHNICIAN"], create: CUSTOMER_ROLES, update: CUSTOMER_ROLES, delete: ["ORG_ADMIN"], scope: "equipment" },
  Expense: { read: ADMIN_ROLES, create: ADMIN_ROLES, update: ADMIN_ROLES, delete: ADMIN_ROLES, scope: "branch" },
  Garantia: { read: [...COMMERCIAL_ROLES, "CUSTOMER_SERVICE"], create: COMMERCIAL_ROLES, update: ADMIN_ROLES, delete: [], scope: "warranty" },
  Inventario: { read: INVENTORY_READ_ROLES, create: [], update: [], delete: [], scope: "branch" },
  InventarioHistorial: { read: ["ORG_ADMIN", "BRANCH_ADMIN", "INVENTORY"], create: [], update: [], delete: [], scope: "inventory_history" },
  InventarioReserva: { read: INVENTORY_READ_ROLES, create: [], update: [], delete: [], scope: "work_order" },
  NoConformidad: { read: TECHNICAL_ROLES, create: ADMIN_ROLES, update: ADMIN_ROLES, delete: ["ORG_ADMIN"], scope: "work_order_optional" },
  NotaInterna: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: [], delete: ADMIN_ROLES, scope: "work_order" },
  Notificacion: { read: ALL_OPERATIONAL_ROLES, create: ALL_OPERATIONAL_ROLES, update: ALL_OPERATIONAL_ROLES, delete: ["ORG_ADMIN"], scope: "notification" },
  OTEvent: { read: ALL_OPERATIONAL_ROLES, create: [], update: [], delete: [], scope: "work_order" },
  OrdenTrabajo: { read: ALL_OPERATIONAL_ROLES, create: [], update: CUSTOMER_ROLES, delete: ["ORG_ADMIN"], scope: "branch" },
  PreDiagnostico: { read: [...TECHNICAL_ROLES, "SALES", "CUSTOMER_SERVICE"], create: [...TECHNICAL_ROLES, "SALES"], update: [...TECHNICAL_ROLES, "SALES"], delete: ["ORG_ADMIN"], scope: "work_order" },
  PruebaTecnica: { read: TECHNICAL_ROLES, create: [], update: [], delete: [], scope: "work_order" },
  PurchaseInvoice: { read: ADMIN_ROLES, create: ADMIN_ROLES, update: ADMIN_ROLES, delete: ["ORG_ADMIN"], scope: "branch" },
  Reciclaje: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ["ORG_ADMIN"], scope: "branch" },
  RegistroTiempo: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ["ORG_ADMIN"], scope: "work_order" },
  Servicio: { read: INVENTORY_READ_ROLES, create: ["ORG_ADMIN"], update: ["ORG_ADMIN"], delete: ["ORG_ADMIN"], scope: "organization" },
  SolicitudTecnica: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ["ORG_ADMIN"], scope: "work_order_optional" },
  Supplier: { read: ADMIN_ROLES, create: ["ORG_ADMIN"], update: ["ORG_ADMIN"], delete: ["ORG_ADMIN"], scope: "organization" },
  SupplierPayment: { read: ADMIN_ROLES, create: ADMIN_ROLES, update: [], delete: ["ORG_ADMIN"], scope: "purchase_invoice" },
  TerminosYCondiciones: { read: ALL_OPERATIONAL_ROLES, create: ["ORG_ADMIN"], update: ["ORG_ADMIN"], delete: ["ORG_ADMIN"], scope: "organization" },
  Venta: { read: [...COMMERCIAL_ROLES, "CUSTOMER_SERVICE"], create: COMMERCIAL_ROLES, update: [], delete: [], scope: "branch" },
  VentaItem: { read: [...COMMERCIAL_ROLES, "CUSTOMER_SERVICE"], create: COMMERCIAL_ROLES, update: [], delete: [], scope: "sale" },
  WorkflowGate: { read: TECHNICAL_ROLES, create: [], update: [], delete: [], scope: "workflow_gate" }
});
var PROTECTED_OPERATIONAL_ENTITIES = Object.freeze(Object.keys(OPERATIONAL_ENTITY_POLICIES));
function isOrganizationWideRole(role) {
  return role === "ORG_ADMIN";
}
function getCanonicalBranchScope(authorization) {
  if (!authorization?.ok) {
    return { ok: false, status: authorization?.status || 403, error: authorization?.error || "No autorizado" };
  }
  if (authorization.pilotMode === true) {
    if (!authorization.pilotBranchId) {
      return { ok: false, status: 503, code: "CONTROLLED_PILOT_CONFIGURATION_INVALID", error: "El piloto no tiene una sucursal canonica valida" };
    }
    return { ok: true, organizationWide: false, branchId: authorization.pilotBranchId };
  }
  if (isOrganizationWideRole(authorization.role)) {
    return { ok: true, organizationWide: true, branchId: null };
  }
  const branchId = authorization.account?.branch_id || null;
  if (!branchId) {
    return {
      ok: false,
      status: 403,
      error: "La membresia operacional no tiene una sucursal canonica asignada",
      code: "OPERATIONAL_BRANCH_REQUIRED"
    };
  }
  return { ok: true, organizationWide: false, branchId };
}
function validateRequestedBranch(branchScope, requestedBranchId) {
  if (!requestedBranchId || branchScope.organizationWide) return { ok: true };
  if (requestedBranchId !== branchScope.branchId) {
    return {
      ok: false,
      status: 403,
      code: "OPERATIONAL_CROSS_BRANCH_DENIED",
      error: "La sucursal solicitada no coincide con la membresia autorizada"
    };
  }
  return { ok: true };
}
var WORK_ORDER_EDITABLE_FIELDS = Object.freeze([
  "motivo_ingreso",
  "observaciones_ingreso",
  "tipo_ingreso",
  "prioridad"
]);

// base44/functions/_shared/commercialIntegrity.ts
var COMMERCIAL_TAX_RATE = 0.13;
var MONEY_TOLERANCE = 0.01;
function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
function finiteNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} no es numerico`);
  return parsed;
}
function calculateCommercialTotals(items, taxRate = COMMERCIAL_TAX_RATE) {
  if (!Array.isArray(items) || items.length === 0) throw new Error("Se requiere al menos una linea comercial");
  let subtotal = 0;
  let discount = 0;
  const canonicalItems = items.map((item, index) => {
    const quantity = finiteNumber(item.cantidad, `Item ${index + 1}: cantidad`);
    const unitPrice = finiteNumber(item.precio_unitario, `Item ${index + 1}: precio_unitario`);
    const discountPercent = finiteNumber(item.descuento_porcentaje || 0, `Item ${index + 1}: descuento`);
    if (quantity <= 0) throw new Error(`Item ${index + 1}: cantidad debe ser mayor a cero`);
    if (unitPrice < 0) throw new Error(`Item ${index + 1}: precio no puede ser negativo`);
    if (discountPercent < 0 || discountPercent > 100) throw new Error(`Item ${index + 1}: descuento fuera de rango`);
    const gross = roundMoney(quantity * unitPrice);
    const lineDiscount = roundMoney(gross * discountPercent / 100);
    const lineSubtotal = roundMoney(gross - lineDiscount);
    subtotal = roundMoney(subtotal + lineSubtotal);
    discount = roundMoney(discount + lineDiscount);
    return {
      ...item,
      cantidad: quantity,
      precio_unitario: roundMoney(unitPrice),
      descuento_porcentaje: roundMoney(discountPercent),
      subtotal: lineSubtotal
    };
  });
  const impuesto = roundMoney(subtotal * taxRate);
  return {
    items: canonicalItems,
    subtotal,
    descuento_total: discount,
    impuesto,
    total: roundMoney(subtotal + impuesto)
  };
}
function moneyMatches(left, right) {
  return Number.isFinite(Number(left)) && Math.abs(roundMoney(left) - roundMoney(right)) <= MONEY_TOLERANCE;
}
function assertPersistedTotalsMatch(source, calculated, label = "documento comercial") {
  for (const field of ["subtotal", "descuento_total", "impuesto", "total"]) {
    if (!moneyMatches(source?.[field] || 0, calculated[field])) {
      const error = new Error(`${label}: ${field} no coincide con sus lineas persistidas`);
      error.code = "COMMERCIAL_PERSISTED_TOTAL_MISMATCH";
      throw error;
    }
  }
}
function assertClientFinancialHints(hints, calculated) {
  for (const field of ["subtotal", "descuento_total", "impuesto", "total"]) {
    if (hints?.[field] == null || hints[field] === "") continue;
    if (!moneyMatches(hints[field], calculated[field])) {
      const error = new Error(`El valor enviado para ${field} no coincide con la autoridad del servidor`);
      error.code = "SALE_AMOUNT_TAMPERING";
      throw error;
    }
  }
}

// base44/functions/_shared/dataProjections.ts
var ALLOWLISTS = Object.freeze({
  WORK_ORDER_LIST_OPERATIONAL: ["id", "codigo_ot", "estado", "estado_atencion", "prioridad", "branch_id", "equipo_id", "cliente_id", "tecnico_asignado_id", "motivo_ingreso"],
  WORK_ORDER_TEAM_AWARENESS: ["id", "codigo_ot", "estado", "estado_atencion", "prioridad", "branch_id", "equipo_id", "tecnico_asignado_id", "motivo_ingreso", "diagnostico_resumido", "ultima_actividad", "ultima_actividad_at"],
  WORK_ORDER_ASSIGNED_TECHNICAL: ["id", "codigo_ot", "organization_id", "branch_id", "cliente_id", "equipo_id", "serie_ingreso", "accesorios_ingreso", "estado_fisico_ingreso", "estado", "prioridad", "tipo_ingreso", "tecnico_asignado_id", "tecnico_revisor_id", "estado_atencion", "ultima_actividad", "ultima_actividad_at", "motivo_pausa", "motivo_ingreso", "observaciones_ingreso", "diagnostico_resumido", "fecha_ingreso", "fecha_revision_inicio", "fecha_diagnostico", "diagnostico_habilitado", "motivo_bloqueo_diagnostico", "qa_cycle_started_at"],
  RECEPTION_CUSTOMER: ["id", "nombre_completo", "identificacion", "tipo_cliente", "telefono", "email", "direccion"],
  RECEPTION_EQUIPMENT: ["id", "cliente_id", "tipo", "marca", "modelo", "serie", "estado_fisico", "accesorios"],
  RECEPTION_WORK_ORDER: ["id", "codigo_ot", "cliente_id", "equipo_id", "estado", "branch_id", "motivo_ingreso", "observaciones_ingreso", "tipo_ingreso", "fecha_ingreso", "terminos_aceptados", "terminos_aceptados_at", "terminos_version"],
  CUSTOMER_SERVICE_WORK_ORDER: ["id", "codigo_ot", "branch_id", "cliente_id", "equipo_id", "estado", "prioridad", "tipo_ingreso", "fecha_entrega_estimada", "motivo_ingreso", "diagnostico_resumido", "fecha_ingreso", "cliente_aprobado"],
  CUSTOMER_SERVICE_APPOINTMENT: ["id", "branch_id", "cliente_id", "tipo", "fecha", "hora_inicio", "hora_fin", "tecnico_asignado_id", "estado", "motivo", "orden_trabajo_id", "recordatorio_enviado"],
  INVENTORY_READ_CONTEXT: ["id", "branch_id", "codigo_interno", "codigo_barras", "sku", "nombre", "descripcion", "foto_url", "galeria_fotos", "categoria_id", "tipo_item", "marca", "modelo", "cantidad_disponible", "cantidad_reservada", "ubicacion", "precio_venta", "punto_reorden", "estado", "compatibilidades"],
  INVENTORY_ADMIN_ADDITIONAL: ["costo_unitario", "proveedor", "fecha_compra", "documento_compra", "garantia_proveedor_meses", "garantia_proveedor_vence", "numero_serie", "fecha_ultimo_movimiento"],
  CUSTOMER_MESSAGE: ["id", "branch_id", "cliente_id", "orden_trabajo_id", "tipo", "asunto", "contenido", "canal", "enviado", "enviado_at", "created_date"],
  SALE_CUSTOMER_CONTEXT: ["id", "branch_id", "cliente_id", "orden_trabajo_id", "estado", "subtotal", "descuento_total", "impuesto", "total", "saldo_pendiente", "fecha_venta", "created_date"],
  QUOTE_CUSTOMER_CONTEXT: ["id", "branch_id", "cliente_id", "orden_trabajo_id", "estado", "items", "subtotal", "descuento_total", "impuesto", "total", "cliente_decision_status", "saldo_pendiente", "created_date"],
  WORK_ORDER_MUTATION_RESULT: [
    "id",
    "organization_id",
    "branch_id",
    "codigo_ot",
    "estado",
    "estado_atencion",
    "prioridad",
    "cliente_id",
    "equipo_id",
    "tecnico_asignado_id",
    "tecnico_asignado_email",
    "motivo_ingreso",
    "diagnostico_resumido",
    "ultima_actividad",
    "ultima_actividad_at",
    "fecha_ingreso",
    "fecha_revision_inicio",
    "fecha_diagnostico",
    "fecha_cierre",
    "fecha_entrega",
    "cliente_aprobado",
    "cliente_aprobado_at",
    "estado_custodia",
    "fecha_ultimo_contacto",
    "fecha_abandono"
  ],
  DELIVERY_LOG_MUTATION_RESULT: [
    "id",
    "organization_id",
    "branch_id",
    "work_order_id",
    "orden_trabajo_id",
    "status",
    "delivered_at",
    "acceptance",
    "warranty_outcome",
    "warranty_id"
  ],
  WARRANTY_MUTATION_RESULT: [
    "id",
    "organization_id",
    "branch_id",
    "cliente_id",
    "origen_tipo",
    "origen_id",
    "fecha_emision",
    "fecha_inicio",
    "fecha_fin",
    "estado",
    "texto_snapshot"
  ]
});
function pickProjection(source, fields) {
  const output = {};
  for (const field of fields) {
    if (source?.[field] !== void 0) output[field] = source[field];
  }
  return output;
}
var OPERATIONAL_MUTATION_IDENTITY_FIELDS = Object.freeze([
  "id",
  "organization_id",
  "branch_id",
  "created_date",
  "created_at",
  "updated_date",
  "updated_at"
]);
var OPERATIONAL_READ_FIELDS = Object.freeze({
  ActividadTecnica: ["id", "organization_id", "orden_trabajo_id", "tecnico_id", "tecnico_email", "tipo_actividad", "subtipo", "inventario_id", "inventario_cantidad", "inventory_consumption_status", "estado", "started_at", "ended_at", "duracion_minutos", "causa_bloqueo", "resultado", "notas", "soft_deleted", "created_date", "updated_date"],
  BloqueoTecnico: ["id", "organization_id", "orden_trabajo_id", "tecnico_id", "tipo_bloqueo", "descripcion", "estado", "resuelto_at", "resuelto_por", "created_date", "updated_date"],
  Branch: ["id", "organization_id", "name", "address", "phone", "active", "is_primary", "created_date", "updated_date"],
  CategoriaInventario: ["id", "organization_id", "nombre", "permite_stock", "permite_precio", "es_vendible", "activo", "created_date", "updated_date"],
  Cita: ["id", "organization_id", "branch_id", "cliente_id", "tipo", "fecha", "hora_inicio", "hora_fin", "tecnico_asignado_id", "tecnico_asignado_email", "estado", "motivo", "orden_trabajo_id", "notas", "recordatorio_enviado", "enlace_videollamada", "created_date", "updated_date"],
  Cliente: ["id", "organization_id", "branch_id", "nombre_completo", "identificacion", "tipo_cliente", "telefono", "email", "direccion", "notas", "created_date", "updated_date"],
  ComprobanteVentaLog: ["id", "organization_id", "venta_id", "accion", "canal", "formato", "destinatario", "notas", "created_date"],
  Cotizacion: ["id", "organization_id", "branch_id", "cliente_id", "vendedor_id", "vendedor_nombre", "orden_trabajo_id", "diagnostico_tecnico_id", "version", "items", "subtotal", "descuento_total", "impuesto", "total", "estado", "estado_conversion", "venta_id", "convertida_at", "requiere_aprobacion", "aprobada_por", "aprobada_at", "aprobacion_interna_status", "aprobacion_interna_motivo", "enviada_at", "valida_hasta", "notas", "terminos_version_aceptada", "cliente_rechazo_motivo", "created_date", "updated_date"],
  DiagnosticMasterRecord: ["id", "organization_id", "orden_trabajo_id", "dmr_number", "created_at", "document_status", "version", "replaces_dmr_id", "cliente_snapshot", "activo_snapshot", "contexto_recepcion", "legal_snapshot", "diagnostico_snapshot", "pdf_url", "signed_at", "voided_at", "replaced_at", "created_date", "updated_date"],
  Diagnostico: ["id", "organization_id", "orden_trabajo_id", "cliente_id", "equipo_id", "tecnico_id", "tipo_diagnostico", "estado_diagnostico", "conclusion_tecnica", "resumen_cliente", "nivel_riesgo", "propuesta_precio_total", "propuesta_precio_detalle", "completed_at", "created_date", "updated_date"],
  DiagnosticoDocumento: ["id", "diagnostico_id", "organization_id", "version", "formato", "url_documento", "estado", "emitido_at", "snapshot_data", "aprobacion_status", "aprobacion_at", "aprobacion_canal", "anulado_at", "canal_envio", "enviado_at", "metodo_aprobacion", "created_date", "updated_date"],
  DiagnosticoEvidencia: ["id", "diagnostico_id", "organization_id", "tipo", "url", "contenido_texto", "descripcion", "created_date", "updated_date"],
  DiagnosticoResultado: ["id", "diagnostico_id", "organization_id", "categoria", "descripcion_item", "resultado", "observaciones", "created_date", "updated_date"],
  DiagnosticoTecnico: ["id", "organization_id", "orden_trabajo_id", "tecnico_id", "estado", "tipo_intervencion", "componentes_revisar", "pruebas_realizadas", "hallazgos", "causa_probable", "trabajo_recomendado", "riesgos_no_reparar", "tiempo_estimado_horas", "repuestos_requeridos", "fecha_inicio", "fecha_completado", "bloqueado", "created_date", "updated_date"],
  EntregaLog: ["id", "organization_id", "branch_id", "orden_trabajo_id", "delivered_at", "acceptance", "checkbox_texto_legal", "nota_entrega", "entrega_con_saldo_pendiente", "delivery_status", "delivery_warranty_outcome", "warranty_id", "intervention_type", "created_date"],
  Equipo: ["id", "organization_id", "branch_id", "cliente_id", "tipo", "marca", "modelo", "serie", "estado_fisico", "accesorios", "fotos", "created_date", "updated_date"],
  Expense: ["id", "organization_id", "branch_id", "date", "amount", "category", "frequency", "is_fixed", "description", "payment_method", "created_date", "updated_date"],
  Garantia: ["id", "organization_id", "branch_id", "cliente_id", "origen_tipo", "origen_id", "equipo_id", "fecha_emision", "fecha_inicio", "fecha_fin", "estado", "texto_snapshot", "activated_at", "created_date", "updated_date"],
  Inventario: ["id", ...ALLOWLISTS.INVENTORY_READ_CONTEXT, "created_date", "updated_date"],
  InventarioHistorial: ["id", "organization_id", "branch_id", "inventario_id", "inventory_id", "movement_type", "quantity", "quantity_delta", "available_delta", "reserved_delta", "available_before", "available_after", "reserved_before", "reserved_after", "reference_type", "reference_id", "work_order_id", "quote_id", "reservation_id", "effective_at", "campo", "valor_anterior", "valor_nuevo", "motivo", "sale_id", "created_date"],
  InventarioReserva: ["id", "organization_id", "branch_id", "work_order_id", "inventario_id", "inventory_id", "quote_id", "quantity", "state", "reserved_at", "consumed_at", "released_at", "returned_at", "failure_compensated", "created_date", "updated_date"],
  NoConformidad: ["id", "organization_id", "branch_id", "titulo", "tipo", "descripcion", "orden_trabajo_id", "venta_id", "reportado_por", "severidad", "estado", "causa_raiz", "accion_correctiva", "responsable_accion", "fecha_limite", "fecha_cierre", "verificacion_eficacia", "leccion_aprendida", "created_date", "updated_date"],
  NotaInterna: ["id", "organization_id", "orden_trabajo_id", "autor_id", "autor_nombre", "contenido", "menciones", "tipo", "created_date", "updated_date"],
  Notificacion: ["id", "organization_id", "branch_id", "user_id", "role_target", "tipo", "mensaje", "referencia_ot_id", "accion_sugerida", "estado", "created_date", "updated_date"],
  OTEvent: ["id", "organization_id", "orden_trabajo_id", "tipo", "sale_id", "venta_total", "tipo_concepto", "detalle", "processed", "created_at", "created_date"],
  OrdenTrabajo: [...ALLOWLISTS.WORK_ORDER_ASSIGNED_TECHNICAL, "tracking_code", "responsable_recepcion", "fecha_entrega_estimada", "created_date", "updated_date", "cliente_aprobado", "cliente_aprobado_at", "revision_pagada_at", "revision_venta_id", "estado_custodia", "fecha_inicio_custodia", "fecha_ultimo_contacto", "fecha_abandono", "abandono_observaciones"],
  PreDiagnostico: ["id", "organization_id", "orden_trabajo_id", "estado", "respuestas", "completado_at", "created_date", "updated_date"],
  PruebaTecnica: ["id", "organization_id", "orden_trabajo_id", "tecnico_id", "technical_activity_segment_id", "qa_cycle_id", "qa_cycle_started_at", "recorded_at", "tipo_prueba", "descripcion", "resultado", "observaciones", "evidencia_urls", "created_date"],
  PurchaseInvoice: ["id", "organization_id", "branch_id", "supplier_id", "invoice_number", "date", "due_date", "total_amount", "paid_amount", "notes", "created_date", "updated_date"],
  Reciclaje: ["id", "organization_id", "branch_id", "tipo_residuo", "descripcion", "peso_kg", "cantidad_unidades", "origen", "orden_trabajo_id", "accion", "destino", "empresa_recicladora", "fecha_proceso", "huella_carbono_evitada_kg", "valor_recuperado", "certificado_url", "notas", "created_date", "updated_date"],
  RegistroTiempo: ["id", "organization_id", "orden_trabajo_id", "tecnico_id", "actividad", "inicio", "fin", "duracion_minutos", "tipo_actividad", "created_date", "updated_date"],
  Servicio: ["id", "organization_id", "nombre", "descripcion", "precio", "activo", "categoria", "created_date", "updated_date"],
  SolicitudTecnica: ["id", "organization_id", "branch_id", "orden_trabajo_id", "tecnico_id", "tipo", "descripcion", "cantidad", "estado", "motivo_rechazo", "aprobado_at", "entregado_at", "inventario_id", "fulfillment_mode", "requested_at", "rejected_at", "fulfilled_at", "fulfillment_status", "fulfillment_error", "created_date", "updated_date"],
  Supplier: ["id", "organization_id", "name", "contact_name", "phone", "email", "address", "tax_id", "payment_terms_days", "active", "created_date", "updated_date"],
  SupplierPayment: ["id", "organization_id", "branch_id", "purchase_invoice_id", "amount", "date", "method", "reference", "notes", "created_date"],
  TerminosYCondiciones: ["id", "organization_id", "version", "texto", "activo", "created_date", "updated_date"],
  Venta: ["id", "organization_id", "branch_id", "cliente_id", "origen_venta", "origen_detalle", "tipo_concepto", "referencia_ot_id", "referencia_diagnostico_id", "cotizacion_id", "cotizacion_total_original", "cotizacion_subtotal_original", "cotizacion_descuento_original", "total", "subtotal", "impuesto", "descuento_total", "metodo_pago", "estado", "notas", "created_date", "updated_date"],
  VentaItem: ["id", "organization_id", "venta_id", "tipo", "referencia_id", "descripcion", "cantidad", "precio_unitario", "subtotal", "created_date"],
  WorkflowGate: ["id", "organization_id", "subject_type", "subject_id", "wait_reason", "provider_key", "status", "resolved_at", "created_date", "updated_date"]
});
function projectSaleMutationResult(sale) {
  const dto = pickProjection(sale, OPERATIONAL_READ_FIELDS.Venta);
  dto.items = Array.isArray(sale?.items) ? sale.items.map((item) => pickProjection(item, OPERATIONAL_READ_FIELDS.VentaItem)) : [];
  return dto;
}

// base44/functions/createSale/entry.ts
var LOCK_TTL_MS = 2 * 60 * 1e3;
var LOCK_WAIT_MS = 10 * 1e3;
var LOCK_BACKOFF_MS = 40;
var wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
var nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
async function ensureSaleAudit(base44, authorization, user, sale, operationKey, idempotent) {
  return appendAuditEvent(base44, {
    eventType: "SALE_PAYMENT_COMMITTED",
    principalClass: authorization.principalClass,
    actorUserId: user.id,
    actorPrimaryRole: authorization.persistedRole,
    organizationId: authorization.organizationId,
    branchId: sale.branch_id,
    resourceType: "Venta",
    resourceId: sale.id,
    commandPolicyId: "CP-SALE-001",
    correlationId: operationKey,
    auditOperationId: `sale:${sale.id}`,
    operationKey,
    outcome: idempotent ? "IDEMPOTENT_REPLAY" : "COMMITTED",
    newState: { estado: sale.estado, total: sale.total, metodo_pago: sale.metodo_pago },
    metadata: { quote_id: sale.cotizacion_id || null, work_order_id: sale.referencia_ot_id || null }
  });
}
var SaleError = class extends Error {
  constructor(message, code, status = 400, options = {}) {
    super(message);
    this.name = "SaleError";
    this.code = code;
    this.status = status;
    this.retryable = options.retryable ?? false;
    this.details = options.details || null;
  }
};
function errorResponse(error) {
  return Response.json({
    success: false,
    error: error.message || "Error interno al procesar la venta",
    code: error.code || "SALE_INTERNAL_ERROR",
    retryable: error.retryable ?? false,
    ...error.details && { details: error.details }
  }, { status: error.status || 500 });
}
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      if (value[key] !== void 0) result[key] = stableValue(value[key]);
      return result;
    }, {});
  }
  return value;
}
async function sha2562(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function fingerprint(value) {
  return sha2562(JSON.stringify(stableValue(value)));
}
function unwrapFunctionResult(result) {
  return result?.data ?? result;
}
async function findOne2(entity, query, sort = "-created_date") {
  const records = await entity.filter(query, sort, 1);
  return records?.[0] || null;
}
function normalizeInput(body) {
  const ventaData = body?.ventaData;
  const rawItems = Array.isArray(body?.itemsCarrito) ? body.itemsCarrito : [];
  if (!ventaData) throw new SaleError("ventaData es requerido", "SALE_DATA_REQUIRED");
  const quoteId = body.cotizacionOrigenId || ventaData.cotizacion_id || null;
  if (body.cotizacionOrigenId && ventaData.cotizacion_id && body.cotizacionOrigenId !== ventaData.cotizacion_id) {
    throw new SaleError("Los IDs de cotizacion enviados no coinciden", "SALE_QUOTE_ID_MISMATCH", 409);
  }
  if (!quoteId && rawItems.length === 0) {
    throw new SaleError("itemsCarrito es requerido y no puede estar vacio", "SALE_ITEMS_REQUIRED");
  }
  if (!ventaData.metodo_pago) throw new SaleError("metodo_pago es requerido", "SALE_PAYMENT_METHOD_REQUIRED");
  if (!ventaData.branch_id) throw new SaleError("branch_id es requerido", "SALE_BRANCH_REQUIRED");
  const itemIntents = rawItems.map((rawItem, index) => {
    const cantidad = Number(rawItem.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new SaleError(`Item ${index + 1}: cantidad invalida`, "SALE_ITEM_QUANTITY_INVALID");
    }
    if (rawItem.costo != null || rawItem.costo_unitario != null || rawItem.costo_unitario_snapshot != null) {
      throw new SaleError("El costo es autoridad exclusiva del servidor", "SALE_SERVER_AUTHORITY_FIELD_FORBIDDEN", 409);
    }
    if (rawItem.referencia_id && rawItem.item_id && rawItem.referencia_id !== rawItem.item_id) {
      throw new SaleError(`Item ${index + 1}: referencias en conflicto`, "SALE_CATALOG_REFERENCE_CONFLICT", 409);
    }
    return {
      tipo: rawItem.tipo,
      referencia_id: rawItem.referencia_id || rawItem.item_id || null,
      descripcion: String(rawItem.descripcion || "").trim(),
      cantidad,
      precio_unitario: rawItem.precio_unitario,
      subtotal: rawItem.subtotal,
      descuento_porcentaje: rawItem.descuento_porcentaje,
      _index: index
    };
  });
  return {
    ventaData: {
      cliente_id: ventaData.cliente_id || null,
      origen_venta: ventaData.origen_venta || "tienda",
      tipo_concepto: ventaData.tipo_concepto || "venta_producto",
      referencia_ot_id: ventaData.referencia_ot_id || null,
      cotizacion_id: quoteId,
      metodo_pago: ventaData.metodo_pago,
      branch_id: ventaData.branch_id
    },
    financialHints: {
      total: ventaData.total,
      subtotal: ventaData.subtotal,
      impuesto: ventaData.impuesto,
      descuento_total: ventaData.descuento_total
    },
    itemIntents,
    items: [],
    cotizacionOrigenId: quoteId,
    ventaPreloadId: body.ventaPreloadId || null,
    clientIdempotencyKey: String(body.idempotency_key || "").trim()
  };
}
function saleItemType(type) {
  return ["producto", "repuesto"].includes(type) ? "producto" : "servicio";
}
function normalizeCatalogReference(item, index) {
  if (item.referencia_id && item.item_id && item.referencia_id !== item.item_id) {
    throw new SaleError(`Item ${index + 1}: referencias en conflicto`, "SALE_CATALOG_REFERENCE_CONFLICT", 409);
  }
  const referenceId = item.referencia_id || item.item_id || null;
  if (!referenceId) {
    throw new SaleError(`Item ${index + 1}: referencia de catalogo requerida`, "SALE_CATALOG_REFERENCE_REQUIRED", 409);
  }
  const { item_id: _legacyItemId, ...normalized } = item;
  return { ...normalized, referencia_id: referenceId };
}
function financialError(error, fallbackCode = "SALE_COMMERCIAL_INTEGRITY_INVALID") {
  if (error instanceof SaleError) return error;
  return new SaleError(error.message, error.code || fallbackCode, 409);
}
function assertIntentLinesMatch(intents, canonicalItems, options = {}) {
  if (!intents.length && options.allowEmpty) return;
  if (intents.length !== canonicalItems.length) {
    throw new SaleError("Los items enviados no coinciden con la fuente comercial autorizada", "SALE_ITEM_TAMPERING", 409);
  }
  for (let index = 0; index < canonicalItems.length; index += 1) {
    const intent = intents[index];
    const canonical = canonicalItems[index];
    if (saleItemType(intent.tipo) !== canonical.tipo || (intent.referencia_id || null) !== (canonical.referencia_id || null) || Number(intent.cantidad) !== Number(canonical.cantidad)) {
      throw new SaleError(`Item ${index + 1} no coincide con la fuente autorizada`, "SALE_ITEM_TAMPERING", 409);
    }
    if (intent.precio_unitario != null && !moneyMatches(intent.precio_unitario, canonical.precio_unitario)) {
      throw new SaleError(`Item ${index + 1}: precio unitario adulterado`, "SALE_PRICE_TAMPERING", 409);
    }
    if (intent.subtotal != null && !moneyMatches(intent.subtotal, canonical.subtotal)) {
      throw new SaleError(`Item ${index + 1}: subtotal adulterado`, "SALE_AMOUNT_TAMPERING", 409);
    }
    if (intent.descuento_porcentaje != null && !moneyMatches(intent.descuento_porcentaje, canonical.descuento_porcentaje || 0)) {
      throw new SaleError(`Item ${index + 1}: descuento adulterado`, "SALE_DISCOUNT_TAMPERING", 409);
    }
  }
}
function finalizeCanonicalItems(calculated) {
  return calculated.items.map((item, index) => ({
    tipo: saleItemType(item.tipo),
    referencia_id: item.referencia_id || null,
    descripcion: String(item.descripcion || "").trim(),
    cantidad: Number(item.cantidad),
    precio_unitario: Number(item.precio_unitario),
    subtotal: Number(item.subtotal),
    _index: index
  }));
}
async function resolveAuthoritativeCommercialInput(base44, orgId, input) {
  if (input.cotizacionOrigenId) {
    const quote = await findOne2(base44.asServiceRole.entities.Cotizacion, {
      id: input.cotizacionOrigenId,
      organization_id: orgId
    });
    if (!quote) throw new SaleError("Cotizacion origen no encontrada", "SALE_QUOTE_NOT_FOUND", 404);
    if (quote.estado !== "aprobada" || quote.decision_status !== "COMMITTED") {
      throw new SaleError("Solo una cotizacion aprobada puede convertirse en venta", "SALE_QUOTE_NOT_APPROVED", 409);
    }
    const workOrder = quote.orden_trabajo_id ? await findOne2(base44.asServiceRole.entities.OrdenTrabajo, { id: quote.orden_trabajo_id, organization_id: orgId }) : null;
    if (quote.orden_trabajo_id && !workOrder) {
      throw new SaleError("La OT de la cotizacion no existe", "SALE_QUOTE_WORK_ORDER_NOT_FOUND", 409);
    }
    const quoteBranchId = quote.branch_id || workOrder?.branch_id || null;
    if (!quoteBranchId || quoteBranchId !== input.ventaData.branch_id) {
      throw new SaleError("La cotizacion pertenece a otra sucursal", "SALE_QUOTE_BRANCH_MISMATCH", 409);
    }
    if (input.ventaData.referencia_ot_id && input.ventaData.referencia_ot_id !== quote.orden_trabajo_id) {
      throw new SaleError("La OT enviada no coincide con la cotizacion", "SALE_QUOTE_WORK_ORDER_MISMATCH", 409);
    }
    if (input.ventaData.cliente_id && input.ventaData.cliente_id !== quote.cliente_id) {
      throw new SaleError("El cliente enviado no coincide con la cotizacion", "SALE_QUOTE_CUSTOMER_MISMATCH", 409);
    }
    const snapshot = quote.contenido_aprobado_snapshot;
    if (!snapshot || !Array.isArray(snapshot.items) || snapshot.items.length === 0) {
      throw new SaleError("La cotizacion aprobada no tiene snapshot comercial inmutable", "SALE_QUOTE_APPROVED_SNAPSHOT_REQUIRED", 409);
    }
    let calculated2;
    try {
      calculated2 = calculateCommercialTotals(snapshot.items.map((item, index) => ({
        ...normalizeCatalogReference(item, index),
        tipo: saleItemType(item.tipo)
      })));
      assertPersistedTotalsMatch(snapshot, calculated2, "Snapshot aprobado");
      assertPersistedTotalsMatch(quote, calculated2, "Cotizacion aprobada");
      assertClientFinancialHints(input.financialHints, calculated2);
    } catch (error) {
      throw financialError(error, "SALE_QUOTE_INTEGRITY_MISMATCH");
    }
    const canonicalItems = finalizeCanonicalItems(calculated2);
    assertIntentLinesMatch(input.itemIntents, calculated2.items.map((item) => ({ ...item, tipo: saleItemType(item.tipo) })), { allowEmpty: true });
    input.ventaData = {
      ...input.ventaData,
      branch_id: quoteBranchId,
      cliente_id: quote.cliente_id,
      referencia_ot_id: quote.orden_trabajo_id || null,
      cotizacion_id: quote.id,
      subtotal: calculated2.subtotal,
      descuento_total: calculated2.descuento_total,
      impuesto: calculated2.impuesto,
      total: calculated2.total
    };
    input.items = canonicalItems;
    input.authoritativeQuote = quote;
    return input;
  }
  const sourceItems = [];
  for (const [index, intent] of input.itemIntents.entries()) {
    if (!intent.referencia_id) {
      throw new SaleError(`Item ${index + 1}: referencia de catalogo requerida`, "SALE_CATALOG_REFERENCE_REQUIRED", 409);
    }
    if (saleItemType(intent.tipo) === "producto") {
      const product = await findOne2(base44.asServiceRole.entities.Inventario, {
        id: intent.referencia_id,
        organization_id: orgId,
        branch_id: input.ventaData.branch_id
      });
      if (!product) throw new SaleError(`Item ${index + 1}: producto no encontrado en la sucursal`, "SALE_PRODUCT_NOT_FOUND", 404);
      sourceItems.push({
        tipo: "producto",
        referencia_id: product.id,
        descripcion: product.nombre,
        cantidad: intent.cantidad,
        precio_unitario: product.precio_venta,
        descuento_porcentaje: 0
      });
    } else {
      const service = await findOne2(base44.asServiceRole.entities.Servicio, {
        id: intent.referencia_id,
        organization_id: orgId,
        activo: true
      });
      if (!service) throw new SaleError(`Item ${index + 1}: servicio no encontrado`, "SALE_SERVICE_NOT_FOUND", 404);
      sourceItems.push({
        tipo: "servicio",
        referencia_id: service.id,
        descripcion: service.nombre,
        cantidad: intent.cantidad,
        precio_unitario: service.precio,
        descuento_porcentaje: 0
      });
    }
  }
  let calculated;
  try {
    calculated = calculateCommercialTotals(sourceItems);
    assertClientFinancialHints(input.financialHints, calculated);
  } catch (error) {
    throw financialError(error);
  }
  assertIntentLinesMatch(input.itemIntents, calculated.items.map((item) => ({ ...item, tipo: saleItemType(item.tipo) })));
  if (calculated.total <= 0) throw new SaleError("El total autoritativo debe ser mayor a cero", "SALE_TOTAL_INVALID", 409);
  input.ventaData = {
    ...input.ventaData,
    subtotal: calculated.subtotal,
    descuento_total: 0,
    impuesto: calculated.impuesto,
    total: calculated.total
  };
  input.items = finalizeCanonicalItems(calculated);
  return input;
}
async function buildIdentity(orgId, input) {
  const { ventaData, clientIdempotencyKey } = input;
  let identity;
  if (ventaData.referencia_ot_id) {
    identity = `ot:${ventaData.referencia_ot_id}:concept:${ventaData.tipo_concepto}`;
  } else {
    if (!clientIdempotencyKey) {
      throw new SaleError(
        "idempotency_key es requerido para ventas sin Orden de Trabajo",
        "SALE_IDEMPOTENCY_KEY_REQUIRED"
      );
    }
    identity = `branch:${ventaData.branch_id}:request:${clientIdempotencyKey}`;
  }
  const operationKey = `sale_v1_${await sha2562(`${orgId}|${identity}`)}`;
  const requestFingerprint = await fingerprint({
    venta: input.ventaData,
    cotizacion_origen_id: input.cotizacionOrigenId,
    venta_preload_id: input.ventaPreloadId,
    items: input.items.map(({ _index, ...item }) => item).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
  });
  return { operationKey, requestFingerprint };
}
async function resolveAnchor(base44, orgId, ventaData) {
  if (ventaData.referencia_ot_id) {
    const ot = await findOne2(base44.asServiceRole.entities.OrdenTrabajo, {
      id: ventaData.referencia_ot_id,
      organization_id: orgId
    });
    if (!ot) throw new SaleError("Orden de Trabajo no encontrada", "SALE_WORK_ORDER_NOT_FOUND", 404);
    if (ot.branch_id !== ventaData.branch_id) {
      throw new SaleError("La sucursal de la venta no coincide con la OT", "SALE_BRANCH_MISMATCH", 409);
    }
    if (["ENTREGADA", "CANCELADA"].includes(ot.estado)) {
      throw new SaleError(`La OT no admite cobros en estado ${ot.estado}`, "SALE_WORK_ORDER_TERMINAL", 409);
    }
    return { entityName: "OrdenTrabajo", entity: base44.asServiceRole.entities.OrdenTrabajo, record: ot };
  }
  const branch = await findOne2(base44.asServiceRole.entities.Branch, {
    id: ventaData.branch_id,
    organization_id: orgId
  });
  if (!branch || branch.active === false) {
    throw new SaleError("Sucursal no encontrada o inactiva", "SALE_BRANCH_NOT_AVAILABLE", 404);
  }
  return { entityName: "Branch", entity: base44.asServiceRole.entities.Branch, record: branch };
}
async function loadAnchor(anchor, orgId) {
  return findOne2(anchor.entity, { id: anchor.record.id, organization_id: orgId });
}
async function claimCommerceLock(anchor, orgId, operationKey) {
  const token = crypto.randomUUID();
  const lockAt = nowIso();
  const lockData = {
    sale_lock_token: token,
    sale_lock_operation_key: operationKey,
    sale_lock_at: lockAt
  };
  const deadline = Date.now() + LOCK_WAIT_MS;
  let attempt = 0;
  while (Date.now() <= deadline) {
    let claim;
    try {
      claim = await anchor.entity.updateMany({
        id: anchor.record.id,
        organization_id: orgId,
        $or: [
          { sale_lock_token: { $exists: false } },
          { sale_lock_token: null },
          { sale_lock_token: "" }
        ]
      }, { $set: lockData });
    } catch (claimError) {
      const reconciled = await loadAnchor(anchor, orgId);
      if (reconciled?.sale_lock_token === token) {
        return { token, operationKey, lockAt, recoveredAmbiguousClaim: true };
      }
      throw claimError;
    }
    if (claim?.updated === 1) return { token, operationKey, lockAt };
    const current = await loadAnchor(anchor, orgId);
    const currentLockAt = Date.parse(current?.sale_lock_at || "");
    const stale = current?.sale_lock_token && Number.isFinite(currentLockAt) && Date.now() - currentLockAt > LOCK_TTL_MS;
    if (stale) {
      const takeover = await anchor.entity.updateMany({
        id: anchor.record.id,
        organization_id: orgId,
        sale_lock_token: current.sale_lock_token,
        sale_lock_at: current.sale_lock_at
      }, { $set: lockData });
      if (takeover?.updated === 1) return { token, operationKey, lockAt, recoveredStaleLock: true };
    }
    attempt += 1;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await wait(Math.min(LOCK_BACKOFF_MS * Math.min(attempt, 10), remaining));
  }
  throw new SaleError(
    "El cobro ya esta siendo procesado. Reintente con la misma solicitud.",
    "SALE_LOCK_TIMEOUT",
    423,
    { retryable: true }
  );
}
async function renewCommerceLock(anchor, orgId, lock) {
  const heartbeat = nowIso();
  let renewed;
  try {
    renewed = await anchor.entity.updateMany({
      id: anchor.record.id,
      organization_id: orgId,
      sale_lock_token: lock.token,
      sale_lock_operation_key: lock.operationKey
    }, { $set: { sale_lock_at: heartbeat } });
  } catch (renewError) {
    const reconciled = await loadAnchor(anchor, orgId);
    if (reconciled?.sale_lock_token === lock.token && reconciled?.sale_lock_operation_key === lock.operationKey) {
      renewed = { updated: 1, recovered_ambiguous_renewal: true };
    } else {
      throw renewError;
    }
  }
  if (renewed?.updated !== 1) {
    throw new SaleError("Se perdio el lock persistido del cobro", "SALE_LOCK_LOST", 409, { retryable: true });
  }
  lock.lockAt = heartbeat;
}
async function releaseCommerceLock(anchor, orgId, lock) {
  if (!lock) return;
  const released = await anchor.entity.updateMany({
    id: anchor.record.id,
    organization_id: orgId,
    sale_lock_token: lock.token,
    sale_lock_operation_key: lock.operationKey
  }, {
    $unset: {
      sale_lock_token: "",
      sale_lock_operation_key: "",
      sale_lock_at: ""
    }
  });
  if (released?.updated !== 1) {
    console.warn(`[createSale] El lock ${lock.token} ya no pertenece a este intento`);
  }
}
async function findOperationSales(base44, orgId, operationKey, ventaData) {
  const canonical = await base44.asServiceRole.entities.Venta.filter({
    organization_id: orgId,
    idempotency_key: operationKey
  }, "-created_date", 10);
  if (canonical?.length) return canonical;
  if (!ventaData.referencia_ot_id) return [];
  const legacy = await base44.asServiceRole.entities.Venta.filter({
    organization_id: orgId,
    referencia_ot_id: ventaData.referencia_ot_id,
    tipo_concepto: ventaData.tipo_concepto
  }, "-created_date", 10);
  return (legacy || []).filter((sale) => sale.estado !== "anulada" && sale.estado !== "borrador");
}
async function legacySaleMatchesRequest(base44, sale, input) {
  const headerMatches = sale.branch_id === input.ventaData.branch_id && (sale.cliente_id || null) === input.ventaData.cliente_id && sale.tipo_concepto === input.ventaData.tipo_concepto && (sale.referencia_ot_id || null) === input.ventaData.referencia_ot_id && (sale.cotizacion_id || null) === input.ventaData.cotizacion_id && sale.metodo_pago === input.ventaData.metodo_pago && Number(sale.total) === input.ventaData.total && Number(sale.subtotal) === input.ventaData.subtotal && Number(sale.impuesto || 0) === input.ventaData.impuesto && Number(sale.descuento_total || 0) === input.ventaData.descuento_total;
  if (!headerMatches) return false;
  const persisted = await base44.asServiceRole.entities.VentaItem.filter({ venta_id: sale.id }, "created_date", 500);
  const normalizeItems = (items) => items.map((item) => ({
    tipo: item.tipo,
    referencia_id: item.referencia_id || null,
    descripcion: String(item.descripcion || "").trim(),
    cantidad: Number(item.cantidad),
    precio_unitario: Number(item.precio_unitario),
    subtotal: Number(item.subtotal)
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return JSON.stringify(normalizeItems(persisted || [])) === JSON.stringify(normalizeItems(input.items));
}
async function assertFingerprint(base44, sale, requestFingerprint, operationKey, input) {
  if (sale.request_fingerprint && sale.request_fingerprint !== requestFingerprint) {
    throw new SaleError(
      "La misma operacion comercial fue reenviada con un payload diferente",
      "SALE_IDEMPOTENCY_CONFLICT",
      409
    );
  }
  if (!sale.request_fingerprint || sale.idempotency_key !== operationKey) {
    if (!sale.request_fingerprint && !await legacySaleMatchesRequest(base44, sale, input)) {
      throw new SaleError(
        "La venta legacy encontrada no coincide con el payload del cobro",
        "SALE_IDEMPOTENCY_CONFLICT",
        409
      );
    }
    const adopted = await base44.asServiceRole.entities.Venta.updateMany({
      id: sale.id,
      organization_id: sale.organization_id,
      $or: [
        { request_fingerprint: { $exists: false } },
        { request_fingerprint: null },
        { request_fingerprint: requestFingerprint }
      ]
    }, { $set: { request_fingerprint: requestFingerprint, idempotency_key: operationKey } });
    if (adopted?.updated !== 1) {
      const reconciled = await findOne2(base44.asServiceRole.entities.Venta, { id: sale.id });
      if (reconciled?.request_fingerprint !== requestFingerprint) {
        throw new SaleError("Conflicto al adoptar la operacion existente", "SALE_IDEMPOTENCY_CONFLICT", 409);
      }
    }
  }
}
function aggregateProducts(items) {
  const grouped = /* @__PURE__ */ new Map();
  for (const item of items) {
    if (item.tipo !== "producto") continue;
    const current = grouped.get(item.referencia_id) || { cantidad: 0, descripcion: item.descripcion };
    current.cantidad += item.cantidad;
    grouped.set(item.referencia_id, current);
  }
  return [...grouped.entries()].map(([inventarioId, data]) => ({ inventarioId, ...data })).sort((left, right) => left.inventarioId.localeCompare(right.inventarioId));
}
async function buildInventoryPlans(base44, orgId, sale, operationKey, items) {
  const plans = [];
  for (const product of aggregateProducts(items)) {
    const invItem = await findOne2(base44.asServiceRole.entities.Inventario, {
      id: product.inventarioId,
      organization_id: orgId,
      branch_id: sale.branch_id
    });
    if (!invItem) {
      throw new SaleError(
        `Producto "${product.descripcion}" no encontrado en inventario`,
        "SALE_INVENTORY_NOT_FOUND"
      );
    }
    let permiteStock = true;
    if (invItem.categoria_id) {
      const category = await findOne2(base44.asServiceRole.entities.CategoriaInventario, {
        id: invItem.categoria_id,
        organization_id: orgId
      });
      if (category?.permite_stock === false) permiteStock = false;
    }
    let reservation = null;
    if (sale.referencia_ot_id && permiteStock) {
      const reservations = await base44.asServiceRole.entities.InventarioReserva.filter({
        organization_id: orgId,
        branch_id: sale.branch_id,
        work_order_id: sale.referencia_ot_id,
        inventario_id: product.inventarioId,
        state: { $in: ["RESERVED", "CONSUMED"] }
      }, "-created_date", 2);
      if ((reservations || []).length > 1) {
        throw new SaleError("Existen reservas activas duplicadas para el producto", "SALE_INVENTORY_RESERVATION_DUPLICATE", 409);
      }
      reservation = reservations?.[0] || null;
      if (reservation && Number(reservation.quantity) !== product.cantidad) {
        throw new SaleError("La cantidad facturada no coincide con la reserva de la OT", "SALE_INVENTORY_RESERVATION_QUANTITY_MISMATCH", 409);
      }
    }
    const movementType = reservation?.state === "CONSUMED" ? null : reservation?.state === "RESERVED" ? "CONSUME" : "SALE";
    const currentStock = Number(invItem.cantidad_disponible || 0);
    if (permiteStock && movementType === "SALE" && product.cantidad > currentStock) {
      throw new SaleError(
        `Stock insuficiente para "${invItem.nombre}": disponible ${currentStock}, solicitado ${product.cantidad}`,
        "SALE_STOCK_INSUFFICIENT"
      );
    }
    plans.push({
      invItem,
      cantidad: product.cantidad,
      permiteStock,
      movementType,
      reservation
    });
  }
  return plans;
}
async function createOrRecoverSale(base44, context) {
  const { orgId, user, input, operationKey, requestFingerprint } = context;
  const existingSales = await findOperationSales(base44, orgId, operationKey, input.ventaData);
  if (existingSales.length > 1) {
    throw new SaleError(
      "Existen multiples ventas activas para la misma operacion. Requiere revision.",
      "SALE_DUPLICATE_EXISTING",
      409,
      { details: { sale_ids: existingSales.map((sale2) => sale2.id) } }
    );
  }
  let sale = existingSales[0] || null;
  let created = false;
  let preload = false;
  if (sale) {
    await assertFingerprint(base44, sale, requestFingerprint, operationKey, input);
    sale = await findOne2(base44.asServiceRole.entities.Venta, { id: sale.id, organization_id: orgId });
    return { sale, created, preload, recovered: true };
  }
  const saleData = {
    organization_id: orgId,
    branch_id: input.ventaData.branch_id,
    cliente_id: input.ventaData.cliente_id,
    origen_venta: input.ventaData.origen_venta,
    origen_detalle: input.ventaData.cotizacion_id ? "DESDE_COTIZACION" : input.ventaData.referencia_ot_id ? "DESDE_OT" : "POS_DIRECTO",
    tipo_concepto: input.ventaData.tipo_concepto,
    referencia_ot_id: input.ventaData.referencia_ot_id,
    cotizacion_id: input.ventaData.cotizacion_id,
    total: input.ventaData.total,
    subtotal: input.ventaData.subtotal,
    impuesto: input.ventaData.impuesto,
    descuento_total: input.ventaData.descuento_total,
    metodo_pago: input.ventaData.metodo_pago,
    estado: "procesando",
    created_by_user_id: user.id,
    idempotency_key: operationKey,
    request_fingerprint: requestFingerprint,
    inventory_commit_status: "PENDING",
    post_sale_status: "PENDING"
  };
  if (input.ventaPreloadId) {
    const preloadSale = await findOne2(base44.asServiceRole.entities.Venta, {
      id: input.ventaPreloadId,
      organization_id: orgId
    });
    if (!preloadSale) throw new SaleError("Venta pre-cargada no encontrada", "SALE_PRELOAD_NOT_FOUND", 404);
    if (!preloadSale.branch_id || preloadSale.branch_id !== input.ventaData.branch_id) {
      throw new SaleError("El borrador pertenece a otra sucursal", "SALE_PRELOAD_BRANCH_MISMATCH", 409);
    }
    if ((preloadSale.cotizacion_id || null) !== (input.ventaData.cotizacion_id || null)) {
      throw new SaleError("El borrador no pertenece a la cotizacion indicada", "SALE_PRELOAD_QUOTE_MISMATCH", 409);
    }
    if ((preloadSale.cliente_id || null) !== (input.ventaData.cliente_id || null)) {
      throw new SaleError("El borrador pertenece a otro cliente", "SALE_PRELOAD_CUSTOMER_MISMATCH", 409);
    }
    if ((preloadSale.referencia_ot_id || null) !== (input.ventaData.referencia_ot_id || null)) {
      throw new SaleError("El borrador pertenece a otra orden de trabajo", "SALE_PRELOAD_WORK_ORDER_MISMATCH", 409);
    }
    if (preloadSale.estado !== "borrador") {
      throw new SaleError(`Venta pre-cargada en estado ${preloadSale.estado}`, "SALE_PRELOAD_ALREADY_PROCESSED", 409);
    }
    let claimed;
    try {
      claimed = await base44.asServiceRole.entities.Venta.updateMany({
        id: preloadSale.id,
        organization_id: orgId,
        estado: "borrador"
      }, { $set: saleData });
    } catch (claimError) {
      const reconciled = await findOne2(base44.asServiceRole.entities.Venta, {
        id: preloadSale.id,
        organization_id: orgId
      });
      if (reconciled?.estado === "procesando" && reconciled?.request_fingerprint === requestFingerprint) {
        claimed = { updated: 1, recovered_ambiguous_preload_claim: true };
      } else {
        throw claimError;
      }
    }
    if (claimed?.updated !== 1) {
      throw new SaleError("La venta pre-cargada cambio durante el cobro", "SALE_PRELOAD_CONCURRENT_UPDATE", 409);
    }
    sale = await findOne2(base44.asServiceRole.entities.Venta, { id: preloadSale.id, organization_id: orgId });
    preload = true;
  } else {
    try {
      sale = await base44.asServiceRole.entities.Venta.create(saleData);
      created = true;
    } catch (createError) {
      const reconciled = await findOne2(base44.asServiceRole.entities.Venta, {
        organization_id: orgId,
        idempotency_key: operationKey
      });
      if (!reconciled) throw createError;
      await assertFingerprint(base44, reconciled, requestFingerprint, operationKey, input);
      sale = reconciled;
      created = true;
    }
  }
  if (!sale?.id) throw new SaleError("No se pudo reservar la venta", "SALE_RESERVATION_FAILED", 500);
  return { sale, created, preload, recovered: false };
}
async function ensureSaleItems(base44, context, inventoryPlans, mutations) {
  const { orgId, input, sale } = context;
  const existing = await base44.asServiceRole.entities.VentaItem.filter({ venta_id: sale.id }, "-created_date", 500);
  for (const oldItem of (existing || []).filter((item) => !item.line_key)) {
    await base44.asServiceRole.entities.VentaItem.delete(oldItem.id);
    mutations.deletedPreloadItems.push({
      organization_id: oldItem.organization_id,
      venta_id: oldItem.venta_id,
      tipo: oldItem.tipo,
      referencia_id: oldItem.referencia_id || null,
      descripcion: oldItem.descripcion,
      cantidad: oldItem.cantidad,
      precio_unitario: oldItem.precio_unitario,
      subtotal: oldItem.subtotal,
      costo_unitario_snapshot: oldItem.costo_unitario_snapshot || 0
    });
  }
  const retained = (existing || []).filter((item) => item.line_key);
  const lineOccurrences = /* @__PURE__ */ new Map();
  for (const item of input.items) {
    const { _index, ...persistedItem } = item;
    const itemFingerprint = await fingerprint(persistedItem);
    const occurrence = lineOccurrences.get(itemFingerprint) || 0;
    lineOccurrences.set(itemFingerprint, occurrence + 1);
    const lineKey = `line_${itemFingerprint}_${occurrence}`;
    let itemRecord = retained.find((record) => record.line_key === lineKey);
    if (!itemRecord) {
      const plan = inventoryPlans.find((candidate) => candidate.invItem.id === item.referencia_id);
      const data = {
        organization_id: orgId,
        venta_id: sale.id,
        line_key: lineKey,
        ...persistedItem,
        costo_unitario_snapshot: item.tipo === "producto" ? Number(plan?.invItem?.costo_unitario || 0) : 0
      };
      try {
        itemRecord = await base44.asServiceRole.entities.VentaItem.create(data);
        mutations.createdItems.push(itemRecord);
      } catch (itemError) {
        itemRecord = await findOne2(base44.asServiceRole.entities.VentaItem, {
          venta_id: sale.id,
          line_key: lineKey
        });
        if (!itemRecord) throw itemError;
        mutations.createdItems.push(itemRecord);
      }
    }
  }
}
async function applyInventory(base44, context, plans, mutations) {
  const { orgId, user, sale, operationKey } = context;
  const movements = plans.filter((plan) => plan.permiteStock && plan.movementType).map((plan) => ({
    inventoryId: plan.invItem.id,
    movementType: plan.movementType,
    quantity: plan.cantidad,
    reservationId: plan.reservation?.id || null,
    workOrderId: sale.referencia_ot_id || null,
    quoteId: sale.cotizacion_id || null
  }));
  if (movements.length === 0) return;
  const inventoryOperationKey = `inventory:${operationKey}:${sale.inventory_attempt_key || sale.id}`;
  await executeInventoryCommand(base44, {
    organizationId: orgId,
    branchId: sale.branch_id,
    actorId: user.id || user.email,
    operationKey: inventoryOperationKey,
    referenceType: "SALE",
    referenceId: sale.id,
    reason: `Venta ${sale.id}`,
    movements
  });
  mutations.inventoryOperationKey = inventoryOperationKey;
}
async function convertQuote(base44, context) {
  const { orgId, user, input, sale } = context;
  if (!input.cotizacionOrigenId) return null;
  const quote = await findOne2(base44.asServiceRole.entities.Cotizacion, {
    id: input.cotizacionOrigenId,
    organization_id: orgId
  });
  if (!quote) throw new SaleError("Cotizacion origen no encontrada", "SALE_QUOTE_NOT_FOUND", 404);
  if (quote.venta_id === sale.id && quote.estado_conversion === "CONVERTIDA") return null;
  let updated;
  try {
    updated = await base44.asServiceRole.entities.Cotizacion.updateMany({
      id: quote.id,
      organization_id: orgId,
      estado: "aprobada",
      decision_status: "COMMITTED",
      $or: [
        { venta_id: { $exists: false } },
        { venta_id: null },
        { venta_id: sale.id }
      ]
    }, {
      $set: {
        estado_conversion: "CONVERTIDA",
        convertida_at: nowIso(),
        convertida_por: user.id,
        venta_id: sale.id
      }
    });
  } catch (quoteError) {
    const reconciled = await findOne2(base44.asServiceRole.entities.Cotizacion, {
      id: quote.id,
      organization_id: orgId
    });
    if (reconciled?.venta_id === sale.id && reconciled?.estado_conversion === "CONVERTIDA") {
      updated = { updated: 1, recovered_ambiguous_conversion: true };
    } else {
      throw quoteError;
    }
  }
  if (updated?.updated !== 1) {
    throw new SaleError("La cotizacion ya fue convertida por otra venta", "SALE_QUOTE_ALREADY_CONVERTED", 409);
  }
  return quote;
}
async function markSalePaid(base44, context) {
  const { orgId, sale, requestFingerprint } = context;
  const paidAt = nowIso();
  let result;
  try {
    result = await base44.asServiceRole.entities.Venta.updateMany({
      id: sale.id,
      organization_id: orgId,
      estado: "procesando",
      request_fingerprint: requestFingerprint
    }, {
      $set: {
        estado: "pagada",
        inventory_commit_status: "COMMITTED",
        inventory_committed_at: paidAt,
        post_sale_status: "PENDING"
      }
    });
  } catch (commitError) {
    const reconciled = await findOne2(base44.asServiceRole.entities.Venta, { id: sale.id, organization_id: orgId });
    if (reconciled?.estado === "pagada" && reconciled?.request_fingerprint === requestFingerprint) return reconciled;
    throw commitError;
  }
  if (result?.updated !== 1) {
    const reconciled = await findOne2(base44.asServiceRole.entities.Venta, { id: sale.id, organization_id: orgId });
    if (reconciled?.estado === "pagada" && reconciled?.request_fingerprint === requestFingerprint) return reconciled;
    throw new SaleError("No se pudo confirmar atomicamente la venta", "SALE_COMMIT_CONFLICT", 409);
  }
  return findOne2(base44.asServiceRole.entities.Venta, { id: sale.id, organization_id: orgId });
}
async function runPostSale(base44, orgId, sale) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = unwrapFunctionResult(await base44.functions.invoke("processPostSaleActions", { sale_id: sale.id }));
      if (result?.success === false) throw new Error(result.error || "Post-procesamiento rechazado");
      await base44.asServiceRole.entities.Venta.updateMany({
        id: sale.id,
        organization_id: orgId,
        estado: "pagada"
      }, {
        $set: { post_sale_status: "COMPLETED", post_sale_completed_at: nowIso() },
        $unset: { post_sale_error: "" }
      });
      return { completed: true, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await wait(LOCK_BACKOFF_MS * attempt);
    }
  }
  console.warn(`[createSale] Venta ${sale.id} pagada; post-procesamiento pendiente: ${lastError.message}`);
  await base44.asServiceRole.entities.Venta.updateMany({
    id: sale.id,
    organization_id: orgId,
    estado: "pagada"
  }, { $set: { post_sale_status: "PENDING", post_sale_error: String(lastError.message).slice(0, 500) } }).catch(() => null);
  return { completed: false, error: lastError.message, attempts: 3 };
}
async function loadSaleWithItems(base44, orgId, saleId) {
  const sale = await findOne2(base44.asServiceRole.entities.Venta, { id: saleId, organization_id: orgId });
  const items = await base44.asServiceRole.entities.VentaItem.filter({ venta_id: saleId }, "created_date", 500);
  return { ...sale, items: items || [] };
}
async function rollback(base44, context, mutations, originalError) {
  const { orgId, sale, operationKey, input } = context;
  const errors = [];
  if (mutations.inventoryOperationKey) {
    try {
      await reverseInventoryCommand(base44, {
        organizationId: orgId,
        branchId: sale.branch_id,
        actorId: context.user.id || context.user.email,
        operationKey: mutations.inventoryOperationKey,
        reversalOperationKey: `inventory-rollback:${operationKey}`,
        reason: `Rollback de venta ${sale.id}`
      });
    } catch (error) {
      errors.push(`inventory_reversal:${error.message}`);
    }
  }
  for (const item of [...mutations.createdItems].reverse()) {
    try {
      await base44.asServiceRole.entities.VentaItem.delete(item.id);
    } catch (error) {
      errors.push(`item:${item.id}:${error.message}`);
    }
  }
  for (const oldItem of mutations.deletedPreloadItems) {
    try {
      await base44.asServiceRole.entities.VentaItem.create(oldItem);
    } catch (error) {
      errors.push(`item_restore:${oldItem.descripcion}:${error.message}`);
    }
  }
  if (mutations.quoteSnapshot) {
    try {
      await base44.asServiceRole.entities.Cotizacion.updateMany({
        id: mutations.quoteSnapshot.id,
        organization_id: orgId,
        venta_id: sale.id
      }, {
        $set: {
          estado_conversion: mutations.quoteSnapshot.estado_conversion || "PENDIENTE",
          venta_id: mutations.quoteSnapshot.venta_id || null,
          convertida_at: mutations.quoteSnapshot.convertida_at || null,
          convertida_por: mutations.quoteSnapshot.convertida_por || null
        }
      });
    } catch (error) {
      errors.push(`quote:${mutations.quoteSnapshot.id}:${error.message}`);
    }
  }
  if (mutations.saleCreated && errors.length === 0) {
    try {
      await base44.asServiceRole.entities.Venta.delete(sale.id);
    } catch (error) {
      errors.push(`sale:${sale.id}:${error.message}`);
    }
  } else if (mutations.salePreload && errors.length === 0) {
    try {
      await base44.asServiceRole.entities.Venta.updateMany({ id: sale.id, organization_id: orgId }, {
        $set: { estado: "borrador", inventory_attempt_key: crypto.randomUUID() },
        $unset: {
          idempotency_key: "",
          request_fingerprint: "",
          inventory_commit_status: "",
          post_sale_status: ""
        }
      });
    } catch (error) {
      errors.push(`preload:${sale.id}:${error.message}`);
    }
  }
  if (errors.length > 0 || mutations.resumedExisting) {
    await base44.asServiceRole.entities.Venta.updateMany({ id: sale.id, organization_id: orgId }, {
      $set: {
        estado: "inconsistente",
        rollback_status: errors.length ? "partial" : "failed",
        rollback_error: `${originalError.message} | ${errors.join(" | ")}`.slice(0, 500)
      }
    }).catch(() => null);
  }
  return errors;
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Metodo no permitido" }, { status: 405 });
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });
  const authorization = await resolveAuthorizedContext(base44, user, {
    allowedRoles: ["ORG_ADMIN", "BRANCH_ADMIN", "SALES"]
  });
  if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status });
  const orgId = authorization.organizationId;
  let anchor = null;
  let lock = null;
  try {
    const body = await req.json();
    const input = normalizeInput(body);
    const branchScope = getCanonicalBranchScope(authorization);
    if (!branchScope.ok) throw new SaleError(branchScope.error, branchScope.code || "SALE_BRANCH_SCOPE_INVALID", branchScope.status);
    const branchCheck = validateRequestedBranch(branchScope, input.ventaData.branch_id);
    if (!branchCheck.ok) throw new SaleError(branchCheck.error, branchCheck.code, branchCheck.status);
    if (!branchScope.organizationWide) input.ventaData.branch_id = branchScope.branchId;
    await resolveAuthoritativeCommercialInput(base44, orgId, input);
    try {
      await assertActiveBranch(base44, orgId, input.ventaData.branch_id, {
        code: "SALE_BRANCH_NOT_AVAILABLE",
        status: 409,
        message: "La sucursal no existe o esta inactiva; no admite nuevas ventas."
      });
    } catch (error) {
      if (error instanceof BranchProtectionError) {
        throw new SaleError(error.message, error.code, error.status);
      }
      throw error;
    }
    const identity = await buildIdentity(orgId, input);
    anchor = await resolveAnchor(base44, orgId, input.ventaData);
    lock = await claimCommerceLock(anchor, orgId, identity.operationKey);
    const reservation = await createOrRecoverSale(base44, {
      base44,
      orgId,
      user,
      input,
      ...identity
    });
    let sale = reservation.sale;
    if (sale.estado === "pagada") {
      await ensureSaleAudit(base44, authorization, user, sale, identity.operationKey, true);
      const postSale = await runPostSale(base44, orgId, sale);
      const recovered = await loadSaleWithItems(base44, orgId, sale.id);
      return Response.json({
        success: true,
        data: projectSaleMutationResult(recovered),
        idempotent: true,
        recovered: true,
        post_sale_pending: !postSale.completed
      }, { status: 200 });
    }
    if (sale.estado === "inconsistente") {
      throw new SaleError(
        `La venta ${sale.id} requiere revision manual antes de continuar`,
        "SALE_INCONSISTENT",
        409
      );
    }
    if (sale.estado !== "procesando") {
      throw new SaleError(`Estado de venta no recuperable: ${sale.estado}`, "SALE_STATE_INVALID", 409);
    }
    const context = {
      base44,
      orgId,
      user,
      input,
      sale,
      operationKey: identity.operationKey,
      requestFingerprint: identity.requestFingerprint
    };
    const mutations = {
      saleCreated: reservation.created,
      salePreload: reservation.preload,
      resumedExisting: reservation.recovered,
      createdItems: [],
      deletedPreloadItems: [],
      inventoryOperationKey: null,
      quoteSnapshot: null
    };
    try {
      await renewCommerceLock(anchor, orgId, lock);
      const inventoryPlans = await buildInventoryPlans(base44, orgId, sale, identity.operationKey, input.items);
      await ensureSaleItems(base44, context, inventoryPlans, mutations);
      await renewCommerceLock(anchor, orgId, lock);
      await applyInventory(base44, context, inventoryPlans, mutations);
      await renewCommerceLock(anchor, orgId, lock);
      mutations.quoteSnapshot = await convertQuote(base44, context);
      sale = await markSalePaid(base44, context);
      await ensureSaleAudit(base44, authorization, user, sale, identity.operationKey, reservation.recovered);
      const postSale = await runPostSale(base44, orgId, sale);
      const committed = await loadSaleWithItems(base44, orgId, sale.id);
      return Response.json({
        success: true,
        data: projectSaleMutationResult(committed),
        idempotent: reservation.recovered,
        recovered: reservation.recovered,
        post_sale_pending: !postSale.completed
      }, { status: reservation.recovered ? 200 : 201 });
    } catch (error) {
      const current = await findOne2(base44.asServiceRole.entities.Venta, { id: sale.id, organization_id: orgId });
      if (current?.estado === "pagada" && current?.request_fingerprint === identity.requestFingerprint) {
        await ensureSaleAudit(base44, authorization, user, current, identity.operationKey, true);
        const postSale = await runPostSale(base44, orgId, current);
        const committed = await loadSaleWithItems(base44, orgId, current.id);
        return Response.json({
          success: true,
          data: projectSaleMutationResult(committed),
          idempotent: true,
          recovered: true,
          post_sale_pending: !postSale.completed
        }, { status: 200 });
      }
      const rollbackErrors = await rollback(base44, context, mutations, error);
      if (rollbackErrors.length) {
        throw new SaleError(
          "El cobro fallo y su compensacion requiere revision manual",
          "SALE_ROLLBACK_INCOMPLETE",
          500,
          { details: { rollback_errors: rollbackErrors } }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("[createSale]", error.code || "SALE_INTERNAL_ERROR", error.message);
    return errorResponse(error);
  } finally {
    if (anchor && lock) {
      try {
        await releaseCommerceLock(anchor, orgId, lock);
      } catch (releaseError) {
        console.error("[createSale] No se pudo liberar el lock:", releaseError.message);
      }
    }
  }
});