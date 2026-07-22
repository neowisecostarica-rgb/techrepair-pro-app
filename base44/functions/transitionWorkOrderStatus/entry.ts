import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ─── STATE MACHINE OFICIAL ────────────────────────────────────────────────────
const ALLOWED_TRANSITIONS = {
  EN_COLA_REVISION: ['ASIGNADA', 'CANCELADA'],
  ASIGNADA:         ['EN_REVISION', 'CANCELADA'],
  EN_REVISION:      ['DIAGNOSTICADA', 'CANCELADA'],
  DIAGNOSTICADA:    ['COTIZADA', 'APROBADA', 'CANCELADA'],
  COTIZADA:         ['APROBADA', 'CANCELADA'],
  APROBADA:         ['EN_REPARACION', 'CANCELADA'],
  EN_REPARACION:    ['PRUEBAS', 'CANCELADA'],
  PRUEBAS:          ['FINALIZADA', 'EN_REPARACION'],
  FINALIZADA:       ['ENTREGADA'],
  ENTREGADA:        [],
  CANCELADA:        [],
};

const IRREVERSIBLE_STATES = ['ENTREGADA', 'CANCELADA'];

const AUTHORIZED_ROLES_FOR_TARGET = {
  ASIGNADA:      ['ORG_ADMIN', 'BRANCH_ADMIN'],
  EN_REVISION:   ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'],
  DIAGNOSTICADA: ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'],
  COTIZADA:      ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES'],
  APROBADA:      ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES'],
  EN_REPARACION: ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'],
  PRUEBAS:       ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'],
  FINALIZADA:    ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'],
  ENTREGADA:     ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES'],
  CANCELADA:     ['ORG_ADMIN', 'BRANCH_ADMIN'],
};

function validatePayloadForTarget(targetStatus, ot, extra) {
  switch (targetStatus) {
    case 'ASIGNADA':
      if (!extra?.tecnico_asignado_id && !ot.tecnico_asignado_id) {
        return 'Se requiere tecnico_asignado_id para asignar la OT';
      }
      break;
    case 'EN_REVISION':
      if (!ot.tecnico_asignado_id && !extra?.tecnico_asignado_id) {
        return 'La OT debe tener un técnico asignado para iniciar revisión';
      }
      break;
    case 'APROBADA':
      break;
    case 'EN_REPARACION':
      if (!ot.tecnico_asignado_id) {
        return 'La OT debe tener un técnico asignado para iniciar reparación';
      }
      // GUARDA COMERCIAL P0.2-C: Requiere aprobación del cliente
      if (extra?._aprobacion_cliente_verificada !== true) {
        return 'EN_REPARACION_SIN_APROBACION';
      }
      break;
    case 'ENTREGADA':
      if (!extra?.ventas_pagadas_verificadas) {
        return 'ENTREGADA: se requiere al menos una Venta en estado "pagada" asociada a esta OT';
      }
      break;
    default:
      break;
  }
  return null;
}

