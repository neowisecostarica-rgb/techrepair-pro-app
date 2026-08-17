import { base44 } from '@/api/base44Client';

/**
 * P0.4 - HELPER ATÓMICO PARA RETOMAR ORDEN DE TRABAJO
 * 
 * Ejecuta TODAS las operaciones necesarias en una sola función atómica:
 * - Cambio de estado de atención a ACTIVO
 * - Creación de ActividadTecnica
 * 
 * Previene rate limits y race conditions.
 * 
 * @param {Object} params
 * @param {string} params.ordenTrabajoId - ID de la OT a retomar
 * @param {string} params.organizationId - ID de la organización
 * @param {string} params.tecnicoId - ID del técnico
 * @param {string} params.tecnicoEmail - Email del técnico
 * @returns {Promise<Object>} ActividadTecnica creada
 */
export async function retomarOrdenTrabajo({ 
  ordenTrabajoId, 
  organizationId, 
  tecnicoId, 
  tecnicoEmail 
}) {
  const response = await base44.functions.invoke('technicalActivityCommand', {
    action: 'RESUME',
    work_order_id: ordenTrabajoId,
    tipo_actividad: 'diagnostico',
    subtipo: 'Trabajo retomado',
    correlation_id: crypto.randomUUID(),
  });
  if (response?.data?.error) throw new Error(response.data.error);
  return response.data.segment;
}
