/**
 * Genera un resumen automático del pre-diagnóstico en lenguaje humano
 */
export function generarResumenPreDiagnostico(preDiagnostico) {
  const partes = [];

  // Problema principal
  const problemasLabels = {
    no_enciende: 'Equipo no enciende',
    lento: 'Equipo lento',
    pantalla: 'Problema de pantalla',
    ruido_temperatura: 'Ruido o sobrecalentamiento',
    danio_fisico: 'Daño físico',
    limpieza_revision: 'Limpieza o revisión general',
    otro: 'Otro problema'
  };

  const problemaLabel = problemasLabels[preDiagnostico.problema_principal] || 'Problema no especificado';
  partes.push(problemaLabel + '.');

  // Uso principal
  const usosLabels = {
    hogar: 'Uso: hogar',
    trabajo: 'Uso: trabajo',
    empresa: 'Uso: empresa'
  };

  if (preDiagnostico.uso_principal) {
    partes.push(usosLabels[preDiagnostico.uso_principal] + '.');
  }

  // Equipo crítico
  if (preDiagnostico.equipo_critico) {
    partes.push('Equipo crítico para el cliente.');
  }

  // Respuestas relevantes
  if (preDiagnostico.respuestas) {
    const respuestas = preDiagnostico.respuestas;
    
    // Agregar respuestas con información valiosa
    Object.keys(respuestas).forEach(key => {
      const valor = respuestas[key];
      if (valor && valor !== 'no' && valor !== false) {
        // Formatear texto según clave
        if (key === 'cuando_inicio') {
          partes.push(`Problema inició: ${valor}.`);
        } else if (key === 'intermitente' && valor === 'si') {
          partes.push('Problema intermitente.');
        } else if (key === 'constante' && valor === 'si') {
          partes.push('Problema constante.');
        } else if (key === 'golpes_liquidos' && valor === 'si') {
          partes.push('Equipo sufrió golpes o líquidos.');
        } else if (key === 'software_reciente' && valor === 'si') {
          partes.push('Software instalado recientemente.');
        } else if (key === 'sobrecalentamiento' && valor === 'si') {
          partes.push('Cliente reporta sobrecalentamiento.');
        } else if (key === 'respaldo_datos' && valor === 'no') {
          partes.push('Sin respaldo de información.');
        }
      }
    });
  }

  // Riesgos
  if (preDiagnostico.riesgo_datos && preDiagnostico.riesgo_datos !== 'ninguno') {
    partes.push(`Riesgo de datos: ${preDiagnostico.riesgo_datos}.`);
  }

  if (preDiagnostico.riesgo_fisico && preDiagnostico.riesgo_fisico !== 'ninguno') {
    partes.push(`Riesgo físico: ${preDiagnostico.riesgo_fisico}.`);
  }

  if (preDiagnostico.observaciones_riesgo) {
    partes.push(preDiagnostico.observaciones_riesgo);
  }

  return partes.join(' ');
}