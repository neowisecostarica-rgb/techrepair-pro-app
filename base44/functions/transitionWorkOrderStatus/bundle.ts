// base44/functions/transitionWorkOrderStatus/entry.ts
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
function authorizeRecordBranch(authorization, recordBranchId) {
  const branchScope = getCanonicalBranchScope(authorization);
  if (!branchScope.ok) return branchScope;
  if (branchScope.organizationWide) return { ok: true, branchScope };
  if (!recordBranchId || recordBranchId !== branchScope.branchId) {
    return {
      ok: false,
      status: 403,
      code: "OPERATIONAL_CROSS_BRANCH_DENIED",
      error: "El recurso no pertenece a la sucursal autorizada"
    };
  }
  return { ok: true, branchScope };
}
var WORK_ORDER_EDITABLE_FIELDS = Object.freeze([
  "motivo_ingreso",
  "observaciones_ingreso",
  "tipo_ingreso",
  "prioridad"
]);

// base44/functions/_shared/qaEvidence.ts
function timestampOf(record) {
  return Date.parse(record?.recorded_at || record?.created_date || record?.created_at || "");
}
function evaluateCurrentQaEvidence(records, context) {
  const cycleStartedAt = Date.parse(context.cycleStartedAt || "");
  const now = Number.isFinite(context.now) ? context.now : Date.now();
  const currentCycle = (records || []).filter(
    (record) => record?.organization_id === context.organizationId && record?.orden_trabajo_id === context.workOrderId && record?.qa_cycle_id === context.cycleId && record?.qa_cycle_started_at === context.cycleStartedAt && record?.tecnico_id === context.assignedTechnicianId && record?.author_user_id === context.assignedTechnicianId && typeof record?.author_role === "string" && record?.effective_technician_user_id === context.assignedTechnicianId && record?.recorded_via_backend === true && Number.isFinite(timestampOf(record)) && Number.isFinite(cycleStartedAt) && timestampOf(record) >= cycleStartedAt && timestampOf(record) <= now
  ).sort((left, right) => timestampOf(left) - timestampOf(right));
  const lastSuccessIndex = currentCycle.map((record) => record.resultado).lastIndexOf("exitoso");
  if (lastSuccessIndex < 0) {
    return { valid: false, code: "QA_SUCCESS_NOT_FOUND", evidence: currentCycle };
  }
  const incompatibleAfterSuccess = currentCycle.slice(lastSuccessIndex + 1).some((record) => record.resultado !== "exitoso");
  if (incompatibleAfterSuccess) {
    return { valid: false, code: "QA_LATER_INCOMPATIBLE_RESULT", evidence: currentCycle };
  }
  return { valid: true, code: "QA_EVIDENCE_VALID", evidence: currentCycle };
}

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
var AUDIT_LEASE_MS = 6e4;
var AUDIT_WAIT_MS = 8e3;
var AUDIT_RETRY_MS = 55;
var auditWait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function auditLockError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
async function lockAuditOrganization(base44, organizationId) {
  const orgs = base44.asServiceRole.entities.Organization;
  if (!orgs?.filter || !orgs?.updateMany) throw auditLockError("AUDIT_LOCK_UNAVAILABLE");
  const token = crypto.randomUUID();
  const until = Date.now() + AUDIT_WAIT_MS;
  while (Date.now() <= until) {
    const now = Date.now();
    const lockData = { audit_lock_token: token, audit_lock_at: new Date(now).toISOString() };
    let claim;
    try {
      claim = await orgs.updateMany({
        id: organizationId,
        $or: [
          { audit_lock_token: { $exists: false } },
          { audit_lock_token: null },
          { audit_lock_token: "" }
        ]
      }, { $set: lockData });
    } catch (error) {
      const org2 = (await orgs.filter({ id: organizationId }, "-created_date", 1))?.[0];
      if (org2?.audit_lock_token === token) return { token, orgs };
      throw auditLockError("AUDIT_LOCK_WRITE_UNCERTAIN");
    }
    if (claim?.updated === 1) return { token, orgs };
    const org = (await orgs.filter({ id: organizationId }, "-created_date", 1))?.[0];
    if (!org) throw auditLockError("AUDIT_ORGANIZATION_NOT_FOUND");
    if (org.audit_lock_token === token) return { token, orgs };
    const lockedAt = Date.parse(org.audit_lock_at || "");
    if (org.audit_lock_token && Number.isFinite(lockedAt) && now - lockedAt > AUDIT_LEASE_MS) {
      const recovered = await orgs.updateMany({
        id: organizationId,
        audit_lock_token: org.audit_lock_token,
        audit_lock_at: org.audit_lock_at
      }, { $set: lockData });
      if (recovered?.updated === 1) return { token, orgs };
    }
    if (Date.now() >= until) break;
    await auditWait(Math.min(AUDIT_RETRY_MS, until - Date.now()));
  }
  throw auditLockError("AUDIT_LOCK_TIMEOUT");
}
async function appendAuditEvent(base44, input) {
  const event = buildAuditEvent(input);
  const lock = await lockAuditOrganization(base44, event.organization_id);
  try {
    const existing = await findExisting(base44, event);
    if (existing) return { event: existing, duplicate: true };
    try {
      const created = await base44.asServiceRole.entities.AuditEvent.create(event);
      return { event: created, duplicate: false };
    } catch (error) {
      const reconciled = await findExisting(base44, event);
      if (reconciled) return { event: reconciled, duplicate: true, reconciled: true };
      throw error;
    }
  } finally {
    try {
      const released = await lock.orgs.updateMany({
        id: event.organization_id,
        audit_lock_token: lock.token
      }, { $unset: { audit_lock_token: "", audit_lock_at: "" } });
      if (released?.updated !== 1) {
        console.warn("[auditEvent] Audit lock owner changed during operation");
      }
    } catch (error) {
      console.error("[auditEvent] Audit lock release uncertain", error?.message);
    }
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

// base44/functions/_shared/lifecycleAuthority.ts
var AUTHORIZED_ROLES_FOR_TARGET = Object.freeze({
  ASIGNADA: ["ORG_ADMIN", "BRANCH_ADMIN"],
  EN_REVISION: ["ORG_ADMIN", "BRANCH_ADMIN", "TECHNICIAN"],
  DIAGNOSTICADA: ["ORG_ADMIN", "BRANCH_ADMIN", "TECHNICIAN"],
  COTIZADA: ["ORG_ADMIN", "BRANCH_ADMIN", "SALES"],
  APROBADA: ["ORG_ADMIN", "BRANCH_ADMIN", "SALES"],
  EN_REPARACION: ["ORG_ADMIN", "BRANCH_ADMIN", "TECHNICIAN"],
  PRUEBAS: ["ORG_ADMIN", "BRANCH_ADMIN", "TECHNICIAN"],
  FINALIZADA: ["ORG_ADMIN", "BRANCH_ADMIN", "TECHNICIAN"],
  ENTREGADA: ["ORG_ADMIN", "BRANCH_ADMIN", "SALES"],
  CANCELADA: ["ORG_ADMIN", "BRANCH_ADMIN"]
});
function hasWorkOrderTargetAuthority({ targetStatus, role, isSuperAdmin = false }) {
  if (isSuperAdmin) return true;
  const allowed = AUTHORIZED_ROLES_FOR_TARGET[targetStatus];
  return !allowed || allowed.includes(role);
}
function workOrderTargetRoles(targetStatus) {
  return [...AUTHORIZED_ROLES_FOR_TARGET[targetStatus] || []];
}

// base44/functions/_shared/lifecycleAuditRecovery.ts
function lifecycleAuditPendingMarker(input) {
  const facts = typeof input === "string" ? { operationId: input } : input;
  return {
    lifecycle_audit_pending: true,
    lifecycle_audit_correlation_id: facts.operationId,
    lifecycle_audit_external_correlation_id: facts.externalCorrelationId || null,
    lifecycle_audit_previous_status: facts.previousStatus || null,
    lifecycle_audit_new_status: facts.newStatus || null,
    lifecycle_audit_command: facts.command || "transitionWorkOrderStatus",
    lifecycle_audit_actor_user_id: facts.actorUserId || null,
    lifecycle_audit_actor_role: facts.actorRole || null,
    lifecycle_audit_committed_at: facts.committedAt || null,
    lifecycle_audit_error: null
  };
}
async function clearLifecycleAuditPending(base44, { organizationId, workOrderId, status, operationId, correlationId }) {
  return base44.asServiceRole.entities.OrdenTrabajo.updateMany({
    id: workOrderId,
    organization_id: organizationId,
    estado: status,
    lifecycle_audit_correlation_id: operationId || correlationId
  }, { $set: {
    lifecycle_audit_pending: false,
    lifecycle_audit_error: null
  } });
}
async function recordLifecycleAuditFailure(base44, { organizationId, workOrderId, status, operationId, correlationId, error }) {
  try {
    return await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
      id: workOrderId,
      organization_id: organizationId,
      estado: status,
      lifecycle_audit_correlation_id: operationId || correlationId
    }, { $set: {
      lifecycle_audit_pending: true,
      lifecycle_audit_error: String(error?.message || error || "UNKNOWN_AUDIT_ERROR").slice(0, 500)
    } });
  } catch (markerError) {
    console.error("[transitionWorkOrderStatus] no se pudo actualizar el marcador durable de auditoria:", markerError.message);
    return null;
  }
}
function lifecycleAuditRecoveryFacts(workOrder, fallback = {}) {
  return {
    operationId: workOrder?.lifecycle_audit_correlation_id || fallback.operationId || null,
    externalCorrelationId: workOrder?.lifecycle_audit_external_correlation_id || fallback.externalCorrelationId || null,
    previousStatus: workOrder?.lifecycle_audit_previous_status || fallback.previousStatus || null,
    newStatus: workOrder?.lifecycle_audit_new_status || fallback.newStatus || null,
    command: workOrder?.lifecycle_audit_command || fallback.command || "transitionWorkOrderStatus",
    actorUserId: workOrder?.lifecycle_audit_actor_user_id || fallback.actorUserId || null,
    actorRole: workOrder?.lifecycle_audit_actor_role || fallback.actorRole || null,
    committedAt: workOrder?.lifecycle_audit_committed_at || fallback.committedAt || null
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

// base44/functions/_shared/publicTokenContract.ts
var PUBLIC_TOKEN_MAX_TTL_DAYS = Object.freeze({
  WORK_ORDER_STATUS_READ: 30,
  QUOTE_DECISION: 7,
  WARRANTY_READ: 365,
  RECEIPT_READ: 365
});
function validatePublicTokenRecord(record, { token, purpose, resourceId, version, now = Date.now(), allowConsumed = false }) {
  const deny = (code) => ({ ok: false, code });
  if (!record || typeof token !== "string" || record.public_access_token !== token) return deny("PUBLIC_TOKEN_INVALID");
  if (record.public_access_purpose !== purpose) return deny("PUBLIC_TOKEN_WRONG_PURPOSE");
  if (record.public_access_resource_id !== resourceId) return deny("PUBLIC_TOKEN_WRONG_RESOURCE");
  if (String(record.public_access_version) !== String(version)) return deny("PUBLIC_TOKEN_STALE_VERSION");
  if (record.public_access_revoked_at) return deny("PUBLIC_TOKEN_REVOKED");
  if (record.public_access_consumed_at && !allowConsumed) return deny("PUBLIC_TOKEN_CONSUMED");
  const issuedAt = Date.parse(record.public_access_issued_at || "");
  const expiresAt = Date.parse(record.public_access_expires_at || "");
  const maxDays = PUBLIC_TOKEN_MAX_TTL_DAYS[purpose];
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= now) return deny("PUBLIC_TOKEN_EXPIRED");
  if (expiresAt - issuedAt > maxDays * 24 * 60 * 60 * 1e3) return deny("PUBLIC_TOKEN_TTL_EXCEEDED");
  return { ok: true };
}
async function publicTokenReference(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

// base44/functions/_shared/commercialIntegrity.ts
var COMMERCIAL_TAX_RATE = 0.13;
var MONEY_TOLERANCE = 0.01;
function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
function finiteNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} no es numerico`);
  return parsed;
}
function calculateCommercialTotals(items, taxRate = COMMERCIAL_TAX_RATE) {
  if (!Array.isArray(items) || items.length === 0) throw new Error("Se requiere al menos una linea comercial");
  let subtotal = 0;
  let discount = 0;
  const canonicalItems = items.map((item, index) => {
    const quantity = finiteNumber(item.cantidad, `Item ${index + 1}: cantidad`);
    const unitPrice = finiteNumber(item.precio_unitario, `Item ${index + 1}: precio_unitario`);
    const discountPercent = finiteNumber(item.descuento_porcentaje || 0, `Item ${index + 1}: descuento`);
    if (quantity <= 0) throw new Error(`Item ${index + 1}: cantidad debe ser mayor a cero`);
    if (unitPrice < 0) throw new Error(`Item ${index + 1}: precio no puede ser negativo`);
    if (discountPercent < 0 || discountPercent > 100) throw new Error(`Item ${index + 1}: descuento fuera de rango`);
    const gross = roundMoney(quantity * unitPrice);
    const lineDiscount = roundMoney(gross * discountPercent / 100);
    const lineSubtotal = roundMoney(gross - lineDiscount);
    subtotal = roundMoney(subtotal + lineSubtotal);
    discount = roundMoney(discount + lineDiscount);
    return {
      ...item,
      cantidad: quantity,
      precio_unitario: roundMoney(unitPrice),
      descuento_porcentaje: roundMoney(discountPercent),
      subtotal: lineSubtotal
    };
  });
  const impuesto = roundMoney(subtotal * taxRate);
  return {
    items: canonicalItems,
    subtotal,
    descuento_total: discount,
    impuesto,
    total: roundMoney(subtotal + impuesto)
  };
}
function moneyMatches(left, right) {
  return Number.isFinite(Number(left)) && Math.abs(roundMoney(left) - roundMoney(right)) <= MONEY_TOLERANCE;
}
function assertPersistedTotalsMatch(source, calculated, label = "documento comercial") {
  for (const field of ["subtotal", "descuento_total", "impuesto", "total"]) {
    if (!moneyMatches(source?.[field] || 0, calculated[field])) {
      const error = new Error(`${label}: ${field} no coincide con sus lineas persistidas`);
      error.code = "COMMERCIAL_PERSISTED_TOTAL_MISMATCH";
      throw error;
    }
  }
}
function quoteDecisionOperationKey(quoteId, targetStatus) {
  return `quote-decision:${quoteId}:${targetStatus}`;
}
function quoteDecisionIsCommitted(quote, targetStatus) {
  const quoteStatus = targetStatus === "APROBADA" ? "aprobada" : "rechazada";
  return quote?.estado === quoteStatus && quote?.decision_status === "COMMITTED" && quote?.decision_target_status === targetStatus;
}

// base44/functions/_shared/inventoryStockCas.ts
async function applyInventoryProjectionCas(entity, input) {
  const query = {
    id: input.inventoryId,
    organization_id: input.organizationId,
    cantidad_disponible: input.expectedAvailable
  };
  if (Number(input.expectedReserved) === 0) {
    query.$or = [
      { cantidad_reservada: 0 },
      { cantidad_reservada: null },
      { cantidad_reservada: { $exists: false } }
    ];
  } else query.cantidad_reservada = input.expectedReserved;
  if (input.branchId) query.branch_id = input.branchId;
  const set = {
    cantidad_disponible: input.newAvailable,
    cantidad_reservada: input.newReserved,
    fecha_ultimo_movimiento: input.movementDate,
    last_inventory_operation_key: input.operationKey,
    last_inventory_movement_key: input.movementKey
  };
  if (input.legacySaleId) set.last_sale_id = input.legacySaleId;
  if (input.legacySaleOperationKey) set.last_sale_operation_key = input.legacySaleOperationKey;
  return entity.updateMany(query, { $set: set });
}
async function rollbackInventoryProjectionCas(entity, input) {
  const query = {
    id: input.inventoryId,
    organization_id: input.organizationId,
    cantidad_disponible: input.expectedAvailable,
    last_inventory_operation_key: input.operationKey,
    last_inventory_movement_key: input.movementKey
  };
  if (Number(input.expectedReserved) === 0) {
    query.$or = [
      { cantidad_reservada: 0 },
      { cantidad_reservada: null },
      { cantidad_reservada: { $exists: false } }
    ];
  } else query.cantidad_reservada = input.expectedReserved;
  if (input.branchId) query.branch_id = input.branchId;
  const unset = {
    last_inventory_operation_key: "",
    last_inventory_movement_key: ""
  };
  if (input.legacySaleId) unset.last_sale_id = "";
  if (input.legacySaleOperationKey) unset.last_sale_operation_key = "";
  return entity.updateMany(query, {
    $set: {
      cantidad_disponible: input.previousAvailable,
      cantidad_reservada: input.previousReserved,
      fecha_ultimo_movimiento: input.previousMovementDate ?? null
    },
    $unset: unset
  });
}

// base44/functions/_shared/branchProtection.ts
var BranchProtectionError = class extends Error {
  code;
  status;
  details;
  constructor(message, code = "BRANCH_PROTECTION_FAILED", status = 409, details = {}) {
    super(message);
    this.name = "BranchProtectionError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
};
async function assertActiveBranch(base44, organizationId, branchId, options = {}) {
  if (!organizationId || !branchId) {
    throw new BranchProtectionError(
      options.message || "La operacion requiere una sucursal activa.",
      options.code || "ACTIVE_BRANCH_REQUIRED",
      options.status || 409
    );
  }
  const branches = await base44.asServiceRole.entities.Branch.filter({
    id: branchId,
    organization_id: organizationId,
    active: true
  }, "-created_date", 1);
  const branch = branches?.[0] || null;
  if (!branch) {
    throw new BranchProtectionError(
      options.message || "La sucursal no existe, no pertenece a la organizacion o esta inactiva.",
      options.code || "BRANCH_INACTIVE",
      options.status || 409,
      { branch_id: branchId }
    );
  }
  return branch;
}

// base44/functions/_shared/inventoryMutationService.ts
var INVENTORY_MOVEMENT_TYPES = Object.freeze([
  "INITIAL_BALANCE",
  "RESERVE",
  "RELEASE",
  "CONSUME",
  "RETURN",
  "SALE",
  "ADJUST_IN",
  "ADJUST_OUT",
  "REVERSAL"
]);
var RESERVATION_TRANSITIONS = Object.freeze({
  RELEASE: { from: "RESERVED", to: "RELEASED", timestamp: "released_at", key: "release_operation_key" },
  CONSUME: { from: "RESERVED", to: "CONSUMED", timestamp: "consumed_at", key: "consume_operation_key" },
  RETURN: { from: "CONSUMED", to: "RETURNED", timestamp: "returned_at", key: "return_operation_key" }
});
var InventoryCommandError = class extends Error {
  constructor(message, code = "INVENTORY_COMMAND_FAILED", status = 409, details = {}) {
    super(message);
    this.name = "InventoryCommandError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
};
function finitePositive(value, label = "quantity") {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InventoryCommandError(`${label} debe ser mayor a cero`, "INVENTORY_QUANTITY_INVALID", 422);
  }
  return parsed;
}
function finiteNonNegative(value, label) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new InventoryCommandError(`${label} no es valido`, "INVENTORY_PROJECTION_INVALID", 409);
  }
  return parsed;
}
function stable2(value) {
  if (Array.isArray(value)) return value.map(stable2);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable2(value[key])]));
}
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function commandFingerprint(input, movements) {
  return sha256(JSON.stringify(stable2({
    organization_id: input.organizationId,
    branch_id: input.branchId,
    operation_key: input.operationKey,
    reference_type: input.referenceType || null,
    reference_id: input.referenceId || null,
    reason: input.reason || null,
    movements: movements.map((item) => ({
      inventory_id: item.inventoryId,
      movement_type: item.movementType,
      quantity: item.quantity,
      reservation_id: item.reservationId || null,
      work_order_id: item.workOrderId || null,
      quote_id: item.quoteId || null,
      available_delta: item.availableDelta ?? null,
      reserved_delta: item.reservedDelta ?? null,
      reversal_of: item.reversalOf || null
    }))
  })));
}
function normalizeMovements(rawMovements) {
  if (!Array.isArray(rawMovements) || rawMovements.length === 0) {
    throw new InventoryCommandError("Se requiere al menos un movimiento", "INVENTORY_MOVEMENTS_REQUIRED", 400);
  }
  const normalized = rawMovements.map((raw) => {
    const movementType = String(raw.movementType || "").trim().toUpperCase();
    if (!INVENTORY_MOVEMENT_TYPES.includes(movementType)) {
      throw new InventoryCommandError(`Movimiento no soportado: ${movementType}`, "INVENTORY_MOVEMENT_INVALID", 422);
    }
    const inventoryId = String(raw.inventoryId || "").trim();
    if (!inventoryId) throw new InventoryCommandError("inventoryId es requerido", "INVENTORY_ID_REQUIRED", 400);
    return {
      inventoryId,
      movementType,
      quantity: finitePositive(raw.quantity),
      reservationId: raw.reservationId || null,
      workOrderId: raw.workOrderId || null,
      quoteId: raw.quoteId || null,
      availableDelta: raw.availableDelta == null ? null : Number(raw.availableDelta),
      reservedDelta: raw.reservedDelta == null ? null : Number(raw.reservedDelta),
      reversalOf: raw.reversalOf || null
    };
  }).sort((left, right) => {
    const inventoryOrder = left.inventoryId.localeCompare(right.inventoryId);
    return inventoryOrder || left.movementType.localeCompare(right.movementType) || String(left.reservationId || "").localeCompare(String(right.reservationId || ""));
  });
  const duplicateInventory = normalized.find((item, index) => index > 0 && normalized[index - 1].inventoryId === item.inventoryId);
  if (duplicateInventory) {
    throw new InventoryCommandError(
      `Una operacion multi-item solo puede mutar una vez el inventario ${duplicateInventory.inventoryId}`,
      "INVENTORY_DUPLICATE_RESOURCE",
      422
    );
  }
  return normalized.map((item, index) => ({ ...item, index }));
}
function unwrap(result) {
  return result?.data ?? result;
}
async function correlationUuid(operationKey) {
  const hex = await sha256(String(operationKey));
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function createBase44InventoryLockAdapter(base44) {
  const invoke = async (payload) => {
    const result = unwrap(await base44.functions.invoke("resourceLockLite", payload));
    if (result?.success === true) return result;
    const code = result?.code === "LOCK_FINGERPRINT_CONFLICT" ? "INVENTORY_IDEMPOTENCY_CONFLICT" : result?.code || "INVENTORY_LOCK_FAILED";
    throw new InventoryCommandError(result?.message || "No fue posible adquirir el lock de inventario", code, code === "LOCK_ACQUIRE_TIMEOUT" ? 423 : 409, {
      retryable: result?.retryable ?? true
    });
  };
  return {
    async acquire({ organizationId, operationKey, fingerprint, resources }) {
      const result = await invoke({
        action: "acquireMany",
        operation: "inventory-command",
        correlation_id: await correlationUuid(operationKey),
        request_fingerprint: fingerprint,
        resources: resources.map((id) => `inventory:${id}`).sort(),
        timeout_ms: 1e4
      });
      return result.lease;
    },
    async assertOwned({ operationKey, lease }) {
      await invoke({
        action: "assertOwned",
        operation: "inventory-command",
        correlation_id: await correlationUuid(operationKey),
        lease
      });
      return true;
    },
    async release({ operationKey, lease }) {
      await invoke({
        action: "releaseMany",
        operation: "inventory-command",
        correlation_id: await correlationUuid(operationKey),
        lease
      });
      return true;
    }
  };
}
async function findOne(entity, query) {
  const records = await entity.filter(query, "-created_date", 2);
  if ((records || []).length > 1) {
    throw new InventoryCommandError("Se encontraron registros duplicados", "INVENTORY_DUPLICATE_STATE", 409, { query });
  }
  return records?.[0] || null;
}
function calculateProjection(inventory, movement) {
  const availableBefore = finiteNonNegative(inventory.cantidad_disponible, "AVAILABLE");
  const reservedBefore = finiteNonNegative(inventory.cantidad_reservada, "RESERVED");
  const quantity = movement.quantity;
  let availableDelta = 0;
  let reservedDelta = 0;
  switch (movement.movementType) {
    case "INITIAL_BALANCE":
      if (availableBefore !== 0 || reservedBefore !== 0) {
        throw new InventoryCommandError("INITIAL_BALANCE solo se permite sobre inventario en cero", "INVENTORY_INITIAL_BALANCE_CONFLICT", 409);
      }
      availableDelta = quantity;
      break;
    case "ADJUST_IN":
    case "RETURN":
      availableDelta = quantity;
      break;
    case "ADJUST_OUT":
    case "SALE":
      availableDelta = -quantity;
      break;
    case "RESERVE":
      availableDelta = -quantity;
      reservedDelta = quantity;
      break;
    case "RELEASE":
      availableDelta = quantity;
      reservedDelta = -quantity;
      break;
    case "CONSUME":
      reservedDelta = -quantity;
      break;
    case "REVERSAL":
      if (!Number.isFinite(movement.availableDelta) || !Number.isFinite(movement.reservedDelta)) {
        throw new InventoryCommandError("La reversion requiere deltas explicitos", "INVENTORY_REVERSAL_INVALID", 422);
      }
      availableDelta = movement.availableDelta;
      reservedDelta = movement.reservedDelta;
      break;
    default:
      throw new InventoryCommandError("Movimiento no soportado", "INVENTORY_MOVEMENT_INVALID", 422);
  }
  const availableAfter = availableBefore + availableDelta;
  const reservedAfter = reservedBefore + reservedDelta;
  if (availableAfter < 0) {
    throw new InventoryCommandError(
      `Stock disponible insuficiente. Disponible: ${availableBefore}, solicitado: ${quantity}`,
      "INVENTORY_INSUFFICIENT_AVAILABLE",
      409,
      { available: availableBefore, requested: quantity }
    );
  }
  if (reservedAfter < 0) {
    throw new InventoryCommandError(
      `Reserva insuficiente. Reservado: ${reservedBefore}, solicitado: ${quantity}`,
      "INVENTORY_INSUFFICIENT_RESERVED",
      409,
      { reserved: reservedBefore, requested: quantity }
    );
  }
  return {
    availableBefore,
    reservedBefore,
    availableAfter,
    reservedAfter,
    availableDelta,
    reservedDelta,
    onHandDelta: availableDelta + reservedDelta
  };
}
async function loadReservation(entities, input, movement) {
  if (movement.movementType === "RESERVE") {
    if (!movement.workOrderId) {
      throw new InventoryCommandError("RESERVE requiere workOrderId", "INVENTORY_WORK_ORDER_REQUIRED", 422);
    }
    let reservation2 = await findOne(entities.InventarioReserva, {
      organization_id: input.organizationId,
      reserve_operation_key: input.operationKey,
      inventario_id: movement.inventoryId
    });
    if (reservation2?.state === "RELEASED" && reservation2.failure_compensated === true) {
      const reopened = await entities.InventarioReserva.updateMany({
        id: reservation2.id,
        organization_id: input.organizationId,
        state: "RELEASED",
        reserve_operation_key: input.operationKey,
        failure_compensated: true
      }, { $set: { state: "PENDING", failure_compensated: false } });
      if (reopened?.updated !== 1) {
        throw new InventoryCommandError("La reserva compensada cambio antes del reintento", "INVENTORY_RESERVATION_CONCURRENT_UPDATE", 409);
      }
      reservation2 = await findOne(entities.InventarioReserva, { id: reservation2.id, organization_id: input.organizationId });
    }
    if (reservation2) return { reservation: reservation2, created: false, previousState: reservation2.state };
    const data = {
      organization_id: input.organizationId,
      branch_id: input.branchId,
      work_order_id: movement.workOrderId,
      inventory_id: movement.inventoryId,
      inventario_id: movement.inventoryId,
      quote_id: movement.quoteId || null,
      quantity: movement.quantity,
      state: "PENDING",
      reserve_operation_key: input.operationKey,
      created_by: input.actorId,
      reserved_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    try {
      reservation2 = await entities.InventarioReserva.create(data);
    } catch (error) {
      reservation2 = await findOne(entities.InventarioReserva, {
        organization_id: input.organizationId,
        reserve_operation_key: input.operationKey,
        inventario_id: movement.inventoryId
      });
      if (!reservation2) throw error;
    }
    return { reservation: reservation2, created: true, previousState: null };
  }
  const transition = RESERVATION_TRANSITIONS[movement.movementType];
  if (!transition) return { reservation: null, created: false, previousState: null };
  const query = movement.reservationId ? { id: movement.reservationId, organization_id: input.organizationId } : {
    organization_id: input.organizationId,
    branch_id: input.branchId,
    work_order_id: movement.workOrderId,
    inventario_id: movement.inventoryId,
    state: transition.from
  };
  const reservation = await findOne(entities.InventarioReserva, query);
  if (!reservation) {
    throw new InventoryCommandError("Reserva de inventario no encontrada", "INVENTORY_RESERVATION_NOT_FOUND", 404);
  }
  if (reservation.branch_id !== input.branchId || reservation.inventory_id !== movement.inventoryId && reservation.inventario_id !== movement.inventoryId) {
    throw new InventoryCommandError("La reserva no pertenece al inventario o sucursal autorizada", "INVENTORY_RESERVATION_SCOPE_MISMATCH", 403);
  }
  if (Number(reservation.quantity) !== movement.quantity) {
    throw new InventoryCommandError("La cantidad no coincide con la reserva", "INVENTORY_RESERVATION_QUANTITY_MISMATCH", 409);
  }
  if (reservation.state === transition.to && reservation[transition.key] === input.operationKey) {
    return { reservation, created: false, previousState: transition.from, alreadyCommitted: true };
  }
  if (reservation.state !== transition.from) {
    throw new InventoryCommandError(`La reserva esta en estado ${reservation.state}`, "INVENTORY_RESERVATION_STATE_CONFLICT", 409);
  }
  return { reservation, created: false, previousState: reservation.state };
}
async function commitReservation(entities, input, movement, reservationContext) {
  const reservation = reservationContext.reservation;
  if (!reservation) return null;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const transition = movement.movementType === "RESERVE" ? { from: "PENDING", to: "RESERVED", timestamp: "reserved_at", key: "reserve_operation_key" } : RESERVATION_TRANSITIONS[movement.movementType];
  if (reservation.state === transition.to && reservation[transition.key] === input.operationKey) return reservation;
  let result;
  try {
    result = await entities.InventarioReserva.updateMany({
      id: reservation.id,
      organization_id: input.organizationId,
      state: transition.from
    }, { $set: {
      state: transition.to,
      [transition.key]: input.operationKey,
      [transition.timestamp]: now,
      last_operation_key: input.operationKey
    } });
  } catch (error) {
    const reconciled = await findOne(entities.InventarioReserva, { id: reservation.id, organization_id: input.organizationId });
    if (reconciled?.state === transition.to && reconciled?.[transition.key] === input.operationKey) return reconciled;
    throw error;
  }
  if (result?.updated !== 1) {
    const reconciled = await findOne(entities.InventarioReserva, { id: reservation.id, organization_id: input.organizationId });
    if (reconciled?.state === transition.to && reconciled?.[transition.key] === input.operationKey) return reconciled;
    throw new InventoryCommandError("La reserva cambio durante la operacion", "INVENTORY_RESERVATION_CONCURRENT_UPDATE", 409);
  }
  return findOne(entities.InventarioReserva, { id: reservation.id, organization_id: input.organizationId });
}
async function restoreReservation(entities, input, movement, context) {
  if (!context?.reservation) return;
  if (context.created) {
    await entities.InventarioReserva.updateMany({
      id: context.reservation.id,
      organization_id: input.organizationId
    }, { $set: { state: "RELEASED", released_at: (/* @__PURE__ */ new Date()).toISOString(), failure_compensated: true } });
    return;
  }
  if (!context.previousState) return;
  await entities.InventarioReserva.updateMany({
    id: context.reservation.id,
    organization_id: input.organizationId
  }, { $set: { state: context.previousState, failure_compensated: true } });
}
function ledgerData(input, movement, projection, fingerprint, movementKey, reservationId) {
  return {
    organization_id: input.organizationId,
    branch_id: input.branchId,
    inventario_id: movement.inventoryId,
    inventory_id: movement.inventoryId,
    movement_key: movementKey,
    movement_type: movement.movementType,
    quantity: movement.quantity,
    quantity_delta: projection.onHandDelta,
    available_delta: projection.availableDelta,
    reserved_delta: projection.reservedDelta,
    available_before: projection.availableBefore,
    available_after: projection.availableAfter,
    reserved_before: projection.reservedBefore,
    reserved_after: projection.reservedAfter,
    reference_type: input.referenceType || null,
    reference_id: input.referenceId || null,
    work_order_id: movement.workOrderId || null,
    quote_id: movement.quoteId || null,
    reservation_id: reservationId || null,
    operation_key: input.operationKey,
    fingerprint,
    reversal_of: movement.reversalOf || null,
    modificado_por: input.actorId,
    actor_user_id: input.actorId,
    effective_at: (/* @__PURE__ */ new Date()).toISOString(),
    motivo: input.reason || movement.movementType,
    campo: "cantidad_disponible",
    valor_anterior: String(projection.availableBefore),
    valor_nuevo: String(projection.availableAfter)
  };
}
async function createLedger(entities, data) {
  try {
    return await entities.InventarioHistorial.create(data);
  } catch (error) {
    const existing = await findOne(entities.InventarioHistorial, {
      organization_id: data.organization_id,
      movement_key: data.movement_key
    });
    if (existing?.fingerprint === data.fingerprint) return existing;
    if (existing) {
      throw new InventoryCommandError("El movement_key ya existe con otro fingerprint", "INVENTORY_IDEMPOTENCY_CONFLICT", 409);
    }
    throw error;
  }
}
async function loadInventory(entities, input, movement) {
  const inventory = await findOne(entities.Inventario, {
    id: movement.inventoryId,
    organization_id: input.organizationId
  });
  if (!inventory) throw new InventoryCommandError("Producto de inventario no encontrado", "INVENTORY_NOT_FOUND", 404);
  if (!inventory.branch_id || inventory.branch_id !== input.branchId) {
    throw new InventoryCommandError("El producto pertenece a otra sucursal", "INVENTORY_CROSS_BRANCH_DENIED", 403);
  }
  return inventory;
}
async function applyMovement(entities, input, movement, fingerprint) {
  const baseMovementKey = `${input.operationKey}:${movement.index}`;
  const priorAttempts = await entities.InventarioHistorial.filter({
    organization_id: input.organizationId,
    operation_key: input.operationKey,
    inventario_id: movement.inventoryId
  }, "effective_at", 500);
  const matchingAttempts = (priorAttempts || []).filter((row) => row.movement_key === baseMovementKey || String(row.movement_key || "").startsWith(`${baseMovementKey}:retry:`));
  const movementKey = matchingAttempts.length === 0 ? baseMovementKey : `${baseMovementKey}:retry:${matchingAttempts.length}`;
  const inventory = await loadInventory(entities, input, movement);
  const reservationContext = await loadReservation(entities, input, movement);
  const projection = calculateProjection(inventory, movement);
  const movementDate = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  let cas;
  try {
    cas = await applyInventoryProjectionCas(entities.Inventario, {
      inventoryId: movement.inventoryId,
      organizationId: input.organizationId,
      branchId: input.branchId,
      expectedAvailable: projection.availableBefore,
      expectedReserved: projection.reservedBefore,
      newAvailable: projection.availableAfter,
      newReserved: projection.reservedAfter,
      movementDate,
      operationKey: input.operationKey,
      movementKey
    });
  } catch (error) {
    const reconciled = await loadInventory(entities, input, movement);
    if (reconciled.last_inventory_operation_key === input.operationKey && reconciled.last_inventory_movement_key === movementKey && Number(reconciled.cantidad_disponible) === projection.availableAfter && Number(reconciled.cantidad_reservada || 0) === projection.reservedAfter) {
      cas = { updated: 1, recovered_ambiguous_update: true };
    } else {
      await restoreReservation(entities, input, movement, reservationContext).catch(() => null);
      throw error;
    }
  }
  if (cas?.updated !== 1) {
    await restoreReservation(entities, input, movement, reservationContext).catch(() => null);
    const current = await loadInventory(entities, input, movement);
    calculateProjection(current, movement);
    throw new InventoryCommandError("El inventario cambio durante la operacion", "INVENTORY_CONCURRENT_UPDATE", 409, { retryable: true });
  }
  let ledger;
  try {
    ledger = await createLedger(entities, ledgerData(
      input,
      movement,
      projection,
      fingerprint,
      movementKey,
      reservationContext.reservation?.id
    ));
  } catch (ledgerError) {
    const rollback = await rollbackInventoryProjectionCas(entities.Inventario, {
      inventoryId: movement.inventoryId,
      organizationId: input.organizationId,
      branchId: input.branchId,
      expectedAvailable: projection.availableAfter,
      expectedReserved: projection.reservedAfter,
      previousAvailable: projection.availableBefore,
      previousReserved: projection.reservedBefore,
      previousMovementDate: inventory.fecha_ultimo_movimiento || null,
      operationKey: input.operationKey,
      movementKey
    });
    await restoreReservation(entities, input, movement, reservationContext).catch(() => null);
    if (rollback?.updated !== 1) {
      throw new InventoryCommandError(
        "Fallo el ledger y no fue posible confirmar la compensacion",
        "INVENTORY_COMPENSATION_INCOMPLETE",
        500,
        { cause: ledgerError.message, inventory_id: movement.inventoryId }
      );
    }
    throw new InventoryCommandError("Fallo el ledger; la proyeccion fue revertida", "INVENTORY_LEDGER_WRITE_FAILED", 500, {
      cause: ledgerError.message
    });
  }
  let reservation = reservationContext.reservation;
  try {
    reservation = await commitReservation(entities, input, movement, reservationContext);
  } catch (reservationError) {
    const rollback = await rollbackInventoryProjectionCas(entities.Inventario, {
      inventoryId: movement.inventoryId,
      organizationId: input.organizationId,
      branchId: input.branchId,
      expectedAvailable: projection.availableAfter,
      expectedReserved: projection.reservedAfter,
      previousAvailable: projection.availableBefore,
      previousReserved: projection.reservedBefore,
      previousMovementDate: inventory.fecha_ultimo_movimiento || null,
      operationKey: input.operationKey,
      movementKey
    });
    await restoreReservation(entities, input, movement, reservationContext).catch(() => null);
    if (rollback?.updated === 1) {
      await createLedger(entities, {
        ...ledgerData(input, {
          ...movement,
          movementType: "REVERSAL",
          reversalOf: ledger.id
        }, {
          availableBefore: projection.availableAfter,
          reservedBefore: projection.reservedAfter,
          availableAfter: projection.availableBefore,
          reservedAfter: projection.reservedBefore,
          availableDelta: -projection.availableDelta,
          reservedDelta: -projection.reservedDelta,
          onHandDelta: -projection.onHandDelta
        }, fingerprint, `${movementKey}:reservation-compensation`, reservation?.id),
        operation_key: `${input.operationKey}:reservation-compensation`
      }).catch(() => null);
    }
    throw new InventoryCommandError("No fue posible confirmar la reserva", "INVENTORY_RESERVATION_COMMIT_FAILED", 500, {
      cause: reservationError.message
    });
  }
  return {
    inventory_id: movement.inventoryId,
    movement_id: ledger.id,
    movement_key: movementKey,
    movement_type: movement.movementType,
    available_before: projection.availableBefore,
    available_after: projection.availableAfter,
    reserved_before: projection.reservedBefore,
    reserved_after: projection.reservedAfter,
    reservation_id: reservation?.id || null
  };
}
async function compensateApplied(entities, input, applied, fingerprint) {
  const errors = [];
  for (const result of [...applied].reverse()) {
    try {
      const current = await findOne(entities.Inventario, {
        id: result.inventory_id,
        organization_id: input.organizationId,
        branch_id: input.branchId
      });
      if (!current) throw new Error("inventory_missing");
      const reversalKey = `${input.operationKey}:automatic-reversal:${result.movement_id}`;
      const reversalMovement = {
        inventoryId: result.inventory_id,
        movementType: "REVERSAL",
        quantity: Math.max(1, Math.abs(result.available_after - result.available_before + (result.reserved_after - result.reserved_before))),
        availableDelta: result.available_before - result.available_after,
        reservedDelta: result.reserved_before - result.reserved_after,
        reversalOf: result.movement_id,
        index: 0
      };
      await applyMovement(entities, {
        ...input,
        operationKey: reversalKey,
        referenceType: "INTERNAL_REVERSAL",
        referenceId: result.movement_id,
        reason: `Compensacion automatica de ${input.operationKey}`
      }, reversalMovement, fingerprint);
      if (result.reservation_id) {
        const backwards = {
          RESERVE: { from: "RESERVED", to: "RELEASED", key: "reserve_operation_key" },
          CONSUME: { from: "CONSUMED", to: "RESERVED", key: "consume_operation_key" },
          RELEASE: { from: "RELEASED", to: "RESERVED", key: "release_operation_key" },
          RETURN: { from: "RETURNED", to: "CONSUMED", key: "return_operation_key" }
        }[result.movement_type];
        if (backwards) {
          const restored = await entities.InventarioReserva.updateMany({
            id: result.reservation_id,
            organization_id: input.organizationId,
            state: backwards.from,
            [backwards.key]: input.operationKey
          }, { $set: { state: backwards.to, failure_compensated: true } });
          if (restored?.updated !== 1) throw new Error("reservation_compensation_ownership_lost");
        }
      }
    } catch (error) {
      errors.push(`${result.inventory_id}:${error.code || error.message}`);
    }
  }
  return errors;
}
async function replayResult(entities, input, movements, fingerprint) {
  const rows = await entities.InventarioHistorial.filter({
    organization_id: input.organizationId,
    operation_key: input.operationKey
  }, "effective_at", 500);
  if ((rows || []).some((row) => row.fingerprint !== fingerprint)) {
    throw new InventoryCommandError("La operation key fue reutilizada con otro payload", "INVENTORY_IDEMPOTENCY_CONFLICT", 409);
  }
  const primary = [];
  const businessReversed = /* @__PURE__ */ new Set();
  for (const movement of movements) {
    const baseMovementKey = `${input.operationKey}:${movement.index}`;
    const candidates = (rows || []).filter((row) => row.movement_key === baseMovementKey || String(row.movement_key || "").startsWith(`${baseMovementKey}:retry:`));
    let committed = null;
    for (const candidate of [...candidates].reverse()) {
      const reversals = await entities.InventarioHistorial.filter({
        organization_id: input.organizationId,
        reversal_of: candidate.id
      }, "-effective_at", 20);
      const automaticallyReversed = (reversals || []).some((row) => {
        const key = String(row.operation_key || "");
        return key.includes(":automatic-reversal:") || key.includes(":reservation-compensation");
      });
      if (!automaticallyReversed) {
        committed = candidate;
        if ((reversals || []).length > 0) businessReversed.add(candidate.id);
        break;
      }
    }
    if (committed) primary.push(committed);
  }
  if (primary.length !== movements.length) return null;
  for (const row of primary) {
    if (row.reservation_id && !businessReversed.has(row.id)) {
      const reservation = await findOne(entities.InventarioReserva, {
        id: row.reservation_id,
        organization_id: input.organizationId
      });
      const movement = movements.find((item) => `${input.operationKey}:${item.index}` === row.movement_key);
      if (reservation && movement) {
        await commitReservation(entities, input, movement, {
          reservation,
          created: movement.movementType === "RESERVE",
          previousState: reservation.state
        });
      }
    }
  }
  return {
    success: true,
    operation_key: input.operationKey,
    fingerprint,
    idempotent: true,
    results: primary.map((row) => ({
      inventory_id: row.inventario_id,
      movement_id: row.id,
      movement_key: row.movement_key,
      movement_type: row.movement_type,
      available_before: row.available_before,
      available_after: row.available_after,
      reserved_before: row.reserved_before,
      reserved_after: row.reserved_after,
      reservation_id: row.reservation_id || null
    }))
  };
}
async function executeInventoryCommand(base44, rawInput, providedLockAdapter = null) {
  const input = {
    ...rawInput,
    organizationId: String(rawInput?.organizationId || "").trim(),
    branchId: String(rawInput?.branchId || "").trim(),
    actorId: String(rawInput?.actorId || "").trim(),
    operationKey: String(rawInput?.operationKey || "").trim()
  };
  if (!input.organizationId || !input.branchId || !input.actorId || !input.operationKey) {
    throw new InventoryCommandError(
      "organizationId, branchId, actorId y operationKey son requeridos",
      "INVENTORY_COMMAND_CONTEXT_REQUIRED",
      400
    );
  }
  const movements = normalizeMovements(input.movements);
  const isRecoveryOnly = movements.every((movement) => movement.type === "REVERSAL");
  if (!isRecoveryOnly) {
    try {
      await assertActiveBranch(base44, input.organizationId, input.branchId, {
        code: "INVENTORY_BRANCH_INACTIVE",
        status: 409,
        message: "La sucursal esta inactiva y no admite mutaciones ordinarias de inventario."
      });
    } catch (error) {
      if (error instanceof BranchProtectionError) {
        throw new InventoryCommandError(error.message, error.code, error.status, error.details);
      }
      throw error;
    }
  }
  const fingerprint = await commandFingerprint(input, movements);
  if (input.fingerprint && input.fingerprint !== fingerprint) {
    throw new InventoryCommandError("El fingerprint no coincide con el comando", "INVENTORY_FINGERPRINT_MISMATCH", 409);
  }
  const entities = base44.asServiceRole.entities;
  const auditCommitted = async (result) => {
    const movementIds = (result.results || []).map((row) => row.movement_id).filter(Boolean).sort();
    if (movementIds.length !== (result.results || []).length || movementIds.length === 0) {
      throw new InventoryCommandError("La operacion no produjo identidad durable para auditoria", "AUDIT_OPERATION_ID_SOURCE_REQUIRED", 500);
    }
    const auditOperationId = `inventory-command:${await sha256(movementIds)}`;
    const audit = await appendAuditEvent(base44, {
      eventType: "INVENTORY_COMMAND_COMMITTED",
      principalClass: input.principalClass || "HUMAN_MEMBER",
      actorUserId: input.principalClass === "CUSTOMER_TOKEN" ? null : input.actorId,
      actorPrimaryRole: input.actorPrimaryRole || null,
      organizationId: input.organizationId,
      branchId: input.branchId,
      resourceType: "InventarioHistorial",
      resourceId: input.operationKey,
      commandPolicyId: "CP-INV-001",
      correlationId: input.correlationId || input.operationKey,
      auditOperationId,
      operationKey: input.operationKey,
      outcome: result.idempotent ? "IDEMPOTENT_REPLAY" : "COMMITTED",
      newState: { movement_count: result.results?.length || 0 },
      metadata: {
        reference_type: input.referenceType || null,
        reference_id: input.referenceId || null,
        movements: (result.results || []).map((row) => ({ movement_id: row.movement_id, movement_type: row.movement_type, inventory_id: row.inventory_id, reservation_id: row.reservation_id || null }))
      }
    });
    return { ...result, audit_event_id: audit.event.id };
  };
  const preexisting = await replayResult(entities, input, movements, fingerprint);
  if (preexisting) return auditCommitted(preexisting);
  const lockAdapter = providedLockAdapter || createBase44InventoryLockAdapter(base44);
  const lease = await lockAdapter.acquire({
    organizationId: input.organizationId,
    operationKey: input.operationKey,
    fingerprint,
    resources: movements.map((item) => item.inventoryId)
  });
  const applied = [];
  try {
    await lockAdapter.assertOwned({ operationKey: input.operationKey, lease });
    const replay = await replayResult(entities, input, movements, fingerprint);
    if (replay) return auditCommitted(replay);
    for (const movement of movements) {
      await lockAdapter.assertOwned({ operationKey: input.operationKey, lease });
      const committed = await replayResult(entities, input, [movement], fingerprint);
      if (committed) applied.push(committed.results[0]);
      else applied.push(await applyMovement(entities, input, movement, fingerprint));
    }
    return auditCommitted({
      success: true,
      operation_key: input.operationKey,
      fingerprint,
      idempotent: false,
      results: applied
    });
  } catch (error) {
    if (applied.length > 0) {
      const compensationErrors = await compensateApplied(entities, input, applied, fingerprint);
      if (compensationErrors.length > 0) {
        throw new InventoryCommandError(
          "La operacion fallo y su compensacion requiere revision",
          "INVENTORY_MULTI_ITEM_COMPENSATION_INCOMPLETE",
          500,
          { cause: error.message, compensation_errors: compensationErrors }
        );
      }
    }
    throw error;
  } finally {
    try {
      await lockAdapter.release({ operationKey: input.operationKey, lease });
    } catch (error) {
      console.error("[inventoryMutationService] lock release failed:", error.message);
    }
  }
}
async function reverseInventoryCommand(base44, input, lockAdapter = null) {
  const entities = base44.asServiceRole.entities;
  const original = await entities.InventarioHistorial.filter({
    organization_id: input.organizationId,
    operation_key: input.operationKey
  }, "effective_at", 500);
  const primary = [];
  for (const row of (original || []).filter((item) => !item.reversal_of && item.movement_type !== "REVERSAL")) {
    const reversals = await entities.InventarioHistorial.filter({
      organization_id: input.organizationId,
      reversal_of: row.id
    }, "-effective_at", 20);
    if (!(reversals || []).length) primary.push(row);
  }
  if (primary.length === 0) {
    const replay = await entities.InventarioHistorial.filter({
      organization_id: input.organizationId,
      operation_key: input.reversalOperationKey
    }, "effective_at", 500);
    if (replay?.length) {
      return {
        success: true,
        operation_key: input.reversalOperationKey,
        idempotent: true,
        results: replay.map((row) => ({
          inventory_id: row.inventario_id,
          movement_id: row.id,
          movement_key: row.movement_key,
          movement_type: row.movement_type,
          available_before: row.available_before,
          available_after: row.available_after,
          reserved_before: row.reserved_before,
          reserved_after: row.reserved_after,
          reservation_id: row.reservation_id || null
        }))
      };
    }
    throw new InventoryCommandError("No se encontraron movimientos para revertir", "INVENTORY_REVERSAL_SOURCE_NOT_FOUND", 404);
  }
  const duplicateInventory = primary.find((row, index) => index > 0 && primary.slice(0, index).some((candidate) => candidate.inventario_id === row.inventario_id));
  if (duplicateInventory) {
    throw new InventoryCommandError("Existen multiples movimientos activos para el mismo inventario", "INVENTORY_DUPLICATE_STATE", 409);
  }
  const result = await executeInventoryCommand(base44, {
    organizationId: input.organizationId,
    branchId: input.branchId,
    actorId: input.actorId,
    operationKey: input.reversalOperationKey,
    referenceType: "INTERNAL_REVERSAL",
    referenceId: input.operationKey,
    reason: input.reason || `Reversion de ${input.operationKey}`,
    movements: primary.map((row) => ({
      inventoryId: row.inventario_id,
      movementType: "REVERSAL",
      quantity: Math.max(1, Math.abs(Number(row.quantity_delta || 0))),
      availableDelta: -Number(row.available_delta || 0),
      reservedDelta: -Number(row.reserved_delta || 0),
      reversalOf: row.id
    }))
  }, lockAdapter);
  for (const row of primary.filter((item) => item.reservation_id)) {
    const backwards = {
      RESERVE: { from: "RESERVED", to: "RELEASED", key: "reserve_operation_key" },
      CONSUME: { from: "CONSUMED", to: "RESERVED", key: "consume_operation_key" },
      RELEASE: { from: "RELEASED", to: "RESERVED", key: "release_operation_key" },
      RETURN: { from: "RETURNED", to: "CONSUMED", key: "return_operation_key" }
    }[row.movement_type];
    if (!backwards) continue;
    const reservation = await findOne(entities.InventarioReserva, {
      id: row.reservation_id,
      organization_id: input.organizationId
    });
    if (reservation?.state === backwards.to && reservation?.last_operation_key === input.reversalOperationKey) continue;
    const restored = await entities.InventarioReserva.updateMany({
      id: row.reservation_id,
      organization_id: input.organizationId,
      state: backwards.from,
      [backwards.key]: input.operationKey
    }, { $set: {
      state: backwards.to,
      last_operation_key: input.reversalOperationKey,
      failure_compensated: true
    } });
    if (restored?.updated !== 1) {
      throw new InventoryCommandError(
        "La proyeccion fue revertida pero el estado de reserva requiere revision",
        "INVENTORY_REVERSAL_RESERVATION_INCOMPLETE",
        500,
        { reservation_id: row.reservation_id }
      );
    }
  }
  return result;
}

// base44/functions/_shared/workOrderLifecycleLock.ts
var LIFECYCLE_LOCK_TTL_MS = 15 * 60 * 1e3;
function workflowError(message, code, status = 409) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}
async function loadWorkOrder(base44, organizationId, workOrderId) {
  const records = await base44.asServiceRole.entities.OrdenTrabajo.filter({
    id: workOrderId,
    organization_id: organizationId
  });
  return records?.[0] || null;
}
async function acquireLifecycleLock({ base44, ot, orgId, effectiveUser, operation, requestedToken = null }) {
  const current = await loadWorkOrder(base44, orgId, ot.id);
  if (!current) return { acquired: false, code: "ORDEN_TRABAJO_NOT_FOUND" };
  if (requestedToken) {
    const borrowed = current.lifecycle_lock_token === requestedToken && current.lifecycle_lock_operation === "initTechnicalActivity" && current.lifecycle_lock_owner_user_id === effectiveUser.id;
    return borrowed ? { acquired: true, token: requestedToken, owned: false, ot: current } : { acquired: false, code: "LIFECYCLE_LOCK_INVALID" };
  }
  const token = crypto.randomUUID();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const lockData = {
    lifecycle_lock_token: token,
    lifecycle_lock_operation: operation,
    lifecycle_lock_owner_user_id: effectiveUser.id,
    lifecycle_lock_at: now
  };
  let claim;
  try {
    claim = await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
      id: ot.id,
      organization_id: orgId,
      $or: [{ lifecycle_lock_token: { $exists: false } }, { lifecycle_lock_token: null }]
    }, { $set: lockData });
  } catch (claimError) {
    const reconciled = await loadWorkOrder(base44, orgId, ot.id);
    if (reconciled?.lifecycle_lock_token === token) {
      return { acquired: true, token, owned: true, recovered_ambiguous_lock: true, ot: reconciled };
    }
    throw claimError;
  }
  if (claim?.updated === 1) return { acquired: true, token, owned: true, ot: { ...current, ...lockData } };
  const locked = await loadWorkOrder(base44, orgId, ot.id);
  const lockTimestamp = Date.parse(locked?.lifecycle_lock_at || "");
  const stale = locked?.lifecycle_lock_token && Number.isFinite(lockTimestamp) && Date.now() - lockTimestamp > LIFECYCLE_LOCK_TTL_MS;
  if (stale) {
    let takeover;
    try {
      takeover = await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
        id: ot.id,
        organization_id: orgId,
        lifecycle_lock_token: locked.lifecycle_lock_token,
        lifecycle_lock_at: locked.lifecycle_lock_at
      }, { $set: lockData });
    } catch (takeoverError) {
      const reconciled = await loadWorkOrder(base44, orgId, ot.id);
      if (reconciled?.lifecycle_lock_token === token) {
        return {
          acquired: true,
          token,
          owned: true,
          recovered_stale_lock: true,
          recovered_ambiguous_lock: true,
          ot: reconciled
        };
      }
      throw takeoverError;
    }
    if (takeover?.updated === 1) {
      return { acquired: true, token, owned: true, recovered_stale_lock: true, ot: { ...locked, ...lockData } };
    }
  }
  return {
    acquired: false,
    code: "LIFECYCLE_OPERATION_IN_PROGRESS",
    operation: locked?.lifecycle_lock_operation || null
  };
}
async function renewLifecycleLock(base44, orgId, workOrderId, lock) {
  const heartbeat = (/* @__PURE__ */ new Date()).toISOString();
  try {
    const renewed = await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
      id: workOrderId,
      organization_id: orgId,
      lifecycle_lock_token: lock.token
    }, { $set: { lifecycle_lock_at: heartbeat } });
    if (renewed?.updated === 1) return heartbeat;
  } catch (renewError) {
    const reconciled = await loadWorkOrder(base44, orgId, workOrderId);
    if (reconciled?.lifecycle_lock_token === lock.token) return reconciled.lifecycle_lock_at;
    throw renewError;
  }
  const current = await loadWorkOrder(base44, orgId, workOrderId);
  if (current?.lifecycle_lock_token === lock.token) return current.lifecycle_lock_at;
  throw workflowError("El lock del lifecycle fue recuperado por otra operacion.", "LIFECYCLE_LOCK_LOST");
}
async function releaseLifecycleLock(base44, orgId, workOrderId, lock) {
  if (!lock?.owned) return;
  const released = await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
    id: workOrderId,
    organization_id: orgId,
    lifecycle_lock_token: lock.token
  }, {
    $unset: {
      lifecycle_lock_token: "",
      lifecycle_lock_operation: "",
      lifecycle_lock_owner_user_id: "",
      lifecycle_lock_at: ""
    }
  });
  if (released?.updated !== 1) console.warn(`[workOrderLifecycleLock] Lock no pertenece al intento: ${workOrderId}`);
}

// base44/functions/transitionWorkOrderStatus/entry.ts
var ALLOWED_TRANSITIONS = {
  EN_COLA_REVISION: ["ASIGNADA", "CANCELADA"],
  ASIGNADA: ["EN_REVISION", "CANCELADA"],
  EN_REVISION: ["DIAGNOSTICADA", "CANCELADA"],
  DIAGNOSTICADA: ["COTIZADA", "APROBADA", "CANCELADA"],
  COTIZADA: ["APROBADA", "CANCELADA"],
  APROBADA: ["EN_REPARACION", "CANCELADA"],
  EN_REPARACION: ["PRUEBAS", "CANCELADA"],
  PRUEBAS: ["FINALIZADA", "EN_REPARACION"],
  FINALIZADA: ["ENTREGADA"],
  ENTREGADA: [],
  CANCELADA: []
};
var IRREVERSIBLE_STATES = ["ENTREGADA", "CANCELADA"];
async function ensureLifecycleAudit(base44, {
  authorization,
  user,
  ot,
  previousStatus,
  newStatus,
  operationId,
  externalCorrelationId,
  actorUserId,
  actorRole,
  committedAt
}) {
  return appendAuditEvent(base44, {
    eventType: "WORK_ORDER_STATUS_TRANSITIONED",
    principalClass: authorization.principalClass,
    actorUserId: actorUserId || user.id,
    actorPrimaryRole: actorRole || authorization.persistedRole,
    effectiveTechnicianUserId: ot.tecnico_asignado_id === user.id ? user.id : null,
    organizationId: authorization.organizationId,
    branchId: ot.branch_id,
    resourceType: "OrdenTrabajo",
    resourceId: ot.id,
    commandPolicyId: "CP-OT-002",
    correlationId: externalCorrelationId || operationId,
    externalCorrelationId: externalCorrelationId || null,
    auditOperationId: operationId,
    operationKey: operationId,
    operationSemantics: { from_status: previousStatus, to_status: newStatus },
    priorState: { estado: previousStatus },
    newState: { estado: newStatus },
    custodySnapshot: { tecnico_asignado_id: ot.tecnico_asignado_id || null, qa_cycle_id: ot.qa_cycle_id || null },
    metadata: { external_correlation_id: externalCorrelationId || null },
    occurredAt: committedAt || void 0
  });
}
async function evaluateStaffTransitionPipeline({
  base44,
  authorization,
  user,
  ot,
  currentStatus,
  newStatus,
  correlationId
}) {
  const transitionPolicy = OT_TRANSITION_POLICIES[`${currentStatus}->${newStatus}`] || (currentStatus === newStatus ? Object.entries(OT_TRANSITION_POLICIES).find(([edge]) => edge.endsWith(`->${newStatus}`))?.[1] : null);
  if (!transitionPolicy) {
    return evaluateCommandPolicyWithShadow({
      base44,
      policyId: "CP-OT-002",
      authorization,
      relationship: "NONE",
      commandCapability: { allOf: ["TECHNICAL_WORK"] },
      commandRelationship: "NONE",
      preconditionSatisfied: false,
      compatibilityDecision: { ok: false, code: "LEGACY_TRANSITION_UNMAPPED" },
      audit: {
        actorUserId: user.id,
        branchId: ot.branch_id,
        resourceType: "OrdenTrabajo",
        resourceId: ot.id,
        correlationId
      }
    });
  }
  const requiredCapabilities = transitionPolicy.capability?.allOf || [];
  const capabilitySatisfied = requiredCapabilities.every((capability) => authorization.capabilities.includes(capability));
  const relationshipSatisfied = transitionPolicy.relationship === "EFFECTIVE_TECHNICIAN" ? user.id === ot.tecnico_asignado_id : transitionPolicy.relationship === "SUPERVISOR" ? authorization.capabilities.includes("TECHNICAL_ASSIGNMENT") : transitionPolicy.relationship === "BRANCH_RESOURCE";
  const stateSatisfied = currentStatus === newStatus || (ALLOWED_TRANSITIONS[currentStatus] || []).includes(newStatus);
  const roleSatisfied = hasWorkOrderTargetAuthority({
    targetStatus: newStatus,
    role: authorization.role,
    isSuperAdmin: authorization.isSuperAdmin
  });
  const compatibilityAllowed = capabilitySatisfied && relationshipSatisfied && stateSatisfied && roleSatisfied;
  return evaluateCommandPolicyWithShadow({
    base44,
    policyId: "CP-OT-002",
    authorization,
    relationship: relationshipSatisfied ? transitionPolicy.relationship : "NONE",
    commandCapability: transitionPolicy.capability,
    commandRelationship: transitionPolicy.relationship,
    preconditionSatisfied: stateSatisfied,
    compatibilityDecision: {
      ok: compatibilityAllowed,
      code: compatibilityAllowed ? "ALLOW" : "LEGACY_TRANSITION_DENY"
    },
    audit: {
      actorUserId: user.id,
      branchId: ot.branch_id,
      resourceType: "OrdenTrabajo",
      resourceId: ot.id,
      correlationId
    }
  });
}
function validatePayloadForTarget(targetStatus, ot, extra) {
  switch (targetStatus) {
    case "ASIGNADA":
      if (!extra?.tecnico_asignado_id && !ot.tecnico_asignado_id) {
        return "Se requiere tecnico_asignado_id para asignar la OT";
      }
      break;
    case "EN_REVISION":
      if (!ot.tecnico_asignado_id && !extra?.tecnico_asignado_id) {
        return "La OT debe tener un t\xE9cnico asignado para iniciar revisi\xF3n";
      }
      break;
    case "APROBADA":
      break;
    case "EN_REPARACION":
      if (!ot.tecnico_asignado_id) {
        return "La OT debe tener un t\xE9cnico asignado para iniciar reparaci\xF3n";
      }
      if (extra?._aprobacion_cliente_verificada !== true) {
        return "EN_REPARACION_SIN_APROBACION";
      }
      break;
    case "ENTREGADA":
      if (!extra?.ventas_pagadas_verificadas) {
        return 'ENTREGADA: se requiere al menos una Venta en estado "pagada" asociada a esta OT';
      }
      break;
    default:
      break;
  }
  return null;
}
async function ensureDiagnosticQuote({ base44, ot, diagnostico, orgId, effectiveUser }) {
  const idempotencyKey = `diagnostico-finalizacion:${orgId}:${diagnostico.id}`;
  const findExisting2 = () => base44.asServiceRole.entities.Cotizacion.filter({
    organization_id: orgId,
    idempotency_key: idempotencyKey
  }, "-created_date", 5);
  let existing = await findExisting2();
  if (existing?.length > 1) {
    throw workflowError(
      "Existe m\xE1s de una cotizaci\xF3n autom\xE1tica para este diagn\xF3stico.",
      "DIAGNOSTIC_QUOTE_DUPLICATED"
    );
  }
  if (existing?.[0]) return { quote: existing[0], idempotent: true };
  const legacyQuotes = await base44.asServiceRole.entities.Cotizacion.filter({
    organization_id: orgId,
    orden_trabajo_id: ot.id,
    diagnostico_tecnico_id: diagnostico.id
  }, "-created_date", 5);
  if (legacyQuotes?.length > 1) {
    throw workflowError(
      "Existe m\xE1s de una cotizaci\xF3n previa para este diagn\xF3stico.",
      "DIAGNOSTIC_QUOTE_DUPLICATED"
    );
  }
  if (legacyQuotes?.[0]) {
    const legacy = legacyQuotes[0];
    if (legacy.idempotency_key && legacy.idempotency_key !== idempotencyKey) {
      throw workflowError(
        "La cotizaci\xF3n previa pertenece a otra operaci\xF3n idempotente.",
        "DIAGNOSTIC_QUOTE_KEY_CONFLICT"
      );
    }
    if (!legacy.idempotency_key) {
      try {
        await base44.asServiceRole.entities.Cotizacion.updateMany({
          id: legacy.id,
          organization_id: orgId,
          $or: [
            { idempotency_key: { $exists: false } },
            { idempotency_key: null },
            { idempotency_key: "" }
          ]
        }, { $set: { idempotency_key: idempotencyKey } });
      } catch (adoptError) {
        existing = await findExisting2();
        if (existing?.length === 1) {
          return { quote: existing[0], idempotent: true, recovered: true };
        }
        throw adoptError;
      }
      existing = await findExisting2();
      if (existing?.length !== 1) {
        throw workflowError(
          "No se pudo adoptar de forma segura la cotizaci\xF3n previa.",
          "DIAGNOSTIC_QUOTE_ADOPTION_FAILED"
        );
      }
      return { quote: existing[0], idempotent: true, adopted: true };
    }
    return { quote: legacy, idempotent: true, adopted: true };
  }
  const items = (diagnostico.repuestos_requeridos || []).map((part) => ({
    tipo: "repuesto",
    referencia_id: part.inventario_id || null,
    descripcion: part.descripcion,
    cantidad: part.cantidad,
    precio_unitario: 0,
    subtotal: 0
  }));
  if (Number(diagnostico.tiempo_estimado_horas) > 0) {
    items.push({
      tipo: "mano_obra",
      descripcion: "Mano de obra t\xE9cnica",
      cantidad: Number(diagnostico.tiempo_estimado_horas),
      precio_unitario: 0,
      subtotal: 0
    });
  }
  const previousQuotes = await base44.asServiceRole.entities.Cotizacion.filter({
    organization_id: orgId,
    orden_trabajo_id: ot.id
  }, "-created_date", 100);
  try {
    const quote = await base44.asServiceRole.entities.Cotizacion.create({
      organization_id: orgId,
      branch_id: ot.branch_id,
      orden_trabajo_id: ot.id,
      diagnostico_tecnico_id: diagnostico.id,
      idempotency_key: idempotencyKey,
      cliente_id: ot.cliente_id,
      vendedor_id: diagnostico.tecnico_id || effectiveUser.id,
      vendedor_nombre: "Sistema",
      version: `v1.${previousQuotes?.length || 0}`,
      items,
      subtotal: 0,
      descuento_total: 0,
      impuesto: 0,
      total: 0,
      estado: "borrador"
    });
    return { quote, idempotent: false };
  } catch (createError) {
    existing = await findExisting2();
    if (existing?.length === 1) {
      return { quote: existing[0], idempotent: true, recovered: true };
    }
    throw createError;
  }
}
async function ensureDiagnosticEvent({ base44, ot, orgId, effectiveUser, now }) {
  const findExisting2 = () => base44.asServiceRole.entities.OTEvent.filter({
    organization_id: orgId,
    orden_trabajo_id: ot.id,
    tipo: "TRANSITION_DIAGNOSTICADA"
  }, "-created_date", 5);
  let existing = await findExisting2();
  if (existing?.length > 1) {
    console.warn(`[transitionWorkOrderStatus] Eventos diagn\xF3sticos duplicados preexistentes \u2014 OT: ${ot.id}`);
    return { event: existing[0], idempotent: true, duplicated_preexisting: true };
  }
  if (existing?.[0]) return { event: existing[0], idempotent: true };
  try {
    const event = await base44.asServiceRole.entities.OTEvent.create({
      organization_id: orgId,
      orden_trabajo_id: ot.id,
      tipo: "TRANSITION_DIAGNOSTICADA",
      created_by_user_id: effectiveUser.id,
      processed: false,
      created_at: now
    });
    return { event, idempotent: false };
  } catch (createError) {
    existing = await findExisting2();
    if (existing?.length === 1) {
      return { event: existing[0], idempotent: true, recovered: true };
    }
    throw createError;
  }
}
async function completeDiagnosticWorkflow({
  base44,
  ot,
  orgId,
  effectiveUser,
  effectiveRole,
  diagnosticoId
}) {
  let lock;
  try {
    lock = await acquireLifecycleLock({
      base44,
      ot,
      orgId,
      effectiveUser,
      operation: "completeDiagnosticWorkflow"
    });
  } catch (error) {
    return Response.json({
      error: `No se pudo adquirir el lock del lifecycle: ${error.message}`,
      code: "LIFECYCLE_LOCK_FAILED",
      retryable: true
    }, { status: 500 });
  }
  if (!lock.acquired) {
    return Response.json({
      error: "Otra operaci\xF3n del lifecycle est\xE1 en progreso para esta OT.",
      code: lock.code,
      operation: lock.operation || null,
      retryable: true
    }, { status: 409 });
  }
  try {
    const currentOT = await loadWorkOrder(base44, orgId, ot.id);
    if (!currentOT) {
      throw workflowError("Orden de trabajo no encontrada.", "ORDEN_TRABAJO_NOT_FOUND", 404);
    }
    if (!["EN_REVISION", "DIAGNOSTICADA"].includes(currentOT.estado)) {
      throw workflowError(
        `La OT debe estar en EN_REVISION para completar el diagn\xF3stico. Estado actual: ${currentOT.estado}.`,
        "ESTADO_OT_INVALIDO_DIAGNOSTICO",
        422
      );
    }
    const diagnosticoFilter = diagnosticoId ? { id: diagnosticoId, organization_id: orgId, orden_trabajo_id: currentOT.id } : { organization_id: orgId, orden_trabajo_id: currentOT.id };
    const diagnosticos = await base44.asServiceRole.entities.DiagnosticoTecnico.filter(
      diagnosticoFilter,
      "-created_date",
      20
    );
    let diagnostico = diagnosticoId ? diagnosticos?.[0] : diagnosticos?.find((d) => d.bloqueado !== true) || diagnosticos?.[0];
    if (!diagnostico) {
      throw workflowError(
        "No existe un diagn\xF3stico t\xE9cnico para esta OT.",
        "DIAGNOSTICADA_SIN_DIAGNOSTICO_TECNICO",
        422
      );
    }
    if (effectiveRole === "TECHNICIAN" && diagnostico.tecnico_id !== effectiveUser.id) {
      throw workflowError(
        "No autorizado: este diagn\xF3stico pertenece a otro t\xE9cnico.",
        "TECHNICIAN_OWNERSHIP_REQUIRED",
        403
      );
    }
    const [documentos, actividades] = await Promise.all([
      base44.asServiceRole.entities.DiagnosticoDocumento.filter({
        diagnostico_id: diagnostico.id,
        organization_id: orgId
      }, "-created_date", 20),
      base44.asServiceRole.entities.ActividadTecnica.filter({
        organization_id: orgId,
        orden_trabajo_id: currentOT.id,
        soft_deleted: false
      }, "-created_date", 50)
    ]);
    const documentoEmitido = documentos?.find((d) => d.estado === "EMITIDO" || d.estado === "ENVIADO");
    if (!documentoEmitido) {
      throw workflowError(
        "Se requiere un Documento de Diagn\xF3stico EMITIDO o ENVIADO antes de completar.",
        "DIAGNOSTICADA_SIN_DOCUMENTO_EMITIDO",
        422
      );
    }
    const diagnosticoCompleto = diagnostico.estado === "listo_aprobacion" && Boolean(diagnostico.tipo_intervencion) && Boolean(diagnostico.trabajo_recomendado?.trim()) && Number(diagnostico.tiempo_estimado_horas) > 0;
    if (!diagnosticoCompleto) {
      throw workflowError(
        "El diagn\xF3stico t\xE9cnico est\xE1 incompleto.",
        "DIAGNOSTICO_TECNICO_INCOMPLETO",
        422
      );
    }
    const assignedActivities = (actividades || []).filter((a) => a.tecnico_id === currentOT.tecnico_asignado_id);
    const activeActivities = assignedActivities.filter((a) => a.estado === "en_progreso");
    const otherActive = (actividades || []).find((a) => a.estado === "en_progreso" && a.tecnico_id !== currentOT.tecnico_asignado_id);
    if (otherActive) {
      throw workflowError(
        "Existe una actividad en progreso de otro t\xE9cnico.",
        "ACTIVIDAD_TECNICA_INCONSISTENTE"
      );
    }
    if (activeActivities.length > 1) {
      throw workflowError(
        "Existe m\xE1s de una actividad t\xE9cnica en progreso para esta OT.",
        "ACTIVIDAD_TECNICA_MULTIPLE"
      );
    }
    const diagnosticoFinalizado = diagnostico.bloqueado === true && diagnostico.credito_consumido_finalizacion === true;
    const diagnosticoCreatedAt = Date.parse(diagnostico.created_date || "");
    const actividadFinalizadaRecuperable = assignedActivities.find((a) => {
      if (a.estado !== "finalizada") return false;
      const endedAt = Date.parse(a.ended_at || "");
      return !Number.isFinite(diagnosticoCreatedAt) || Number.isFinite(endedAt) && endedAt >= diagnosticoCreatedAt;
    });
    let actividad = activeActivities[0] || actividadFinalizadaRecuperable;
    if (!actividad) {
      throw workflowError(
        "No existe una actividad t\xE9cnica recuperable para completar.",
        "ACTIVIDAD_TECNICA_NO_ENCONTRADA",
        422
      );
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (actividad.estado === "en_progreso") {
      await renewLifecycleLock(base44, orgId, currentOT.id, lock);
      const duration = actividad.started_at ? Math.max(0, Math.round((new Date(now).getTime() - new Date(actividad.started_at).getTime()) / 6e4)) : null;
      const activityResult = await base44.asServiceRole.entities.ActividadTecnica.updateMany({
        id: actividad.id,
        organization_id: orgId,
        orden_trabajo_id: currentOT.id,
        estado: "en_progreso"
      }, {
        $set: { estado: "finalizada", ended_at: now, duracion_minutos: duration }
      });
      if (activityResult?.updated !== 1) {
        throw workflowError(
          "La actividad cambi\xF3 mientras se completaba el diagn\xF3stico.",
          "ACTIVIDAD_TECNICA_CONCURRENT_UPDATE"
        );
      }
      actividad = { ...actividad, estado: "finalizada", ended_at: now, duracion_minutos: duration };
    }
    if (!diagnosticoFinalizado) {
      await renewLifecycleLock(base44, orgId, currentOT.id, lock);
      const diagnosticQuery = {
        id: diagnostico.id,
        organization_id: orgId,
        estado: "listo_aprobacion",
        bloqueado: false,
        credito_consumido_finalizacion: { $ne: true }
      };
      if (diagnostico.updated_date) diagnosticQuery.updated_date = diagnostico.updated_date;
      const diagnosticResult = await base44.asServiceRole.entities.DiagnosticoTecnico.updateMany(
        diagnosticQuery,
        {
          $set: {
            estado: "listo_aprobacion",
            fecha_completado: now,
            bloqueado: true,
            credito_consumido_finalizacion: true
          }
        }
      );
      if (diagnosticResult?.updated !== 1) {
        const refreshed = await base44.asServiceRole.entities.DiagnosticoTecnico.filter({
          id: diagnostico.id,
          organization_id: orgId
        });
        const reconciled = refreshed?.[0];
        if (!(reconciled?.bloqueado === true && reconciled?.credito_consumido_finalizacion === true)) {
          throw workflowError(
            "El diagn\xF3stico cambi\xF3 mientras se completaba.",
            "DIAGNOSTICO_TECNICO_CONCURRENT_UPDATE"
          );
        }
        diagnostico = reconciled;
      } else {
        diagnostico = {
          ...diagnostico,
          fecha_completado: now,
          bloqueado: true,
          credito_consumido_finalizacion: true
        };
      }
    }
    await renewLifecycleLock(base44, orgId, currentOT.id, lock);
    const quoteResult = await ensureDiagnosticQuote({
      base44,
      ot: currentOT,
      diagnostico,
      orgId,
      effectiveUser
    });
    await renewLifecycleLock(base44, orgId, currentOT.id, lock);
    const eventResult = await ensureDiagnosticEvent({
      base44,
      ot: currentOT,
      orgId,
      effectiveUser,
      now
    });
    let updatedOT = currentOT;
    let idempotent = currentOT.estado === "DIAGNOSTICADA";
    if (currentOT.estado === "EN_REVISION") {
      await renewLifecycleLock(base44, orgId, currentOT.id, lock);
      const otUpdate = {
        estado: "DIAGNOSTICADA",
        ultima_actividad: "Diagn\xF3stico t\xE9cnico completado",
        ultima_actividad_at: now,
        fecha_diagnostico: now
      };
      const otResult = await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
        id: currentOT.id,
        organization_id: orgId,
        estado: "EN_REVISION",
        lifecycle_lock_token: lock.token
      }, { $set: otUpdate });
      if (otResult?.updated !== 1) {
        const reconciledOT = await loadWorkOrder(base44, orgId, currentOT.id);
        if (reconciledOT?.estado !== "DIAGNOSTICADA") {
          throw workflowError(
            "La OT cambi\xF3 mientras se completaba el diagn\xF3stico.",
            "ORDEN_TRABAJO_CONCURRENT_UPDATE"
          );
        }
        updatedOT = reconciledOT;
        idempotent = true;
      } else {
        updatedOT = { ...currentOT, ...otUpdate };
      }
    }
    return Response.json({
      success: true,
      idempotent,
      recovered_stale_lock: lock.recovered_stale_lock === true,
      recovered_ambiguous_lock: lock.recovered_ambiguous_lock === true,
      code: "DIAGNOSTICO_COMPLETADO",
      orden_trabajo_id: currentOT.id,
      previous_status: currentOT.estado,
      new_status: "DIAGNOSTICADA",
      updated_at: now,
      updated_by: effectiveUser.email,
      updated_by_role: effectiveRole,
      orden_trabajo: projectWorkOrderMutationResult(updatedOT),
      diagnostico,
      actividad,
      documento: documentoEmitido,
      cotizacion: quoteResult.quote,
      quote_idempotent: quoteResult.idempotent,
      event_id: eventResult.event.id,
      event_idempotent: eventResult.idempotent
    });
  } catch (error) {
    console.error(`[transitionWorkOrderStatus] Finalizaci\xF3n recuperable fall\xF3 \u2014 OT: ${ot.id}: ${error.message}`);
    return Response.json({
      error: error.message,
      code: error.code || "DIAGNOSTICO_COMPLETION_FAILED",
      retryable: error.status === 409 || !error.status || error.status >= 500
    }, { status: error.status || 500 });
  } finally {
    try {
      await releaseLifecycleLock(base44, orgId, ot.id, lock);
    } catch (releaseError) {
      console.error(`[transitionWorkOrderStatus] Error liberando lock \u2014 OT: ${ot.id}: ${releaseError.message}`);
    }
  }
}
async function loadPublicDecisionContext(base44, token) {
  const quotes = await base44.asServiceRole.entities.Cotizacion.filter({
    public_access_token: token
  }, "-created_date", 2);
  if (quotes?.length > 1) throw workflowError("El enlace comercial es ambiguo.", "PUBLIC_QUOTE_TOKEN_AMBIGUOUS", 409);
  let quote = quotes?.[0] || null;
  let ot = null;
  if (quote?.orden_trabajo_id) {
    ot = await loadWorkOrder(base44, quote.organization_id, quote.orden_trabajo_id);
  }
  if (!quote) throw workflowError("No existe una cotizacion asociada para registrar la decision", "PUBLIC_QUOTE_NOT_FOUND", 422);
  const tokenValidation = validatePublicTokenRecord(quote, {
    token,
    purpose: "QUOTE_DECISION",
    resourceId: quote.id,
    version: quote.version || "v1",
    allowConsumed: true
  });
  if (!tokenValidation.ok) throw workflowError("Enlace no valido", tokenValidation.code, 404);
  if (quote.orden_trabajo_id && (!ot || ot.organization_id !== quote.organization_id)) {
    throw workflowError("La OT asociada no es valida", "PUBLIC_QUOTE_WORK_ORDER_INVALID", 409);
  }
  const organizations = await base44.asServiceRole.entities.Organization.filter({ id: quote.organization_id }, "-created_date", 2);
  if (organizations?.length !== 1) throw workflowError("La organizacion asociada no es valida", "PUBLIC_QUOTE_ORGANIZATION_INVALID", 409);
  return { quote, ot, organization: organizations[0] };
}
function validatePublicDecisionExpiry(quote, ot) {
  const expires = quote.public_access_expires_at || ot?.public_access_expires_at || null;
  if (expires) {
    const expiresAt = Date.parse(expires);
    if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
      throw workflowError("El enlace ha expirado", "PUBLIC_QUOTE_TOKEN_EXPIRED", 410);
    }
  }
  if (quote.valida_hasta) {
    const validUntil = Date.parse(`${quote.valida_hasta}T23:59:59.999Z`);
    if (Number.isFinite(validUntil) && validUntil < Date.now()) {
      throw workflowError("La cotizacion ha vencido", "PUBLIC_QUOTE_EXPIRED", 410);
    }
  }
}
function buildApprovedQuoteSnapshot(quote) {
  let calculated;
  try {
    calculated = calculateCommercialTotals(quote.items || []);
    assertPersistedTotalsMatch(quote, calculated, "Cotizacion");
  } catch (error) {
    throw workflowError(error.message, error.code || "PUBLIC_QUOTE_INTEGRITY_INVALID", 422);
  }
  return {
    items: calculated.items,
    subtotal: calculated.subtotal,
    descuento_total: calculated.descuento_total,
    impuesto: calculated.impuesto,
    total: calculated.total,
    version: quote.version || null
  };
}
async function claimPublicQuoteDecision(base44, quote, targetStatus, operationKey, now) {
  const targetQuoteStatus = targetStatus === "APROBADA" ? "aprobada" : "rechazada";
  if (quoteDecisionIsCommitted(quote, targetStatus)) return { quote, committed: true };
  if (["aprobada", "rechazada"].includes(quote.estado) && quote.estado !== targetQuoteStatus) {
    throw workflowError("La cotizacion ya tiene una decision diferente", "PUBLIC_QUOTE_DECISION_CONFLICT", 409);
  }
  if (quote.decision_status === "PENDING") {
    if (quote.decision_operation_key !== operationKey || quote.decision_target_status !== targetStatus) {
      throw workflowError("Otra decision comercial esta en progreso", "PUBLIC_QUOTE_DECISION_CONFLICT", 409);
    }
    return { quote, recovered: true };
  }
  if (!["enviada", targetQuoteStatus].includes(quote.estado)) {
    throw workflowError("La cotizacion aun no ha sido enviada al cliente", "PUBLIC_QUOTE_NOT_SENT", 422);
  }
  const claimed = await base44.asServiceRole.entities.Cotizacion.updateMany({
    id: quote.id,
    organization_id: quote.organization_id,
    estado: quote.estado,
    $or: [
      { decision_status: { $exists: false } },
      { decision_status: null },
      { decision_status: "FAILED" }
    ]
  }, { $set: {
    decision_status: "PENDING",
    decision_target_status: targetStatus,
    decision_operation_key: operationKey,
    decision_started_at: now,
    decision_error: null
  } });
  const reloaded = (await base44.asServiceRole.entities.Cotizacion.filter({
    id: quote.id,
    organization_id: quote.organization_id
  }, "-created_date", 1))?.[0] || null;
  if (claimed?.updated !== 1 && !quoteDecisionIsCommitted(reloaded, targetStatus) && !(reloaded?.decision_status === "PENDING" && reloaded?.decision_operation_key === operationKey)) {
    throw workflowError("La cotizacion cambio durante la decision", "PUBLIC_QUOTE_DECISION_CONFLICT", 409);
  }
  return { quote: reloaded || quote, committed: quoteDecisionIsCommitted(reloaded, targetStatus) };
}
async function ensureDiagnosticDecisionEvidence(base44, quote, targetStatus, now, options = {}) {
  if (!quote.diagnostico_tecnico_id) return null;
  const desiredStatus = targetStatus === "APROBADA" ? "APROBADA" : "RECHAZADA";
  if (desiredStatus === "RECHAZADA" && options.recordRejection !== true) return null;
  const documents = await base44.asServiceRole.entities.DiagnosticoDocumento.filter({
    organization_id: quote.organization_id,
    diagnostico_id: quote.diagnostico_tecnico_id,
    estado: { $in: ["EMITIDO", "ENVIADO"] }
  }, "-created_date", 5);
  const document = documents?.[0] || null;
  if (!document) throw workflowError("No existe un documento de diagnostico vigente para registrar la decision", "PUBLIC_QUOTE_DIAGNOSTIC_DOCUMENT_REQUIRED", 422);
  if (document.aprobacion_status === desiredStatus) return document;
  if (["APROBADA", "RECHAZADA"].includes(document.aprobacion_status)) {
    throw workflowError("El documento ya contiene una decision diferente", "QUOTE_DIAGNOSTIC_DECISION_CONFLICT", 409);
  }
  await base44.asServiceRole.entities.DiagnosticoDocumento.update(document.id, {
    aprobacion_status: desiredStatus,
    aprobacion_at: now,
    metodo_aprobacion: options.method || "PORTAL_DIGITAL",
    aprobacion_canal: options.channel || "PORTAL"
  });
  const reconciled = (await base44.asServiceRole.entities.DiagnosticoDocumento.filter({
    id: document.id,
    organization_id: quote.organization_id
  }, "-created_date", 1))?.[0];
  if (reconciled?.aprobacion_status !== desiredStatus) {
    throw workflowError("No se pudo confirmar la evidencia de la decision", "PUBLIC_QUOTE_EVIDENCE_NOT_COMMITTED", 500);
  }
  return reconciled;
}
async function ensurePublicDecisionWorkOrder(base44, quote, ot, targetStatus, rejectionReason, now, lock, activitySource = "desde el portal") {
  if (!ot) return { ot: null, transitioned: false, previousStatus: null };
  const approved = targetStatus === "APROBADA";
  const allowedFrom = approved ? ["DIAGNOSTICADA", "COTIZADA"] : ["DIAGNOSTICADA", "COTIZADA", "APROBADA"];
  const current = await loadWorkOrder(base44, ot.organization_id, ot.id);
  if (!current || current.lifecycle_lock_token !== lock.token) {
    throw workflowError("No se conserva el lock de la OT", "LIFECYCLE_LOCK_LOST", 409);
  }
  if (current.estado === targetStatus) return { ot: current, transitioned: false, previousStatus: current.estado };
  if (!allowedFrom.includes(current.estado)) {
    throw workflowError(`La orden ya no admite esta decision (${current.estado})`, "PUBLIC_QUOTE_WORK_ORDER_STATE_CONFLICT", 409);
  }
  const previousStatus = current.estado;
  const result = await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
    id: current.id,
    organization_id: current.organization_id,
    estado: current.estado,
    lifecycle_lock_token: lock.token
  }, { $set: {
    estado: targetStatus,
    cliente_aprobado: approved,
    cliente_aprobado_at: approved ? now : null,
    cliente_rechazo_motivo: approved ? null : rejectionReason || null,
    ultima_actividad: approved ? `Cotizacion aprobada por el cliente ${activitySource}` : `Cotizacion rechazada por el cliente ${activitySource}`,
    ultima_actividad_at: now
  } });
  const reconciled = await loadWorkOrder(base44, current.organization_id, current.id);
  if (result?.updated !== 1 && reconciled?.estado !== targetStatus) {
    throw workflowError("La OT cambio durante la decision", "PUBLIC_QUOTE_WORK_ORDER_CONFLICT", 409);
  }
  return { ot: reconciled, transitioned: true, previousStatus };
}
async function ensurePublicDecisionEvent(base44, quote, ot, targetStatus, operationKey, now, actorUserId = null) {
  if (!ot) return null;
  const eventType = targetStatus === "APROBADA" ? "TRANSITION_APROBADA" : "CANCELADA";
  const existing = await base44.asServiceRole.entities.OTEvent.filter({
    organization_id: ot.organization_id,
    orden_trabajo_id: ot.id,
    tipo: eventType,
    detalle: operationKey
  }, "-created_date", 2);
  if (existing?.[0]) return existing[0];
  try {
    return await base44.asServiceRole.entities.OTEvent.create({
      organization_id: ot.organization_id,
      orden_trabajo_id: ot.id,
      tipo: eventType,
      detalle: operationKey,
      created_by_user_id: actorUserId,
      processed: false,
      created_at: now
    });
  } catch (error) {
    const reconciled = await base44.asServiceRole.entities.OTEvent.filter({
      organization_id: ot.organization_id,
      orden_trabajo_id: ot.id,
      tipo: eventType,
      detalle: operationKey
    }, "-created_date", 2);
    if (reconciled?.[0]) return reconciled[0];
    throw error;
  }
}
async function commitPublicQuoteDecision(base44, quote, targetStatus, operationKey, snapshot, rejectionReason, ip, now, consumePublicToken = true) {
  const targetQuoteStatus = targetStatus === "APROBADA" ? "aprobada" : "rechazada";
  const approved = targetStatus === "APROBADA";
  const reload = async () => (await base44.asServiceRole.entities.Cotizacion.filter({
    id: quote.id,
    organization_id: quote.organization_id
  }, "-created_date", 1))?.[0];
  let result;
  try {
    result = await base44.asServiceRole.entities.Cotizacion.updateMany({
      id: quote.id,
      organization_id: quote.organization_id,
      decision_status: "PENDING",
      decision_operation_key: operationKey,
      decision_target_status: targetStatus
    }, { $set: {
      estado: targetQuoteStatus,
      decision_status: "COMMITTED",
      decision_committed_at: now,
      ...consumePublicToken ? { public_access_consumed_at: now } : {},
      decision_error: null,
      ...approved ? {
        aprobada_at: now,
        contenido_aprobado_snapshot: snapshot,
        ip_aprobacion: ip,
        cliente_rechazo_motivo: null
      } : {
        cliente_rechazo_motivo: rejectionReason || null
      }
    } });
  } catch (error) {
    const reconciled = await reload();
    if (quoteDecisionIsCommitted(reconciled, targetStatus)) return reconciled;
    throw error;
  }
  const reloaded = await reload();
  if (result?.updated !== 1 && !quoteDecisionIsCommitted(reloaded, targetStatus)) {
    throw workflowError("No se pudo confirmar la decision comercial", "PUBLIC_QUOTE_COMMIT_FAILED", 500);
  }
  return reloaded;
}
function lifecycleInventoryLockAdapter(base44, ot, lock) {
  return {
    async acquire() {
      return { work_order_id: ot.id, token: lock.token };
    },
    async assertOwned() {
      const current = await loadWorkOrder(base44, ot.organization_id, ot.id);
      if (current?.lifecycle_lock_token !== lock.token) {
        throw workflowError("Se perdio el lock antes de mutar inventario", "LIFECYCLE_LOCK_LOST", 409);
      }
      return true;
    },
    async release() {
      return true;
    }
  };
}
async function reserveApprovedQuoteInventory(base44, quote, ot, snapshot, operationKey, lock, actor = { id: "portal_cliente", principalClass: "CUSTOMER_TOKEN" }) {
  if (!ot) return null;
  const grouped = /* @__PURE__ */ new Map();
  for (const [index, item] of snapshot.items.entries()) {
    if (!["producto", "repuesto"].includes(item.tipo)) continue;
    if (item.referencia_id && item.item_id && item.referencia_id !== item.item_id) {
      throw workflowError(`Item ${index + 1}: referencias de inventario en conflicto`, "INVENTORY_REFERENCE_CONFLICT", 409);
    }
    const inventoryId = item.referencia_id || item.item_id || null;
    if (!inventoryId) {
      throw workflowError(`Item ${index + 1}: referencia de inventario requerida`, "INVENTORY_REFERENCE_REQUIRED", 409);
    }
    const quantity = Number(item.cantidad);
    const current = grouped.get(inventoryId) || 0;
    grouped.set(inventoryId, current + quantity);
  }
  if (grouped.size === 0) return null;
  const commandKey = `quote-reserve:${quote.id}:${operationKey}`;
  return executeInventoryCommand(base44, {
    organizationId: ot.organization_id,
    branchId: ot.branch_id,
    actorId: actor.id,
    principalClass: actor.principalClass,
    operationKey: commandKey,
    referenceType: "QUOTE_APPROVAL",
    referenceId: quote.id,
    reason: `Reserva por aprobacion de cotizacion ${quote.id}`,
    movements: [...grouped.entries()].map(([inventoryId, quantity]) => ({
      inventoryId,
      movementType: "RESERVE",
      quantity,
      workOrderId: ot.id,
      quoteId: quote.id
    }))
  }, lifecycleInventoryLockAdapter(base44, ot, lock));
}
async function releaseReservationResults(base44, quote, ot, reserveResult, operationKey, lock, actorId = "portal_cliente") {
  if (!reserveResult?.operation_key) return;
  await reverseInventoryCommand(base44, {
    organizationId: ot.organization_id,
    branchId: ot.branch_id,
    actorId,
    operationKey: reserveResult.operation_key,
    reversalOperationKey: `${reserveResult.operation_key}:automatic-reversal:approval-compensation`,
    reason: `Compensacion de aprobacion fallida ${quote.id}:${operationKey}`
  }, lifecycleInventoryLockAdapter(base44, ot, lock));
}
async function releaseCancelledWorkOrderReservations(base44, ot, actorId) {
  const reservations = await base44.asServiceRole.entities.InventarioReserva.filter({
    organization_id: ot.organization_id,
    branch_id: ot.branch_id,
    work_order_id: ot.id,
    state: "RESERVED"
  }, "created_date", 500);
  for (const reservation of reservations || []) {
    await executeInventoryCommand(base44, {
      organizationId: ot.organization_id,
      branchId: ot.branch_id,
      actorId,
      operationKey: `ot-cancel-release:${ot.id}:${reservation.id}`,
      referenceType: "WORK_ORDER_CANCELLATION",
      referenceId: ot.id,
      reason: `Liberacion por cancelacion de OT ${ot.id}`,
      movements: [{
        inventoryId: reservation.inventario_id || reservation.inventory_id,
        movementType: "RELEASE",
        quantity: Number(reservation.quantity),
        reservationId: reservation.id,
        workOrderId: ot.id,
        quoteId: reservation.quote_id || null
      }]
    });
  }
}
async function handlePublicCustomerDecisionV2({ base44, body, req }) {
  const token = body.customer_token;
  const targetStatus = body.newStatus;
  const rejectionReason = typeof body.rejection_reason === "string" ? body.rejection_reason.trim().slice(0, 500) : "";
  if (typeof token !== "string" || token.length < 16 || token.length > 256) {
    return Response.json({ error: "Enlace no valido" }, { status: 404 });
  }
  if (!["APROBADA", "CANCELADA"].includes(targetStatus)) {
    return Response.json({ error: "Decision no valida" }, { status: 400 });
  }
  let quote = null;
  let ot = null;
  let lock = null;
  let operationKey = null;
  let reserveResult = null;
  try {
    let organization;
    ({ quote, ot, organization } = await loadPublicDecisionContext(base44, token));
    if (inspectControlledPilotConfiguration(organization).enabled) {
      throw workflowError("La decision publica esta deshabilitada durante el piloto controlado", "CONTROLLED_PILOT_PUBLIC_DECISION_DISABLED", 409);
    }
    validatePublicDecisionExpiry(quote, ot);
    operationKey = quoteDecisionOperationKey(quote.id, targetStatus);
    const targetQuoteStatus = targetStatus === "APROBADA" ? "aprobada" : "rechazada";
    const customerAuthorization = {
      ok: true,
      principalClass: "CUSTOMER_TOKEN",
      organizationId: quote.organization_id,
      branchId: quote.branch_id || ot?.branch_id || null,
      role: null,
      persistedRole: null,
      capabilities: []
    };
    const policyDecision = await evaluateCommandPolicyWithShadow({
      base44,
      policyId: "CP-QUOTE-002",
      authorization: customerAuthorization,
      relationship: "CUSTOMER_TOKEN_RESOURCE",
      authorityContract: "QUOTE_DECISION",
      compatibilityDecision: { ok: true, code: "LEGACY_PUBLIC_TOKEN_ALLOW" },
      audit: {
        actorUserId: null,
        branchId: customerAuthorization.branchId,
        resourceType: "Cotizacion",
        resourceId: quote.id,
        correlationId: operationKey,
        operationKey
      }
    });
    return await ExecuteSovereignCommand({
      decision: policyDecision,
      sovereignWriter: "handlePublicCustomerDecisionV2",
      execute: async () => {
        if (["aprobada", "rechazada"].includes(quote.estado) && quote.estado !== targetQuoteStatus) {
          throw workflowError("La cotizacion ya tiene una decision diferente", "PUBLIC_QUOTE_DECISION_CONFLICT", 409);
        }
        const snapshot = targetStatus === "APROBADA" ? buildApprovedQuoteSnapshot(quote) : null;
        if (ot) {
          lock = await acquireLifecycleLock({
            base44,
            ot,
            orgId: ot.organization_id,
            effectiveUser: { id: "portal_cliente" },
            operation: `customerDecision:${quote.id}`
          });
          if (!lock.acquired) {
            return Response.json({
              error: "Otra operacion del lifecycle esta en progreso",
              code: lock.code,
              retryable: true
            }, { status: 409 });
          }
          quote = (await base44.asServiceRole.entities.Cotizacion.filter({
            id: quote.id,
            organization_id: quote.organization_id
          }, "-created_date", 1))?.[0] || quote;
        }
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const claim = await claimPublicQuoteDecision(base44, quote, targetStatus, operationKey, now);
        quote = claim.quote;
        if (targetStatus === "APROBADA") await ensureDiagnosticDecisionEvidence(base44, quote, targetStatus, now);
        if (targetStatus === "APROBADA") {
          reserveResult = await reserveApprovedQuoteInventory(base44, quote, ot, snapshot, operationKey, lock);
        }
        const otResult = await ensurePublicDecisionWorkOrder(base44, quote, ot, targetStatus, rejectionReason, now, lock);
        await ensurePublicDecisionEvent(base44, quote, otResult.ot, targetStatus, operationKey, now);
        const committedQuote = await commitPublicQuoteDecision(
          base44,
          quote,
          targetStatus,
          operationKey,
          snapshot,
          rejectionReason,
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
          now
        );
        await appendAuditEvent(base44, {
          eventType: "PUBLIC_QUOTE_DECISION_COMMITTED",
          principalClass: "CUSTOMER_TOKEN",
          actorUserId: null,
          actorPrimaryRole: null,
          effectiveTechnicianUserId: null,
          organizationId: quote.organization_id,
          branchId: quote.branch_id || otResult.ot?.branch_id || null,
          resourceType: "Cotizacion",
          resourceId: quote.id,
          commandPolicyId: "CP-QUOTE-002",
          correlationId: operationKey,
          auditOperationId: `public-quote-decision:${quote.id}`,
          operationKey,
          operationSemantics: { quote_status: targetQuoteStatus, work_order_status: targetStatus },
          outcome: claim.committed || claim.recovered ? "IDEMPOTENT_REPLAY" : "COMMITTED",
          priorState: { quote_status: claim.quote?.estado || quote.estado, work_order_status: otResult.previousStatus },
          newState: { quote_status: targetQuoteStatus, work_order_status: targetStatus },
          metadata: {
            authority_contract: "QUOTE_DECISION",
            token_reference: await publicTokenReference(token),
            token_version: quote.public_access_version,
            decision: targetStatus
          },
          occurredAt: now
        });
        return Response.json({
          success: true,
          idempotent: Boolean(claim.committed || claim.recovered || !otResult.transitioned),
          quote_id: committedQuote?.id || quote.id,
          quote_status: targetQuoteStatus,
          orden_trabajo_id: otResult.ot?.id || null,
          previous_status: otResult.previousStatus,
          new_status: targetStatus,
          transitioned: otResult.transitioned,
          decision_status: "COMMITTED"
        });
      }
    });
  } catch (error) {
    if (reserveResult && quote && ot && lock?.acquired) {
      const committed = (await base44.asServiceRole.entities.Cotizacion.filter({
        id: quote.id,
        organization_id: quote.organization_id
      }, "-created_date", 1))?.[0];
      const currentOt = await loadWorkOrder(base44, ot.organization_id, ot.id);
      if (!quoteDecisionIsCommitted(committed, "APROBADA") && currentOt?.estado !== "APROBADA") {
        await releaseReservationResults(base44, quote, ot, reserveResult, operationKey, lock).catch((compensationError) => {
          console.error("[publicQuoteDecision] inventory compensation failed", compensationError.message);
        });
      }
    }
    if (quote?.id && operationKey) {
      await base44.asServiceRole.entities.Cotizacion.updateMany({
        id: quote.id,
        organization_id: quote.organization_id,
        decision_status: "PENDING",
        decision_operation_key: operationKey
      }, { $set: { decision_error: String(error.message || error).slice(0, 500) } }).catch(() => null);
    }
    return Response.json({
      error: error.message || "No se pudo registrar la decision comercial",
      code: error.code || "PUBLIC_QUOTE_DECISION_FAILED",
      retryable: error.status >= 500 || !error.status,
      decision_pending: Boolean(quote?.decision_status === "PENDING" || operationKey)
    }, { status: error.status || 500 });
  } finally {
    if (ot && lock?.acquired) {
      try {
        await releaseLifecycleLock(base44, ot.organization_id, ot.id, lock);
      } catch (error) {
        console.error("[publicQuoteDecision] lock release failed", error.message);
      }
    }
  }
}
async function handleOperatorRecordedCustomerDecision({ base44, body, authorization, user }) {
  if (authorization.pilotMode !== true) {
    return Response.json({
      error: "Este comando solo esta habilitado dentro del piloto controlado",
      code: "CONTROLLED_PILOT_OPERATOR_DECISION_REQUIRED"
    }, { status: 403 });
  }
  const quoteId = typeof body.quote_id === "string" ? body.quote_id.trim() : "";
  const expectedVersion = typeof body.expected_quote_version === "string" ? body.expected_quote_version.trim() : "";
  const targetStatus = body.newStatus;
  const method = ["VERBAL", "WHATSAPP_CONFIRM", "FIRMA_FISICA"].includes(body.decision_method) ? body.decision_method : null;
  const channel = typeof body.decision_channel === "string" ? body.decision_channel.trim().slice(0, 120) : "";
  const rejectionReason = typeof body.rejection_reason === "string" ? body.rejection_reason.trim().slice(0, 500) : "";
  if (!quoteId || !expectedVersion || !["APROBADA", "CANCELADA"].includes(targetStatus) || !method || !channel) {
    return Response.json({
      error: "quote_id, expected_quote_version, newStatus, decision_method y decision_channel son requeridos",
      code: "OPERATOR_CUSTOMER_DECISION_INVALID"
    }, { status: 400 });
  }
  let quote = null;
  let ot = null;
  let lock = null;
  let reserveResult = null;
  const operationKey = quoteDecisionOperationKey(quoteId, targetStatus);
  try {
    const quotes = await base44.asServiceRole.entities.Cotizacion.filter({
      id: quoteId,
      organization_id: authorization.organizationId
    }, "-created_date", 2);
    if (quotes?.length !== 1) throw workflowError("Cotizacion no encontrada", "OPERATOR_QUOTE_NOT_FOUND", 404);
    quote = quotes[0];
    const canonicalVersion = String(quote.version || "v1");
    if (expectedVersion !== canonicalVersion) {
      throw workflowError("La cotizacion cambio; recargue antes de registrar la decision", "OPERATOR_QUOTE_VERSION_CONFLICT", 409);
    }
    if (!quote.orden_trabajo_id) throw workflowError("La cotizacion no esta asociada a una OT", "OPERATOR_QUOTE_WORK_ORDER_REQUIRED", 422);
    if (body.orden_trabajo_id && body.orden_trabajo_id !== quote.orden_trabajo_id) {
      throw workflowError("La OT solicitada no coincide con la cotizacion", "OPERATOR_QUOTE_WORK_ORDER_MISMATCH", 409);
    }
    ot = await loadWorkOrder(base44, authorization.organizationId, quote.orden_trabajo_id);
    if (!ot) throw workflowError("La OT asociada no existe", "OPERATOR_QUOTE_WORK_ORDER_INVALID", 409);
    const branchAuthorization = authorizeRecordBranch(authorization, ot.branch_id);
    if (!branchAuthorization.ok) throw workflowError(branchAuthorization.error, branchAuthorization.code, branchAuthorization.status);
    if (quote.branch_id && quote.branch_id !== ot.branch_id) {
      throw workflowError("La cotizacion y la OT no pertenecen a la misma sucursal", "OPERATOR_QUOTE_BRANCH_MISMATCH", 409);
    }
    if (quote.valida_hasta) {
      const validUntil = Date.parse(`${quote.valida_hasta}T23:59:59.999Z`);
      if (Number.isFinite(validUntil) && validUntil < Date.now()) {
        throw workflowError("La cotizacion ha vencido", "PUBLIC_QUOTE_EXPIRED", 410);
      }
    }
    const policyDecision = await evaluateCommandPolicyWithShadow({
      base44,
      policyId: "CP-QUOTE-003",
      authorization,
      relationship: "BRANCH_RESOURCE",
      compatibilityDecision: { ok: true, code: "CONTROLLED_PILOT_OPERATOR_ALLOW" },
      audit: {
        actorUserId: user.id,
        branchId: ot.branch_id,
        resourceType: "Cotizacion",
        resourceId: quote.id,
        correlationId: operationKey,
        operationKey
      }
    });
    return await ExecuteSovereignCommand({
      decision: policyDecision,
      sovereignWriter: "transitionWorkOrderStatus",
      execute: async () => {
        const targetQuoteStatus = targetStatus === "APROBADA" ? "aprobada" : "rechazada";
        if (["aprobada", "rechazada"].includes(quote.estado) && quote.estado !== targetQuoteStatus) {
          throw workflowError("La cotizacion ya tiene una decision diferente", "PUBLIC_QUOTE_DECISION_CONFLICT", 409);
        }
        const snapshot = targetStatus === "APROBADA" ? buildApprovedQuoteSnapshot(quote) : null;
        lock = await acquireLifecycleLock({
          base44,
          ot,
          orgId: authorization.organizationId,
          effectiveUser: user,
          operation: `operatorCustomerDecision:${quote.id}`
        });
        if (!lock.acquired) {
          return Response.json({
            error: "Otra operacion del lifecycle esta en progreso",
            code: lock.code,
            retryable: true
          }, { status: 409 });
        }
        quote = (await base44.asServiceRole.entities.Cotizacion.filter({
          id: quote.id,
          organization_id: authorization.organizationId
        }, "-created_date", 1))?.[0] || quote;
        if (String(quote.version || "v1") !== expectedVersion) {
          throw workflowError("La cotizacion cambio durante la decision", "OPERATOR_QUOTE_VERSION_CONFLICT", 409);
        }
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const claim = await claimPublicQuoteDecision(base44, quote, targetStatus, operationKey, now);
        quote = claim.quote;
        await ensureDiagnosticDecisionEvidence(base44, quote, targetStatus, now, {
          method,
          channel,
          recordRejection: true
        });
        if (targetStatus === "APROBADA") {
          reserveResult = await reserveApprovedQuoteInventory(base44, quote, ot, snapshot, operationKey, lock, {
            id: user.id,
            principalClass: authorization.principalClass
          });
        }
        const otResult = await ensurePublicDecisionWorkOrder(
          base44,
          quote,
          ot,
          targetStatus,
          rejectionReason,
          now,
          lock,
          `segun comunicacion externa registrada por el operador (${channel})`
        );
        await ensurePublicDecisionEvent(base44, quote, otResult.ot, targetStatus, operationKey, now, user.id);
        const committedQuote = await commitPublicQuoteDecision(
          base44,
          quote,
          targetStatus,
          operationKey,
          snapshot,
          rejectionReason,
          null,
          now,
          false
        );
        await appendAuditEvent(base44, {
          eventType: "OPERATOR_RECORDED_CUSTOMER_DECISION",
          principalClass: authorization.principalClass,
          actorUserId: user.id,
          actorPrimaryRole: authorization.persistedRole,
          organizationId: authorization.organizationId,
          branchId: ot.branch_id,
          resourceType: "Cotizacion",
          resourceId: quote.id,
          commandPolicyId: "CP-QUOTE-003",
          correlationId: typeof body.correlation_id === "string" && body.correlation_id.trim() ? body.correlation_id.trim().slice(0, 240) : operationKey,
          auditOperationId: `operator-quote-decision:${quote.id}:${targetStatus}`,
          operationKey,
          operationSemantics: { quote_status: targetQuoteStatus, work_order_status: targetStatus },
          outcome: claim.committed || claim.recovered ? "IDEMPOTENT_REPLAY" : "COMMITTED",
          priorState: { quote_status: claim.quote?.estado || quote.estado, work_order_status: otResult.previousStatus },
          newState: { quote_status: targetQuoteStatus, work_order_status: targetStatus },
          metadata: {
            decision_source: "EXTERNAL_CUSTOMER_COMMUNICATION_RECORDED_BY_OPERATOR",
            decision_method: method,
            decision_channel: channel,
            customer_token_used: false
          },
          occurredAt: now
        });
        return Response.json({
          success: true,
          idempotent: Boolean(claim.committed || claim.recovered || !otResult.transitioned),
          recorded_by_operator_user_id: user.id,
          quote_id: committedQuote?.id || quote.id,
          quote_status: targetQuoteStatus,
          orden_trabajo_id: otResult.ot?.id || ot.id,
          previous_status: otResult.previousStatus,
          new_status: targetStatus,
          transitioned: otResult.transitioned,
          decision_status: "COMMITTED"
        });
      }
    });
  } catch (error) {
    if (reserveResult && quote && ot && lock?.acquired) {
      const committed = (await base44.asServiceRole.entities.Cotizacion.filter({
        id: quote.id,
        organization_id: authorization.organizationId
      }, "-created_date", 1))?.[0];
      const currentOt = await loadWorkOrder(base44, authorization.organizationId, ot.id);
      if (!quoteDecisionIsCommitted(committed, "APROBADA") && currentOt?.estado !== "APROBADA") {
        await releaseReservationResults(base44, quote, ot, reserveResult, operationKey, lock, user.id).catch((compensationError) => {
          console.error("[operatorCustomerDecision] inventory compensation failed", compensationError.message);
        });
      }
    }
    if (quote?.id) {
      await base44.asServiceRole.entities.Cotizacion.updateMany({
        id: quote.id,
        organization_id: authorization.organizationId,
        decision_status: "PENDING",
        decision_operation_key: operationKey
      }, { $set: { decision_error: String(error.message || error).slice(0, 500) } }).catch(() => null);
    }
    return Response.json({
      error: error.message || "No se pudo registrar la decision del cliente",
      code: error.code || "OPERATOR_CUSTOMER_DECISION_FAILED",
      retryable: error.status >= 500 || !error.status,
      decision_pending: Boolean(quote?.decision_status === "PENDING")
    }, { status: error.status || 500 });
  } finally {
    if (ot && lock?.acquired) {
      try {
        await releaseLifecycleLock(base44, authorization.organizationId, ot.id, lock);
      } catch (error) {
        console.error("[operatorCustomerDecision] lock release failed", error.message);
      }
    }
  }
}
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Body invalido" }, { status: 400 });
    }
    const runtimeUser = await base44.auth.me();
    if (!runtimeUser && body.customer_token) {
      return handlePublicCustomerDecisionV2({ base44, body, req });
    }
    if (!runtimeUser) {
      return Response.json({ error: "No autenticado" }, { status: 401 });
    }
    const {
      orden_trabajo_id,
      newStatus,
      observacion,
      tecnico_asignado_id,
      tecnico_asignado_email,
      diagnostico_id,
      _lifecycle_lock_token,
      correlation_id
    } = body;
    const authorization = await resolveAuthorizedContext(base44, runtimeUser);
    if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status });
    const effectiveUser = runtimeUser;
    const orgId = authorization.organizationId;
    const effectiveRole = authorization.role;
    const isSuperAdmin = authorization.isSuperAdmin;
    if (body.action === "RECORD_CUSTOMER_DECISION") {
      return handleOperatorRecordedCustomerDecision({ base44, body, authorization, user: runtimeUser });
    }
    if (!orden_trabajo_id) {
      return Response.json({ error: "orden_trabajo_id es obligatorio" }, { status: 400 });
    }
    if (!newStatus) {
      return Response.json({ error: "newStatus es obligatorio" }, { status: 400 });
    }
    if (newStatus === "ENTREGADA") {
      return Response.json({
        error: "ENTREGADA solo puede confirmarse mediante deliverWorkOrder.",
        code: "DELIVERY_COMMAND_REQUIRED"
      }, { status: 403 });
    }
    if (!ALLOWED_TRANSITIONS.hasOwnProperty(newStatus)) {
      return Response.json({
        error: `Estado destino inv\xE1lido: "${newStatus}". Estados v\xE1lidos: ${Object.keys(ALLOWED_TRANSITIONS).join(", ")}`
      }, { status: 400 });
    }
    const ordenes = await base44.asServiceRole.entities.OrdenTrabajo.filter({
      id: orden_trabajo_id,
      organization_id: orgId
    }, 1);
    if (!ordenes || ordenes.length === 0) {
      return Response.json({ error: "Orden de trabajo no encontrada en esta organizaci\xF3n" }, { status: 404 });
    }
    const ot = ordenes[0];
    const branchAuthorization = authorizeRecordBranch(authorization, ot.branch_id);
    if (!branchAuthorization.ok) {
      return Response.json({ error: branchAuthorization.error, code: branchAuthorization.code }, { status: branchAuthorization.status });
    }
    const currentStatus = ot.estado;
    if (currentStatus === "CANCELADA" && newStatus === "CANCELADA" && !hasWorkOrderTargetAuthority({ targetStatus: newStatus, role: effectiveRole, isSuperAdmin })) {
      return Response.json({
        error: "Solo administracion puede recuperar una cancelacion idempotente",
        code: "CANCELLATION_AUTHORITY_REQUIRED"
      }, { status: 403 });
    }
    if (newStatus === "CANCELADA" && effectiveRole === "TECHNICIAN" && runtimeUser.id !== ot.tecnico_asignado_id) {
      return Response.json({
        error: "No autorizado: esta Orden de Trabajo est\xE1 asignada a otro t\xE9cnico.",
        code: "TECHNICIAN_OWNERSHIP_REQUIRED"
      }, { status: 403 });
    }
    if (newStatus === "DIAGNOSTICADA") {
      const diagnosticCorrelationId = typeof correlation_id === "string" && correlation_id.trim() ? correlation_id.trim().slice(0, 240) : `transition-shadow:${ot.id}:${currentStatus}:DIAGNOSTICADA:${runtimeUser.id}`;
      const policyDecision = await evaluateStaffTransitionPipeline({
        base44,
        authorization,
        user: runtimeUser,
        ot,
        currentStatus,
        newStatus,
        correlationId: diagnosticCorrelationId
      });
      return await ExecuteSovereignCommand({
        decision: policyDecision,
        sovereignWriter: "transitionWorkOrderStatus",
        execute: () => completeDiagnosticWorkflow({
          base44,
          ot,
          orgId,
          effectiveUser,
          effectiveRole,
          diagnosticoId: diagnostico_id
        })
      });
    }
    if (currentStatus === newStatus) {
      const externalCorrelationId2 = typeof correlation_id === "string" && correlation_id.trim() ? correlation_id.trim().slice(0, 240) : null;
      const auditFacts = lifecycleAuditRecoveryFacts(ot, {
        operationId: crypto.randomUUID(),
        externalCorrelationId: externalCorrelationId2,
        previousStatus: currentStatus,
        newStatus,
        actorUserId: effectiveUser.id,
        actorRole: authorization.persistedRole,
        committedAt: ot.updated_date || (/* @__PURE__ */ new Date()).toISOString()
      });
      const recoverTransition = async () => {
        try {
          await ensureLifecycleAudit(base44, {
            authorization,
            user: effectiveUser,
            ot,
            ...auditFacts
          });
          await clearLifecycleAuditPending(base44, {
            organizationId: orgId,
            workOrderId: ot.id,
            status: newStatus,
            operationId: auditFacts.operationId
          });
        } catch (error) {
          await recordLifecycleAuditFailure(base44, {
            organizationId: orgId,
            workOrderId: ot.id,
            status: newStatus,
            operationId: auditFacts.operationId,
            error
          });
          return Response.json({ error: "La transicion existe pero su auditoria requerida esta pendiente", code: "LIFECYCLE_AUDIT_PENDING", retryable: true }, { status: 500 });
        }
        return Response.json({
          success: true,
          idempotent: true,
          transition_recovered: true,
          orden_trabajo_id,
          previous_status: auditFacts.previousStatus,
          new_status: auditFacts.newStatus,
          updated_by: effectiveUser.email,
          updated_by_role: effectiveRole,
          orden_trabajo: projectWorkOrderMutationResult(ot)
        });
      };
      if (newStatus === "CANCELADA") return recoverTransition();
      const policyDecision = await evaluateStaffTransitionPipeline({
        base44,
        authorization,
        user: runtimeUser,
        ot,
        currentStatus,
        newStatus,
        correlationId: auditFacts.externalCorrelationId || auditFacts.operationId
      });
      return await ExecuteSovereignCommand({
        decision: policyDecision,
        sovereignWriter: "transitionWorkOrderStatus",
        execute: recoverTransition
      });
    }
    if (IRREVERSIBLE_STATES.includes(currentStatus)) {
      return Response.json({
        error: `La OT est\xE1 en estado "${currentStatus}" y no puede ser modificada. Este estado es irreversible.`,
        current_status: currentStatus
      }, { status: 422 });
    }
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      return Response.json({
        error: `Transici\xF3n no permitida: "${currentStatus}" \u2192 "${newStatus}". Transiciones v\xE1lidas desde "${currentStatus}": [${allowed.join(", ") || "ninguna"}]`,
        current_status: currentStatus,
        target_status: newStatus,
        allowed_targets: allowed
      }, { status: 422 });
    }
    const pipelineCorrelationId = typeof correlation_id === "string" && correlation_id.trim() ? correlation_id.trim().slice(0, 240) : `transition-shadow:${ot.id}:${currentStatus}:${newStatus}:${runtimeUser.id}`;
    const staffPolicyDecision = newStatus === "CANCELADA" ? null : await evaluateStaffTransitionPipeline({
      base44,
      authorization,
      user: runtimeUser,
      ot,
      currentStatus,
      newStatus,
      correlationId: pipelineCorrelationId
    });
    if (newStatus !== "CANCELADA") {
      const transitionPolicy = OT_TRANSITION_POLICIES[`${currentStatus}->${newStatus}`];
      if (!transitionPolicy) {
        return Response.json({ error: "La transicion no tiene una politica de comando congelada", code: "TRANSITION_POLICY_UNMAPPED" }, { status: 403 });
      }
      const requiredCapabilities = transitionPolicy.capability?.allOf || [];
      if (!requiredCapabilities.every((capability) => authorization.capabilities.includes(capability))) {
        return Response.json({ error: "La capacidad efectiva no autoriza esta transicion", code: "TRANSITION_CAPABILITY_DENIED" }, { status: 403 });
      }
      if (transitionPolicy.relationship === "EFFECTIVE_TECHNICIAN" && runtimeUser.id !== ot.tecnico_asignado_id) {
        return Response.json({ error: "Debes asumir la custodia tecnica antes de ejecutar esta transicion", code: "EFFECTIVE_TECHNICIAN_REQUIRED" }, { status: 403 });
      }
    }
    if (!hasWorkOrderTargetAuthority({ targetStatus: newStatus, role: effectiveRole, isSuperAdmin })) {
      const rolesPermitidos = workOrderTargetRoles(newStatus);
      console.error(`[DIAG:transition] *** 403: rol '${effectiveRole}' no permitido para '${newStatus}' \u2014 rolesPermitidos: [${rolesPermitidos.join(", ")}] ***`);
      return Response.json({
        error: `Tu rol "${effectiveRole}" no tiene permiso para mover la OT a "${newStatus}". Roles permitidos: [${rolesPermitidos.join(", ")}]`,
        required_roles: rolesPermitidos,
        user_role: effectiveRole
      }, { status: 403 });
    }
    const extra = { tecnico_asignado_id, tecnico_asignado_email };
    if (newStatus === "EN_REPARACION") {
      const diagActivos = await base44.asServiceRole.entities.DiagnosticoTecnico.filter({
        orden_trabajo_id,
        bloqueado: false
      }, 1);
      const diagId = diagActivos?.[0]?.id;
      if (diagId) {
        const docs = await base44.asServiceRole.entities.DiagnosticoDocumento.filter({
          diagnostico_id: diagId
        }, 5);
        const docConAprobacion = docs?.find((d) => d.aprobacion_status === "APROBADA");
        if (!docConAprobacion) {
          return Response.json({
            error: "Se requiere la aprobaci\xF3n del cliente antes de iniciar la reparaci\xF3n. Registra la aprobaci\xF3n en el Expediente \u2192 Panel Operativo.",
            code: "EN_REPARACION_SIN_APROBACION_CLIENTE"
          }, { status: 422 });
        }
        extra._aprobacion_cliente_verificada = true;
      }
      if (newStatus === "CANCELADA") {
        await releaseCancelledWorkOrderReservations(base44, ot, effectiveUser.id || effectiveUser.email);
      }
    }
    const validationError = validatePayloadForTarget(newStatus, ot, extra);
    if (validationError) {
      return Response.json({ error: validationError }, { status: 422 });
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const updatePayload = {
      estado: newStatus,
      ultima_actividad: observacion || `Estado cambiado a ${newStatus}`,
      ultima_actividad_at: now
    };
    if (newStatus === "ASIGNADA" && tecnico_asignado_id) {
      updatePayload.tecnico_asignado_id = tecnico_asignado_id;
      if (tecnico_asignado_email) {
        updatePayload.tecnico_asignado_email = tecnico_asignado_email;
      }
    }
    if (newStatus === "EN_REVISION") {
      updatePayload.fecha_revision_inicio = updatePayload.fecha_revision_inicio || now;
    }
    if (newStatus === "FINALIZADA") {
      updatePayload.fecha_cierre = now;
    }
    if (newStatus === "PRUEBAS") {
      updatePayload.qa_cycle_id = crypto.randomUUID();
      updatePayload.qa_cycle_started_at = now;
    }
    const externalCorrelationId = typeof correlation_id === "string" && correlation_id.trim() ? correlation_id.trim().slice(0, 240) : `transition:${ot.id}:${currentStatus}:${newStatus}:${updatePayload.qa_cycle_id || ot.qa_cycle_id || "v1"}`;
    const auditOperationId = crypto.randomUUID();
    Object.assign(updatePayload, lifecycleAuditPendingMarker({
      operationId: auditOperationId,
      externalCorrelationId,
      previousStatus: currentStatus,
      newStatus,
      command: "transitionWorkOrderStatus",
      actorUserId: effectiveUser.id,
      actorRole: authorization.persistedRole,
      committedAt: now
    }));
    const executeTransitionWriter = async () => {
      const lifecycleLock = await acquireLifecycleLock({
        base44,
        ot,
        orgId,
        effectiveUser,
        operation: `transition:${newStatus}`,
        requestedToken: _lifecycle_lock_token || null
      });
      if (!lifecycleLock.acquired) {
        return Response.json({
          error: "Otra operaci\xF3n del lifecycle est\xE1 en progreso para esta OT.",
          code: lifecycleLock.code,
          retryable: true
        }, { status: 409 });
      }
      try {
        const lockedOt = await loadWorkOrder(base44, orgId, orden_trabajo_id);
        if (!lockedOt || lockedOt.lifecycle_lock_token !== lifecycleLock.token) {
          return Response.json({
            error: "No se pudo confirmar el estado actual de la OT bajo el lock del lifecycle.",
            code: "LIFECYCLE_LOCK_LOST",
            retryable: true
          }, { status: 409 });
        }
        if (lockedOt.estado !== currentStatus || !canTransition(lockedOt.estado, newStatus)) {
          return Response.json({
            error: `La OT cambio antes de confirmar la transicion. Estado actual: ${lockedOt.estado}.`,
            code: "ORDEN_TRABAJO_CONCURRENT_UPDATE",
            retryable: true
          }, { status: 409 });
        }
        if (newStatus === "FINALIZADA") {
          const qaRecords = await base44.asServiceRole.entities.PruebaTecnica.filter({
            organization_id: orgId,
            orden_trabajo_id
          }, "recorded_at", 200);
          const qaValidation = evaluateCurrentQaEvidence(qaRecords, {
            organizationId: orgId,
            workOrderId: orden_trabajo_id,
            assignedTechnicianId: lockedOt?.tecnico_asignado_id,
            cycleId: lockedOt?.qa_cycle_id,
            cycleStartedAt: lockedOt?.qa_cycle_started_at
          });
          if (!qaValidation.valid) {
            return Response.json({
              error: "No se puede finalizar la OT: la evidencia QA vigente no es valida.",
              code: qaValidation.code,
              orden_trabajo_id
            }, { status: 422 });
          }
          extra.prueba_tecnica_exitosa_verificada = true;
        }
        let transitionResult;
        let transitionError;
        try {
          transitionResult = await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
            id: orden_trabajo_id,
            organization_id: orgId,
            estado: currentStatus,
            lifecycle_lock_token: lifecycleLock.token
          }, { $set: updatePayload });
        } catch (error) {
          transitionError = error;
        }
        let reconciled = null;
        let transitionRecovered = false;
        if (transitionError || transitionResult?.updated !== 1) {
          reconciled = await loadWorkOrder(base44, orgId, orden_trabajo_id);
          if (reconciled?.estado === newStatus) {
            transitionRecovered = true;
          } else if (transitionError) {
            throw transitionError;
          } else {
            return Response.json({
              error: `La OT cambi\xF3 concurrentemente. Estado actual: ${reconciled?.estado || "desconocido"}.`,
              code: "ORDEN_TRABAJO_CONCURRENT_UPDATE",
              retryable: true
            }, { status: 409 });
          }
        }
        if (transitionResult?.updated !== 1 && !transitionRecovered) {
          return Response.json({
            error: `La OT cambi\xF3 concurrentemente. Estado actual: ${reconciled?.estado || "desconocido"}.`,
            code: "ORDEN_TRABAJO_CONCURRENT_UPDATE",
            retryable: true
          }, { status: 409 });
        }
        const updatedOT = transitionRecovered ? reconciled : { ...ot, ...updatePayload };
        if (newStatus === "CANCELADA") {
          await releaseCancelledWorkOrderReservations(base44, updatedOT, effectiveUser.id || effectiveUser.email);
        }
        const CANONICAL_EVENTS = ["FINALIZADA", "ENTREGADA", "CANCELADA"];
        const TRANSITION_EVENT_MAP = {
          ASIGNADA: "TRANSITION_ASIGNADA",
          EN_REVISION: "TRANSITION_EN_REVISION",
          COTIZADA: "TRANSITION_COTIZADA",
          APROBADA: "TRANSITION_APROBADA",
          EN_REPARACION: "TRANSITION_EN_REPARACION",
          PRUEBAS: "TRANSITION_PRUEBAS"
        };
        try {
          const eventType = CANONICAL_EVENTS.includes(newStatus) ? newStatus : TRANSITION_EVENT_MAP[newStatus];
          if (eventType) {
            const existing = await base44.asServiceRole.entities.OTEvent.filter({
              organization_id: orgId,
              orden_trabajo_id,
              tipo: eventType
            }, "-created_date", 5);
            if (!existing?.length) {
              try {
                await base44.asServiceRole.entities.OTEvent.create({
                  organization_id: orgId,
                  orden_trabajo_id,
                  tipo: eventType,
                  created_by_user_id: effectiveUser.id,
                  processed: false,
                  created_at: now,
                  detalle: newStatus === "PRUEBAS" ? JSON.stringify({ qa_cycle_id: updatePayload.qa_cycle_id }) : void 0
                });
              } catch (eventError) {
                const reconciledEvents = await base44.asServiceRole.entities.OTEvent.filter({
                  organization_id: orgId,
                  orden_trabajo_id,
                  tipo: eventType
                }, "-created_date", 5);
                if (!reconciledEvents?.length) throw eventError;
              }
            }
          }
        } catch (traceError) {
          console.warn("[transitionWorkOrderStatus] trazabilidad_fallida:", traceError.message);
        }
        try {
          await ensureLifecycleAudit(base44, {
            authorization,
            user: effectiveUser,
            ot: updatedOT,
            previousStatus: currentStatus,
            newStatus,
            operationId: auditOperationId,
            externalCorrelationId,
            actorUserId: effectiveUser.id,
            actorRole: authorization.persistedRole,
            committedAt: now
          });
          await clearLifecycleAuditPending(base44, {
            organizationId: orgId,
            workOrderId: ot.id,
            status: newStatus,
            operationId: auditOperationId
          });
        } catch (error) {
          await recordLifecycleAuditFailure(base44, {
            organizationId: orgId,
            workOrderId: ot.id,
            status: newStatus,
            operationId: auditOperationId,
            error
          });
          return Response.json({ error: "La transicion existe pero su auditoria requerida esta pendiente", code: "LIFECYCLE_AUDIT_PENDING", retryable: true }, { status: 500 });
        }
        console.log(`[transitionWorkOrderStatus] OK \u2014 OT: ${orden_trabajo_id}, ${currentStatus} \u2192 ${newStatus}, usuario: ${effectiveUser.email}, rol: ${effectiveRole}`);
        return Response.json({
          success: true,
          orden_trabajo_id,
          previous_status: currentStatus,
          new_status: newStatus,
          idempotent: transitionRecovered,
          transition_recovered: transitionRecovered,
          recovered_ambiguous_lock: lifecycleLock.recovered_ambiguous_lock === true,
          updated_at: now,
          updated_by: effectiveUser.email,
          updated_by_role: effectiveRole,
          orden_trabajo: projectWorkOrderMutationResult(updatedOT)
        });
      } finally {
        try {
          await releaseLifecycleLock(base44, orgId, orden_trabajo_id, lifecycleLock);
        } catch (releaseError) {
          console.error(`[transitionWorkOrderStatus] No se pudo liberar el lock \u2014 OT: ${orden_trabajo_id}: ${releaseError.message}`);
        }
      }
    };
    if (newStatus === "CANCELADA") return executeTransitionWriter();
    return await ExecuteSovereignCommand({
      decision: staffPolicyDecision,
      sovereignWriter: "transitionWorkOrderStatus",
      execute: executeTransitionWriter
    });
  } catch (error) {
    if (error instanceof SovereignCommandError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("[transitionWorkOrderStatus] Error:", error.message);
    console.error(`[DIAG:transition] *** CATCH \u2014 error.stack:`, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
