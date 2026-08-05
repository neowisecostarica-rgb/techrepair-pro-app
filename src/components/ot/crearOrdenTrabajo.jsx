import { base44 } from '@/api/base44Client';

/**
 * HELPER CENTRAL ÚNICO PARA CREAR ÓRDENES DE TRABAJO — SOT: Base44
 *
 * @param {Object} datosOT - Datos de la OT
 * @returns {Promise<Object>} La OT creada
 */
export async function crearOrdenTrabajo(datosOT) {
  const response = await base44.functions.invoke('createWorkOrder', {
    correlation_id: datosOT.correlation_id,
    cliente_id: datosOT.cliente_id,
    equipment_mode: datosOT.equipment_mode,
    equipo_id: datosOT.equipo_id,
    equipment: datosOT.equipment,
    motivo_ingreso: datosOT.motivo_ingreso,
    branch_id: datosOT.branch_id,
    terms_id: datosOT.terms_id,
    tipo_ingreso: datosOT.tipo_ingreso,
    prioridad: datosOT.prioridad,
    observaciones_ingreso: datosOT.observaciones_ingreso,
    serie_ingreso: datosOT.serie_ingreso,
    accesorios_ingreso: datosOT.accesorios_ingreso,
    estado_fisico_ingreso: datosOT.estado_fisico_ingreso,
    contrasena_ingreso: datosOT.contrasena_ingreso,
    responsable_recepcion: datosOT.responsable_recepcion,
    tracking_code: datosOT.tracking_code,
    public_access_token: datosOT.public_access_token,
  });
  return response.data;
}
