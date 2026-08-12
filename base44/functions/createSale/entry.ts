import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { executeInventoryCommand, reverseInventoryCommand } from '../_shared/inventoryMutationService.ts';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { getCanonicalBranchScope, validateRequestedBranch } from '../_shared/operationalAuthorization.ts';
import { assertActiveBranch, BranchProtectionError } from '../_shared/branchProtection.ts';
import {
  assertClientFinancialHints,
  assertPersistedTotalsMatch,
  calculateCommercialTotals,
  moneyMatches,
} from '../_shared/commercialIntegrity.ts';
import { appendAuditEvent } from '../_shared/auditEvent.ts';

/*
 * createSale — TRP-MVP-003
 *
 * Owner unico del commit financiero e inventario de una venta. La exclusion se
 * obtiene con compare-and-set sobre un registro persistido y unico que ya existe:
 * OrdenTrabajo para cobros de OT y Branch para ventas directas. El lock permanece
 * activo hasta confirmar Venta, inventario y post-procesamiento operacional.
 */

const LOCK_TTL_MS = 2 * 60 * 1000;
const LOCK_WAIT_MS = 10 * 1000;
const LOCK_BACKOFF_MS = 40;

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const nowIso = () => new Date().toISOString();

async function ensureSaleAudit(base44, authorization, user, sale, operationKey, idempotent) {
  return appendAuditEvent(base44, {
    eventType: 'SALE_PAYMENT_COMMITTED',
    principalClass: authorization.principalClass,
    actorUserId: user.id,
    actorPrimaryRole: authorization.persistedRole,
    organizationId: authorization.organizationId,
    branchId: sale.branch_id,
    resourceType: 'Venta',
    resourceId: sale.id,
    commandPolicyId: 'CP-SALE-001',
    correlationId: operationKey,
    operationKey,
    outcome: idempotent ? 'IDEMPOTENT_REPLAY' : 'COMMITTED',
    newState: { estado: sale.estado, total: sale.total, metodo_pago: sale.metodo_pago },
    metadata: { quote_id: sale.cotizacion_id || null, work_order_id: sale.referencia_ot_id || null },
  });
}

class SaleError extends Error {
  constructor(message, code, status = 400, options = {}) {
    super(message);
    this.name = 'SaleError';
    this.code = code;
    this.status = status;
    this.retryable = options.retryable ?? false;
    this.details = options.details || null;
  }
}

