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
  WORK_ORDER_MUTATION_RESULT: [
    'id', 'organization_id', 'branch_id', 'codigo_ot', 'estado', 'estado_atencion',
    'prioridad', 'cliente_id', 'equipo_id', 'tecnico_asignado_id',
    'tecnico_asignado_email', 'motivo_ingreso', 'diagnostico_resumido',
    'ultima_actividad', 'ultima_actividad_at', 'fecha_ingreso',
    'fecha_revision_inicio', 'fecha_diagnostico', 'fecha_cierre',
    'fecha_entrega', 'cliente_aprobado', 'cliente_aprobado_at',
    'estado_custodia', 'fecha_ultimo_contacto', 'fecha_abandono',
  ],
  DELIVERY_LOG_MUTATION_RESULT: [
    'id', 'organization_id', 'branch_id', 'work_order_id', 'orden_trabajo_id',
    'status', 'delivered_at', 'acceptance', 'warranty_outcome', 'warranty_id',
  ],
  WARRANTY_MUTATION_RESULT: [
    'id', 'organization_id', 'branch_id', 'cliente_id', 'origen_tipo', 'origen_id',
    'fecha_emision', 'fecha_inicio', 'fecha_fin', 'estado', 'texto_snapshot',
  ],
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
export const projectWorkOrderMutationResult = workOrder => timestamps(
  workOrder,
  pickProjection(workOrder, ALLOWLISTS.WORK_ORDER_MUTATION_RESULT),
);
export const projectDeliveryLogMutationResult = deliveryLog => timestamps(
  deliveryLog,
  pickProjection(deliveryLog, ALLOWLISTS.DELIVERY_LOG_MUTATION_RESULT),
);
export const projectWarrantyMutationResult = warranty => timestamps(
  warranty,
  pickProjection(warranty, ALLOWLISTS.WARRANTY_MUTATION_RESULT),
);
const OPERATIONAL_MUTATION_IDENTITY_FIELDS = Object.freeze([
  'id', 'organization_id', 'branch_id', 'created_date', 'created_at', 'updated_date', 'updated_at',
]);
const SENSITIVE_MUTATION_RESULT_FIELD = /(token|secret|password|credential|authorization|cookie|lock|fingerprint|api[_-]?key|hash)/iu;

/**
 * Generic compatibility mutations may return only server identity/timestamps
 * plus the exact fields accepted for this command. Existing record fields that
 * were not part of the mutation can never hitchhike into the response.
 */
export function projectOperationalMutationResult(record, acceptedFields = []) {
  const commandFields = acceptedFields.filter(field => (
    typeof field === 'string'
    && !SENSITIVE_MUTATION_RESULT_FIELD.test(field)
    && !field.startsWith('public_access_')
  ));
  return pickProjection(record, [...OPERATIONAL_MUTATION_IDENTITY_FIELDS, ...commandFields]);
}

