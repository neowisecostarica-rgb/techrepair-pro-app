import { base44 } from '@/api/base44Client';

/**
 * P0.2 - CREACIÓN AUTOMÁTICA DE PRE-DIAGNÓSTICO
 * 
 * Garantiza que toda OT tenga un PreDiagnostico asociado.
 * Se ejecuta automáticamente al crear una OT.
 * 
 * @param {string} ordenTrabajoId - ID de la OT recién creada
 * @param {string} organizationId - ID de la organización
 * @returns {Promise<Object>} El PreDiagnostico creado o existente
 */
export async function crearPreDiagnosticoAutomatico(ordenTrabajoId, organizationId) {
  if (!ordenTrabajoId || !organizationId) {
    throw new Error('ordenTrabajoId y organizationId son requeridos');
  }

  // P0.2: Verificar unicidad - si ya existe, retornar el existente
  const existentes = await base44.entities.PreDiagnostico.filter({
    organization_id: organizationId,
    orden_trabajo_id: ordenTrabajoId
  });

  if (existentes.length > 0) {
    console.log(`[PreDiag Auto] Ya existe PreDiagnostico para OT ${ordenTrabajoId}`);
    return existentes[0];
  }

  // P0.2: Crear nuevo PreDiagnostico en estado borrador
  const nuevoPreDiag = await base44.entities.PreDiagnostico.create({
    organization_id: organizationId,
    orden_trabajo_id: ordenTrabajoId,
    estado_wizard: 'borrador'
  });

  console.log(`[PreDiag Auto] PreDiagnostico creado automáticamente para OT ${ordenTrabajoId}`);
  return nuevoPreDiag;
}