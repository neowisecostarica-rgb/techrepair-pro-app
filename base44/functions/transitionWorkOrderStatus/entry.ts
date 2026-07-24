import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

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

const LIFECYCLE_LOCK_TTL_MS = 15 * 60 * 1000;

function workflowError(message, code, status = 409) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

async function loadWorkOrder(base44, orgId, workOrderId) {
  const records = await base44.asServiceRole.entities.OrdenTrabajo.filter({
    id: workOrderId,
    organization_id: orgId,
  });
  return records?.[0] || null;
}

async function acquireLifecycleLock({
  base44,
  ot,
  orgId,
  effectiveUser,
  operation,
  requestedToken = null,
}) {
  const current = await loadWorkOrder(base44, orgId, ot.id);
  if (!current) return { acquired: false, code: 'ORDEN_TRABAJO_NOT_FOUND' };

  if (requestedToken) {
    const borrowed = current.lifecycle_lock_token === requestedToken
      && current.lifecycle_lock_operation === 'initTechnicalActivity'
      && current.lifecycle_lock_owner_user_id === effectiveUser.id;
    return borrowed
      ? { acquired: true, token: requestedToken, owned: false, ot: current }
      : { acquired: false, code: 'LIFECYCLE_LOCK_INVALID' };
  }

  const token = crypto.randomUUID();
  const now = new Date().toISOString();
  const lockData = {
    lifecycle_lock_token: token,
    lifecycle_lock_operation: operation,
    lifecycle_lock_owner_user_id: effectiveUser.id,
    lifecycle_lock_at: now,
  };

  let claim;
  try {
    claim = await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
      id: ot.id,
      organization_id: orgId,
      $or: [
        { lifecycle_lock_token: { $exists: false } },
        { lifecycle_lock_token: null },
      ],
    }, { $set: lockData });
  } catch (claimError) {
    const reconciled = await loadWorkOrder(base44, orgId, ot.id);
    if (reconciled?.lifecycle_lock_token === token) {
      return {
        acquired: true,
        token,
        owned: true,
        recovered_ambiguous_lock: true,
        ot: reconciled,
      };
    }
    throw claimError;
  }

  if (claim?.updated === 1) {
    return { acquired: true, token, owned: true, ot: { ...current, ...lockData } };
  }

  const locked = await loadWorkOrder(base44, orgId, ot.id);
  const lockTimestamp = Date.parse(locked?.lifecycle_lock_at || '');
  const lockIsStale = locked?.lifecycle_lock_token
    && Number.isFinite(lockTimestamp)
    && Date.now() - lockTimestamp > LIFECYCLE_LOCK_TTL_MS;

  if (lockIsStale) {
    let takeover;
    try {
      takeover = await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
        id: ot.id,
        organization_id: orgId,
        lifecycle_lock_token: locked.lifecycle_lock_token,
        lifecycle_lock_at: locked.lifecycle_lock_at,
      }, { $set: lockData });
    } catch (takeoverError) {
      const reconciled = await loadWorkOrder(base44, orgId, ot.id);
      if (reconciled?.lifecycle_lock_token === token) {
        return {
          acquired: true,
          token,
          owned: true,
          recovered_stale_lock: true,
          recovered_ambiguous_lock: true,
          ot: reconciled,
        };
      }
      throw takeoverError;
    }

    if (takeover?.updated === 1) {
      return {
        acquired: true,
        token,
        owned: true,
        recovered_stale_lock: true,
        ot: { ...locked, ...lockData },
      };
    }
  }

  return {
    acquired: false,
    code: 'LIFECYCLE_OPERATION_IN_PROGRESS',
    operation: locked?.lifecycle_lock_operation || null,
  };
}

async function renewLifecycleLock(base44, orgId, workOrderId, lock) {
  const heartbeat = new Date().toISOString();
  try {
    const renewed = await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
      id: workOrderId,
      organization_id: orgId,
      lifecycle_lock_token: lock.token,
    }, { $set: { lifecycle_lock_at: heartbeat } });

    if (renewed?.updated === 1) return heartbeat;
  } catch (renewError) {
    const reconciled = await loadWorkOrder(base44, orgId, workOrderId);
    if (reconciled?.lifecycle_lock_token === lock.token) return reconciled.lifecycle_lock_at;
    throw renewError;
  }

  const current = await loadWorkOrder(base44, orgId, workOrderId);
  if (current?.lifecycle_lock_token === lock.token) return current.lifecycle_lock_at;
  throw workflowError(
    'El lock del lifecycle fue recuperado por otra operación.',
    'LIFECYCLE_LOCK_LOST'
  );
}

