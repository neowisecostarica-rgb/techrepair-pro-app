/**
 * ═══════════════════════════════════════════════════════════════════════════
 * initTechnicalActivity — Orquestador Técnico P0.2-C (WF-003B)
 * ═══════════════════════════════════════════════════════════════════════════
 * RESPONSABILIDAD:
 *   Punto único de entrada para iniciar una actividad técnica sobre una OT.
 *   El frontend realiza una única solicitud; el backend valida y persiste.
 *
 * ORDEN DE PERSISTENCIA (no atómica — ver limitaciones):
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
 * LIMITACIONES ACEPTADAS (MVP):
 *   - No existen transacciones multidocumento en Base44
 *   - No existe bloqueo concurrente garantizado
 *   - La consulta previa solo ofrece idempotencia secuencial
 *   - Las compensaciones son best-effort; no se borran actividades automáticamente
 *   - No existe idempotency_key
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const ESTADO_ACTIVO = 'en_progreso';
const ESTADOS_OT_PERMITIDOS = ['ASIGNADA', 'EN_COLA_REVISION', 'EN_REVISION'];
const ROLES_ADMIN = ['ORG_ADMIN', 'BRANCH_ADMIN', 'SUPER_ADMIN'];

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

      let account = orgHint
        ? (userAccounts.find(a => a.organization_id === orgHint) || userAccounts[0])
        : userAccounts[0];

      if (account.status === 'suspended') {
        return Response.json({ error: 'Cuenta suspendida' }, { status: 403 });
      }

      orgId = account.organization_id;
      effectiveRole = account.role;
      tecnicoEmail = account.user_email || runtimeUser.email;
    }

    if (!orgId) {
      return Response.json({ error: 'organization_id no resuelto' }, { status: 403 });
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
      // TECHNICIAN debe ser el técnico asignado a la OT
      if (tecnico_id !== ot.tecnico_asignado_id) {
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
    if (actividadMismoTecnico) {
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
    // Si EN_REVISION y no existe NINGÚN registro de actividad (ni activa ni finalizada),
    // la OT llegó a EN_REVISION por una vía anómala → error controlado.
    // Si existen actividades finalizada/bloqueada, se permite crear una nueva.
    if (estadoActualOT === 'EN_REVISION' && actividadesOT.length === 0) {
      console.warn(`[initTechnicalActivity] INCONSISTENCIA: EN_REVISION sin actividades — OT=${orden_trabajo_id}`);
      return Response.json({
        error: 'Inconsistencia detectada: la OT está en EN_REVISION pero no tiene ninguna actividad técnica registrada. Requiere corrección controlada.',
        codigo: 'EN_REVISION_SIN_ACTIVIDAD',
        estado_ot: estadoActualOT,
      }, { status: 409 });
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
    // PERSISTENCIA — orden autorizado, no atómico
    // ══════════════════════════════════════════════════════════════════════════

    const estadoOTPrevio = estadoActualOT;
    const necesitaTransicion = estadoActualOT !== 'EN_REVISION';

    // ── 13. Conservar valores previos (para reporte de estado residual) ───────
    const valoresPrevios = {
      estado_ot: estadoOTPrevio,
      estado_atencion: ot.estado_atencion || null,
    };

    // ── 14. PASO 1: Crear ActividadTecnica ───────────────────────────────────
    let nuevaActividad;
    try {
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
    if (necesitaTransicion) {
      const callingUserContext = {
        id: runtimeUser.id,
        email: runtimeUser.email,
        organization_id: orgId,
        role: effectiveRole,
        is_super_admin: isSuperAdmin,
      };

      let transitionOk = false;
      let transitionErrorMsg = null;

      try {
        const transitionRes = await base44.asServiceRole.functions.invoke('transitionWorkOrderStatus', {
          orden_trabajo_id,
          newStatus: 'EN_REVISION',
          observacion: `Inicio de revisión técnica — actividad ${tipo_actividad}`,
          _callingUserContext: callingUserContext,
        });

        if (transitionRes && transitionRes.status === 200) {
          transitionOk = true;
          console.log(`[initTechnicalActivity] Transición exitosa — OT ahora en EN_REVISION`);
        } else {
          transitionErrorMsg = transitionRes?.data?.error || 'Error desconocido en transición';
          console.error(`[initTechnicalActivity] transitionWorkOrderStatus falló: ${transitionErrorMsg}`);
        }
      } catch (transErr) {
        transitionErrorMsg = transErr.message;
        console.error(`[initTechnicalActivity] transitionWorkOrderStatus excepción: ${transitionErrorMsg}`);
      }

      if (!transitionOk) {
        // ESTADO RESIDUAL: Actividad creada, OT NO transicionada.
        // No borrar la actividad (no hay operación segura confirmada).
        console.error(`[initTechnicalActivity] ESTADO RESIDUAL — actividad=${nuevaActividad.id}, OT sigue en ${estadoOTPrevio}`);
        return Response.json({
          error: `No se pudo iniciar la revisión: ${transitionErrorMsg}`,
          codigo: 'TRANSITION_FAILED',
          paso_fallido: 'transicion_ot',
          estado_residual: {
            actividad_creada: true,
            actividad_id: nuevaActividad.id,
            ot_transicionada: false,
            estado_ot_actual: estadoOTPrevio,
            nota: 'La actividad fue creada pero la OT no transicionó. Requiere corrección controlada.',
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
      const attentionRes = await base44.asServiceRole.functions.invoke('updateWorkOrderAttentionStatus', {
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
    });

  } catch (error) {
    console.error(`[initTechnicalActivity] Error no controlado: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});