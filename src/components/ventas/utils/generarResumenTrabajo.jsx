/**
 * Genera un resumen humano corto (máx 3 líneas) del trabajo realizado
 * Usado en tiquetes y WhatsApp
 */
export function generarResumenTrabajo(diagnostico, cotizacion) {
  const lineas = [];

  // Causa principal del problema
  if (diagnostico?.causa_probable) {
    lineas.push(`Problema: ${diagnostico.causa_probable}`);
  }

  // Trabajo realizado (desde cotización aprobada)
  if (cotizacion?.items && cotizacion.items.length > 0) {
    const servicios = cotizacion.items
      .filter(item => ['servicio', 'mano_obra'].includes(item.tipo))
      .slice(0, 2) // Máximo 2 servicios
      .map(item => item.descripcion);
    
    if (servicios.length > 0) {
      lineas.push(`Trabajo: ${servicios.join(', ')}`);
    }
  }

  // Repuestos principales (máximo 2)
  if (cotizacion?.items && cotizacion.items.length > 0) {
    const repuestos = cotizacion.items
      .filter(item => item.tipo === 'repuesto')
      .slice(0, 2)
      .map(item => item.descripcion);
    
    if (repuestos.length > 0) {
      lineas.push(`Repuestos: ${repuestos.join(', ')}`);
    }
  }

  // Fallback si no hay info
  if (lineas.length === 0) {
    lineas.push('Servicio técnico completado');
  }

  return lineas.join('\n');
}