async function releaseLifecycleLock(base44, orgId, workOrderId, lock) {
  if (!lock?.owned) return;

  const released = await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
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

  if (released?.updated !== 1) {
    console.warn(`[transitionWorkOrderStatus] Lock ya no pertenece a este intento — OT: ${workOrderId}`);
  }
}

async function ensureDiagnosticQuote({ base44, ot, diagnostico, orgId, effectiveUser }) {
  const idempotencyKey = `diagnostico-finalizacion:${orgId}:${diagnostico.id}`;
  const findExisting = () => base44.asServiceRole.entities.Cotizacion.filter({
    organization_id: orgId,
    idempotency_key: idempotencyKey,
  }, '-created_date', 5);

  let existing = await findExisting();
  if (existing?.length > 1) {
    throw workflowError(
      'Existe más de una cotización automática para este diagnóstico.',
      'DIAGNOSTIC_QUOTE_DUPLICATED'
    );
  }
  if (existing?.[0]) return { quote: existing[0], idempotent: true };

  // Adoptar una cotización creada por el flujo anterior evita generar una
  // segunda cotización al desplegar RC1 sobre datos ya existentes.
  const legacyQuotes = await base44.asServiceRole.entities.Cotizacion.filter({
    organization_id: orgId,
    orden_trabajo_id: ot.id,
    diagnostico_tecnico_id: diagnostico.id,
  }, '-created_date', 5);
  if (legacyQuotes?.length > 1) {
    throw workflowError(
      'Existe más de una cotización previa para este diagnóstico.',
      'DIAGNOSTIC_QUOTE_DUPLICATED'
    );
  }
  if (legacyQuotes?.[0]) {
    const legacy = legacyQuotes[0];
    if (legacy.idempotency_key && legacy.idempotency_key !== idempotencyKey) {
      throw workflowError(
        'La cotización previa pertenece a otra operación idempotente.',
        'DIAGNOSTIC_QUOTE_KEY_CONFLICT'
      );
    }
    if (!legacy.idempotency_key) {
      try {
        await base44.asServiceRole.entities.Cotizacion.updateMany({
          id: legacy.id,
          organization_id: orgId,
          $or: [
            { idempotency_key: { $exists: false } },
            { idempotency_key: null },
            { idempotency_key: '' },
          ],
        }, { $set: { idempotency_key: idempotencyKey } });
      } catch (adoptError) {
        existing = await findExisting();
        if (existing?.length === 1) {
          return { quote: existing[0], idempotent: true, recovered: true };
        }
        throw adoptError;
      }
      existing = await findExisting();
      if (existing?.length !== 1) {
        throw workflowError(
          'No se pudo adoptar de forma segura la cotización previa.',
          'DIAGNOSTIC_QUOTE_ADOPTION_FAILED'
        );
      }
      return { quote: existing[0], idempotent: true, adopted: true };
    }
    return { quote: legacy, idempotent: true, adopted: true };
  }

  const items = (diagnostico.repuestos_requeridos || []).map(part => ({
    tipo: 'repuesto',
    descripcion: part.descripcion,
    cantidad: part.cantidad,
    precio_unitario: 0,
    subtotal: 0,
  }));
  if (Number(diagnostico.tiempo_estimado_horas) > 0) {
    items.push({
      tipo: 'mano_obra',
      descripcion: 'Mano de obra técnica',
      cantidad: Number(diagnostico.tiempo_estimado_horas),
      precio_unitario: 0,
      subtotal: 0,
    });
  }

  const previousQuotes = await base44.asServiceRole.entities.Cotizacion.filter({
    organization_id: orgId,
    orden_trabajo_id: ot.id,
  }, '-created_date', 100);

  try {
    const quote = await base44.asServiceRole.entities.Cotizacion.create({
      organization_id: orgId,
      orden_trabajo_id: ot.id,
      diagnostico_tecnico_id: diagnostico.id,
      idempotency_key: idempotencyKey,
      cliente_id: ot.cliente_id,
      vendedor_id: diagnostico.tecnico_id || effectiveUser.id,
      vendedor_nombre: 'Sistema',
      version: `v1.${previousQuotes?.length || 0}`,
      items,
      subtotal: 0,
      descuento_total: 0,
      impuesto: 0,
      total: 0,
      estado: 'borrador',
    });
    return { quote, idempotent: false };
  } catch (createError) {
    existing = await findExisting();
    if (existing?.length === 1) {
      return { quote: existing[0], idempotent: true, recovered: true };
    }
    throw createError;
  }
}

