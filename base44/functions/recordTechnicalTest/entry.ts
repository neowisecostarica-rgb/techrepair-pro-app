import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { authorizeRecordBranch } from '../_shared/operationalAuthorization.ts';
import { appendAuditEvent } from '../_shared/auditEvent.ts';

const VALID_TEST_TYPES = ['funcional', 'stress', 'rendimiento', 'calidad', 'visual'];
const VALID_RESULTS = ['exitoso', 'fallido', 'parcial'];

function errorResponse(status, code, error) {
  return Response.json({ error, code }, { status });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Metodo no permitido');

  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return errorResponse(401, 'AUTH_REQUIRED', 'No autenticado');

  let body;
  try { body = await req.json(); }
  catch { return errorResponse(400, 'INVALID_BODY', 'Body invalido'); }

  const authorization = await resolveAuthorizedContext(base44, user, { allowedRoles: ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'] });
  if (!authorization.ok) return errorResponse(authorization.status, 'ASSIGNED_TECHNICIAN_REQUIRED', authorization.error);

  const { orden_trabajo_id, tipo_prueba, descripcion, resultado, observaciones, evidencia_urls } = body;
  if (!orden_trabajo_id || !VALID_TEST_TYPES.includes(tipo_prueba) || !VALID_RESULTS.includes(resultado)) {
    return errorResponse(400, 'INVALID_TEST_DATA', 'Datos de prueba tecnica invalidos');
  }

  const [ot] = await base44.asServiceRole.entities.OrdenTrabajo.filter({
    id: orden_trabajo_id,
    organization_id: authorization.organizationId,
  }, 1);
  if (!ot) return errorResponse(404, 'WORK_ORDER_NOT_FOUND', 'Orden de trabajo no encontrada');
  const branchAuthorization = authorizeRecordBranch(authorization, ot.branch_id);
  if (!branchAuthorization.ok) return errorResponse(branchAuthorization.status, branchAuthorization.code, branchAuthorization.error);
  if (ot.estado !== 'PRUEBAS') {
    return errorResponse(422, 'QA_CYCLE_NOT_ACTIVE', 'La OT debe estar en PRUEBAS para registrar evidencia QA');
  }
  if (ot.tecnico_asignado_id !== user.id) {
    return errorResponse(403, 'ASSIGNED_TECHNICIAN_REQUIRED', 'La OT esta asignada a otro tecnico');
  }

  const lockToken = crypto.randomUUID();
  const lockAt = new Date().toISOString();
  const claimed = await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
    id: ot.id,
    organization_id: authorization.organizationId,
    estado: 'PRUEBAS',
    $or: [{ lifecycle_lock_token: { $exists: false } }, { lifecycle_lock_token: null }],
  }, { $set: {
    lifecycle_lock_token: lockToken,
    lifecycle_lock_operation: 'qa:record',
    lifecycle_lock_owner_user_id: user.id,
    lifecycle_lock_at: lockAt,
  } });
  if (claimed?.updated !== 1) {
    return errorResponse(409, 'LIFECYCLE_OPERATION_IN_PROGRESS', 'Otra operacion del lifecycle esta en progreso');
  }

  try {
    const [lockedOt] = await base44.asServiceRole.entities.OrdenTrabajo.filter({
      id: ot.id,
      organization_id: authorization.organizationId,
      lifecycle_lock_token: lockToken,
    }, 1);
    if (!lockedOt || lockedOt.estado !== 'PRUEBAS') {
      return errorResponse(409, 'QA_CYCLE_CONFLICT', 'La OT ya no se encuentra en el ciclo de PRUEBAS');
    }
    if (lockedOt.tecnico_asignado_id !== user.id) {
      return errorResponse(403, 'ASSIGNED_TECHNICIAN_REQUIRED', 'La OT ya no esta asignada a este tecnico');
    }
    const activeSegments = await base44.asServiceRole.entities.ActividadTecnica.filter({
      organization_id: authorization.organizationId,
      orden_trabajo_id: ot.id,
      tecnico_id: user.id,
      estado: 'en_progreso',
      soft_deleted: false,
    }, '-created_date', 2);
    if (activeSegments?.length !== 1) {
      return errorResponse(409, 'QA_ACTIVE_SEGMENT_REQUIRED', 'QA requiere exactamente un segmento tecnico activo del autor');
    }
    let cycleId = lockedOt?.qa_cycle_id;
    let cycleStartedAt = lockedOt?.qa_cycle_started_at;
    if (!cycleId || !cycleStartedAt) {
      cycleId = crypto.randomUUID();
      cycleStartedAt = new Date().toISOString();
      const adopted = await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
        id: ot.id,
        organization_id: authorization.organizationId,
        estado: 'PRUEBAS',
        lifecycle_lock_token: lockToken,
      }, { $set: { qa_cycle_id: cycleId, qa_cycle_started_at: cycleStartedAt } });
      if (adopted?.updated !== 1) {
        return errorResponse(409, 'QA_CYCLE_CONFLICT', 'No se pudo confirmar el ciclo QA vigente');
      }
    }

    const recordedAt = new Date().toISOString();
    const test = await base44.asServiceRole.entities.PruebaTecnica.create({
      organization_id: authorization.organizationId,
      orden_trabajo_id: ot.id,
      tecnico_id: user.id,
      author_user_id: user.id,
      author_role: authorization.persistedRole,
      effective_technician_user_id: user.id,
      assignment_snapshot: { tecnico_asignado_id: lockedOt.tecnico_asignado_id, branch_id: lockedOt.branch_id },
      technical_activity_segment_id: activeSegments[0].id,
      correlation_id: typeof body.correlation_id === 'string' && body.correlation_id.trim()
        ? body.correlation_id.trim().slice(0, 240)
        : crypto.randomUUID(),
      qa_cycle_id: cycleId,
      qa_cycle_started_at: cycleStartedAt,
      recorded_at: recordedAt,
      recorded_via_backend: true,
      tipo_prueba,
      descripcion: typeof descripcion === 'string' ? descripcion.trim() : '',
      resultado,
      observaciones: typeof observaciones === 'string' ? observaciones.trim() : '',
      evidencia_urls: Array.isArray(evidencia_urls) ? evidencia_urls.filter(url => typeof url === 'string') : [],
    });
    try {
      await appendAuditEvent(base44, {
        eventType: 'QA_EVIDENCE_RECORDED',
        principalClass: authorization.principalClass,
        actorUserId: user.id,
        actorPrimaryRole: authorization.persistedRole,
        effectiveTechnicianUserId: user.id,
        organizationId: authorization.organizationId,
        branchId: lockedOt.branch_id,
        resourceType: 'PruebaTecnica',
        resourceId: test.id,
        commandPolicyId: 'CP-QA-001',
        correlationId: test.correlation_id,
        custodySnapshot: test.assignment_snapshot,
        metadata: { work_order_id: ot.id, qa_cycle_id: cycleId, resultado },
      });
    } catch (error) {
      await base44.asServiceRole.entities.PruebaTecnica.delete(test.id).catch(() => null);
      throw error;
    }
    return Response.json({ success: true, data: test });
  } finally {
    await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
      id: ot.id,
      organization_id: authorization.organizationId,
      lifecycle_lock_token: lockToken,
    }, { $unset: {
      lifecycle_lock_token: '', lifecycle_lock_operation: '',
      lifecycle_lock_owner_user_id: '', lifecycle_lock_at: '',
    } }).catch(error => console.error('[recordTechnicalTest] lifecycle_lock_release_failed:', error.message));
  }
});
