// base44/functions/createInventoryItem/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

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
async function resolveAuthorizedBranch(base44, authorization, requestedBranchId, options = {}) {
  const { allowSingleBranchFallback = false, required = true } = options;
  const branchScope = getCanonicalBranchScope(authorization);
  if (!branchScope.ok) return branchScope;
  const branchCheck = validateRequestedBranch(branchScope, requestedBranchId);
  if (!branchCheck.ok) return branchCheck;
  let branchId = branchScope.organizationWide ? requestedBranchId || null : branchScope.branchId;
  if (!branchId && allowSingleBranchFallback) {
    const branches2 = await base44.asServiceRole.entities.Branch.filter({
      organization_id: authorization.organizationId,
      active: true
    }, "-created_date", 2);
    if (branches2?.length === 1) branchId = branches2[0].id;
  }
  if (!branchId) {
    return required ? { ok: false, status: 400, code: "OPERATIONAL_BRANCH_REQUIRED", error: "La operacion requiere una sucursal autorizada" } : { ok: true, branchId: null, branchScope };
  }
  const branches = await base44.asServiceRole.entities.Branch.filter({
    id: branchId,
    organization_id: authorization.organizationId,
    active: true
  }, "-created_date", 1);
  if (!branches?.length) {
    return { ok: false, status: 403, code: "OPERATIONAL_BRANCH_INVALID", error: "La sucursal no pertenece a la organizacion autorizada" };
  }
  return { ok: true, branchId, branchScope };
}
var WORK_ORDER_EDITABLE_FIELDS = Object.freeze([
  "motivo_ingreso",
  "observaciones_ingreso",
  "tipo_ingreso",
  "prioridad"
]);

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
var projectInventoryAdmin = (item) => pickProjection(item, [...ALLOWLISTS.INVENTORY_READ_CONTEXT, ...ALLOWLISTS.INVENTORY_ADMIN_ADDITIONAL]);
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

