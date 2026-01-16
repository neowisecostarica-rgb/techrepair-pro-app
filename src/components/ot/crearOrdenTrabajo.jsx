import { base44 } from '@/api/base44Client';
import { crearPreDiagnosticoAutomatico } from '@/components/prediagnostico/crearPreDiagnosticoAutomatico';

/**
 * P0.2.b - HELPER CENTRAL ÚNICO PARA CREAR ÓRDENES DE TRABAJO
 * 
 * Este es el ÚNICO punto donde se deben crear OTs en todo el sistema.
 * Garantiza que SIEMPRE se cree un PreDiagnostico automáticamente.
 * 
 * Aplica a TODOS los orígenes: POS, recepción, mensajero, móvil, API.
 * 
 * @param {Object} datosOT - Datos de la OT a crear (ya con organization_id)
 * @returns {Promise<Object>} La OT creada
 */
export async function crearOrdenTrabajo(datosOT) {
  if (!datosOT.organization_id) {
    throw new Error('organization_id es requerido para crear una OT');
  }

  // 1. Crear la Orden de Trabajo
  const nuevaOT = await base44.entities.OrdenTrabajo.create(datosOT);

  // 2. P0.2: Crear PreDiagnostico automáticamente
  await crearPreDiagnosticoAutomatico(nuevaOT.id, datosOT.organization_id);

  return nuevaOT;
}