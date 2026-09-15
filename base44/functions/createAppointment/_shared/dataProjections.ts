export const PROJECTION_VERSION = 'TRP_MULTIUSER_PROJECTIONS_V2_2C';

export function pickProjection(source, fields) {
  const output = {};
  for (const field of fields) {
    if (source?.[field] !== undefined) output[field] = source[field];
  }
  return output;
}

const OPERATIONAL_READ_FIELDS = Object.freeze({
  Cita: ['id', 'organization_id', 'branch_id', 'cliente_id', 'tipo', 'fecha', 'hora_inicio', 'hora_fin', 'tecnico_asignado_id', 'tecnico_asignado_email', 'estado', 'motivo', 'orden_trabajo_id', 'notas', 'recordatorio_enviado', 'enlace_videollamada', 'created_date', 'updated_date'],
});

export function projectOperationalReadResult(entityName, record, authorization = {}) {
  const fields = OPERATIONAL_READ_FIELDS[entityName];
  if (!fields) return {};
  return pickProjection(record, fields);
}