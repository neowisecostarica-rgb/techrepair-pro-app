// Read-only activation evidence. Authorization and billing remain server-owned.
export function matchesInitialTenant(context, expected) {
  const org = context?.organizations?.find?.(o => o.id === expected?.orgId);
  const account = context?.userAccount;
  const entitlement = context?.entitlement;
  return !!expected?.orgId && context?.ok === true &&
    context.user?.id === expected.userId &&
    context.user?.organization_id === expected.orgId &&
    account?.user_id === expected.userId &&
    account?.organization_id === expected.orgId &&
    account?.role === 'ORG_ADMIN' && account?.status === 'active' &&
    org?.status === 'active' && org?.provisioning_status === 'READY' &&
    org?.country === expected.country && org?.currency === expected.currency &&
    org?.plan === 'basic' &&
    entitlement?.legacy_plan === 'basic' && entitlement?.package_id === 'core' &&
    entitlement?.license_status === 'active';
}
