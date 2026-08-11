import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { authorizeRecordBranch } from '../_shared/operationalAuthorization.ts';
import { evaluateCurrentQaEvidence } from '../_shared/qaEvidence.ts';
import {
  assertPersistedTotalsMatch,
  calculateCommercialTotals,
  quoteDecisionIsCommitted,
  quoteDecisionOperationKey,
} from '../_shared/commercialIntegrity.ts';
import { executeInventoryCommand, reverseInventoryCommand } from '../_shared/inventoryMutationService.ts';
import {
  acquireLifecycleLock,
  loadWorkOrder,
  releaseLifecycleLock,
  renewLifecycleLock,
  workflowError,
} from '../_shared/workOrderLifecycleLock.ts';

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
    referencia_id: part.inventario_id || null,
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
      branch_id: ot.branch_id,
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


async function loadPublicDecisionContext(base44, token) {
  const quotes = await base44.asServiceRole.entities.Cotizacion.filter({
    public_access_token: token,
  }, '-created_date', 2);
  if (quotes?.length > 1) throw workflowError('El enlace comercial es ambiguo.', 'PUBLIC_QUOTE_TOKEN_AMBIGUOUS', 409);
  let quote = quotes?.[0] || null;
  let ot = null;
  if (quote?.orden_trabajo_id) {
    ot = await loadWorkOrder(base44, quote.organization_id, quote.orden_trabajo_id);
  }
  if (!quote) {
    const workOrders = await base44.asServiceRole.entities.OrdenTrabajo.filter({
      public_access_token: token,
    }, '-created_date', 2);
    if (workOrders?.length !== 1) throw workflowError('Enlace no valido', 'PUBLIC_QUOTE_TOKEN_INVALID', 404);
    ot = workOrders[0];
    const related = await base44.asServiceRole.entities.Cotizacion.filter({
      organization_id: ot.organization_id,
      orden_trabajo_id: ot.id,
      estado: { $in: ['enviada', 'aprobada', 'rechazada'] },
    }, '-created_date', 5);
    quote = related?.[0] || null;
  }
  if (!quote) throw workflowError('No existe una cotizacion asociada para registrar la decision', 'PUBLIC_QUOTE_NOT_FOUND', 422);
  if (quote.orden_trabajo_id && (!ot || ot.organization_id !== quote.organization_id)) {
    throw workflowError('La OT asociada no es valida', 'PUBLIC_QUOTE_WORK_ORDER_INVALID', 409);
  }
  return { quote, ot };
}

function validatePublicDecisionExpiry(quote, ot) {
  const expires = quote.public_access_expires_at || ot?.public_access_expires_at || null;
  if (expires) {
    const expiresAt = Date.parse(expires);
    if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
      throw workflowError('El enlace ha expirado', 'PUBLIC_QUOTE_TOKEN_EXPIRED', 410);
    }
  }
  if (quote.valida_hasta) {
    const validUntil = Date.parse(`${quote.valida_hasta}T23:59:59.999Z`);
    if (Number.isFinite(validUntil) && validUntil < Date.now()) {
      throw workflowError('La cotizacion ha vencido', 'PUBLIC_QUOTE_EXPIRED', 410);
    }
  }
}

function buildApprovedQuoteSnapshot(quote) {
  let calculated;
  try {
    calculated = calculateCommercialTotals(quote.items || []);
    assertPersistedTotalsMatch(quote, calculated, 'Cotizacion');
  } catch (error) {
    throw workflowError(error.message, error.code || 'PUBLIC_QUOTE_INTEGRITY_INVALID', 422);
  }
  return {
    items: calculated.items,
    subtotal: calculated.subtotal,
    descuento_total: calculated.descuento_total,
    impuesto: calculated.impuesto,
    total: calculated.total,
    version: quote.version || null,
  };
}

