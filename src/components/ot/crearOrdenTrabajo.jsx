const BACKEND_URL = 'https://techrepairpro-core-1.onrender.com';

/**
 * HELPER CENTRAL ÚNICO PARA CREAR ÓRDENES DE TRABAJO — SOT: PostgreSQL
 *
 * @param {Object} datosOT - Datos de la OT
 * @param {string} organizationId - effectiveOrgId del tenant
 * @returns {Promise<Object>} La OT creada
 */
export async function crearOrdenTrabajo(datosOT, organizationId) {
  if (!organizationId) {
    throw new Error('organization_id es requerido para crear una OT');
  }

  const response = await fetch(`${BACKEND_URL}/v1/work-orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-organization-id': organizationId
    },
    body: JSON.stringify({
      client_id: datosOT.cliente_id,
      equipment_id: datosOT.equipo_id,
      intake_notes: datosOT.motivo_ingreso,
      priority: datosOT.prioridad || 'normal'
    })
  });

  const resData = await response.json();

  if (!response.ok) {
    throw new Error(resData.error || `Error ${response.status} al crear OT`);
  }

  return resData.data;
}