/**
 * Genera un resumen técnico automático del diagnóstico
 */
export function generarResumenTecnico(diagnosticoTecnico) {
  const partes = [];

  // Tipo de intervención
  const tiposLabels = {
    diagnostico_tecnico: 'Diagnóstico técnico completo',
    mantenimiento_preventivo: 'Mantenimiento preventivo',
    mantenimiento_correctivo: 'Mantenimiento correctivo',
    limpieza: 'Limpieza y mantenimiento',
    reparacion_puntual: 'Reparación puntual',
    revision_general: 'Revisión general',
    otro: 'Intervención técnica'
  };

  const tipoLabel = tiposLabels[diagnosticoTecnico.tipo_intervencion] || 'Intervención técnica';
  partes.push(`**${tipoLabel}**`);

  // Componentes revisados
  if (diagnosticoTecnico.componentes_revisar && diagnosticoTecnico.componentes_revisar.length > 0) {
    partes.push(`Componentes revisados: ${diagnosticoTecnico.componentes_revisar.join(', ')}.`);
  }

  // Hallazgos
  if (diagnosticoTecnico.hallazgos && Object.keys(diagnosticoTecnico.hallazgos).length > 0) {
    partes.push('\n**Hallazgos:**');
    Object.entries(diagnosticoTecnico.hallazgos).forEach(([key, value]) => {
      if (value && typeof value === 'string') {
        partes.push(`- ${value}`);
      }
    });
  }

  // Causa probable
  if (diagnosticoTecnico.causa_probable) {
    partes.push(`\n**Causa probable:** ${diagnosticoTecnico.causa_probable}`);
  }

  // Trabajo recomendado
  if (diagnosticoTecnico.trabajo_recomendado) {
    partes.push(`\n**Trabajo recomendado:** ${diagnosticoTecnico.trabajo_recomendado}`);
  }

  // Tiempo estimado
  if (diagnosticoTecnico.tiempo_estimado_horas) {
    partes.push(`\n**Tiempo estimado:** ${diagnosticoTecnico.tiempo_estimado_horas} horas.`);
  }

  // Repuestos requeridos
  if (diagnosticoTecnico.repuestos_requeridos && diagnosticoTecnico.repuestos_requeridos.length > 0) {
    partes.push('\n**Repuestos requeridos:**');
    diagnosticoTecnico.repuestos_requeridos.forEach(repuesto => {
      partes.push(`- ${repuesto.descripcion} (Cantidad: ${repuesto.cantidad})`);
    });
  }

  // Riesgos
  if (diagnosticoTecnico.riesgos_no_reparar) {
    partes.push(`\n**Riesgos si no se repara:** ${diagnosticoTecnico.riesgos_no_reparar}`);
  }

  return partes.join('\n');
}