async function ensureDiagnosticEvent({ base44, ot, orgId, effectiveUser, now }) {
  const findExisting = () => base44.asServiceRole.entities.OTEvent.filter({
    organization_id: orgId,
    orden_trabajo_id: ot.id,
    tipo: 'TRANSITION_DIAGNOSTICADA',
  }, '-created_date', 5);

  let existing = await findExisting();
  if (existing?.length > 1) {
    console.warn(`[transitionWorkOrderStatus] Eventos diagnósticos duplicados preexistentes — OT: ${ot.id}`);
    return { event: existing[0], idempotent: true, duplicated_preexisting: true };
  }
  if (existing?.[0]) return { event: existing[0], idempotent: true };

  try {
    const event = await base44.asServiceRole.entities.OTEvent.create({
      organization_id: orgId,
      orden_trabajo_id: ot.id,
      tipo: 'TRANSITION_DIAGNOSTICADA',
      created_by_user_id: effectiveUser.id,
      processed: false,
      created_at: now,
    });
    return { event, idempotent: false };
  } catch (createError) {
    existing = await findExisting();
    if (existing?.length === 1) {
      return { event: existing[0], idempotent: true, recovered: true };
    }
    throw createError;
  }
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
  let lock;
  try {
    lock = await acquireLifecycleLock({
      base44,
      ot,
      orgId,
      effectiveUser,
      operation: 'completeDiagnosticWorkflow',
    });
  } catch (error) {
    return Response.json({
      error: `No se pudo adquirir el lock del lifecycle: ${error.message}`,
      code: 'LIFECYCLE_LOCK_FAILED',
      retryable: true,
    }, { status: 500 });
  }

  if (!lock.acquired) {
    return Response.json({
      error: 'Otra operación del lifecycle está en progreso para esta OT.',
      code: lock.code,
      operation: lock.operation || null,
      retryable: true,
    }, { status: 409 });
  }

  try {
    const currentOT = await loadWorkOrder(base44, orgId, ot.id);
    if (!currentOT) {
      throw workflowError('Orden de trabajo no encontrada.', 'ORDEN_TRABAJO_NOT_FOUND', 404);
    }
    if (!['EN_REVISION', 'DIAGNOSTICADA'].includes(currentOT.estado)) {
      throw workflowError(
        `La OT debe estar en EN_REVISION para completar el diagnóstico. Estado actual: ${currentOT.estado}.`,
        'ESTADO_OT_INVALIDO_DIAGNOSTICO',
        422
      );
    }

    const diagnosticoFilter = diagnosticoId
      ? { id: diagnosticoId, organization_id: orgId, orden_trabajo_id: currentOT.id }
      : { organization_id: orgId, orden_trabajo_id: currentOT.id };
    const diagnosticos = await base44.asServiceRole.entities.DiagnosticoTecnico.filter(
      diagnosticoFilter,
      '-created_date',
      20
    );
    let diagnostico = diagnosticoId
      ? diagnosticos?.[0]
      : (diagnosticos?.find(d => d.bloqueado !== true) || diagnosticos?.[0]);

    if (!diagnostico) {
      throw workflowError(
        'No existe un diagnóstico técnico para esta OT.',
        'DIAGNOSTICADA_SIN_DIAGNOSTICO_TECNICO',
        422
      );
    }
    if (effectiveRole === 'TECHNICIAN' && diagnostico.tecnico_id !== effectiveUser.id) {
      throw workflowError(
        'No autorizado: este diagnóstico pertenece a otro técnico.',
        'TECHNICIAN_OWNERSHIP_REQUIRED',
        403
      );
    }

    const [documentos, actividades] = await Promise.all([
      base44.asServiceRole.entities.DiagnosticoDocumento.filter({
        diagnostico_id: diagnostico.id,
        organization_id: orgId,
      }, '-created_date', 20),
      base44.asServiceRole.entities.ActividadTecnica.filter({
        organization_id: orgId,
        orden_trabajo_id: currentOT.id,
        soft_deleted: false,
      }, '-created_date', 50),
    ]);

    const documentoEmitido = documentos?.find(d => d.estado === 'EMITIDO' || d.estado === 'ENVIADO');
    if (!documentoEmitido) {
      throw workflowError(
        'Se requiere un Documento de Diagnóstico EMITIDO o ENVIADO antes de completar.',
        'DIAGNOSTICADA_SIN_DOCUMENTO_EMITIDO',
        422
      );
    }

    const diagnosticoCompleto = diagnostico.estado === 'listo_aprobacion'
      && Boolean(diagnostico.tipo_intervencion)
      && Boolean(diagnostico.trabajo_recomendado?.trim())
      && Number(diagnostico.tiempo_estimado_horas) > 0;
    if (!diagnosticoCompleto) {
      throw workflowError(
        'El diagnóstico técnico está incompleto.',
        'DIAGNOSTICO_TECNICO_INCOMPLETO',
        422
      );
    }

    const assignedActivities = (actividades || [])
      .filter(a => a.tecnico_id === currentOT.tecnico_asignado_id);
    const activeActivities = assignedActivities.filter(a => a.estado === 'en_progreso');
    const otherActive = (actividades || [])
      .find(a => a.estado === 'en_progreso' && a.tecnico_id !== currentOT.tecnico_asignado_id);

    if (otherActive) {
      throw workflowError(
        'Existe una actividad en progreso de otro técnico.',
        'ACTIVIDAD_TECNICA_INCONSISTENTE'
      );
    }
    if (activeActivities.length > 1) {
      throw workflowError(
        'Existe más de una actividad técnica en progreso para esta OT.',
        'ACTIVIDAD_TECNICA_MULTIPLE'
      );
    }

    const diagnosticoFinalizado = diagnostico.bloqueado === true
      && diagnostico.credito_consumido_finalizacion === true;
    // Una ejecucion anterior pudo completar la actividad antes de recibir una
    // respuesta ambigua. Continuar desde ese paso confirmado hace el retry monotono.
    const diagnosticoCreatedAt = Date.parse(diagnostico.created_date || '');
    const actividadFinalizadaRecuperable = assignedActivities.find(a => {
      if (a.estado !== 'finalizada') return false;
      const endedAt = Date.parse(a.ended_at || '');
      return !Number.isFinite(diagnosticoCreatedAt)
        || (Number.isFinite(endedAt) && endedAt >= diagnosticoCreatedAt);
    });
    let actividad = activeActivities[0]
      || actividadFinalizadaRecuperable;

    if (!actividad) {
      throw workflowError(
        'No existe una actividad técnica recuperable para completar.',
        'ACTIVIDAD_TECNICA_NO_ENCONTRADA',
        422
      );
    }
    const now = new Date().toISOString();

    // Flujo monotónico: un retry continúa desde el último paso confirmado.
    if (actividad.estado === 'en_progreso') {
      await renewLifecycleLock(base44, orgId, currentOT.id, lock);
      const duration = actividad.started_at
        ? Math.max(0, Math.round((new Date(now).getTime() - new Date(actividad.started_at).getTime()) / 60000))
        : null;
      const activityResult = await base44.asServiceRole.entities.ActividadTecnica.updateMany({
        id: actividad.id,
        organization_id: orgId,
        orden_trabajo_id: currentOT.id,
        estado: 'en_progreso',
      }, {
        $set: { estado: 'finalizada', ended_at: now, duracion_minutos: duration },
      });
      if (activityResult?.updated !== 1) {
        throw workflowError(
          'La actividad cambió mientras se completaba el diagnóstico.',
          'ACTIVIDAD_TECNICA_CONCURRENT_UPDATE'
        );
      }
      actividad = { ...actividad, estado: 'finalizada', ended_at: now, duracion_minutos: duration };
    }

    if (!diagnosticoFinalizado) {
      await renewLifecycleLock(base44, orgId, currentOT.id, lock);
      const diagnosticQuery = {
        id: diagnostico.id,
        organization_id: orgId,
        estado: 'listo_aprobacion',
        bloqueado: false,
        credito_consumido_finalizacion: { $ne: true },
      };
      if (diagnostico.updated_date) diagnosticQuery.updated_date = diagnostico.updated_date;

      const diagnosticResult = await base44.asServiceRole.entities.DiagnosticoTecnico.updateMany(
        diagnosticQuery,
        {
          $set: {
            estado: 'listo_aprobacion',
            fecha_completado: now,
            bloqueado: true,
            credito_consumido_finalizacion: true,
          },
        }
      );
      if (diagnosticResult?.updated !== 1) {
        const refreshed = await base44.asServiceRole.entities.DiagnosticoTecnico.filter({
          id: diagnostico.id,
          organization_id: orgId,
        });
        const reconciled = refreshed?.[0];
        if (!(reconciled?.bloqueado === true && reconciled?.credito_consumido_finalizacion === true)) {
          throw workflowError(
            'El diagnóstico cambió mientras se completaba.',
            'DIAGNOSTICO_TECNICO_CONCURRENT_UPDATE'
          );
        }
        diagnostico = reconciled;
      } else {
        diagnostico = {
          ...diagnostico,
          fecha_completado: now,
          bloqueado: true,
          credito_consumido_finalizacion: true,
        };
      }
    }

    await renewLifecycleLock(base44, orgId, currentOT.id, lock);
    const quoteResult = await ensureDiagnosticQuote({
      base44,
      ot: currentOT,
      diagnostico,
      orgId,
      effectiveUser,
    });
    await renewLifecycleLock(base44, orgId, currentOT.id, lock);
    const eventResult = await ensureDiagnosticEvent({
      base44,
      ot: currentOT,
      orgId,
      effectiveUser,
      now,
    });

    let updatedOT = currentOT;
    let idempotent = currentOT.estado === 'DIAGNOSTICADA';
    if (currentOT.estado === 'EN_REVISION') {
      await renewLifecycleLock(base44, orgId, currentOT.id, lock);
      const otUpdate = {
        estado: 'DIAGNOSTICADA',
        ultima_actividad: 'Diagnóstico técnico completado',
        ultima_actividad_at: now,
        fecha_diagnostico: now,
      };
      if (typeof diagnosticoResumido === 'string' && diagnosticoResumido.trim()) {
        otUpdate.diagnostico_resumido = diagnosticoResumido.trim();
      }

      const otResult = await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
        id: currentOT.id,
        organization_id: orgId,
        estado: 'EN_REVISION',
        lifecycle_lock_token: lock.token,
      }, { $set: otUpdate });

      if (otResult?.updated !== 1) {
        const reconciledOT = await loadWorkOrder(base44, orgId, currentOT.id);
        if (reconciledOT?.estado !== 'DIAGNOSTICADA') {
          throw workflowError(
            'La OT cambió mientras se completaba el diagnóstico.',
            'ORDEN_TRABAJO_CONCURRENT_UPDATE'
          );
        }
        updatedOT = reconciledOT;
        idempotent = true;
      } else {
        updatedOT = { ...currentOT, ...otUpdate };
      }
    }

    return Response.json({
      success: true,
      idempotent,
      recovered_stale_lock: lock.recovered_stale_lock === true,
      recovered_ambiguous_lock: lock.recovered_ambiguous_lock === true,
      code: 'DIAGNOSTICO_COMPLETADO',
      orden_trabajo_id: currentOT.id,
      previous_status: currentOT.estado,
      new_status: 'DIAGNOSTICADA',
      updated_at: now,
      updated_by: effectiveUser.email,
      updated_by_role: effectiveRole,
      orden_trabajo: updatedOT,
      diagnostico,
      actividad,
      documento: documentoEmitido,
      cotizacion: quoteResult.quote,
      quote_idempotent: quoteResult.idempotent,
      event_id: eventResult.event.id,
      event_idempotent: eventResult.idempotent,
    });
  } catch (error) {
    console.error(`[transitionWorkOrderStatus] Finalización recuperable falló — OT: ${ot.id}: ${error.message}`);
    return Response.json({
      error: error.message,
      code: error.code || 'DIAGNOSTICO_COMPLETION_FAILED',
      retryable: error.status === 409 || !error.status || error.status >= 500,
    }, { status: error.status || 500 });
  } finally {
    try {
      await releaseLifecycleLock(base44, orgId, ot.id, lock);
    } catch (releaseError) {
      console.error(`[transitionWorkOrderStatus] Error liberando lock — OT: ${ot.id}: ${releaseError.message}`);
    }
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
      _lifecycle_lock_token,
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

    // Un retry posterior a una respuesta perdida debe observar el estado ya
    // confirmado como éxito, incluso para estados irreversibles.
    if (currentStatus === newStatus) {
      const rolesPermitidos = AUTHORIZED_ROLES_FOR_TARGET[newStatus];
      if (!isSuperAdmin && rolesPermitidos && !rolesPermitidos.includes(effectiveRole)) {
        return Response.json({
          error: `Tu rol "${effectiveRole}" no tiene permiso para mover la OT a "${newStatus}".`,
          required_roles: rolesPermitidos,
          user_role: effectiveRole,
        }, { status: 403 });
      }
      return Response.json({
        success: true,
        idempotent: true,
        transition_recovered: true,
        orden_trabajo_id,
        previous_status: currentStatus,
        new_status: newStatus,
        updated_by: effectiveUser.email,
        updated_by_role: effectiveRole,
        orden_trabajo: ot,
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

    // ── 11. Serializar y ejecutar la transición ───────────────────────────────
    const lifecycleLock = await acquireLifecycleLock({
      base44,
      ot,
      orgId,
      effectiveUser,
      operation: `transition:${newStatus}`,
      requestedToken: _lifecycle_lock_token || null,
    });
    if (!lifecycleLock.acquired) {
      return Response.json({
        error: 'Otra operación del lifecycle está en progreso para esta OT.',
        code: lifecycleLock.code,
        retryable: true,
      }, { status: 409 });
    }

    try {
      let transitionResult;
      let transitionError;
      try {
        transitionResult = await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
          id: orden_trabajo_id,
          organization_id: orgId,
          estado: currentStatus,
          lifecycle_lock_token: lifecycleLock.token,
        }, { $set: updatePayload });
      } catch (error) {
        transitionError = error;
      }

      let reconciled = null;
      let transitionRecovered = false;
      if (transitionError || transitionResult?.updated !== 1) {
        reconciled = await loadWorkOrder(base44, orgId, orden_trabajo_id);
        if (reconciled?.estado === newStatus) {
          transitionRecovered = true;
        } else if (transitionError) {
          throw transitionError;
        } else {
          return Response.json({
            error: `La OT cambió concurrentemente. Estado actual: ${reconciled?.estado || 'desconocido'}.`,
            code: 'ORDEN_TRABAJO_CONCURRENT_UPDATE',
            retryable: true,
          }, { status: 409 });
        }
      }

      if (transitionResult?.updated !== 1 && !transitionRecovered) {
        return Response.json({
          error: `La OT cambió concurrentemente. Estado actual: ${reconciled?.estado || 'desconocido'}.`,
          code: 'ORDEN_TRABAJO_CONCURRENT_UPDATE',
          retryable: true,
        }, { status: 409 });
      }
      const updatedOT = transitionRecovered ? reconciled : { ...ot, ...updatePayload };

      // ── 12. OTEvent idempotente mientras el lock continúa activo ────────────
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
        const eventType = CANONICAL_EVENTS.includes(newStatus)
          ? newStatus
          : TRANSITION_EVENT_MAP[newStatus];
        if (eventType) {
          const existing = await base44.asServiceRole.entities.OTEvent.filter({
            organization_id: orgId,
            orden_trabajo_id,
            tipo: eventType,
          }, '-created_date', 5);
          if (!existing?.length) {
            try {
              await base44.asServiceRole.entities.OTEvent.create({
                organization_id: orgId,
                orden_trabajo_id,
                tipo: eventType,
                created_by_user_id: effectiveUser.id,
                processed: false,
                created_at: now,
              });
            } catch (eventError) {
              const reconciledEvents = await base44.asServiceRole.entities.OTEvent.filter({
                organization_id: orgId,
                orden_trabajo_id,
                tipo: eventType,
              }, '-created_date', 5);
              if (!reconciledEvents?.length) throw eventError;
            }
          }
        }
      } catch (traceError) {
        console.warn('[transitionWorkOrderStatus] trazabilidad_fallida:', traceError.message);
      }

      console.log(`[transitionWorkOrderStatus] OK — OT: ${orden_trabajo_id}, ${currentStatus} → ${newStatus}, usuario: ${effectiveUser.email}, rol: ${effectiveRole}`);
      return Response.json({
        success: true,
        orden_trabajo_id,
        previous_status: currentStatus,
        new_status: newStatus,
        idempotent: transitionRecovered,
        transition_recovered: transitionRecovered,
        recovered_ambiguous_lock: lifecycleLock.recovered_ambiguous_lock === true,
        updated_at: now,
        updated_by: effectiveUser.email,
        updated_by_role: effectiveRole,
        orden_trabajo: updatedOT,
      });
    } finally {
      try {
        await releaseLifecycleLock(base44, orgId, orden_trabajo_id, lifecycleLock);
      } catch (releaseError) {
        console.error(`[transitionWorkOrderStatus] No se pudo liberar el lock — OT: ${orden_trabajo_id}: ${releaseError.message}`);
      }
    }

  } catch (error) {
    console.error('[transitionWorkOrderStatus] Error:', error.message);
    console.error(`[DIAG:transition] *** CATCH — error.stack:`, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
