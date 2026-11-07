// base44/functions/createWorkOrder/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";

// base44/functions/_shared/controlledPilotAuthority.ts
function cleanId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function inspectControlledPilotConfiguration(organization) {
  if (organization?.controlled_pilot_mode !== true) {
    return { enabled: false, valid: true, operatorUserId: null, branchId: null };
  }
  const operatorUserId = cleanId(organization.controlled_pilot_operator_user_id);
  const branchId = cleanId(organization.controlled_pilot_branch_id);
  return {
    enabled: true,
    valid: Boolean(operatorUserId && branchId),
    operatorUserId,
    branchId
  };
}
function evaluateControlledPilotHumanAccess({ organization, user, account, isSuperAdmin = false }) {
  const configuration = inspectControlledPilotConfiguration(organization);
  if (!configuration.enabled) return { ok: true, pilotMode: false };
  if (!configuration.valid) {
    return {
      ok: false,
      status: 503,
      code: "CONTROLLED_PILOT_CONFIGURATION_INVALID",
      error: "La configuracion del piloto controlado es invalida; toda mutacion permanece bloqueada"
    };
  }
  if (isSuperAdmin) {
    return {
      ok: false,
      status: 403,
      code: "CONTROLLED_PILOT_OPERATOR_REQUIRED",
      error: "El superadmin no puede mutar una organizacion en piloto controlado"
    };
  }
  const exactOperator = user?.id === configuration.operatorUserId && account?.user_id === configuration.operatorUserId && account?.organization_id === organization?.id && account?.status === "active" && account?.role === "ORG_ADMIN";
  if (!exactOperator) {
    return {
      ok: false,
      status: 403,
      code: "CONTROLLED_PILOT_OPERATOR_REQUIRED",
      error: "Solo el operador designado puede actuar durante el piloto controlado"
    };
  }
  return {
    ok: true,
    pilotMode: true,
    operatorUserId: configuration.operatorUserId,
    branchId: configuration.branchId
  };
}

// base44/functions/_shared/roleCapabilities.ts
var AUTHORIZATION_PRESET_VERSION = "TRP_MULTIUSER_V1";
var TENANT_ROLES = Object.freeze([
  "ORG_ADMIN",
  "BRANCH_ADMIN",
  "TECHNICIAN",
  "SALES",
  "INVENTORY",
  "CUSTOMER_SERVICE"
]);
var CAPABILITIES = Object.freeze([
  "ORG_ADMINISTRATION",
  "BRANCH_ADMINISTRATION",
  "USER_ADMINISTRATION",
  "RECEPTION_OPERATIONS",
  "CUSTOMER_READ_OPERATIONAL",
  "CUSTOMER_SERVICE_OPERATIONS",
  "TECHNICAL_WORK",
  "TECHNICAL_SUPERVISION",
  "TECHNICAL_ASSIGNMENT",
  "QUOTE_OPERATIONS",
  "SALE_OPERATIONS",
  "COMMERCIAL_READ",
  "FINANCIAL_READ",
  "INVENTORY_READ",
  "INVENTORY_OPERATIONS",
  "INVENTORY_ADMINISTRATION",
  "DELIVERY_OPERATIONS",
  "CRM_OPERATIONS",
  "AGENDA_OPERATIONS"
]);
var ROLE_CAPABILITY_PRESETS = Object.freeze({
  ORG_ADMIN: CAPABILITIES,
  BRANCH_ADMIN: [
    "BRANCH_ADMINISTRATION",
    "RECEPTION_OPERATIONS",
    "CUSTOMER_READ_OPERATIONAL",
    "CUSTOMER_SERVICE_OPERATIONS",
    "TECHNICAL_WORK",
    "TECHNICAL_SUPERVISION",
    "TECHNICAL_ASSIGNMENT",
    "QUOTE_OPERATIONS",
    "SALE_OPERATIONS",
    "COMMERCIAL_READ",
    "FINANCIAL_READ",
    "INVENTORY_READ",
    "INVENTORY_OPERATIONS",
    "INVENTORY_ADMINISTRATION",
    "DELIVERY_OPERATIONS",
    "CRM_OPERATIONS",
    "AGENDA_OPERATIONS"
  ],
  TECHNICIAN: [
    "CUSTOMER_READ_OPERATIONAL",
    "TECHNICAL_WORK",
    "COMMERCIAL_READ",
    "INVENTORY_READ",
    "INVENTORY_OPERATIONS"
  ],
  SALES: [
    "RECEPTION_OPERATIONS",
    "CUSTOMER_READ_OPERATIONAL",
    "CUSTOMER_SERVICE_OPERATIONS",
    "TECHNICAL_ASSIGNMENT",
    "QUOTE_OPERATIONS",
    "SALE_OPERATIONS",
    "COMMERCIAL_READ",
    "INVENTORY_READ",
    "DELIVERY_OPERATIONS",
    "CRM_OPERATIONS",
    "AGENDA_OPERATIONS"
  ],
  INVENTORY: [
    "CUSTOMER_READ_OPERATIONAL",
    "COMMERCIAL_READ",
    "INVENTORY_READ",
    "INVENTORY_OPERATIONS",
    "INVENTORY_ADMINISTRATION"
  ],
  CUSTOMER_SERVICE: [
    "RECEPTION_OPERATIONS",
    "CUSTOMER_READ_OPERATIONAL",
    "CUSTOMER_SERVICE_OPERATIONS",
    "COMMERCIAL_READ",
    "DELIVERY_OPERATIONS",
    "AGENDA_OPERATIONS"
  ]
});
function normalizeTenantRole(role) {
  if (role === "SUPPORT") return "CUSTOMER_SERVICE";
  return TENANT_ROLES.includes(role) ? role : null;
}
function getRoleCapabilities(role) {
  const normalizedRole = normalizeTenantRole(role);
  return normalizedRole ? [...ROLE_CAPABILITY_PRESETS[normalizedRole] || []] : [];
}
function getRoleScope(role) {
  const normalizedRole = normalizeTenantRole(role);
  if (!normalizedRole) return null;
  return normalizedRole === "ORG_ADMIN" ? "ORGANIZATION" : "SINGLE_BRANCH";
}

