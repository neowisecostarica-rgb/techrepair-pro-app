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
    role: account.role,
    status: account.status,
    active: account.status === 'active',
    invited_at: account.invited_at || null,
    accepted_at: account.accepted_at || null,
  };
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
    return {
      ok: true,
      organizationId: impersonatedOrgId || null,
      role: impersonatedOrgId ? 'ORG_ADMIN' : 'SUPER_ADMIN',
      account: null,
      isSuperAdmin: true,
      isImpersonating: Boolean(impersonatedOrgId),
      identity,
    };
  }

  const activeAccounts = identity.activeMemberships;
  const persistedOrgId = identity.user.organization_id;
  const requestedOrgId = organizationHint || persistedOrgId || null;
  const account = requestedOrgId
    ? activeAccounts.find(candidate => candidate.organization_id === requestedOrgId) || null
    : (activeAccounts.length === 1 ? activeAccounts[0] : null);

  if (!account) {
    const error = activeAccounts.length > 1
      ? 'Selecciona una organizacion valida antes de continuar'
      : 'No existe una membresia activa para esta organizacion';
    return { ok: false, status: 403, error };
  }
  if (allowedRoles.length > 0 && !allowedRoles.includes(account.role)) {
    return { ok: false, status: 403, error: 'Tu rol no permite realizar esta accion' };
  }

  return {
    ok: true,
    organizationId: account.organization_id,
    role: account.role,
    account,
    isSuperAdmin: false,
    isImpersonating: false,
    identity,
  };
}
