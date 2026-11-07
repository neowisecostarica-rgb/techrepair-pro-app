// base44/functions/manageAssetAssignment/entry.ts
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

// base44/functions/manageAssetAssignment/_shared/userAuthorization.ts
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
  const unique2 = /* @__PURE__ */ new Map();
  for (const account of [...byUserId || [], ...byEmail || []]) {
    if (account?.id) unique2.set(account.id, account);
  }
  return [...unique2.values()];
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
    allowedRoles: allowedRoles2 = [],
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
  const normalizedAllowedRoles = allowedRoles2.map(normalizeTenantRole).filter(Boolean);
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

// base44/functions/manageAssetAssignment/_shared/auditEvent.ts
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

// base44/functions/manageAssetAssignment/_shared/entitlementAuthority.ts
var ENTITLEMENT_POLICY_VERSION = "2026-09-c4-v1";
var LEGACY_PACKAGE_FALLBACK = Object.freeze({
  basic: "core",
  pro: "advanced",
  premium: "advanced"
});
var PACKAGE_DEFAULTS = Object.freeze({
  core: {
    capabilities: [
      "CORE_WORKFLOW",
      "ASSET_LIFECYCLE",
      "CUSTOMER_PORTAL",
      "BASIC_BUSINESS_READ",
      "OPERATIONAL_TRACEABILITY"
    ],
    limits: {}
  },
  advanced: {
    capabilities: [
      "CORE_WORKFLOW",
      "ASSET_LIFECYCLE",
      "CUSTOMER_PORTAL",
      "BASIC_BUSINESS_READ",
      "OPERATIONAL_TRACEABILITY",
      "ADVANCED_MULTI_BRANCH",
      "ADVANCED_ANALYTICS",
      "ADVANCED_OPERATIONAL_SUPERVISION",
      "QUALITY_NONCONFORMITY",
      "RECYCLING",
      "ADVANCED_CRM",
      "ADVANCED_AUTOMATION"
    ],
    limits: {}
  },
  enterprise: {
    capabilities: [
      "CORE_WORKFLOW",
      "ASSET_LIFECYCLE",
      "CUSTOMER_PORTAL",
      "BASIC_BUSINESS_READ",
      "OPERATIONAL_TRACEABILITY",
      "ADVANCED_MULTI_BRANCH",
      "ADVANCED_ANALYTICS",
      "ADVANCED_OPERATIONAL_SUPERVISION",
      "QUALITY_NONCONFORMITY",
      "RECYCLING",
      "ADVANCED_CRM",
      "ADVANCED_AUTOMATION",
      "ENTERPRISE_ASSET_CUSTODY",
      "ENTERPRISE_ONBOARDING",
      "ENTERPRISE_OFFBOARDING",
      "ENTERPRISE_COMMAND_EVIDENCE"
    ],
    limits: {}
  }
});
function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}
function isCurrentlyEffective(policy, now = /* @__PURE__ */ new Date()) {
  if (!policy) return false;
  const from = policy.effective_from ? new Date(policy.effective_from) : null;
  const until = policy.effective_until ? new Date(policy.effective_until) : null;
  if (from && Number.isFinite(from.getTime()) && from > now) return false;
  if (until && Number.isFinite(until.getTime()) && until <= now) return false;
  return true;
}
async function resolveEffectiveEntitlement(base44, organization) {
  if (!organization?.id) return null;
  const policies = await base44.asServiceRole.entities.EntitlementPolicy.filter(
    { organization_id: organization.id },
    "-created_date",
    20
  );
  const explicit = (policies || []).find((policy) => isCurrentlyEffective(policy));
  const packageId = explicit?.package_id || LEGACY_PACKAGE_FALLBACK[organization.plan] || "core";
  const defaults = PACKAGE_DEFAULTS[packageId] || PACKAGE_DEFAULTS.core;
  const overrideCapabilities = Array.isArray(explicit?.overrides?.capabilities) ? explicit.overrides.capabilities : [];
  const deniedCapabilities = new Set(
    Array.isArray(explicit?.overrides?.denied_capabilities) ? explicit.overrides.denied_capabilities : []
  );
  const capabilities = unique([
    ...defaults.capabilities,
    ...Array.isArray(explicit?.capabilities) ? explicit.capabilities : [],
    ...overrideCapabilities
  ]).filter((capability) => !deniedCapabilities.has(capability));
  return {
    package_id: packageId,
    billing_status: explicit?.billing_status || (organization.status === "suspended" ? "suspended" : "active"),
    billing_interval: explicit?.billing_interval || null,
    license_status: explicit?.license_status || (explicit ? "pending" : "active"),
    activated_at: explicit?.activated_at || null,
    activation_method: explicit?.activation_method || (explicit ? null : "migration"),
    current_period_start: explicit?.current_period_start || null,
    current_period_end: explicit?.current_period_end || null,
    renewal_at: explicit?.renewal_at || null,
    grace_until: explicit?.grace_until || null,
    cancel_at_period_end: explicit?.cancel_at_period_end === true,
    billing_provider: explicit?.billing_provider || null,
    policy_version: explicit?.policy_version || ENTITLEMENT_POLICY_VERSION,
    capabilities,
    limits: {
      ...defaults.limits,
      ...explicit?.limits || {},
      ...explicit?.overrides?.limits || {}
    },
    source: explicit ? "explicit_policy" : "legacy_compatibility",
    legacy_plan: organization.plan || null,
    effective_from: explicit?.effective_from || null,
    effective_until: explicit?.effective_until || null,
    policy_id: explicit?.id || null
  };
}

