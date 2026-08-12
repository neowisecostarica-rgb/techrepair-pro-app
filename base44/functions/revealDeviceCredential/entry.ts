import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { authorizeRecordBranch } from '../_shared/operationalAuthorization.ts';
import { appendAuditEvent } from '../_shared/auditEvent.ts';

function jsonError(error, status, code) {
  return Response.json({ error, code }, { status });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonError('Metodo no permitido', 405, 'METHOD_NOT_ALLOWED');
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return jsonError('No autenticado', 401, 'AUTH_REQUIRED');
  const body = await req.json().catch(() => ({}));
  const workOrderId = typeof body.work_order_id === 'string' ? body.work_order_id.trim() : '';
  if (!workOrderId) return jsonError('work_order_id requerido', 400, 'WORK_ORDER_REQUIRED');

  const authorization = await resolveAuthorizedContext(base44, user);
  if (!authorization.ok) return jsonError(authorization.error, authorization.status, authorization.code);
  if (!authorization.capabilities.includes('TECHNICAL_WORK')) return jsonError('Trabajo tecnico no autorizado', 403, 'CAPABILITY_DENIED');
  const [workOrder] = await base44.asServiceRole.entities.OrdenTrabajo.filter({
    id: workOrderId,
    organization_id: authorization.organizationId,
  }, '-created_date', 1);
  if (!workOrder) return jsonError('Orden de trabajo no encontrada', 404, 'WORK_ORDER_NOT_FOUND');
  const scope = authorizeRecordBranch(authorization, workOrder.branch_id);
  if (!scope.ok) return jsonError(scope.error, scope.status, scope.code);
  if (workOrder.tecnico_asignado_id !== user.id) {
    return jsonError('Debes asumir custodia tecnica antes de revelar la credencial', 403, 'EFFECTIVE_TECHNICIAN_REQUIRED');
  }

  const correlationId = typeof body.correlation_id === 'string' && body.correlation_id.trim()
    ? body.correlation_id.trim().slice(0, 240)
    : crypto.randomUUID();
  await appendAuditEvent(base44, {
    eventType: 'DEVICE_CREDENTIAL_REVEALED',
    principalClass: authorization.principalClass,
    actorUserId: user.id,
    actorPrimaryRole: authorization.persistedRole,
    effectiveTechnicianUserId: user.id,
    organizationId: authorization.organizationId,
    branchId: workOrder.branch_id,
    resourceType: 'OrdenTrabajo',
    resourceId: workOrder.id,
    commandPolicyId: 'CP-TECH-001',
    correlationId,
    metadata: { projection: 'DEVICE_CREDENTIAL_REVEAL' },
  });
  return Response.json({
    projection: 'DEVICE_CREDENTIAL_REVEAL',
    work_order_id: workOrder.id,
    codigo_ot: workOrder.codigo_ot,
    contrasena_ingreso: workOrder.contrasena_ingreso || null,
  });
});