async function claimPublicQuoteDecision(base44, quote, targetStatus, operationKey, now) {
  const targetQuoteStatus = targetStatus === 'APROBADA' ? 'aprobada' : 'rechazada';
  if (quoteDecisionIsCommitted(quote, targetStatus)) return { quote, committed: true };
  if (['aprobada', 'rechazada'].includes(quote.estado) && quote.estado !== targetQuoteStatus) {
    throw workflowError('La cotizacion ya tiene una decision diferente', 'PUBLIC_QUOTE_DECISION_CONFLICT', 409);
  }
  if (quote.decision_status === 'PENDING') {
    if (quote.decision_operation_key !== operationKey || quote.decision_target_status !== targetStatus) {
      throw workflowError('Otra decision comercial esta en progreso', 'PUBLIC_QUOTE_DECISION_CONFLICT', 409);
    }
    return { quote, recovered: true };
  }
  if (!['enviada', targetQuoteStatus].includes(quote.estado)) {
    throw workflowError('La cotizacion aun no ha sido enviada al cliente', 'PUBLIC_QUOTE_NOT_SENT', 422);
  }
  const claimed = await base44.asServiceRole.entities.Cotizacion.updateMany({
    id: quote.id,
    organization_id: quote.organization_id,
    estado: quote.estado,
    $or: [
      { decision_status: { $exists: false } },
      { decision_status: null },
      { decision_status: 'FAILED' },
    ],
  }, { $set: {
    decision_status: 'PENDING',
    decision_target_status: targetStatus,
    decision_operation_key: operationKey,
    decision_started_at: now,
    decision_error: null,
  } });
  const reloaded = (await base44.asServiceRole.entities.Cotizacion.filter({
    id: quote.id,
    organization_id: quote.organization_id,
  }, '-created_date', 1))?.[0] || null;
  if (claimed?.updated !== 1
    && !quoteDecisionIsCommitted(reloaded, targetStatus)
    && !(reloaded?.decision_status === 'PENDING' && reloaded?.decision_operation_key === operationKey)) {
    throw workflowError('La cotizacion cambio durante la decision', 'PUBLIC_QUOTE_DECISION_CONFLICT', 409);
  }
  return { quote: reloaded || quote, committed: quoteDecisionIsCommitted(reloaded, targetStatus) };
}

async function ensureDiagnosticApprovalEvidence(base44, quote, now) {
  if (!quote.diagnostico_tecnico_id) return null;
  const documents = await base44.asServiceRole.entities.DiagnosticoDocumento.filter({
    organization_id: quote.organization_id,
    diagnostico_id: quote.diagnostico_tecnico_id,
    estado: { $in: ['EMITIDO', 'ENVIADO'] },
  }, '-created_date', 5);
  const document = documents?.[0] || null;
  if (!document) throw workflowError('No existe un documento de diagnostico vigente para registrar la aprobacion', 'PUBLIC_QUOTE_DIAGNOSTIC_DOCUMENT_REQUIRED', 422);
  if (document.aprobacion_status === 'APROBADA') return document;
  await base44.asServiceRole.entities.DiagnosticoDocumento.update(document.id, {
    aprobacion_status: 'APROBADA',
    aprobacion_at: now,
    metodo_aprobacion: 'PORTAL_DIGITAL',
  });
  const reconciled = (await base44.asServiceRole.entities.DiagnosticoDocumento.filter({
    id: document.id,
    organization_id: quote.organization_id,
  }, '-created_date', 1))?.[0];
  if (reconciled?.aprobacion_status !== 'APROBADA') {
    throw workflowError('No se pudo confirmar la evidencia de aprobacion', 'PUBLIC_QUOTE_EVIDENCE_NOT_COMMITTED', 500);
  }
  return reconciled;
}

