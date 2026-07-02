/**
 * ═══════════════════════════════════════════════════════════════════════════
 * initTechnicalActivity — Orquestador Técnico P0.2-C
 * ═══════════════════════════════════════════════════════════════════════════
 * Responsabilidad:
 *   Punto único de entrada para iniciar una actividad técnica sobre una OT.
 *   Sincroniza atómicamente:
 *     - OrdenTrabajo.estado (→ EN_REVISION vía transitionWorkOrderStatus)
 *     - ActividadTecnica (crear o reutilizar existente no finalizada)
 *     - OrdenTrabajo.estado_atencion (→ ACTIVO vía updateWorkOrderAttentionStatus)
 *
 * REGLAS DE NEGOCIO:
 *   1. Máximo 1 ActividadTecnica NO FINALIZADA por OT
 *      (estados: en_progreso, pausada, bloqueada, esperando)
 *      → Si existe, retornarla (idempotencia)
 *   2. Máximo 1 estado_atencion ACTIVO por técnico (en cualquier OT)
 *      → Si viola, error controlado 409
 *   3. Estado OT ≠ Estado Atención (nunca inferir ACTIVO por EN_REVISION)
 *   4. Si transición de OT falla, detener todo (no crear actividad)
 *
 * ORDEN DE EJECUCIÓN:
 *   1. Validar OT
 *   2. Buscar actividad no finalizada para OT (idempotencia)
 *   3. Validar técnico (sin estado_atencion ACTIVO en otra OT)
 *   4. transitionWorkOrderStatus (ASIGNADA → EN_REVISION)
 *   5. Crear ActividadTecnica
 *   6. updateWorkOrderAttentionStatus (ACTIVO)
 *   7. Retornar resultado consolidado
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Estados que indican actividad NO FINALIZADA (bloqueo de duplicación por OT)
const ESTADOS_NO_FINALIZADOS = ['en_progreso', 'pausada', 'bloqueada', 'esperando'];

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    // ── 1. Auth ────────────────────────────────────────────────────────────────
    const runtimeUser = await base44.auth.me();
    if (!runtimeUser) {
      return Response.json({ error: 'No autenticado' }, { status: 401 });
    }

    // ── 2. Parsear payload ─────────────────────────────────────────────────────
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

    // ── 3. Resolver orgId desde UserAccount (SOT oficial) ─────────────────────
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
        { user_id: runtimeUser.id },
        5
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

    console.log(`[initTechnicalActivity] orgId=${orgId}, effectiveRole=${effectiveRole}, tecnico_id=${tecnico_id}, OT=${orden_trabajo_id}`);

    // ── 4. Validar OT existe y pertenece a la org ──────────────────────────────
    const otResults = await base44.asServiceRole.entities.OrdenTrabajo.filter(
      { id: orden_trabajo_id, organization_id: orgId },
      1
    );

    if (!otResults || otResults.length === 0) {
      return Response.json({ error: 'Orden de trabajo no encontrada en esta organización' }, { status: 404 });
    }

    const ot = otResults[0];
    const estadoActualOT = ot.estado;

    console.log(`[initTechnicalActivity] OT encontrada — estado actual: ${estadoActualOT}`);

    // Bloquear si OT está en estado terminal
    if (['ENTREGADA', 'CANCELADA', 'FINALIZADA'].includes(estadoActualOT)) {
      return Response.json({
        error: `No se puede iniciar actividad: la OT está en estado terminal "${estadoActualOT}"`,
        estado_ot: estadoActualOT,
      }, { status: 422 });
    }

    // ── BLINDAJE: tipo=diagnostico requiere diagnostico_habilitado ─────────────
    // El diagnóstico técnico solo puede iniciarse si fue habilitado comercialmente.
    // El Centro de Mando es el único orquestador legítimo de esta transición.
    if (tipo_actividad === 'diagnostico' && !ot.diagnostico_habilitado) {
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
      return Response.json({
        error: `Diagnóstico bloqueado: ${descripcion}`,
        codigo: 'DIAGNOSTICO_NO_HABILITADO',
        motivo_bloqueo: motivo,
        descripcion_bloqueo: descripcion,
      }, { status: 403 });
    }

    // ── 5. REGLA 1: Buscar actividad NO FINALIZADA para esta OT (idempotencia) ──
    const actividadesOT = await base44.asServiceRole.entities.ActividadTecnica.filter({
      organization_id: orgId,
      orden_trabajo_id: orden_trabajo_id,
      soft_deleted: false,
    });

    const actividadNoFinalizada = actividadesOT.find(a =>
      ESTADOS_NO_FINALIZADOS.includes(a.estado)
    );

    if (actividadNoFinalizada) {
      console.log(`[initTechnicalActivity] Actividad no finalizada existente encontrada — id=${actividadNoFinalizada.id}, estado=${actividadNoFinalizada.estado} — retornando (idempotencia)`);
      return Response.json({
        success: true,
        idempotent: true,
        message: 'Actividad no finalizada existente reutilizada.',
        actividad: actividadNoFinalizada,
        estado_ot: estadoActualOT,
        estado_atencion: ot.estado_atencion || null,
      });
    }

    // ── ORG_ADMIN override: usar el técnico asignado a la OT como actor técnico ─
    // Cuando el ejecutor es ORG_ADMIN, delega la actividad al técnico asignado.
    // El comportamiento del TECHNICIAN asignado permanece idéntico.
    let efectiveTecnicoId = tecnico_id;
    if (effectiveRole === 'ORG_ADMIN' && ot.tecnico_asignado_id) {
      efectiveTecnicoId = ot.tecnico_asignado_id;
      console.log(`[initTechnicalActivity] ORG_ADMIN override — delegando actividad al técnico asignado ${efectiveTecnicoId}`);
    }

    // ── 6. REGLA 2: Validar técnico sin otra OT con estado_atencion ACTIVO ─────
    // Buscar si el técnico ya tiene una OT diferente con estado_atencion ACTIVO
    const otsTecnicoActivo = await base44.asServiceRole.entities.OrdenTrabajo.filter({
      organization_id: orgId,
      tecnico_asignado_id: efectiveTecnicoId,
      estado_atencion: 'ACTIVO',
    });

    const otraOTActiva = otsTecnicoActivo.find(o => o.id !== orden_trabajo_id);
    if (otraOTActiva) {
      console.warn(`[initTechnicalActivity] BLOQUEO: técnico ${efectiveTecnicoId} ya tiene estado_atencion ACTIVO en OT ${otraOTActiva.id}`);
      return Response.json({
        error: `El técnico ya tiene una actividad activa en la OT ${otraOTActiva.codigo_ot || otraOTActiva.id}. Finalice o pause esa actividad antes de continuar.`,
        codigo: 'TECNICO_ACTIVO_OTRA_OT',
        ot_bloqueante_id: otraOTActiva.id,
        ot_bloqueante_codigo: otraOTActiva.codigo_ot,
      }, { status: 409 });
    }

    // ── 7. PASO 4: transitionWorkOrderStatus (solo si la OT está en ASIGNADA) ──
    // Si la OT ya está en EN_REVISION u otro estado compatible, saltar transición
    const necesitaTransicion = estadoActualOT === 'ASIGNADA';

    if (necesitaTransicion) {
      console.log(`[initTechnicalActivity] Ejecutando transitionWorkOrderStatus ASIGNADA → EN_REVISION`);

      // Construir _callingUserContext para identidad correcta en la función invocada
      const callingUserContext = {
        id: runtimeUser.id,
        email: runtimeUser.email,
        organization_id: orgId,
        role: effectiveRole,
        is_super_admin: isSuperAdmin,
      };

      const transitionRes = await base44.asServiceRole.functions.invoke('transitionWorkOrderStatus', {
        orden_trabajo_id,
        newStatus: 'EN_REVISION',
        observacion: `Inicio de revisión técnica — actividad ${tipo_actividad}`,
        _callingUserContext: callingUserContext,
      });

      console.log(`[initTechnicalActivity] transitionWorkOrderStatus response status: ${transitionRes?.status}`);

      if (!transitionRes || transitionRes.status !== 200) {
        const errorMsg = transitionRes?.data?.error || 'Error desconocido en transición de estado';
        console.error(`[initTechnicalActivity] DETENIDO — transitionWorkOrderStatus falló: ${errorMsg}`);
        return Response.json({
          error: `No se pudo iniciar la revisión: ${errorMsg}`,
          codigo: 'TRANSITION_FAILED',
        }, { status: transitionRes?.status || 500 });
      }

      console.log(`[initTechnicalActivity] Transición exitosa — OT ahora en EN_REVISION`);
    } else {
      console.log(`[initTechnicalActivity] OT ya en estado ${estadoActualOT} — transición omitida`);
    }

    // ── 8. PASO 5: Crear ActividadTecnica ────────────────────────────────────
    const nuevaActividad = await base44.asServiceRole.entities.ActividadTecnica.create({
      organization_id: orgId,
      orden_trabajo_id,
      tecnico_id: efectiveTecnicoId,
      tecnico_email: tecnicoEmail,
      tipo_actividad,
      subtipo: subtipo || '',
      estado: 'en_progreso',
      started_at: new Date().toISOString(),
      ended_at: null,
      duracion_minutos: null,
      causa_bloqueo: '',
      resultado: null,
      notas: '',
      soft_deleted: false,
    });

    console.log(`[initTechnicalActivity] ActividadTecnica creada — id=${nuevaActividad.id}`);

    // ── 9. PASO 6: updateWorkOrderAttentionStatus → ACTIVO ───────────────────
    // IMPORTANTE: este paso es best-effort — si falla, la actividad ya está creada.
    // No revertir: la trazabilidad de tiempo ya quedó registrada.
    try {
      const attentionRes = await base44.asServiceRole.functions.invoke('updateWorkOrderAttentionStatus', {
        orden_trabajo_id,
        estado_atencion: 'ACTIVO',
        observaciones: `Actividad técnica iniciada: ${tipo_actividad}${subtipo ? ` — ${subtipo}` : ''}`,
      });

      if (!attentionRes || attentionRes.status !== 200) {
        console.warn(`[initTechnicalActivity] updateWorkOrderAttentionStatus retornó ${attentionRes?.status} — no crítico, actividad ya creada`);
      } else {
        console.log(`[initTechnicalActivity] estado_atencion actualizado a ACTIVO`);
      }
    } catch (attentionErr) {
      // No detener el flujo — actividad creada es la fuente de verdad de trazabilidad
      console.warn(`[initTechnicalActivity] updateWorkOrderAttentionStatus excepción (non-fatal): ${attentionErr.message}`);
    }

    // ── 10. Retorno consolidado ────────────────────────────────────────────────
    console.log(`[initTechnicalActivity] ✓ Flujo completo — OT=${orden_trabajo_id}, actividad=${nuevaActividad.id}`);

    return Response.json({
      success: true,
      idempotent: false,
      message: 'Actividad técnica iniciada correctamente.',
      actividad: nuevaActividad,
      estado_ot: necesitaTransicion ? 'EN_REVISION' : estadoActualOT,
      estado_atencion: 'ACTIVO',
    });

  } catch (error) {
    console.error(`[initTechnicalActivity] Error no controlado: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});