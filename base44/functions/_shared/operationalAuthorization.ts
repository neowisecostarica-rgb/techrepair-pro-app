const ALL_OPERATIONAL_ROLES = [
  'ORG_ADMIN',
  'BRANCH_ADMIN',
  'TECHNICIAN',
  'SALES',
  'INVENTORY',
  'SUPPORT',
];

const ADMIN_ROLES = ['ORG_ADMIN', 'BRANCH_ADMIN'];
const COMMERCIAL_ROLES = ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES'];
const CUSTOMER_ROLES = ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES', 'SUPPORT'];
const TECHNICAL_ROLES = ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'];
const INVENTORY_READ_ROLES = ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN', 'SALES', 'INVENTORY'];

/**
 * The client adapter may only expose entities listed here. Service-role backend
 * functions remain the only authority for lifecycle, stock and paid sales.
 */
export const OPERATIONAL_ENTITY_POLICIES = Object.freeze({
  ActividadTecnica: { read: ALL_OPERATIONAL_ROLES, create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ['ORG_ADMIN'], scope: 'work_order' },
  BloqueoTecnico: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ADMIN_ROLES, scope: 'work_order' },
  Branch: { read: ALL_OPERATIONAL_ROLES, create: ['ORG_ADMIN'], update: ['ORG_ADMIN'], delete: ['ORG_ADMIN'], scope: 'branch' },
  CategoriaInventario: { read: INVENTORY_READ_ROLES, create: [], update: [], delete: [], scope: 'organization' },
  Cita: { read: ALL_OPERATIONAL_ROLES, create: ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN', 'SALES'], update: ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN', 'SALES'], delete: ADMIN_ROLES, scope: 'branch' },
  Cliente: { read: CUSTOMER_ROLES, create: CUSTOMER_ROLES, update: CUSTOMER_ROLES, delete: ['ORG_ADMIN'], scope: 'customer' },
  ComprobanteVentaLog: { read: COMMERCIAL_ROLES, create: COMMERCIAL_ROLES, update: [], delete: [], scope: 'sale' },
  Cotizacion: { read: [...COMMERCIAL_ROLES, 'TECHNICIAN', 'SUPPORT'], create: COMMERCIAL_ROLES, update: COMMERCIAL_ROLES, delete: ['ORG_ADMIN'], scope: 'quote' },
  DiagnosticMasterRecord: { read: [...TECHNICAL_ROLES, 'SALES', 'SUPPORT'], create: [], update: [], delete: [], scope: 'work_order' },
  Diagnostico: { read: [...TECHNICAL_ROLES, 'SALES', 'SUPPORT'], create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ['ORG_ADMIN'], scope: 'work_order' },
  DiagnosticoDocumento: { read: [...TECHNICAL_ROLES, 'SALES', 'SUPPORT'], create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ['ORG_ADMIN'], scope: 'diagnostic_document' },
  DiagnosticoEvidencia: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: [], delete: ['ORG_ADMIN'], scope: 'work_order' },
  DiagnosticoResultado: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: [], delete: ['ORG_ADMIN'], scope: 'work_order' },
  DiagnosticoTecnico: { read: [...TECHNICAL_ROLES, 'SALES', 'SUPPORT'], create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ['ORG_ADMIN'], scope: 'work_order' },
  EntregaLog: { read: COMMERCIAL_ROLES, create: [], update: [], delete: [], scope: 'work_order' },
  Equipo: { read: [...CUSTOMER_ROLES, 'TECHNICIAN'], create: CUSTOMER_ROLES, update: CUSTOMER_ROLES, delete: ['ORG_ADMIN'], scope: 'equipment' },
  Expense: { read: ADMIN_ROLES, create: ADMIN_ROLES, update: ADMIN_ROLES, delete: ADMIN_ROLES, scope: 'branch' },
  Garantia: { read: [...COMMERCIAL_ROLES, 'SUPPORT'], create: COMMERCIAL_ROLES, update: ADMIN_ROLES, delete: [], scope: 'warranty' },
  Inventario: { read: INVENTORY_READ_ROLES, create: [], update: [], delete: [], scope: 'branch' },
  InventarioHistorial: { read: ['ORG_ADMIN', 'BRANCH_ADMIN', 'INVENTORY'], create: [], update: [], delete: [], scope: 'inventory_history' },
  InventarioReserva: { read: INVENTORY_READ_ROLES, create: [], update: [], delete: [], scope: 'work_order' },
  NoConformidad: { read: TECHNICAL_ROLES, create: ADMIN_ROLES, update: ADMIN_ROLES, delete: ['ORG_ADMIN'], scope: 'work_order_optional' },
  NotaInterna: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: [], delete: ADMIN_ROLES, scope: 'work_order' },
  Notificacion: { read: ALL_OPERATIONAL_ROLES, create: ALL_OPERATIONAL_ROLES, update: ALL_OPERATIONAL_ROLES, delete: ['ORG_ADMIN'], scope: 'notification' },
  OTEvent: { read: ALL_OPERATIONAL_ROLES, create: [], update: [], delete: [], scope: 'work_order' },
  OrdenTrabajo: { read: ALL_OPERATIONAL_ROLES, create: [], update: CUSTOMER_ROLES, delete: ['ORG_ADMIN'], scope: 'branch' },
  PreDiagnostico: { read: [...TECHNICAL_ROLES, 'SALES', 'SUPPORT'], create: [...TECHNICAL_ROLES, 'SALES'], update: [...TECHNICAL_ROLES, 'SALES'], delete: ['ORG_ADMIN'], scope: 'work_order' },
  PruebaTecnica: { read: TECHNICAL_ROLES, create: [], update: [], delete: [], scope: 'work_order' },
  PurchaseInvoice: { read: ADMIN_ROLES, create: ADMIN_ROLES, update: ADMIN_ROLES, delete: ['ORG_ADMIN'], scope: 'branch' },
  Reciclaje: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ['ORG_ADMIN'], scope: 'branch' },
  RegistroTiempo: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ['ORG_ADMIN'], scope: 'work_order' },
  Servicio: { read: INVENTORY_READ_ROLES, create: ['ORG_ADMIN'], update: ['ORG_ADMIN'], delete: ['ORG_ADMIN'], scope: 'organization' },
  SolicitudTecnica: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ['ORG_ADMIN'], scope: 'work_order_optional' },
  Supplier: { read: ADMIN_ROLES, create: ['ORG_ADMIN'], update: ['ORG_ADMIN'], delete: ['ORG_ADMIN'], scope: 'organization' },
  SupplierPayment: { read: ADMIN_ROLES, create: ADMIN_ROLES, update: [], delete: ['ORG_ADMIN'], scope: 'purchase_invoice' },
  TerminosYCondiciones: { read: ALL_OPERATIONAL_ROLES, create: ['ORG_ADMIN'], update: ['ORG_ADMIN'], delete: ['ORG_ADMIN'], scope: 'organization' },
  Venta: { read: [...COMMERCIAL_ROLES, 'SUPPORT'], create: COMMERCIAL_ROLES, update: [], delete: COMMERCIAL_ROLES, scope: 'branch' },
  VentaItem: { read: [...COMMERCIAL_ROLES, 'SUPPORT'], create: COMMERCIAL_ROLES, update: [], delete: [], scope: 'sale' },
  WorkflowGate: { read: TECHNICAL_ROLES, create: [], update: [], delete: [], scope: 'workflow_gate' },
});