async function ensurePublicDecisionWorkOrder(base44, quote, ot, targetStatus, rejectionReason, now, lock) {
  if (!ot) return { ot: null, transitioned: false, previousStatus: null };
  const approved = targetStatus === 'APROBADA';
  const allowedFrom = approved
    ? ['DIAGNOSTICADA', 'COTIZADA']
    : ['DIAGNOSTICADA', 'COTIZADA', 'APROBADA'];
  const current = await loadWorkOrder(base44, ot.organization_id, ot.id);
  if (!current || current.lifecycle_lock_token !== lock.token) {
    throw workflowError('No se conserva el lock de la OT', 'LIFECYCLE_LOCK_LOST', 409);
  }
  if (current.estado === targetStatus) return { ot: current, transitioned: false, previousStatus: current.estado };
  if (!allowedFrom.includes(current.estado)) {
    throw workflowError(`La orden ya no admite esta decision (${current.estado})`, 'PUBLIC_QUOTE_WORK_ORDER_STATE_CONFLICT', 409);
  }
  const previousStatus = current.estado;
  const result = await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
    id: current.id,
    organization_id: current.organization_id,
    estado: current.estado,
    lifecycle_lock_token: lock.token,
  }, { $set: {
    estado: targetStatus,
    cliente_aprobado: approved,
    cliente_aprobado_at: approved ? now : null,
    cliente_rechazo_motivo: approved ? null : (rejectionReason || null),
    ultima_actividad: approved
      ? 'Cotizacion aprobada por el cliente desde el portal'
      : 'Cotizacion rechazada por el cliente desde el portal',
    ultima_actividad_at: now,
  } });
  const reconciled = await loadWorkOrder(base44, current.organization_id, current.id);
  if (result?.updated !== 1 && reconciled?.estado !== targetStatus) {
    throw workflowError('La OT cambio durante la decision', 'PUBLIC_QUOTE_WORK_ORDER_CONFLICT', 409);
  }
  return { ot: reconciled, transitioned: true, previousStatus };
}

async function ensurePublicDecisionEvent(base44, quote, ot, targetStatus, operationKey, now) {
  if (!ot) return null;
  const eventType = targetStatus === 'APROBADA' ? 'TRANSITION_APROBADA' : 'CANCELADA';
  const existing = await base44.asServiceRole.entities.OTEvent.filter({
    organization_id: ot.organization_id,
    orden_trabajo_id: ot.id,
    tipo: eventType,
    detalle: operationKey,
  }, '-created_date', 2);
  if (existing?.[0]) return existing[0];
  try {
    return await base44.asServiceRole.entities.OTEvent.create({
      organization_id: ot.organization_id,
      orden_trabajo_id: ot.id,
      tipo: eventType,
      detalle: operationKey,
      created_by_user_id: 'portal_cliente',
      processed: false,
      created_at: now,
    });
  } catch (error) {
    const reconciled = await base44.asServiceRole.entities.OTEvent.filter({
      organization_id: ot.organization_id,
      orden_trabajo_id: ot.id,
      tipo: eventType,
      detalle: operationKey,
    }, '-created_date', 2);
    if (reconciled?.[0]) return reconciled[0];
    throw error;
  }
}

async function commitPublicQuoteDecision(base44, quote, targetStatus, operationKey, snapshot, rejectionReason, ip, now) {
  const targetQuoteStatus = targetStatus === 'APROBADA' ? 'aprobada' : 'rechazada';
  const approved = targetStatus === 'APROBADA';
  const reload = async () => (await base44.asServiceRole.entities.Cotizacion.filter({
    id: quote.id,
    organization_id: quote.organization_id,
  }, '-created_date', 1))?.[0];
  let result;
  try {
    result = await base44.asServiceRole.entities.Cotizacion.updateMany({
      id: quote.id,
      organization_id: quote.organization_id,
      decision_status: 'PENDING',
      decision_operation_key: operationKey,
      decision_target_status: targetStatus,
    }, { $set: {
      estado: targetQuoteStatus,
      decision_status: 'COMMITTED',
      decision_committed_at: now,
      decision_error: null,
      ...(approved ? {
        aprobada_at: now,
        contenido_aprobado_snapshot: snapshot,
        ip_aprobacion: ip,
        cliente_rechazo_motivo: null,
      } : {
        cliente_rechazo_motivo: rejectionReason || null,
      }),
    } });
  } catch (error) {
    const reconciled = await reload();
    if (quoteDecisionIsCommitted(reconciled, targetStatus)) return reconciled;
    throw error;
  }
  const reloaded = await reload();
  if (result?.updated !== 1 && !quoteDecisionIsCommitted(reloaded, targetStatus)) {
    throw workflowError('No se pudo confirmar la decision comercial', 'PUBLIC_QUOTE_COMMIT_FAILED', 500);
  }
  return reloaded;
}