async function completeDiagnosticWorkflow({
  base44,
  ot,
  orgId,
  effectiveUser,
  effectiveRole,
  diagnosticoId,
  diagnosticoResumido,
}) {
  const diagnosticoFilter = diagnosticoId
    ? { id: diagnosticoId, organization_id: orgId, orden_trabajo_id: ot.id }
    : { organization_id: orgId, orden_trabajo_id: ot.id };
  const diagnosticos = await base44.asServiceRole.entities.DiagnosticoTecnico.filter(diagnosticoFilter, 10);
  const diagnostico = diagnosticoId
    ? diagnosticos?.[0]
    : (diagnosticos?.find(d => d.bloqueado !== true) || diagnosticos?.[0]);

  if (!diagnostico) {
    return Response.json({
      error: 'No existe un diagnóstico técnico para esta OT.',
      code: 'DIAGNOSTICADA_SIN_DIAGNOSTICO_TECNICO',
    }, { status: 422 });
  }

  if (effectiveRole === 'TECHNICIAN' && diagnostico.tecnico_id !== effectiveUser.id) {
    return Response.json({
      error: 'No autorizado: este diagnóstico pertenece a otro técnico.',
      code: 'TECHNICIAN_OWNERSHIP_REQUIRED',
    }, { status: 403 });
  }

  const [documentos, actividades, eventos] = await Promise.all([
    base44.asServiceRole.entities.DiagnosticoDocumento.filter({
      diagnostico_id: diagnostico.id,
      organization_id: orgId,
    }, 10),
    base44.asServiceRole.entities.ActividadTecnica.filter({
      organization_id: orgId,
      orden_trabajo_id: ot.id,
      soft_deleted: false,
    }, 20),
    base44.asServiceRole.entities.OTEvent.filter({
      organization_id: orgId,
      orden_trabajo_id: ot.id,
      tipo: 'TRANSITION_DIAGNOSTICADA',
    }, 5),
  ]);

  const documentoEmitido = documentos?.find(d => d.estado === 'EMITIDO' || d.estado === 'ENVIADO');
  const todasEnProgreso = (actividades || []).filter(a => a.estado === 'en_progreso');
  const actividadesAsignadas = (actividades || []).filter(a => a.tecnico_id === ot.tecnico_asignado_id);
  const actividadesEnProgreso = actividadesAsignadas.filter(a => a.estado === 'en_progreso');
  const actividadFinalizada = actividadesAsignadas.find(a => a.estado === 'finalizada');
  const eventoExistente = eventos?.[0] || null;

  // CC-002-04: un retry posterior al éxito no vuelve a mutar ni crea eventos.
  if (ot.estado === 'DIAGNOSTICADA') {
    const estadoFinalCoherente = diagnostico.estado === 'listo_aprobacion'
      && diagnostico.bloqueado === true
      && diagnostico.credito_consumido_finalizacion === true
      && Boolean(documentoEmitido)
      && todasEnProgreso.length === 0
      && Boolean(actividadFinalizada)
      && Boolean(eventoExistente);

    if (!estadoFinalCoherente) {
      return Response.json({
        error: 'La OT figura como DIAGNOSTICADA, pero sus registros de finalización no son coherentes.',
        code: 'DIAGNOSTICO_COMPLETION_INCONSISTENT',
      }, { status: 409 });
    }

    return Response.json({
      success: true,
      idempotent: true,
      code: 'DIAGNOSTICO_COMPLETADO',
      orden_trabajo_id: ot.id,
      previous_status: 'DIAGNOSTICADA',
      new_status: 'DIAGNOSTICADA',
      orden_trabajo: ot,
      diagnostico,
      actividad: actividadFinalizada,
      documento: documentoEmitido,
    });
  }

  if (ot.estado !== 'EN_REVISION') {
    return Response.json({
      error: `La OT debe estar en EN_REVISION para completar el diagnóstico. Estado actual: ${ot.estado}.`,
      code: 'ESTADO_OT_INVALIDO_DIAGNOSTICO',
    }, { status: 422 });
  }

  if (diagnostico.bloqueado === true) {
    return Response.json({
      error: 'El diagnóstico técnico ya está bloqueado y no puede completarse nuevamente.',
      code: 'DIAGNOSTICO_TECNICO_NO_EDITABLE',
    }, { status: 409 });
  }

  const diagnosticoCompleto = diagnostico.estado === 'listo_aprobacion'
    && Boolean(diagnostico.tipo_intervencion)
    && Boolean(diagnostico.trabajo_recomendado?.trim())
    && Number(diagnostico.tiempo_estimado_horas) > 0;
  if (!diagnosticoCompleto) {
    return Response.json({
      error: 'El diagnóstico técnico está incompleto. Debe estar listo para aprobación e incluir intervención, trabajo recomendado y tiempo estimado.',
      code: 'DIAGNOSTICO_TECNICO_INCOMPLETO',
    }, { status: 422 });
  }

  if (!documentoEmitido) {
    return Response.json({
      error: 'Se requiere un Documento de Diagnóstico en estado EMITIDO o ENVIADO antes de completar el diagnóstico.',
      code: 'DIAGNOSTICADA_SIN_DOCUMENTO_EMITIDO',
    }, { status: 422 });
  }

  if (eventoExistente) {
    return Response.json({
      error: 'Existe un evento de diagnóstico completado para una OT que aún está en revisión.',
      code: 'DIAGNOSTICO_COMPLETION_INCONSISTENT',
    }, { status: 409 });
  }

  if (todasEnProgreso.some(a => a.tecnico_id !== ot.tecnico_asignado_id)) {
    return Response.json({
      error: 'Existe una actividad en progreso que no pertenece al técnico asignado a la OT.',
      code: 'ACTIVIDAD_TECNICA_INCONSISTENTE',
    }, { status: 409 });
  }

  if (actividadesEnProgreso.length === 0) {
    if (actividadFinalizada) {
      return Response.json({
        error: 'La actividad técnica ya está finalizada, pero la OT continúa en revisión.',
        code: 'ACTIVIDAD_TECNICA_YA_FINALIZADA',
      }, { status: 409 });
    }
    return Response.json({
      error: 'No existe una actividad técnica en progreso para completar.',
      code: 'ACTIVIDAD_TECNICA_NO_ENCONTRADA',
    }, { status: 422 });
  }

  if (actividadesEnProgreso.length > 1) {
    return Response.json({
      error: 'Existe más de una actividad técnica en progreso para esta OT.',
      code: 'ACTIVIDAD_TECNICA_MULTIPLE',
    }, { status: 409 });
  }

  const actividad = actividadesEnProgreso[0];
  const now = new Date().toISOString();
  const previousOT = {
    estado: ot.estado,
    ultima_actividad: ot.ultima_actividad || null,
    ultima_actividad_at: ot.ultima_actividad_at || null,
    fecha_diagnostico: ot.fecha_diagnostico || null,
    diagnostico_resumido: ot.diagnostico_resumido || null,
  };
  const previousActividad = {
    estado: actividad.estado,
    ended_at: actividad.ended_at || null,
    duracion_minutos: actividad.duracion_minutos ?? null,
  };
  const previousDiagnostico = {
    estado: diagnostico.estado,
    fecha_completado: diagnostico.fecha_completado || null,
    bloqueado: diagnostico.bloqueado === true,
    credito_consumido_finalizacion: diagnostico.credito_consumido_finalizacion === true,
  };

  let otMutada = false;
  let actividadMutada = false;
  let diagnosticoMutado = false;
  let creacionEventoIntentada = false;

  try {
    const otUpdate = {
      estado: 'DIAGNOSTICADA',
      ultima_actividad: 'Diagnóstico técnico completado',
      ultima_actividad_at: now,
      fecha_diagnostico: now,
    };
    if (typeof diagnosticoResumido === 'string' && diagnosticoResumido.trim()) {
      otUpdate.diagnostico_resumido = diagnosticoResumido.trim();
    }
    otMutada = true;
    const updatedOT = await base44.asServiceRole.entities.OrdenTrabajo.update(ot.id, otUpdate);

    actividadMutada = true;
    const updatedActividad = await base44.asServiceRole.entities.ActividadTecnica.update(actividad.id, {
      estado: 'finalizada',
      ended_at: now,
      duracion_minutos: actividad.started_at
        ? Math.max(0, Math.round((new Date(now).getTime() - new Date(actividad.started_at).getTime()) / 60000))
        : null,
    });

    diagnosticoMutado = true;
    const updatedDiagnostico = await base44.asServiceRole.entities.DiagnosticoTecnico.update(diagnostico.id, {
      estado: 'listo_aprobacion',
      fecha_completado: now,
      bloqueado: true,
      credito_consumido_finalizacion: true,
    });

    // Revalidar justo antes de crear reduce duplicados en reintentos solapados.
    // La consulta inicial sigue detectando eventos incoherentes antes de mutar.
    const eventosAntesDeCrear = await base44.asServiceRole.entities.OTEvent.filter({
      organization_id: orgId,
      orden_trabajo_id: ot.id,
      tipo: 'TRANSITION_DIAGNOSTICADA',
    }, 1);
    let event = eventosAntesDeCrear?.[0];
    if (!event) {
      creacionEventoIntentada = true;
      event = await base44.asServiceRole.entities.OTEvent.create({
        organization_id: orgId,
        orden_trabajo_id: ot.id,
        tipo: 'TRANSITION_DIAGNOSTICADA',
        created_by_user_id: effectiveUser.id,
        processed: false,
        created_at: now,
      });
    }

    return Response.json({
      success: true,
      idempotent: false,
      code: 'DIAGNOSTICO_COMPLETADO',
      orden_trabajo_id: ot.id,
      previous_status: 'EN_REVISION',
      new_status: 'DIAGNOSTICADA',
      updated_at: now,
      updated_by: effectiveUser.email,
      updated_by_role: effectiveRole,
      orden_trabajo: updatedOT,
      diagnostico: updatedDiagnostico,
      actividad: updatedActividad,
      documento: documentoEmitido,
      event_id: event.id,
    });
  } catch (mutationError) {
    const compensationErrors = [];

    // Si create confirmó por servidor pero falló la respuesta, retirar únicamente
    // el evento identificable de este intento antes de restaurar las entidades.
    if (creacionEventoIntentada) {
      try {
        const eventosDelIntento = await base44.asServiceRole.entities.OTEvent.filter({
          organization_id: orgId,
          orden_trabajo_id: ot.id,
          tipo: 'TRANSITION_DIAGNOSTICADA',
          created_by_user_id: effectiveUser.id,
          created_at: now,
        }, 5);
        for (const evento of eventosDelIntento || []) {
          await base44.asServiceRole.entities.OTEvent.delete(evento.id);
        }
      } catch (error) {
        compensationErrors.push(`evento: ${error.message}`);
      }
    }

    if (diagnosticoMutado) {
      try {
        await base44.asServiceRole.entities.DiagnosticoTecnico.update(diagnostico.id, previousDiagnostico);
      } catch (error) {
        compensationErrors.push(`diagnostico: ${error.message}`);
      }
    }
    if (actividadMutada) {
      try {
        await base44.asServiceRole.entities.ActividadTecnica.update(actividad.id, previousActividad);
      } catch (error) {
        compensationErrors.push(`actividad: ${error.message}`);
      }
    }
    if (otMutada) {
      try {
        await base44.asServiceRole.entities.OrdenTrabajo.update(ot.id, previousOT);
      } catch (error) {
        compensationErrors.push(`orden_trabajo: ${error.message}`);
      }
    }

    if (compensationErrors.length > 0) {
      return Response.json({
        error: 'Falló la finalización del diagnóstico y una o más compensaciones no pudieron completarse.',
        code: 'DIAGNOSTICO_COMPLETION_ROLLBACK_FAILED',
        original_error: mutationError.message,
        compensation_errors: compensationErrors,
      }, { status: 500 });
    }

    return Response.json({
      error: `No se pudo completar el diagnóstico: ${mutationError.message}`,
      code: 'DIAGNOSTICO_COMPLETION_FAILED',
      rolled_back: true,
    }, { status: 500 });
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── 1. Auth — obtener runtimeUser del contexto de ejecución inmediato ──────
    const runtimeUser = await base44.auth.me();
    console.log(`[DIAG:transition] ===== INICIO FUNCIÓN =====`);
    console.log(`[DIAG:transition] RAW runtimeUser completo:`, JSON.stringify(runtimeUser, null, 2));
    console.log(`[DIAG:transition] runtimeUser.id:`, runtimeUser?.id);
    console.log(`[DIAG:transition] runtimeUser.email:`, runtimeUser?.email);
    console.log(`[DIAG:transition] runtimeUser.role (base44 app level):`, runtimeUser?.role);
    console.log(`[DIAG:transition] runtimeUser.organization_id:`, runtimeUser?.organization_id);
    console.log(`[DIAG:transition] runtimeUser.impersonating_org_id:`, runtimeUser?.impersonating_org_id);
    console.log(`[DIAG:transition] runtimeUser.is_super_admin:`, runtimeUser?.is_super_admin);
    console.log(`[DIAG:transition] runtimeUser.data completo:`, JSON.stringify(runtimeUser?.data, null, 2));

    if (!runtimeUser) {
      return Response.json({ error: 'No autenticado' }, { status: 401 });
    }

    // ── 2. Parsear body ────────────────────────────────────────────────────────
    const body = await req.json();
    const {
      orden_trabajo_id,
      newStatus,
      observacion,
      tecnico_asignado_id,
      tecnico_asignado_email,
      diagnostico_id,
      diagnostico_resumido,
    } = body;

    // ── 3. Resolver identidad efectiva ────────────────────────────────────────
    // El request body nunca es una fuente confiable de identidad. Las llamadas
    // internas deben conservar el contexto de la sesión original; esta función
    // resuelve siempre organización y rol desde runtimeUser/UserAccount.
    let effectiveUser;
    let orgId;
    let effectiveRole;
    let isSuperAdmin;

    isSuperAdmin = runtimeUser.is_super_admin === true || runtimeUser.data?.is_super_admin === true;
    if (isSuperAdmin) {
      orgId = runtimeUser.impersonating_org_id || runtimeUser.organization_id;
      effectiveRole = 'SUPER_ADMIN';
      effectiveUser = runtimeUser;
    } else {
      const orgHint = runtimeUser.impersonating_org_id || runtimeUser.organization_id || null;
      const userAccounts = await base44.asServiceRole.entities.UserAccount.filter({ user_id: runtimeUser.id }, 5);
      if (!userAccounts || userAccounts.length === 0) {
        return Response.json({ error: 'UserAccount no encontrado para este usuario' }, { status: 403 });
      }
      const account = orgHint
        ? (userAccounts.find(a => a.organization_id === orgHint) || userAccounts[0])
        : userAccounts[0];
      if (account.status !== 'active') {
        return Response.json({ error: 'Cuenta no activa' }, { status: 403 });
      }
      orgId = account.organization_id;
      effectiveRole = account.role;
      effectiveUser = runtimeUser;
    }

    if (!orgId) {
      return Response.json({ error: 'organization_id no resuelto para este usuario' }, { status: 403 });
    }

    if (!orden_trabajo_id) {
      return Response.json({ error: 'orden_trabajo_id es obligatorio' }, { status: 400 });
    }
    if (!newStatus) {
      return Response.json({ error: 'newStatus es obligatorio' }, { status: 400 });
    }
    if (!ALLOWED_TRANSITIONS.hasOwnProperty(newStatus)) {
      return Response.json({
        error: `Estado destino inválido: "${newStatus}". Estados válidos: ${Object.keys(ALLOWED_TRANSITIONS).join(', ')}`,
      }, { status: 400 });
    }

    // ── 5. Cargar OT y validar ownership ─────────────────────────────────────
    const ordenes = await base44.asServiceRole.entities.OrdenTrabajo.filter({
      id: orden_trabajo_id,
      organization_id: orgId,
    }, 1);

    if (!ordenes || ordenes.length === 0) {
      return Response.json({ error: 'Orden de trabajo no encontrada en esta organización' }, { status: 404 });
    }

    const ot = ordenes[0];
    const currentStatus = ot.estado;

    // CC-001-01: un técnico solo puede operar la OT que tiene asignada.
    // Esta guarda se ejecuta antes de cualquier mutación, evento o side-effect.
    if (effectiveRole === 'TECHNICIAN' && runtimeUser.id !== ot.tecnico_asignado_id) {
      return Response.json({
        error: 'No autorizado: esta Orden de Trabajo está asignada a otro técnico.',
        code: 'TECHNICIAN_OWNERSHIP_REQUIRED',
      }, { status: 403 });
    }

    // CC-002: la finalización diagnóstica es una operación compuesta propiedad
    // del backend. Sale antes del pipeline genérico para evitar dobles mutaciones.
    if (newStatus === 'DIAGNOSTICADA') {
      const rolesPermitidos = AUTHORIZED_ROLES_FOR_TARGET.DIAGNOSTICADA;
      if (!isSuperAdmin && !rolesPermitidos.includes(effectiveRole)) {
        return Response.json({
          error: `Tu rol "${effectiveRole}" no tiene permiso para completar el diagnóstico.`,
          required_roles: rolesPermitidos,
          user_role: effectiveRole,
        }, { status: 403 });
      }

      return completeDiagnosticWorkflow({
        base44,
        ot,
        orgId,
        effectiveUser,
        effectiveRole,
        diagnosticoId: diagnostico_id,
        diagnosticoResumido: diagnostico_resumido,
      });
    }

    // ── 6. Bloqueo de estados irreversibles ───────────────────────────────────
    if (IRREVERSIBLE_STATES.includes(currentStatus)) {
      return Response.json({
        error: `La OT está en estado "${currentStatus}" y no puede ser modificada. Este estado es irreversible.`,
        current_status: currentStatus,
      }, { status: 422 });
    }

    // ── 7. Validar transición permitida en state machine ──────────────────────
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      return Response.json({
        error: `Transición no permitida: "${currentStatus}" → "${newStatus}". Transiciones válidas desde "${currentStatus}": [${allowed.join(', ') || 'ninguna'}]`,
        current_status: currentStatus,
        target_status: newStatus,
        allowed_targets: allowed,
      }, { status: 422 });
    }

    // ── 8. Validar rol para el estado destino ─────────────────────────────────
    if (!isSuperAdmin) {
      const rolesPermitidos = AUTHORIZED_ROLES_FOR_TARGET[newStatus];
      console.log(`[DIAG:transition] Validando rol para target '${newStatus}' — rolesPermitidos:`, rolesPermitidos, `— effectiveRole:`, effectiveRole);
      if (rolesPermitidos && !rolesPermitidos.includes(effectiveRole)) {
        console.error(`[DIAG:transition] *** 403: rol '${effectiveRole}' no permitido para '${newStatus}' — rolesPermitidos: [${rolesPermitidos.join(', ')}] ***`);
        return Response.json({
          error: `Tu rol "${effectiveRole}" no tiene permiso para mover la OT a "${newStatus}". Roles permitidos: [${rolesPermitidos.join(', ')}]`,
          required_roles: rolesPermitidos,
          user_role: effectiveRole,
        }, { status: 403 });
      }
    }

    // ── 9. Validar datos mínimos requeridos ───────────────────────────────────
    const extra = { tecnico_asignado_id, tecnico_asignado_email };

    // ── GUARDA P0.2-C: EN_REPARACION requiere aprobación del cliente ──────────
    if (newStatus === 'EN_REPARACION') {
      const diagActivos = await base44.asServiceRole.entities.DiagnosticoTecnico.filter({
        orden_trabajo_id: orden_trabajo_id,
        bloqueado: false,
      }, 1);
      const diagId = diagActivos?.[0]?.id;

      if (diagId) {
        const docs = await base44.asServiceRole.entities.DiagnosticoDocumento.filter({
          diagnostico_id: diagId,
        }, 5);
        const docConAprobacion = docs?.find(d => d.aprobacion_status === 'APROBADA');

        if (!docConAprobacion) {
          return Response.json({
            error: 'Se requiere la aprobación del cliente antes de iniciar la reparación. Registra la aprobación en el Expediente → Panel Operativo.',
            code: 'EN_REPARACION_SIN_APROBACION_CLIENTE',
          }, { status: 422 });
        }
        extra._aprobacion_cliente_verificada = true;
      }
    }

    if (newStatus === 'ENTREGADA') {
      const ventasPagadas = await base44.asServiceRole.entities.Venta.filter({
        organization_id: orgId,
        referencia_ot_id: orden_trabajo_id,
        estado: 'pagada',
      }, 1);

      if (!ventasPagadas || ventasPagadas.length === 0) {
        console.warn(`[transitionWorkOrderStatus] BLOQUEADO ENTREGADA — sin venta pagada. OT: ${orden_trabajo_id}`);
        return Response.json({
          error: 'No se puede entregar la OT: no existe ninguna Venta en estado "pagada" asociada a esta orden de trabajo. Realice el cobro en el Punto de Venta antes de continuar.',
          code: 'ENTREGADA_SIN_PAGO',
          orden_trabajo_id,
        }, { status: 422 });
      }

      extra.ventas_pagadas_verificadas = true;
    }

    const validationError = validatePayloadForTarget(newStatus, ot, extra);
    if (validationError) {
      return Response.json({ error: validationError }, { status: 422 });
    }

    // ── 10. Construir payload de actualización ────────────────────────────────
    const now = new Date().toISOString();
    const updatePayload = {
      estado: newStatus,
      ultima_actividad: observacion || `Estado cambiado a ${newStatus}`,
      ultima_actividad_at: now,
    };

    if (newStatus === 'ASIGNADA' && tecnico_asignado_id) {
      updatePayload.tecnico_asignado_id = tecnico_asignado_id;
      if (tecnico_asignado_email) {
        updatePayload.tecnico_asignado_email = tecnico_asignado_email;
      }
    }
    if (newStatus === 'EN_REVISION') {
      updatePayload.fecha_revision_inicio = updatePayload.fecha_revision_inicio || now;
    }
    if (newStatus === 'FINALIZADA') {
      updatePayload.fecha_cierre = now;
    }

    // ── 11. Ejecutar actualización ────────────────────────────────────────────
    const updatedOT = await base44.asServiceRole.entities.OrdenTrabajo.update(orden_trabajo_id, updatePayload);

    // ── 12. OTEvent ───────────────────────────────────────────────────────────
    const CANONICAL_EVENTS = ['FINALIZADA', 'ENTREGADA', 'CANCELADA'];
    const TRANSITION_EVENT_MAP = {
      ASIGNADA:      'TRANSITION_ASIGNADA',
      EN_REVISION:   'TRANSITION_EN_REVISION',
      COTIZADA:      'TRANSITION_COTIZADA',
      APROBADA:      'TRANSITION_APROBADA',
      EN_REPARACION: 'TRANSITION_EN_REPARACION',
      PRUEBAS:       'TRANSITION_PRUEBAS',
    };

    try {
      const isCanonical = CANONICAL_EVENTS.includes(newStatus);
      const transitionType = TRANSITION_EVENT_MAP[newStatus];

      if (isCanonical) {
      const existingCanonical = await base44.asServiceRole.entities.OTEvent.filter({
        orden_trabajo_id: orden_trabajo_id,
        tipo: newStatus,
      }, 1);
      if (!existingCanonical || existingCanonical.length === 0) {
        await base44.asServiceRole.entities.OTEvent.create({
          organization_id: orgId,
          orden_trabajo_id: orden_trabajo_id,
          tipo: newStatus,
          created_by_user_id: effectiveUser.id,
          processed: false,
          created_at: now,
        });
        console.log(`[transitionWorkOrderStatus] OTEvent canónico ${newStatus} — OT: ${orden_trabajo_id}`);
      } else {
        console.log(`[transitionWorkOrderStatus] OTEvent canónico ${newStatus} ya existe (idempotencia) — OT: ${orden_trabajo_id}`);
      }
      }

      if (transitionType) {
      await base44.asServiceRole.entities.OTEvent.create({
        organization_id: orgId,
        orden_trabajo_id: orden_trabajo_id,
        tipo: transitionType,
        created_by_user_id: effectiveUser.id,
        processed: false,
        created_at: now,
      });
        console.log(`[transitionWorkOrderStatus] OTEvent ${transitionType} — OT: ${orden_trabajo_id}`);
      }

    } catch (traceError) {
      console.warn('[transitionWorkOrderStatus] trazabilidad_fallida:', traceError.message);
    }

    console.log(`[transitionWorkOrderStatus] OK — OT: ${orden_trabajo_id}, ${currentStatus} → ${newStatus}, usuario: ${effectiveUser.email}, rol: ${effectiveRole}`);
    console.log(`[DIAG:transition] ===== RESPUESTA EXITOSA — effectiveUser.id=${effectiveUser?.id}, email=${effectiveUser?.email}, effectiveRole=${effectiveRole}, orgId=${orgId} =====`);

    return Response.json({
      success: true,
      orden_trabajo_id,
      previous_status: currentStatus,
      new_status: newStatus,
      updated_at: now,
      updated_by: effectiveUser.email,
      updated_by_role: effectiveRole,
      orden_trabajo: updatedOT,
    });

  } catch (error) {
    console.error('[transitionWorkOrderStatus] Error:', error.message);
    console.error(`[DIAG:transition] *** CATCH — error.stack:`, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