// base44/functions/_shared/userAuthorization.ts
function isCanonicalActiveUserAccount(account) {
  return account?.status === "active";
}
function getUserDataField(user, field) {
  return user?.data?.[field] ?? user?.[field] ?? null;
}
function isCanonicalSuperAdmin(user) {
  return user?.role === "admin";
}
async function loadActiveOrganization(base44, organizationId) {
  if (!organizationId) return null;
  const organizations = await base44.asServiceRole.entities.Organization.filter({
    id: organizationId,
    status: "active"
  }, "-created_date", 2);
  return organizations?.length === 1 ? organizations[0] : null;
}
async function loadActiveBranch(base44, organizationId, branchId) {
  if (!organizationId || !branchId) return null;
  const branches = await base44.asServiceRole.entities.Branch.filter({
    id: branchId,
    organization_id: organizationId,
    active: true
  }, "-created_date", 2);
  return branches?.length === 1 ? branches[0] : null;
}
async function loadCanonicalMemberships(base44, user) {
  const [byUserId, byEmail] = await Promise.all([
    base44.asServiceRole.entities.UserAccount.filter({ user_id: user.id }, "-created_date", 100),
    user.email ? base44.asServiceRole.entities.UserAccount.filter({ user_email: user.email }, "-created_date", 100) : Promise.resolve([])
  ]);
  const unique = /* @__PURE__ */ new Map();
  for (const account of [...byUserId || [], ...byEmail || []]) {
    if (account?.id) unique.set(account.id, account);
  }
  return [...unique.values()];
}
async function resolveIdentitySnapshot(base44, user) {
  if (!user?.id) return { ok: false, status: 401, error: "No autenticado" };
  const isSuperAdmin = isCanonicalSuperAdmin(user);
  const memberships = isSuperAdmin ? [] : await loadCanonicalMemberships(base44, user);
  const activeMemberships = memberships.filter(
    (account) => account.user_id === user.id && account.organization_id && isCanonicalActiveUserAccount(account)
  );
  const pendingInvitations = memberships.filter(
    (account) => account.user_email === user.email && account.organization_id && account.status === "invited" && (!account.user_id || account.user_id === user.id)
  );
  const persistedOrganizationId = getUserDataField(user, "organization_id");
  const impersonatingOrganizationId = isSuperAdmin ? getUserDataField(user, "impersonating_org_id") : null;
  const activeAccount = isSuperAdmin ? null : activeMemberships.find((account) => account.organization_id === persistedOrganizationId) || (activeMemberships.length === 1 ? activeMemberships[0] : null);
  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name || null,
      platform_role: user.role,
      is_super_admin: isSuperAdmin,
      organization_id: isSuperAdmin ? impersonatingOrganizationId : activeAccount?.organization_id || null,
      impersonating_org_id: impersonatingOrganizationId,
      impersonating_started_at: isSuperAdmin ? getUserDataField(user, "impersonating_started_at") : null
    },
    memberships,
    activeMemberships,
    pendingInvitations,
    activeAccount,
    isSuperAdmin
  };
}
async function resolveAuthorizedContext(base44, user, options = {}) {
  const {
    organizationHint = null,
    allowedRoles = [],
    requireOrganization = true
  } = options;
  const identity = await resolveIdentitySnapshot(base44, user);
  if (!identity.ok) return identity;
  if (identity.isSuperAdmin) {
    const impersonatedOrgId = identity.user.impersonating_org_id;
    if (organizationHint && organizationHint !== impersonatedOrgId) {
      return { ok: false, status: 403, error: "La organizacion solicitada no coincide con la impersonacion autorizada" };
    }
    if (requireOrganization && !impersonatedOrgId) {
      return { ok: false, status: 403, error: "Inicia una impersonacion autorizada antes de continuar" };
    }
    const organization2 = impersonatedOrgId ? await loadActiveOrganization(base44, impersonatedOrgId) : null;
    if (impersonatedOrgId && !organization2) {
      return { ok: false, status: 403, code: "ORGANIZATION_INACTIVE", error: "La organizacion no existe o no esta activa" };
    }
    if (organization2) {
      const pilotAccess2 = evaluateControlledPilotHumanAccess({ organization: organization2, user, account: null, isSuperAdmin: true });
      if (!pilotAccess2.ok) return pilotAccess2;
    }
    return {
      ok: true,
      organizationId: impersonatedOrgId || null,
      role: impersonatedOrgId ? "ORG_ADMIN" : "SUPER_ADMIN",
      persistedRole: "SUPER_ADMIN",
      normalizedRole: impersonatedOrgId ? "ORG_ADMIN" : null,
      capabilities: impersonatedOrgId ? getRoleCapabilities("ORG_ADMIN") : [],
      scope: impersonatedOrgId ? "ORGANIZATION" : "PLATFORM",
      branchId: null,
      principalClass: impersonatedOrgId ? "HUMAN_MEMBER" : "PLATFORM_ADMIN",
      presetVersion: AUTHORIZATION_PRESET_VERSION,
      organization: organization2,
      branch: null,
      account: null,
      isSuperAdmin: true,
      isImpersonating: Boolean(impersonatedOrgId),
      identity
    };
  }
  const activeAccounts = identity.activeMemberships;
  const persistedOrgId = identity.user.organization_id;
  const requestedOrgId = organizationHint || persistedOrgId || null;
  const matchingAccounts = requestedOrgId ? activeAccounts.filter((candidate) => candidate.organization_id === requestedOrgId) : [];
  if (matchingAccounts.length > 1) {
    return {
      ok: false,
      status: 409,
      code: "MEMBERSHIP_AMBIGUOUS",
      error: "Existen multiples membresias activas para la organizacion"
    };
  }
  const account = requestedOrgId ? matchingAccounts[0] || null : activeAccounts.length === 1 ? activeAccounts[0] : null;
  if (!account) {
    const error = activeAccounts.length > 1 ? "Selecciona una organizacion valida antes de continuar" : "No existe una membresia activa para esta organizacion";
    return { ok: false, status: 403, error };
  }
  const normalizedRole = normalizeTenantRole(account.role);
  if (!normalizedRole) {
    return { ok: false, status: 403, code: "ROLE_UNKNOWN", error: "La membresia tiene un rol no autorizado" };
  }
  const normalizedAllowedRoles = allowedRoles.map(normalizeTenantRole).filter(Boolean);
  if (normalizedAllowedRoles.length > 0 && !normalizedAllowedRoles.includes(normalizedRole)) {
    return { ok: false, status: 403, error: "Tu rol no permite realizar esta accion" };
  }
  const organization = await loadActiveOrganization(base44, account.organization_id);
  if (!organization) {
    return { ok: false, status: 403, code: "ORGANIZATION_INACTIVE", error: "La organizacion no existe o no esta activa" };
  }
  const pilotAccess = evaluateControlledPilotHumanAccess({ organization, user, account, isSuperAdmin: false });
  if (!pilotAccess.ok) return pilotAccess;
  const scope = getRoleScope(normalizedRole);
  const effectiveBranchId = pilotAccess.pilotMode ? pilotAccess.branchId : account.branch_id;
  const branch = scope === "SINGLE_BRANCH" || pilotAccess.pilotMode ? await loadActiveBranch(base44, account.organization_id, effectiveBranchId) : null;
  if ((scope === "SINGLE_BRANCH" || pilotAccess.pilotMode) && !branch) {
    return { ok: false, status: 403, code: "BRANCH_INACTIVE", error: "La sucursal canonica no existe o no esta activa" };
  }
  return {
    ok: true,
    organizationId: account.organization_id,
    role: normalizedRole,
    persistedRole: account.role,
    normalizedRole,
    capabilities: getRoleCapabilities(normalizedRole),
    scope,
    branchId: branch?.id || null,
    principalClass: "HUMAN_MEMBER",
    presetVersion: AUTHORIZATION_PRESET_VERSION,
    organization,
    branch,
    account,
    isSuperAdmin: false,
    isImpersonating: false,
    pilotMode: pilotAccess.pilotMode === true,
    pilotOperatorUserId: pilotAccess.operatorUserId || null,
    pilotBranchId: pilotAccess.branchId || null,
    identity
  };
}