function lifecycleInventoryLockAdapter(base44, ot, lock) {
  return {
    async acquire() { return { work_order_id: ot.id, token: lock.token }; },
    async assertOwned() {
      const current = await loadWorkOrder(base44, ot.organization_id, ot.id);
      if (current?.lifecycle_lock_token !== lock.token) {
        throw workflowError('Se perdio el lock antes de mutar inventario', 'LIFECYCLE_LOCK_LOST', 409);
      }
      return true;
    },
    async release() { return true; },
  };
}

async function reserveApprovedQuoteInventory(base44, quote, ot, snapshot, operationKey, lock) {
  if (!ot) return null;
  const grouped = new Map();
  for (const [index, item] of snapshot.items.entries()) {
    if (!['producto', 'repuesto'].includes(item.tipo)) continue;
    if (item.referencia_id && item.item_id && item.referencia_id !== item.item_id) {
      throw workflowError(`Item ${index + 1}: referencias de inventario en conflicto`, 'INVENTORY_REFERENCE_CONFLICT', 409);
    }
    const inventoryId = item.referencia_id || item.item_id || null;
    if (!inventoryId) {
      throw workflowError(`Item ${index + 1}: referencia de inventario requerida`, 'INVENTORY_REFERENCE_REQUIRED', 409);
    }
    const quantity = Number(item.cantidad);
    const current = grouped.get(inventoryId) || 0;
    grouped.set(inventoryId, current + quantity);
  }
  if (grouped.size === 0) return null;
  const commandKey = `quote-reserve:${quote.id}:${operationKey}`;
  return executeInventoryCommand(base44, {
    organizationId: ot.organization_id,
    branchId: ot.branch_id,
    actorId: 'portal_cliente',
    operationKey: commandKey,
    referenceType: 'QUOTE_APPROVAL',
    referenceId: quote.id,
    reason: `Reserva por aprobacion de cotizacion ${quote.id}`,
    movements: [...grouped.entries()].map(([inventoryId, quantity]) => ({
      inventoryId,
      movementType: 'RESERVE',
      quantity,
      workOrderId: ot.id,
      quoteId: quote.id,
    })),
  }, lifecycleInventoryLockAdapter(base44, ot, lock));
}

async function releaseReservationResults(base44, quote, ot, reserveResult, operationKey, lock) {
  if (!reserveResult?.operation_key) return;
  await reverseInventoryCommand(base44, {
    organizationId: ot.organization_id,
    branchId: ot.branch_id,
    actorId: 'portal_cliente',
    operationKey: reserveResult.operation_key,
    reversalOperationKey: `${reserveResult.operation_key}:automatic-reversal:approval-compensation`,
    reason: `Compensacion de aprobacion fallida ${quote.id}:${operationKey}`,
  }, lifecycleInventoryLockAdapter(base44, ot, lock));
}

async function releaseCancelledWorkOrderReservations(base44, ot, actorId) {
  const reservations = await base44.asServiceRole.entities.InventarioReserva.filter({
    organization_id: ot.organization_id,
    branch_id: ot.branch_id,
    work_order_id: ot.id,
    state: 'RESERVED',
  }, 'created_date', 500);
  for (const reservation of reservations || []) {
    await executeInventoryCommand(base44, {
      organizationId: ot.organization_id,
      branchId: ot.branch_id,
      actorId,
      operationKey: `ot-cancel-release:${ot.id}:${reservation.id}`,
      referenceType: 'WORK_ORDER_CANCELLATION',
      referenceId: ot.id,
      reason: `Liberacion por cancelacion de OT ${ot.id}`,
      movements: [{
        inventoryId: reservation.inventario_id || reservation.inventory_id,
        movementType: 'RELEASE',
        quantity: Number(reservation.quantity),
        reservationId: reservation.id,
        workOrderId: ot.id,
        quoteId: reservation.quote_id || null,
      }],
    });
  }
}