const OPERATIONAL_READ_FIELDS = Object.freeze({
  ActividadTecnica: ['id', 'organization_id', 'orden_trabajo_id', 'tecnico_id', 'tecnico_email', 'tipo_actividad', 'subtipo', 'inventario_id', 'inventario_cantidad', 'inventory_consumption_status', 'estado', 'started_at', 'ended_at', 'duracion_minutos', 'causa_bloqueo', 'resultado', 'notas', 'soft_deleted', 'created_date', 'updated_date'],
  BloqueoTecnico: ['id', 'organization_id', 'orden_trabajo_id', 'tecnico_id', 'tipo_bloqueo', 'descripcion', 'estado', 'resuelto_at', 'resuelto_por', 'created_date', 'updated_date'],
  Branch: ['id', 'organization_id', 'name', 'address', 'phone', 'active', 'is_primary', 'created_date', 'updated_date'],
  CategoriaInventario: ['id', 'organization_id', 'nombre', 'permite_stock', 'permite_precio', 'es_vendible', 'activo', 'created_date', 'updated_date'],
  Cita: ['id', 'organization_id', 'branch_id', 'cliente_id', 'tipo', 'fecha', 'hora_inicio', 'hora_fin', 'tecnico_asignado_id', 'tecnico_asignado_email', 'estado', 'motivo', 'orden_trabajo_id', 'notas', 'recordatorio_enviado', 'enlace_videollamada', 'created_date', 'updated_date'],
  Cliente: ['id', 'organization_id', 'branch_id', 'nombre_completo', 'identificacion', 'tipo_cliente', 'telefono', 'email', 'direccion', 'notas', 'created_date', 'updated_date'],
  ComprobanteVentaLog: ['id', 'organization_id', 'venta_id', 'accion', 'canal', 'formato', 'destinatario', 'notas', 'created_date'],
  Cotizacion: ['id', 'organization_id', 'branch_id', 'cliente_id', 'vendedor_id', 'vendedor_nombre', 'orden_trabajo_id', 'diagnostico_tecnico_id', 'version', 'items', 'subtotal', 'descuento_total', 'impuesto', 'total', 'estado', 'estado_conversion', 'venta_id', 'convertida_at', 'requiere_aprobacion', 'aprobada_por', 'aprobada_at', 'aprobacion_interna_status', 'aprobacion_interna_motivo', 'enviada_at', 'valida_hasta', 'notas', 'terminos_version_aceptada', 'cliente_rechazo_motivo', 'created_date', 'updated_date'],
  DiagnosticMasterRecord: ['id', 'organization_id', 'orden_trabajo_id', 'dmr_number', 'created_at', 'document_status', 'version', 'replaces_dmr_id', 'cliente_snapshot', 'activo_snapshot', 'contexto_recepcion', 'legal_snapshot', 'diagnostico_snapshot', 'pdf_url', 'signed_at', 'voided_at', 'replaced_at', 'created_date', 'updated_date'],
  Diagnostico: ['id', 'organization_id', 'orden_trabajo_id', 'cliente_id', 'equipo_id', 'tecnico_id', 'tipo_diagnostico', 'estado_diagnostico', 'conclusion_tecnica', 'resumen_cliente', 'nivel_riesgo', 'propuesta_precio_total', 'propuesta_precio_detalle', 'completed_at', 'created_date', 'updated_date'],
  DiagnosticoDocumento: ['id', 'diagnostico_id', 'organization_id', 'version', 'formato', 'url_documento', 'estado', 'emitido_at', 'snapshot_data', 'aprobacion_status', 'aprobacion_at', 'aprobacion_canal', 'anulado_at', 'canal_envio', 'enviado_at', 'metodo_aprobacion', 'created_date', 'updated_date'],
  DiagnosticoEvidencia: ['id', 'diagnostico_id', 'organization_id', 'tipo', 'url', 'contenido_texto', 'descripcion', 'created_date', 'updated_date'],
  DiagnosticoResultado: ['id', 'diagnostico_id', 'organization_id', 'categoria', 'descripcion_item', 'resultado', 'observaciones', 'created_date', 'updated_date'],
  DiagnosticoTecnico: ['id', 'organization_id', 'orden_trabajo_id', 'tecnico_id', 'estado', 'tipo_intervencion', 'componentes_revisar', 'pruebas_realizadas', 'hallazgos', 'causa_probable', 'trabajo_recomendado', 'riesgos_no_reparar', 'tiempo_estimado_horas', 'repuestos_requeridos', 'fecha_inicio', 'fecha_completado', 'bloqueado', 'created_date', 'updated_date'],
  EntregaLog: ['id', 'organization_id', 'branch_id', 'orden_trabajo_id', 'delivered_at', 'acceptance', 'checkbox_texto_legal', 'nota_entrega', 'entrega_con_saldo_pendiente', 'delivery_status', 'delivery_warranty_outcome', 'warranty_id', 'intervention_type', 'created_date'],
  Equipo: ['id', 'organization_id', 'branch_id', 'cliente_id', 'tipo', 'marca', 'modelo', 'serie', 'estado_fisico', 'accesorios', 'fotos', 'created_date', 'updated_date'],
  Expense: ['id', 'organization_id', 'branch_id', 'date', 'amount', 'category', 'frequency', 'is_fixed', 'description', 'payment_method', 'created_date', 'updated_date'],
  Garantia: ['id', 'organization_id', 'branch_id', 'cliente_id', 'origen_tipo', 'origen_id', 'equipo_id', 'fecha_emision', 'fecha_inicio', 'fecha_fin', 'estado', 'texto_snapshot', 'activated_at', 'created_date', 'updated_date'],
  Inventario: ['id', ...ALLOWLISTS.INVENTORY_READ_CONTEXT, 'created_date', 'updated_date'],
  InventarioHistorial: ['id', 'organization_id', 'branch_id', 'inventario_id', 'inventory_id', 'movement_type', 'quantity', 'quantity_delta', 'available_delta', 'reserved_delta', 'available_before', 'available_after', 'reserved_before', 'reserved_after', 'reference_type', 'reference_id', 'work_order_id', 'quote_id', 'reservation_id', 'effective_at', 'campo', 'valor_anterior', 'valor_nuevo', 'motivo', 'sale_id', 'created_date'],
  InventarioReserva: ['id', 'organization_id', 'branch_id', 'work_order_id', 'inventario_id', 'inventory_id', 'quote_id', 'quantity', 'state', 'reserved_at', 'consumed_at', 'released_at', 'returned_at', 'failure_compensated', 'created_date', 'updated_date'],
  NoConformidad: ['id', 'organization_id', 'branch_id', 'titulo', 'tipo', 'descripcion', 'orden_trabajo_id', 'venta_id', 'reportado_por', 'severidad', 'estado', 'causa_raiz', 'accion_correctiva', 'responsable_accion', 'fecha_limite', 'fecha_cierre', 'verificacion_eficacia', 'leccion_aprendida', 'created_date', 'updated_date'],
  NotaInterna: ['id', 'organization_id', 'orden_trabajo_id', 'autor_id', 'autor_nombre', 'contenido', 'menciones', 'tipo', 'created_date', 'updated_date'],
  Notificacion: ['id', 'organization_id', 'branch_id', 'user_id', 'role_target', 'tipo', 'mensaje', 'referencia_ot_id', 'accion_sugerida', 'estado', 'created_date', 'updated_date'],
  OTEvent: ['id', 'organization_id', 'orden_trabajo_id', 'tipo', 'sale_id', 'venta_total', 'tipo_concepto', 'detalle', 'processed', 'created_at', 'created_date'],
  OrdenTrabajo: [...ALLOWLISTS.WORK_ORDER_ASSIGNED_TECHNICAL, 'tracking_code', 'responsable_recepcion', 'fecha_entrega_estimada', 'created_date', 'updated_date', 'cliente_aprobado', 'cliente_aprobado_at', 'revision_pagada_at', 'revision_venta_id', 'estado_custodia', 'fecha_inicio_custodia', 'fecha_ultimo_contacto', 'fecha_abandono', 'abandono_observaciones'],
  PreDiagnostico: ['id', 'organization_id', 'orden_trabajo_id', 'estado', 'respuestas', 'completado_at', 'created_date', 'updated_date'],
  PruebaTecnica: ['id', 'organization_id', 'orden_trabajo_id', 'tecnico_id', 'technical_activity_segment_id', 'qa_cycle_id', 'qa_cycle_started_at', 'recorded_at', 'tipo_prueba', 'descripcion', 'resultado', 'observaciones', 'evidencia_urls', 'created_date'],
  PurchaseInvoice: ['id', 'organization_id', 'branch_id', 'supplier_id', 'invoice_number', 'date', 'due_date', 'total_amount', 'paid_amount', 'notes', 'created_date', 'updated_date'],
  Reciclaje: ['id', 'organization_id', 'branch_id', 'tipo_residuo', 'descripcion', 'peso_kg', 'cantidad_unidades', 'origen', 'orden_trabajo_id', 'accion', 'destino', 'empresa_recicladora', 'fecha_proceso', 'huella_carbono_evitada_kg', 'valor_recuperado', 'certificado_url', 'notas', 'created_date', 'updated_date'],
  RegistroTiempo: ['id', 'organization_id', 'orden_trabajo_id', 'tecnico_id', 'actividad', 'inicio', 'fin', 'duracion_minutos', 'tipo_actividad', 'created_date', 'updated_date'],
  Servicio: ['id', 'organization_id', 'nombre', 'descripcion', 'precio', 'activo', 'categoria', 'created_date', 'updated_date'],
  SolicitudTecnica: ['id', 'organization_id', 'branch_id', 'orden_trabajo_id', 'tecnico_id', 'tipo', 'descripcion', 'cantidad', 'estado', 'motivo_rechazo', 'aprobado_at', 'entregado_at', 'inventario_id', 'fulfillment_mode', 'requested_at', 'rejected_at', 'fulfilled_at', 'fulfillment_status', 'fulfillment_error', 'created_date', 'updated_date'],
  Supplier: ['id', 'organization_id', 'name', 'contact_name', 'phone', 'email', 'address', 'tax_id', 'payment_terms_days', 'active', 'created_date', 'updated_date'],
  SupplierPayment: ['id', 'organization_id', 'branch_id', 'purchase_invoice_id', 'amount', 'date', 'method', 'reference', 'notes', 'created_date'],
  TerminosYCondiciones: ['id', 'organization_id', 'version', 'texto', 'activo', 'created_date', 'updated_date'],
  Venta: ['id', 'organization_id', 'branch_id', 'cliente_id', 'origen_venta', 'origen_detalle', 'tipo_concepto', 'referencia_ot_id', 'referencia_diagnostico_id', 'cotizacion_id', 'cotizacion_total_original', 'cotizacion_subtotal_original', 'cotizacion_descuento_original', 'total', 'subtotal', 'impuesto', 'descuento_total', 'metodo_pago', 'estado', 'notas', 'created_date', 'updated_date'],
  VentaItem: ['id', 'organization_id', 'venta_id', 'tipo', 'referencia_id', 'descripcion', 'cantidad', 'precio_unitario', 'subtotal', 'created_date'],
  WorkflowGate: ['id', 'organization_id', 'subject_type', 'subject_id', 'wait_reason', 'provider_key', 'status', 'resolved_at', 'created_date', 'updated_date'],
});

