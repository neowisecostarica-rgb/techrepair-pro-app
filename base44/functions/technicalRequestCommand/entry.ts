// base44/functions/technicalRequestCommand/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

// base44/functions/technicalRequestCommand/_shared/controlledPilotAuthority.ts
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

// base44/functions/technicalRequestCommand/_shared/roleCapabilities.ts
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

// base44/functions/technicalRequestCommand/_shared/userAuthorization.ts
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

// base44/functions/technicalRequestCommand/_shared/operationalAuthorization.ts
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

// base44/functions/technicalRequestCommand/_shared/inventoryStockCas.ts
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

// base44/functions/technicalRequestCommand/_shared/branchProtection.ts
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

// base44/functions/technicalRequestCommand/_shared/auditEvent.ts
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

// base44/functions/technicalRequestCommand/_shared/inventoryMutationService.ts
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
    const audit2 = await appendAuditEvent(base44, {
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
    return { ...result, audit_event_id: audit2.event.id };
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

// base44/functions/technicalRequestCommand/_shared/commandPolicy.ts
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

// base44/functions/technicalRequestCommand/_shared/commandExecution.ts
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
async function recordShadowMismatch(base44, authorization, policyId, authoritative, compatibility, audit2) {
  return appendAuditEvent(base44, {
    eventType: "AUTHORIZATION_SHADOW_MISMATCH",
    principalClass: authorization.principalClass,
    actorUserId: audit2.actorUserId || null,
    actorPrimaryRole: authorization.persistedRole || authorization.role || null,
    organizationId: authorization.organizationId,
    branchId: audit2.branchId || null,
    resourceType: audit2.resourceType,
    resourceId: audit2.resourceId,
    commandPolicyId: policyId,
    correlationId: audit2.correlationId,
    auditOperationId: crypto.randomUUID(),
    operationKey: audit2.operationKey || null,
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
  audit: audit2 = null
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
  if (!audit2 || !base44 || !authorization?.organizationId) {
    return authoritative.ok ? denyFrom(authoritative, "SHADOW_AUTHORIZATION_AUDIT_CONTEXT_REQUIRED", shadow) : seal(authoritative, shadow);
  }
  try {
    await recordShadowMismatch(base44, authorization, policyId, authoritative, compatibility, audit2);
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

// base44/functions/technicalRequestCommand/entry.ts
var MODES = /* @__PURE__ */ new Set(["EXISTING_STOCK", "NEW_SPEND"]);
var TYPES = /* @__PURE__ */ new Set(["repuesto", "suministro", "herramienta"]);
function fail(error, status = 400, code = "TECHNICAL_REQUEST_INVALID", details = {}) {
  return Response.json({ error, code, ...details }, { status });
}
async function one(entity, query) {
  const rows = await entity.filter(query, "-created_date", 2);
  if (rows?.length > 1) throw Object.assign(new Error("Estado duplicado"), { code: "TECHNICAL_REQUEST_AMBIGUOUS", status: 409 });
  return rows?.[0] || null;
}
function project(request) {
  return {
    id: request.id,
    organization_id: request.organization_id,
    branch_id: request.branch_id,
    orden_trabajo_id: request.orden_trabajo_id,
    tecnico_id: request.tecnico_id,
    requester_user_id: request.requester_user_id || request.tecnico_id,
    tipo: request.tipo,
    descripcion: request.descripcion,
    cantidad: request.cantidad,
    estado: request.estado,
    fulfillment_mode: request.fulfillment_mode,
    inventario_id: request.inventario_id || null,
    motivo_rechazo: request.motivo_rechazo || null,
    aprobado_por: request.approver_user_id || request.aprobado_por || null,
    aprobado_at: request.aprobado_at || null,
    entregado_por: request.fulfiller_user_id || request.entregado_por || null,
    entregado_at: request.fulfilled_at || request.entregado_at || null,
    inventory_reservation_id: request.inventory_reservation_id || null,
    inventory_movement_id: request.inventory_movement_id || null,
    inventory_operation_key: request.inventory_operation_key || null,
    created_date: request.created_date || null
  };
}
function requireCapability(authorization, capability) {
  if (!authorization.capabilities.includes(capability)) {
    throw Object.assign(new Error("La capacidad requerida no esta autorizada"), { code: "CAPABILITY_DENIED", status: 403 });
  }
}
async function audit(base44, authorization, user, request, eventType, policyId, correlationId, priorState, newState, metadata = {}) {
  return appendAuditEvent(base44, {
    eventType,
    principalClass: authorization.principalClass,
    actorUserId: user.id,
    actorPrimaryRole: authorization.persistedRole,
    effectiveTechnicianUserId: request.tecnico_id === user.id ? user.id : null,
    organizationId: authorization.organizationId,
    branchId: request.branch_id,
    resourceType: "SolicitudTecnica",
    resourceId: request.id,
    commandPolicyId: policyId,
    correlationId,
    auditOperationId: `technical-request:${request.id}:${eventType}`,
    operationKey: metadata.inventory_operation_key || null,
    operationSemantics: {
      event_type: eventType,
      from_state: priorState?.estado || null,
      to_state: newState?.estado || null
    },
    priorState,
    newState,
    custodySnapshot: { orden_trabajo_id: request.orden_trabajo_id, requester_user_id: request.requester_user_id || request.tecnico_id },
    metadata
  });
}
async function loadRequest(base44, organizationId, id) {
  return one(base44.asServiceRole.entities.SolicitudTecnica, { id, organization_id: organizationId });
}
async function loadWorkOrder(base44, organizationId, id) {
  return one(base44.asServiceRole.entities.OrdenTrabajo, { id, organization_id: organizationId });
}
async function assertRequestScope(authorization, request) {
  const scope = authorizeRecordBranch(authorization, request.branch_id);
  if (!scope.ok) throw Object.assign(new Error(scope.error), { code: scope.code, status: scope.status });
}
async function mutateState(base44, authorization, user, request, { from, to, set, eventType, policyId, correlationId }) {
  if (!from.includes(request.estado)) throw Object.assign(new Error(`Transicion ${request.estado} -> ${to} no permitida`), { code: "TECHNICAL_REQUEST_STATE_CONFLICT", status: 409 });
  const result = await base44.asServiceRole.entities.SolicitudTecnica.updateMany({
    id: request.id,
    organization_id: authorization.organizationId,
    estado: request.estado
  }, { $set: { estado: to, ...set } });
  const current = await loadRequest(base44, authorization.organizationId, request.id);
  if (result?.updated !== 1 && current?.estado !== to) throw Object.assign(new Error("La solicitud cambio concurrentemente"), { code: "TECHNICAL_REQUEST_CAS_CONFLICT", status: 409 });
  try {
    await audit(base44, authorization, user, current, eventType, policyId, correlationId, { estado: request.estado }, { estado: to });
  } catch (error) {
    await base44.asServiceRole.entities.SolicitudTecnica.updateMany({ id: request.id, organization_id: authorization.organizationId, estado: to }, { $set: { estado: request.estado } }).catch(() => null);
    throw error;
  }
  return current;
}
async function fulfill(base44, authorization, user, request, body) {
  requireCapability(authorization, "INVENTORY_OPERATIONS");
  await assertRequestScope(authorization, request);
  const expectedState = request.fulfillment_mode === "EXISTING_STOCK" ? "requested" : "approved";
  const operationKey = typeof body.operation_key === "string" ? body.operation_key.trim().slice(0, 240) : "";
  const inventoryId = String(request.inventario_id || body.inventory_id || "").trim();
  if (!operationKey || !inventoryId) throw Object.assign(new Error("operation_key e inventory_id son requeridos"), { code: "TECHNICAL_REQUEST_FULFILL_CONTEXT_REQUIRED", status: 400 });
  if (request.estado === "fulfilled") {
    if (request.inventory_operation_key !== operationKey) throw Object.assign(new Error("La solicitud ya fue entregada por otra operacion"), { code: "TECHNICAL_REQUEST_ALREADY_FULFILLED", status: 409 });
    await audit(base44, authorization, user, request, "TECHNICAL_REQUEST_FULFILLED", "CP-REQ-003", operationKey, { estado: expectedState }, { estado: "fulfilled" }, { inventory_operation_key: operationKey, reconciled: true });
    return { request, idempotent: true };
  }
  if (request.estado !== expectedState) throw Object.assign(new Error(`La solicitud ${request.fulfillment_mode} debe estar en ${expectedState}`), { code: "TECHNICAL_REQUEST_STATE_CONFLICT", status: 409 });
  if (request.inventory_operation_key && request.inventory_operation_key !== operationKey) throw Object.assign(new Error("Otra operacion reclamo la solicitud"), { code: "TECHNICAL_REQUEST_FULFILLMENT_CLAIMED", status: 409 });
  const inventory = await one(base44.asServiceRole.entities.Inventario, { id: inventoryId, organization_id: authorization.organizationId, branch_id: request.branch_id });
  if (!inventory) throw Object.assign(new Error("Inventario no encontrado en la sucursal"), { code: "TECHNICAL_REQUEST_INVENTORY_NOT_FOUND", status: 404 });
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (!request.inventory_operation_key) {
    await base44.asServiceRole.entities.SolicitudTecnica.updateMany({
      id: request.id,
      organization_id: authorization.organizationId,
      estado: expectedState,
      inventory_operation_key: request.inventory_operation_key || null
    }, { $set: {
      inventory_operation_key: operationKey,
      fulfillment_status: "PENDING",
      fulfillment_claimed_at: now,
      fulfillment_error: null,
      fulfiller_user_id: user.id,
      inventario_id: inventoryId
    } });
    request = await loadRequest(base44, authorization.organizationId, request.id);
    if (request?.inventory_operation_key !== operationKey) throw Object.assign(new Error("Otra operacion reclamo la solicitud"), { code: "TECHNICAL_REQUEST_FULFILLMENT_CLAIMED", status: 409 });
  }
  let reserveResult;
  let consumeResult;
  try {
    reserveResult = await executeInventoryCommand(base44, {
      organizationId: authorization.organizationId,
      branchId: request.branch_id,
      actorId: user.id,
      operationKey: `${operationKey}:reserve`,
      referenceType: "TECHNICAL_REQUEST",
      referenceId: request.id,
      reason: `Reserva para solicitud tecnica ${request.id}`,
      movements: [{ inventoryId, movementType: "RESERVE", quantity: Number(request.cantidad), workOrderId: request.orden_trabajo_id }]
    });
    const reservationId = reserveResult.results?.[0]?.reservation_id;
    if (!reservationId) throw Object.assign(new Error("La reserva no produjo referencia durable"), { code: "TECHNICAL_REQUEST_RESERVATION_REFERENCE_MISSING", status: 500 });
    consumeResult = await executeInventoryCommand(base44, {
      organizationId: authorization.organizationId,
      branchId: request.branch_id,
      actorId: user.id,
      operationKey: `${operationKey}:consume`,
      referenceType: "TECHNICAL_REQUEST",
      referenceId: request.id,
      reason: `Entrega para solicitud tecnica ${request.id}`,
      movements: [{ inventoryId, movementType: "CONSUME", quantity: Number(request.cantidad), reservationId, workOrderId: request.orden_trabajo_id }]
    });
    const movementId = consumeResult.results?.[0]?.movement_id;
    const update = await base44.asServiceRole.entities.SolicitudTecnica.updateMany({
      id: request.id,
      organization_id: authorization.organizationId,
      estado: expectedState,
      inventory_operation_key: operationKey,
      fulfillment_status: "PENDING"
    }, { $set: {
      estado: "fulfilled",
      fulfillment_status: "COMMITTED",
      inventory_reservation_id: reservationId,
      inventory_movement_id: movementId,
      fulfiller_user_id: user.id,
      entregado_por: user.id,
      fulfilled_at: now,
      entregado_at: now,
      fulfillment_error: null
    } });
    const committed = await loadRequest(base44, authorization.organizationId, request.id);
    if (update?.updated !== 1 && !(committed?.estado === "fulfilled" && committed?.inventory_operation_key === operationKey)) {
      throw Object.assign(new Error("Inventario comprometido; reintente con la misma operation_key para reconciliar"), { code: "TECHNICAL_REQUEST_RECONCILIATION_REQUIRED", status: 500 });
    }
    await audit(base44, authorization, user, committed, "TECHNICAL_REQUEST_FULFILLED", "CP-REQ-003", operationKey, { estado: expectedState }, { estado: "fulfilled" }, {
      inventory_operation_key: operationKey,
      inventory_id: inventoryId,
      inventory_reservation_id: reservationId,
      inventory_movement_id: movementId,
      reserve_idempotent: reserveResult.idempotent,
      consume_idempotent: consumeResult.idempotent
    });
    return { request: committed, idempotent: Boolean(reserveResult.idempotent || consumeResult.idempotent) };
  } catch (error) {
    await base44.asServiceRole.entities.SolicitudTecnica.updateMany({ id: request.id, organization_id: authorization.organizationId, inventory_operation_key: operationKey }, { $set: { fulfillment_error: String(error.message || error).slice(0, 500) } }).catch(() => null);
    throw error;
  }
}
Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return fail("Metodo no permitido", 405, "METHOD_NOT_ALLOWED");
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return fail("No autenticado", 401, "AUTH_REQUIRED");
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").trim().toUpperCase();
    const authorization = await resolveAuthorizedContext(base44, user);
    if (!authorization.ok) return fail(authorization.error, authorization.status, authorization.code);
    if (action === "LIST_WORK_ORDER") {
      requireCapability(authorization, "TECHNICAL_WORK");
      const ot = await loadWorkOrder(base44, authorization.organizationId, body.orden_trabajo_id);
      if (!ot) return fail("Orden no encontrada", 404, "WORK_ORDER_NOT_FOUND");
      const scope = authorizeRecordBranch(authorization, ot.branch_id);
      if (!scope.ok) return fail(scope.error, scope.status, scope.code);
      if (authorization.normalizedRole === "TECHNICIAN" && ot.tecnico_asignado_id !== user.id) return fail("Orden no asignada", 403, "EFFECTIVE_TECHNICIAN_REQUIRED");
      const rows = await base44.asServiceRole.entities.SolicitudTecnica.filter({ organization_id: authorization.organizationId, orden_trabajo_id: ot.id }, "-created_date", 500);
      return Response.json({ requests: (rows || []).map(project) });
    }
    if (action === "LIST_PENDING") {
      if (!authorization.capabilities.includes("INVENTORY_OPERATIONS") && !authorization.capabilities.includes("BRANCH_ADMINISTRATION") && !authorization.capabilities.includes("ORG_ADMINISTRATION")) return fail("No autorizado", 403, "CAPABILITY_DENIED");
      const filter = { organization_id: authorization.organizationId, estado: { $in: ["requested", "approved"] } };
      if (authorization.scope === "SINGLE_BRANCH") filter.branch_id = authorization.branchId;
      const rows = await base44.asServiceRole.entities.SolicitudTecnica.filter(filter, "-created_date", 500);
      return Response.json({ requests: (rows || []).map(project) });
    }
    if (action === "CREATE_DRAFT") {
      requireCapability(authorization, "TECHNICAL_WORK");
      if (!MODES.has(body.fulfillment_mode) || !TYPES.has(body.tipo)) return fail("Tipo o fulfillment_mode invalido", 422, "TECHNICAL_REQUEST_CLASSIFICATION_REQUIRED");
      const quantity = Number(body.cantidad);
      if (!Number.isFinite(quantity) || quantity <= 0 || !String(body.descripcion || "").trim()) return fail("Descripcion y cantidad valida son requeridas", 422);
      if (body.fulfillment_mode === "EXISTING_STOCK" && !body.inventory_id) return fail("inventory_id es requerido para EXISTING_STOCK", 422, "TECHNICAL_REQUEST_INVENTORY_REQUIRED");
      const ot = await loadWorkOrder(base44, authorization.organizationId, body.orden_trabajo_id);
      if (!ot) return fail("Orden no encontrada", 404, "WORK_ORDER_NOT_FOUND");
      const scope = authorizeRecordBranch(authorization, ot.branch_id);
      if (!scope.ok) return fail(scope.error, scope.status, scope.code);
      if (ot.tecnico_asignado_id !== user.id) return fail("Debes asumir custodia tecnica antes de solicitar", 403, "EFFECTIVE_TECHNICIAN_REQUIRED");
      const request2 = await base44.asServiceRole.entities.SolicitudTecnica.create({
        organization_id: authorization.organizationId,
        branch_id: ot.branch_id,
        orden_trabajo_id: ot.id,
        tecnico_id: user.id,
        requester_user_id: user.id,
        tipo: body.tipo,
        descripcion: String(body.descripcion).trim().slice(0, 500),
        cantidad: quantity,
        estado: "draft",
        fulfillment_mode: body.fulfillment_mode,
        inventario_id: body.inventory_id || null
      });
      const correlationId2 = body.correlation_id || crypto.randomUUID();
      try {
        await audit(base44, authorization, user, request2, "TECHNICAL_REQUEST_DRAFTED", "CP-REQ-001", correlationId2, {}, { estado: "draft" });
      } catch (error) {
        await base44.asServiceRole.entities.SolicitudTecnica.delete(request2.id).catch(() => null);
        throw error;
      }
      return Response.json({ request: project(request2) });
    }
    const request = await loadRequest(base44, authorization.organizationId, body.request_id);
    if (!request) return fail("Solicitud no encontrada", 404, "TECHNICAL_REQUEST_NOT_FOUND");
    await assertRequestScope(authorization, request);
    const correlationId = body.correlation_id || crypto.randomUUID();
    if (action === "SUBMIT") {
      requireCapability(authorization, "TECHNICAL_WORK");
      if ((request.requester_user_id || request.tecnico_id) !== user.id || request.tecnico_id !== user.id) return fail("Solo el solicitante tecnico puede enviar", 403, "EFFECTIVE_TECHNICIAN_REQUIRED");
      const current = await mutateState(base44, authorization, user, request, { from: ["draft"], to: "requested", set: { requested_at: (/* @__PURE__ */ new Date()).toISOString() }, eventType: "TECHNICAL_REQUEST_SUBMITTED", policyId: "CP-REQ-001", correlationId });
      return Response.json({ request: project(current) });
    }
    if (action === "APPROVE") {
      if (!authorization.capabilities.includes("BRANCH_ADMINISTRATION") && !authorization.capabilities.includes("ORG_ADMINISTRATION")) return fail("Solo un administrador puede aprobar gasto nuevo", 403, "CAPABILITY_DENIED");
      if (request.fulfillment_mode !== "NEW_SPEND") return fail("EXISTING_STOCK no requiere aprobacion", 409, "TECHNICAL_REQUEST_APPROVAL_NOT_REQUIRED");
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const current = await mutateState(base44, authorization, user, request, { from: ["requested"], to: "approved", set: { approver_user_id: user.id, aprobado_por: user.id, aprobado_at: now }, eventType: "TECHNICAL_REQUEST_APPROVED", policyId: "CP-REQ-002", correlationId });
      return Response.json({ request: project(current) });
    }
    if (action === "REJECT") {
      if (!authorization.capabilities.includes("BRANCH_ADMINISTRATION") && !authorization.capabilities.includes("ORG_ADMINISTRATION")) return fail("Solo un administrador puede rechazar", 403, "CAPABILITY_DENIED");
      const reason = String(body.reason || "").trim().slice(0, 500);
      if (!reason) return fail("Motivo requerido", 422, "TECHNICAL_REQUEST_REJECTION_REASON_REQUIRED");
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const current = await mutateState(base44, authorization, user, request, { from: ["requested", "approved"], to: "rejected", set: { motivo_rechazo: reason, rejected_by_user_id: user.id, rejected_at: now }, eventType: "TECHNICAL_REQUEST_REJECTED", policyId: "CP-REQ-002", correlationId });
      return Response.json({ request: project(current) });
    }
    if (action === "FULFILL") {
      const expectedState = request.fulfillment_mode === "EXISTING_STOCK" ? "requested" : "approved";
      const preconditionSatisfied = request.estado === expectedState || request.estado === "fulfilled";
      const compatibilityAllowed = authorization.capabilities.includes("INVENTORY_OPERATIONS") && preconditionSatisfied;
      const policyDecision = await evaluateCommandPolicyWithShadow({
        base44,
        policyId: "CP-REQ-003",
        authorization,
        relationship: "INVENTORY_FULFILLER",
        preconditionSatisfied,
        preconditionStatus: 409,
        preconditionCode: "TECHNICAL_REQUEST_STATE_CONFLICT",
        compatibilityDecision: {
          ok: compatibilityAllowed,
          code: compatibilityAllowed ? "ALLOW" : "LEGACY_TECHNICAL_REQUEST_FULFILL_DENY"
        },
        audit: {
          actorUserId: user.id,
          branchId: request.branch_id,
          resourceType: "SolicitudTecnica",
          resourceId: request.id,
          correlationId: String(body.operation_key || `request-fulfill-shadow:${request.id}:${user.id}`),
          operationKey: body.operation_key || null
        }
      });
      return await ExecuteSovereignCommand({
        decision: policyDecision,
        sovereignWriter: "technicalRequestCommand->inventoryMutationService",
        execute: async () => {
          const result = await fulfill(base44, authorization, user, request, body);
          return Response.json({ request: project(result.request), idempotent: result.idempotent });
        }
      });
    }
    return fail("Accion no soportada", 400, "TECHNICAL_REQUEST_ACTION_INVALID");
  } catch (error) {
    return fail(error.message || "No se pudo procesar la solicitud", error.status || 500, error.code || "TECHNICAL_REQUEST_FAILED", { retryable: (error.status || 500) >= 500 });
  }
});