// base44/functions/_shared/operationalAuthorization.ts
var ALL_OPERATIONAL_ROLES = [
  "ORG_ADMIN",
  "BRANCH_ADMIN",
  "TECHNICIAN",
  "SALES",
  "INVENTORY",
  "CUSTOMER_SERVICE"
];
var ADMIN_ROLES = ["ORG_ADMIN", "BRANCH_ADMIN"];
var COMMERCIAL_ROLES = ["ORG_ADMIN", "BRANCH_ADMIN", "SALES"];
var CUSTOMER_ROLES = ["ORG_ADMIN", "BRANCH_ADMIN", "SALES", "CUSTOMER_SERVICE"];
var TECHNICAL_ROLES = ["ORG_ADMIN", "BRANCH_ADMIN", "TECHNICIAN"];
var INVENTORY_READ_ROLES = ["ORG_ADMIN", "BRANCH_ADMIN", "TECHNICIAN", "SALES", "INVENTORY"];
var OPERATIONAL_ENTITY_POLICIES = Object.freeze({
  ActividadTecnica: { read: ALL_OPERATIONAL_ROLES, create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ["ORG_ADMIN"], scope: "work_order" },
  BloqueoTecnico: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ADMIN_ROLES, scope: "work_order" },
  Branch: { read: ALL_OPERATIONAL_ROLES, create: [], update: [], delete: [], scope: "branch" },
  CategoriaInventario: { read: INVENTORY_READ_ROLES, create: [], update: [], delete: [], scope: "organization" },
  Cita: { read: ALL_OPERATIONAL_ROLES, create: ["ORG_ADMIN", "BRANCH_ADMIN", "TECHNICIAN", "SALES"], update: ["ORG_ADMIN", "BRANCH_ADMIN", "TECHNICIAN", "SALES"], delete: ADMIN_ROLES, scope: "branch" },
  Cliente: { read: CUSTOMER_ROLES, create: CUSTOMER_ROLES, update: CUSTOMER_ROLES, delete: ["ORG_ADMIN"], scope: "customer" },
  ComprobanteVentaLog: { read: COMMERCIAL_ROLES, create: COMMERCIAL_ROLES, update: [], delete: [], scope: "sale" },
  Cotizacion: { read: [...COMMERCIAL_ROLES, "TECHNICIAN", "CUSTOMER_SERVICE"], create: COMMERCIAL_ROLES, update: COMMERCIAL_ROLES, delete: ["ORG_ADMIN"], scope: "quote" },
  DiagnosticMasterRecord: { read: [...TECHNICAL_ROLES, "SALES", "CUSTOMER_SERVICE"], create: [], update: [], delete: [], scope: "work_order" },
  Diagnostico: { read: [...TECHNICAL_ROLES, "SALES", "CUSTOMER_SERVICE"], create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ["ORG_ADMIN"], scope: "work_order" },
  DiagnosticoDocumento: { read: [...TECHNICAL_ROLES, "SALES", "CUSTOMER_SERVICE"], create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ["ORG_ADMIN"], scope: "diagnostic_document" },
  DiagnosticoEvidencia: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: [], delete: ["ORG_ADMIN"], scope: "work_order" },
  DiagnosticoResultado: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: [], delete: ["ORG_ADMIN"], scope: "work_order" },
  DiagnosticoTecnico: { read: [...TECHNICAL_ROLES, "SALES", "CUSTOMER_SERVICE"], create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ["ORG_ADMIN"], scope: "work_order" },
  EntregaLog: { read: COMMERCIAL_ROLES, create: [], update: [], delete: [], scope: "work_order" },
  Equipo: { read: [...CUSTOMER_ROLES, "TECHNICIAN"], create: CUSTOMER_ROLES, update: CUSTOMER_ROLES, delete: ["ORG_ADMIN"], scope: "equipment" },
  Expense: { read: ADMIN_ROLES, create: ADMIN_ROLES, update: ADMIN_ROLES, delete: ADMIN_ROLES, scope: "branch" },
  Garantia: { read: [...COMMERCIAL_ROLES, "CUSTOMER_SERVICE"], create: COMMERCIAL_ROLES, update: ADMIN_ROLES, delete: [], scope: "warranty" },
  Inventario: { read: INVENTORY_READ_ROLES, create: [], update: [], delete: [], scope: "branch" },
  InventarioHistorial: { read: ["ORG_ADMIN", "BRANCH_ADMIN", "INVENTORY"], create: [], update: [], delete: [], scope: "inventory_history" },
  InventarioReserva: { read: INVENTORY_READ_ROLES, create: [], update: [], delete: [], scope: "work_order" },
  NoConformidad: { read: TECHNICAL_ROLES, create: ADMIN_ROLES, update: ADMIN_ROLES, delete: ["ORG_ADMIN"], scope: "work_order_optional" },
  NotaInterna: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: [], delete: ADMIN_ROLES, scope: "work_order" },
  Notificacion: { read: ALL_OPERATIONAL_ROLES, create: ALL_OPERATIONAL_ROLES, update: ALL_OPERATIONAL_ROLES, delete: ["ORG_ADMIN"], scope: "notification" },
  OTEvent: { read: ALL_OPERATIONAL_ROLES, create: [], update: [], delete: [], scope: "work_order" },
  OrdenTrabajo: { read: ALL_OPERATIONAL_ROLES, create: [], update: CUSTOMER_ROLES, delete: ["ORG_ADMIN"], scope: "branch" },
  PreDiagnostico: { read: [...TECHNICAL_ROLES, "SALES", "CUSTOMER_SERVICE"], create: [...TECHNICAL_ROLES, "SALES"], update: [...TECHNICAL_ROLES, "SALES"], delete: ["ORG_ADMIN"], scope: "work_order" },
  PruebaTecnica: { read: TECHNICAL_ROLES, create: [], update: [], delete: [], scope: "work_order" },
  PurchaseInvoice: { read: ADMIN_ROLES, create: ADMIN_ROLES, update: ADMIN_ROLES, delete: ["ORG_ADMIN"], scope: "branch" },
  Reciclaje: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ["ORG_ADMIN"], scope: "branch" },
  RegistroTiempo: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ["ORG_ADMIN"], scope: "work_order" },
  Servicio: { read: INVENTORY_READ_ROLES, create: ["ORG_ADMIN"], update: ["ORG_ADMIN"], delete: ["ORG_ADMIN"], scope: "organization" },
  SolicitudTecnica: { read: TECHNICAL_ROLES, create: TECHNICAL_ROLES, update: TECHNICAL_ROLES, delete: ["ORG_ADMIN"], scope: "work_order_optional" },
  Supplier: { read: ADMIN_ROLES, create: ["ORG_ADMIN"], update: ["ORG_ADMIN"], delete: ["ORG_ADMIN"], scope: "organization" },
  SupplierPayment: { read: ADMIN_ROLES, create: ADMIN_ROLES, update: [], delete: ["ORG_ADMIN"], scope: "purchase_invoice" },
  TerminosYCondiciones: { read: ALL_OPERATIONAL_ROLES, create: ["ORG_ADMIN"], update: ["ORG_ADMIN"], delete: ["ORG_ADMIN"], scope: "organization" },
  Venta: { read: [...COMMERCIAL_ROLES, "CUSTOMER_SERVICE"], create: COMMERCIAL_ROLES, update: [], delete: [], scope: "branch" },
  VentaItem: { read: [...COMMERCIAL_ROLES, "CUSTOMER_SERVICE"], create: COMMERCIAL_ROLES, update: [], delete: [], scope: "sale" },
  WorkflowGate: { read: TECHNICAL_ROLES, create: [], update: [], delete: [], scope: "workflow_gate" }
});
var PROTECTED_OPERATIONAL_ENTITIES = Object.freeze(Object.keys(OPERATIONAL_ENTITY_POLICIES));
function isOrganizationWideRole(role) {
  return role === "ORG_ADMIN";
}
function getCanonicalBranchScope(authorization) {
  if (!authorization?.ok) {
    return { ok: false, status: authorization?.status || 403, error: authorization?.error || "No autorizado" };
  }
  if (authorization.pilotMode === true) {
    if (!authorization.pilotBranchId) {
      return { ok: false, status: 503, code: "CONTROLLED_PILOT_CONFIGURATION_INVALID", error: "El piloto no tiene una sucursal canonica valida" };
    }
    return { ok: true, organizationWide: false, branchId: authorization.pilotBranchId };
  }
  if (isOrganizationWideRole(authorization.role)) {
    return { ok: true, organizationWide: true, branchId: null };
  }
  const branchId = authorization.account?.branch_id || null;
  if (!branchId) {
    return {
      ok: false,
      status: 403,
      error: "La membresia operacional no tiene una sucursal canonica asignada",
      code: "OPERATIONAL_BRANCH_REQUIRED"
    };
  }
  return { ok: true, organizationWide: false, branchId };
}
function validateRequestedBranch(branchScope, requestedBranchId) {
  if (!requestedBranchId || branchScope.organizationWide) return { ok: true };
  if (requestedBranchId !== branchScope.branchId) {
    return {
      ok: false,
      status: 403,
      code: "OPERATIONAL_CROSS_BRANCH_DENIED",
      error: "La sucursal solicitada no coincide con la membresia autorizada"
    };
  }
  return { ok: true };
}
var WORK_ORDER_EDITABLE_FIELDS = Object.freeze([
  "motivo_ingreso",
  "observaciones_ingreso",
  "tipo_ingreso",
  "prioridad"
]);

