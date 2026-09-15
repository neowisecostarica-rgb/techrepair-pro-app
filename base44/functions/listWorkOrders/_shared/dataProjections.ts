export const PROJECTION_VERSION = 'TRP_MULTIUSER_PROJECTIONS_V2_2C';

const ALLOWLISTS = Object.freeze({
  WORK_ORDER_LIST_OPERATIONAL: ['id', 'codigo_ot', 'estado', 'estado_atencion', 'prioridad', 'branch_id', 'equipo_id', 'cliente_id', 'tecnico_asignado_id', 'motivo_ingreso'],
  WORK_ORDER_TEAM_AWARENESS: ['id', 'codigo_ot', 'estado', 'estado_atencion', 'prioridad', 'branch_id', 'equipo_id', 'tecnico_asignado_id', 'motivo_ingreso', 'diagnostico_resumido', 'ultima_actividad', 'ultima_actividad_at'],
  WORK_ORDER_ASSIGNED_TECHNICAL: ['id', 'codigo_ot', 'organization_id', 'branch_id', 'cliente_id', 'equipo_id', 'serie_ingreso', 'accesorios_ingreso', 'estado_fisico_ingreso', 'estado', 'prioridad', 'tipo_ingreso', 'tecnico_asignado_id', 'tecnico_revisor_id', 'estado_atencion', 'ultima_actividad', 'ultima_actividad_at', 'motivo_pausa', 'motivo_ingreso', 'observaciones_ingreso', 'diagnostico_resumido', 'fecha_ingreso', 'fecha_revision_inicio', 'fecha_diagnostico', 'diagnostico_habilitado', 'motivo_bloqueo_diagnostico', 'qa_cycle_started_at'],
});

export function pickProjection(source, fields) {
  const output = {};
  for (const field of fields) {
    if (source?.[field] !== undefined) output[field] = source[field];
  }
  return output;
}

function equipmentDisplay(equipment) {
  return [equipment?.tipo, equipment?.marca, equipment?.modelo, equipment?.serie]
    .filter(Boolean)
    .join(' ') || null;
}

function timestamps(source, target) {
  const createdAt = source?.created_at || source?.created_date;
  const updatedAt = source?.updated_at || source?.updated_date;
  if (createdAt) target.created_at = createdAt;
  if (updatedAt) target.updated_at = updatedAt;
  return target;
}

export function projectWorkOrderList(workOrder, customer, equipment) {
  const dto = timestamps(workOrder, pickProjection(workOrder, ALLOWLISTS.WORK_ORDER_LIST_OPERATIONAL));
  if (customer?.nombre_completo) dto.cliente_nombre_completo = customer.nombre_completo;
  const display = equipmentDisplay(equipment);
  if (display) dto.equipo_display = display;
  return dto;
}

export function projectWorkOrderTeamAwareness(workOrder, equipment) {
  const dto = pickProjection(workOrder, ALLOWLISTS.WORK_ORDER_TEAM_AWARENESS);
  const display = equipmentDisplay(equipment);
  if (display) dto.equipo_display = display;
  return dto;
}