/** Canonical membership state. Legacy `active` never grants authority. */
export function isCanonicalActiveUserAccount(account) {
  return account?.status === 'active';
}

/** Base44 custom User fields can be returned flattened or under `data`. */
export function getUserDataField(user, field) {
  return user?.data?.[field] ?? user?.[field] ?? null;
}

/** The built-in platform role is the only sovereign super-admin authority. */
export function isCanonicalSuperAdmin(user) {
  return user?.role === 'admin';
}

export function sanitizeUserAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    user_id: account.user_id || null,
    user_email: account.user_email,
    organization_id: account.organization_id,
    branch_id: account.branch_id || null,
    role: normalizeTenantRole(account.role),
    persisted_role: account.role,
    status: account.status,
    active: account.status === 'active',
    invited_at: account.invited_at || null,
    accepted_at: account.accepted_at || null,
  };
}

async function loadActiveOrganization(base44, organizationId) {
  if (!organizationId) return null;
  const organizations = await base44.asServiceRole.entities.Organization.filter({
    id: organizationId,
    status: 'active',
  }, '-created_date', 2);
  return organizations?.length === 1 ? organizations[0] : null;
}

async function loadActiveBranch(base44, organizationId, branchId) {
  if (!organizationId || !branchId) return null;
  const branches = await base44.asServiceRole.entities.Branch.filter({
    id: branchId,
    organization_id: organizationId,
    active: true,
  }, '-created_date', 2);
  return branches?.length === 1 ? branches[0] : null;
}

export function sanitizeOrganization(organization) {
  if (!organization) return null;
  const {
    id,
    name,
    legal_name,
    country,
    currency,
    plan,
    status,
    partner_id,
    telefono_negocio,
    logo_url,
    email,
    direccion_comercial,
    tipo_entidad,
    identificacion_fiscal,
    direccion_fiscal,
    public_base_url,
    garantia_config,
    saldo_caja_inicial,
    saldo_caja_actual,
    ultima_actualizacion_caja,
    inventario_config,
    marketing_spend,
  } = organization;
  return {
    id,
    name,
    legal_name,
    country,
    currency,
    plan,
    status,
    partner_id,
    telefono_negocio,
    logo_url,
    email,
    direccion_comercial,
    tipo_entidad,
    identificacion_fiscal,
    direccion_fiscal,
    public_base_url,
    garantia_config,
    saldo_caja_inicial,
    saldo_caja_actual,
    ultima_actualizacion_caja,
    inventario_config,
    marketing_spend,
  };
}

async function loadCanonicalMemberships(base44, user) {
  const [byUserId, byEmail] = await Promise.all([
    base44.asServiceRole.entities.UserAccount.filter({ user_id: user.id }, 100),
    user.email
      ? base44.asServiceRole.entities.UserAccount.filter({ user_email: user.email }, 100)
      : Promise.resolve([]),
  ]);
  const unique = new Map();
  for (const account of [...(byUserId || []), ...(byEmail || [])]) {
    if (account?.id) unique.set(account.id, account);
  }
  return [...unique.values()];
}

export async function resolveIdentitySnapshot(base44, user) {
  if (!user?.id) return { ok: false, status: 401, error: 'No autenticado' };

  const isSuperAdmin = isCanonicalSuperAdmin(user);
  const memberships = isSuperAdmin ? [] : await loadCanonicalMemberships(base44, user);
  const activeMemberships = memberships.filter(account =>
    account.user_id === user.id &&
    account.organization_id &&
    isCanonicalActiveUserAccount(account)
  );
  const pendingInvitations = memberships.filter(account =>
    account.user_email === user.email &&
    account.organization_id &&
    account.status === 'invited' &&
    (!account.user_id || account.user_id === user.id)
  );

  const persistedOrganizationId = getUserDataField(user, 'organization_id');
  const impersonatingOrganizationId = isSuperAdmin
    ? getUserDataField(user, 'impersonating_org_id')
    : null;
  const activeAccount = isSuperAdmin
    ? null
    : activeMemberships.find(account => account.organization_id === persistedOrganizationId)
      || (activeMemberships.length === 1 ? activeMemberships[0] : null);

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
      impersonating_started_at: isSuperAdmin
        ? getUserDataField(user, 'impersonating_started_at')
        : null,
    },
    memberships,
    activeMemberships,
    pendingInvitations,
    activeAccount,
    isSuperAdmin,
  };
}

/**
 * Resolve tenant and role from backend-owned identity state.
 * `organizationHint` is only an intention and never authority.
 */
