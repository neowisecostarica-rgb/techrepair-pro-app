// base44/functions/reassignWorkOrderTechnician/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

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
function isKnownCapability(capability) {
  return CAPABILITIES.includes(capability);
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

// base44/functions/_shared/dataProjections.ts
var ALLOWLISTS = Object.freeze({
  WORK_ORDER_LIST_OPERATIONAL: ["id", "codigo_ot", "estado", "estado_atencion", "prioridad", "branch_id", "equipo_id", "cliente_id", "tecnico_asignado_id", "motivo_ingreso"],
  WORK_ORDER_TEAM_AWARENESS: ["id", "codigo_ot", "estado", "estado_atencion", "prioridad", "branch_id", "equipo_id", "tecnico_asignado_id", "motivo_ingreso", "diagnostico_resumido", "ultima_actividad", "ultima_actividad_at"],
  WORK_ORDER_ASSIGNED_TECHNICAL: ["id", "codigo_ot", "organization_id", "branch_id", "cliente_id", "equipo_id", "serie_ingreso", "accesorios_ingreso", "estado_fisico_ingreso", "estado", "prioridad", "tipo_ingreso", "tecnico_asignado_id", "tecnico_revisor_id", "estado_atencion", "ultima_actividad", "ultima_actividad_at", "motivo_pausa", "motivo_ingreso", "observaciones_ingreso", "diagnostico_resumido", "fecha_ingreso", "fecha_revision_inicio", "fecha_diagnostico", "diagnostico_habilitado", "motivo_bloqueo_diagnostico", "qa_cycle_started_at"],
  RECEPTION_CUSTOMER: ["id", "nombre_completo", "identificacion", "tipo_cliente", "telefono", "email", "direccion"],
  RECEPTION_EQUIPMENT: ["id", "cliente_id", "tipo", "marca", "modelo", "serie", "estado_fisico", "accesorios"],
  RECEPTION_WORK_ORDER: ["id", "codigo_ot", "cliente_id", "equipo_id", "estado", "branch_id", "motivo_ingreso", "observaciones_ingreso", "tipo_ingreso", "fecha_ingreso", "terminos_aceptados", "terminos_aceptados_at", "terminos_version"],
  CUSTOMER_SERVICE_WORK_ORDER: ["id", "codigo_ot", "branch_id", "cliente_id", "equipo_id", "estado", "prioridad", "tipo_ingreso", "fecha_entrega_estimada", "motivo_ingreso", "diagnostico_resumido", "fecha_ingreso", "cliente_aprobado"],
  CUSTOMER_SERVICE_APPOINTMENT: ["id", "branch_id", "cliente_id", "tipo", "fecha", "hora_inicio", "hora_fin", "tecnico_asignado_id", "estado", "motivo", "orden_trabajo_id", "recordatorio_enviado"],
  INVENTORY_READ_CONTEXT: ["id", "branch_id", "codigo_interno", "codigo_barras", "sku", "nombre", "descripcion", "foto_url", "galeria_fotos", "categoria_id", "tipo_item", "marca", "modelo", "cantidad_disponible", "cantidad_reservada", "ubicacion", "precio_venta", "punto_reorden", "estado", "compatibilidades"],
  INVENTORY_ADMIN_ADDITIONAL: ["costo_unitario", "proveedor", "fecha_compra", "documento_compra", "garantia_proveedor_meses", "garantia_proveedor_vence", "numero_serie", "fecha_ultimo_movimiento"],
  CUSTOMER_MESSAGE: ["id", "branch_id", "cliente_id", "orden_trabajo_id", "tipo", "asunto", "contenido", "canal", "enviado", "enviado_at", "created_date"],
  SALE_CUSTOMER_CONTEXT: ["id", "branch_id", "cliente_id", "orden_trabajo_id", "estado", "subtotal", "descuento_total", "impuesto", "total", "saldo_pendiente", "fecha_venta", "created_date"],
  QUOTE_CUSTOMER_CONTEXT: ["id", "branch_id", "cliente_id", "orden_trabajo_id", "estado", "items", "subtotal", "descuento_total", "impuesto", "total", "cliente_decision_status", "saldo_pendiente", "created_date"],
  WORK_ORDER_MUTATION_RESULT: [
    "id",
    "organization_id",
    "branch_id",
    "codigo_ot",
    "estado",
    "estado_atencion",
    "prioridad",
    "cliente_id",
    "equipo_id",
    "tecnico_asignado_id",
    "tecnico_asignado_email",
    "motivo_ingreso",
    "diagnostico_resumido",
    "ultima_actividad",
    "ultima_actividad_at",
    "fecha_ingreso",
    "fecha_revision_inicio",
    "fecha_diagnostico",
    "fecha_cierre",
    "fecha_entrega",
    "cliente_aprobado",
    "cliente_aprobado_at",
    "estado_custodia",
    "fecha_ultimo_contacto",
    "fecha_abandono"
  ],
  DELIVERY_LOG_MUTATION_RESULT: [
    "id",
    "organization_id",
    "branch_id",
    "work_order_id",
    "orden_trabajo_id",
    "status",
    "delivered_at",
    "acceptance",
    "warranty_outcome",
    "warranty_id"
  ],
  WARRANTY_MUTATION_RESULT: [
    "id",
    "organization_id",
    "branch_id",
    "cliente_id",
    "origen_tipo",
    "origen_id",
    "fecha_emision",
    "fecha_inicio",
    "fecha_fin",
    "estado",
    "texto_snapshot"
  ]
});
function pickProjection(source, fields) {
  const output = {};
  for (const field of fields) {
    if (source?.[field] !== void 0) output[field] = source[field];
  }
  return output;
}
function timestamps(source, target) {
  const createdAt = source?.created_at || source?.created_date;
  const updatedAt = source?.updated_at || source?.updated_date;
  if (createdAt) target.created_at = createdAt;
  if (updatedAt) target.updated_at = updatedAt;
  return target;
}
var projectWorkOrderMutationResult = (workOrder) => timestamps(
  workOrder,
  pickProjection(workOrder, ALLOWLISTS.WORK_ORDER_MUTATION_RESULT)
);
var OPERATIONAL_MUTATION_IDENTITY_FIELDS = Object.freeze([
  "id",
  "organization_id",
  "branch_id",
  "created_date",
  "created_at",
  "updated_date",
  "updated_at"
]);
var OPERATIONAL_READ_FIELDS = Object.freeze({
  ActividadTecnica: ["id", "organization_id", "orden_trabajo_id", "tecnico_id", "tecnico_email", "tipo_actividad", "subtipo", "inventario_id", "inventario_cantidad", "inventory_consumption_status", "estado", "started_at", "ended_at", "duracion_minutos", "causa_bloqueo", "resultado", "notas", "soft_deleted", "created_date", "updated_date"],
  BloqueoTecnico: ["id", "organization_id", "orden_trabajo_id", "tecnico_id", "tipo_bloqueo", "descripcion", "estado", "resuelto_at", "resuelto_por", "created_date", "updated_date"],
  Branch: ["id", "organization_id", "name", "address", "phone", "active", "is_primary", "created_date", "updated_date"],
  CategoriaInventario: ["id", "organization_id", "nombre", "permite_stock", "permite_precio", "es_vendible", "activo", "created_date", "updated_date"],
  Cita: ["id", "organization_id", "branch_id", "cliente_id", "tipo", "fecha", "hora_inicio", "hora_fin", "tecnico_asignado_id", "tecnico_asignado_email", "estado", "motivo", "orden_trabajo_id", "notas", "recordatorio_enviado", "enlace_videollamada", "created_date", "updated_date"],
  Cliente: ["id", "organization_id", "branch_id", "nombre_completo", "identificacion", "tipo_cliente", "telefono", "email", "direccion", "notas", "created_date", "updated_date"],
  ComprobanteVentaLog: ["id", "organization_id", "venta_id", "accion", "canal", "formato", "destinatario", "notas", "created_date"],
  Cotizacion: ["id", "organization_id", "branch_id", "cliente_id", "vendedor_id", "vendedor_nombre", "orden_trabajo_id", "diagnostico_tecnico_id", "version", "items", "subtotal", "descuento_total", "impuesto", "total", "estado", "estado_conversion", "venta_id", "convertida_at", "requiere_aprobacion", "aprobada_por", "aprobada_at", "aprobacion_interna_status", "aprobacion_interna_motivo", "enviada_at", "valida_hasta", "notas", "terminos_version_aceptada", "cliente_rechazo_motivo", "created_date", "updated_date"],
  DiagnosticMasterRecord: ["id", "organization_id", "orden_trabajo_id", "dmr_number", "created_at", "document_status", "version", "replaces_dmr_id", "cliente_snapshot", "activo_snapshot", "contexto_recepcion", "legal_snapshot", "diagnostico_snapshot", "pdf_url", "signed_at", "voided_at", "replaced_at", "created_date", "updated_date"],
  Diagnostico: ["id", "organization_id", "orden_trabajo_id", "cliente_id", "equipo_id", "tecnico_id", "tipo_diagnostico", "estado_diagnostico", "conclusion_tecnica", "resumen_cliente", "nivel_riesgo", "propuesta_precio_total", "propuesta_precio_detalle", "completed_at", "created_date", "updated_date"],
  DiagnosticoDocumento: ["id", "diagnostico_id", "organization_id", "version", "formato", "url_documento", "estado", "emitido_at", "snapshot_data", "aprobacion_status", "aprobacion_at", "aprobacion_canal", "anulado_at", "canal_envio", "enviado_at", "metodo_aprobacion", "created_date", "updated_date"],
  DiagnosticoEvidencia: ["id", "diagnostico_id", "organization_id", "tipo", "url", "contenido_texto", "descripcion", "created_date", "updated_date"],
  DiagnosticoResultado: ["id", "diagnostico_id", "organization_id", "categoria", "descripcion_item", "resultado", "observaciones", "created_date", "updated_date"],
  DiagnosticoTecnico: ["id", "organization_id", "orden_trabajo_id", "tecnico_id", "estado", "tipo_intervencion", "componentes_revisar", "pruebas_realizadas", "hallazgos", "causa_probable", "trabajo_recomendado", "riesgos_no_reparar", "tiempo_estimado_horas", "repuestos_requeridos", "fecha_inicio", "fecha_completado", "bloqueado", "created_date", "updated_date"],
  EntregaLog: ["id", "organization_id", "branch_id", "orden_trabajo_id", "delivered_at", "acceptance", "checkbox_texto_legal", "nota_entrega", "entrega_con_saldo_pendiente", "delivery_status", "delivery_warranty_outcome", "warranty_id", "intervention_type", "created_date"],
  Equipo: ["id", "organization_id", "branch_id", "cliente_id", "tipo", "marca", "modelo", "serie", "estado_fisico", "accesorios", "fotos", "created_date", "updated_date"],
  Expense: ["id", "organization_id", "branch_id", "date", "amount", "category", "frequency", "is_fixed", "description", "payment_method", "created_date", "updated_date"],
  Garantia: ["id", "organization_id", "branch_id", "cliente_id", "origen_tipo", "origen_id", "equipo_id", "fecha_emision", "fecha_inicio", "fecha_fin", "estado", "texto_snapshot", "activated_at", "created_date", "updated_date"],
  Inventario: ["id", ...ALLOWLISTS.INVENTORY_READ_CONTEXT, "created_date", "updated_date"],
  InventarioHistorial: ["id", "organization_id", "branch_id", "inventario_id", "inventory_id", "movement_type", "quantity", "quantity_delta", "available_delta", "reserved_delta", "available_before", "available_after", "reserved_before", "reserved_after", "reference_type", "reference_id", "work_order_id", "quote_id", "reservation_id", "effective_at", "campo", "valor_anterior", "valor_nuevo", "motivo", "sale_id", "created_date"],
  InventarioReserva: ["id", "organization_id", "branch_id", "work_order_id", "inventario_id", "inventory_id", "quote_id", "quantity", "state", "reserved_at", "consumed_at", "released_at", "returned_at", "failure_compensated", "created_date", "updated_date"],
  NoConformidad: ["id", "organization_id", "branch_id", "titulo", "tipo", "descripcion", "orden_trabajo_id", "venta_id", "reportado_por", "severidad", "estado", "causa_raiz", "accion_correctiva", "responsable_accion", "fecha_limite", "fecha_cierre", "verificacion_eficacia", "leccion_aprendida", "created_date", "updated_date"],
  NotaInterna: ["id", "organization_id", "orden_trabajo_id", "autor_id", "autor_nombre", "contenido", "menciones", "tipo", "created_date", "updated_date"],
  Notificacion: ["id", "organization_id", "branch_id", "user_id", "role_target", "tipo", "mensaje", "referencia_ot_id", "accion_sugerida", "estado", "created_date", "updated_date"],
  OTEvent: ["id", "organization_id", "orden_trabajo_id", "tipo", "sale_id", "venta_total", "tipo_concepto", "detalle", "processed", "created_at", "created_date"],
  OrdenTrabajo: [...ALLOWLISTS.WORK_ORDER_ASSIGNED_TECHNICAL, "tracking_code", "responsable_recepcion", "fecha_entrega_estimada", "created_date", "updated_date", "cliente_aprobado", "cliente_aprobado_at", "revision_pagada_at", "revision_venta_id", "estado_custodia", "fecha_inicio_custodia", "fecha_ultimo_contacto", "fecha_abandono", "abandono_observaciones"],
  PreDiagnostico: ["id", "organization_id", "orden_trabajo_id", "estado", "respuestas", "completado_at", "created_date", "updated_date"],
  PruebaTecnica: ["id", "organization_id", "orden_trabajo_id", "tecnico_id", "technical_activity_segment_id", "qa_cycle_id", "qa_cycle_started_at", "recorded_at", "tipo_prueba", "descripcion", "resultado", "observaciones", "evidencia_urls", "created_date"],
  PurchaseInvoice: ["id", "organization_id", "branch_id", "supplier_id", "invoice_number", "date", "due_date", "total_amount", "paid_amount", "notes", "created_date", "updated_date"],
  Reciclaje: ["id", "organization_id", "branch_id", "tipo_residuo", "descripcion", "peso_kg", "cantidad_unidades", "origen", "orden_trabajo_id", "accion", "destino", "empresa_recicladora", "fecha_proceso", "huella_carbono_evitada_kg", "valor_recuperado", "certificado_url", "notas", "created_date", "updated_date"],
  RegistroTiempo: ["id", "organization_id", "orden_trabajo_id", "tecnico_id", "actividad", "inicio", "fin", "duracion_minutos", "tipo_actividad", "created_date", "updated_date"],
  Servicio: ["id", "organization_id", "nombre", "descripcion", "precio", "activo", "categoria", "created_date", "updated_date"],
  SolicitudTecnica: ["id", "organization_id", "branch_id", "orden_trabajo_id", "tecnico_id", "tipo", "descripcion", "cantidad", "estado", "motivo_rechazo", "aprobado_at", "entregado_at", "inventario_id", "fulfillment_mode", "requested_at", "rejected_at", "fulfilled_at", "fulfillment_status", "fulfillment_error", "created_date", "updated_date"],
  Supplier: ["id", "organization_id", "name", "contact_name", "phone", "email", "address", "tax_id", "payment_terms_days", "active", "created_date", "updated_date"],
  SupplierPayment: ["id", "organization_id", "branch_id", "purchase_invoice_id", "amount", "date", "method", "reference", "notes", "created_date"],
  TerminosYCondiciones: ["id", "organization_id", "version", "texto", "activo", "created_date", "updated_date"],
  Venta: ["id", "organization_id", "branch_id", "cliente_id", "origen_venta", "origen_detalle", "tipo_concepto", "referencia_ot_id", "referencia_diagnostico_id", "cotizacion_id", "cotizacion_total_original", "cotizacion_subtotal_original", "cotizacion_descuento_original", "total", "subtotal", "impuesto", "descuento_total", "metodo_pago", "estado", "notas", "created_date", "updated_date"],
  VentaItem: ["id", "organization_id", "venta_id", "tipo", "referencia_id", "descripcion", "cantidad", "precio_unitario", "subtotal", "created_date"],
  WorkflowGate: ["id", "organization_id", "subject_type", "subject_id", "wait_reason", "provider_key", "status", "resolved_at", "created_date", "updated_date"]
});

// base44/functions/_shared/commandPolicy.ts
var COMMAND_POLICY_VERSION = "TRP_MULTIUSER_COMMAND_POLICY_V1";
var PRINCIPAL_CLASSES = Object.freeze([
  "HUMAN_MEMBER",
  "CUSTOMER_TOKEN",
  "SYSTEM_AUTOMATION",
  "PLATFORM_ADMIN"
]);
var RESOURCE_RELATIONSHIPS = Object.freeze([
  "NONE",
  "ORG_RESOURCE",
  "BRANCH_RESOURCE",
  "ASSIGNEE",
  "EFFECTIVE_TECHNICIAN",
  "SUPERVISOR",
  "REQUESTER",
  "APPROVER",
  "INVENTORY_FULFILLER",
  "CUSTOMER_TOKEN_RESOURCE"
]);
var policy = (definition) => Object.freeze({
  version: COMMAND_POLICY_VERSION,
  auditRequired: true,
  returnsProjection: null,
  migrationCategory: "ROUTE_TO_CANONICAL_COMMAND",
  ...definition
});
var COMMAND_POLICIES = Object.freeze({
  "CP-OT-001": policy({ endpoint: "createWorkOrder", principalClasses: ["HUMAN_MEMBER"], capability: { anyOf: ["RECEPTION_OPERATIONS", "SALE_OPERATIONS"] }, scope: "BRANCH", relationship: "BRANCH_RESOURCE", precondition: "RECEPTION_ELIGIBLE", writer: "createWorkOrder", auditOwner: "AuditEvent+OTEvent", returnsProjection: "RECEPTION_CUSTOMER_CONTEXT" }),
  "CP-OT-002": policy({ endpoint: "transitionWorkOrderStatus", principalClasses: ["HUMAN_MEMBER"], capability: { commandSpecific: true }, scope: "OT_BRANCH", relationship: "BRANCH_RESOURCE", precondition: "EXACT_LIFECYCLE_EDGE_AND_GATES", writer: "transitionWorkOrderStatus", auditOwner: "AuditEvent+OTEvent" }),
  "CP-ASG-001": policy({ endpoint: "reassignWorkOrderTechnician:initial", principalClasses: ["HUMAN_MEMBER"], capability: { allOf: ["TECHNICAL_ASSIGNMENT"] }, scope: "OT_BRANCH", relationship: "SUPERVISOR", precondition: "ELIGIBLE_TECHNICIAN_AND_NO_TECHNICAL_EXECUTION", writer: "reassignWorkOrderTechnician", auditOwner: "AuditEvent+OTEvent" }),
  "CP-ASG-002": policy({ endpoint: "reassignWorkOrderTechnician:forced", principalClasses: ["HUMAN_MEMBER"], capability: { allOf: ["TECHNICAL_ASSIGNMENT"] }, scope: "OT_BRANCH", relationship: "SUPERVISOR", precondition: "ADMIN_ONLY_AFTER_EXECUTION_AND_PRESERVE_HISTORY", writer: "reassignWorkOrderTechnician", auditOwner: "AuditEvent+OTEvent" }),
  "CP-TECH-001": policy({ endpoint: "initTechnicalActivity:start", principalClasses: ["HUMAN_MEMBER"], capability: { allOf: ["TECHNICAL_WORK"] }, scope: "OT_BRANCH", relationship: "EFFECTIVE_TECHNICIAN", precondition: "ONE_ACTIVE_WORK_AND_CURRENT_ASSIGNMENT", writer: "initTechnicalActivity", auditOwner: "AuditEvent+ActividadTecnica" }),
  "CP-TECH-002": policy({ endpoint: "technicalActivity:pause", principalClasses: ["HUMAN_MEMBER"], capability: { allOf: ["TECHNICAL_WORK"] }, scope: "OT_BRANCH", relationship: "EFFECTIVE_TECHNICIAN", precondition: "CLOSE_CURRENT_SEGMENT", writer: "technicalActivityCommand", auditOwner: "AuditEvent+ActividadTecnica" }),
  "CP-TECH-003": policy({ endpoint: "technicalActivity:resume", principalClasses: ["HUMAN_MEMBER"], capability: { allOf: ["TECHNICAL_WORK"] }, scope: "OT_BRANCH", relationship: "EFFECTIVE_TECHNICIAN", precondition: "CREATE_NEW_SEGMENT_AND_ONE_ACTIVE_WORK", writer: "technicalActivityCommand", auditOwner: "AuditEvent+ActividadTecnica" }),
  "CP-DIAG-001": policy({ endpoint: "updateDiagnosticoResumen", principalClasses: ["HUMAN_MEMBER"], capability: { allOf: ["TECHNICAL_WORK"] }, scope: "OT_BRANCH", relationship: "EFFECTIVE_TECHNICIAN", precondition: "CURRENT_CUSTODY_AND_ATTRIBUTION", writer: "updateDiagnosticoResumen", auditOwner: "AuditEvent+technical-evidence" }),
  "CP-DIAG-002": policy({ endpoint: "technicalRecordCommand", principalClasses: ["HUMAN_MEMBER"], capability: { commandSpecific: true }, scope: "OT_BRANCH", relationship: "BRANCH_RESOURCE", precondition: "TENANT_PARENT_BRANCH_AND_AUTHORSHIP", writer: "technicalRecordCommand", auditOwner: "AuditEvent+technical-record" }),
  "CP-QA-001": policy({ endpoint: "recordTechnicalTest", principalClasses: ["HUMAN_MEMBER"], capability: { allOf: ["TECHNICAL_WORK"] }, scope: "OT_BRANCH", relationship: "EFFECTIVE_TECHNICIAN", precondition: "CURRENT_QA_CYCLE_AND_AUTHORSHIP", writer: "recordTechnicalTest", auditOwner: "AuditEvent+PruebaTecnica" }),
  "CP-QUOTE-001": policy({ endpoint: "operationalGateway:Cotizacion", principalClasses: ["HUMAN_MEMBER"], capability: { allOf: ["QUOTE_OPERATIONS"] }, scope: "BRANCH", relationship: "BRANCH_RESOURCE", precondition: "SERVER_COMMERCIAL_RULES", writer: "operationalGateway", auditOwner: "AuditEvent" }),
  "CP-QUOTE-002": policy({ endpoint: "handlePublicCustomerDecisionV2", principalClasses: ["CUSTOMER_TOKEN"], authorityContract: "QUOTE_DECISION", capability: null, scope: "EXACT_TOKEN_RESOURCE", relationship: "CUSTOMER_TOKEN_RESOURCE", precondition: "TOKEN_PURPOSE_VERSION_EXPIRY_REVOCATION_AND_WORKFLOW", writer: "handlePublicCustomerDecisionV2", auditOwner: "AuditEvent+OTEvent" }),
  "CP-QUOTE-003": policy({ endpoint: "transitionWorkOrderStatus:recordCustomerDecision", principalClasses: ["HUMAN_MEMBER"], capability: { allOf: ["QUOTE_OPERATIONS"] }, scope: "OT_BRANCH", relationship: "BRANCH_RESOURCE", precondition: "CONTROLLED_PILOT_OPERATOR_AND_EXACT_QUOTE_VERSION", writer: "transitionWorkOrderStatus", auditOwner: "AuditEvent+OTEvent" }),
  "CP-SALE-001": policy({ endpoint: "createSale", principalClasses: ["HUMAN_MEMBER"], capability: { allOf: ["SALE_OPERATIONS"] }, scope: "BRANCH", relationship: "BRANCH_RESOURCE", precondition: "SERVER_TOTALS_AND_IDEMPOTENCY", writer: "createSale", auditOwner: "AuditEvent+Venta" }),
  "CP-DEL-001": policy({ endpoint: "deliverWorkOrder", principalClasses: ["HUMAN_MEMBER"], capability: { allOf: ["DELIVERY_OPERATIONS"] }, scope: "OT_BRANCH", relationship: "BRANCH_RESOURCE", precondition: "PAYMENT_QA_ACTIVITY_AND_ACCEPTANCE_GATES", writer: "deliverWorkOrder", auditOwner: "AuditEvent+EntregaLog" }),
  "CP-INV-001": policy({ endpoint: "inventoryMutationService", principalClasses: ["HUMAN_MEMBER"], capability: { allOf: ["INVENTORY_OPERATIONS"] }, scope: "BRANCH", relationship: "BRANCH_RESOURCE", precondition: "CANONICAL_LEDGER_AND_IDEMPOTENCY", writer: "inventoryMutationService", auditOwner: "AuditEvent+InventarioHistorial" }),
  "CP-REQ-001": policy({ endpoint: "technicalRequestCommand:request", principalClasses: ["HUMAN_MEMBER"], capability: { allOf: ["TECHNICAL_WORK"] }, scope: "OT_BRANCH", relationship: "EFFECTIVE_TECHNICIAN", precondition: "REQUESTER_ATTRIBUTION", writer: "technicalRequestCommand", auditOwner: "AuditEvent+SolicitudTecnica" }),
  "CP-REQ-002": policy({ endpoint: "technicalRequestCommand:approve-spend", principalClasses: ["HUMAN_MEMBER"], capability: { anyOf: ["BRANCH_ADMINISTRATION", "ORG_ADMINISTRATION"] }, scope: "BRANCH_OR_ORGANIZATION", relationship: "APPROVER", precondition: "NEW_SPEND_REQUIRES_ADMIN", writer: "technicalRequestCommand", auditOwner: "AuditEvent+SolicitudTecnica" }),
  "CP-REQ-003": policy({ endpoint: "technicalRequestCommand:fulfill-stock", principalClasses: ["HUMAN_MEMBER"], capability: { allOf: ["INVENTORY_OPERATIONS"] }, scope: "BRANCH", relationship: "INVENTORY_FULFILLER", precondition: "INVENTORY_COMMIT_BEFORE_FULFILLED", writer: "technicalRequestCommand->inventoryMutationService", auditOwner: "AuditEvent+SolicitudTecnica+InventarioHistorial" }),
  "CP-CUST-001": policy({ endpoint: "createClient/updateClient/crmGateway", principalClasses: ["HUMAN_MEMBER"], capability: { allOf: ["CUSTOMER_SERVICE_OPERATIONS"] }, scope: "BRANCH_RESOURCE", relationship: "BRANCH_RESOURCE", precondition: "SAFE_CUSTOMER_FIELDS", writer: "customer gateways", auditOwner: "AuditEvent", returnsProjection: "RECEPTION_CUSTOMER_CONTEXT" }),
  "CP-EQP-001": policy({ endpoint: "createEquipment/operationalGateway:Equipo", principalClasses: ["HUMAN_MEMBER"], capability: { allOf: ["RECEPTION_OPERATIONS"] }, scope: "BRANCH_RESOURCE", relationship: "BRANCH_RESOURCE", precondition: "AUTHORIZED_CUSTOMER_RELATIONSHIP", writer: "equipment gateways", auditOwner: "AuditEvent", returnsProjection: "RECEPTION_CUSTOMER_CONTEXT" }),
  "CP-CRM-001": policy({ endpoint: "crmGateway", principalClasses: ["HUMAN_MEMBER"], capability: { allOf: ["CRM_OPERATIONS"] }, scope: "BRANCH", relationship: "BRANCH_RESOURCE", precondition: "BRANCH_CUSTOMER_RELATIONSHIP", writer: "crmGateway", auditOwner: "AuditEvent" }),
  "CP-AGENDA-001": policy({ endpoint: "operationalGateway:Cita", principalClasses: ["HUMAN_MEMBER"], capability: { allOf: ["AGENDA_OPERATIONS"] }, scope: "BRANCH", relationship: "BRANCH_RESOURCE", precondition: "BRANCH_APPOINTMENT", writer: "operationalGateway", auditOwner: "AuditEvent", returnsProjection: "CUSTOMER_SERVICE_CONTEXT" }),
  "CP-CUSTODY-001": policy({ endpoint: "updateCustodiaData", principalClasses: ["HUMAN_MEMBER"], capability: { allOf: ["TECHNICAL_WORK"] }, scope: "OT_BRANCH", relationship: "EFFECTIVE_TECHNICIAN", precondition: "CURRENT_CUSTODY_AND_ATTRIBUTION", writer: "updateCustodiaData", auditOwner: "AuditEvent" }),
  "CP-RECYCLE-001": policy({ endpoint: "operationalGateway:Reciclaje", principalClasses: ["HUMAN_MEMBER"], capability: { anyOf: ["TECHNICAL_WORK", "BRANCH_ADMINISTRATION"] }, scope: "BRANCH", relationship: "BRANCH_RESOURCE", precondition: "AUTHORIZED_BRANCH", writer: "operationalGateway", auditOwner: "AuditEvent" }),
  "CP-FIN-001": policy({ endpoint: "operationalGateway:Expense/PurchaseInvoice/SupplierPayment", principalClasses: ["HUMAN_MEMBER"], capability: { allOf: ["FINANCIAL_READ"] }, scope: "BRANCH_OR_ORGANIZATION", relationship: "BRANCH_RESOURCE", precondition: "ADMIN_FINANCIAL_SCOPE", writer: "operationalGateway", auditOwner: "AuditEvent" }),
  "CP-NOTIF-001": policy({ endpoint: "notificationCommand", principalClasses: ["SYSTEM_AUTOMATION", "HUMAN_MEMBER"], capability: { commandSpecific: true }, scope: "RESOURCE_SCOPE", relationship: "ORG_RESOURCE", precondition: "DURABLE_TRIGGER_AND_DEDUPLICATION", writer: "notificationCommand", auditOwner: "AuditEvent" }),
  "CP-USER-001": policy({ endpoint: "manageOrgUser", principalClasses: ["HUMAN_MEMBER"], capability: { allOf: ["USER_ADMINISTRATION"] }, scope: "ORGANIZATION", relationship: "ORG_RESOURCE", precondition: "ORG_ADMIN_ONLY_AND_LAST_ADMIN_PROTECTION", writer: "manageOrgUser", auditOwner: "AuditEvent" }),
  "CP-PROV-001": policy({ endpoint: "identityGateway:bootstrapOrganization|adminCreateOrganization", principalClasses: ["PLATFORM_ADMIN", "HUMAN_MEMBER"], capability: null, authorityContract: "PLATFORM_OR_SELF_PROVISIONING", scope: "NEW_ORGANIZATION", relationship: "ORG_RESOURCE", precondition: "CANONICAL_MANIFEST_AND_READINESS_VALIDATION", writer: "identityGateway->tenantProvisioning", auditOwner: "AuditEvent" }),
  "CP-PILOT-001": policy({ endpoint: "identityGateway:configureControlledPilot", principalClasses: ["PLATFORM_ADMIN"], capability: null, authorityContract: "CONTROLLED_PILOT_CONFIGURATION", scope: "ORGANIZATION", relationship: "ORG_RESOURCE", precondition: "QUIESCENT_ORG_SINGLE_ACTIVE_OPERATOR_AND_ACTIVE_BRANCH", writer: "identityGateway", auditOwner: "AuditEvent+SuperAdminAudit" }),
  "CP-BR-001": policy({ endpoint: "manageBranchLifecycle", principalClasses: ["HUMAN_MEMBER"], capability: { allOf: ["ORG_ADMINISTRATION"] }, scope: "ORGANIZATION", relationship: "ORG_RESOURCE", precondition: "BRANCH_LIFECYCLE_PROTECTION", writer: "manageBranchLifecycle", auditOwner: "AuditEvent+BranchLifecycleOperation" }),
  "CP-PUBLIC-001": policy({ endpoint: "getPublicCommercialDocument", principalClasses: ["CUSTOMER_TOKEN"], capability: null, authorityContract: "PUBLIC_DOCUMENT_READ", scope: "EXACT_TOKEN_RESOURCE", relationship: "CUSTOMER_TOKEN_RESOURCE", precondition: "PURPOSE_RESOURCE_EXPIRY_REVOCATION", writer: "NONE_READ_ONLY", auditOwner: "AuditEvent", migrationCategory: "READ_ONLY_PROJECTION" }),
  "CP-AUTO-001": policy({ endpoint: "processOTEvent/processPostSaleActions", principalClasses: ["SYSTEM_AUTOMATION"], capability: null, authorityContract: "TRUSTED_AUTOMATION_ATTESTATION", scope: "EVENT_RESOURCE", relationship: "ORG_RESOURCE", precondition: "POSITIVE_RUNTIME_ATTESTATION_REQUIRED", writer: "event consumer", auditOwner: "AuditEvent" })
});
var OT_TRANSITION_POLICIES = Object.freeze({
  "EN_COLA_REVISION->ASIGNADA": { capability: { allOf: ["TECHNICAL_ASSIGNMENT"] }, relationship: "SUPERVISOR" },
  "ASIGNADA->EN_REVISION": { capability: { allOf: ["TECHNICAL_WORK"] }, relationship: "EFFECTIVE_TECHNICIAN" },
  "EN_REVISION->DIAGNOSTICADA": { capability: { allOf: ["TECHNICAL_WORK"] }, relationship: "EFFECTIVE_TECHNICIAN" },
  "DIAGNOSTICADA->COTIZADA": { capability: { allOf: ["QUOTE_OPERATIONS"] }, relationship: "BRANCH_RESOURCE" },
  "DIAGNOSTICADA->APROBADA": { capability: { allOf: ["QUOTE_OPERATIONS"] }, relationship: "BRANCH_RESOURCE", alternativePublicAuthority: "QUOTE_DECISION" },
  "COTIZADA->APROBADA": { capability: { allOf: ["QUOTE_OPERATIONS"] }, relationship: "BRANCH_RESOURCE", alternativePublicAuthority: "QUOTE_DECISION" },
  "APROBADA->EN_REPARACION": { capability: { allOf: ["TECHNICAL_WORK"] }, relationship: "EFFECTIVE_TECHNICIAN" },
  "EN_REPARACION->PRUEBAS": { capability: { allOf: ["TECHNICAL_WORK"] }, relationship: "EFFECTIVE_TECHNICIAN" },
  "PRUEBAS->FINALIZADA": { capability: { allOf: ["TECHNICAL_WORK"] }, relationship: "EFFECTIVE_TECHNICIAN" },
  "PRUEBAS->EN_REPARACION": { capability: { allOf: ["TECHNICAL_WORK"] }, relationship: "EFFECTIVE_TECHNICIAN" },
  "FINALIZADA->ENTREGADA": { capability: { allOf: ["DELIVERY_OPERATIONS"] }, relationship: "BRANCH_RESOURCE" }
});
function evaluateCapability(expression, capabilities) {
  if (!expression || expression.commandSpecific) return false;
  if (expression.allOf) return expression.allOf.every((item) => capabilities.includes(item));
  if (expression.anyOf) return expression.anyOf.some((item) => capabilities.includes(item));
  return false;
}
function validateCapabilityExpression(expression) {
  if (!expression || expression.commandSpecific) return false;
  const capabilities = [...expression.allOf || [], ...expression.anyOf || []];
  return capabilities.length > 0 && capabilities.every(isKnownCapability);
}
function evaluateCommandPolicy({
  policyId,
  authorization,
  relationship,
  authorityContract = null,
  commandCapability = null,
  commandRelationship = null,
  scopeSatisfied = true,
  preconditionSatisfied = true,
  preconditionStatus = 403,
  preconditionCode = "COMMAND_PRECONDITION_DENIED"
}) {
  const row = COMMAND_POLICIES[policyId];
  if (!row) return { ok: false, status: 403, code: "COMMAND_POLICY_UNKNOWN" };
  if (!authorization?.ok) return { ok: false, status: authorization?.status || 403, code: "AUTHORIZATION_CONTEXT_INVALID" };
  if (!row.principalClasses.includes(authorization.principalClass)) return { ok: false, status: 403, code: "PRINCIPAL_CLASS_DENIED" };
  if (scopeSatisfied !== true) return { ok: false, status: 403, code: "COMMAND_SCOPE_DENIED" };
  if (preconditionSatisfied !== true) return { ok: false, status: preconditionStatus, code: preconditionCode };
  const commandSpecific = row.capability?.commandSpecific === true;
  if (!commandSpecific && (commandCapability || commandRelationship)) {
    return { ok: false, status: 403, code: "COMMAND_POLICY_OVERRIDE_DENIED" };
  }
  if (commandSpecific && !validateCapabilityExpression(commandCapability)) {
    return { ok: false, status: 403, code: "COMMAND_CAPABILITY_UNRESOLVED" };
  }
  const requiredRelationship = commandSpecific ? commandRelationship : row.relationship;
  if (!RESOURCE_RELATIONSHIPS.includes(requiredRelationship)) {
    return { ok: false, status: 403, code: "COMMAND_RELATIONSHIP_UNRESOLVED" };
  }
  if (requiredRelationship !== relationship) return { ok: false, status: 403, code: "RESOURCE_RELATIONSHIP_DENIED" };
  if (row.authorityContract) {
    if (row.authorityContract !== authorityContract) return { ok: false, status: 403, code: "AUTHORITY_CONTRACT_DENIED" };
  } else if (!evaluateCapability(commandSpecific ? commandCapability : row.capability, authorization.capabilities || [])) {
    return { ok: false, status: 403, code: "CAPABILITY_DENIED" };
  }
  return {
    ok: true,
    policy: row,
    effectiveCapability: commandSpecific ? commandCapability : row.capability,
    effectiveRelationship: requiredRelationship
  };
}

// base44/functions/_shared/commandExecution.ts
var EVALUATED_DECISIONS = /* @__PURE__ */ new WeakSet();
function decision(value, fallbackCode) {
  if (typeof value === "boolean") return { ok: value, code: value ? "ALLOW" : fallbackCode };
  return {
    ok: value?.ok === true,
    code: typeof value?.code === "string" ? value.code.slice(0, 120) : value?.ok === true ? "ALLOW" : fallbackCode
  };
}
function seal(value, shadow) {
  const evaluated = Object.freeze({
    ...value,
    shadow: Object.freeze({ ...shadow })
  });
  EVALUATED_DECISIONS.add(evaluated);
  return evaluated;
}
function denyFrom(value, code, shadow) {
  return seal({
    ...value,
    ok: false,
    status: 503,
    code
  }, shadow);
}
async function recordShadowMismatch(base44, authorization, policyId, authoritative, compatibility, audit) {
  return appendAuditEvent(base44, {
    eventType: "AUTHORIZATION_SHADOW_MISMATCH",
    principalClass: authorization.principalClass,
    actorUserId: audit.actorUserId || null,
    actorPrimaryRole: authorization.persistedRole || authorization.role || null,
    organizationId: authorization.organizationId,
    branchId: audit.branchId || null,
    resourceType: audit.resourceType,
    resourceId: audit.resourceId,
    commandPolicyId: policyId,
    correlationId: audit.correlationId,
    auditOperationId: crypto.randomUUID(),
    operationKey: audit.operationKey || null,
    operationSemantics: { authoritative_allowed: authoritative.ok, compatibility_allowed: compatibility.ok },
    outcome: authoritative.ok ? "FAILED" : "DENIED",
    priorState: {
      compatibility_allowed: compatibility.ok,
      compatibility_code: compatibility.code
    },
    newState: {
      authoritative_allowed: authoritative.ok,
      authoritative_code: authoritative.code || "ALLOW"
    },
    metadata: {
      mode: "OBSERVE_ONLY",
      shadow_can_grant: false,
      endpoint: authoritative.policy?.endpoint || null,
      writer: authoritative.policy?.writer || null
    }
  });
}
async function evaluateCommandPolicyWithShadow({
  base44,
  policyId,
  authorization,
  relationship,
  authorityContract = null,
  commandCapability = null,
  commandRelationship = null,
  scopeSatisfied = true,
  preconditionSatisfied = true,
  preconditionStatus = 403,
  preconditionCode = "COMMAND_PRECONDITION_DENIED",
  compatibilityDecision,
  audit = null
}) {
  const authoritative = evaluateCommandPolicy({
    policyId,
    authorization,
    relationship,
    authorityContract,
    commandCapability,
    commandRelationship,
    scopeSatisfied,
    preconditionSatisfied,
    preconditionStatus,
    preconditionCode
  });
  const compatibility = decision(compatibilityDecision, "COMPATIBILITY_DENY");
  const mismatch = authoritative.ok !== compatibility.ok || !authoritative.ok && !compatibility.ok && authoritative.code !== compatibility.code;
  const shadow = {
    mode: "OBSERVE_ONLY",
    authoritativeAllowed: authoritative.ok,
    compatibilityAllowed: compatibility.ok,
    compatibilityCode: compatibility.code,
    mismatch,
    evidenceRecorded: false
  };
  if (!mismatch) return seal(authoritative, shadow);
  if (!audit || !base44 || !authorization?.organizationId) {
    return authoritative.ok ? denyFrom(authoritative, "SHADOW_AUTHORIZATION_AUDIT_CONTEXT_REQUIRED", shadow) : seal(authoritative, shadow);
  }
  try {
    await recordShadowMismatch(base44, authorization, policyId, authoritative, compatibility, audit);
    return seal(authoritative, { ...shadow, evidenceRecorded: true });
  } catch (error) {
    const auditFailure = { ...shadow, auditError: String(error?.message || error).slice(0, 160) };
    return authoritative.ok ? denyFrom(authoritative, "SHADOW_AUTHORIZATION_AUDIT_REQUIRED", auditFailure) : seal(authoritative, auditFailure);
  }
}
var SovereignCommandError = class extends Error {
  constructor(message, code, status = 403) {
    super(message);
    this.name = "SovereignCommandError";
    this.code = code;
    this.status = status;
  }
};
async function ExecuteSovereignCommand({ decision: evaluated, sovereignWriter, execute }) {
  if (!evaluated || !EVALUATED_DECISIONS.has(evaluated)) {
    throw new SovereignCommandError("La decision no proviene del evaluador canonico", "UNEVALUATED_COMMAND_DECISION");
  }
  if (!evaluated.ok) {
    throw new SovereignCommandError("El comando no esta autorizado", evaluated.code || "COMMAND_DENIED", evaluated.status || 403);
  }
  if (evaluated.policy?.writer !== sovereignWriter) {
    throw new SovereignCommandError("El writer no coincide con la politica autorizada", "SOVEREIGN_WRITER_MISMATCH");
  }
  if (typeof execute !== "function") {
    throw new SovereignCommandError("El writer soberano no es ejecutable", "SOVEREIGN_WRITER_REQUIRED", 500);
  }
  return execute();
}

// base44/functions/reassignWorkOrderTechnician/entry.ts
var AUTHORIZED_ROLES = ["ORG_ADMIN", "BRANCH_ADMIN", "SALES"];
var ASSIGNMENT_LOCK_TTL_MS = 15 * 60 * 1e3;
function errorResponse(status, code, error, extra = {}) {
  return Response.json({ error, code, ...extra }, { status });
}
function getLockQuery(ot) {
  if (!ot.lifecycle_lock_token) {
    return {
      $or: [
        { lifecycle_lock_token: { $exists: false } },
        { lifecycle_lock_token: null }
      ]
    };
  }
  const lockAt = Date.parse(ot.lifecycle_lock_at || "");
  const isStale = Number.isFinite(lockAt) && Date.now() - lockAt > ASSIGNMENT_LOCK_TTL_MS;
  if (!isStale) return null;
  return {
    lifecycle_lock_token: ot.lifecycle_lock_token,
    lifecycle_lock_at: ot.lifecycle_lock_at
  };
}
async function loadWorkOrder(base44, orgId, workOrderId) {
  const records = await base44.asServiceRole.entities.OrdenTrabajo.filter({
    id: workOrderId,
    organization_id: orgId
  }, 1);
  return records?.[0] || null;
}
async function resolveCaller(base44, user) {
  const authorization = await resolveAuthorizedContext(base44, user);
  if (!authorization.ok) return {
    error: authorization.error,
    code: authorization.error?.includes("rol") ? "ASSIGNMENT_ROLE_NOT_AUTHORIZED" : "CALLER_ACCOUNT_NOT_ACTIVE"
  };
  const branchScope = getCanonicalBranchScope(authorization);
  if (!branchScope.ok) return { error: branchScope.error, code: branchScope.code };
  return {
    orgId: authorization.organizationId,
    effectiveRole: authorization.role,
    account: authorization.account,
    branchScope,
    authorization,
    isSuperAdmin: authorization.isSuperAdmin
  };
}
async function loadDestinationTechnician(base44, orgId, technicianUserId, options = {}) {
  const accounts = await base44.asServiceRole.entities.UserAccount.filter({
    user_id: technicianUserId,
    organization_id: orgId
  }, 5);
  return (accounts || []).find((account) => {
    if (!isCanonicalActiveUserAccount(account)) return false;
    const role = normalizeTenantRole(account.role);
    if (role === "TECHNICIAN") return true;
    return options.allowAdminSelf === true && technicianUserId === options.actorUserId && ["ORG_ADMIN", "BRANCH_ADMIN"].includes(role);
  }) || null;
}
function buildRollbackUpdate(originalOT) {
  const set = {
    estado: originalOT.estado
  };
  const unset = {
    lifecycle_lock_token: "",
    lifecycle_lock_operation: "",
    lifecycle_lock_owner_user_id: "",
    lifecycle_lock_at: ""
  };
  for (const field of [
    "tecnico_asignado_id",
    "tecnico_asignado_email",
    "ultima_actividad",
    "ultima_actividad_at"
  ]) {
    if (Object.prototype.hasOwnProperty.call(originalOT, field)) {
      set[field] = originalOT[field];
    } else {
      unset[field] = "";
    }
  }
  return { $set: set, $unset: unset };
}
async function releaseAssignmentLock(base44, orgId, workOrderId, operationToken) {
  const release = () => base44.asServiceRole.entities.OrdenTrabajo.updateMany({
    id: workOrderId,
    organization_id: orgId,
    lifecycle_lock_token: operationToken
  }, {
    $unset: {
      lifecycle_lock_token: "",
      lifecycle_lock_operation: "",
      lifecycle_lock_owner_user_id: "",
      lifecycle_lock_at: ""
    }
  });
  try {
    return await release();
  } catch (firstError) {
    const reconciled = await loadWorkOrder(base44, orgId, workOrderId);
    if (reconciled?.lifecycle_lock_token !== operationToken) {
      return { updated: 1, recovered: true };
    }
    try {
      return await release();
    } catch (retryError) {
      return { updated: 0, error: retryError.message || firstError.message };
    }
  }
}
async function findAssignmentEvent(base44, orgId, workOrderId) {
  const events = await base44.asServiceRole.entities.OTEvent.filter({
    organization_id: orgId,
    orden_trabajo_id: workOrderId,
    tipo: "TRANSITION_ASIGNADA"
  }, "-created_date", 5);
  return events?.[0] || null;
}
async function findReassignmentEvent(base44, orgId, workOrderId, operationToken) {
  const events = await base44.asServiceRole.entities.OTEvent.filter({
    organization_id: orgId,
    orden_trabajo_id: workOrderId,
    tipo: "TRANSITION_REASIGNADA"
  }, "-created_date", 10);
  return (events || []).find((event) => {
    try {
      return JSON.parse(event.detalle || "{}").operation_id === operationToken;
    } catch {
      return false;
    }
  }) || null;
}
async function createRequiredAuditEvent({
  base44,
  orgId,
  ot,
  user,
  operationToken,
  operation,
  previousTechnicianId,
  destinationTechnician,
  reason
}) {
  if (operation !== "REASSIGNMENT") {
    const existing = await findAssignmentEvent(base44, orgId, ot.id);
    if (existing) return { event: existing, created: false };
  }
  const eventType = operation === "REASSIGNMENT" ? "TRANSITION_REASIGNADA" : "TRANSITION_ASIGNADA";
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const detail = JSON.stringify({
    operation_id: operationToken,
    operation,
    tecnico_anterior_id: previousTechnicianId || null,
    tecnico_nuevo_id: destinationTechnician.user_id,
    usuario_ejecutor: user.email,
    motivo: reason || null,
    timestamp: now
  });
  try {
    const event = await base44.asServiceRole.entities.OTEvent.create({
      organization_id: orgId,
      orden_trabajo_id: ot.id,
      tipo: eventType,
      detalle: detail,
      created_by_user_id: user.id,
      processed: false,
      created_at: now
    });
    await appendAuditEvent(base44, {
      eventType: operation === "REASSIGNMENT" ? "WORK_ORDER_TECHNICIAN_REASSIGNED" : "WORK_ORDER_TECHNICIAN_ASSIGNED",
      principalClass: "HUMAN_MEMBER",
      actorUserId: user.id,
      actorPrimaryRole: null,
      effectiveTechnicianUserId: destinationTechnician.user_id === user.id ? user.id : null,
      organizationId: orgId,
      branchId: ot.branch_id,
      resourceType: "OrdenTrabajo",
      resourceId: ot.id,
      commandPolicyId: operation === "REASSIGNMENT" ? "CP-ASG-002" : "CP-ASG-001",
      correlationId: operationToken,
      auditOperationId: `work-order-assignment:${event.id}`,
      operationKey: operationToken,
      operationSemantics: {
        operation,
        from_technician_id: previousTechnicianId || null,
        to_technician_id: destinationTechnician.user_id
      },
      priorState: { tecnico_asignado_id: previousTechnicianId },
      newState: { tecnico_asignado_id: destinationTechnician.user_id },
      custodySnapshot: { tecnico_anterior_id: previousTechnicianId, tecnico_nuevo_id: destinationTechnician.user_id },
      metadata: { operation, reason: reason || null, legacy_event_id: event.id }
    });
    return { event, created: true };
  } catch (error) {
    const recovered = operation === "REASSIGNMENT" ? await findReassignmentEvent(base44, orgId, ot.id, operationToken) : await findAssignmentEvent(base44, orgId, ot.id);
    if (recovered) {
      await appendAuditEvent(base44, {
        eventType: operation === "REASSIGNMENT" ? "WORK_ORDER_TECHNICIAN_REASSIGNED" : "WORK_ORDER_TECHNICIAN_ASSIGNED",
        principalClass: "HUMAN_MEMBER",
        actorUserId: user.id,
        organizationId: orgId,
        branchId: ot.branch_id,
        resourceType: "OrdenTrabajo",
        resourceId: ot.id,
        commandPolicyId: operation === "REASSIGNMENT" ? "CP-ASG-002" : "CP-ASG-001",
        correlationId: operationToken,
        auditOperationId: `work-order-assignment:${recovered.id}`,
        operationKey: operationToken,
        operationSemantics: {
          operation,
          from_technician_id: previousTechnicianId || null,
          to_technician_id: destinationTechnician.user_id
        },
        outcome: "IDEMPOTENT_REPLAY",
        priorState: { tecnico_asignado_id: previousTechnicianId },
        newState: { tecnico_asignado_id: destinationTechnician.user_id }
      });
      return { event: recovered, created: false, recovered: true };
    }
    throw error;
  }
}
async function executeAssignmentOperation({
  base44,
  user,
  orgId,
  ot,
  destinationTechnician,
  reason,
  operation
}) {
  const operationToken = crypto.randomUUID();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const previousTechnicianId = ot.tecnico_asignado_id || null;
  const lockQuery = getLockQuery(ot);
  if (!lockQuery) {
    return errorResponse(
      409,
      "ASSIGNMENT_OPERATION_IN_PROGRESS",
      "Otra operacion del lifecycle esta en progreso para esta OT",
      {
        retryable: true
      }
    );
  }
  const claimQuery = {
    id: ot.id,
    organization_id: orgId,
    estado: ot.estado,
    tecnico_asignado_id: previousTechnicianId,
    ...lockQuery
  };
  const targetState = operation === "REASSIGNMENT" ? ot.estado : "ASIGNADA";
  const updatePayload = {
    estado: targetState,
    tecnico_asignado_id: destinationTechnician.user_id,
    tecnico_asignado_email: destinationTechnician.user_email,
    ultima_actividad: operation === "REASSIGNMENT" ? `Tecnico reasignado por ${user.email}` : `Tecnico asignado por ${user.email}`,
    ultima_actividad_at: now,
    lifecycle_lock_token: operationToken,
    lifecycle_lock_operation: operation === "REASSIGNMENT" ? "technicianReassignment" : "initialTechnicianAssignment",
    lifecycle_lock_owner_user_id: user.id,
    lifecycle_lock_at: now
  };
  let claim;
  try {
    claim = await base44.asServiceRole.entities.OrdenTrabajo.updateMany(
      claimQuery,
      { $set: updatePayload }
    );
  } catch (claimError) {
    const reconciled = await loadWorkOrder(base44, orgId, ot.id);
    const thisAttemptOwnsMutation = reconciled?.lifecycle_lock_token === operationToken && reconciled?.estado === targetState && reconciled?.tecnico_asignado_id === destinationTechnician.user_id;
    if (!thisAttemptOwnsMutation) throw claimError;
    claim = { updated: 1, recovered: true };
  }
  if (claim?.updated !== 1) {
    const current = await loadWorkOrder(base44, orgId, ot.id);
    if (current?.lifecycle_lock_token && current.lifecycle_lock_token !== operationToken) {
      return errorResponse(
        409,
        "ASSIGNMENT_CONCURRENT_UPDATE",
        "Otra operacion modifico la asignacion de esta OT",
        {
          retryable: true
        }
      );
    }
    if (current?.estado === targetState && current?.tecnico_asignado_id === destinationTechnician.user_id) {
      return Response.json({
        success: true,
        idempotent: true,
        operation,
        orden_trabajo_id: ot.id,
        tecnico_asignado_id: destinationTechnician.user_id,
        estado_anterior: ot.estado,
        estado_actual: current.estado,
        updated_ot: projectWorkOrderMutationResult(current)
      });
    }
    return errorResponse(
      409,
      "ASSIGNMENT_CONCURRENT_UPDATE",
      "La Orden de Trabajo cambio concurrentemente",
      {
        retryable: true
      }
    );
  }
  try {
    await createRequiredAuditEvent({
      base44,
      orgId,
      ot,
      user,
      operationToken,
      operation,
      previousTechnicianId,
      destinationTechnician,
      reason
    });
  } catch (auditError) {
    const rollback = await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
      id: ot.id,
      organization_id: orgId,
      estado: targetState,
      tecnico_asignado_id: destinationTechnician.user_id,
      lifecycle_lock_token: operationToken
    }, buildRollbackUpdate(ot));
    if (rollback?.updated !== 1) {
      return errorResponse(
        500,
        "ASSIGNMENT_ROLLBACK_FAILED",
        "Fallo el evento de auditoria y no fue posible revertir la asignacion"
      );
    }
    return errorResponse(
      500,
      "ASSIGNMENT_AUDIT_FAILED_ROLLED_BACK",
      "No se pudo registrar la auditoria. La asignacion fue revertida sin cambios"
    );
  }
  const release = await releaseAssignmentLock(base44, orgId, ot.id, operationToken);
  const lockCleanupPending = release?.updated !== 1;
  if (lockCleanupPending) {
    console.error(`[reassignWorkOrderTechnician] Lock pendiente de limpieza para OT ${ot.id}: ${release?.error || "resultado ambiguo"}`);
  }
  const updatedOT = {
    ...ot,
    ...updatePayload,
    estado: targetState
  };
  delete updatedOT.lifecycle_lock_token;
  delete updatedOT.lifecycle_lock_operation;
  delete updatedOT.lifecycle_lock_owner_user_id;
  delete updatedOT.lifecycle_lock_at;
  return Response.json({
    success: true,
    idempotent: false,
    recovered_ambiguous_write: claim.recovered === true,
    lock_cleanup_pending: lockCleanupPending,
    operation,
    orden_trabajo_id: ot.id,
    tecnico_asignado_id: destinationTechnician.user_id,
    estado_anterior: ot.estado,
    estado_actual: targetState,
    updated_ot: projectWorkOrderMutationResult(updatedOT)
  });
}
Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return errorResponse(405, "METHOD_NOT_ALLOWED", "Metodo no permitido");
    }
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return errorResponse(401, "AUTHENTICATION_REQUIRED", "No autenticado");
    }
    const caller = await resolveCaller(base44, user);
    if (caller.error) {
      return errorResponse(403, caller.code, caller.error);
    }
    const body = await req.json().catch(() => null);
    if (!body) {
      return errorResponse(400, "INVALID_JSON_BODY", "Body invalido");
    }
    const {
      orden_trabajo_id,
      tecnico_asignado_id,
      motivo,
      action
    } = body;
    const assumeSelf = action === "ASSUME_TECHNICAL_CUSTODY";
    if (assumeSelf && (!["ORG_ADMIN", "BRANCH_ADMIN"].includes(caller.effectiveRole) || tecnico_asignado_id !== user.id)) {
      return errorResponse(
        403,
        "TECHNICAL_CUSTODY_ASSUME_DENIED",
        "Solo un administrador puede asumir personalmente la custodia tecnica"
      );
    }
    const hasValidIds = typeof orden_trabajo_id === "string" && orden_trabajo_id.trim().length > 0 && typeof tecnico_asignado_id === "string" && tecnico_asignado_id.trim().length > 0;
    if (!hasValidIds) {
      return errorResponse(
        400,
        "ASSIGNMENT_PAYLOAD_INVALID",
        "orden_trabajo_id y tecnico_asignado_id son obligatorios"
      );
    }
    if (motivo != null && typeof motivo !== "string") {
      return errorResponse(
        400,
        "ASSIGNMENT_REASON_INVALID",
        "motivo debe ser texto"
      );
    }
    const reason = motivo?.trim() || null;
    const [ot, destinationTechnician] = await Promise.all([
      loadWorkOrder(base44, caller.orgId, orden_trabajo_id),
      loadDestinationTechnician(base44, caller.orgId, tecnico_asignado_id, {
        allowAdminSelf: assumeSelf,
        actorUserId: user.id
      })
    ]);
    if (!ot) {
      return errorResponse(
        404,
        "WORK_ORDER_NOT_FOUND",
        "OrdenTrabajo no encontrada en esta organizacion"
      );
    }
    if (!destinationTechnician) {
      return errorResponse(
        422,
        "DESTINATION_TECHNICIAN_INVALID",
        "El tecnico destino no existe, no esta activo o pertenece a otra organizacion"
      );
    }
    if (!caller.branchScope.organizationWide && ot.branch_id !== caller.branchScope.branchId) {
      return errorResponse(
        403,
        "ASSIGNMENT_CROSS_BRANCH_DENIED",
        "La orden no pertenece a la sucursal autorizada"
      );
    }
    if (!caller.branchScope.organizationWide && destinationTechnician.branch_id !== caller.branchScope.branchId) {
      return errorResponse(
        403,
        "ASSIGNMENT_DESTINATION_CROSS_BRANCH_DENIED",
        "El tecnico destino no pertenece a la sucursal autorizada"
      );
    }
    if (["ENTREGADA", "CANCELADA"].includes(ot.estado)) {
      return errorResponse(
        409,
        "WORK_ORDER_ASSIGNMENT_FORBIDDEN_STATE",
        `No se puede asignar un tecnico a una OT en estado ${ot.estado}`
      );
    }
    const previousTechnicianId = ot.tecnico_asignado_id || null;
    const isInitialAssignment = ot.estado === "EN_COLA_REVISION" && !previousTechnicianId;
    const isInitialAssignmentRecovery = ot.estado === "EN_COLA_REVISION" && !!previousTechnicianId;
    const initialPath = isInitialAssignment || isInitialAssignmentRecovery;
    const policyId = initialPath ? "CP-ASG-001" : "CP-ASG-002";
    const compatibilityAllowed = AUTHORIZED_ROLES.includes(caller.effectiveRole) && (initialPath || caller.effectiveRole !== "SALES");
    const policyDecision = await evaluateCommandPolicyWithShadow({
      base44,
      policyId,
      authorization: caller.authorization,
      relationship: "SUPERVISOR",
      preconditionSatisfied: initialPath || ["ORG_ADMIN", "BRANCH_ADMIN"].includes(caller.effectiveRole),
      compatibilityDecision: {
        ok: compatibilityAllowed,
        code: compatibilityAllowed ? "ALLOW" : "LEGACY_ASSIGNMENT_DENY"
      },
      audit: {
        actorUserId: user.id,
        branchId: ot.branch_id,
        resourceType: "OrdenTrabajo",
        resourceId: ot.id,
        correlationId: `assignment-shadow:${ot.id}:${tecnico_asignado_id}:${policyId}`
      }
    });
    if (isInitialAssignmentRecovery && previousTechnicianId !== destinationTechnician.user_id) {
      return errorResponse(
        409,
        "INITIAL_ASSIGNMENT_RECOVERY_TECHNICIAN_MISMATCH",
        "La OT contiene una asignacion inicial parcial a otro tecnico. Recargue y recupere esa asignacion antes de cambiarla",
        {
          tecnico_asignado_id: previousTechnicianId
        }
      );
    }
    if (isInitialAssignment || isInitialAssignmentRecovery) {
      return await ExecuteSovereignCommand({
        decision: policyDecision,
        sovereignWriter: "reassignWorkOrderTechnician",
        execute: () => executeAssignmentOperation({
          base44,
          user,
          orgId: caller.orgId,
          ot,
          destinationTechnician,
          reason,
          operation: isInitialAssignmentRecovery ? "INITIAL_ASSIGNMENT_RECOVERY" : "INITIAL_ASSIGNMENT"
        })
      });
    }
    if (!previousTechnicianId) {
      return errorResponse(
        409,
        "WORK_ORDER_ASSIGNMENT_INCONSISTENT",
        "La OT no tiene tecnico y no esta en EN_COLA_REVISION"
      );
    }
    if (previousTechnicianId === destinationTechnician.user_id) {
      if (ot.lifecycle_lock_token && !getLockQuery(ot)) {
        return errorResponse(
          409,
          "ASSIGNMENT_OPERATION_IN_PROGRESS",
          "Otra operacion del lifecycle esta en progreso para esta OT",
          {
            retryable: true
          }
        );
      }
      return await ExecuteSovereignCommand({
        decision: policyDecision,
        sovereignWriter: "reassignWorkOrderTechnician",
        execute: () => Response.json({
          success: true,
          idempotent: true,
          operation: "REASSIGNMENT",
          orden_trabajo_id,
          tecnico_asignado_id: previousTechnicianId,
          estado_anterior: ot.estado,
          estado_actual: ot.estado,
          updated_ot: projectWorkOrderMutationResult(ot)
        })
      });
    }
    return await ExecuteSovereignCommand({
      decision: policyDecision,
      sovereignWriter: "reassignWorkOrderTechnician",
      execute: () => executeAssignmentOperation({
        base44,
        user,
        orgId: caller.orgId,
        ot,
        destinationTechnician,
        reason,
        operation: "REASSIGNMENT"
      })
    });
  } catch (error) {
    if (error instanceof SovereignCommandError) {
      const code = error.code === "CAPABILITY_DENIED" ? "ASSIGNMENT_ROLE_NOT_AUTHORIZED" : error.code === "COMMAND_PRECONDITION_DENIED" ? "REASSIGNMENT_ROLE_NOT_AUTHORIZED" : error.code;
      return errorResponse(error.status, code, error.message);
    }
    console.error("[reassignWorkOrderTechnician] Error:", error.message);
    return errorResponse(
      500,
      "ASSIGNMENT_INTERNAL_ERROR",
      "No fue posible completar la asignacion del tecnico"
    );
  }
});