// base44/functions/_shared/auditEvent.ts
var MAX_TEXT = 240;
function clean(value, max = MAX_TEXT) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}
function cleanObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value));
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value ?? null;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function immutableIdentity(event) {
  return stable({
    event_type: event.event_type,
    principal_class: event.principal_class,
    actor_user_id: event.actor_user_id,
    effective_technician_user_id: event.effective_technician_user_id,
    resource_type: event.resource_type,
    resource_id: event.resource_id,
    command_policy_id: event.command_policy_id,
    operation_semantics: event.operation_semantics || {}
  });
}
function assertCompatible(existing, candidate) {
  if (JSON.stringify(immutableIdentity(existing)) === JSON.stringify(immutableIdentity(candidate))) return;
  const error = new Error("AUDIT_OPERATION_ID_COLLISION");
  error.code = "AUDIT_OPERATION_ID_COLLISION";
  throw error;
}
async function findExisting(base44, event) {
  const existing = await base44.asServiceRole.entities.AuditEvent.filter({
    organization_id: event.organization_id,
    audit_operation_id: event.audit_operation_id
  }, "-created_date", 2);
  if (existing?.length > 1) {
    for (const record of existing) assertCompatible(record, event);
    const error = new Error("AUDIT_OPERATION_ID_AMBIGUOUS");
    error.code = "AUDIT_OPERATION_ID_AMBIGUOUS";
    throw error;
  }
  if (existing?.length === 1) {
    assertCompatible(existing[0], event);
    return existing[0];
  }
  return null;
}
function buildAuditEvent(input) {
  const event = {
    event_type: clean(input.eventType),
    principal_class: clean(input.principalClass),
    actor_user_id: clean(input.actorUserId),
    actor_primary_role: clean(input.actorPrimaryRole),
    effective_technician_user_id: clean(input.effectiveTechnicianUserId),
    organization_id: clean(input.organizationId),
    branch_id: clean(input.branchId),
    resource_type: clean(input.resourceType),
    resource_id: clean(input.resourceId),
    command_policy_id: clean(input.commandPolicyId),
    correlation_id: clean(input.correlationId),
    external_correlation_id: clean(input.externalCorrelationId || input.correlationId),
    audit_operation_id: clean(input.auditOperationId),
    operation_key: clean(input.operationKey),
    operation_semantics: cleanObject(input.operationSemantics),
    outcome: clean(input.outcome) || "COMMITTED",
    prior_state: cleanObject(input.priorState),
    new_state: cleanObject(input.newState),
    custody_snapshot: cleanObject(input.custodySnapshot),
    metadata: cleanObject(input.metadata),
    occurred_at: input.occurredAt || (/* @__PURE__ */ new Date()).toISOString()
  };
  for (const field of ["event_type", "principal_class", "organization_id", "resource_type", "resource_id", "command_policy_id", "correlation_id", "audit_operation_id"]) {
    if (!event[field]) throw new Error(`AUDIT_EVENT_FIELD_REQUIRED:${field}`);
  }
  return event;
}
async function appendAuditEvent(base44, input) {
  const event = buildAuditEvent(input);
  const existing = await findExisting(base44, event);
  if (existing) return { event: existing, duplicate: true };
  try {
    return { event: await base44.asServiceRole.entities.AuditEvent.create(event), duplicate: false };
  } catch (error) {
    const reconciled = await findExisting(base44, event);
    if (reconciled) return { event: reconciled, duplicate: true, reconciled: true };
    throw error;
  }
}