// base44/functions/createInventoryItem/entry.ts
function internalCode(organizationId) {
  const org = organizationId.slice(0, 4).toUpperCase();
  const stamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PROD-${org}-${stamp}-${random}`;
}
function duplicateOutside(records, id = null) {
  return (records || []).find((record) => record.id !== id) || null;
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Metodo no permitido" }, { status: 405 });
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });
  const authorization = await resolveAuthorizedContext(base44, user, {
    allowedRoles: ["ORG_ADMIN", "BRANCH_ADMIN", "INVENTORY"]
  });
  if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status });
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body invalido" }, { status: 400 });
  }
  const itemData = body.itemData;
  if (!itemData) return Response.json({ error: "itemData es requerido" }, { status: 400 });
  const branch = await resolveAuthorizedBranch(base44, authorization, itemData.branch_id || body.branch_id, {
    allowSingleBranchFallback: true
  });
  if (!branch.ok) return Response.json({ error: branch.error, code: branch.code }, { status: branch.status });
  const initialQuantity = Number(itemData.cantidad_disponible ?? 0);
  const cost = Number(itemData.costo_unitario);
  if (!String(itemData.nombre || "").trim()) return Response.json({ error: "nombre es requerido" }, { status: 400 });
  if (!itemData.categoria_id) return Response.json({ error: "categoria_id es requerido" }, { status: 400 });
  if (itemData.costo_unitario === null || itemData.costo_unitario === void 0 || String(itemData.costo_unitario).trim() === "" || !Number.isFinite(cost)) {
    return Response.json({ error: "costo_unitario debe ser numerico" }, { status: 400 });
  }
  if (!Number.isFinite(initialQuantity) || initialQuantity < 0) {
    return Response.json({ error: "cantidad_disponible debe ser un numero mayor o igual a 0" }, { status: 400 });
  }
  const forbiddenCreateFields = [
    "last_sale_id",
    "last_sale_operation_key",
    "last_inventory_operation_key",
    "last_inventory_movement_key",
    "fecha_ultimo_movimiento"
  ].filter((field) => Object.hasOwn(itemData, field));
  if (Number(itemData.cantidad_reservada ?? 0) !== 0 || forbiddenCreateFields.length > 0) {
    return Response.json({
      error: "No se permiten reservas ni marcadores fisicos al crear catalogo",
      code: "INVENTORY_SOVEREIGN_FIELD_FORBIDDEN"
    }, { status: 409 });
  }
  const orgId = authorization.organizationId;
  const [category] = await base44.asServiceRole.entities.CategoriaInventario.filter({
    id: itemData.categoria_id,
    organization_id: orgId
  }, 1);
  if (!category) return Response.json({ error: "categoria_id invalida para la organizacion" }, { status: 400 });
  const salePrice = Number(itemData.precio_venta ?? 0);
  if (!category.permite_stock && initialQuantity > 0) {
    return Response.json({ error: `La categoria ${category.nombre} no permite stock` }, { status: 400 });
  }
  if (!category.es_vendible && salePrice > 0) {
    return Response.json({ error: `La categoria ${category.nombre} no es vendible` }, { status: 400 });
  }
  if (category.es_vendible && (!Number.isFinite(salePrice) || salePrice <= 0)) {
    return Response.json({ error: `La categoria ${category.nombre} requiere precio_venta mayor a 0` }, { status: 400 });
  }
  for (const field of ["codigo_barras", "sku", "numero_serie"]) {
    if (!itemData[field]) continue;
    const duplicate = duplicateOutside(await base44.asServiceRole.entities.Inventario.filter({
      organization_id: orgId,
      [field]: itemData[field]
    }, "-created_date", 2));
    if (duplicate) return Response.json({ error: `${field} ya existe: ${duplicate.nombre}` }, { status: 409 });
  }
  let warrantyExpiration = null;
  if (itemData.fecha_compra && Number(itemData.garantia_proveedor_meses) > 0) {
    const date = new Date(itemData.fecha_compra);
    date.setMonth(date.getMonth() + Number(itemData.garantia_proveedor_meses));
    warrantyExpiration = date.toISOString().split("T")[0];
  }
  const created = await base44.asServiceRole.entities.Inventario.create({
    organization_id: orgId,
    branch_id: branch.branchId,
    nombre: itemData.nombre.trim(),
    descripcion: itemData.descripcion || null,
    foto_url: itemData.foto_url || null,
    galeria_fotos: Array.isArray(itemData.galeria_fotos) ? itemData.galeria_fotos : [],
    categoria_id: itemData.categoria_id,
    tipo_item: itemData.tipo_item || "producto",
    marca: itemData.marca || null,
    modelo: itemData.modelo || null,
    codigo_interno: internalCode(orgId),
    codigo_barras: itemData.codigo_barras || null,
    sku: itemData.sku || null,
    numero_serie: itemData.numero_serie || null,
    cantidad_disponible: 0,
    cantidad_reservada: 0,
    ubicacion: itemData.ubicacion || "bodega",
    costo_unitario: cost,
    precio_venta: category.es_vendible ? salePrice : 0,
    punto_reorden: Number(itemData.punto_reorden) || 5,
    proveedor: itemData.proveedor || null,
    fecha_compra: itemData.fecha_compra || null,
    documento_compra: itemData.documento_compra || null,
    garantia_proveedor_meses: itemData.garantia_proveedor_meses || null,
    garantia_proveedor_vence: warrantyExpiration,
    estado: itemData.estado || "activo",
    co2_evitado: Number(itemData.co2_evitado) || 0,
    valor_recuperado: Number(itemData.valor_recuperado) || 0,
    notas_reciclaje: itemData.notas_reciclaje || null
  });
  if (!created?.id) return Response.json({ error: "No se pudo crear el producto" }, { status: 500 });
  let finalItem = created;
  if (initialQuantity > 0) {
    const initialOperationKey = `inventory-initial:${created.id}`;
    try {
      await executeInventoryCommand(base44, {
        organizationId: orgId,
        branchId: branch.branchId,
        actorId: user.id || user.email,
        operationKey: initialOperationKey,
        referenceType: "INVENTORY_ITEM",
        referenceId: created.id,
        reason: "Saldo inicial al crear producto",
        movements: [{ inventoryId: created.id, movementType: "INITIAL_BALANCE", quantity: initialQuantity }]
      });
    } catch (error) {
      const [current] = await base44.asServiceRole.entities.Inventario.filter({ id: created.id, organization_id: orgId }, 1).catch(() => []);
      const ledger = await base44.asServiceRole.entities.InventarioHistorial.filter({
        organization_id: orgId,
        operation_key: initialOperationKey
      }, "-effective_at", 2).catch(() => []);
      if (current?.last_inventory_operation_key === initialOperationKey && ledger?.length === 1) {
        return Response.json({ success: true, data: projectInventoryAdmin(current), recovered: true }, { status: 201 });
      }
      if (current && Number(current.cantidad_disponible || 0) === 0 && Number(current.cantidad_reservada || 0) === 0 && ledger?.length === 0) {
        await base44.asServiceRole.entities.Inventario.delete(created.id).catch(() => null);
      }
      const status = error instanceof InventoryCommandError ? error.status : 500;
      return Response.json({ error: error.message, code: error.code || "INVENTORY_INITIAL_BALANCE_FAILED" }, { status });
    }
    const [reloaded] = await base44.asServiceRole.entities.Inventario.filter({ id: created.id, organization_id: orgId }, 1).catch(() => []);
    finalItem = reloaded || { ...created, cantidad_disponible: initialQuantity, cantidad_reservada: 0 };
  }
  return Response.json({ success: true, data: projectInventoryAdmin(finalItem) }, { status: 201 });
});