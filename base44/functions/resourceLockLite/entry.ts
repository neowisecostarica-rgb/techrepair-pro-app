// base44/functions/resourceLockLite/entry.ts
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

// base44/functions/resourceLockLite/entry.ts
var DEFAULT_TTL_MS = 5 * 60 * 1e3;
var MIN_TTL_MS = 30 * 1e3;
var MAX_TTL_MS = 5 * 60 * 1e3;
var DEFAULT_TIMEOUT_MS = 3 * 1e3;
var MAX_TIMEOUT_MS = 10 * 1e3;
var SETTLE_MS = 100;
var BASE_BACKOFF_MS = 40;
var MAX_RESOURCES = 100;
var wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
var nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
var isUuid = (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function responseError(code, message, status, options = {}) {
  return Response.json({
    success: false,
    code,
    message,
    retryable: options.retryable ?? false,
    retry_after_ms: options.retryAfterMs ?? null,
    correlation_id: options.correlationId || null,
    resources: options.resources || []
  }, { status });
}
async function resolveOrganization(base44, user, organizationHint = null) {
  const authorization = await resolveAuthorizedContext(base44, user, { organizationHint });
  return authorization.ok ? authorization.organizationId : null;
}
function normalizeResources(resources) {
  if (!Array.isArray(resources) || resources.length === 0 || resources.length > MAX_RESOURCES) return null;
  const normalized = resources.map((resource) => String(resource || "").normalize("NFKC").trim());
  if (normalized.some((resource) => !resource || !/^[a-z][a-z0-9_-]*:.+$/i.test(resource))) return null;
  return [...new Set(normalized)].sort((left, right) => left.localeCompare(right));
}
function activeLock(record, now = Date.now()) {
  return ["ACQUIRING", "ACTIVE"].includes(record?.status) && Date.parse(record?.expires_at || "") > now;
}
function compareLocks(left, right) {
  const timeDifference = Date.parse(left.locked_at) - Date.parse(right.locked_at);
  return timeDifference || String(left.id).localeCompare(String(right.id));
}
async function listContenders(base44, { orgId, operation, resource }) {
  const records = await base44.asServiceRole.entities.OperationLock.filter({
    organization_id: orgId,
    operation,
    resource,
    status: { $in: ["ACQUIRING", "ACTIVE"] }
  }, "locked_at", 100);
  const now = Date.now();
  const expired = (records || []).filter((record) => !activeLock(record, now));
  await Promise.all(expired.map(
    (record) => base44.asServiceRole.entities.OperationLock.updateMany({
      id: record.id,
      locked_by: record.locked_by,
      status: record.status
    }, { $set: { status: "EXPIRED", released_at: nowIso() } }).catch(() => null)
  ));
  return (records || []).filter((record) => activeLock(record, now)).sort(compareLocks);
}
async function releaseRecords(base44, locks, ownerToken) {
  const released = [];
  const errors = [];
  for (const lock of [...locks || []].reverse()) {
    try {
      const result = await base44.asServiceRole.entities.OperationLock.updateMany({
        id: lock.id,
        locked_by: ownerToken,
        status: "ACTIVE"
      }, { $set: { status: "RELEASED", released_at: nowIso() } });
      if (result?.updated === 1) released.push(lock.resource);
    } catch (error) {
      errors.push({ resource: lock.resource, detail: error.message });
    }
  }
  return { released, errors };
}
async function acquireResource(base44, context) {
  const {
    orgId,
    operation,
    resource,
    correlationId,
    requestFingerprint,
    ownerToken,
    leaseId,
    ttlMs
  } = context;
  const lockedAt = nowIso();
  let candidate = null;
  try {
    candidate = await base44.asServiceRole.entities.OperationLock.create({
      organization_id: orgId,
      operation,
      resource,
      correlation_id: correlationId,
      request_fingerprint: requestFingerprint,
      locked_by: ownerToken,
      locked_at: lockedAt,
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
      status: "ACQUIRING",
      lease_id: leaseId
    });
    await wait(SETTLE_MS);
    const contenders = await listContenders(base44, { orgId, operation, resource });
    const winner = contenders[0];
    if (!winner || winner.id !== candidate.id || winner.locked_by !== ownerToken) {
      await base44.asServiceRole.entities.OperationLock.updateMany({
        id: candidate.id,
        locked_by: ownerToken,
        status: "ACQUIRING"
      }, { $set: { status: "RELEASED", released_at: nowIso() } });
      return null;
    }
    const claim = await base44.asServiceRole.entities.OperationLock.updateMany({
      id: candidate.id,
      locked_by: ownerToken,
      status: "ACQUIRING"
    }, { $set: { status: "ACTIVE" } });
    if (claim?.updated !== 1) {
      await base44.asServiceRole.entities.OperationLock.updateMany({
        id: candidate.id,
        locked_by: ownerToken,
        status: "ACQUIRING"
      }, { $set: { status: "RELEASED", released_at: nowIso() } });
      return null;
    }
    return { id: candidate.id, resource };
  } catch (error) {
    if (candidate) {
      await base44.asServiceRole.entities.OperationLock.updateMany({
        id: candidate.id,
        locked_by: ownerToken,
        status: { $in: ["ACQUIRING", "ACTIVE"] }
      }, { $set: { status: "RELEASED", released_at: nowIso() } }).catch(() => null);
    }
    throw error;
  }
}
async function acquireMany(base44, context) {
  const deadline = Date.now() + context.timeoutMs;
  let attempt = 0;
  while (Date.now() <= deadline) {
    const acquired = [];
    let complete = true;
    try {
      for (const resource of context.resources) {
        if (Date.now() > deadline) {
          complete = false;
          break;
        }
        const lock = await acquireResource(base44, { ...context, resource });
        if (!lock) {
          complete = false;
          break;
        }
        acquired.push(lock);
      }
    } catch (error) {
      await releaseRecords(base44, acquired, context.ownerToken);
      throw error;
    }
    if (complete && Date.now() <= deadline) return acquired;
    await releaseRecords(base44, acquired, context.ownerToken);
    attempt += 1;
    const exponential = Math.min(BASE_BACKOFF_MS * 2 ** Math.min(attempt - 1, 5), 800);
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(exponential / 2)));
    await wait(Math.min(exponential + jitter, remaining));
  }
  return null;
}
async function assertOwned(base44, { orgId, operation, lease }) {
  if (!lease?.owner_token || !Array.isArray(lease?.locks) || lease.locks.length === 0) return false;
  for (const lock of lease.locks) {
    const contenders = await listContenders(base44, { orgId, operation, resource: lock.resource });
    const winner = contenders[0];
    if (!winner || winner.id !== lock.id || winner.locked_by !== lease.owner_token || winner.status !== "ACTIVE") return false;
  }
  return true;
}
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return responseError("LOCK_UNAUTHORIZED", "Debe iniciar sesi\xF3n nuevamente.", 401);
    const body = await req.json();
    const orgId = await resolveOrganization(base44, user, body.organization_id || null);
    if (!orgId) return responseError("LOCK_ORGANIZATION_UNRESOLVED", "No se pudo determinar la organizaci\xF3n.", 403);
    const action = body.action;
    const operation = String(body.operation || "").trim();
    const correlationId = body.correlation_id;
    if (!operation || !isUuid(correlationId)) {
      return responseError("LOCK_SET_INVALID", "Operaci\xF3n y correlation_id son obligatorios.", 400, { correlationId });
    }
    if (action === "acquireMany") {
      const resources = normalizeResources(body.resources);
      const requestFingerprint = String(body.request_fingerprint || "").trim();
      if (!resources || !requestFingerprint) {
        return responseError("LOCK_SET_INVALID", "El conjunto de recursos o fingerprint no es v\xE1lido.", 400, { correlationId });
      }
      const previous = await base44.asServiceRole.entities.OperationLock.filter({
        organization_id: orgId,
        operation,
        correlation_id: correlationId
      }, "-created_date", 100);
      if ((previous || []).some((record) => record.request_fingerprint !== requestFingerprint)) {
        return responseError("LOCK_FINGERPRINT_CONFLICT", "La correlaci\xF3n ya fue utilizada con datos diferentes.", 409, {
          correlationId,
          resources
        });
      }
      const ttlMs = Math.max(MIN_TTL_MS, Math.min(Number(body.ttl_ms) || DEFAULT_TTL_MS, MAX_TTL_MS));
      const timeoutMs = Math.max(0, Math.min(Number(body.timeout_ms) || DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS));
      const ownerToken = crypto.randomUUID();
      const leaseId = crypto.randomUUID();
      const locks = await acquireMany(base44, {
        orgId,
        operation,
        resources,
        correlationId,
        requestFingerprint,
        ownerToken,
        leaseId,
        ttlMs,
        timeoutMs
      });
      if (!locks) {
        return responseError("LOCK_ACQUIRE_TIMEOUT", "No fue posible adquirir los recursos dentro del tiempo permitido.", 423, {
          correlationId,
          resources,
          retryable: true,
          retryAfterMs: BASE_BACKOFF_MS
        });
      }
      return Response.json({
        success: true,
        lease: {
          lease_id: leaseId,
          owner_token: ownerToken,
          organization_id: orgId,
          operation,
          correlation_id: correlationId,
          resources,
          locks,
          expires_at: new Date(Date.now() + ttlMs).toISOString()
        }
      });
    }
    if (action === "assertOwned") {
      const owned = await assertOwned(base44, { orgId, operation, lease: body.lease });
      if (!owned) return responseError("LOCK_LOST", "La operaci\xF3n ya no posee todos los recursos.", 409, {
        correlationId,
        resources: body.lease?.resources || [],
        retryable: true
      });
      return Response.json({ success: true, owned: true });
    }
    if (action === "releaseMany") {
      const lease = body.lease;
      const result = await releaseRecords(base44, lease?.locks || [], lease?.owner_token);
      if (result.errors.length > 0) {
        return responseError("LOCK_RELEASE_FAILED", "Uno o m\xE1s recursos no pudieron liberarse.", 500, {
          correlationId,
          resources: lease?.resources || [],
          retryable: true
        });
      }
      return Response.json({ success: true, released: result.released });
    }
    return responseError("LOCK_ACTION_INVALID", "Acci\xF3n de locking no reconocida.", 400, { correlationId });
  } catch (error) {
    return responseError("LOCK_INTERNAL_ERROR", "No se pudo procesar el lock operacional.", 500, {
      retryable: true,
      resources: []
    });
  }
});