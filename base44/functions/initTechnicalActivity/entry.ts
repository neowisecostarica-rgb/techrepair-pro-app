/**
 * ═══════════════════════════════════════════════════════════════════════════
 * initTechnicalActivity — Orquestador Técnico P0.2-C (WF-003B)
 * ═══════════════════════════════════════════════════════════════════════════
 * RESPONSABILIDAD:
 *   Punto único de entrada para iniciar una actividad técnica sobre una OT.
 *   El frontend realiza una única solicitud; el backend valida y persiste.
 *
 * ORDEN DE PERSISTENCIA (serializado y con reconciliación):
 *   1. Crear ActividadTecnica (en_progreso)
 *   2. Actualizar OrdenTrabajo.estado → EN_REVISION (vía transitionWorkOrderStatus)
 *      → transitionWorkOrderStatus crea OTEvent TRANSITION_EN_REVISION internamente
 *   3. Actualizar OrdenTrabajo.estado_atencion → ACTIVO (vía updateWorkOrderAttentionStatus)
 *
 * REGLAS DE NEGOCIO:
 *   - diagnostico_habilitado === true es precondición universal
 *   - Estados OT permitidos: ASIGNADA, EN_COLA_REVISION, EN_REVISION
 *   - Actividad en_progreso mismo técnico → idempotente (retornar existente)
 *   - Actividad en_progreso otro técnico → rechazar
 *   - OT EN_REVISION sin ninguna actividad → error (inconsistencia)
 *   - Actividades finalizada/bloqueada no bloquean nueva creación
 *
 * GARANTÍAS RC1:
 *   - No existen transacciones multidocumento en Base44
 *   - Un lock atómico por OT serializa inicio y transición
 *   - Una respuesta ambigua se reconcilia leyendo el estado confirmado
 *   - Solo se elimina la actividad si la OT conserva el estado previo
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { isCanonicalActiveUserAccount } from '../_shared/userAuthorization.ts';

const ESTADO_ACTIVO = 'en_progreso';
const ESTADOS_OT_PERMITIDOS = ['ASIGNADA', 'EN_COLA_REVISION', 'EN_REVISION'];
const ROLES_ADMIN = ['ORG_ADMIN', 'BRANCH_ADMIN', 'SUPER_ADMIN'];
const ROLES_INICIO_TECNICO = [...ROLES_ADMIN, 'TECHNICIAN'];
const INIT_LOCK_TTL_MS = 15 * 60 * 1000;

// ── WF-004A: WorkflowGate constants ──────────────────────────────────────────
// Vertical slice TechRepairPro: wait_reason=COMMERCIAL_AUTHORIZATION, provider_key=COMMERCE_GATEWAY
const GATE_SUBJECT_TYPE = 'OrdenTrabajo';
const GATE_WAIT_REASON = 'COMMERCIAL_AUTHORIZATION';
const GATE_PROVIDER_KEY = 'COMMERCE_GATEWAY';

function buildCorrelationKey(subjectType, subjectId, waitReason) {
  return `${subjectType}:${subjectId}:${waitReason}`;
}

// Idempotente: crea o reutiliza un gate PENDING para (subject, reason).
// Retorna el gate existente/creado. No lanza si ya existe (best-effort).
async function ensurePendingGate(base44, { orgId, subjectId, userId }) {
  const correlationKey = buildCorrelationKey(GATE_SUBJECT_TYPE, subjectId, GATE_WAIT_REASON);
  const existing = await base44.asServiceRole.entities.WorkflowGate.filter(
    { correlation_key: correlationKey, status: 'PENDING' }, 5
  );
  if (existing && existing.length > 0) {
    return { gate: existing[0], created: false };
  }
  const gate = await base44.asServiceRole.entities.WorkflowGate.create({
    organization_id: orgId,
    subject_type: GATE_SUBJECT_TYPE,
    subject_id: subjectId,
    wait_reason: GATE_WAIT_REASON,
    provider_key: GATE_PROVIDER_KEY,
    status: 'PENDING',
    correlation_key: correlationKey,
    created_by_user_id: userId,
    resolution_payload: null,
    resolved_by_user_id: null,
    resolved_at: null,
  });
  return { gate, created: true };
}

async function loadWorkOrderForInit(base44, orgId, workOrderId) {
  const records = await base44.asServiceRole.entities.OrdenTrabajo.filter({
    id: workOrderId,
    organization_id: orgId,
  });
  return records?.[0] || null;
}

async function acquireInitLock(base44, { ot, orgId, userId }) {
  const token = crypto.randomUUID();
  const now = new Date().toISOString();
  const lockData = {
    lifecycle_lock_token: token,
    lifecycle_lock_operation: 'initTechnicalActivity',
    lifecycle_lock_owner_user_id: userId,
    lifecycle_lock_at: now,
  };

  let claim;
  try {
    claim = await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
      id: ot.id,
      organization_id: orgId,
      estado: ot.estado,
      $or: [
        { lifecycle_lock_token: { $exists: false } },
        { lifecycle_lock_token: null },
      ],
    }, { $set: lockData });
  } catch (claimError) {
    const reconciled = await loadWorkOrderForInit(base44, orgId, ot.id);
    if (reconciled?.lifecycle_lock_token === token) {
      return { acquired: true, token, owned: true, recovered_ambiguous_lock: true };
    }
    throw claimError;
  }

  if (claim?.updated === 1) return { acquired: true, token, owned: true };

  const current = await loadWorkOrderForInit(base44, orgId, ot.id);
  const lockTimestamp = Date.parse(current?.lifecycle_lock_at || '');
  const stale = current?.lifecycle_lock_token
    && Number.isFinite(lockTimestamp)
    && Date.now() - lockTimestamp > INIT_LOCK_TTL_MS;

  if (stale) {
    let takeover;
    try {
      takeover = await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
        id: ot.id,
        organization_id: orgId,
        estado: ot.estado,
        lifecycle_lock_token: current.lifecycle_lock_token,
        lifecycle_lock_at: current.lifecycle_lock_at,
      }, { $set: lockData });
    } catch (takeoverError) {
      const reconciled = await loadWorkOrderForInit(base44, orgId, ot.id);
      if (reconciled?.lifecycle_lock_token === token) {
        return {
          acquired: true,
          token,
          owned: true,
          recovered_stale_lock: true,
          recovered_ambiguous_lock: true,
        };
      }
      throw takeoverError;
    }
    if (takeover?.updated === 1) {
      return { acquired: true, token, owned: true, recovered_stale_lock: true };
    }
  }

  return {
    acquired: false,
    operation: current?.lifecycle_lock_operation || null,
  };
}

async function ownsInitLock(base44, { orgId, workOrderId, lock }) {
  const current = await loadWorkOrderForInit(base44, orgId, workOrderId);
  return current?.lifecycle_lock_token === lock?.token;
}

async function releaseInitLock(base44, { orgId, workOrderId, lock }) {
  if (!lock?.owned) return;
  await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
    id: workOrderId,
    organization_id: orgId,
    lifecycle_lock_token: lock.token,
  }, {
    $unset: {
      lifecycle_lock_token: '',
      lifecycle_lock_operation: '',
      lifecycle_lock_owner_user_id: '',
      lifecycle_lock_at: '',
    },
  });
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const runtimeUser = await base44.auth.me();
    if (!runtimeUser) {
      return Response.json({ error: 'No autenticado' }, { status: 401 });
    }

    // ── 2. Parsear payload ────────────────────────────────────────────────────
    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Body inválido o vacío' }, { status: 400 });
    }

    const { orden_trabajo_id, tecnico_id, tipo_actividad, subtipo } = body;

    if (!orden_trabajo_id) {
      return Response.json({ error: 'orden_trabajo_id es requerido' }, { status: 400 });
    }
    if (!tecnico_id) {
      return Response.json({ error: 'tecnico_id es requerido' }, { status: 400 });
    }
    if (!tipo_actividad) {
      return Response.json({ error: 'tipo_actividad es requerido' }, { status: 400 });
    }

    // ── 3. Resolver orgId y rol desde UserAccount (SOT) ───────────────────────
    const isSuperAdmin = runtimeUser.is_super_admin === true || runtimeUser.data?.is_super_admin === true;
    let orgId;
    let effectiveRole;
    let tecnicoEmail = runtimeUser.email;

    if (isSuperAdmin) {
      orgId = runtimeUser.impersonating_org_id || runtimeUser.organization_id;
      effectiveRole = 'SUPER_ADMIN';
    } else {
      const orgHint = runtimeUser.impersonating_org_id || runtimeUser.organization_id || null;
      const userAccounts = await base44.asServiceRole.entities.UserAccount.filter(
        { user_id: runtimeUser.id }, 5
      );

      if (!userAccounts || userAccounts.length === 0) {
        return Response.json({ error: 'UserAccount no encontrado para este usuario' }, { status: 403 });
      }

      const account = orgHint
        ? userAccounts.find(a => a.organization_id === orgHint)
        : (userAccounts.length === 1 ? userAccounts[0] : null);

      if (!isCanonicalActiveUserAccount(account)) {
        return Response.json({ error: 'Cuenta no activa' }, { status: 403 });
      }

      orgId = account.organization_id;
      effectiveRole = account.role;
      tecnicoEmail = account.user_email || runtimeUser.email;
    }

    if (!orgId) {
      return Response.json({ error: 'organization_id no resuelto' }, { status: 403 });
    }

    // CC-001-02: no tratar todo rol no administrativo como técnico.
    // Rechazar antes de consultar reglas con side-effects o crear registros.
    if (!ROLES_INICIO_TECNICO.includes(effectiveRole)) {
      return Response.json({
        error: `El rol "${effectiveRole}" no está autorizado para iniciar actividad técnica.`,
        codigo: 'ROL_TECNICO_NO_AUTORIZADO',
      }, { status: 403 });
    }

    console.log(`[initTechnicalActivity] orgId=${orgId}, role=${effectiveRole}, tecnico_id=${tecnico_id}, OT=${orden_trabajo_id}`);

    // ── 4. Validar OT existe y pertenece a la org ─────────────────────────────
    const otResults = await base44.asServiceRole.entities.OrdenTrabajo.filter(
      { id: orden_trabajo_id, organization_id: orgId }, 1
    );

    if (!otResults || otResults.length === 0) {
      return Response.json({ error: 'Orden de trabajo no encontrada en esta organización' }, { status: 404 });
    }

    const ot = otResults[0];
    const estadoActualOT = ot.estado;

    console.log(`[initTechnicalActivity] OT encontrada — estado: ${estadoActualOT}`);

    // ── 5. Validar estado de OT permitido ─────────────────────────────────────
    if (!ESTADOS_OT_PERMITIDOS.includes(estadoActualOT)) {
      return Response.json({
        error: `No se puede iniciar actividad: el estado de la OT "${estadoActualOT}" no está permitido para iniciar trabajo técnico.`,
        codigo: 'ESTADO_OT_INVALIDO',
        estado_ot: estadoActualOT,
      }, { status: 422 });
    }

    // ── 6. Validar diagnostico_habilitado (precondición universal) ────────────
    if (!ot.diagnostico_habilitado) {
      const MOTIVOS_DESCRIPCION = {
        PENDIENTE_PAGO: 'Revisión pendiente de pago',
        PENDIENTE_AUTORIZACION_GERENCIA: 'Pendiente de autorización gerencial',
        EN_GARANTIA_VERIFICACION: 'En verificación de garantía',
        CLIENTE_CORPORATIVO_CREDITO: 'Cliente corporativo — requiere aprobación de crédito',
        OTRO: 'Diagnóstico bloqueado — contactar administración',
      };
      const motivo = ot.motivo_bloqueo_diagnostico || 'PENDIENTE_PAGO';
      const descripcion = MOTIVOS_DESCRIPCION[motivo] || MOTIVOS_DESCRIPCION['OTRO'];
      console.warn(`[initTechnicalActivity] BLOQUEO DIAGNÓSTICO: OT=${orden_trabajo_id}, motivo=${motivo}`);

      // ── WF-004A: emitir WorkflowGate PENDING (idempotente) ─────────────────
      // Solo para motivo PENDIENTE_PAGO (autorización comercial vía COMMERCE_GATEWAY).
      // Otros motivos no pertenecen al vertical slice y se reportan sin gate.
      let gateInfo = null;
      if (motivo === 'PENDIENTE_PAGO') {
        try {
          const { gate, created } = await ensurePendingGate(base44, {
            orgId,
            subjectId: orden_trabajo_id,
            userId: runtimeUser.id,
          });
          gateInfo = { gate_id: gate.id, gate_created: created };
          console.log(`[initTechnicalActivity] WorkflowGate ${created ? 'creado' : 'reutilizado'} — id=${gate.id}, OT=${orden_trabajo_id}`);
        } catch (gateErr) {
          console.warn(`[initTechnicalActivity] WorkflowGate emit falló (non-critical): ${gateErr.message}`);
        }
      }

      return Response.json({
        error: `Diagnóstico bloqueado: ${descripcion}`,
        codigo: 'DIAGNOSTICO_NO_HABILITADO',
        motivo_bloqueo: motivo,
        descripcion_bloqueo: descripcion,
        workflow_gate: gateInfo,
      }, { status: 403 });
    }

    // ── 7. Validar técnico asignado y resolver técnico efectivo ───────────────
    if (!ot.tecnico_asignado_id) {
      return Response.json({
        error: 'La OT no tiene un técnico asignado. No se puede iniciar el trabajo técnico.',
        codigo: 'TECNICO_FALTANTE',
      }, { status: 422 });
    }

    const esAdmin = ROLES_ADMIN.includes(effectiveRole);
    let efectiveTecnicoId;

    if (esAdmin) {
      // Admin delega la actividad al técnico asignado a la OT
      efectiveTecnicoId = ot.tecnico_asignado_id;
      console.log(`[initTechnicalActivity] Admin delega al técnico asignado ${efectiveTecnicoId}`);
    } else {
      // TECHNICIAN debe ser el usuario autenticado y el técnico asignado a la OT.
      // El tecnico_id del payload no es una fuente de identidad confiable.
      if (runtimeUser.id !== ot.tecnico_asignado_id || tecnico_id !== runtimeUser.id) {
        return Response.json({
          error: 'No estás asignado a esta Orden de Trabajo. No puedes iniciar el trabajo técnico.',
          codigo: 'TECNICO_INCORRECTO',
          tecnico_recibido: tecnico_id,
          tecnico_asignado: ot.tecnico_asignado_id,
        }, { status: 403 });
      }
      efectiveTecnicoId = tecnico_id;
    }

    // ── 8. Consultar actividades existentes de la OT ─────────────────────────
    const actividadesOT = await base44.asServiceRole.entities.ActividadTecnica.filter({
      organization_id: orgId,
      orden_trabajo_id: orden_trabajo_id,
      soft_deleted: false,
    });

    const actividadesActivas = actividadesOT.filter(a => a.estado === ESTADO_ACTIVO);

    // ── 9. Regla: Actividad ACTIVO mismo técnico → idempotente ────────────────
    const actividadMismoTecnico = actividadesActivas.find(a => a.tecnico_id === efectiveTecnicoId);
    if (actividadMismoTecnico && estadoActualOT === 'EN_REVISION') {
      console.log(`[initTechnicalActivity] Idempotencia — actividad activa existente id=${actividadMismoTecnico.id}`);
      return Response.json({
        success: true,
        idempotent: true,
        message: 'Actividad activa existente reutilizada.',
        actividad: actividadMismoTecnico,
        estado_ot: estadoActualOT,
        estado_atencion: ot.estado_atencion || null,
      });
    }

    // ── 10. Regla: Actividad ACTIVO otro técnico → rechazar ──────────────────
    const actividadOtroTecnico = actividadesActivas.find(a => a.tecnico_id !== efectiveTecnicoId);
    if (actividadOtroTecnico) {
      console.warn(`[initTechnicalActivity] BLOQUEO: actividad activa de otro técnico id=${actividadOtroTecnico.id}`);
      return Response.json({
        error: 'Existe una actividad activa de otro técnico en esta OT. No se puede iniciar hasta que finalice.',
        codigo: 'ACTIVIDAD_OTRO_TECNICO',
        actividad_bloqueante_id: actividadOtroTecnico.id,
        tecnico_bloqueante_id: actividadOtroTecnico.tecnico_id,
      }, { status: 409 });
    }

    // ── 11. Regla: OT EN_REVISION sin ninguna actividad → inconsistencia ─────
    // El flujo legacy de pago podía avanzar una OT antes de crear la actividad.
    // Solo se reconcilia cuando existe evidencia persistida del pago; cualquier
    // otro EN_REVISION sin actividad continúa bloqueado para corrección manual.
    const recuperacionPostPagoLegacy = estadoActualOT === 'EN_REVISION'
      && actividadesOT.length === 0
      && ot.diagnostico_habilitado === true
      && !!ot.revision_venta_id;

    if (estadoActualOT === 'EN_REVISION' && actividadesOT.length === 0 && !recuperacionPostPagoLegacy) {
      console.warn(`[initTechnicalActivity] INCONSISTENCIA: EN_REVISION sin actividades — OT=${orden_trabajo_id}`);
      return Response.json({
        error: 'Inconsistencia detectada: la OT está en EN_REVISION pero no tiene ninguna actividad técnica registrada. Requiere corrección controlada.',
        codigo: 'EN_REVISION_SIN_ACTIVIDAD',
        estado_ot: estadoActualOT,
      }, { status: 409 });
    }

    if (recuperacionPostPagoLegacy) {
      console.warn(`[initTechnicalActivity] RECONCILIACION LEGACY: EN_REVISION pagada sin actividad — OT=${orden_trabajo_id}, venta=${ot.revision_venta_id}`);
    }

    // ── 12. Validar técnico sin otra OT con estado_atencion ACTIVO ───────────
    const otsTecnicoActivo = await base44.asServiceRole.entities.OrdenTrabajo.filter({
      organization_id: orgId,
      tecnico_asignado_id: efectiveTecnicoId,
      estado_atencion: 'ACTIVO',
    });

    const otraOTActiva = otsTecnicoActivo.find(o => o.id !== orden_trabajo_id);
    if (otraOTActiva) {
      console.warn(`[initTechnicalActivity] BLOQUEO: técnico ${efectiveTecnicoId} ya ACTIVO en OT ${otraOTActiva.id}`);
      return Response.json({
        error: `El técnico ya tiene una actividad activa en la OT ${otraOTActiva.codigo_ot || otraOTActiva.id}. Finalice o pause esa actividad antes de continuar.`,
        codigo: 'TECNICO_ACTIVO_OTRA_OT',
        ot_bloqueante_id: otraOTActiva.id,
        ot_bloqueante_codigo: otraOTActiva.codigo_ot,
      }, { status: 409 });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PERSISTENCIA — orden autorizado con compensación
    // ══════════════════════════════════════════════════════════════════════════

    const estadoOTPrevio = estadoActualOT;
    const necesitaTransicion = estadoActualOT !== 'EN_REVISION';

    // ── 13. Conservar valores previos (para reporte de estado residual) ───────
    const valoresPrevios = {
      estado_ot: estadoOTPrevio,
      estado_atencion: ot.estado_atencion || null,
    };

    const initLock = await acquireInitLock(base44, {
      ot,
      orgId,
      userId: runtimeUser.id,
    });
    if (!initLock.acquired) {
      return Response.json({
        error: 'Otra operación del lifecycle está en progreso para esta OT.',
        codigo: 'LIFECYCLE_OPERATION_IN_PROGRESS',
        operacion: initLock.operation,
        retryable: true,
      }, { status: 409 });
    }

    try {

    // ── 14. PASO 1: Crear ActividadTecnica ───────────────────────────────────
    const actividadCreadaEsteIntento = !actividadMismoTecnico;
    let nuevaActividad = actividadMismoTecnico || null;
    try {
      if (!nuevaActividad) {
        nuevaActividad = await base44.asServiceRole.entities.ActividadTecnica.create({
        organization_id: orgId,
        orden_trabajo_id,
        tecnico_id: efectiveTecnicoId,
        tecnico_email: tecnicoEmail,
        tipo_actividad,
        subtipo: subtipo || '',
        estado: ESTADO_ACTIVO,
        started_at: new Date().toISOString(),
        ended_at: null,
        duracion_minutos: null,
        causa_bloqueo: '',
        resultado: null,
        notas: '',
        soft_deleted: false,
        });
        console.log(`[initTechnicalActivity] ActividadTecnica creada — id=${nuevaActividad.id}`);
      } else {
        console.warn(`[initTechnicalActivity] Recuperando actividad existente — id=${nuevaActividad.id}`);
      }
    } catch (createErr) {
      return Response.json({
        error: `Fallo al crear ActividadTecnica: ${createErr.message}`,
        codigo: 'FALLO_CREAR_ACTIVIDAD',
        paso_fallido: 'crear_actividad',
      }, { status: 500 });
    }

    // ── 15. PASO 2: Actualizar OT.estado → EN_REVISION ────────────────────────
    // transitionWorkOrderStatus valida la transición, actualiza la OT y crea
    // el OTEvent TRANSITION_EN_REVISION internamente (satisface el paso de OTEvent).
    let transitionRecovered = false;
    if (necesitaTransicion) {
      let transitionOk = false;
      let transitionErrorMsg = null;

      try {
        // Preserve the request user's credential. The transition engine resolves
        // role and organization from that trusted runtime identity.
        const transitionRes = await base44.functions.invoke('transitionWorkOrderStatus', {
          orden_trabajo_id,
          newStatus: 'EN_REVISION',
          observacion: `Inicio de revisión técnica — actividad ${tipo_actividad}`,
          _lifecycle_lock_token: initLock.token,
        });

        const transitionData = transitionRes?.data ?? transitionRes;
        const transitionStatusOk = transitionRes?.status === undefined || transitionRes.status === 200;
        if (transitionStatusOk && transitionData?.success === true) {
          transitionOk = true;
          console.log(`[initTechnicalActivity] Transición exitosa — OT ahora en EN_REVISION`);
        } else {
          transitionErrorMsg = transitionData?.error || 'Error desconocido en transición';
          console.error(`[initTechnicalActivity] transitionWorkOrderStatus falló: ${transitionErrorMsg}`);
        }
      } catch (transErr) {
        transitionErrorMsg = transErr.message;
        console.error(`[initTechnicalActivity] transitionWorkOrderStatus excepción: ${transitionErrorMsg}`);
      }

      if (!transitionOk) {
        // Una excepción o respuesta perdida no demuestra que la transición no
        // ocurrió. Releer bajo el mismo lock antes de compensar.
        const reconciledOT = await loadWorkOrderForInit(base44, orgId, orden_trabajo_id);
        if (reconciledOT?.estado === 'EN_REVISION') {
          transitionOk = true;
          transitionRecovered = true;
          console.warn(`[initTechnicalActivity] Respuesta ambigua reconciliada — OT ya está EN_REVISION`);
        } else if (reconciledOT?.estado !== estadoOTPrevio) {
          return Response.json({
            error: `La OT cambió a "${reconciledOT?.estado || 'desconocido'}" durante el inicio técnico. La actividad se conserva para auditoría.`,
            codigo: 'TRANSITION_AMBIGUOUS_STATE',
            paso_fallido: 'reconciliar_transicion',
            actividad_id: nuevaActividad.id,
            estado_ot_actual: reconciledOT?.estado || null,
            retryable: false,
          }, { status: 409 });
        }
      }

      if (!transitionOk) {
        // CC-001-03: compensar la creación para que la operación sea atómica
        // solo después de confirmar que la OT conserva el estado previo.
        const lockTodaviaPropio = await ownsInitLock(base44, {
          orgId,
          workOrderId: orden_trabajo_id,
          lock: initLock,
        });
        if (!lockTodaviaPropio) {
          return Response.json({
            error: 'El lock fue recuperado por otro intento. La actividad se conserva para evitar borrar trabajo concurrente.',
            codigo: 'LIFECYCLE_LOCK_LOST',
            paso_fallido: 'reconciliar_transicion',
            actividad_id: nuevaActividad.id,
            actividad_preservada: true,
            retryable: true,
          }, { status: 409 });
        }
        if (!actividadCreadaEsteIntento) {
          return Response.json({
            error: `No se pudo reanudar la transición: ${transitionErrorMsg}`,
            codigo: 'TRANSITION_RECOVERY_FAILED',
            paso_fallido: 'transicion_ot',
            actividad_id: nuevaActividad.id,
            actividad_preservada: true,
            retryable: true,
          }, { status: 500 });
        }
        try {
          await base44.asServiceRole.entities.ActividadTecnica.delete(nuevaActividad.id);
          console.warn(`[initTechnicalActivity] ROLLBACK completado — actividad=${nuevaActividad.id}`);
        } catch (rollbackErr) {
          console.error(`[initTechnicalActivity] ROLLBACK FALLÓ — actividad=${nuevaActividad.id}: ${rollbackErr.message}`);
          return Response.json({
            error: `No se pudo iniciar la revisión y falló la compensación de la actividad: ${rollbackErr.message}`,
            codigo: 'ROLLBACK_ACTIVIDAD_FAILED',
            paso_fallido: 'rollback_actividad',
          }, { status: 500 });
        }

        return Response.json({
          error: `No se pudo iniciar la revisión: ${transitionErrorMsg}`,
          codigo: 'TRANSITION_FAILED',
          paso_fallido: 'transicion_ot',
          rollback: {
            actividad_eliminada: true,
            ot_transicionada: false,
            estado_ot_actual: estadoOTPrevio,
          },
        }, { status: 500 });
      }
    } else {
      console.log(`[initTechnicalActivity] OT ya en EN_REVISION — transición omitida`);
    }

    // ── 16. PASO 3: Actualizar estado_atencion → ACTIVO (best-effort) ─────────
    // Si falla, la actividad ya está creada y la OT transicionada.
    // No revertir: la trazabilidad de tiempo ya quedó registrada.
    let atencionOk = true;
    try {
      const attentionRes = await base44.functions.invoke('updateWorkOrderAttentionStatus', {
        orden_trabajo_id,
        estado_atencion: 'ACTIVO',
        observaciones: `Actividad técnica iniciada: ${tipo_actividad}${subtipo ? ` — ${subtipo}` : ''}`,
      });

      if (!attentionRes || attentionRes.status !== 200) {
        console.warn(`[initTechnicalActivity] updateWorkOrderAttentionStatus retornó ${attentionRes?.status} — no crítico`);
        atencionOk = false;
      } else {
        console.log(`[initTechnicalActivity] estado_atencion actualizado a ACTIVO`);
      }
    } catch (attentionErr) {
      console.warn(`[initTechnicalActivity] updateWorkOrderAttentionStatus excepción (non-fatal): ${attentionErr.message}`);
      atencionOk = false;
    }

    // ── 17. Respuesta unificada ───────────────────────────────────────────────
    // OTEvent (TRANSITION_EN_REVISION) fue creado por transitionWorkOrderStatus en PASO 2.
    console.log(`[initTechnicalActivity] ✓ Flujo completo — OT=${orden_trabajo_id}, actividad=${nuevaActividad.id}`);

    return Response.json({
      success: true,
      idempotent: false,
      message: 'Actividad técnica iniciada correctamente.',
      actividad: nuevaActividad,
      estado_ot: 'EN_REVISION',
      estado_atencion: atencionOk ? 'ACTIVO' : (valoresPrevios.estado_atencion),
      advertencia: atencionOk ? null : 'estado_atencion no pudo actualizarse — actividad y OT transicionadas correctamente.',
      reconciliacion_legacy: recuperacionPostPagoLegacy,
      transition_recovered: transitionRecovered,
      recovered_stale_lock: initLock.recovered_stale_lock === true,
      recovered_ambiguous_lock: initLock.recovered_ambiguous_lock === true,
    });

    } finally {
      try {
        await releaseInitLock(base44, {
          orgId,
          workOrderId: orden_trabajo_id,
          lock: initLock,
        });
      } catch (releaseError) {
        console.error(`[initTechnicalActivity] No se pudo liberar el lock — OT=${orden_trabajo_id}: ${releaseError.message}`);
      }
    }

  } catch (error) {
    console.error(`[initTechnicalActivity] Error no controlado: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