export function projectOperationalReadResult(entityName, record, authorization = {}) {
  const fields = OPERATIONAL_READ_FIELDS[entityName];
  if (!fields) return {};
  const dto = pickProjection(record, fields);
  if (entityName === 'Cotizacion' && Array.isArray(dto.items)) dto.items = projectQuoteItems(dto.items);
  if (entityName === 'Inventario' && ['ORG_ADMIN', 'BRANCH_ADMIN', 'INVENTORY'].includes(authorization.role)) {
    return projectInventoryAdmin(record);
  }
  if (entityName === 'VentaItem' && authorization.role === 'ORG_ADMIN' && record?.costo_unitario_snapshot !== undefined) {
    dto.costo_unitario_snapshot = record.costo_unitario_snapshot;
  }
  return dto;
}

export const projectTechnicalActivity = record => pickProjection(record, OPERATIONAL_READ_FIELDS.ActividadTecnica);
export const projectTechnicalTest = record => pickProjection(record, OPERATIONAL_READ_FIELDS.PruebaTecnica);
export const projectNotification = record => pickProjection(record, OPERATIONAL_READ_FIELDS.Notificacion);
export const projectUserAccount = account => pickProjection(account, [
  'id', 'user_id', 'user_email', 'organization_id', 'branch_id', 'role', 'status', 'active',
  'invited_at', 'accepted_at', 'created_date', 'updated_date',
]);
export const projectLead = lead => pickProjection(lead, [
  'id', 'organization_id', 'branch_id', 'name', 'email', 'phone', 'source', 'status',
  'assigned_to', 'assigned_to_name', 'notes', 'converted_to_cliente_id', 'converted_at',
  'lost_reason', 'created_date', 'updated_date',
]);
export const projectSuperAdminAudit = event => pickProjection(event, [
  'id', 'super_admin_id', 'super_admin_email', 'action', 'target_organization_id',
  'target_organization_name', 'context', 'recorded_at', 'correlation_id', 'created_date',
]);
export function projectSaleMutationResult(sale) {
  const dto = pickProjection(sale, OPERATIONAL_READ_FIELDS.Venta);
  dto.items = Array.isArray(sale?.items)
    ? sale.items.map(item => pickProjection(item, OPERATIONAL_READ_FIELDS.VentaItem))
    : [];
  return dto;
}
export const assertProjectionExcludes = (dto, forbiddenFields) => forbiddenFields.every(field => !Object.hasOwn(dto || {}, field));
