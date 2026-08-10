import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { isCanonicalActiveUserAccount } from '../_shared/userAuthorization.ts';

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

  const orgHint = user.impersonating_org_id || user.organization_id || null;
  const accounts = await base44.asServiceRole.entities.UserAccount.filter({ user_id: user.id }, 10);
  const account = (accounts || []).find(candidate =>
    candidate.organization_id === orgHint && isCanonicalActiveUserAccount(candidate)
  );
  if (!account || account.role !== 'TECHNICIAN') {
    return errorResponse(403, 'ASSIGNED_TECHNICIAN_REQUIRED', 'Solo el tecnico activo asignado puede registrar evidencia QA');
  }

  const { orden_trabajo_id, tipo_prueba, descripcion, resultado, observaciones, evidencia_urls } = body;
  if (!orden_trabajo_id || !VALID_TEST_TYPES.includes(tipo_prueba) || !VALID_RESULTS.includes(resultado)) {
    return errorResponse(400, 'INVALID_TEST_DATA', 'Datos de prueba tecnica invalidos');
  }

  const [ot] = await base44.asServiceRole.entities.OrdenTrabajo.filter({
    id: orden_trabajo_id,
    organization_id: account.organization_id,
  }, 1);
  if (!ot) return errorResponse(404, 'WORK_ORDER_NOT_FOUND', 'Orden de trabajo no encontrada');
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
    organization_id: account.organization_id,
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
      organization_id: account.organization_id,
      lifecycle_lock_token: lockToken,
    }, 1);
    if (!lockedOt || lockedOt.estado !== 'PRUEBAS') {
      return errorResponse(409, 'QA_CYCLE_CONFLICT', 'La OT ya no se encuentra en el ciclo de PRUEBAS');
    }
    if (lockedOt.tecnico_asignado_id !== user.id) {
      return errorResponse(403, 'ASSIGNED_TECHNICIAN_REQUIRED', 'La OT ya no esta asignada a este tecnico');
    }
    let cycleId = lockedOt?.qa_cycle_id;
    let cycleStartedAt = lockedOt?.qa_cycle_started_at;
    if (!cycleId || !cycleStartedAt) {
      cycleId = crypto.randomUUID();
      cycleStartedAt = new Date().toISOString();
      const adopted = await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
        id: ot.id,
        organization_id: account.organization_id,
        estado: 'PRUEBAS',
        lifecycle_lock_token: lockToken,
      }, { $set: { qa_cycle_id: cycleId, qa_cycle_started_at: cycleStartedAt } });
      if (adopted?.updated !== 1) {
        return errorResponse(409, 'QA_CYCLE_CONFLICT', 'No se pudo confirmar el ciclo QA vigente');
      }
    }

    const recordedAt = new Date().toISOString();
    const test = await base44.asServiceRole.entities.PruebaTecnica.create({
      organization_id: account.organization_id,
      orden_trabajo_id: ot.id,
      tecnico_id: user.id,
      author_user_id: user.id,
      author_role: account.role,
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
    return Response.json({ success: true, data: test });
  } finally {
    await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
      id: ot.id,
      organization_id: account.organization_id,
      lifecycle_lock_token: lockToken,
    }, { $unset: {
      lifecycle_lock_token: '', lifecycle_lock_operation: '',
      lifecycle_lock_owner_user_id: '', lifecycle_lock_at: '',
    } }).catch(error => console.error('[recordTechnicalTest] lifecycle_lock_release_failed:', error.message));
  }
});
