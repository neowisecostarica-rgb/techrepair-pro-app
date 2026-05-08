import { base44 } from '@/api/base44Client';

/**
 * Helper centralizado para transiciones de estado de OrdenTrabajo — SOT: Base44
 * Lifecycle Engine oficial: transitionWorkOrderStatus
 *
 * RETROCOMPATIBILIDAD:
 * - Firma A: transicionarEstadoOT(otId, nuevoEstado, context)
 * - Firma B: transicionarEstadoOT({ ordenTrabajoId, nuevoEstado, ... })
 */
export async function transicionarEstadoOT(otIdOrParams, nuevoEstado, context) {
  let otId, estadoNuevo, extra;

  if (typeof otIdOrParams === 'object' && otIdOrParams !== null) {
    otId = otIdOrParams.ordenTrabajoId;
    estadoNuevo = otIdOrParams.nuevoEstado;
    extra = {
      observacion: otIdOrParams.motivo,
      tecnico_asignado_id: otIdOrParams.tecnico_asignado_id,
      tecnico_asignado_email: otIdOrParams.tecnico_asignado_email,
    };
  } else {
    otId = otIdOrParams;
    estadoNuevo = nuevoEstado;
    extra = {
      observacion: context?.motivo,
      tecnico_asignado_id: context?.tecnico_asignado_id,
      tecnico_asignado_email: context?.tecnico_asignado_email,
    };
  }

  if (typeof otId !== 'string' || !otId) {
    throw new Error(`ID de orden de trabajo inválido. Se esperaba un string, se recibió: ${typeof otId}`);
  }

  const response = await base44.functions.invoke('transitionWorkOrderStatus', {
    orden_trabajo_id: otId,
    newStatus: estadoNuevo,
    ...extra,
  });
  return response.data;
}

/**
 * Helper para cambiar estado_atencion — vía updateWorkOrderAttentionStatus (Bloque B Fase 1)
 * Reemplaza el bypass legacy changeWorkOrderStatus para attention lifecycle.
 */
export async function cambiarEstadoAtencionOT({
  ordenTrabajoId,
  nuevoEstadoAtencion,
  motivoPausa = null,
  observaciones,
}) {
  if (!ordenTrabajoId) {
    throw new Error('ordenTrabajoId es requerido');
  }

  const response = await base44.functions.invoke('updateWorkOrderAttentionStatus', {
    orden_trabajo_id: ordenTrabajoId,
    estado_atencion: nuevoEstadoAtencion,
    motivo_pausa: motivoPausa || null,
    observaciones: observaciones || undefined,
  });
  return response.data;
}