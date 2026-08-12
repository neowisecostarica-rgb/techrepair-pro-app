export const PROJECTION_VERSION = 'TRP_MULTIUSER_PROJECTIONS_V2_2C';

const ALLOWLISTS = Object.freeze({
  WORK_ORDER_LIST_OPERATIONAL: ['id', 'codigo_ot', 'estado', 'estado_atencion', 'prioridad', 'branch_id', 'equipo_id', 'cliente_id', 'tecnico_asignado_id', 'motivo_ingreso'],
  WORK_ORDER_TEAM_AWARENESS: ['id', 'codigo_ot', 'estado', 'estado_atencion', 'prioridad', 'branch_id', 'equipo_id', 'tecnico_asignado_id', 'motivo_ingreso', 'diagnostico_resumido', 'ultima_actividad', 'ultima_actividad_at'],
  WORK_ORDER_ASSIGNED_TECHNICAL: ['id', 'codigo_ot', 'organization_id', 'branch_id', 'cliente_id', 'equipo_id', 'serie_ingreso', 'accesorios_ingreso', 'estado_fisico_ingreso', 'estado', 'prioridad', 'tipo_ingreso', 'tecnico_asignado_id', 'tecnico_revisor_id', 'estado_atencion', 'ultima_actividad', 'ultima_actividad_at', 'motivo_pausa', 'motivo_ingreso', 'observaciones_ingreso', 'diagnostico_resumido', 'fecha_ingreso', 'fecha_revision_inicio', 'fecha_diagnostico', 'diagnostico_habilitado', 'motivo_bloqueo_diagnostico', 'qa_cycle_started_at'],
  RECEPTION_CUSTOMER: ['id', 'nombre_completo', 'identificacion', 'tipo_cliente', 'telefono', 'email', 'direccion'],
  RECEPTION_EQUIPMENT: ['id', 'cliente_id', 'tipo', 'marca', 'modelo', 'serie', 'estado_fisico', 'accesorios'],
  RECEPTION_WORK_ORDER: ['id', 'codigo_ot', 'cliente_id', 'equipo_id', 'estado', 'branch_id', 'motivo_ingreso', 'observaciones_ingreso', 'tipo_ingreso', 'fecha_ingreso', 'terminos_aceptados', 'terminos_aceptados_at', 'terminos_version'],
  CUSTOMER_SERVICE_WORK_ORDER: ['id', 'codigo_ot', 'branch_id', 'cliente_id', 'equipo_id', 'estado', 'prioridad', 'tipo_ingreso', 'fecha_entrega_estimada', 'motivo_ingreso', 'diagnostico_resumido', 'fecha_ingreso', 'cliente_aprobado'],
  CUSTOMER_SERVICE_APPOINTMENT: ['id', 'branch_id', 'cliente_id', 'tipo', 'fecha', 'hora_inicio', 'hora_fin', 'tecnico_asignado_id', 'estado', 'motivo', 'orden_trabajo_id', 'recordatorio_enviado'],
  INVENTORY_READ_CONTEXT: ['id', 'branch_id', 'codigo_interno', 'codigo_barras', 'sku', 'nombre', 'descripcion', 'categoria_id', 'tipo_item', 'marca', 'modelo', 'cantidad_disponible', 'cantidad_reservada', 'ubicacion', 'precio_venta', 'punto_reorden', 'estado', 'compatibilidades'],
  INVENTORY_ADMIN_ADDITIONAL: ['costo_unitario', 'proveedor', 'fecha_compra', 'documento_compra', 'garantia_proveedor_meses', 'garantia_proveedor_vence', 'numero_serie', 'fecha_ultimo_movimiento'],
  CUSTOMER_MESSAGE: ['id', 'branch_id', 'cliente_id', 'orden_trabajo_id', 'tipo', 'asunto', 'contenido', 'canal', 'enviado', 'enviado_at', 'created_date'],
  SALE_CUSTOMER_CONTEXT: ['id', 'branch_id', 'cliente_id', 'orden_trabajo_id', 'estado', 'subtotal', 'descuento_total', 'impuesto', 'total', 'saldo_pendiente', 'fecha_venta', 'created_date'],
  QUOTE_CUSTOMER_CONTEXT: ['id', 'branch_id', 'cliente_id', 'orden_trabajo_id', 'estado', 'items', 'subtotal', 'descuento_total', 'impuesto', 'total', 'cliente_decision_status', 'saldo_pendiente', 'created_date'],
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

export function projectWorkOrderAssignedTechnical(workOrder, customer, equipment, references = {}) {
  const dto = pickProjection(workOrder, ALLOWLISTS.WORK_ORDER_ASSIGNED_TECHNICAL);
  if (customer?.nombre_completo) dto.cliente_nombre_completo = customer.nombre_completo;
  const display = equipmentDisplay(equipment);
  if (display) dto.equipo_display = display;
  dto.equipo = pickProjection(equipment, ['tipo', 'marca', 'modelo', 'serie', 'estado_fisico', 'accesorios', 'fotos']);
  for (const [key, value] of Object.entries(references)) {
    if (['technical_evidence_ids', 'technical_test_ids', 'technical_request_ids', 'activity_segment_ids'].includes(key)) dto[key] = value;
  }
  return dto;
}

export const projectReceptionCustomer = customer => pickProjection(customer, ALLOWLISTS.RECEPTION_CUSTOMER);
export const projectReceptionEquipment = equipment => pickProjection(equipment, ALLOWLISTS.RECEPTION_EQUIPMENT);
export const projectReceptionWorkOrder = workOrder => pickProjection(workOrder, ALLOWLISTS.RECEPTION_WORK_ORDER);
export const projectCustomerServiceEquipment = equipment => pickProjection(equipment, ['id', 'cliente_id', 'tipo', 'marca', 'modelo', 'serie']);
export const projectCustomerServiceWorkOrder = workOrder => pickProjection(workOrder, ALLOWLISTS.CUSTOMER_SERVICE_WORK_ORDER);
export const projectCustomerServiceAppointment = appointment => pickProjection(appointment, ALLOWLISTS.CUSTOMER_SERVICE_APPOINTMENT);
export const projectInventoryRead = item => pickProjection(item, ALLOWLISTS.INVENTORY_READ_CONTEXT);
export const projectInventoryAdmin = item => pickProjection(item, [...ALLOWLISTS.INVENTORY_READ_CONTEXT, ...ALLOWLISTS.INVENTORY_ADMIN_ADDITIONAL]);

function projectQuoteItems(items) {
  return Array.isArray(items) ? items.map(item => pickProjection(item, [
    'id', 'tipo', 'referencia_id', 'descripcion', 'cantidad', 'precio_unitario', 'descuento', 'subtotal', 'total',
  ])) : [];
}

export function projectCustomerQuote(quote) {
  const dto = pickProjection(quote, ALLOWLISTS.QUOTE_CUSTOMER_CONTEXT);
  if (Object.hasOwn(dto, 'items')) dto.items = projectQuoteItems(dto.items);
  return dto;
}

export const projectCustomerSale = sale => pickProjection(sale, ALLOWLISTS.SALE_CUSTOMER_CONTEXT);
export const projectCustomerMessage = message => pickProjection(message, ALLOWLISTS.CUSTOMER_MESSAGE);
export const assertProjectionExcludes = (dto, forbiddenFields) => forbiddenFields.every(field => !Object.hasOwn(dto || {}, field));
