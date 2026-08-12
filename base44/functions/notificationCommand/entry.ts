import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { authorizeRecordBranch } from '../_shared/operationalAuthorization.ts';
import { appendAuditEvent } from '../_shared/auditEvent.ts';

const MAP = Object.freeze({
  TRANSITION_DIAGNOSTICADA: { role_target: 'SALES', tipo: 'importante', accion_sugerida: 'Preparar y enviar cotizacion', label: 'Diagnostico completado' },
  TRANSITION_APROBADA: { role_target: 'TECHNICIAN', tipo: 'critica', accion_sugerida: 'Continuar flujo tecnico autorizado', label: 'Cliente aprobo la reparacion', assigned: true },
  TRANSITION_FINALIZADA: { role_target: 'SALES', tipo: 'critica', accion_sugerida: 'Completar cobro y entrega', label: 'OT finalizada' },
  TRANSITION_ENTREGADA: { role_target: 'CUSTOMER_SERVICE', tipo: 'info', accion_sugerida: 'Seguimiento postventa', label: 'OT entregada' },
});

function fail(error, status, code) { return Response.json({ error, code }, { status }); }

Deno.serve(async req => {
  try {
    if (req.method !== 'POST') return fail('Metodo no permitido', 405, 'METHOD_NOT_ALLOWED');
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return fail('No autenticado', 401, 'AUTH_REQUIRED');
    const body = await req.json().catch(() => ({}));
    if (body.action !== 'MATERIALIZE_OT_EVENT' || !body.event_id) return fail('Evento requerido', 400, 'NOTIFICATION_EVENT_REQUIRED');
    const authorization = await resolveAuthorizedContext(base44, user);
    if (!authorization.ok) return fail(authorization.error, authorization.status, authorization.code);
    if (!authorization.capabilities.includes('ORG_ADMINISTRATION') && !authorization.capabilities.includes('BRANCH_ADMINISTRATION')) return fail('No autorizado para recuperar eventos workflow', 403, 'CAPABILITY_DENIED');
    const events = await base44.asServiceRole.entities.OTEvent.filter({ id: body.event_id, organization_id: authorization.organizationId }, '-created_date', 2);
    if (events?.length !== 1) return fail('Evento no encontrado o ambiguo', 404, 'NOTIFICATION_EVENT_NOT_FOUND');
    const event = events[0];
    const rule = MAP[event.tipo];
    if (!rule) return Response.json({ success: true, skipped: true, reason: 'EVENT_HAS_NO_NOTIFICATION_RULE' });
    const orders = await base44.asServiceRole.entities.OrdenTrabajo.filter({ id: event.orden_trabajo_id, organization_id: authorization.organizationId }, '-created_date', 1);
    const ot = orders?.[0];
    if (!ot) return fail('Orden no encontrada', 404, 'WORK_ORDER_NOT_FOUND');
    const scope = authorizeRecordBranch(authorization, ot.branch_id);
    if (!scope.ok) return fail(scope.error, scope.status, scope.code);
    const eventKey = `ot-event:${event.id}:${event.tipo}`;
    const existing = await base44.asServiceRole.entities.Notificacion.filter({ organization_id: authorization.organizationId, event_key: eventKey }, '-created_date', 2);
    if (existing?.length > 1) return fail('Notificacion duplicada', 409, 'NOTIFICATION_AMBIGUOUS');
    if (existing?.length === 1) return Response.json({ success: true, idempotent: true, notification: existing[0] });
    const notification = await base44.asServiceRole.entities.Notificacion.create({
      organization_id: authorization.organizationId,
      branch_id: ot.branch_id,
      user_id: rule.assigned ? ot.tecnico_asignado_id || null : null,
      role_target: rule.role_target,
      tipo: rule.tipo,
      mensaje: `${rule.label}: ${ot.codigo_ot || ot.id}`,
      referencia_ot_id: ot.id,
      accion_sugerida: rule.accion_sugerida,
      estado: 'pendiente',
      event_key: eventKey,
      source_event_id: event.id,
      created_by_command: 'notificationCommand',
    });
    try {
      await appendAuditEvent(base44, {
        eventType: 'WORKFLOW_NOTIFICATION_MATERIALIZED', principalClass: authorization.principalClass,
        actorUserId: user.id, actorPrimaryRole: authorization.persistedRole,
        organizationId: authorization.organizationId, branchId: ot.branch_id,
        resourceType: 'Notificacion', resourceId: notification.id,
        commandPolicyId: 'CP-NOTIF-001', correlationId: eventKey, operationKey: eventKey,
        newState: { role_target: rule.role_target, tipo: rule.tipo, estado: 'pendiente' },
        metadata: { source_event_id: event.id, work_order_id: ot.id },
      });
    } catch (error) {
      await base44.asServiceRole.entities.Notificacion.delete(notification.id).catch(() => null);
      throw error;
    }
    return Response.json({ success: true, idempotent: false, notification });
  } catch (error) {
    return fail(error.message || 'No se pudo materializar la notificacion', error.status || 500, error.code || 'NOTIFICATION_COMMAND_FAILED');
  }
});