// base44/functions/createWorkOrder/entry.ts
var LOCK_OPERATION = "RECEPTION_CREATE";
var VALID_EQUIPMENT_TYPES = ["laptop", "desktop", "tablet", "smartphone", "impresora", "otro"];
var FAILURE_CODES = {
  resolve_equipment: "RECEPTION_EQUIPMENT_CREATE_FAILED",
  create_work_order: "RECEPTION_WORK_ORDER_CREATE_FAILED",
  create_dmr: "RECEPTION_DMR_CREATE_FAILED",
  create_event: "RECEPTION_EVENT_CREATE_FAILED"
};
var ReceptionError = class extends Error {
  constructor(code, message, status = 500, options = {}) {
    super(message);
    this.name = "ReceptionError";
    this.code = code;
    this.status = status;
    this.failedStep = options.failedStep || "unknown";
    this.auditDetail = options.auditDetail || message;
    this.retryable = options.retryable ?? false;
  }
};
var nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
var isUuid = (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
async function fingerprintReception(body) {
  const canonical = JSON.stringify({
    cliente_id: body.cliente_id || null,
    branch_id: body.branch_id || null,
    equipment_mode: body.equipment_mode || null,
    equipo_id: body.equipo_id || null,
    equipment: {
      tipo: body.equipment?.tipo || null,
      marca: body.equipment?.marca?.trim() || null,
      modelo: body.equipment?.modelo?.trim() || null,
      serie: body.equipment?.serie?.trim() || null,
      estado_fisico: body.equipment?.estado_fisico || null
    },
    motivo_ingreso: body.motivo_ingreso?.trim() || null,
    terms_id: body.terms_id || null
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function normalizeSerial(value) {
  return String(value || "").normalize("NFKC").trim().toUpperCase();
}
function unwrapFunctionResult(result) {
  return result?.data ?? result;
}
async function invokeResourceLock(base44, payload) {
  try {
    const result = unwrapFunctionResult(await base44.functions.invoke("resourceLockLite", payload));
    if (result?.success === true) return result;
    const resultCode = result?.code === "LOCK_FINGERPRINT_CONFLICT" ? "RECEPTION_IDEMPOTENCY_CONFLICT" : result?.code;
    throw new ReceptionError(
      resultCode || "RECEPTION_LOCK_FAILED",
      result?.message || "No se pudo adquirir el lock de recepci\xF3n.",
      result?.code === "LOCK_ACQUIRE_TIMEOUT" ? 423 : 409,
      { failedStep: "resource_lock", retryable: result?.retryable ?? true }
    );
  } catch (error) {
    if (error instanceof ReceptionError) throw error;
    const detail = error?.data || error?.response?.data || {};
    const detailCode = detail.code === "LOCK_FINGERPRINT_CONFLICT" ? "RECEPTION_IDEMPOTENCY_CONFLICT" : detail.code;
    throw new ReceptionError(
      detailCode || error?.code || "RECEPTION_LOCK_FAILED",
      detail.message || error?.message || "No se pudo adquirir el lock de recepci\xF3n.",
      error?.status || 500,
      { failedStep: "resource_lock", auditDetail: detail.audit_detail || error?.message, retryable: detail.retryable ?? true }
    );
  }
}
async function assertResourceLease(base44, lease, correlationId) {
  if (!lease) throw new ReceptionError("LOCK_LOST", "La recepci\xF3n perdi\xF3 sus recursos.", 409, {
    failedStep: "resource_lock",
    retryable: true
  });
  await invokeResourceLock(base44, {
    action: "assertOwned",
    operation: LOCK_OPERATION,
    correlation_id: correlationId,
    lease
  });
}
async function ownsResourceLease(base44, lease, correlationId) {
  try {
    await assertResourceLease(base44, lease, correlationId);
    return true;
  } catch {
    return false;
  }
}
async function releaseResourceLease(base44, lease, correlationId) {
  if (!lease) return;
  try {
    await invokeResourceLock(base44, {
      action: "releaseMany",
      operation: LOCK_OPERATION,
      correlation_id: correlationId,
      lease
    });
  } catch (error) {
    console.error(`[createWorkOrder] No se pudo liberar Resource Lock Lite: ${error.message}`);
  }
}
async function resolveOrganization(base44, user) {
  const authorization = await resolveAuthorizedContext(base44, user, {
    allowedRoles: ["ORG_ADMIN", "BRANCH_ADMIN", "SALES", "CUSTOMER_SERVICE"]
  });
  return authorization;
}
function buildDmrNumber(correlationId) {
  const year = (/* @__PURE__ */ new Date()).getFullYear();
  return `DMR-${year}-${correlationId.replaceAll("-", "").toUpperCase()}`;
}
function buildWorkOrderCode(correlationId) {
  const year = (/* @__PURE__ */ new Date()).getFullYear();
  return `OT-${year}-${correlationId.replaceAll("-", "").toUpperCase()}`;
}
function buildSuccess({ correlationId, equipment, equipmentCreated, workOrder, dmr, event, idempotent }) {
  return {
    success: true,
    correlation_id: correlationId,
    idempotent,
    equipment: { id: equipment.id, created: equipmentCreated },
    work_order: { id: workOrder.id, code: workOrder.codigo_ot },
    dmr: { id: dmr.id, number: dmr.dmr_number },
    event: { id: event.id, type: event.tipo },
    navigate_to: `/expediente/${workOrder.id}`
  };
}
async function auditReception(base44, action, orgId, details) {
  console.info("[createWorkOrder] operational trace", {
    action,
    organization_id: orgId,
    ...details,
    timestamp: nowIso()
  });
}
async function findOne(entity, query) {
  const records = await entity.filter(query, void 0, 5);
  return records?.[0] || null;
}
async function safeDeleteOwned(entity, { id, orgId, correlationId }) {
  if (!id) return { deleted: false, reason: "not_created" };
  const record = await findOne(entity, {
    id,
    organization_id: orgId,
    reception_correlation_id: correlationId
  });
  if (!record) return { deleted: false, reason: "not_owned_or_missing" };
  await entity.delete(id);
  return { deleted: true };
}
async function compensateReception(base44, context) {
  const {
    orgId,
    correlationId,
    equipmentMode,
    equipmentId,
    workOrderId,
    dmrId,
    eventId
  } = context;
  const deleted = [];
  const preserved = [];
  const errors = [];
  for (const [label, entity, id] of [
    ["event", base44.asServiceRole.entities.OTEvent, eventId],
    ["dmr", base44.asServiceRole.entities.DiagnosticMasterRecord, dmrId],
    ["work_order", base44.asServiceRole.entities.OrdenTrabajo, workOrderId]
  ]) {
    try {
      const result = await safeDeleteOwned(entity, { id, orgId, correlationId });
      if (result.deleted) deleted.push(`${label}:${id}`);
      else if (id) preserved.push(`${label}:${id}:${result.reason}`);
    } catch (error) {
      errors.push(`${label}:${id}:${error.message}`);
    }
  }
  if (equipmentId) {
    if (equipmentMode !== "create") {
      preserved.push(`equipment:${equipmentId}:preexisting`);
    } else {
      try {
        const equipment = await findOne(base44.asServiceRole.entities.Equipo, {
          id: equipmentId,
          organization_id: orgId,
          reception_correlation_id: correlationId,
          created_by_reception: true
        });
        if (!equipment) {
          preserved.push(`equipment:${equipmentId}:not_owned_or_missing`);
        } else {
          const references = await base44.asServiceRole.entities.OrdenTrabajo.filter({
            organization_id: orgId,
            equipo_id: equipmentId
          });
          const externalReferences = (references || []).filter(
            (order) => order.id !== workOrderId || order.reception_correlation_id !== correlationId
          );
          if (externalReferences.length > 0) {
            preserved.push(`equipment:${equipmentId}:referenced_by_other_work_order`);
          } else if ((references || []).length > 0) {
            preserved.push(`equipment:${equipmentId}:work_order_still_present`);
          } else {
            await base44.asServiceRole.entities.Equipo.delete(equipmentId);
            deleted.push(`equipment:${equipmentId}`);
          }
        }
      } catch (error) {
        errors.push(`equipment:${equipmentId}:${error.message}`);
      }
    }
  }
  return {
    status: errors.length > 0 ? "FAILED" : "SUCCEEDED",
    deleted,
    preserved,
    errors
  };
}
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let user = null;
  let orgId = null;
  let authorization = null;
  let body = {};
  let lease = null;
  const partial = {
    equipmentId: null,
    workOrderId: null,
    dmrId: null,
    eventId: null,
    equipmentMode: null
  };
  let failedStep = "authenticate";
  let reconciledExistingArtifact = false;
  try {
    user = await base44.auth.me();
    if (!user) throw new ReceptionError("RECEPTION_UNAUTHORIZED", "Debe iniciar sesi\xF3n nuevamente.", 401, { failedStep });
    authorization = await resolveOrganization(base44, user);
    orgId = authorization.ok ? authorization.organizationId : null;
    if (!orgId) {
      throw new ReceptionError("RECEPTION_ORGANIZATION_UNRESOLVED", "No se pudo determinar la organizaci\xF3n.", 403, { failedStep: "resolve_organization" });
    }
    body = await req.json();
    const {
      correlation_id: correlationId,
      cliente_id: clientId,
      branch_id: requestedBranchId,
      equipment_mode: equipmentMode,
      equipo_id: requestedEquipmentId,
      equipment: requestedEquipment,
      terms_id: termsId,
      motivo_ingreso: admissionReason
    } = body;
    const branchScope = getCanonicalBranchScope(authorization);
    if (!branchScope.ok) {
      throw new ReceptionError(branchScope.code || "RECEPTION_BRANCH_SCOPE_INVALID", branchScope.error, branchScope.status, { failedStep: "validate_branch_scope" });
    }
    const branchCheck = validateRequestedBranch(branchScope, requestedBranchId);
    if (!branchCheck.ok) {
      throw new ReceptionError(branchCheck.code, branchCheck.error, branchCheck.status, { failedStep: "validate_branch_scope" });
    }
    const branchId = branchScope.organizationWide ? requestedBranchId : branchScope.branchId;
    partial.equipmentMode = equipmentMode;
    failedStep = "validate_request";
    if (!isUuid(correlationId) || !clientId || !branchId || !admissionReason?.trim()) {
      throw new ReceptionError(
        "RECEPTION_VALIDATION_FAILED",
        "Cliente, sucursal, motivo y referencia de recepci\xF3n son obligatorios.",
        400,
        { failedStep }
      );
    }
    if (!["existing", "create"].includes(equipmentMode)) {
      throw new ReceptionError("RECEPTION_VALIDATION_FAILED", "Debe seleccionar o registrar un equipo.", 400, { failedStep });
    }
    if (equipmentMode === "existing" && !requestedEquipmentId) {
      throw new ReceptionError("RECEPTION_VALIDATION_FAILED", "Debe seleccionar un equipo existente.", 400, { failedStep });
    }
    if (equipmentMode === "create" && (!VALID_EQUIPMENT_TYPES.includes(requestedEquipment?.tipo) || !requestedEquipment?.marca?.trim())) {
      throw new ReceptionError("RECEPTION_VALIDATION_FAILED", "Tipo y marca del equipo son obligatorios.", 400, { failedStep });
    }
    const normalizedSerial = equipmentMode === "create" ? normalizeSerial(requestedEquipment?.serie) : "";
    const [client, branch, terms] = await Promise.all([
      findOne(base44.asServiceRole.entities.Cliente, { id: clientId, organization_id: orgId }),
      findOne(base44.asServiceRole.entities.Branch, { id: branchId, organization_id: orgId, active: true }),
      termsId ? findOne(base44.asServiceRole.entities.TerminosYCondiciones, {
        id: termsId,
        organization_id: orgId,
        activo: true
      }) : Promise.resolve(null)
    ]);
    if (!client) throw new ReceptionError("RECEPTION_CLIENT_NOT_FOUND", "El cliente no pertenece a esta organizaci\xF3n.", 404, { failedStep: "validate_client" });
    if (!branch) throw new ReceptionError("RECEPTION_BRANCH_INVALID", "La sucursal no es v\xE1lida o est\xE1 inactiva.", 400, { failedStep: "validate_branch" });
    if (!terms) throw new ReceptionError("RECEPTION_TERMS_INVALID", "Los t\xE9rminos seleccionados ya no est\xE1n activos.", 400, { failedStep: "validate_terms" });
    failedStep = "acquire_lock";
    const requestFingerprint = await fingerprintReception(body);
    const resources = [`client:${clientId}`];
    if (normalizedSerial) resources.push(`serial:${normalizedSerial}`);
    const lockResult = await invokeResourceLock(base44, {
      action: "acquireMany",
      operation: LOCK_OPERATION,
      correlation_id: correlationId,
      request_fingerprint: requestFingerprint,
      resources,
      timeout_ms: body.lock_timeout_ms
    });
    lease = lockResult.lease;
    failedStep = "resolve_equipment";
    await assertResourceLease(base44, lease, correlationId);
    let equipment = await findOne(base44.asServiceRole.entities.Equipo, {
      organization_id: orgId,
      reception_correlation_id: correlationId
    });
    if (equipment) reconciledExistingArtifact = true;
    let equipmentCreated = Boolean(equipment?.created_by_reception);
    if (equipmentMode === "existing") {
      equipment = await findOne(base44.asServiceRole.entities.Equipo, {
        id: requestedEquipmentId,
        organization_id: orgId
      });
      if (!equipment) throw new ReceptionError("RECEPTION_EQUIPMENT_NOT_FOUND", "El equipo no pertenece a esta organizaci\xF3n.", 404, { failedStep });
      if (equipment.cliente_id !== clientId) {
        throw new ReceptionError("RECEPTION_EQUIPMENT_OWNER_MISMATCH", "El equipo no pertenece al cliente seleccionado.", 409, { failedStep });
      }
      if (!branchScope.organizationWide && equipment.branch_id && equipment.branch_id !== branchScope.branchId) {
        throw new ReceptionError("RECEPTION_EQUIPMENT_CROSS_BRANCH_DENIED", "El equipo pertenece a otra sucursal.", 403, { failedStep });
      }
      equipmentCreated = false;
    } else if (!equipment) {
      if (normalizedSerial) {
        const tenantEquipment = await base44.asServiceRole.entities.Equipo.filter({ organization_id: orgId });
        const duplicate = (tenantEquipment || []).find((record) => normalizeSerial(record.serie) === normalizedSerial);
        if (duplicate) {
          throw new ReceptionError("RECEPTION_SERIAL_CONFLICT", "Ya existe un equipo con este n\xFAmero de serie.", 409, { failedStep });
        }
      }
      await assertResourceLease(base44, lease, correlationId);
      equipment = await base44.asServiceRole.entities.Equipo.create({
        organization_id: orgId,
        branch_id: branchId,
        cliente_id: clientId,
        tipo: requestedEquipment.tipo,
        marca: requestedEquipment.marca.trim(),
        modelo: requestedEquipment.modelo?.trim() || void 0,
        serie: normalizedSerial || void 0,
        estado_fisico: requestedEquipment.estado_fisico || void 0,
        accesorios: requestedEquipment.accesorios || [],
        fotos: requestedEquipment.fotos || [],
        reception_correlation_id: correlationId,
        created_by_reception: true
      });
      equipmentCreated = true;
    }
    if (equipment.cliente_id !== clientId) {
      throw new ReceptionError("RECEPTION_EQUIPMENT_OWNER_MISMATCH", "El equipo recuperado no pertenece al cliente seleccionado.", 409, { failedStep });
    }
    partial.equipmentId = equipment.id;
    failedStep = "create_work_order";
    await assertResourceLease(base44, lease, correlationId);
    let workOrder = await findOne(base44.asServiceRole.entities.OrdenTrabajo, {
      organization_id: orgId,
      reception_correlation_id: correlationId
    });
    if (workOrder) reconciledExistingArtifact = true;
    if (!workOrder) {
      workOrder = await base44.asServiceRole.entities.OrdenTrabajo.create({
        organization_id: orgId,
        codigo_ot: buildWorkOrderCode(correlationId),
        branch_id: branchId,
        cliente_id: clientId,
        equipo_id: equipment.id,
        motivo_ingreso: admissionReason.trim(),
        estado: "EN_COLA_REVISION",
        tipo_ingreso: body.tipo_ingreso || "presencial",
        prioridad: body.prioridad || "normal",
        observaciones_ingreso: body.observaciones_ingreso?.trim() || void 0,
        serie_ingreso: body.serie_ingreso?.trim() || equipment.serie || void 0,
        accesorios_ingreso: body.accesorios_ingreso?.trim() || void 0,
        estado_fisico_ingreso: body.estado_fisico_ingreso || void 0,
        contrasena_ingreso: body.contrasena_ingreso?.trim() || void 0,
        responsable_recepcion: body.responsable_recepcion?.trim() || void 0,
        tracking_code: body.tracking_code?.trim() || void 0,
        created_by_user_id: user.id,
        fecha_ingreso: nowIso(),
        reception_correlation_id: correlationId
      });
    }
    partial.workOrderId = workOrder.id;
    failedStep = "create_dmr";
    await assertResourceLease(base44, lease, correlationId);
    let dmr = await findOne(base44.asServiceRole.entities.DiagnosticMasterRecord, {
      organization_id: orgId,
      reception_correlation_id: correlationId
    });
    if (dmr) reconciledExistingArtifact = true;
    if (!dmr) {
      dmr = await base44.asServiceRole.entities.DiagnosticMasterRecord.create({
        organization_id: orgId,
        orden_trabajo_id: workOrder.id,
        dmr_number: buildDmrNumber(correlationId),
        created_at: nowIso(),
        document_status: "ACTIVE",
        version: 1,
        replaces_dmr_id: null,
        cliente_snapshot: {
          id: client.id || "",
          nombre_completo: client.nombre_completo || "",
          identificacion: client.identificacion || "",
          telefono: client.telefono || "",
          email: client.email || ""
        },
        activo_snapshot: {
          id: equipment.id || "",
          tipo: equipment.tipo || "",
          marca: equipment.marca || "",
          modelo: equipment.modelo || "",
          serie: equipment.serie || "",
          estado_fisico: equipment.estado_fisico || ""
        },
        contexto_recepcion: {
          motivo_ingreso: workOrder.motivo_ingreso || "",
          tipo_ingreso: workOrder.tipo_ingreso || "presencial",
          prioridad: workOrder.prioridad || "normal",
          accesorios_ingreso: workOrder.accesorios_ingreso || "",
          serie_ingreso: workOrder.serie_ingreso || "",
          observaciones_ingreso: workOrder.observaciones_ingreso || "",
          codigo_ot: workOrder.codigo_ot || "",
          fecha_ingreso: workOrder.fecha_ingreso || nowIso()
        },
        legal_snapshot: {
          terminos_aceptados: true,
          terminos_aceptados_at: nowIso(),
          terminos_version: terms.version,
          terminos_texto_snapshot: terms.texto
        },
        diagnostico_snapshot: null,
        pdf_url: null,
        pdf_hash: null,
        created_by_user_id: user.id,
        reception_correlation_id: correlationId
      });
    }
    partial.dmrId = dmr.id;
    failedStep = "create_event";
    await assertResourceLease(base44, lease, correlationId);
    let event = await findOne(base44.asServiceRole.entities.OTEvent, {
      organization_id: orgId,
      reception_correlation_id: correlationId,
      orden_trabajo_id: workOrder.id,
      tipo: "CREATED"
    });
    if (event) reconciledExistingArtifact = true;
    if (!event) {
      event = await base44.asServiceRole.entities.OTEvent.create({
        organization_id: orgId,
        orden_trabajo_id: workOrder.id,
        tipo: "CREATED",
        created_by_user_id: user.id,
        processed: false,
        created_at: nowIso(),
        reception_correlation_id: correlationId
      });
    }
    partial.eventId = event.id;
    await auditReception(base44, "RECEPTION_CREATED", orgId, {
      correlation_id: correlationId,
      equipment_id: equipment.id,
      work_order_id: workOrder.id,
      dmr_id: dmr.id,
      event_id: event.id,
      created_by: user.id
    });
    await appendAuditEvent(base44, {
      eventType: "WORK_ORDER_RECEPTION_CREATED",
      principalClass: authorization.principalClass,
      actorUserId: user.id,
      actorPrimaryRole: authorization.persistedRole,
      organizationId: orgId,
      branchId,
      resourceType: "OrdenTrabajo",
      resourceId: workOrder.id,
      commandPolicyId: "CP-OT-001",
      correlationId,
      auditOperationId: `work-order-reception:${workOrder.id}`,
      operationKey: correlationId,
      outcome: reconciledExistingArtifact ? "IDEMPOTENT_REPLAY" : "COMMITTED",
      newState: { estado: workOrder.estado, equipment_id: equipment.id, dmr_id: dmr.id },
      metadata: { legacy_event_id: event.id, equipment_created: equipmentCreated }
    });
    return Response.json(buildSuccess({
      correlationId,
      equipment,
      equipmentCreated,
      workOrder,
      dmr,
      event,
      idempotent: reconciledExistingArtifact
    }));
  } catch (error) {
    const normalized = error instanceof ReceptionError ? error : new ReceptionError(
      FAILURE_CODES[failedStep] || "RECEPTION_INTERNAL_ERROR",
      "No se pudo registrar la recepci\xF3n. No se guardaron cambios.",
      500,
      { failedStep, auditDetail: error.message, retryable: true }
    );
    let compensation = { status: "NOT_REQUIRED", deleted: [], preserved: [], errors: [] };
    const ownsLock = lease ? await ownsResourceLease(base44, lease, body.correlation_id) : false;
    if (ownsLock && (partial.equipmentId || partial.workOrderId || partial.dmrId || partial.eventId)) {
      compensation = await compensateReception(base44, {
        orgId,
        correlationId: body.correlation_id,
        equipmentMode: partial.equipmentMode,
        equipmentId: partial.equipmentId,
        workOrderId: partial.workOrderId,
        dmrId: partial.dmrId,
        eventId: partial.eventId
      });
    } else if (!ownsLock && (partial.equipmentId || partial.workOrderId || partial.dmrId || partial.eventId)) {
      compensation = {
        status: "SKIPPED_LOCK_NOT_OWNED",
        deleted: [],
        preserved: [
          partial.eventId && `event:${partial.eventId}`,
          partial.dmrId && `dmr:${partial.dmrId}`,
          partial.workOrderId && `work_order:${partial.workOrderId}`,
          partial.equipmentId && `equipment:${partial.equipmentId}`
        ].filter(Boolean),
        errors: []
      };
    }
    const compensationFailed = compensation.status === "FAILED";
    const code = compensationFailed ? "RECEPTION_COMPENSATION_FAILED" : normalized.code;
    const message = compensationFailed ? "La recepci\xF3n fall\xF3 y requiere revisi\xF3n manual. No reintente con datos diferentes." : normalized.message;
    await auditReception(base44, compensationFailed ? "RECEPTION_COMPENSATION_FAILED" : "RECEPTION_FAILED", orgId, {
      correlation_id: body.correlation_id || null,
      code,
      failed_step: normalized.failedStep,
      audit_detail: normalized.auditDetail,
      partial_state: {
        equipment_id: partial.equipmentId,
        work_order_id: partial.workOrderId,
        dmr_id: partial.dmrId,
        event_id: partial.eventId
      },
      compensation,
      reported_by: user?.id || null
    });
    return Response.json({
      success: false,
      code,
      message,
      audit_detail: normalized.auditDetail,
      correlation_id: body.correlation_id || null,
      failed_step: normalized.failedStep,
      retryable: compensationFailed ? false : normalized.retryable,
      partial_state: {
        equipment_id: partial.equipmentId,
        work_order_id: partial.workOrderId,
        dmr_id: partial.dmrId,
        event_id: partial.eventId
      },
      compensation
    }, { status: compensationFailed ? 500 : normalized.status });
  } finally {
    await releaseResourceLease(base44, lease, body.correlation_id);
  }
});