export const PROTECTED_OPERATIONAL_ENTITIES = Object.freeze(Object.keys(OPERATIONAL_ENTITY_POLICIES));

export function isOrganizationWideRole(role) {
  return role === 'ORG_ADMIN';
}

export function getCanonicalBranchScope(authorization) {
  if (!authorization?.ok) {
    return { ok: false, status: authorization?.status || 403, error: authorization?.error || 'No autorizado' };
  }
  if (isOrganizationWideRole(authorization.role)) {
    return { ok: true, organizationWide: true, branchId: null };
  }
  const branchId = authorization.account?.branch_id || null;
  if (!branchId) {
    return {
      ok: false,
      status: 403,
      error: 'La membresia operacional no tiene una sucursal canonica asignada',
      code: 'OPERATIONAL_BRANCH_REQUIRED',
    };
  }
  return { ok: true, organizationWide: false, branchId };
}

export function authorizeOperationalAction(authorization, entityName, operation) {
  const policy = OPERATIONAL_ENTITY_POLICIES[entityName];
  if (!policy) {
    return { ok: false, status: 403, code: 'OPERATIONAL_ENTITY_DENIED', error: 'Entidad operacional no autorizada' };
  }
  const allowedRoles = policy[operation] || [];
  if (!allowedRoles.includes(authorization?.role)) {
    return { ok: false, status: 403, code: 'OPERATIONAL_ROLE_DENIED', error: 'Tu rol no permite realizar esta operacion' };
  }
  const branchScope = getCanonicalBranchScope(authorization);
  if (!branchScope.ok) return branchScope;
  return { ok: true, policy, branchScope };
}

export function validateRequestedBranch(branchScope, requestedBranchId) {
  if (!requestedBranchId || branchScope.organizationWide) return { ok: true };
  if (requestedBranchId !== branchScope.branchId) {
    return {
      ok: false,
      status: 403,
      code: 'OPERATIONAL_CROSS_BRANCH_DENIED',
      error: 'La sucursal solicitada no coincide con la membresia autorizada',
    };
  }
  return { ok: true };
}

