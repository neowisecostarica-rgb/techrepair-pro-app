export const PROJECTION_VERSION = 'TRP_MULTIUSER_PROJECTIONS_V2_2C';

export function pickProjection(source, fields) {
  const output = {};
  for (const field of fields) {
    if (source?.[field] !== undefined) output[field] = source[field];
  }
  return output;
}

const OPERATIONAL_READ_FIELDS = Object.freeze({
  Cliente: ['id', 'organization_id', 'branch_id', 'nombre_completo', 'identificacion', 'tipo_cliente', 'telefono', 'email', 'direccion', 'notas', 'created_date', 'updated_date'],
});

export function projectOperationalReadResult(entityName, record, authorization = {}) {
  const fields = OPERATIONAL_READ_FIELDS[entityName];
  if (!fields) return {};
  return pickProjection(record, fields);
}