function errorResponse(error) {
  return Response.json({
    success: false,
    error: error.message || 'Error interno al procesar la venta',
    code: error.code || 'SALE_INTERNAL_ERROR',
    retryable: error.retryable ?? false,
    ...(error.details && { details: error.details }),
  }, { status: error.status || 500 });
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      if (value[key] !== undefined) result[key] = stableValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function fingerprint(value) {
  return sha256(JSON.stringify(stableValue(value)));
}

function unwrapFunctionResult(result) {
  return result?.data ?? result;
}

async function findOne(entity, query, sort = '-created_date') {
  const records = await entity.filter(query, sort, 1);
  return records?.[0] || null;
}

function normalizeInput(body) {
  const ventaData = body?.ventaData;
  const rawItems = Array.isArray(body?.itemsCarrito) ? body.itemsCarrito : [];
  if (!ventaData) throw new SaleError('ventaData es requerido', 'SALE_DATA_REQUIRED');
  const quoteId = body.cotizacionOrigenId || ventaData.cotizacion_id || null;
  if (body.cotizacionOrigenId && ventaData.cotizacion_id && body.cotizacionOrigenId !== ventaData.cotizacion_id) {
    throw new SaleError('Los IDs de cotizacion enviados no coinciden', 'SALE_QUOTE_ID_MISMATCH', 409);
  }
  if (!quoteId && rawItems.length === 0) {
    throw new SaleError('itemsCarrito es requerido y no puede estar vacio', 'SALE_ITEMS_REQUIRED');
  }
  if (!ventaData.metodo_pago) throw new SaleError('metodo_pago es requerido', 'SALE_PAYMENT_METHOD_REQUIRED');
  if (!ventaData.branch_id) throw new SaleError('branch_id es requerido', 'SALE_BRANCH_REQUIRED');

  const itemIntents = rawItems.map((rawItem, index) => {
    const cantidad = Number(rawItem.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw new SaleError(`Item ${index + 1}: cantidad invalida`, 'SALE_ITEM_QUANTITY_INVALID');
    }
    if (rawItem.costo != null || rawItem.costo_unitario != null || rawItem.costo_unitario_snapshot != null) {
      throw new SaleError('El costo es autoridad exclusiva del servidor', 'SALE_SERVER_AUTHORITY_FIELD_FORBIDDEN', 409);
    }
    if (rawItem.referencia_id && rawItem.item_id && rawItem.referencia_id !== rawItem.item_id) {
      throw new SaleError(`Item ${index + 1}: referencias en conflicto`, 'SALE_CATALOG_REFERENCE_CONFLICT', 409);
    }
    return {
      tipo: rawItem.tipo,
      referencia_id: rawItem.referencia_id || rawItem.item_id || null,
      descripcion: String(rawItem.descripcion || '').trim(),
      cantidad,
      precio_unitario: rawItem.precio_unitario,
      subtotal: rawItem.subtotal,
      descuento_porcentaje: rawItem.descuento_porcentaje,
      _index: index,
    };
  });

  return {
    ventaData: {
      cliente_id: ventaData.cliente_id || null,
      origen_venta: ventaData.origen_venta || 'tienda',
      tipo_concepto: ventaData.tipo_concepto || 'venta_producto',
      referencia_ot_id: ventaData.referencia_ot_id || null,
      cotizacion_id: quoteId,
      metodo_pago: ventaData.metodo_pago,
      branch_id: ventaData.branch_id,
    },
    financialHints: {
      total: ventaData.total,
      subtotal: ventaData.subtotal,
      impuesto: ventaData.impuesto,
      descuento_total: ventaData.descuento_total,
    },
    itemIntents,
    items: [],
    cotizacionOrigenId: quoteId,
    ventaPreloadId: body.ventaPreloadId || null,
    clientIdempotencyKey: String(body.idempotency_key || '').trim(),
  };
}

function saleItemType(type) {
  return ['producto', 'repuesto'].includes(type) ? 'producto' : 'servicio';
}

function normalizeCatalogReference(item, index) {
  if (item.referencia_id && item.item_id && item.referencia_id !== item.item_id) {
    throw new SaleError(`Item ${index + 1}: referencias en conflicto`, 'SALE_CATALOG_REFERENCE_CONFLICT', 409);
  }
  const referenceId = item.referencia_id || item.item_id || null;
  if (!referenceId) {
    throw new SaleError(`Item ${index + 1}: referencia de catalogo requerida`, 'SALE_CATALOG_REFERENCE_REQUIRED', 409);
  }
  const { item_id: _legacyItemId, ...normalized } = item;
  return { ...normalized, referencia_id: referenceId };
}

function financialError(error, fallbackCode = 'SALE_COMMERCIAL_INTEGRITY_INVALID') {
  if (error instanceof SaleError) return error;
  return new SaleError(error.message, error.code || fallbackCode, 409);
}

function assertIntentLinesMatch(intents, canonicalItems, options = {}) {
  if (!intents.length && options.allowEmpty) return;
  if (intents.length !== canonicalItems.length) {
    throw new SaleError('Los items enviados no coinciden con la fuente comercial autorizada', 'SALE_ITEM_TAMPERING', 409);
  }
  for (let index = 0; index < canonicalItems.length; index += 1) {
    const intent = intents[index];
    const canonical = canonicalItems[index];
    if (saleItemType(intent.tipo) !== canonical.tipo
      || (intent.referencia_id || null) !== (canonical.referencia_id || null)
      || Number(intent.cantidad) !== Number(canonical.cantidad)) {
      throw new SaleError(`Item ${index + 1} no coincide con la fuente autorizada`, 'SALE_ITEM_TAMPERING', 409);
    }
    if (intent.precio_unitario != null && !moneyMatches(intent.precio_unitario, canonical.precio_unitario)) {
      throw new SaleError(`Item ${index + 1}: precio unitario adulterado`, 'SALE_PRICE_TAMPERING', 409);
    }
    if (intent.subtotal != null && !moneyMatches(intent.subtotal, canonical.subtotal)) {
      throw new SaleError(`Item ${index + 1}: subtotal adulterado`, 'SALE_AMOUNT_TAMPERING', 409);
    }
    if (intent.descuento_porcentaje != null
      && !moneyMatches(intent.descuento_porcentaje, canonical.descuento_porcentaje || 0)) {
      throw new SaleError(`Item ${index + 1}: descuento adulterado`, 'SALE_DISCOUNT_TAMPERING', 409);
    }
  }
}

function finalizeCanonicalItems(calculated) {
  return calculated.items.map((item, index) => ({
    tipo: saleItemType(item.tipo),
    referencia_id: item.referencia_id || null,
    descripcion: String(item.descripcion || '').trim(),
    cantidad: Number(item.cantidad),
    precio_unitario: Number(item.precio_unitario),
    subtotal: Number(item.subtotal),
    _index: index,
  }));
}

async function resolveAuthoritativeCommercialInput(base44, orgId, input) {
  if (input.cotizacionOrigenId) {
    const quote = await findOne(base44.asServiceRole.entities.Cotizacion, {
      id: input.cotizacionOrigenId,
      organization_id: orgId,
    });
    if (!quote) throw new SaleError('Cotizacion origen no encontrada', 'SALE_QUOTE_NOT_FOUND', 404);
    if (quote.estado !== 'aprobada' || quote.decision_status !== 'COMMITTED') {
      throw new SaleError('Solo una cotizacion aprobada puede convertirse en venta', 'SALE_QUOTE_NOT_APPROVED', 409);
    }
    const workOrder = quote.orden_trabajo_id
      ? await findOne(base44.asServiceRole.entities.OrdenTrabajo, { id: quote.orden_trabajo_id, organization_id: orgId })
      : null;
    if (quote.orden_trabajo_id && !workOrder) {
      throw new SaleError('La OT de la cotizacion no existe', 'SALE_QUOTE_WORK_ORDER_NOT_FOUND', 409);
    }
    const quoteBranchId = quote.branch_id || workOrder?.branch_id || null;
    if (!quoteBranchId || quoteBranchId !== input.ventaData.branch_id) {
      throw new SaleError('La cotizacion pertenece a otra sucursal', 'SALE_QUOTE_BRANCH_MISMATCH', 409);
    }
    if (input.ventaData.referencia_ot_id && input.ventaData.referencia_ot_id !== quote.orden_trabajo_id) {
      throw new SaleError('La OT enviada no coincide con la cotizacion', 'SALE_QUOTE_WORK_ORDER_MISMATCH', 409);
    }
    if (input.ventaData.cliente_id && input.ventaData.cliente_id !== quote.cliente_id) {
      throw new SaleError('El cliente enviado no coincide con la cotizacion', 'SALE_QUOTE_CUSTOMER_MISMATCH', 409);
    }
    const snapshot = quote.contenido_aprobado_snapshot;
    if (!snapshot || !Array.isArray(snapshot.items) || snapshot.items.length === 0) {
      throw new SaleError('La cotizacion aprobada no tiene snapshot comercial inmutable', 'SALE_QUOTE_APPROVED_SNAPSHOT_REQUIRED', 409);
    }
    let calculated;
    try {
      calculated = calculateCommercialTotals(snapshot.items.map((item, index) => ({
        ...normalizeCatalogReference(item, index),
        tipo: saleItemType(item.tipo),
      })));
      assertPersistedTotalsMatch(snapshot, calculated, 'Snapshot aprobado');
      assertPersistedTotalsMatch(quote, calculated, 'Cotizacion aprobada');
      assertClientFinancialHints(input.financialHints, calculated);
    } catch (error) {
      throw financialError(error, 'SALE_QUOTE_INTEGRITY_MISMATCH');
    }
    const canonicalItems = finalizeCanonicalItems(calculated);
    assertIntentLinesMatch(input.itemIntents, calculated.items.map(item => ({ ...item, tipo: saleItemType(item.tipo) })), { allowEmpty: true });
    input.ventaData = {
      ...input.ventaData,
      branch_id: quoteBranchId,
      cliente_id: quote.cliente_id,
      referencia_ot_id: quote.orden_trabajo_id || null,
      cotizacion_id: quote.id,
      subtotal: calculated.subtotal,
      descuento_total: calculated.descuento_total,
      impuesto: calculated.impuesto,
      total: calculated.total,
    };
    input.items = canonicalItems;
    input.authoritativeQuote = quote;
    return input;
  }

  const sourceItems = [];
  for (const [index, intent] of input.itemIntents.entries()) {
    if (!intent.referencia_id) {
      throw new SaleError(`Item ${index + 1}: referencia de catalogo requerida`, 'SALE_CATALOG_REFERENCE_REQUIRED', 409);
    }
    if (saleItemType(intent.tipo) === 'producto') {
      const product = await findOne(base44.asServiceRole.entities.Inventario, {
        id: intent.referencia_id,
        organization_id: orgId,
        branch_id: input.ventaData.branch_id,
      });
      if (!product) throw new SaleError(`Item ${index + 1}: producto no encontrado en la sucursal`, 'SALE_PRODUCT_NOT_FOUND', 404);
      sourceItems.push({
        tipo: 'producto', referencia_id: product.id, descripcion: product.nombre,
        cantidad: intent.cantidad, precio_unitario: product.precio_venta, descuento_porcentaje: 0,
      });
    } else {
      const service = await findOne(base44.asServiceRole.entities.Servicio, {
        id: intent.referencia_id,
        organization_id: orgId,
        activo: true,
      });
      if (!service) throw new SaleError(`Item ${index + 1}: servicio no encontrado`, 'SALE_SERVICE_NOT_FOUND', 404);
      sourceItems.push({
        tipo: 'servicio', referencia_id: service.id, descripcion: service.nombre,
        cantidad: intent.cantidad, precio_unitario: service.precio, descuento_porcentaje: 0,
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
  assertIntentLinesMatch(input.itemIntents, calculated.items.map(item => ({ ...item, tipo: saleItemType(item.tipo) })));
  if (calculated.total <= 0) throw new SaleError('El total autoritativo debe ser mayor a cero', 'SALE_TOTAL_INVALID', 409);
  input.ventaData = {
    ...input.ventaData,
    subtotal: calculated.subtotal,
    descuento_total: 0,
    impuesto: calculated.impuesto,
    total: calculated.total,
  };
  input.items = finalizeCanonicalItems(calculated);
  return input;
}

async function buildIdentity(orgId, input) {
  const { ventaData, clientIdempotencyKey } = input;
  let identity;
  if (ventaData.referencia_ot_id) {
    // El concepto es la unidad comercial soportada: revision y reparacion son
    // cobros distintos, pero cada uno solo puede cobrarse una vez por OT.
    identity = `ot:${ventaData.referencia_ot_id}:concept:${ventaData.tipo_concepto}`;
  } else {
    if (!clientIdempotencyKey) {
      throw new SaleError(
        'idempotency_key es requerido para ventas sin Orden de Trabajo',
        'SALE_IDEMPOTENCY_KEY_REQUIRED'
      );
    }
    identity = `branch:${ventaData.branch_id}:request:${clientIdempotencyKey}`;
  }
  const operationKey = `sale_v1_${await sha256(`${orgId}|${identity}`)}`;
  const requestFingerprint = await fingerprint({
    venta: input.ventaData,
    cotizacion_origen_id: input.cotizacionOrigenId,
    venta_preload_id: input.ventaPreloadId,
    items: input.items
      .map(({ _index, ...item }) => item)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  });
  return { operationKey, requestFingerprint };
}

async function resolveAnchor(base44, orgId, ventaData) {
  if (ventaData.referencia_ot_id) {
    const ot = await findOne(base44.asServiceRole.entities.OrdenTrabajo, {
      id: ventaData.referencia_ot_id,
      organization_id: orgId,
    });
    if (!ot) throw new SaleError('Orden de Trabajo no encontrada', 'SALE_WORK_ORDER_NOT_FOUND', 404);
    if (ot.branch_id !== ventaData.branch_id) {
      throw new SaleError('La sucursal de la venta no coincide con la OT', 'SALE_BRANCH_MISMATCH', 409);
    }
    if (['ENTREGADA', 'CANCELADA'].includes(ot.estado)) {
      throw new SaleError(`La OT no admite cobros en estado ${ot.estado}`, 'SALE_WORK_ORDER_TERMINAL', 409);
    }
    return { entityName: 'OrdenTrabajo', entity: base44.asServiceRole.entities.OrdenTrabajo, record: ot };
  }

  const branch = await findOne(base44.asServiceRole.entities.Branch, {
    id: ventaData.branch_id,
    organization_id: orgId,
  });
  if (!branch || branch.active === false) {
    throw new SaleError('Sucursal no encontrada o inactiva', 'SALE_BRANCH_NOT_AVAILABLE', 404);
  }
  return { entityName: 'Branch', entity: base44.asServiceRole.entities.Branch, record: branch };
}

async function loadAnchor(anchor, orgId) {
  return findOne(anchor.entity, { id: anchor.record.id, organization_id: orgId });
}

async function claimCommerceLock(anchor, orgId, operationKey) {
  const token = crypto.randomUUID();
  const lockAt = nowIso();
  const lockData = {
    sale_lock_token: token,
    sale_lock_operation_key: operationKey,
    sale_lock_at: lockAt,
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
          { sale_lock_token: '' },
        ],
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
    const currentLockAt = Date.parse(current?.sale_lock_at || '');
    const stale = current?.sale_lock_token
      && Number.isFinite(currentLockAt)
      && Date.now() - currentLockAt > LOCK_TTL_MS;
    if (stale) {
      const takeover = await anchor.entity.updateMany({
        id: anchor.record.id,
        organization_id: orgId,
        sale_lock_token: current.sale_lock_token,
        sale_lock_at: current.sale_lock_at,
      }, { $set: lockData });
      if (takeover?.updated === 1) return { token, operationKey, lockAt, recoveredStaleLock: true };
    }

    attempt += 1;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await wait(Math.min(LOCK_BACKOFF_MS * Math.min(attempt, 10), remaining));
  }

  throw new SaleError(
    'El cobro ya esta siendo procesado. Reintente con la misma solicitud.',
    'SALE_LOCK_TIMEOUT',
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
      sale_lock_operation_key: lock.operationKey,
    }, { $set: { sale_lock_at: heartbeat } });
  } catch (renewError) {
    const reconciled = await loadAnchor(anchor, orgId);
    if (reconciled?.sale_lock_token === lock.token
      && reconciled?.sale_lock_operation_key === lock.operationKey) {
      renewed = { updated: 1, recovered_ambiguous_renewal: true };
    } else {
      throw renewError;
    }
  }
  if (renewed?.updated !== 1) {
    throw new SaleError('Se perdio el lock persistido del cobro', 'SALE_LOCK_LOST', 409, { retryable: true });
  }
  lock.lockAt = heartbeat;
}

async function releaseCommerceLock(anchor, orgId, lock) {
  if (!lock) return;
  const released = await anchor.entity.updateMany({
    id: anchor.record.id,
    organization_id: orgId,
    sale_lock_token: lock.token,
    sale_lock_operation_key: lock.operationKey,
  }, {
    $unset: {
      sale_lock_token: '',
      sale_lock_operation_key: '',
      sale_lock_at: '',
    },
  });
  if (released?.updated !== 1) {
    console.warn(`[createSale] El lock ${lock.token} ya no pertenece a este intento`);
  }
}

async function findOperationSales(base44, orgId, operationKey, ventaData) {
  const canonical = await base44.asServiceRole.entities.Venta.filter({
    organization_id: orgId,
    idempotency_key: operationKey,
  }, '-created_date', 10);
  if (canonical?.length) return canonical;

  // Adopcion segura de ventas anteriores a TRP-MVP-003.
  if (!ventaData.referencia_ot_id) return [];
  const legacy = await base44.asServiceRole.entities.Venta.filter({
    organization_id: orgId,
    referencia_ot_id: ventaData.referencia_ot_id,
    tipo_concepto: ventaData.tipo_concepto,
  }, '-created_date', 10);
  return (legacy || []).filter(sale => sale.estado !== 'anulada' && sale.estado !== 'borrador');
}

async function legacySaleMatchesRequest(base44, sale, input) {
  const headerMatches = sale.branch_id === input.ventaData.branch_id
    && (sale.cliente_id || null) === input.ventaData.cliente_id
    && sale.tipo_concepto === input.ventaData.tipo_concepto
    && (sale.referencia_ot_id || null) === input.ventaData.referencia_ot_id
    && (sale.cotizacion_id || null) === input.ventaData.cotizacion_id
    && sale.metodo_pago === input.ventaData.metodo_pago
    && Number(sale.total) === input.ventaData.total
    && Number(sale.subtotal) === input.ventaData.subtotal
    && Number(sale.impuesto || 0) === input.ventaData.impuesto
    && Number(sale.descuento_total || 0) === input.ventaData.descuento_total;
  if (!headerMatches) return false;

  const persisted = await base44.asServiceRole.entities.VentaItem.filter({ venta_id: sale.id }, 'created_date', 500);
  const normalizeItems = items => items.map(item => ({
    tipo: item.tipo,
    referencia_id: item.referencia_id || null,
    descripcion: String(item.descripcion || '').trim(),
    cantidad: Number(item.cantidad),
    precio_unitario: Number(item.precio_unitario),
    subtotal: Number(item.subtotal),
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return JSON.stringify(normalizeItems(persisted || [])) === JSON.stringify(normalizeItems(input.items));
}

async function assertFingerprint(base44, sale, requestFingerprint, operationKey, input) {
  if (sale.request_fingerprint && sale.request_fingerprint !== requestFingerprint) {
    throw new SaleError(
      'La misma operacion comercial fue reenviada con un payload diferente',
      'SALE_IDEMPOTENCY_CONFLICT',
      409
    );
  }
  if (!sale.request_fingerprint || sale.idempotency_key !== operationKey) {
    if (!sale.request_fingerprint && !await legacySaleMatchesRequest(base44, sale, input)) {
      throw new SaleError(
        'La venta legacy encontrada no coincide con el payload del cobro',
        'SALE_IDEMPOTENCY_CONFLICT',
        409
      );
    }
    const adopted = await base44.asServiceRole.entities.Venta.updateMany({
      id: sale.id,
      organization_id: sale.organization_id,
      $or: [
        { request_fingerprint: { $exists: false } },
        { request_fingerprint: null },
        { request_fingerprint: requestFingerprint },
      ],
    }, { $set: { request_fingerprint: requestFingerprint, idempotency_key: operationKey } });
    if (adopted?.updated !== 1) {
      const reconciled = await findOne(base44.asServiceRole.entities.Venta, { id: sale.id });
      if (reconciled?.request_fingerprint !== requestFingerprint) {
        throw new SaleError('Conflicto al adoptar la operacion existente', 'SALE_IDEMPOTENCY_CONFLICT', 409);
      }
    }
  }
}

function aggregateProducts(items) {
  const grouped = new Map();
  for (const item of items) {
    if (item.tipo !== 'producto') continue;
    const current = grouped.get(item.referencia_id) || { cantidad: 0, descripcion: item.descripcion };
    current.cantidad += item.cantidad;
    grouped.set(item.referencia_id, current);
  }
  return [...grouped.entries()]
    .map(([inventarioId, data]) => ({ inventarioId, ...data }))
    .sort((left, right) => left.inventarioId.localeCompare(right.inventarioId));
}

async function buildInventoryPlans(base44, orgId, sale, operationKey, items) {
  const plans = [];
  for (const product of aggregateProducts(items)) {
    const invItem = await findOne(base44.asServiceRole.entities.Inventario, {
      id: product.inventarioId,
      organization_id: orgId,
      branch_id: sale.branch_id,
    });
    if (!invItem) {
      throw new SaleError(
        `Producto "${product.descripcion}" no encontrado en inventario`,
        'SALE_INVENTORY_NOT_FOUND'
      );
    }

    let permiteStock = true;
    if (invItem.categoria_id) {
      const category = await findOne(base44.asServiceRole.entities.CategoriaInventario, {
        id: invItem.categoria_id,
        organization_id: orgId,
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
        state: { $in: ['RESERVED', 'CONSUMED'] },
      }, '-created_date', 2);
      if ((reservations || []).length > 1) {
        throw new SaleError('Existen reservas activas duplicadas para el producto', 'SALE_INVENTORY_RESERVATION_DUPLICATE', 409);
      }
      reservation = reservations?.[0] || null;
      if (reservation && Number(reservation.quantity) !== product.cantidad) {
        throw new SaleError('La cantidad facturada no coincide con la reserva de la OT', 'SALE_INVENTORY_RESERVATION_QUANTITY_MISMATCH', 409);
      }
    }
    const movementType = reservation?.state === 'CONSUMED'
      ? null
      : (reservation?.state === 'RESERVED' ? 'CONSUME' : 'SALE');
    const currentStock = Number(invItem.cantidad_disponible || 0);
    if (permiteStock && movementType === 'SALE' && product.cantidad > currentStock) {
      throw new SaleError(
        `Stock insuficiente para "${invItem.nombre}": disponible ${currentStock}, solicitado ${product.cantidad}`,
        'SALE_STOCK_INSUFFICIENT'
      );
    }
    plans.push({
      invItem,
      cantidad: product.cantidad,
      permiteStock,
      movementType,
      reservation,
    });
  }
  return plans;
}

async function createOrRecoverSale(base44, context) {
  const { orgId, user, input, operationKey, requestFingerprint } = context;
  const existingSales = await findOperationSales(base44, orgId, operationKey, input.ventaData);
  if (existingSales.length > 1) {
    throw new SaleError(
      'Existen multiples ventas activas para la misma operacion. Requiere revision.',
      'SALE_DUPLICATE_EXISTING',
      409,
      { details: { sale_ids: existingSales.map(sale => sale.id) } }
    );
  }

  let sale = existingSales[0] || null;
  let created = false;
  let preload = false;
  if (sale) {
    await assertFingerprint(base44, sale, requestFingerprint, operationKey, input);
    sale = await findOne(base44.asServiceRole.entities.Venta, { id: sale.id, organization_id: orgId });
    return { sale, created, preload, recovered: true };
  }

  const saleData = {
    organization_id: orgId,
    branch_id: input.ventaData.branch_id,
    cliente_id: input.ventaData.cliente_id,
    origen_venta: input.ventaData.origen_venta,
    origen_detalle: input.ventaData.cotizacion_id ? 'DESDE_COTIZACION' : (input.ventaData.referencia_ot_id ? 'DESDE_OT' : 'POS_DIRECTO'),
    tipo_concepto: input.ventaData.tipo_concepto,
    referencia_ot_id: input.ventaData.referencia_ot_id,
    cotizacion_id: input.ventaData.cotizacion_id,
    total: input.ventaData.total,
    subtotal: input.ventaData.subtotal,
    impuesto: input.ventaData.impuesto,
    descuento_total: input.ventaData.descuento_total,
    metodo_pago: input.ventaData.metodo_pago,
    estado: 'procesando',
    created_by_user_id: user.id,
    idempotency_key: operationKey,
    request_fingerprint: requestFingerprint,
    inventory_commit_status: 'PENDING',
    post_sale_status: 'PENDING',
  };

  if (input.ventaPreloadId) {
    const preloadSale = await findOne(base44.asServiceRole.entities.Venta, {
      id: input.ventaPreloadId,
      organization_id: orgId,
    });
    if (!preloadSale) throw new SaleError('Venta pre-cargada no encontrada', 'SALE_PRELOAD_NOT_FOUND', 404);
    if (preloadSale.estado !== 'borrador') {
      throw new SaleError(`Venta pre-cargada en estado ${preloadSale.estado}`, 'SALE_PRELOAD_ALREADY_PROCESSED', 409);
    }
    let claimed;
    try {
      claimed = await base44.asServiceRole.entities.Venta.updateMany({
        id: preloadSale.id,
        organization_id: orgId,
        estado: 'borrador',
      }, { $set: saleData });
    } catch (claimError) {
      const reconciled = await findOne(base44.asServiceRole.entities.Venta, {
        id: preloadSale.id,
        organization_id: orgId,
      });
      if (reconciled?.estado === 'procesando'
        && reconciled?.request_fingerprint === requestFingerprint) {
        claimed = { updated: 1, recovered_ambiguous_preload_claim: true };
      } else {
        throw claimError;
      }
    }
    if (claimed?.updated !== 1) {
      throw new SaleError('La venta pre-cargada cambio durante el cobro', 'SALE_PRELOAD_CONCURRENT_UPDATE', 409);
    }
    sale = await findOne(base44.asServiceRole.entities.Venta, { id: preloadSale.id, organization_id: orgId });
    preload = true;
  } else {
    try {
      sale = await base44.asServiceRole.entities.Venta.create(saleData);
      created = true;
    } catch (createError) {
      const reconciled = await findOne(base44.asServiceRole.entities.Venta, {
        organization_id: orgId,
        idempotency_key: operationKey,
      });
      if (!reconciled) throw createError;
      await assertFingerprint(base44, reconciled, requestFingerprint, operationKey, input);
      sale = reconciled;
      created = true;
    }
  }
  if (!sale?.id) throw new SaleError('No se pudo reservar la venta', 'SALE_RESERVATION_FAILED', 500);
  return { sale, created, preload, recovered: false };
}

async function ensureSaleItems(base44, context, inventoryPlans, mutations) {
  const { orgId, input, sale } = context;
  const existing = await base44.asServiceRole.entities.VentaItem.filter({ venta_id: sale.id }, '-created_date', 500);

  // Los borradores historicos no tienen line_key. Se reemplazan una sola vez;
  // las lineas nuevas sobreviven a un retry de una operacion en procesamiento.
  for (const oldItem of (existing || []).filter(item => !item.line_key)) {
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
      costo_unitario_snapshot: oldItem.costo_unitario_snapshot || 0,
    });
  }

  const retained = (existing || []).filter(item => item.line_key);
  const lineOccurrences = new Map();
  for (const item of input.items) {
    const { _index, ...persistedItem } = item;
    const itemFingerprint = await fingerprint(persistedItem);
    const occurrence = lineOccurrences.get(itemFingerprint) || 0;
    lineOccurrences.set(itemFingerprint, occurrence + 1);
    const lineKey = `line_${itemFingerprint}_${occurrence}`;
    let itemRecord = retained.find(record => record.line_key === lineKey);
    if (!itemRecord) {
      const plan = inventoryPlans.find(candidate => candidate.invItem.id === item.referencia_id);
      const data = {
        organization_id: orgId,
        venta_id: sale.id,
        line_key: lineKey,
        ...persistedItem,
        costo_unitario_snapshot: item.tipo === 'producto' ? Number(plan?.invItem?.costo_unitario || 0) : 0,
      };
      try {
        itemRecord = await base44.asServiceRole.entities.VentaItem.create(data);
        mutations.createdItems.push(itemRecord);
      } catch (itemError) {
        itemRecord = await findOne(base44.asServiceRole.entities.VentaItem, {
          venta_id: sale.id,
          line_key: lineKey,
        });
        if (!itemRecord) throw itemError;
        mutations.createdItems.push(itemRecord);
      }
    }
  }
}

async function applyInventory(base44, context, plans, mutations) {
  const { orgId, user, sale, operationKey } = context;
  const movements = plans
    .filter(plan => plan.permiteStock && plan.movementType)
    .map(plan => ({
      inventoryId: plan.invItem.id,
      movementType: plan.movementType,
      quantity: plan.cantidad,
      reservationId: plan.reservation?.id || null,
      workOrderId: sale.referencia_ot_id || null,
      quoteId: sale.cotizacion_id || null,
    }));
  if (movements.length === 0) return;
  const inventoryOperationKey = `inventory:${operationKey}:${sale.inventory_attempt_key || sale.id}`;
  await executeInventoryCommand(base44, {
    organizationId: orgId,
    branchId: sale.branch_id,
    actorId: user.id || user.email,
    operationKey: inventoryOperationKey,
    referenceType: 'SALE',
    referenceId: sale.id,
    reason: `Venta ${sale.id}`,
    movements,
  });
  mutations.inventoryOperationKey = inventoryOperationKey;
}

async function convertQuote(base44, context) {
  const { orgId, user, input, sale } = context;
  if (!input.cotizacionOrigenId) return null;
  const quote = await findOne(base44.asServiceRole.entities.Cotizacion, {
    id: input.cotizacionOrigenId,
    organization_id: orgId,
  });
  if (!quote) throw new SaleError('Cotizacion origen no encontrada', 'SALE_QUOTE_NOT_FOUND', 404);
  if (quote.venta_id === sale.id && quote.estado_conversion === 'CONVERTIDA') return null;
  let updated;
  try {
    updated = await base44.asServiceRole.entities.Cotizacion.updateMany({
      id: quote.id,
      organization_id: orgId,
      estado: 'aprobada',
      decision_status: 'COMMITTED',
      $or: [
        { venta_id: { $exists: false } },
        { venta_id: null },
        { venta_id: sale.id },
      ],
    }, {
      $set: {
        estado_conversion: 'CONVERTIDA',
        convertida_at: nowIso(),
        convertida_por: user.id,
        venta_id: sale.id,
      },
    });
  } catch (quoteError) {
    const reconciled = await findOne(base44.asServiceRole.entities.Cotizacion, {
      id: quote.id,
      organization_id: orgId,
    });
    if (reconciled?.venta_id === sale.id && reconciled?.estado_conversion === 'CONVERTIDA') {
      updated = { updated: 1, recovered_ambiguous_conversion: true };
    } else {
      throw quoteError;
    }
  }
  if (updated?.updated !== 1) {
    throw new SaleError('La cotizacion ya fue convertida por otra venta', 'SALE_QUOTE_ALREADY_CONVERTED', 409);
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
      estado: 'procesando',
      request_fingerprint: requestFingerprint,
    }, {
      $set: {
        estado: 'pagada',
        inventory_commit_status: 'COMMITTED',
        inventory_committed_at: paidAt,
        post_sale_status: 'PENDING',
      },
    });
  } catch (commitError) {
    const reconciled = await findOne(base44.asServiceRole.entities.Venta, { id: sale.id, organization_id: orgId });
    if (reconciled?.estado === 'pagada' && reconciled?.request_fingerprint === requestFingerprint) return reconciled;
    throw commitError;
  }
  if (result?.updated !== 1) {
    const reconciled = await findOne(base44.asServiceRole.entities.Venta, { id: sale.id, organization_id: orgId });
    if (reconciled?.estado === 'pagada' && reconciled?.request_fingerprint === requestFingerprint) return reconciled;
    throw new SaleError('No se pudo confirmar atomicamente la venta', 'SALE_COMMIT_CONFLICT', 409);
  }
  return findOne(base44.asServiceRole.entities.Venta, { id: sale.id, organization_id: orgId });
}

async function runPostSale(base44, orgId, sale) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = unwrapFunctionResult(await base44.functions.invoke('processPostSaleActions', { sale_id: sale.id }));
      if (result?.success === false) throw new Error(result.error || 'Post-procesamiento rechazado');
      await base44.asServiceRole.entities.Venta.updateMany({
        id: sale.id,
        organization_id: orgId,
        estado: 'pagada',
      }, {
        $set: { post_sale_status: 'COMPLETED', post_sale_completed_at: nowIso() },
        $unset: { post_sale_error: '' },
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
    estado: 'pagada',
  }, { $set: { post_sale_status: 'PENDING', post_sale_error: String(lastError.message).slice(0, 500) } }).catch(() => null);
  return { completed: false, error: lastError.message, attempts: 3 };
}