export async function resolveAuthorizedBranch(base44, authorization, requestedBranchId, options = {}) {
  const { allowSingleBranchFallback = false, required = true } = options;
  const branchScope = getCanonicalBranchScope(authorization);
  if (!branchScope.ok) return branchScope;
  const branchCheck = validateRequestedBranch(branchScope, requestedBranchId);
  if (!branchCheck.ok) return branchCheck;

  let branchId = branchScope.organizationWide ? requestedBranchId || null : branchScope.branchId;
  if (!branchId && allowSingleBranchFallback) {
    const branches = await base44.asServiceRole.entities.Branch.filter({
      organization_id: authorization.organizationId,
      active: true,
    }, '-created_date', 2);
    if (branches?.length === 1) branchId = branches[0].id;
  }
  if (!branchId) {
    return required
      ? { ok: false, status: 400, code: 'OPERATIONAL_BRANCH_REQUIRED', error: 'La operacion requiere una sucursal autorizada' }
      : { ok: true, branchId: null, branchScope };
  }
  const branches = await base44.asServiceRole.entities.Branch.filter({
    id: branchId,
    organization_id: authorization.organizationId,
    active: true,
  }, '-created_date', 1);
  if (!branches?.length) {
    return { ok: false, status: 403, code: 'OPERATIONAL_BRANCH_INVALID', error: 'La sucursal no pertenece a la organizacion autorizada' };
  }
  return { ok: true, branchId, branchScope };
}

export function recordIsInsideBranchScope(branchScope, recordBranchIds) {
  if (branchScope.organizationWide) return true;
  const branches = Array.isArray(recordBranchIds) ? recordBranchIds : [recordBranchIds];
  return branches.filter(Boolean).includes(branchScope.branchId);
}

export function authorizeRecordBranch(authorization, recordBranchId) {
  const branchScope = getCanonicalBranchScope(authorization);
  if (!branchScope.ok) return branchScope;
  if (branchScope.organizationWide) return { ok: true, branchScope };
  if (!recordBranchId || recordBranchId !== branchScope.branchId) {
    return {
      ok: false,
      status: 403,
      code: 'OPERATIONAL_CROSS_BRANCH_DENIED',
      error: 'El recurso no pertenece a la sucursal autorizada',
    };
  }
  return { ok: true, branchScope };
}

export function sanitizeOperationalFilter(filter = {}) {
  const sanitized = {};
  for (const [key, value] of Object.entries(filter || {})) {
    if (key === 'organization_id' || key === 'branch_id') continue;
    if (key.startsWith('$') || key.includes('.')) continue;
    sanitized[key] = value;
  }
  return sanitized;
}

const FORBIDDEN_MUTATION_FIELDS = new Set([
  'organization_id',
  'branch_id',
  'created_by',
  'created_by_user_id',
  'created_by_role',
  'creado_por',
  'delivered_by_user_id',
  'delivered_by_role',
  'lifecycle_lock_token',
  'lifecycle_lock_operation',
  'lifecycle_lock_owner_user_id',
  'lifecycle_lock_at',
  'sale_lock_token',
  'sale_lock_operation_key',
  'sale_lock_owner_user_id',
  'sale_lock_at',
  'last_sale_id',
  'last_sale_operation_key',
  'decision_status',
  'decision_target_status',
  'decision_operation_key',
  'decision_started_at',
  'decision_committed_at',
  'decision_error',
  'public_access_token',
  'source',
  'source_id',
  'source_identity',
  'delivery_operation_key',
  'delivery_request_fingerprint',
  'delivery_status',
  'delivery_warranty_outcome',
  'delivery_warranty_id',
  'delivery_warranty_terms_snapshot',
  'delivery_warranty_months',
  'delivery_log_id',
  'delivery_started_at',
  'delivery_committed_at',
  'delivery_intervention_type',
  'delivery_commercial_snapshot',
  'delivery_error',
  'operation_key',
  'fingerprint',
  'acceptance',
  'delivered_at',
  'activated_at',
  'public_access_expires_at',
  'enviada_at',
  'ultimo_envio',
  'historial_envios',
  'contenido_aprobado_snapshot',
  'ip_aprobacion',
  'cliente_rechazo_motivo',
]);

export function sanitizeOperationalMutation(data = {}) {
  const sanitized = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (FORBIDDEN_MUTATION_FIELDS.has(key)) continue;
    if (key.startsWith('$') || key.includes('.')) continue;
    sanitized[key] = value;
  }
  return sanitized;
}

export const WORK_ORDER_EDITABLE_FIELDS = Object.freeze([
  'motivo_ingreso',
  'observaciones_ingreso',
  'tipo_ingreso',
  'prioridad',
]);

export function pickAllowedFields(data, allowedFields) {
  return Object.fromEntries(
    Object.entries(data || {}).filter(([key]) => allowedFields.includes(key)),
  );
}
