import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { authorizeRecordBranch } from '../_shared/operationalAuthorization.ts';
import { projectWorkOrderAssignedTechnical, projectWorkOrderTeamAwareness } from '../_shared/dataProjections.ts';

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

  const [customers, equipment] = await Promise.all([
    base44.asServiceRole.entities.Cliente.filter({ id: workOrder.cliente_id, organization_id: authorization.organizationId }, '-created_date', 1),
    base44.asServiceRole.entities.Equipo.filter({ id: workOrder.equipo_id, organization_id: authorization.organizationId }, '-created_date', 1),
  ]);
  const isEffectiveTechnician = workOrder.tecnico_asignado_id === user.id;
  if (!isEffectiveTechnician) {
    return Response.json({
      projection: 'WORK_ORDER_TEAM_AWARENESS',
      work_order: projectWorkOrderTeamAwareness(workOrder, equipment?.[0]),
    });
  }

  const [evidence, tests, requests, activities] = await Promise.all([
    base44.asServiceRole.entities.DiagnosticoEvidencia.filter({ organization_id: authorization.organizationId, orden_trabajo_id: workOrder.id }, '-created_date', 500),
    base44.asServiceRole.entities.PruebaTecnica.filter({ organization_id: authorization.organizationId, orden_trabajo_id: workOrder.id }, '-created_date', 500),
    base44.asServiceRole.entities.SolicitudTecnica.filter({ organization_id: authorization.organizationId, orden_trabajo_id: workOrder.id }, '-created_date', 500),
    base44.asServiceRole.entities.ActividadTecnica.filter({ organization_id: authorization.organizationId, orden_trabajo_id: workOrder.id, soft_deleted: false }, '-created_date', 500),
  ]);
  return Response.json({
    projection: 'WORK_ORDER_ASSIGNED_TECHNICAL',
    work_order: projectWorkOrderAssignedTechnical(workOrder, customers?.[0], equipment?.[0], {
      technical_evidence_ids: (evidence || []).map(record => record.id),
      technical_test_ids: (tests || []).map(record => record.id),
      technical_request_ids: (requests || []).map(record => record.id),
      activity_segment_ids: (activities || []).map(record => record.id),
    }),
  });
});

