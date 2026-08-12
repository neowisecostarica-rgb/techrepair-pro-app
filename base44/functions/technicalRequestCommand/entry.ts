import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { authorizeRecordBranch } from '../_shared/operationalAuthorization.ts';
import { executeInventoryCommand } from '../_shared/inventoryMutationService.ts';
import { appendAuditEvent } from '../_shared/auditEvent.ts';

const MODES = new Set(['EXISTING_STOCK', 'NEW_SPEND']);
const TYPES = new Set(['repuesto', 'suministro', 'herramienta']);

function fail(error, status = 400, code = 'TECHNICAL_REQUEST_INVALID', details = {}) {
  return Response.json({ error, code, ...details }, { status });
}

async function one(entity, query) {
  const rows = await entity.filter(query, '-created_date', 2);
  if (rows?.length > 1) throw Object.assign(new Error('Estado duplicado'), { code: 'TECHNICAL_REQUEST_AMBIGUOUS', status: 409 });
  return rows?.[0] || null;
}

function project(request) {
  return {
    id: request.id,
    organization_id: request.organization_id,
    branch_id: request.branch_id,
    orden_trabajo_id: request.orden_trabajo_id,
    tecnico_id: request.tecnico_id,
    requester_user_id: request.requester_user_id || request.tecnico_id,
    tipo: request.tipo,
    descripcion: request.descripcion,
    cantidad: request.cantidad,
    estado: request.estado,
    fulfillment_mode: request.fulfillment_mode,
    inventario_id: request.inventario_id || null,
    motivo_rechazo: request.motivo_rechazo || null,
    aprobado_por: request.approver_user_id || request.aprobado_por || null,
    aprobado_at: request.aprobado_at || null,
    entregado_por: request.fulfiller_user_id || request.entregado_por || null,
    entregado_at: request.fulfilled_at || request.entregado_at || null,
    inventory_reservation_id: request.inventory_reservation_id || null,
    inventory_movement_id: request.inventory_movement_id || null,
    inventory_operation_key: request.inventory_operation_key || null,
    created_date: request.created_date || null,
  };
}

function requireCapability(authorization, capability) {
  if (!authorization.capabilities.includes(capability)) {
    throw Object.assign(new Error('La capacidad requerida no esta autorizada'), { code: 'CAPABILITY_DENIED', status: 403 });
  }
}

async function audit(base44, authorization, user, request, eventType, policyId, correlationId, priorState, newState, metadata = {}) {
  return appendAuditEvent(base44, {
    eventType,
    principalClass: authorization.principalClass,
    actorUserId: user.id,
    actorPrimaryRole: authorization.persistedRole,
    effectiveTechnicianUserId: request.tecnico_id === user.id ? user.id : null,
    organizationId: authorization.organizationId,
    branchId: request.branch_id,
    resourceType: 'SolicitudTecnica',
    resourceId: request.id,
    commandPolicyId: policyId,
    correlationId,
    operationKey: metadata.inventory_operation_key || null,
    priorState,
    newState,
    custodySnapshot: { orden_trabajo_id: request.orden_trabajo_id, requester_user_id: request.requester_user_id || request.tecnico_id },
    metadata,
  });
}

async function loadRequest(base44, organizationId, id) {
  return one(base44.asServiceRole.entities.SolicitudTecnica, { id, organization_id: organizationId });
}

async function loadWorkOrder(base44, organizationId, id) {
  return one(base44.asServiceRole.entities.OrdenTrabajo, { id, organization_id: organizationId });
}

async function assertRequestScope(authorization, request) {
  const scope = authorizeRecordBranch(authorization, request.branch_id);
  if (!scope.ok) throw Object.assign(new Error(scope.error), { code: scope.code, status: scope.status });
}

async function mutateState(base44, authorization, user, request, { from, to, set, eventType, policyId, correlationId }) {
  if (!from.includes(request.estado)) throw Object.assign(new Error(`Transicion ${request.estado} -> ${to} no permitida`), { code: 'TECHNICAL_REQUEST_STATE_CONFLICT', status: 409 });
  const result = await base44.asServiceRole.entities.SolicitudTecnica.updateMany({
    id: request.id, organization_id: authorization.organizationId, estado: request.estado,
  }, { $set: { estado: to, ...set } });
  const current = await loadRequest(base44, authorization.organizationId, request.id);
  if (result?.updated !== 1 && current?.estado !== to) throw Object.assign(new Error('La solicitud cambio concurrentemente'), { code: 'TECHNICAL_REQUEST_CAS_CONFLICT', status: 409 });
  try {
    await audit(base44, authorization, user, current, eventType, policyId, correlationId, { estado: request.estado }, { estado: to });
  } catch (error) {
    await base44.asServiceRole.entities.SolicitudTecnica.updateMany({ id: request.id, organization_id: authorization.organizationId, estado: to }, { $set: { estado: request.estado } }).catch(() => null);
    throw error;
  }
  return current;
}

