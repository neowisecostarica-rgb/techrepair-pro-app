/**
 * Genera un código único para Orden de Trabajo
 * Formato: OT-{orgPrefix}-{año}-{consecutivo}
 */
export async function generarCodigoOT(base44, organizationId) {
  // Obtener prefijo de la org (primeros 4 caracteres en mayúsculas)
  const orgPrefix = organizationId.slice(0, 4).toUpperCase();
  
  // Año actual
  const year = new Date().getFullYear();
  
  // Obtener todas las OTs de la org del año actual
  const otsDelAnio = await base44.entities.OrdenTrabajo.filter({
    organization_id: organizationId
  });
  
  // Filtrar por año en codigo_ot
  const otsAnoActual = otsDelAnio.filter(ot => {
    if (!ot.codigo_ot) return false;
    return ot.codigo_ot.includes(`-${year}-`);
  });
  
  // Calcular consecutivo
  const consecutivo = (otsAnoActual.length + 1).toString().padStart(4, '0');
  
  return `OT-${orgPrefix}-${year}-${consecutivo}`;
}

/**
 * Calcula fecha de entrega estimada según prioridad
 */
export function calcularFechaEntregaEstimada(prioridad) {
  const hoy = new Date();
  
  switch (prioridad) {
    case 'low':
      hoy.setDate(hoy.getDate() + 7);
      break;
    case 'normal':
      hoy.setDate(hoy.getDate() + 3);
      break;
    case 'high':
      hoy.setDate(hoy.getDate() + 1);
      break;
    case 'urgente':
      // Mismo día
      break;
    default:
      hoy.setDate(hoy.getDate() + 3); // default normal
  }
  
  return hoy.toISOString().split('T')[0]; // formato YYYY-MM-DD
}