async function handlePublicCustomerDecisionV2({ base44, body, req }) {
  const token = body.customer_token;
  const targetStatus = body.newStatus;
  const rejectionReason = typeof body.rejection_reason === 'string'
    ? body.rejection_reason.trim().slice(0, 500)
    : '';
  if (typeof token !== 'string' || token.length < 16 || token.length > 256) {
    return Response.json({ error: 'Enlace no valido' }, { status: 404 });
  }
  if (!['APROBADA', 'CANCELADA'].includes(targetStatus)) {
    return Response.json({ error: 'Decision no valida' }, { status: 400 });
  }

  let quote = null;
  let ot = null;
  let lock = null;
  let operationKey = null;
  let reserveResult = null;
  try {
    ({ quote, ot } = await loadPublicDecisionContext(base44, token));
    validatePublicDecisionExpiry(quote, ot);
    operationKey = quoteDecisionOperationKey(quote.id, targetStatus);
    const targetQuoteStatus = targetStatus === 'APROBADA' ? 'aprobada' : 'rechazada';
    if (['aprobada', 'rechazada'].includes(quote.estado) && quote.estado !== targetQuoteStatus) {
      throw workflowError('La cotizacion ya tiene una decision diferente', 'PUBLIC_QUOTE_DECISION_CONFLICT', 409);
    }

    const snapshot = targetStatus === 'APROBADA' ? buildApprovedQuoteSnapshot(quote) : null;
    if (ot) {
      lock = await acquireLifecycleLock({
        base44,
        ot,
        orgId: ot.organization_id,
        effectiveUser: { id: 'portal_cliente' },
        operation: `customerDecision:${quote.id}`,
      });
      if (!lock.acquired) {
        return Response.json({
          error: 'Otra operacion del lifecycle esta en progreso',
          code: lock.code,
          retryable: true,
        }, { status: 409 });
      }
      quote = (await base44.asServiceRole.entities.Cotizacion.filter({
        id: quote.id,
        organization_id: quote.organization_id,
      }, '-created_date', 1))?.[0] || quote;
    }

    const now = new Date().toISOString();
    const claim = await claimPublicQuoteDecision(base44, quote, targetStatus, operationKey, now);
    quote = claim.quote;
    if (targetStatus === 'APROBADA') await ensureDiagnosticApprovalEvidence(base44, quote, now);
    if (targetStatus === 'APROBADA') {
      reserveResult = await reserveApprovedQuoteInventory(base44, quote, ot, snapshot, operationKey, lock);
    }
    const otResult = await ensurePublicDecisionWorkOrder(base44, quote, ot, targetStatus, rejectionReason, now, lock);
    await ensurePublicDecisionEvent(base44, quote, otResult.ot, targetStatus, operationKey, now);
    const committedQuote = await commitPublicQuoteDecision(
      base44,
      quote,
      targetStatus,
      operationKey,
      snapshot,
      rejectionReason,
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      now,
    );
    return Response.json({
      success: true,
      idempotent: Boolean(claim.committed || claim.recovered || !otResult.transitioned),
      quote_id: committedQuote?.id || quote.id,
      quote_status: targetQuoteStatus,
      orden_trabajo_id: otResult.ot?.id || null,
      previous_status: otResult.previousStatus,
      new_status: targetStatus,
      transitioned: otResult.transitioned,
      decision_status: 'COMMITTED',
    });
  } catch (error) {
    if (reserveResult && quote && ot && lock?.acquired) {
      const committed = (await base44.asServiceRole.entities.Cotizacion.filter({
        id: quote.id, organization_id: quote.organization_id,
      }, '-created_date', 1))?.[0];
      const currentOt = await loadWorkOrder(base44, ot.organization_id, ot.id);
      if (!quoteDecisionIsCommitted(committed, 'APROBADA') && currentOt?.estado !== 'APROBADA') {
        await releaseReservationResults(base44, quote, ot, reserveResult, operationKey, lock).catch(compensationError => {
          console.error('[publicQuoteDecision] inventory compensation failed', compensationError.message);
        });
      }
    }
    if (quote?.id && operationKey) {
      await base44.asServiceRole.entities.Cotizacion.updateMany({
        id: quote.id,
        organization_id: quote.organization_id,
        decision_status: 'PENDING',
        decision_operation_key: operationKey,
      }, { $set: { decision_error: String(error.message || error).slice(0, 500) } }).catch(() => null);
    }
    return Response.json({
      error: error.message || 'No se pudo registrar la decision comercial',
      code: error.code || 'PUBLIC_QUOTE_DECISION_FAILED',
      retryable: error.status >= 500 || !error.status,
      decision_pending: Boolean(quote?.decision_status === 'PENDING' || operationKey),
    }, { status: error.status || 500 });
  } finally {
    if (ot && lock?.acquired) {
      try { await releaseLifecycleLock(base44, ot.organization_id, ot.id, lock); }
      catch (error) { console.error('[publicQuoteDecision] lock release failed', error.message); }
    }
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Body invalido' }, { status: 400 });
    }

    // ── 1. Auth — obtener runtimeUser del contexto de ejecución inmediato ──────
    const runtimeUser = await base44.auth.me();

    if (!runtimeUser && body.customer_token) {
      return handlePublicCustomerDecisionV2({ base44, body, req });
    }

    if (!runtimeUser) {
      return Response.json({ error: 'No autenticado' }, { status: 401 });
    }

    // ── 2. Parsear body ────────────────────────────────────────────────────────
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
    const authorization = await resolveAuthorizedContext(base44, runtimeUser);
    if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status });
    const effectiveUser = runtimeUser;
    const orgId = authorization.organizationId;
    const effectiveRole = authorization.role;
    const isSuperAdmin = authorization.isSuperAdmin;

    if (!orden_trabajo_id) {
      return Response.json({ error: 'orden_trabajo_id es obligatorio' }, { status: 400 });
    }
    if (!newStatus) {
      return Response.json({ error: 'newStatus es obligatorio' }, { status: 400 });
    }
    if (newStatus === 'ENTREGADA') {
      return Response.json({
        error: 'ENTREGADA solo puede confirmarse mediante deliverWorkOrder.',
        code: 'DELIVERY_COMMAND_REQUIRED',
      }, { status: 403 });
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
    const branchAuthorization = authorizeRecordBranch(authorization, ot.branch_id);
    if (!branchAuthorization.ok) {
      return Response.json({ error: branchAuthorization.error, code: branchAuthorization.code }, { status: branchAuthorization.status });
    }
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
      if (newStatus === 'CANCELADA') {
        await releaseCancelledWorkOrderReservations(base44, ot, effectiveUser.id || effectiveUser.email);
      }
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
    if (newStatus === 'PRUEBAS') {
      updatePayload.qa_cycle_id = crypto.randomUUID();
      updatePayload.qa_cycle_started_at = now;
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
      const lockedOt = await loadWorkOrder(base44, orgId, orden_trabajo_id);
      if (!lockedOt || lockedOt.lifecycle_lock_token !== lifecycleLock.token) {
        return Response.json({
          error: 'No se pudo confirmar el estado actual de la OT bajo el lock del lifecycle.',
          code: 'LIFECYCLE_LOCK_LOST',
          retryable: true,
        }, { status: 409 });
      }
      if (lockedOt.estado !== currentStatus || !canTransition(lockedOt.estado, newStatus)) {
        return Response.json({
          error: `La OT cambio antes de confirmar la transicion. Estado actual: ${lockedOt.estado}.`,
          code: 'ORDEN_TRABAJO_CONCURRENT_UPDATE',
          retryable: true,
        }, { status: 409 });
      }

      if (newStatus === 'FINALIZADA') {
        const qaRecords = await base44.asServiceRole.entities.PruebaTecnica.filter({
          organization_id: orgId,
          orden_trabajo_id,
        }, 'recorded_at', 200);
        const qaValidation = evaluateCurrentQaEvidence(qaRecords, {
          organizationId: orgId,
          workOrderId: orden_trabajo_id,
          assignedTechnicianId: lockedOt?.tecnico_asignado_id,
          cycleId: lockedOt?.qa_cycle_id,
          cycleStartedAt: lockedOt?.qa_cycle_started_at,
        });
        if (!qaValidation.valid) {
          return Response.json({
            error: 'No se puede finalizar la OT: la evidencia QA vigente no es valida.',
            code: qaValidation.code,
            orden_trabajo_id,
          }, { status: 422 });
        }
        extra.prueba_tecnica_exitosa_verificada = true;
      }

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
      if (newStatus === 'CANCELADA') {
        await releaseCancelledWorkOrderReservations(base44, updatedOT, effectiveUser.id || effectiveUser.email);
      }

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
                detalle: newStatus === 'PRUEBAS'
                  ? JSON.stringify({ qa_cycle_id: updatePayload.qa_cycle_id })
                  : undefined,
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
