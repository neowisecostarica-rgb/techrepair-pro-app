import { base44 } from '@/api/base44Client';

/**
 * Helper centralizado para transiciones de estado de OrdenTrabajo — SOT: Base44
 *
 * RETROCOMPATIBILIDAD:
 * - Firma A: transicionarEstadoOT(otId, nuevoEstado, context)
 * - Firma B: transicionarEstadoOT({ ordenTrabajoId, nuevoEstado, ... })
 */
export async function transicionarEstadoOT(otIdOrParams, nuevoEstado) {
  let otId, estadoNuevo;

  if (typeof otIdOrParams === 'object' && otIdOrParams !== null) {
    otId = otIdOrParams.ordenTrabajoId;
    estadoNuevo = otIdOrParams.nuevoEstado;
  } else {
    otId = otIdOrParams;
    estadoNuevo = nuevoEstado;
  }

  if (typeof otId !== 'string' || !otId) {
    throw new Error(`ID de orden de trabajo inválido. Se esperaba un string, se recibió: ${typeof otId}`);
  }

  const response = await base44.functions.invoke('changeWorkOrderStatus', {
    orden_trabajo_id: otId,
    newStatus: estadoNuevo,
  });
  return response.data;
}

/**
 * Helper para cambiar estado_atencion — vía changeWorkOrderStatus function
 */
export async function cambiarEstadoAtencionOT({
  ordenTrabajoId,
  nuevoEstadoAtencion,
  motivoPausa = null,
}) {
  if (!ordenTrabajoId) {
    throw new Error('ordenTrabajoId es requerido');
  }

  const response = await base44.functions.invoke('changeWorkOrderStatus', {
    orden_trabajo_id: ordenTrabajoId,
    estado_atencion: nuevoEstadoAtencion,
    motivo_pausa: motivoPausa || undefined,
    ultima_actividad_at: new Date().toISOString(),
  });
  return response.data;
}