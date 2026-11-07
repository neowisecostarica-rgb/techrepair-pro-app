// base44/functions/manageBranchLifecycle/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

// base44/functions/manageBranchLifecycle/_shared/controlledPilotAuthority.ts
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

// base44/functions/manageBranchLifecycle/_shared/roleCapabilities.ts
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

// base44/functions/manageBranchLifecycle/_shared/userAuthorization.ts
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

// base44/functions/manageBranchLifecycle/_shared/branchProtection.ts
function normalizeBranchName(value) {
  return String(value || "").normalize("NFKD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("es");
}

// base44/functions/manageBranchLifecycle/_shared/branchLifecycle.ts
var ACTIONS = /* @__PURE__ */ new Set(["CREATE", "UPDATE_DETAILS", "DEACTIVATE", "REACTIVATE"]);
var TERMINAL_WORK_ORDER_STATES = ["ENTREGADA", "CANCELADA"];
var ACTIVE_RESERVATION_STATES = ["PENDING", "RESERVED"];
var BRANCH_SCAN_LIMIT = 1001;
var ACTIVITY_SCAN_LIMIT = 1001;
var SALE_LOCK_TTL_MS = 15 * 60 * 1e3;
var BranchLifecycleError = class extends Error {
  code;
  status;
  details;
  constructor(message, code = "BRANCH_LIFECYCLE_FAILED", status = 409, details = {}) {
    super(message);
    this.name = "BranchLifecycleError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
};
function clean(value, maxLength) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}
async function sha256(value) {
  const encoded = new TextEncoder().encode(JSON.stringify(stable(value)));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function normalizeBranchLifecycleRequest(input = {}) {
  const requestedAction = clean(input.action, 40).toUpperCase();
  if (requestedAction === "DELETE") {
    throw new BranchLifecycleError(
      "Las sucursales no pueden eliminarse fisicamente en el MVP.",
      "BRANCH_HARD_DELETE_FORBIDDEN",
      409
    );
  }
  if (!ACTIONS.has(requestedAction)) {
    throw new BranchLifecycleError("Accion de lifecycle invalida.", "BRANCH_ACTION_INVALID", 400);
  }
  const authorityFields = [
    "organization_id",
    "deactivated_at",
    "deactivated_by",
    "reactivated_at",
    "reactivated_by",
    "normalized_name",
    "lifecycle_operation_key",
    "lifecycle_request_fingerprint",
    "lifecycle_action",
    "lifecycle_committed_at",
    "sale_lock_token",
    "sale_lock_operation_key",
    "sale_lock_at"
  ];
  if (authorityFields.some((field) => Object.hasOwn(input, field))) {
    throw new BranchLifecycleError("El payload intenta controlar metadata soberana.", "BRANCH_AUTHORITY_FIELD_FORBIDDEN", 403);
  }
  if (requestedAction === "UPDATE_DETAILS" && Object.hasOwn(input, "active")) {
    throw new BranchLifecycleError("UPDATE_DETAILS no puede cambiar active.", "BRANCH_ACTIVE_CHANGE_FORBIDDEN", 403);
  }
  const operationKey = clean(input.operation_key, 180);
  if (operationKey.length < 12) {
    throw new BranchLifecycleError("operation_key es obligatorio y debe ser estable.", "BRANCH_OPERATION_KEY_INVALID", 400);
  }
  const branchId = clean(input.branch_id, 180) || null;
  const name = input.name === void 0 ? void 0 : clean(input.name, 160);
  const address = input.address === void 0 ? void 0 : clean(input.address, 500) || null;
  const phone = input.phone === void 0 ? void 0 : clean(input.phone, 80) || null;
  const reason = input.reason === void 0 ? void 0 : clean(input.reason, 500);
  if (requestedAction === "CREATE") {
    if (!name) throw new BranchLifecycleError("El nombre de la sucursal es obligatorio.", "BRANCH_NAME_REQUIRED", 400);
    if (input.active === false) {
      throw new BranchLifecycleError("Una sucursal nueva debe iniciar activa.", "BRANCH_CREATE_INACTIVE_FORBIDDEN", 409);
    }
  } else if (!branchId) {
    throw new BranchLifecycleError("branch_id es obligatorio.", "BRANCH_ID_REQUIRED", 400);
  }
  if (requestedAction === "UPDATE_DETAILS" && name === void 0 && address === void 0 && phone === void 0) {
    throw new BranchLifecycleError("No hay detalles permitidos para actualizar.", "BRANCH_DETAILS_REQUIRED", 400);
  }
  if (requestedAction === "UPDATE_DETAILS" && name !== void 0 && !name) {
    throw new BranchLifecycleError("El nombre no puede quedar vacio.", "BRANCH_NAME_REQUIRED", 400);
  }
  if (requestedAction === "DEACTIVATE" && !reason) {
    throw new BranchLifecycleError("El motivo de desactivacion es obligatorio.", "BRANCH_DEACTIVATION_REASON_REQUIRED", 400);
  }
  return {
    action: requestedAction,
    operation_key: operationKey,
    branch_id: branchId,
    ...name !== void 0 ? { name } : {},
    ...address !== void 0 ? { address } : {},
    ...phone !== void 0 ? { phone } : {},
    ...reason !== void 0 ? { reason } : {}
  };
}
function snapshotBranch(branch) {
  if (!branch) return null;
  return {
    id: branch.id,
    organization_id: branch.organization_id,
    name: branch.name,
    address: branch.address || null,
    phone: branch.phone || null,
    active: branch.active === true,
    deactivated_at: branch.deactivated_at || null,
    deactivated_by: branch.deactivated_by || null,
    deactivation_reason: branch.deactivation_reason || null,
    reactivated_at: branch.reactivated_at || null,
    reactivated_by: branch.reactivated_by || null
  };
}
async function findOne(entity, query) {
  const records = await entity.filter(query, "-created_date", 1);
  return records?.[0] || null;
}
async function loadBranch(base44, organizationId, branchId) {
  return findOne(base44.asServiceRole.entities.Branch, { id: branchId, organization_id: organizationId });
}
async function findOperation(base44, organizationId, operationKey) {
  return findOne(base44.asServiceRole.entities.BranchLifecycleOperation, {
    organization_id: organizationId,
    operation_key: operationKey
  });
}
async function createOrRecoverOperation(base44, data) {
  try {
    return await base44.asServiceRole.entities.BranchLifecycleOperation.create(data);
  } catch (error) {
    const recovered = await findOperation(base44, data.organization_id, data.operation_key);
    if (recovered) return recovered;
    throw error;
  }
}
async function commitOperation(base44, operation, result, committedAt) {
  const committedResult = { ...result, operation_id: operation.id };
  try {
    await base44.asServiceRole.entities.BranchLifecycleOperation.update(operation.id, {
      branch_id: committedResult.branch?.id || operation.branch_id || null,
      status: "COMMITTED",
      committed_at: committedAt,
      result_snapshot: committedResult
    });
  } catch (error) {
    const recovered = await findOperation(base44, operation.organization_id, operation.operation_key);
    if (recovered?.status !== "COMMITTED") throw error;
  }
  return committedResult;
}
function isFreshLock(timestamp) {
  const parsed = Date.parse(String(timestamp || ""));
  return !Number.isFinite(parsed) || Date.now() - parsed <= SALE_LOCK_TTL_MS;
}
async function findDeactivationBlockers(base44, organizationId, branch) {
  const entities = base44.asServiceRole.entities;
  const [users, workOrders, reservations, sales, pendingDeliveries, pendingLifecycle, quotes] = await Promise.all([
    entities.UserAccount.filter({ organization_id: organizationId, branch_id: branch.id, status: { $in: ["active", "invited"] } }, "-created_date", 2),
    entities.OrdenTrabajo.filter({ organization_id: organizationId, branch_id: branch.id, estado: { $nin: TERMINAL_WORK_ORDER_STATES } }, "-created_date", 2),
    entities.InventarioReserva.filter({ organization_id: organizationId, branch_id: branch.id, state: { $in: ACTIVE_RESERVATION_STATES } }, "-created_date", 2),
    entities.Venta.filter({ organization_id: organizationId, branch_id: branch.id, $or: [
      { estado: { $in: ["procesando", "inconsistente"] } },
      { inventory_commit_status: "PENDING" },
      { post_sale_status: "PENDING" }
    ] }, "-created_date", 2),
    entities.OrdenTrabajo.filter({ organization_id: organizationId, branch_id: branch.id, delivery_status: "PENDING" }, "-created_date", 2),
    entities.OrdenTrabajo.filter({ organization_id: organizationId, branch_id: branch.id, lifecycle_lock_token: { $exists: true } }, "-created_date", 2),
    entities.Cotizacion.filter({ organization_id: organizationId, branch_id: branch.id, decision_status: "PENDING" }, "-created_date", 2)
  ]);
  const blockers = [];
  const add = (category, records) => {
    if (records?.length) blockers.push({ category, ids: records.map((record) => record.id).filter(Boolean).slice(0, 10) });
  };
  add("assigned_users", users);
  add("non_terminal_work_orders", workOrders);
  add("active_inventory_reservations", reservations);
  add("pending_sale_operations", sales);
  add("pending_delivery_operations", pendingDeliveries);
  add("pending_work_order_lifecycle", pendingLifecycle);
  add("pending_quote_lifecycle", quotes);
  if (branch.sale_lock_token && isFreshLock(branch.sale_lock_at)) {
    blockers.push({ category: "pending_sale_lock", ids: [branch.id] });
  }
  const activeActivities = await entities.ActividadTecnica.filter({
    organization_id: organizationId,
    estado: "en_progreso"
  }, "-created_date", ACTIVITY_SCAN_LIMIT);
  if ((activeActivities || []).length >= ACTIVITY_SCAN_LIMIT) {
    blockers.push({ category: "activity_scan_truncated", ids: [] });
  } else {
    const matching = [];
    for (const activity of activeActivities || []) {
      const parent = await loadBranchWorkOrder(entities, organizationId, activity.orden_trabajo_id);
      if (!parent) {
        blockers.push({ category: "active_activity_parent_unresolved", ids: [activity.id] });
      } else if (parent.branch_id === branch.id) matching.push(activity);
    }
    add("active_technical_activities", matching);
  }
  return blockers;
}
async function loadBranchWorkOrder(entities, organizationId, workOrderId) {
  return findOne(entities.OrdenTrabajo, { id: workOrderId, organization_id: organizationId });
}
async function ensureUniqueName(base44, organizationId, normalizedName, excludeId = null) {
  const branches = await base44.asServiceRole.entities.Branch.filter({ organization_id: organizationId }, "-created_date", BRANCH_SCAN_LIMIT);
  if ((branches || []).length >= BRANCH_SCAN_LIMIT) {
    throw new BranchLifecycleError("No fue posible completar el scan de nombres.", "BRANCH_NAME_SCAN_TRUNCATED", 409);
  }
  const duplicate = (branches || []).find((candidate) => candidate.id !== excludeId && normalizeBranchName(candidate.normalized_name || candidate.name) === normalizedName);
  if (duplicate) {
    throw new BranchLifecycleError("Ya existe una sucursal con el mismo nombre normalizado.", "BRANCH_NAME_CONFLICT", 409, {
      conflicting_branch_id: duplicate.id
    });
  }
}
async function acquireOrganizationLock(base44, organizationId, fingerprint) {
  const correlationId = crypto.randomUUID();
  const response = await base44.functions.invoke("resourceLockLite", {
    action: "acquireMany",
    organization_id: organizationId,
    operation: "BRANCH_LIFECYCLE",
    correlation_id: correlationId,
    request_fingerprint: fingerprint,
    resources: [`organization:${organizationId}:branch-lifecycle`]
  });
  const result = response?.data ?? response;
  if (!result?.success || !result?.lease) {
    throw new BranchLifecycleError(
      result?.error || "No fue posible adquirir el lock organizacional.",
      result?.code || "BRANCH_LIFECYCLE_LOCK_FAILED",
      result?.status || 423,
      { retryable: true }
    );
  }
  return result.lease;
}
async function releaseOrganizationLock(base44, lease) {
  const response = await base44.functions.invoke("resourceLockLite", {
    action: "releaseMany",
    organization_id: lease.organization_id,
    operation: "BRANCH_LIFECYCLE",
    correlation_id: lease.correlation_id,
    lease
  });
  return response?.data ?? response;
}
async function executeBranchLifecycle(base44, context, rawInput, options = {}) {
  if (context?.role !== "ORG_ADMIN" || !context?.organizationId || !context?.actor?.id) {
    throw new BranchLifecycleError("Solo ORG_ADMIN puede gestionar sucursales.", "BRANCH_LIFECYCLE_FORBIDDEN", 403);
  }
  const input = normalizeBranchLifecycleRequest(rawInput);
  const fingerprint = await sha256(input);
  const now = options.now || (() => (/* @__PURE__ */ new Date()).toISOString());
  const acquire = options.acquireLock || (() => acquireOrganizationLock(base44, context.organizationId, fingerprint));
  const release = options.releaseLock || ((lease2) => releaseOrganizationLock(base44, lease2));
  let lease = null;
  try {
    lease = await acquire();
    const organization = await findOne(base44.asServiceRole.entities.Organization, {
      id: context.organizationId,
      status: "active"
    });
    if (!organization) {
      throw new BranchLifecycleError("La organizacion no existe o no esta activa.", "BRANCH_ORGANIZATION_INACTIVE", 409);
    }
    let operation = await findOperation(base44, context.organizationId, input.operation_key);
    if (operation) {
      if (operation.request_fingerprint !== fingerprint) {
        throw new BranchLifecycleError("operation_key ya fue usada con otro payload.", "BRANCH_FINGERPRINT_CONFLICT", 409);
      }
      if (operation.status === "COMMITTED") {
        return { ...operation.result_snapshot, operation_id: operation.id, idempotent: true, recovered: true };
      }
      const recoveredBranch = await findOne(base44.asServiceRole.entities.Branch, {
        organization_id: context.organizationId,
        lifecycle_operation_key: input.operation_key,
        lifecycle_request_fingerprint: fingerprint
      });
      if (recoveredBranch) {
        const recovered = {
          success: true,
          action: input.action,
          branch: snapshotBranch(recoveredBranch),
          idempotent: true,
          recovered: true
        };
        return commitOperation(base44, operation, recovered, recoveredBranch.lifecycle_committed_at || now());
      }
    } else {
      const pending = await base44.asServiceRole.entities.BranchLifecycleOperation.filter({
        organization_id: context.organizationId,
        status: "PENDING"
      }, "-created_date", 2);
      if (pending?.length) {
        throw new BranchLifecycleError(
          "Existe una operacion Branch pendiente que requiere recovery.",
          "BRANCH_LIFECYCLE_RECOVERY_REQUIRED",
          409,
          { pending_operation_keys: pending.map((item) => item.operation_key) }
        );
      }
    }
    let branch = null;
    let blockers = [];
    let mutation = null;
    const committedAt = now();
    if (input.action === "CREATE") {
      const normalizedName = normalizeBranchName(input.name);
      await ensureUniqueName(base44, context.organizationId, normalizedName);
      mutation = {
        organization_id: context.organizationId,
        name: input.name,
        normalized_name: normalizedName,
        address: input.address || null,
        phone: input.phone || null,
        active: true
      };
    } else {
      branch = await loadBranch(base44, context.organizationId, input.branch_id);
      if (!branch) throw new BranchLifecycleError("Sucursal no encontrada.", "BRANCH_NOT_FOUND", 404);
      if (input.action === "UPDATE_DETAILS") {
        const nextName = input.name === void 0 ? branch.name : input.name;
        const normalizedName = normalizeBranchName(nextName);
        await ensureUniqueName(base44, context.organizationId, normalizedName, branch.id);
        mutation = {
          ...input.name !== void 0 ? { name: input.name, normalized_name: normalizedName } : {},
          ...input.address !== void 0 ? { address: input.address } : {},
          ...input.phone !== void 0 ? { phone: input.phone } : {}
        };
      }
      if (input.action === "DEACTIVATE") {
        if (branch.active !== true) {
          mutation = null;
        } else {
          const activeBranches = await base44.asServiceRole.entities.Branch.filter({
            organization_id: context.organizationId,
            active: true
          }, "-created_date", 2);
          if ((activeBranches || []).length <= 1) {
            throw new BranchLifecycleError(
              "La organizacion debe conservar al menos una sucursal activa.",
              "LAST_ACTIVE_BRANCH",
              409
            );
          }
          blockers = await findDeactivationBlockers(base44, context.organizationId, branch);
          if (blockers.length) {
            throw new BranchLifecycleError(
              "La sucursal tiene asignaciones u operaciones activas.",
              "BRANCH_DEACTIVATION_BLOCKED",
              409,
              { blockers }
            );
          }
          mutation = {
            active: false,
            deactivated_at: committedAt,
            deactivated_by: context.actor.id,
            deactivation_reason: input.reason
          };
        }
      }
      if (input.action === "REACTIVATE") {
        mutation = branch.active === true ? null : {
          active: true,
          reactivated_at: committedAt,
          reactivated_by: context.actor.id
        };
      }
    }
    if (!operation) {
      operation = await createOrRecoverOperation(base44, {
        organization_id: context.organizationId,
        branch_id: branch?.id || null,
        operation_key: input.operation_key,
        request_fingerprint: fingerprint,
        action: input.action,
        status: "PENDING",
        actor_user_id: context.actor.id,
        actor_role: context.role,
        started_at: committedAt
      });
      if (operation.request_fingerprint !== fingerprint) {
        throw new BranchLifecycleError("operation_key ya fue usada con otro payload.", "BRANCH_FINGERPRINT_CONFLICT", 409);
      }
    }
    const lifecycleMarkers = {
      lifecycle_operation_key: input.operation_key,
      lifecycle_request_fingerprint: fingerprint,
      lifecycle_action: input.action,
      lifecycle_committed_at: committedAt
    };
    if (input.action === "CREATE") {
      try {
        branch = await base44.asServiceRole.entities.Branch.create({ ...mutation, ...lifecycleMarkers });
      } catch (error) {
        branch = await findOne(base44.asServiceRole.entities.Branch, {
          organization_id: context.organizationId,
          lifecycle_operation_key: input.operation_key,
          lifecycle_request_fingerprint: fingerprint
        });
        if (!branch) throw error;
      }
    } else if (mutation) {
      const compareAndSetQuery = {
        id: branch.id,
        organization_id: context.organizationId,
        ...input.action === "DEACTIVATE" ? { active: true } : {},
        ...input.action === "REACTIVATE" ? { active: false } : {}
      };
      try {
        const updated = await base44.asServiceRole.entities.Branch.updateMany(
          compareAndSetQuery,
          { $set: { ...mutation, ...lifecycleMarkers } }
        );
        if (updated?.updated !== 1) {
          throw new BranchLifecycleError("La sucursal cambio durante la operacion.", "BRANCH_LIFECYCLE_CAS_CONFLICT", 409);
        }
      } catch (error) {
        const reconciled = await loadBranch(base44, context.organizationId, branch.id);
        if (reconciled?.lifecycle_operation_key !== input.operation_key || reconciled?.lifecycle_request_fingerprint !== fingerprint) throw error;
      }
      branch = await loadBranch(base44, context.organizationId, branch.id);
    }
    const result = {
      success: true,
      action: input.action,
      branch: snapshotBranch(branch),
      idempotent: mutation === null,
      recovered: false,
      blockers
    };
    return commitOperation(base44, operation, result, committedAt);
  } finally {
    if (lease) {
      try {
        await release(lease);
      } catch (error) {
        console.error("[manageBranchLifecycle] lock release failed", error);
      }
    }
  }
}

// base44/functions/manageBranchLifecycle/_shared/auditEvent.ts
var MAX_TEXT = 240;
function clean2(value, max = MAX_TEXT) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}
function cleanObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value));
}
function stable2(value) {
  if (Array.isArray(value)) return value.map(stable2);
  if (!value || typeof value !== "object") return value ?? null;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable2(value[key])]));
}
function immutableIdentity(event) {
  return stable2({
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
    event_type: clean2(input.eventType),
    principal_class: clean2(input.principalClass),
    actor_user_id: clean2(input.actorUserId),
    actor_primary_role: clean2(input.actorPrimaryRole),
    effective_technician_user_id: clean2(input.effectiveTechnicianUserId),
    organization_id: clean2(input.organizationId),
    branch_id: clean2(input.branchId),
    resource_type: clean2(input.resourceType),
    resource_id: clean2(input.resourceId),
    command_policy_id: clean2(input.commandPolicyId),
    correlation_id: clean2(input.correlationId),
    external_correlation_id: clean2(input.externalCorrelationId || input.correlationId),
    audit_operation_id: clean2(input.auditOperationId),
    operation_key: clean2(input.operationKey),
    operation_semantics: cleanObject(input.operationSemantics),
    outcome: clean2(input.outcome) || "COMMITTED",
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

// base44/functions/manageBranchLifecycle/_shared/dataProjections.ts
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
var projectInventoryAdmin = (item) => pickProjection(item, [...ALLOWLISTS.INVENTORY_READ_CONTEXT, ...ALLOWLISTS.INVENTORY_ADMIN_ADDITIONAL]);
function projectQuoteItems(items) {
  return Array.isArray(items) ? items.map((item) => pickProjection(item, [
    "id",
    "tipo",
    "referencia_id",
    "descripcion",
    "cantidad",
    "precio_unitario",
    "descuento",
    "subtotal",
    "total"
  ])) : [];
}
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
function projectOperationalReadResult(entityName, record, authorization = {}) {
  const fields = OPERATIONAL_READ_FIELDS[entityName];
  if (!fields) return {};
  const dto = pickProjection(record, fields);
  if (entityName === "Cotizacion" && Array.isArray(dto.items)) dto.items = projectQuoteItems(dto.items);
  if (entityName === "Inventario" && ["ORG_ADMIN", "BRANCH_ADMIN", "INVENTORY"].includes(authorization.role)) {
    return projectInventoryAdmin(record);
  }
  if (entityName === "VentaItem" && authorization.role === "ORG_ADMIN" && record?.costo_unitario_snapshot !== void 0) {
    dto.costo_unitario_snapshot = record.costo_unitario_snapshot;
  }
  return dto;
}

// base44/functions/manageBranchLifecycle/_shared/commandPolicy.ts
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

// base44/functions/manageBranchLifecycle/_shared/commandExecution.ts
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

// base44/functions/manageBranchLifecycle/entry.ts
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Metodo no permitido", code: "METHOD_NOT_ALLOWED" }, { status: 405 });
  }
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "No autenticado", code: "UNAUTHENTICATED" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const authorization = await resolveAuthorizedContext(base44, user, {
      organizationHint: body.organization_id || null
    });
    if (!authorization.ok) {
      return Response.json({ error: authorization.error, code: "BRANCH_LIFECYCLE_FORBIDDEN" }, { status: authorization.status });
    }
    const compatibilityAllowed = authorization.role === "ORG_ADMIN";
    const resourceId = body.branch_id || `pending:${String(body.operation_key || body.action || "branch").slice(0, 180)}`;
    const policyDecision = await evaluateCommandPolicyWithShadow({
      base44,
      policyId: "CP-BR-001",
      authorization,
      relationship: "ORG_RESOURCE",
      compatibilityDecision: {
        ok: compatibilityAllowed,
        code: compatibilityAllowed ? "ALLOW" : "LEGACY_BRANCH_ROLE_DENY"
      },
      audit: {
        actorUserId: user.id,
        branchId: body.branch_id || null,
        resourceType: "Branch",
        resourceId,
        correlationId: String(body.operation_key || `branch-shadow:${resourceId}:${user.id}`),
        operationKey: body.operation_key || null
      }
    });
    return await ExecuteSovereignCommand({
      decision: policyDecision,
      sovereignWriter: "manageBranchLifecycle",
      execute: async () => {
        const result = await executeBranchLifecycle(base44, {
          organizationId: authorization.organizationId,
          role: authorization.role,
          actor: { id: user.id, email: user.email || null }
        }, body);
        await appendAuditEvent(base44, {
          eventType: "BRANCH_LIFECYCLE_COMMITTED",
          principalClass: authorization.principalClass,
          actorUserId: user.id,
          actorPrimaryRole: authorization.persistedRole,
          organizationId: authorization.organizationId,
          branchId: result.branch?.id || body.branch_id || null,
          resourceType: "Branch",
          resourceId: result.branch?.id || body.branch_id,
          commandPolicyId: "CP-BR-001",
          correlationId: body.operation_key,
          auditOperationId: `branch-lifecycle:${result.operation_id}`,
          operationKey: body.operation_key,
          operationSemantics: { action: result.action },
          outcome: result.idempotent ? "IDEMPOTENT_REPLAY" : "COMMITTED",
          newState: { action: result.action, active: result.branch?.active }
        });
        return Response.json({
          success: result.success === true,
          action: result.action,
          branch: projectOperationalReadResult("Branch", result.branch, authorization),
          idempotent: result.idempotent === true,
          recovered: result.recovered === true
        });
      }
    });
  } catch (error) {
    if (error instanceof SovereignCommandError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof BranchLifecycleError) {
      return Response.json({
        error: error.message,
        code: error.code,
        ...error.details
      }, { status: error.status });
    }
    console.error("[manageBranchLifecycle]", error?.message || error);
    return Response.json({ error: "No fue posible gestionar la sucursal", code: "BRANCH_LIFECYCLE_INTERNAL_ERROR" }, { status: 500 });
  }
});