async function fulfill(base44, authorization, user, request, body) {
  requireCapability(authorization, 'INVENTORY_OPERATIONS');
  await assertRequestScope(authorization, request);
  const expectedState = request.fulfillment_mode === 'EXISTING_STOCK' ? 'requested' : 'approved';
  const operationKey = typeof body.operation_key === 'string' ? body.operation_key.trim().slice(0, 240) : '';
  const inventoryId = String(request.inventario_id || body.inventory_id || '').trim();
  if (!operationKey || !inventoryId) throw Object.assign(new Error('operation_key e inventory_id son requeridos'), { code: 'TECHNICAL_REQUEST_FULFILL_CONTEXT_REQUIRED', status: 400 });
  if (request.estado === 'fulfilled') {
    if (request.inventory_operation_key !== operationKey) throw Object.assign(new Error('La solicitud ya fue entregada por otra operacion'), { code: 'TECHNICAL_REQUEST_ALREADY_FULFILLED', status: 409 });
    await audit(base44, authorization, user, request, 'TECHNICAL_REQUEST_FULFILLED', 'CP-REQ-003', operationKey, { estado: expectedState }, { estado: 'fulfilled' }, { inventory_operation_key: operationKey, reconciled: true });
    return { request, idempotent: true };
  }
  if (request.estado !== expectedState) throw Object.assign(new Error(`La solicitud ${request.fulfillment_mode} debe estar en ${expectedState}`), { code: 'TECHNICAL_REQUEST_STATE_CONFLICT', status: 409 });
  if (request.inventory_operation_key && request.inventory_operation_key !== operationKey) throw Object.assign(new Error('Otra operacion reclamo la solicitud'), { code: 'TECHNICAL_REQUEST_FULFILLMENT_CLAIMED', status: 409 });

  const inventory = await one(base44.asServiceRole.entities.Inventario, { id: inventoryId, organization_id: authorization.organizationId, branch_id: request.branch_id });
  if (!inventory) throw Object.assign(new Error('Inventario no encontrado en la sucursal'), { code: 'TECHNICAL_REQUEST_INVENTORY_NOT_FOUND', status: 404 });
  const now = new Date().toISOString();
  if (!request.inventory_operation_key) {
    await base44.asServiceRole.entities.SolicitudTecnica.updateMany({
      id: request.id, organization_id: authorization.organizationId, estado: expectedState,
      inventory_operation_key: request.inventory_operation_key || null,
    }, { $set: {
      inventory_operation_key: operationKey,
      fulfillment_status: 'PENDING',
      fulfillment_claimed_at: now,
      fulfillment_error: null,
      fulfiller_user_id: user.id,
      inventario_id: inventoryId,
    } });
    request = await loadRequest(base44, authorization.organizationId, request.id);
    if (request?.inventory_operation_key !== operationKey) throw Object.assign(new Error('Otra operacion reclamo la solicitud'), { code: 'TECHNICAL_REQUEST_FULFILLMENT_CLAIMED', status: 409 });
  }

  let reserveResult;
  let consumeResult;
  try {
    reserveResult = await executeInventoryCommand(base44, {
      organizationId: authorization.organizationId,
      branchId: request.branch_id,
      actorId: user.id,
      operationKey: `${operationKey}:reserve`,
      referenceType: 'TECHNICAL_REQUEST',
      referenceId: request.id,
      reason: `Reserva para solicitud tecnica ${request.id}`,
      movements: [{ inventoryId, movementType: 'RESERVE', quantity: Number(request.cantidad), workOrderId: request.orden_trabajo_id }],
    });
    const reservationId = reserveResult.results?.[0]?.reservation_id;
    if (!reservationId) throw Object.assign(new Error('La reserva no produjo referencia durable'), { code: 'TECHNICAL_REQUEST_RESERVATION_REFERENCE_MISSING', status: 500 });
    consumeResult = await executeInventoryCommand(base44, {
      organizationId: authorization.organizationId,
      branchId: request.branch_id,
      actorId: user.id,
      operationKey: `${operationKey}:consume`,
      referenceType: 'TECHNICAL_REQUEST',
      referenceId: request.id,
      reason: `Entrega para solicitud tecnica ${request.id}`,
      movements: [{ inventoryId, movementType: 'CONSUME', quantity: Number(request.cantidad), reservationId, workOrderId: request.orden_trabajo_id }],
    });
    const movementId = consumeResult.results?.[0]?.movement_id;
    const update = await base44.asServiceRole.entities.SolicitudTecnica.updateMany({
      id: request.id, organization_id: authorization.organizationId, estado: expectedState,
      inventory_operation_key: operationKey, fulfillment_status: 'PENDING',
    }, { $set: {
      estado: 'fulfilled',
      fulfillment_status: 'COMMITTED',
      inventory_reservation_id: reservationId,
      inventory_movement_id: movementId,
      fulfiller_user_id: user.id,
      entregado_por: user.id,
      fulfilled_at: now,
      entregado_at: now,
      fulfillment_error: null,
    } });
    const committed = await loadRequest(base44, authorization.organizationId, request.id);
    if (update?.updated !== 1 && !(committed?.estado === 'fulfilled' && committed?.inventory_operation_key === operationKey)) {
      throw Object.assign(new Error('Inventario comprometido; reintente con la misma operation_key para reconciliar'), { code: 'TECHNICAL_REQUEST_RECONCILIATION_REQUIRED', status: 500 });
    }
    await audit(base44, authorization, user, committed, 'TECHNICAL_REQUEST_FULFILLED', 'CP-REQ-003', operationKey, { estado: expectedState }, { estado: 'fulfilled' }, {
      inventory_operation_key: operationKey,
      inventory_id: inventoryId,
      inventory_reservation_id: reservationId,
      inventory_movement_id: movementId,
      reserve_idempotent: reserveResult.idempotent,
      consume_idempotent: consumeResult.idempotent,
    });
    return { request: committed, idempotent: Boolean(reserveResult.idempotent || consumeResult.idempotent) };
  } catch (error) {
    await base44.asServiceRole.entities.SolicitudTecnica.updateMany({ id: request.id, organization_id: authorization.organizationId, inventory_operation_key: operationKey }, { $set: { fulfillment_error: String(error.message || error).slice(0, 500) } }).catch(() => null);
    throw error;
  }
}