async function loadSaleWithItems(base44, orgId, saleId) {
  const sale = await findOne(base44.asServiceRole.entities.Venta, { id: saleId, organization_id: orgId });
  const items = await base44.asServiceRole.entities.VentaItem.filter({ venta_id: saleId }, 'created_date', 500);
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
        reason: `Rollback de venta ${sale.id}`,
      });
    } catch (error) { errors.push(`inventory_reversal:${error.message}`); }
  }

  for (const item of [...mutations.createdItems].reverse()) {
    try { await base44.asServiceRole.entities.VentaItem.delete(item.id); }
    catch (error) { errors.push(`item:${item.id}:${error.message}`); }
  }

  for (const oldItem of mutations.deletedPreloadItems) {
    try { await base44.asServiceRole.entities.VentaItem.create(oldItem); }
    catch (error) { errors.push(`item_restore:${oldItem.descripcion}:${error.message}`); }
  }

  if (mutations.quoteSnapshot) {
    try {
      await base44.asServiceRole.entities.Cotizacion.updateMany({
        id: mutations.quoteSnapshot.id,
        organization_id: orgId,
        venta_id: sale.id,
      }, {
        $set: {
          estado_conversion: mutations.quoteSnapshot.estado_conversion || 'PENDIENTE',
          venta_id: mutations.quoteSnapshot.venta_id || null,
          convertida_at: mutations.quoteSnapshot.convertida_at || null,
          convertida_por: mutations.quoteSnapshot.convertida_por || null,
        },
      });
    } catch (error) { errors.push(`quote:${mutations.quoteSnapshot.id}:${error.message}`); }
  }

  if (mutations.saleCreated && errors.length === 0) {
    try { await base44.asServiceRole.entities.Venta.delete(sale.id); }
    catch (error) { errors.push(`sale:${sale.id}:${error.message}`); }
  } else if (mutations.salePreload && errors.length === 0) {
    try {
      await base44.asServiceRole.entities.Venta.updateMany({ id: sale.id, organization_id: orgId }, {
        $set: { estado: 'borrador', inventory_attempt_key: crypto.randomUUID() },
        $unset: {
          idempotency_key: '', request_fingerprint: '', inventory_commit_status: '',
          post_sale_status: '',
        },
      });
    } catch (error) { errors.push(`preload:${sale.id}:${error.message}`); }
  }

  if (errors.length > 0 || mutations.resumedExisting) {
    await base44.asServiceRole.entities.Venta.updateMany({ id: sale.id, organization_id: orgId }, {
      $set: {
        estado: 'inconsistente',
        rollback_status: errors.length ? 'partial' : 'failed',
        rollback_error: `${originalError.message} | ${errors.join(' | ')}`.slice(0, 500),
      },
    }).catch(() => null);
  }

  return errors;
}

