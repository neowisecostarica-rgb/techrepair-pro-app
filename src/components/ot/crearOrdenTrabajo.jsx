import { sotFetch } from '@/lib/sotFetch';

/**
 * HELPER CENTRAL ÚNICO PARA CREAR ÓRDENES DE TRABAJO — SOT: PostgreSQL
 *
 * @param {Object} datosOT - Datos de la OT
 * @param {string} organizationId - effectiveOrgId del tenant
 * @returns {Promise<Object>} La OT creada
 */
export async function crearOrdenTrabajo(datosOT, organizationId) {
  return sotFetch('/v1/work-orders', organizationId, {
    method: 'POST',
    body: JSON.stringify({
      client_id: datosOT.cliente_id,
      equipment_id: datosOT.equipo_id,
      intake_notes: datosOT.motivo_ingreso,
      priority: datosOT.prioridad || 'normal'
    })
  });
}