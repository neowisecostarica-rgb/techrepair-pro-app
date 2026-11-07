// base44/functions/deliverWorkOrder/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";

// base44/functions/deliverWorkOrder/_shared/controlledPilotAuthority.ts
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

// base44/functions/deliverWorkOrder/_shared/roleCapabilities.ts
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

// base44/functions/deliverWorkOrder/_shared/userAuthorization.ts
function isCanonicalActiveUserAccount(account) {
  return account?.status === "active";
}
function getUserDataField(user, field) {
  return user?.data?.[field] ?? user?.[field] ?? null;
}
function isCanonicalSuperAdmin(user) {
  return user?.role === "admin" && getUserDataField(user, "is_super_admin") === true;
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
  const memberships = await loadCanonicalMemberships(base44, user);
  const activeMemberships = memberships.filter(
    (account) => account.user_id === user.id && account.organization_id && isCanonicalActiveUserAccount(account)
  );
  const isSuperAdmin = isCanonicalSuperAdmin(user) && activeMemberships.length === 0;
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

// base44/functions/deliverWorkOrder/_shared/operationalAuthorization.ts
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
  Venta: { read: [...COMMERCIAL_ROLES, "CUSTOMER_SERVICE"], create: COMMERCIAL_ROLES, update: [], delete: COMMERCIAL_ROLES, scope: "branch" },
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

// base44/functions/deliverWorkOrder/_shared/workOrderLifecycleLock.ts
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

// base44/functions/deliverWorkOrder/_shared/branchProtection.ts
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

// base44/functions/deliverWorkOrder/_shared/deliveryAtomicity.ts
var DELIVERY_LEGAL_TEXT = "Confirmo que he recibido el equipo y el servicio descrito en esta orden de trabajo, y que el equipo ha sido entregado en las condiciones acordadas.";
var DELIVERY_LEGAL_VERSION = "DELIVERY_MVP_V1";
var REPAIR_INTERVENTIONS = /* @__PURE__ */ new Set(["reparacion_puntual", "mantenimiento_correctivo"]);
var NON_REPAIR_INTERVENTIONS = /* @__PURE__ */ new Set([
  "diagnostico_tecnico",
  "revision_general",
  "mantenimiento_preventivo",
  "limpieza"
]);
var DELIVERY_QUERY_LIMIT = 200;
var DeliveryCommandError = class extends Error {
  constructor(message, code, status = 409, details = {}) {
    super(message);
    this.name = "DeliveryCommandError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
};
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}
async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function normalizeDeliveryRequest(input = {}) {
  const workOrderId = String(input.work_order_id || input.orden_trabajo_id || "").trim();
  const operationKey = String(input.delivery_operation_key || input.operation_key || "").trim();
  const acceptance = input.acceptance === true;
  const note = String(input.nota_entrega || input.note || "").trim().slice(0, 2e3) || null;
  if (!workOrderId) throw new DeliveryCommandError("work_order_id es requerido.", "DELIVERY_WORK_ORDER_REQUIRED", 400);
  if (!acceptance) throw new DeliveryCommandError("La aceptacion explicita es obligatoria.", "DELIVERY_ACCEPTANCE_REQUIRED", 422);
  if (!/^[A-Za-z0-9:_-]{16,200}$/.test(operationKey)) {
    throw new DeliveryCommandError("operation_key estable es requerido.", "DELIVERY_OPERATION_KEY_REQUIRED", 400);
  }
  return {
    work_order_id: workOrderId,
    acceptance: true,
    nota_entrega: note,
    operation_key: operationKey,
    legal_text: DELIVERY_LEGAL_TEXT,
    legal_version: DELIVERY_LEGAL_VERSION
  };
}
async function fingerprintDeliveryRequest(normalized) {
  return sha256(JSON.stringify(stableValue(normalized)));
}
function diagnosticTimestamp(record) {
  for (const value of [record?.fecha_completado, record?.updated_date, record?.created_date]) {
    const parsed = Date.parse(value || "");
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}
function determineWarrantyApplicability(diagnostics = []) {
  const canonical = (diagnostics || []).filter((record) => record?.bloqueado === true && record?.credito_consumido_finalizacion === true && record?.estado === "listo_aprobacion").sort((left, right) => diagnosticTimestamp(right) - diagnosticTimestamp(left))[0];
  if (!canonical?.tipo_intervencion) {
    throw new DeliveryCommandError(
      "No existe una intervencion tecnica finalizada que permita decidir la garantia.",
      "DELIVERY_WARRANTY_APPLICABILITY_UNDETERMINED",
      422
    );
  }
  const interventionType = canonical.tipo_intervencion;
  if (REPAIR_INTERVENTIONS.has(interventionType)) {
    return { applicable: true, outcome: "ISSUED", intervention_type: interventionType, diagnostic_id: canonical.id };
  }
  if (NON_REPAIR_INTERVENTIONS.has(interventionType)) {
    return { applicable: false, outcome: "NOT_APPLICABLE", intervention_type: interventionType, diagnostic_id: canonical.id };
  }
  throw new DeliveryCommandError(
    `La intervencion "${interventionType}" no determina de forma segura si hubo reparacion.`,
    "DELIVERY_WARRANTY_APPLICABILITY_UNDETERMINED",
    422
  );
}
function moneyMatches(left, right) {
  return Number.isFinite(Number(left)) && Number.isFinite(Number(right)) && Math.abs(Number(left) - Number(right)) <= 0.01;
}
function saleIsCommittedPaid(sale) {
  return sale?.estado === "pagada" && sale?.inventory_commit_status === "COMMITTED" && Number(sale?.total) > 0;
}
function assertSingle(records, code, message) {
  if ((records || []).length > 1) throw new DeliveryCommandError(message, code, 409);
  return records?.[0] || null;
}
function evaluateCommercialDeliveryGate({ ot, applicability, sales = [], quotes = [], workflowGates = [] }) {
  const scopedSales = sales.filter((sale2) => sale2.organization_id === ot.organization_id && sale2.referencia_ot_id === ot.id && sale2.branch_id === ot.branch_id && (!sale2.cliente_id || sale2.cliente_id === ot.cliente_id));
  const repairSales = scopedSales.filter((sale2) => sale2.tipo_concepto === "reparacion");
  const approvedQuotes = quotes.filter((quote) => quote.organization_id === ot.organization_id && quote.orden_trabajo_id === ot.id && quote.branch_id === ot.branch_id && quote.estado === "aprobada" && quote.decision_status === "COMMITTED");
  if (approvedQuotes.length > 1) {
    throw new DeliveryCommandError(
      "Existe mas de una cotizacion aprobada canonica para la OT.",
      "DELIVERY_COMMERCIAL_APPROVED_QUOTE_AMBIGUOUS",
      409
    );
  }
  const repairObligationExists = applicability.applicable || repairSales.length > 0 || approvedQuotes.length > 0;
  if (repairObligationExists) {
    const paidRepairSales = repairSales.filter(saleIsCommittedPaid);
    const sale2 = assertSingle(
      paidRepairSales,
      "DELIVERY_COMMERCIAL_DUPLICATE_REPAIR_SALES",
      "Existe mas de una venta de reparacion pagada para la OT."
    );
    if (!sale2) {
      throw new DeliveryCommandError(
        "La obligacion de reparacion no esta liquidada.",
        "DELIVERY_COMMERCIAL_REPAIR_UNPAID",
        422
      );
    }
    if (repairSales.some((candidate) => candidate.id !== sale2.id && !["anulada"].includes(candidate.estado))) {
      throw new DeliveryCommandError(
        "Existen obligaciones de reparacion concurrentes o pendientes.",
        "DELIVERY_COMMERCIAL_REPAIR_AMBIGUOUS",
        409
      );
    }
    let quote = null;
    if (sale2.cotizacion_id) {
      quote = approvedQuotes.find((candidate) => candidate.id === sale2.cotizacion_id) || null;
      if (!quote || quote.estado_conversion !== "CONVERTIDA" || quote.venta_id !== sale2.id || !moneyMatches(quote.total, sale2.total)) {
        throw new DeliveryCommandError(
          "La venta no liquida la cotizacion aprobada de la OT.",
          "DELIVERY_COMMERCIAL_QUOTE_MISMATCH",
          422
        );
      }
    } else if (approvedQuotes.length > 0) {
      throw new DeliveryCommandError(
        "Existe una cotizacion aprobada que no fue liquidada por la venta canonica.",
        "DELIVERY_COMMERCIAL_QUOTE_UNPAID",
        422
      );
    }
    return {
      satisfied: true,
      basis: quote ? "APPROVED_QUOTE_PAID_SALE" : "AUTHORITATIVE_PAID_REPAIR_SALE",
      sale_id: sale2.id,
      quote_id: quote?.id || null,
      required_total: Number(quote?.total ?? sale2.total),
      paid_total: Number(sale2.total),
      pending_balance: 0
    };
  }
  const revisionSales = scopedSales.filter((sale2) => sale2.tipo_concepto === "revision_diagnostico");
  const referencedSale = ot.revision_venta_id ? revisionSales.find((sale2) => sale2.id === ot.revision_venta_id) || null : null;
  const paidRevisionSales = revisionSales.filter(saleIsCommittedPaid);
  const sale = referencedSale || assertSingle(
    paidRevisionSales,
    "DELIVERY_COMMERCIAL_DUPLICATE_REVISION_SALES",
    "Existe mas de una venta de revision pagada para la OT."
  );
  if (!sale || !saleIsCommittedPaid(sale)) {
    throw new DeliveryCommandError(
      "La obligacion de diagnostico/revision no esta liquidada.",
      "DELIVERY_COMMERCIAL_REVISION_UNPAID",
      422
    );
  }
  const gateResolved = workflowGates.some((gate) => gate.organization_id === ot.organization_id && gate.subject_type === "OrdenTrabajo" && gate.subject_id === ot.id && gate.wait_reason === "COMMERCIAL_AUTHORIZATION" && gate.status === "RESOLVED" && gate.resolution_payload?.sale_id === sale.id);
  if (!(ot.diagnostico_habilitado === true && ot.revision_venta_id === sale.id) && !gateResolved) {
    throw new DeliveryCommandError(
      "El pago existe pero no resolvio la autorizacion comercial canonica.",
      "DELIVERY_COMMERCIAL_AUTHORIZATION_UNRESOLVED",
      422
    );
  }
  return {
    satisfied: true,
    basis: gateResolved ? "RESOLVED_COMMERCIAL_GATE" : "CANONICAL_REVISION_SALE",
    sale_id: sale.id,
    quote_id: null,
    required_total: Number(sale.total),
    paid_total: Number(sale.total),
    pending_balance: 0
  };
}
function utcDate(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}
function addUtcMonths(dateValue, months) {
  const source = /* @__PURE__ */ new Date(`${dateValue}T00:00:00.000Z`);
  const targetMonth = source.getUTCMonth() + Number(months);
  const year = source.getUTCFullYear() + Math.floor(targetMonth / 12);
  const month = (targetMonth % 12 + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(source.getUTCDate(), lastDay);
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}
async function list(entity, filter, sort = "-created_date", limit = DELIVERY_QUERY_LIMIT) {
  return entity.filter(filter, sort, limit);
}
async function createRecoverable(entity, data, find, duplicateCode) {
  const existing = await find();
  if (existing?.length > 1) throw new DeliveryCommandError("Registros criticos duplicados.", duplicateCode, 409);
  if (existing?.[0]) return { record: existing[0], recovered: true };
  try {
    const created = await entity.create(data);
    return { record: created, recovered: false };
  } catch (error) {
    const reconciled = await find();
    if (reconciled?.length === 1) return { record: reconciled[0], recovered: true, ambiguous: true };
    throw error;
  }
}
async function updateRecoverable(entity, query, mutation, reconcile, code) {
  let result;
  let writeError;
  try {
    result = await entity.updateMany(query, mutation);
  } catch (error) {
    writeError = error;
  }
  if (result?.updated === 1) return reconcile();
  const current = await reconcile();
  if (current) return current;
  if (writeError) throw writeError;
  throw new DeliveryCommandError("Una escritura critica cambio concurrentemente.", code, 409);
}
async function loadPrerequisites(base44, orgId, ot) {
  const [activities, diagnostics, sales, quotes, gates, organizations, warranties] = await Promise.all([
    list(base44.asServiceRole.entities.ActividadTecnica, {
      organization_id: orgId,
      orden_trabajo_id: ot.id,
      estado: "en_progreso"
    }),
    list(base44.asServiceRole.entities.DiagnosticoTecnico, { organization_id: orgId, orden_trabajo_id: ot.id }),
    list(base44.asServiceRole.entities.Venta, { organization_id: orgId, referencia_ot_id: ot.id }),
    list(base44.asServiceRole.entities.Cotizacion, { organization_id: orgId, orden_trabajo_id: ot.id }),
    list(base44.asServiceRole.entities.WorkflowGate, { organization_id: orgId, subject_type: "OrdenTrabajo", subject_id: ot.id }),
    list(base44.asServiceRole.entities.Organization, { id: orgId }, "-created_date", 1),
    list(base44.asServiceRole.entities.Garantia, { organization_id: orgId, origen_tipo: "OT", origen_id: ot.id })
  ]);
  if ([activities, diagnostics, sales, quotes, gates, warranties].some((records) => records?.length >= DELIVERY_QUERY_LIMIT)) {
    throw new DeliveryCommandError("La validacion critica excedio el limite seguro.", "DELIVERY_VALIDATION_TRUNCATED", 409);
  }
  const activeActivities = activities.filter((record) => record.soft_deleted !== true);
  if (activeActivities.length > 0) {
    throw new DeliveryCommandError(
      "La OT tiene actividades tecnicas activas; deben resolverse antes de entregar.",
      "DELIVERY_ACTIVE_TECHNICAL_ACTIVITY",
      422,
      { activity_ids: activeActivities.map((record) => record.id) }
    );
  }
  const applicability = determineWarrantyApplicability(diagnostics);
  const commercial = evaluateCommercialDeliveryGate({ ot, applicability, sales, quotes, workflowGates: gates });
  const config = organizations?.[0]?.garantia_config || null;
  let warrantyTerms = null;
  let warrantyMonths = null;
  if (applicability.applicable) {
    warrantyTerms = String(config?.texto_reparaciones || "").trim();
    warrantyMonths = Number(config?.meses_vigencia_reparaciones);
    if (!warrantyTerms || !Number.isInteger(warrantyMonths) || warrantyMonths < 1 || warrantyMonths > 120) {
      throw new DeliveryCommandError(
        "La configuracion soberana de garantia de reparacion esta incompleta.",
        "DELIVERY_WARRANTY_CONFIG_REQUIRED",
        422
      );
    }
  }
  return { applicability, commercial, warrantyTerms, warrantyMonths, existingWarranties: warranties };
}
function assertOperationIdentity(ot, operationKey, requestFingerprint) {
  if (ot.delivery_operation_key && ot.delivery_operation_key !== operationKey) {
    if (ot.delivery_status === "COMMITTED" || ot.estado === "ENTREGADA") {
      throw new DeliveryCommandError("La OT ya fue entregada por otra operacion.", "ALREADY_DELIVERED", 409);
    }
    throw new DeliveryCommandError("Otra entrega esta pendiente para esta OT.", "DELIVERY_OPERATION_IN_PROGRESS", 409);
  }
  if (ot.delivery_request_fingerprint && ot.delivery_request_fingerprint !== requestFingerprint) {
    throw new DeliveryCommandError(
      "La operation key ya fue utilizada con un payload diferente.",
      "DELIVERY_FINGERPRINT_CONFLICT",
      409
    );
  }
}
async function recoverCommitted(base44, orgId, ot, operationKey, requestFingerprint) {
  assertOperationIdentity(ot, operationKey, requestFingerprint);
  const logs = await list(base44.asServiceRole.entities.EntregaLog, {
    organization_id: orgId,
    orden_trabajo_id: ot.id,
    operation_key: operationKey
  });
  if (logs.length !== 1 || logs[0].delivery_status !== "COMMITTED" || logs[0].fingerprint !== requestFingerprint) {
    throw new DeliveryCommandError("La entrega comprometida no tiene un EntregaLog valido.", "DELIVERY_COMMITTED_LOG_INVALID", 409);
  }
  let warranty = null;
  if (ot.delivery_warranty_outcome === "ISSUED") {
    const warranties = await list(base44.asServiceRole.entities.Garantia, {
      organization_id: orgId,
      delivery_operation_key: operationKey
    });
    if (warranties.length !== 1 || warranties[0].delivery_status !== "COMMITTED" || warranties[0].estado !== "ACTIVA" || warranties[0].source !== "WORK_ORDER" || warranties[0].source_id !== ot.id) {
      throw new DeliveryCommandError("La entrega comprometida no tiene una garantia valida.", "DELIVERY_COMMITTED_WARRANTY_INVALID", 409);
    }
    warranty = warranties[0];
  } else if (ot.delivery_warranty_outcome !== "NOT_APPLICABLE") {
    throw new DeliveryCommandError("El resultado de garantia no esta comprometido.", "DELIVERY_WARRANTY_OUTCOME_INVALID", 409);
  }
  return { ot, delivery_log: logs[0], warranty, idempotent: true, recovered: true };
}
async function emitDeliveryEvent(base44, context, result) {
  try {
    const existing = await list(base44.asServiceRole.entities.OTEvent, {
      organization_id: context.organizationId,
      orden_trabajo_id: result.ot.id,
      tipo: "ENTREGADA",
      delivery_operation_key: context.operationKey
    }, "-created_date", 5);
    if (!existing.length) {
      await base44.asServiceRole.entities.OTEvent.create({
        organization_id: context.organizationId,
        orden_trabajo_id: result.ot.id,
        tipo: "ENTREGADA",
        delivery_operation_key: context.operationKey,
        created_by_user_id: context.actor.id,
        processed: false,
        created_at: result.ot.delivered_at
      });
    }
    return { event_status: "READY" };
  } catch (error) {
    console.warn(`[deliverWorkOrder] non_critical_event_failed: ${error.message}`);
    return { event_status: "PENDING_RETRY", event_error: error.message };
  }
}
async function executeCriticalDelivery(base44, context, normalized, fingerprint, lock) {
  const orgId = context.organizationId;
  let ot = await loadWorkOrder(base44, orgId, normalized.work_order_id);
  if (!ot || ot.lifecycle_lock_token !== lock.token) {
    throw new DeliveryCommandError("No se pudo confirmar la OT bajo el lifecycle lock.", "LIFECYCLE_LOCK_LOST", 409);
  }
  assertOperationIdentity(ot, normalized.operation_key, fingerprint);
  if (ot.delivery_status === "COMMITTED") {
    return recoverCommitted(base44, orgId, ot, normalized.operation_key, fingerprint);
  }
  if (ot.estado === "ENTREGADA" && !ot.delivery_operation_key) {
    throw new DeliveryCommandError(
      "La OT fue entregada por un flujo legacy y requiere auditoria.",
      "DELIVERY_LEGACY_STATE_BLOCKED",
      409
    );
  }
  if (!["FINALIZADA", "ENTREGADA"].includes(ot.estado)) {
    throw new DeliveryCommandError(
      `La OT debe estar FINALIZADA. Estado actual: ${ot.estado}.`,
      "DELIVERY_INVALID_STATE",
      422
    );
  }
  const prerequisites = await loadPrerequisites(base44, orgId, ot);
  const plannedOutcome = ot.delivery_warranty_outcome || prerequisites.applicability.outcome;
  const interventionType = ot.delivery_intervention_type || prerequisites.applicability.intervention_type;
  const commercialSnapshot = ot.delivery_commercial_snapshot || prerequisites.commercial;
  const warrantyTerms = ot.delivery_warranty_terms_snapshot ?? prerequisites.warrantyTerms;
  const warrantyMonths = ot.delivery_warranty_months ?? prerequisites.warrantyMonths;
  if (ot.delivery_status === "PENDING" && (plannedOutcome !== prerequisites.applicability.outcome || interventionType !== prerequisites.applicability.intervention_type)) {
    throw new DeliveryCommandError("El contrato tecnico cambio durante recovery.", "DELIVERY_RECOVERY_CONTRACT_CHANGED", 409);
  }
  let startedAt = ot.delivery_started_at || (/* @__PURE__ */ new Date()).toISOString();
  if (!ot.delivery_status) {
    const claimData = {
      delivery_status: "PENDING",
      delivery_operation_key: normalized.operation_key,
      delivery_request_fingerprint: fingerprint,
      delivery_started_at: startedAt,
      delivery_warranty_outcome: plannedOutcome,
      delivery_intervention_type: interventionType,
      delivery_commercial_snapshot: commercialSnapshot,
      delivery_warranty_terms_snapshot: warrantyTerms,
      delivery_warranty_months: warrantyMonths
    };
    ot = await updateRecoverable(
      base44.asServiceRole.entities.OrdenTrabajo,
      {
        id: ot.id,
        organization_id: orgId,
        estado: "FINALIZADA",
        lifecycle_lock_token: lock.token,
        $or: [{ delivery_status: { $exists: false } }, { delivery_status: null }]
      },
      { $set: claimData },
      async () => {
        const current = await loadWorkOrder(base44, orgId, ot.id);
        return current?.delivery_operation_key === normalized.operation_key && current?.delivery_request_fingerprint === fingerprint ? current : null;
      },
      "DELIVERY_CLAIM_CONCURRENT_UPDATE"
    );
    startedAt = ot.delivery_started_at;
  }
  await renewLifecycleLock(base44, orgId, ot.id, lock);
  const logFind = () => list(base44.asServiceRole.entities.EntregaLog, {
    organization_id: orgId,
    orden_trabajo_id: ot.id,
    operation_key: normalized.operation_key
  });
  const logResult = await createRecoverable(base44.asServiceRole.entities.EntregaLog, {
    organization_id: orgId,
    branch_id: ot.branch_id,
    orden_trabajo_id: ot.id,
    delivered_by_user_id: context.actor.id,
    delivered_by_role: context.role,
    delivered_at: startedAt,
    acceptance: true,
    checkbox_texto_legal: DELIVERY_LEGAL_TEXT,
    nota_entrega: normalized.nota_entrega,
    entrega_con_saldo_pendiente: false,
    operation_key: normalized.operation_key,
    fingerprint,
    delivery_status: "PENDING",
    delivery_warranty_outcome: plannedOutcome,
    intervention_type: interventionType,
    commercial_snapshot: commercialSnapshot
  }, logFind, "DELIVERY_LOG_DUPLICATED");
  let deliveryLog = logResult.record;
  if (deliveryLog.fingerprint !== fingerprint || deliveryLog.branch_id !== ot.branch_id || deliveryLog.acceptance !== true || deliveryLog.checkbox_texto_legal !== DELIVERY_LEGAL_TEXT) {
    throw new DeliveryCommandError("El EntregaLog recuperado no coincide con la operacion.", "DELIVERY_LOG_CONFLICT", 409);
  }
  await renewLifecycleLock(base44, orgId, ot.id, lock);
  let warranty = null;
  const existingWarranties = prerequisites.existingWarranties;
  if (plannedOutcome === "ISSUED") {
    if (existingWarranties.length > 1) {
      throw new DeliveryCommandError("Existen garantias OT duplicadas.", "DELIVERY_WARRANTY_DUPLICATED", 409);
    }
    if (existingWarranties[0] && existingWarranties[0].delivery_operation_key !== normalized.operation_key) {
      throw new DeliveryCommandError("Existe una garantia legacy incompatible.", "DELIVERY_WARRANTY_LEGACY_CONFLICT", 409);
    }
    const issuedDate = utcDate(startedAt);
    const warrantyFind = () => list(base44.asServiceRole.entities.Garantia, {
      organization_id: orgId,
      delivery_operation_key: normalized.operation_key
    });
    const warrantyResult = await createRecoverable(base44.asServiceRole.entities.Garantia, {
      organization_id: orgId,
      branch_id: ot.branch_id,
      cliente_id: ot.cliente_id,
      equipo_id: ot.equipo_id || null,
      origen_tipo: "OT",
      origen_id: ot.id,
      source: "WORK_ORDER",
      source_id: ot.id,
      source_identity: `WORK_ORDER:${ot.id}`,
      delivery_operation_key: normalized.operation_key,
      delivery_request_fingerprint: fingerprint,
      delivery_status: "PENDING",
      fecha_emision: issuedDate,
      fecha_inicio: issuedDate,
      fecha_fin: addUtcMonths(issuedDate, warrantyMonths),
      estado: "PENDIENTE_ACTIVACION",
      texto_snapshot: warrantyTerms,
      creado_por: context.actor.id
    }, warrantyFind, "DELIVERY_WARRANTY_DUPLICATED");
    warranty = warrantyResult.record;
    if (warranty.delivery_request_fingerprint !== fingerprint || warranty.source !== "WORK_ORDER" || warranty.source_id !== ot.id || warranty.branch_id !== ot.branch_id) {
      throw new DeliveryCommandError("La garantia recuperada no coincide con la entrega.", "DELIVERY_WARRANTY_CONFLICT", 409);
    }
  } else if (existingWarranties.length > 0) {
    throw new DeliveryCommandError(
      "La entrega es NOT_APPLICABLE pero ya existe una garantia OT.",
      "DELIVERY_NOT_APPLICABLE_WARRANTY_CONFLICT",
      409
    );
  }
  await renewLifecycleLock(base44, orgId, ot.id, lock);
  if (ot.estado === "FINALIZADA") {
    ot = await updateRecoverable(
      base44.asServiceRole.entities.OrdenTrabajo,
      {
        id: ot.id,
        organization_id: orgId,
        estado: "FINALIZADA",
        delivery_status: "PENDING",
        delivery_operation_key: normalized.operation_key,
        delivery_request_fingerprint: fingerprint,
        lifecycle_lock_token: lock.token
      },
      { $set: { estado: "ENTREGADA", delivered_at: startedAt, ultima_actividad: "Entrega confirmada", ultima_actividad_at: startedAt } },
      async () => {
        const current = await loadWorkOrder(base44, orgId, ot.id);
        return current?.estado === "ENTREGADA" && current?.delivery_operation_key === normalized.operation_key ? current : null;
      },
      "DELIVERY_WORK_ORDER_CAS_FAILED"
    );
  }
  if (warranty && warranty.delivery_status !== "COMMITTED") {
    warranty = await updateRecoverable(
      base44.asServiceRole.entities.Garantia,
      {
        id: warranty.id,
        organization_id: orgId,
        delivery_operation_key: normalized.operation_key,
        delivery_status: "PENDING",
        estado: "PENDIENTE_ACTIVACION"
      },
      { $set: { delivery_status: "COMMITTED", estado: "ACTIVA", activated_at: startedAt } },
      async () => {
        const records = await list(base44.asServiceRole.entities.Garantia, { id: warranty.id, organization_id: orgId }, "-created_date", 1);
        return records[0]?.delivery_status === "COMMITTED" && records[0]?.estado === "ACTIVA" ? records[0] : null;
      },
      "DELIVERY_WARRANTY_COMMIT_FAILED"
    );
  }
  if (deliveryLog.delivery_status !== "COMMITTED") {
    deliveryLog = await updateRecoverable(
      base44.asServiceRole.entities.EntregaLog,
      {
        id: deliveryLog.id,
        organization_id: orgId,
        operation_key: normalized.operation_key,
        fingerprint,
        delivery_status: "PENDING"
      },
      { $set: { delivery_status: "COMMITTED", warranty_id: warranty?.id || null } },
      async () => {
        const records = await list(base44.asServiceRole.entities.EntregaLog, { id: deliveryLog.id, organization_id: orgId }, "-created_date", 1);
        return records[0]?.delivery_status === "COMMITTED" ? records[0] : null;
      },
      "DELIVERY_LOG_COMMIT_FAILED"
    );
  }
  const committedAt = (/* @__PURE__ */ new Date()).toISOString();
  ot = await updateRecoverable(
    base44.asServiceRole.entities.OrdenTrabajo,
    {
      id: ot.id,
      organization_id: orgId,
      estado: "ENTREGADA",
      delivery_status: "PENDING",
      delivery_operation_key: normalized.operation_key,
      delivery_request_fingerprint: fingerprint,
      lifecycle_lock_token: lock.token
    },
    {
      $set: {
        delivery_status: "COMMITTED",
        delivery_committed_at: committedAt,
        delivery_log_id: deliveryLog.id,
        delivery_warranty_id: warranty?.id || null,
        delivery_warranty_outcome: plannedOutcome
      },
      $unset: { delivery_error: "" }
    },
    async () => {
      const current = await loadWorkOrder(base44, orgId, ot.id);
      return current?.delivery_status === "COMMITTED" && current?.delivery_log_id === deliveryLog.id && current?.delivery_warranty_outcome === plannedOutcome ? current : null;
    },
    "DELIVERY_COMMIT_FAILED"
  );
  return { ot, delivery_log: deliveryLog, warranty, idempotent: false, recovered: logResult.recovered };
}
async function executeDeliveryCommand(base44, context, input) {
  const normalized = normalizeDeliveryRequest(input);
  const requestFingerprint = await fingerprintDeliveryRequest(normalized);
  const initial = await loadWorkOrder(base44, context.organizationId, normalized.work_order_id);
  if (!initial) throw new DeliveryCommandError("Orden de trabajo no encontrada.", "DELIVERY_WORK_ORDER_NOT_FOUND", 404);
  if (initial.organization_id !== context.organizationId) {
    throw new DeliveryCommandError("La OT pertenece a otra organizacion.", "DELIVERY_CROSS_ORGANIZATION_DENIED", 403);
  }
  if (typeof context.authorizeBranch === "function") context.authorizeBranch(initial.branch_id);
  try {
    await assertActiveBranch(base44, context.organizationId, initial.branch_id, {
      code: "DELIVERY_BRANCH_INACTIVE",
      status: 409,
      message: "La sucursal esta inactiva y no admite nuevas entregas."
    });
  } catch (error) {
    if (error instanceof BranchProtectionError) {
      throw new DeliveryCommandError(error.message, error.code, error.status, error.details);
    }
    throw error;
  }
  const lock = await acquireLifecycleLock({
    base44,
    ot: initial,
    orgId: context.organizationId,
    effectiveUser: context.actor,
    operation: "deliverWorkOrder"
  });
  if (!lock.acquired) {
    throw new DeliveryCommandError(
      "Otra operacion del lifecycle esta en progreso.",
      lock.code || "LIFECYCLE_OPERATION_IN_PROGRESS",
      409,
      { retryable: true, operation: lock.operation || null }
    );
  }
  let result;
  try {
    result = await executeCriticalDelivery(base44, context, normalized, requestFingerprint, lock);
  } catch (error) {
    try {
      await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
        id: normalized.work_order_id,
        organization_id: context.organizationId,
        delivery_status: "PENDING",
        delivery_operation_key: normalized.operation_key,
        lifecycle_lock_token: lock.token
      }, { $set: { delivery_error: String(error?.code || error?.message || "DELIVERY_FAILED").slice(0, 500) } });
    } catch {
    }
    throw error;
  } finally {
    try {
      await releaseLifecycleLock(base44, context.organizationId, normalized.work_order_id, lock);
    } catch (releaseError) {
      console.error("No fue posible liberar el lifecycle lock de entrega", releaseError);
    }
  }
  const sideEffects = await emitDeliveryEvent(base44, {
    ...context,
    operationKey: normalized.operation_key
  }, result);
  return {
    success: true,
    operation_key: normalized.operation_key,
    request_fingerprint: requestFingerprint,
    idempotent: result.idempotent,
    recovered: result.recovered,
    work_order: result.ot,
    delivery_log: result.delivery_log,
    warranty: result.warranty,
    warranty_outcome: result.ot.delivery_warranty_outcome,
    non_critical_side_effects: sideEffects
  };
}

// base44/functions/deliverWorkOrder/_shared/auditEvent.ts
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

// base44/functions/deliverWorkOrder/_shared/dataProjections.ts
var ALLOWLISTS = Object.freeze({
  WORK_ORDER_LIST_OPERATIONAL: ["id", "codigo_ot", "estado", "estado_atencion", "prioridad", "branch_id", "equipo_id", "cliente_id", "tecnico_asignado_id", "motivo_ingreso"],
  WORK_ORDER_TEAM_AWARENESS: ["id", "codigo_ot", "estado", "estado_atencion", "prioridad", "branch_id", "equipo_id", "tecnico_asignado_id", "motivo_ingreso", "diagnostico_resumido", "ultima_actividad", "ultima_actividad_at"],
  WORK_ORDER_ASSIGNED_TECHNICAL: ["id", "codigo_ot", "organization_id", "branch_id", "cliente_id", "equipo_id", "serie_ingreso", "accesorios_ingreso", "estado_fisico_ingreso", "estado", "prioridad", "tipo_ingreso", "tecnico_asignado_id", "tecnico_revisor_id", "estado_atencion", "ultima_actividad", "ultima_actividad_at", "motivo_pausa", "motivo_ingreso", "observaciones_ingreso", "diagnostico_resumido", "fecha_ingreso", "fecha_revision_inicio", "fecha_diagnostico", "diagnostico_habilitado", "motivo_bloqueo_diagnostico", "qa_cycle_started_at"],
  RECEPTION_CUSTOMER: ["id", "nombre_completo", "identificacion", "tipo_cliente", "telefono", "email", "direccion"],
  RECEPTION_EQUIPMENT: ["id", "cliente_id", "tipo", "marca", "modelo", "serie", "estado_fisico", "accesorios"],
  RECEPTION_WORK_ORDER: ["id", "codigo_ot", "cliente_id", "equipo_id", "estado", "branch_id", "motivo_ingreso", "observaciones_ingreso", "tipo_ingreso", "fecha_ingreso", "terminos_aceptados", "terminos_aceptados_at", "terminos_version"],
  CUSTOMER_SERVICE_WORK_ORDER: ["id", "codigo_ot", "branch_id", "cliente_id", "equipo_id", "estado", "prioridad", "tipo_ingreso", "fecha_entrega_estimada", "motivo_ingreso", "diagnostico_resumido", "fecha_ingreso", "cliente_aprobado"],
  CUSTOMER_SERVICE_APPOINTMENT: ["id", "branch_id", "cliente_id", "tipo", "fecha", "hora_inicio", "hora_fin", "tecnico_asignado_id", "estado", "motivo", "orden_trabajo_id", "recordatorio_enviado"],
  INVENTORY_READ_CONTEXT: ["id", "branch_id", "codigo_interno", "codigo_barras", "sku", "nombre", "descripcion", "categoria_id", "tipo_item", "marca", "modelo", "cantidad_disponible", "cantidad_reservada", "ubicacion", "precio_venta", "punto_reorden", "estado", "compatibilidades"],
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
var projectDeliveryLogMutationResult = (deliveryLog) => timestamps(
  deliveryLog,
  pickProjection(deliveryLog, ALLOWLISTS.DELIVERY_LOG_MUTATION_RESULT)
);
var projectWarrantyMutationResult = (warranty) => timestamps(
  warranty,
  pickProjection(warranty, ALLOWLISTS.WARRANTY_MUTATION_RESULT)
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

// base44/functions/deliverWorkOrder/_shared/commandPolicy.ts
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

// base44/functions/deliverWorkOrder/_shared/commandExecution.ts
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

// base44/functions/deliverWorkOrder/entry.ts
var DELIVERY_ROLES = ["ORG_ADMIN", "BRANCH_ADMIN", "SALES"];
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ success: false, code: "METHOD_NOT_ALLOWED", error: "Metodo no permitido" }, { status: 405 });
  }
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, code: "DELIVERY_UNAUTHENTICATED", error: "No autenticado" }, { status: 401 });
    const authorization = await resolveAuthorizedContext(base44, user);
    if (!authorization.ok) {
      return Response.json({ success: false, code: "DELIVERY_UNAUTHORIZED", error: authorization.error }, { status: authorization.status });
    }
    const body = await req.json();
    const workOrderId = String(body.work_order_id || body.orden_trabajo_id || "").trim();
    if (!workOrderId) throw new DeliveryCommandError("work_order_id es requerido.", "DELIVERY_WORK_ORDER_REQUIRED", 400);
    const [workOrder] = await base44.asServiceRole.entities.OrdenTrabajo.filter({
      id: workOrderId,
      organization_id: authorization.organizationId
    }, 1);
    if (!workOrder) throw new DeliveryCommandError("Orden de trabajo no encontrada.", "DELIVERY_WORK_ORDER_NOT_FOUND", 404);
    const branchDecision = authorizeRecordBranch(authorization, workOrder.branch_id);
    const compatibilityAllowed = DELIVERY_ROLES.includes(authorization.role) && branchDecision.ok && ["FINALIZADA", "ENTREGADA"].includes(workOrder.estado);
    const policyDecision = await evaluateCommandPolicyWithShadow({
      base44,
      policyId: "CP-DEL-001",
      authorization,
      relationship: branchDecision.ok ? "BRANCH_RESOURCE" : "NONE",
      scopeSatisfied: branchDecision.ok,
      preconditionSatisfied: ["FINALIZADA", "ENTREGADA"].includes(workOrder.estado),
      preconditionStatus: 409,
      preconditionCode: "DELIVERY_INVALID_STATE",
      compatibilityDecision: {
        ok: compatibilityAllowed,
        code: compatibilityAllowed ? "ALLOW" : "LEGACY_DELIVERY_DENY"
      },
      audit: {
        actorUserId: user.id,
        branchId: workOrder.branch_id,
        resourceType: "OrdenTrabajo",
        resourceId: workOrder.id,
        correlationId: String(body.operation_key || body.delivery_operation_key || `delivery-shadow:${workOrder.id}:${user.id}`),
        operationKey: body.operation_key || body.delivery_operation_key || null
      }
    });
    return await ExecuteSovereignCommand({
      decision: policyDecision,
      sovereignWriter: "deliverWorkOrder",
      execute: async () => {
        const result = await executeDeliveryCommand(base44, {
          organizationId: authorization.organizationId,
          role: authorization.role,
          actor: { id: user.id, email: user.email },
          authorizeBranch(branchId) {
            const decision2 = authorizeRecordBranch(authorization, branchId);
            if (!decision2.ok) {
              throw new DeliveryCommandError(
                decision2.error,
                decision2.code || "DELIVERY_CROSS_BRANCH_DENIED",
                decision2.status || 403
              );
            }
          }
        }, body);
        await appendAuditEvent(base44, {
          eventType: "WORK_ORDER_DELIVERED",
          principalClass: authorization.principalClass,
          actorUserId: user.id,
          actorPrimaryRole: authorization.persistedRole,
          organizationId: authorization.organizationId,
          branchId: result.work_order.branch_id,
          resourceType: "OrdenTrabajo",
          resourceId: result.work_order.id,
          commandPolicyId: "CP-DEL-001",
          correlationId: result.operation_key,
          auditOperationId: `work-order-delivery:${result.work_order.id}`,
          operationKey: result.operation_key,
          operationSemantics: { from_status: "FINALIZADA", to_status: "ENTREGADA" },
          outcome: result.idempotent ? "IDEMPOTENT_REPLAY" : "COMMITTED",
          priorState: { estado: "FINALIZADA" },
          newState: { estado: "ENTREGADA", delivery_log_id: result.delivery_log?.id || null },
          metadata: { warranty_outcome: result.warranty_outcome, warranty_id: result.warranty?.id || null }
        });
        return Response.json({
          success: result.success === true,
          idempotent: result.idempotent === true,
          recovered: result.recovered === true,
          warranty_outcome: result.warranty_outcome || null,
          non_critical_side_effects: result.non_critical_side_effects ? {
            event_status: result.non_critical_side_effects.event_status || null
          } : null,
          work_order: projectWorkOrderMutationResult(result.work_order),
          delivery_log: projectDeliveryLogMutationResult(result.delivery_log),
          warranty: projectWarrantyMutationResult(result.warranty)
        });
      }
    });
  } catch (error) {
    const status = Number(error?.status) || 500;
    const code = error?.code || "DELIVERY_INTERNAL_ERROR";
    console.error(`[deliverWorkOrder] ${code}: ${error?.message}`);
    return Response.json({
      success: false,
      code,
      error: error?.message || "No se pudo completar la entrega",
      retryable: error?.details?.retryable === true,
      details: error?.details || void 0
    }, { status });
  }
});
