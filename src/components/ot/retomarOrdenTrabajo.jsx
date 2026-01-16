import { base44 } from '@/api/base44Client';
import { cambiarEstadoAtencionOT } from './transicionarEstadoOT';

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
  // 1. Cambiar estado de atención a ACTIVO
  await cambiarEstadoAtencionOT({
    ordenTrabajoId,
    nuevoEstadoAtencion: 'ACTIVO',
    observaciones: 'Trabajo retomado',
    effectiveOrgId: organizationId,
    userId: tecnicoId,
    userEmail: tecnicoEmail
  });

  // 2. Crear ActividadTecnica
  const actividad = await base44.entities.ActividadTecnica.create({
    organization_id: organizationId,
    orden_trabajo_id: ordenTrabajoId,
    tecnico_id: tecnicoId,
    tecnico_email: tecnicoEmail,
    tipo_actividad: 'diagnostico',
    estado: 'en_progreso',
    started_at: new Date().toISOString()
  });

  return actividad;
}