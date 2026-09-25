/**
 * Genera un resumen técnico automático del diagnóstico — i18n-aware (MB10-C)
 * @param {object} diagnosticoTecnico - Datos del diagnóstico
 * @param {function} [t] - Función de traducción opcional (useI18n t)
 */
export function generarResumenTecnico(diagnosticoTecnico, t) {
  const tr = t || ((k, f) => f);
  const partes = [];

  // Tipo de intervención
  const tiposLabels = {
    diagnostico_tecnico: tr('diagResumen.diagnosticoTecnico','Diagnóstico técnico completo'),
    mantenimiento_preventivo: tr('diagResumen.mantPreventivo','Mantenimiento preventivo'),
    mantenimiento_correctivo: tr('diagResumen.mantCorrectivo','Mantenimiento correctivo'),
    limpieza: tr('diagResumen.limpieza','Limpieza y mantenimiento'),
    reparacion_puntual: tr('diagResumen.reparacionPuntual','Reparación puntual'),
    revision_general: tr('diagResumen.revisionGeneral','Revisión general'),
    otro: tr('diagResumen.otro','Intervención técnica')
  };

  const tipoLabel = tiposLabels[diagnosticoTecnico.tipo_intervencion] || tr('diagResumen.otro','Intervención técnica');
  partes.push(`**${tipoLabel}**`);

  // Componentes revisados
  if (diagnosticoTecnico.componentes_revisar && diagnosticoTecnico.componentes_revisar.length > 0) {
    partes.push(`${tr('diagResumen.componentesRevisados','Componentes revisados')}: ${diagnosticoTecnico.componentes_revisar.join(', ')}.`);
  }

  // Hallazgos
  if (diagnosticoTecnico.hallazgos && Object.keys(diagnosticoTecnico.hallazgos).length > 0) {
    partes.push(`\n**${tr('diagResumen.hallazgos','Hallazgos')}:**`);
    Object.entries(diagnosticoTecnico.hallazgos).forEach(([key, value]) => {
      if (value && typeof value === 'string') {
        partes.push(`- ${value}`);
      }
    });
  }

  // Causa probable
  if (diagnosticoTecnico.causa_probable) {
    partes.push(`\n**${tr('diagResumen.causaProbable','Causa probable')}:** ${diagnosticoTecnico.causa_probable}`);
  }

  // Trabajo recomendado
  if (diagnosticoTecnico.trabajo_recomendado) {
    partes.push(`\n**${tr('diagResumen.trabajoRecomendado','Trabajo recomendado')}:** ${diagnosticoTecnico.trabajo_recomendado}`);
  }

  // Tiempo estimado
  if (diagnosticoTecnico.tiempo_estimado_horas) {
    partes.push(`\n**${tr('diagResumen.tiempoEstimado','Tiempo estimado')}:** ${diagnosticoTecnico.tiempo_estimado_horas} ${tr('diagResumen.horas','horas')}.`);
  }

  // Repuestos requeridos
  if (diagnosticoTecnico.repuestos_requeridos && diagnosticoTecnico.repuestos_requeridos.length > 0) {
    partes.push(`\n**${tr('diagResumen.repuestosRequeridos','Repuestos requeridos')}:**`);
    diagnosticoTecnico.repuestos_requeridos.forEach(repuesto => {
      partes.push(`- ${repuesto.descripcion} (${tr('diagResumen.cantidad','Cantidad')}: ${repuesto.cantidad})`);
    });
  }

  // Riesgos
  if (diagnosticoTecnico.riesgos_no_reparar) {
    partes.push(`\n**${tr('diagResumen.riesgosNoReparar','Riesgos si no se repara')}:** ${diagnosticoTecnico.riesgos_no_reparar}`);
  }

  return partes.join('\n');
}