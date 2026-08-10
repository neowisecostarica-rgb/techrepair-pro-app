/**
 * Canonical authorization predicate for UserAccount membership.
 *
 * `status` is the only authorization source. Compatibility flags such as
 * `active` may still be persisted for older clients, but never grant access.
 */
export function isCanonicalActiveUserAccount(account) {
  return account?.status === 'active';
}

/**
 * Resolve tenant and business role from canonical UserAccount membership.
 * Service-role access is only safe after this resolver succeeds.
 */
export async function resolveAuthorizedContext(base44, user, options = {}) {
  const {
    organizationHint = null,
    allowedRoles = [],
    requireOrganization = true,
  } = options;

  if (!user?.id) {
    return { ok: false, status: 401, error: 'No autenticado' };
  }

  const requestedOrgId =
    organizationHint || user.impersonating_org_id || user.organization_id || null;

  if (user.is_super_admin === true) {
    if (requireOrganization && !requestedOrgId) {
      return { ok: false, status: 403, error: 'Selecciona una organizacion antes de continuar' };
    }
    return {
      ok: true,
      organizationId: requestedOrgId,
      role: requestedOrgId ? 'ORG_ADMIN' : 'SUPER_ADMIN',
      account: null,
      isImpersonating: Boolean(user.impersonating_org_id),
    };
  }

  const accounts = await base44.asServiceRole.entities.UserAccount.filter({ user_id: user.id }, 50);
  const activeAccounts = (accounts || []).filter(account =>
    isCanonicalActiveUserAccount(account) && account.organization_id
  );

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
    isImpersonating: false,
  };
}
