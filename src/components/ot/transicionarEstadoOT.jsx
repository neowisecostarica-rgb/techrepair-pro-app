import { sotFetch } from '@/lib/sotFetch';

/**
 * Helper centralizado para transiciones de estado de OrdenTrabajo — SOT: PostgreSQL
 *
 * RETROCOMPATIBILIDAD:
 * - Firma A: transicionarEstadoOT(otId, nuevoEstado, context)
 * - Firma B: transicionarEstadoOT({ ordenTrabajoId, nuevoEstado, effectiveOrgId, userId, userEmail, motivo })
 */
export async function transicionarEstadoOT(otIdOrParams, nuevoEstado, context = {}) {
  let otId, estadoNuevo, organizationId;

  if (typeof otIdOrParams === 'object' && otIdOrParams !== null) {
    otId = otIdOrParams.ordenTrabajoId;
    estadoNuevo = otIdOrParams.nuevoEstado;
    organizationId = otIdOrParams.effectiveOrgId || otIdOrParams.organizationId;
  } else {
    otId = otIdOrParams;
    estadoNuevo = nuevoEstado;
    organizationId = context.organizationId || context.effectiveOrgId;
  }

  if (typeof otId !== 'string' || !otId) {
    throw new Error(`ID de orden de trabajo inválido. Se esperaba un string, se recibió: ${typeof otId}`);
  }

  if (!organizationId) {
    throw new Error('organization_id es requerido para transicionar estado de OT');
  }

  return sotFetch(`/v1/work-orders/${otId}/status`, organizationId, {
    method: 'PATCH',
    body: JSON.stringify({ status: estadoNuevo })
  });
}

/**
 * Helper para cambiar estado_atencion — delegado al backend SOT
 */
export async function cambiarEstadoAtencionOT({
  ordenTrabajoId,
  nuevoEstadoAtencion,
  motivoPausa = null,
  observaciones = null,
  effectiveOrgId,
}) {
  if (!effectiveOrgId) {
    throw new Error('organization_id es requerido');
  }

  return sotFetch(`/v1/work-orders/${ordenTrabajoId}/attention-status`, effectiveOrgId, {
    method: 'PATCH',
    body: JSON.stringify({
      attention_status: nuevoEstadoAtencion,
      pause_reason: motivoPausa,
      notes: observaciones
    })
  });
}