Deno.serve(async req => {
  try {
    if (req.method !== 'POST') return fail('Metodo no permitido', 405, 'METHOD_NOT_ALLOWED');
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return fail('No autenticado', 401, 'AUTH_REQUIRED');
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '').trim().toUpperCase();
    const authorization = await resolveAuthorizedContext(base44, user);
    if (!authorization.ok) return fail(authorization.error, authorization.status, authorization.code);

    if (action === 'LIST_WORK_ORDER') {
      requireCapability(authorization, 'TECHNICAL_WORK');
      const ot = await loadWorkOrder(base44, authorization.organizationId, body.orden_trabajo_id);
      if (!ot) return fail('Orden no encontrada', 404, 'WORK_ORDER_NOT_FOUND');
      const scope = authorizeRecordBranch(authorization, ot.branch_id);
      if (!scope.ok) return fail(scope.error, scope.status, scope.code);
      if (authorization.normalizedRole === 'TECHNICIAN' && ot.tecnico_asignado_id !== user.id) return fail('Orden no asignada', 403, 'EFFECTIVE_TECHNICIAN_REQUIRED');
      const rows = await base44.asServiceRole.entities.SolicitudTecnica.filter({ organization_id: authorization.organizationId, orden_trabajo_id: ot.id }, '-created_date', 500);
      return Response.json({ requests: (rows || []).map(project) });
    }

    if (action === 'LIST_PENDING') {
      if (!authorization.capabilities.includes('INVENTORY_OPERATIONS') && !authorization.capabilities.includes('BRANCH_ADMINISTRATION') && !authorization.capabilities.includes('ORG_ADMINISTRATION')) return fail('No autorizado', 403, 'CAPABILITY_DENIED');
      const filter = { organization_id: authorization.organizationId, estado: { $in: ['requested', 'approved'] } };
      if (authorization.scope === 'SINGLE_BRANCH') filter.branch_id = authorization.branchId;
      const rows = await base44.asServiceRole.entities.SolicitudTecnica.filter(filter, '-created_date', 500);
      return Response.json({ requests: (rows || []).map(project) });
    }

    if (action === 'CREATE_DRAFT') {
      requireCapability(authorization, 'TECHNICAL_WORK');
      if (!MODES.has(body.fulfillment_mode) || !TYPES.has(body.tipo)) return fail('Tipo o fulfillment_mode invalido', 422, 'TECHNICAL_REQUEST_CLASSIFICATION_REQUIRED');
      const quantity = Number(body.cantidad);
      if (!Number.isFinite(quantity) || quantity <= 0 || !String(body.descripcion || '').trim()) return fail('Descripcion y cantidad valida son requeridas', 422);
      if (body.fulfillment_mode === 'EXISTING_STOCK' && !body.inventory_id) return fail('inventory_id es requerido para EXISTING_STOCK', 422, 'TECHNICAL_REQUEST_INVENTORY_REQUIRED');
      const ot = await loadWorkOrder(base44, authorization.organizationId, body.orden_trabajo_id);
      if (!ot) return fail('Orden no encontrada', 404, 'WORK_ORDER_NOT_FOUND');
      const scope = authorizeRecordBranch(authorization, ot.branch_id);
      if (!scope.ok) return fail(scope.error, scope.status, scope.code);
      if (ot.tecnico_asignado_id !== user.id) return fail('Debes asumir custodia tecnica antes de solicitar', 403, 'EFFECTIVE_TECHNICIAN_REQUIRED');
      const request = await base44.asServiceRole.entities.SolicitudTecnica.create({
        organization_id: authorization.organizationId,
        branch_id: ot.branch_id,
        orden_trabajo_id: ot.id,
        tecnico_id: user.id,
        requester_user_id: user.id,
        tipo: body.tipo,
        descripcion: String(body.descripcion).trim().slice(0, 500),
        cantidad: quantity,
        estado: 'draft',
        fulfillment_mode: body.fulfillment_mode,
        inventario_id: body.inventory_id || null,
      });
      const correlationId = body.correlation_id || crypto.randomUUID();
      try { await audit(base44, authorization, user, request, 'TECHNICAL_REQUEST_DRAFTED', 'CP-REQ-001', correlationId, {}, { estado: 'draft' }); }
      catch (error) { await base44.asServiceRole.entities.SolicitudTecnica.delete(request.id).catch(() => null); throw error; }
      return Response.json({ request: project(request) });
    }

    const request = await loadRequest(base44, authorization.organizationId, body.request_id);
    if (!request) return fail('Solicitud no encontrada', 404, 'TECHNICAL_REQUEST_NOT_FOUND');
    await assertRequestScope(authorization, request);
    const correlationId = body.correlation_id || crypto.randomUUID();
    if (action === 'SUBMIT') {
      requireCapability(authorization, 'TECHNICAL_WORK');
      if ((request.requester_user_id || request.tecnico_id) !== user.id || request.tecnico_id !== user.id) return fail('Solo el solicitante tecnico puede enviar', 403, 'EFFECTIVE_TECHNICIAN_REQUIRED');
      const current = await mutateState(base44, authorization, user, request, { from: ['draft'], to: 'requested', set: { requested_at: new Date().toISOString() }, eventType: 'TECHNICAL_REQUEST_SUBMITTED', policyId: 'CP-REQ-001', correlationId });
      return Response.json({ request: project(current) });
    }
    if (action === 'APPROVE') {
      if (!authorization.capabilities.includes('BRANCH_ADMINISTRATION') && !authorization.capabilities.includes('ORG_ADMINISTRATION')) return fail('Solo un administrador puede aprobar gasto nuevo', 403, 'CAPABILITY_DENIED');
      if (request.fulfillment_mode !== 'NEW_SPEND') return fail('EXISTING_STOCK no requiere aprobacion', 409, 'TECHNICAL_REQUEST_APPROVAL_NOT_REQUIRED');
      const now = new Date().toISOString();
      const current = await mutateState(base44, authorization, user, request, { from: ['requested'], to: 'approved', set: { approver_user_id: user.id, aprobado_por: user.id, aprobado_at: now }, eventType: 'TECHNICAL_REQUEST_APPROVED', policyId: 'CP-REQ-002', correlationId });
      return Response.json({ request: project(current) });
    }
    if (action === 'REJECT') {
      if (!authorization.capabilities.includes('BRANCH_ADMINISTRATION') && !authorization.capabilities.includes('ORG_ADMINISTRATION')) return fail('Solo un administrador puede rechazar', 403, 'CAPABILITY_DENIED');
      const reason = String(body.reason || '').trim().slice(0, 500);
      if (!reason) return fail('Motivo requerido', 422, 'TECHNICAL_REQUEST_REJECTION_REASON_REQUIRED');
      const now = new Date().toISOString();
      const current = await mutateState(base44, authorization, user, request, { from: ['requested', 'approved'], to: 'rejected', set: { motivo_rechazo: reason, rejected_by_user_id: user.id, rejected_at: now }, eventType: 'TECHNICAL_REQUEST_REJECTED', policyId: 'CP-REQ-002', correlationId });
      return Response.json({ request: project(current) });
    }
    if (action === 'FULFILL') {
      const result = await fulfill(base44, authorization, user, request, body);
      return Response.json({ request: project(result.request), idempotent: result.idempotent });
    }
    return fail('Accion no soportada', 400, 'TECHNICAL_REQUEST_ACTION_INVALID');
  } catch (error) {
    return fail(error.message || 'No se pudo procesar la solicitud', error.status || 500, error.code || 'TECHNICAL_REQUEST_FAILED', { retryable: (error.status || 500) >= 500 });
  }
});
