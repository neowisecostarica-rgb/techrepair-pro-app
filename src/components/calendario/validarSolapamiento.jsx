import { base44 } from '@/api/base44Client';

/**
 * P0.2 TENANT ZERO: Validación de solapamientos
 * Verifica si existe conflicto de horario para un técnico
 */
export async function validarSolapamiento({
  tecnicoId,
  organizationId,
  fecha,
  horaInicio,
  horaFin,
  citaIdExcluir = null, // Para excluir la cita actual al editar
}) {
  // Obtener todas las citas del técnico en esa fecha
  const citas = await base44.entities.Cita.filter({
    organization_id: organizationId,
    tecnico_asignado_id: tecnicoId,
    fecha: fecha,
  });

  // Filtrar solo activas (no canceladas ni no_asistio)
  const citasActivas = citas.filter(
    c => c.estado !== 'cancelada' && 
         c.estado !== 'no_asistio' &&
         c.id !== citaIdExcluir
  );

  // Convertir a minutos para comparar
  const minutosInicio = horaAMinutos(horaInicio);
  const minutosFin = horaAMinutos(horaFin);

  // Verificar solapamientos
  for (const cita of citasActivas) {
    const citaInicio = horaAMinutos(cita.hora_inicio);
    const citaFin = horaAMinutos(cita.hora_fin || cita.hora_inicio);

    // Hay solapamiento si:
    // - El inicio está dentro de una cita existente
    // - El fin está dentro de una cita existente
    // - La cita existente está completamente dentro del rango
    const haySolapamiento = 
      (minutosInicio >= citaInicio && minutosInicio < citaFin) ||
      (minutosFin > citaInicio && minutosFin <= citaFin) ||
      (minutosInicio <= citaInicio && minutosFin >= citaFin);

    if (haySolapamiento) {
      return {
        conflicto: true,
        mensaje: `El técnico ya tiene un evento en ese horario (${cita.hora_inicio} - ${cita.hora_fin || 'sin fin'})`,
        citaConflicto: cita,
      };
    }
  }

  return { conflicto: false };
}

function horaAMinutos(hora) {
  if (!hora) return 0;
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}