Deno.serve(async req => {
  if (req.method !== 'POST') return Response.json({ error: 'Metodo no permitido' }, { status: 405 });

  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });
  const authorization = await resolveAuthorizedContext(base44, user, {
    allowedRoles: ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES'],
  });
  if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status });
  const orgId = authorization.organizationId;

  let anchor = null;
  let lock = null;
  try {
    const body = await req.json();
    const input = normalizeInput(body);
    const branchScope = getCanonicalBranchScope(authorization);
    if (!branchScope.ok) throw new SaleError(branchScope.error, branchScope.code || 'SALE_BRANCH_SCOPE_INVALID', branchScope.status);
    const branchCheck = validateRequestedBranch(branchScope, input.ventaData.branch_id);
    if (!branchCheck.ok) throw new SaleError(branchCheck.error, branchCheck.code, branchCheck.status);
    if (!branchScope.organizationWide) input.ventaData.branch_id = branchScope.branchId;
    await resolveAuthoritativeCommercialInput(base44, orgId, input);
    try {
      await assertActiveBranch(base44, orgId, input.ventaData.branch_id, {
        code: 'SALE_BRANCH_NOT_AVAILABLE',
        status: 409,
        message: 'La sucursal no existe o esta inactiva; no admite nuevas ventas.',
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
      base44, orgId, user, input, ...identity,
    });
    let sale = reservation.sale;

    if (sale.estado === 'pagada') {
      await ensureSaleAudit(base44, authorization, user, sale, identity.operationKey, true);
      const postSale = await runPostSale(base44, orgId, sale);
      const recovered = await loadSaleWithItems(base44, orgId, sale.id);
      return Response.json({
        success: true,
        data: recovered,
        idempotent: true,
        recovered: true,
        post_sale_pending: !postSale.completed,
      }, { status: 200 });
    }
    if (sale.estado === 'inconsistente') {
      throw new SaleError(
        `La venta ${sale.id} requiere revision manual antes de continuar`,
        'SALE_INCONSISTENT',
        409
      );
    }
    if (sale.estado !== 'procesando') {
      throw new SaleError(`Estado de venta no recuperable: ${sale.estado}`, 'SALE_STATE_INVALID', 409);
    }

    const context = {
      base44, orgId, user, input, sale,
      operationKey: identity.operationKey,
      requestFingerprint: identity.requestFingerprint,
    };
    const mutations = {
      saleCreated: reservation.created,
      salePreload: reservation.preload,
      resumedExisting: reservation.recovered,
      createdItems: [],
      deletedPreloadItems: [],
      inventoryOperationKey: null,
      quoteSnapshot: null,
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
        data: committed,
        idempotent: reservation.recovered,
        recovered: reservation.recovered,
        post_sale_pending: !postSale.completed,
      }, { status: reservation.recovered ? 200 : 201 });
    } catch (error) {
      const current = await findOne(base44.asServiceRole.entities.Venta, { id: sale.id, organization_id: orgId });
      if (current?.estado === 'pagada' && current?.request_fingerprint === identity.requestFingerprint) {
        await ensureSaleAudit(base44, authorization, user, current, identity.operationKey, true);
        const postSale = await runPostSale(base44, orgId, current);
        const committed = await loadSaleWithItems(base44, orgId, current.id);
        return Response.json({
          success: true,
          data: committed,
          idempotent: true,
          recovered: true,
          post_sale_pending: !postSale.completed,
        }, { status: 200 });
      }
      const rollbackErrors = await rollback(base44, context, mutations, error);
      if (rollbackErrors.length) {
        throw new SaleError(
          'El cobro fallo y su compensacion requiere revision manual',
          'SALE_ROLLBACK_INCOMPLETE',
          500,
          { details: { rollback_errors: rollbackErrors } }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error('[createSale]', error.code || 'SALE_INTERNAL_ERROR', error.message);
    return errorResponse(error);
  } finally {
    if (anchor && lock) {
      try { await releaseCommerceLock(anchor, orgId, lock); }
      catch (releaseError) { console.error('[createSale] No se pudo liberar el lock:', releaseError.message); }
    }
  }
});
