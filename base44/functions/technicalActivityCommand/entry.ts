import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { authorizeRecordBranch } from '../_shared/operationalAuthorization.ts';
import { appendAuditEvent } from '../_shared/auditEvent.ts';

const ACTIONS = new Set(['PAUSE', 'RESUME', 'COMPLETE', 'BLOCK']);

function jsonError(error, status, code, extra = {}) {
  return Response.json({ error, code, ...extra }, { status });
}

function durationMinutes(startedAt, endedAt) {
  return Math.max(0, Math.floor((Date.parse(endedAt) - Date.parse(startedAt)) / 60000));
}

async function one(entity, query) {
  const rows = await entity.filter(query, '-created_date', 2);
  return rows?.length === 1 ? rows[0] : null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonError('Metodo no permitido', 405, 'METHOD_NOT_ALLOWED');
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return jsonError('No autenticado', 401, 'AUTH_REQUIRED');
  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === 'string' ? body.action : '';
  const workOrderId = typeof body.work_order_id === 'string' ? body.work_order_id.trim() : '';
  if (!ACTIONS.has(action) || !workOrderId) return jsonError('Comando tecnico invalido', 400, 'TECHNICAL_COMMAND_INVALID');

  const authorization = await resolveAuthorizedContext(base44, user);
  if (!authorization.ok) return jsonError(authorization.error, authorization.status, authorization.code);
  if (!authorization.capabilities.includes('TECHNICAL_WORK')) return jsonError('Trabajo tecnico no autorizado', 403, 'CAPABILITY_DENIED');
  const workOrder = await one(base44.asServiceRole.entities.OrdenTrabajo, { id: workOrderId, organization_id: authorization.organizationId });
  if (!workOrder) return jsonError('Orden de trabajo no encontrada', 404, 'WORK_ORDER_NOT_FOUND');
  const scope = authorizeRecordBranch(authorization, workOrder.branch_id);
  if (!scope.ok) return jsonError(scope.error, scope.status, scope.code);
  if (workOrder.tecnico_asignado_id !== user.id) return jsonError('La custodia tecnica pertenece a otro usuario', 403, 'EFFECTIVE_TECHNICIAN_REQUIRED');

  const activeSegments = await base44.asServiceRole.entities.ActividadTecnica.filter({
    organization_id: authorization.organizationId,
    tecnico_id: user.id,
    estado: 'en_progreso',
    soft_deleted: false,
  }, '-created_date', 10);
  if (activeSegments.length > 1) return jsonError('Existen multiples segmentos activos para el tecnico', 409, 'ACTIVE_TECHNICAL_WORK_AMBIGUOUS');
  const active = activeSegments[0] || null;
  const now = new Date().toISOString();
  const correlationId = typeof body.correlation_id === 'string' && body.correlation_id.trim()
    ? body.correlation_id.trim().slice(0, 240)
    : crypto.randomUUID();

  if (action === 'RESUME') {
    if (active) return jsonError('El tecnico ya tiene trabajo activo', 409, 'ONE_ACTIVE_TECHNICAL_WORK');
    if (workOrder.estado_atencion !== 'PAUSADO') return jsonError('Solo una OT pausada puede retomarse', 409, 'WORK_ORDER_NOT_PAUSED');
    const segment = await base44.asServiceRole.entities.ActividadTecnica.create({
      organization_id: authorization.organizationId,
      orden_trabajo_id: workOrder.id,
      tecnico_id: user.id,
      tecnico_email: authorization.account?.user_email || user.email,
      actor_user_id: user.id,
      actor_primary_role: authorization.persistedRole,
      effective_technician_user_id: user.id,
      assignment_snapshot: { tecnico_asignado_id: workOrder.tecnico_asignado_id, branch_id: workOrder.branch_id },
      correlation_id: correlationId,
      tipo_actividad: typeof body.tipo_actividad === 'string' ? body.tipo_actividad : 'diagnostico',
      subtipo: typeof body.subtipo === 'string' ? body.subtipo.trim().slice(0, 500) : 'Trabajo retomado',
      estado: 'en_progreso',
      started_at: now,
      soft_deleted: false,
    });
    try {
      await base44.asServiceRole.entities.OrdenTrabajo.update(workOrder.id, {
        estado_atencion: 'ACTIVO',
        motivo_pausa: null,
        ultima_actividad: 'Trabajo tecnico retomado',
        ultima_actividad_at: now,
      });
      await appendAuditEvent(base44, {
        eventType: 'TECHNICAL_ACTIVITY_RESUMED', principalClass: authorization.principalClass,
        actorUserId: user.id, actorPrimaryRole: authorization.persistedRole, effectiveTechnicianUserId: user.id,
        organizationId: authorization.organizationId, branchId: workOrder.branch_id,
        resourceType: 'ActividadTecnica', resourceId: segment.id, commandPolicyId: 'CP-TECH-003', correlationId,
        custodySnapshot: { work_order_id: workOrder.id, tecnico_asignado_id: workOrder.tecnico_asignado_id },
      });
      return Response.json({ success: true, segment });
    } catch (error) {
      await base44.asServiceRole.entities.ActividadTecnica.delete(segment.id).catch(() => null);
      await base44.asServiceRole.entities.OrdenTrabajo.update(workOrder.id, {
        estado_atencion: workOrder.estado_atencion,
        motivo_pausa: workOrder.motivo_pausa || null,
        ultima_actividad: workOrder.ultima_actividad || null,
        ultima_actividad_at: workOrder.ultima_actividad_at || null,
      }).catch(() => null);
      throw error;
    }
  }

  if (!active || active.orden_trabajo_id !== workOrder.id) return jsonError('No existe un segmento activo propio para esta OT', 409, 'ACTIVE_SEGMENT_REQUIRED');
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 2000) : '';
  if (['PAUSE', 'BLOCK'].includes(action) && !reason) return jsonError('El motivo es obligatorio', 400, 'TECHNICAL_REASON_REQUIRED');
  const nextSegmentState = action === 'BLOCK' ? 'bloqueada' : 'finalizada';
  const segmentUpdate = {
    estado: nextSegmentState,
    ended_at: now,
    duracion_minutos: durationMinutes(active.started_at, now),
    resultado: action === 'COMPLETE' ? 'ok' : 'incompleto',
    notas: reason || `Segmento cerrado por ${action}`,
    ...(action === 'BLOCK' ? { causa_bloqueo: reason } : {}),
  };
  const attentionUpdate = action === 'PAUSE'
    ? { estado_atencion: 'PAUSADO', motivo_pausa: body.pause_reason || 'interrupcion' }
    : action === 'BLOCK'
      ? { estado_atencion: 'ESPERANDO', motivo_pausa: null }
      : { estado_atencion: 'ESPERANDO', motivo_pausa: null };
  await base44.asServiceRole.entities.ActividadTecnica.update(active.id, segmentUpdate);
  try {
    await base44.asServiceRole.entities.OrdenTrabajo.update(workOrder.id, {
      ...attentionUpdate,
      ultima_actividad: reason || `Segmento tecnico ${action.toLowerCase()}`,
      ultima_actividad_at: now,
    });
    await appendAuditEvent(base44, {
      eventType: `TECHNICAL_ACTIVITY_${action}`, principalClass: authorization.principalClass,
      actorUserId: user.id, actorPrimaryRole: authorization.persistedRole, effectiveTechnicianUserId: user.id,
      organizationId: authorization.organizationId, branchId: workOrder.branch_id,
      resourceType: 'ActividadTecnica', resourceId: active.id,
      commandPolicyId: action === 'PAUSE' ? 'CP-TECH-002' : 'CP-TECH-001', correlationId,
      priorState: { estado: active.estado }, newState: { estado: nextSegmentState },
      custodySnapshot: { work_order_id: workOrder.id, tecnico_asignado_id: workOrder.tecnico_asignado_id },
    });
    return Response.json({ success: true, segment: { ...active, ...segmentUpdate } });
  } catch (error) {
    await base44.asServiceRole.entities.ActividadTecnica.update(active.id, {
      estado: active.estado,
      ended_at: active.ended_at || null,
      duracion_minutos: active.duracion_minutos || null,
      resultado: active.resultado || null,
      notas: active.notas || null,
      causa_bloqueo: active.causa_bloqueo || null,
    }).catch(() => null);
    await base44.asServiceRole.entities.OrdenTrabajo.update(workOrder.id, {
      estado_atencion: workOrder.estado_atencion || null,
      motivo_pausa: workOrder.motivo_pausa || null,
      ultima_actividad: workOrder.ultima_actividad || null,
      ultima_actividad_at: workOrder.ultima_actividad_at || null,
    }).catch(() => null);
    throw error;
  }
});