// base44/functions/manageAssetAssignment/entry.ts
var clean2 = (v, n = 500) => typeof v === "string" ? v.trim().slice(0, n) : null;
var allowedRoles = /* @__PURE__ */ new Set(["ORG_ADMIN", "BRANCH_ADMIN"]);
async function one(entity, q) {
  return (await entity.filter(q, "-created_date", 1))?.[0] || null;
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Metodo no permitido" }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req), user = await base44.auth.me();
    if (!user) return Response.json({ error: "No autenticado" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const auth = await resolveAuthorizedContext(base44, user, { organizationHint: body.organization_id || null });
    if (!auth.ok || !allowedRoles.has(auth.role)) return Response.json({ error: "Administracion de activos no autorizada", code: "ASSET_ASSIGNMENT_FORBIDDEN" }, { status: auth.status || 403 });
    const org = (await base44.asServiceRole.entities.Organization.filter({ id: auth.organizationId, status: "active" }, "-created_date", 1))?.[0];
    const entitlement = org ? await resolveEffectiveEntitlement(base44, org) : null;
    if (!entitlement?.capabilities?.includes("ENTERPRISE_ASSET_CUSTODY")) return Response.json({ error: "La organizaci\xF3n no tiene Custodia Enterprise habilitada", code: "ENTERPRISE_ENTITLEMENT_REQUIRED" }, { status: 403 });
    const equipo = await one(base44.asServiceRole.entities.Equipo, { id: clean2(body.equipo_id, 160), organization_id: auth.organizationId });
    if (!equipo) return Response.json({ error: "Activo no encontrado", code: "ASSET_NOT_FOUND" }, { status: 404 });
    if (auth.role === "BRANCH_ADMIN" && auth.branchId && equipo.branch_id && equipo.branch_id !== auth.branchId) return Response.json({ error: "Activo fuera de la sucursal autorizada" }, { status: 403 });
    const action = String(body.action || "").toUpperCase(), operationKey = clean2(body.operation_key, 160) || crypto.randomUUID();
    const existingOp = await one(base44.asServiceRole.entities.AssetAssignment, { organization_id: auth.organizationId, operation_key: operationKey });
    if (existingOp) return Response.json({ success: true, assignment: existingOp, idempotent: true });
    const active = await one(base44.asServiceRole.entities.AssetAssignment, { organization_id: auth.organizationId, equipo_id: equipo.id, status: "ACTIVE" });
    if (action === "ASSIGN") {
      if (active) return Response.json({ error: "El activo ya tiene una asignacion activa", code: "ASSET_ALREADY_ASSIGNED" }, { status: 409 });
      const assigneeName = clean2(body.assignee_name, 240);
      if (!assigneeName) return Response.json({ error: "Responsable requerido" }, { status: 422 });
      const record = await base44.asServiceRole.entities.AssetAssignment.create({ organization_id: auth.organizationId, branch_id: equipo.branch_id || auth.branchId || null, equipo_id: equipo.id, assignee_type: ["EMPLOYEE", "CONTRACTOR", "DEPARTMENT", "LOCATION", "OTHER"].includes(body.assignee_type) ? body.assignee_type : "EMPLOYEE", assignee_reference: clean2(body.assignee_reference, 240) || clean2(body.assignee_email, 254), assignee_name: assigneeName, assignee_email: clean2(body.assignee_email, 254), assigned_at: (/* @__PURE__ */ new Date()).toISOString(), assigned_by_user_id: user.id, expected_return_at: body.expected_return_at || null, status: "ACTIVE", condition_out: clean2(body.condition_out, 1e3), notes: clean2(body.notes, 2e3), evidence_out: Array.isArray(body.evidence_out) ? body.evidence_out.slice(0, 20) : [], operation_key: operationKey });
      await appendAuditEvent(base44, { eventType: "ASSET_ASSIGNMENT_COMMITTED", principalClass: auth.principalClass, actorUserId: user.id, actorPrimaryRole: auth.persistedRole, organizationId: auth.organizationId, branchId: record.branch_id, resourceType: "AssetAssignment", resourceId: record.id, commandPolicyId: "CP-ASSET-001", correlationId: operationKey, auditOperationId: `asset-assignment:${operationKey}`, operationKey, operationSemantics: { action: "ASSIGN", equipo_id: equipo.id }, newState: { status: "ACTIVE", assignee_name: record.assignee_name }, custodySnapshot: { equipo_id: equipo.id, assignee_name: record.assignee_name } });
      return Response.json({ success: true, assignment: record, idempotent: false });
    }
    if (action === "RETURN") {
      if (!active) return Response.json({ error: "El activo no tiene una asignacion activa", code: "ASSET_NOT_ASSIGNED" }, { status: 409 });
      const updated = await base44.asServiceRole.entities.AssetAssignment.update(active.id, { status: "RETURNED", returned_at: (/* @__PURE__ */ new Date()).toISOString(), returned_by_user_id: user.id, condition_in: clean2(body.condition_in, 1e3), evidence_in: Array.isArray(body.evidence_in) ? body.evidence_in.slice(0, 20) : [], notes: clean2(body.notes, 2e3) || active.notes, operation_key: operationKey });
      await appendAuditEvent(base44, { eventType: "ASSET_RETURN_COMMITTED", principalClass: auth.principalClass, actorUserId: user.id, actorPrimaryRole: auth.persistedRole, organizationId: auth.organizationId, branchId: active.branch_id, resourceType: "AssetAssignment", resourceId: active.id, commandPolicyId: "CP-ASSET-001", correlationId: operationKey, auditOperationId: `asset-return:${operationKey}`, operationKey, operationSemantics: { action: "RETURN", equipo_id: equipo.id }, priorState: { status: "ACTIVE" }, newState: { status: "RETURNED" }, custodySnapshot: { equipo_id: equipo.id, assignee_name: active.assignee_name } });
      return Response.json({ success: true, assignment: updated, idempotent: false });
    }
    return Response.json({ error: "Accion no soportada", code: "ASSET_ASSIGNMENT_ACTION_INVALID" }, { status: 400 });
  } catch (error) {
    console.error("[manageAssetAssignment]", error?.message || error);
    return Response.json({ error: "No fue posible gestionar la asignacion del activo", code: "ASSET_ASSIGNMENT_INTERNAL_ERROR" }, { status: 500 });
  }
});