export async function resolveAuthorizedContext(base44, user, options = {}) {
  const {
    organizationHint = null,
    allowedRoles = [],
    requireOrganization = true,
  } = options;

  const identity = await resolveIdentitySnapshot(base44, user);
  if (!identity.ok) return identity;

  if (identity.isSuperAdmin) {
    const impersonatedOrgId = identity.user.impersonating_org_id;
    if (organizationHint && organizationHint !== impersonatedOrgId) {
      return { ok: false, status: 403, error: 'La organizacion solicitada no coincide con la impersonacion autorizada' };
    }
    if (requireOrganization && !impersonatedOrgId) {
      return { ok: false, status: 403, error: 'Inicia una impersonacion autorizada antes de continuar' };
    }
    const organization = impersonatedOrgId
      ? await loadActiveOrganization(base44, impersonatedOrgId)
      : null;
    if (impersonatedOrgId && !organization) {
      return { ok: false, status: 403, code: 'ORGANIZATION_INACTIVE', error: 'La organizacion no existe o no esta activa' };
    }
    return {
      ok: true,
      organizationId: impersonatedOrgId || null,
      role: impersonatedOrgId ? 'ORG_ADMIN' : 'SUPER_ADMIN',
      persistedRole: 'SUPER_ADMIN',
      normalizedRole: impersonatedOrgId ? 'ORG_ADMIN' : null,
      capabilities: impersonatedOrgId ? getRoleCapabilities('ORG_ADMIN') : [],
      scope: impersonatedOrgId ? 'ORGANIZATION' : 'PLATFORM',
      branchId: null,
      principalClass: impersonatedOrgId ? 'HUMAN_MEMBER' : 'PLATFORM_ADMIN',
      presetVersion: AUTHORIZATION_PRESET_VERSION,
      organization,
      branch: null,
      account: null,
      isSuperAdmin: true,
      isImpersonating: Boolean(impersonatedOrgId),
      identity,
    };
  }

  const activeAccounts = identity.activeMemberships;
  const persistedOrgId = identity.user.organization_id;
  const requestedOrgId = organizationHint || persistedOrgId || null;
  const matchingAccounts = requestedOrgId
    ? activeAccounts.filter(candidate => candidate.organization_id === requestedOrgId)
    : [];
  if (matchingAccounts.length > 1) {
    return {
      ok: false,
      status: 409,
      code: 'MEMBERSHIP_AMBIGUOUS',
      error: 'Existen multiples membresias activas para la organizacion',
    };
  }
  const account = requestedOrgId
    ? matchingAccounts[0] || null
    : (activeAccounts.length === 1 ? activeAccounts[0] : null);

  if (!account) {
    const error = activeAccounts.length > 1
      ? 'Selecciona una organizacion valida antes de continuar'
      : 'No existe una membresia activa para esta organizacion';
    return { ok: false, status: 403, error };
  }
  const normalizedRole = normalizeTenantRole(account.role);
  if (!normalizedRole) {
    return { ok: false, status: 403, code: 'ROLE_UNKNOWN', error: 'La membresia tiene un rol no autorizado' };
  }
  const normalizedAllowedRoles = allowedRoles.map(normalizeTenantRole).filter(Boolean);
  if (normalizedAllowedRoles.length > 0 && !normalizedAllowedRoles.includes(normalizedRole)) {
    return { ok: false, status: 403, error: 'Tu rol no permite realizar esta accion' };
  }

  const organization = await loadActiveOrganization(base44, account.organization_id);
  if (!organization) {
    return { ok: false, status: 403, code: 'ORGANIZATION_INACTIVE', error: 'La organizacion no existe o no esta activa' };
  }
  const scope = getRoleScope(normalizedRole);
  const branch = scope === 'SINGLE_BRANCH'
    ? await loadActiveBranch(base44, account.organization_id, account.branch_id)
    : null;
  if (scope === 'SINGLE_BRANCH' && !branch) {
    return { ok: false, status: 403, code: 'BRANCH_INACTIVE', error: 'La sucursal canonica no existe o no esta activa' };
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
    principalClass: 'HUMAN_MEMBER',
    presetVersion: AUTHORIZATION_PRESET_VERSION,
    organization,
    branch,
    account,
    isSuperAdmin: false,
    isImpersonating: false,
    identity,
  };
}

/** Frozen architecture name. Kept as an alias while callers migrate. */
export const ResolveAuthorizationContext = resolveAuthorizedContext;

/** Request-owned resolver cache. Callers decide its lifetime; no global authority is cached. */
export function createRequestAuthorizationResolver(base44, user) {
  const cache = new Map();
  return async (options = {}) => {
    const key = JSON.stringify({
      organizationHint: options.organizationHint || null,
      allowedRoles: [...(options.allowedRoles || [])].sort(),
      requireOrganization: options.requireOrganization !== false,
    });
    if (!cache.has(key)) cache.set(key, resolveAuthorizedContext(base44, user, options));
    return cache.get(key);
  };
}
import {
  AUTHORIZATION_PRESET_VERSION,
  getRoleCapabilities,
  getRoleScope,
  normalizeTenantRole,
} from './roleCapabilities.ts';
