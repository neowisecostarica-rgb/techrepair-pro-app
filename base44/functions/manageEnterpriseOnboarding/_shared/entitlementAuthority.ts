export const ENTITLEMENT_POLICY_VERSION = '2026-09-c4-v1';

const LEGACY_PACKAGE_FALLBACK = Object.freeze({
  basic: 'core',
  pro: 'advanced',
  premium: 'advanced',
});

const PACKAGE_DEFAULTS = Object.freeze({
  core: {
    capabilities: [
      'CORE_WORKFLOW',
      'ASSET_LIFECYCLE',
      'CUSTOMER_PORTAL',
      'BASIC_BUSINESS_READ',
      'OPERATIONAL_TRACEABILITY',
    ],
    limits: {},
  },
  advanced: {
    capabilities: [
      'CORE_WORKFLOW',
      'ASSET_LIFECYCLE',
      'CUSTOMER_PORTAL',
      'BASIC_BUSINESS_READ',
      'OPERATIONAL_TRACEABILITY',
      'ADVANCED_MULTI_BRANCH',
      'ADVANCED_ANALYTICS',
      'ADVANCED_OPERATIONAL_SUPERVISION',
      'QUALITY_NONCONFORMITY',
      'RECYCLING',
      'ADVANCED_CRM',
      'ADVANCED_AUTOMATION',
    ],
    limits: {},
  },
  enterprise: {
    capabilities: [
      'CORE_WORKFLOW',
      'ASSET_LIFECYCLE',
      'CUSTOMER_PORTAL',
      'BASIC_BUSINESS_READ',
      'OPERATIONAL_TRACEABILITY',
      'ADVANCED_MULTI_BRANCH',
      'ADVANCED_ANALYTICS',
      'ADVANCED_OPERATIONAL_SUPERVISION',
      'QUALITY_NONCONFORMITY',
      'RECYCLING',
      'ADVANCED_CRM',
      'ADVANCED_AUTOMATION',
      'ENTERPRISE_ASSET_CUSTODY',
      'ENTERPRISE_ONBOARDING',
      'ENTERPRISE_OFFBOARDING',
      'ENTERPRISE_COMMAND_EVIDENCE',
    ],
    limits: {},
  },
});

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function isCurrentlyEffective(policy, now = new Date()) {
  if (!policy) return false;
  const from = policy.effective_from ? new Date(policy.effective_from) : null;
  const until = policy.effective_until ? new Date(policy.effective_until) : null;
  if (from && Number.isFinite(from.getTime()) && from > now) return false;
  if (until && Number.isFinite(until.getTime()) && until <= now) return false;
  return true;
}

export async function resolveEffectiveEntitlement(base44, organization) {
  if (!organization?.id) return null;

  const policies = await base44.asServiceRole.entities.EntitlementPolicy.filter(
    { organization_id: organization.id },
    '-created_date',
    20,
  );
  const explicit = (policies || []).find(policy => isCurrentlyEffective(policy));

  const packageId = explicit?.package_id || LEGACY_PACKAGE_FALLBACK[organization.plan] || 'core';
  const defaults = PACKAGE_DEFAULTS[packageId] || PACKAGE_DEFAULTS.core;
  const overrideCapabilities = Array.isArray(explicit?.overrides?.capabilities)
    ? explicit.overrides.capabilities
    : [];
  const deniedCapabilities = new Set(
    Array.isArray(explicit?.overrides?.denied_capabilities)
      ? explicit.overrides.denied_capabilities
      : [],
  );
  const capabilities = unique([
    ...defaults.capabilities,
    ...(Array.isArray(explicit?.capabilities) ? explicit.capabilities : []),
    ...overrideCapabilities,
  ]).filter(capability => !deniedCapabilities.has(capability));

  return {
    package_id: packageId,
    billing_status: explicit?.billing_status || (organization.status === 'suspended' ? 'suspended' : 'active'),
    billing_interval: explicit?.billing_interval || null,
    license_status: explicit?.license_status || (explicit ? 'pending' : 'active'),
    activated_at: explicit?.activated_at || null,
    activation_method: explicit?.activation_method || (explicit ? null : 'migration'),
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
      ...(explicit?.limits || {}),
      ...(explicit?.overrides?.limits || {}),
    },
    source: explicit ? 'explicit_policy' : 'legacy_compatibility',
    legacy_plan: organization.plan || null,
    effective_from: explicit?.effective_from || null,
    effective_until: explicit?.effective_until || null,
    policy_id: explicit?.id || null,
  };
}
