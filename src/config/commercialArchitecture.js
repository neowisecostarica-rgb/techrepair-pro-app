// TRP Commercial Engine — C1 compatibility foundation.
// IMPORTANT: Organization.plan is a legacy persistence code, not an entitlement authority.

export const LEGACY_PLAN_CODES = Object.freeze(['basic', 'pro', 'premium']);

export const COMMERCIAL_PACKAGE_IDS = Object.freeze({
  CORE: 'core',
  ADVANCED: 'advanced',
  ENTERPRISE: 'enterprise',
});

// Compatibility only. Public package names/prices remain intentionally undecided in C1.
// Premium legacy is NOT automatically Enterprise: Enterprise requires an explicit contract/policy.
export const LEGACY_PACKAGE_FALLBACK = Object.freeze({
  basic: COMMERCIAL_PACKAGE_IDS.CORE,
  pro: COMMERCIAL_PACKAGE_IDS.ADVANCED,
  premium: COMMERCIAL_PACKAGE_IDS.ADVANCED,
});

export const BILLING_STATUSES = Object.freeze([
  'trial',
  'active',
  'past_due',
  'suspended',
  'cancelled',
]);

export const BILLING_INTERVALS = Object.freeze(['monthly', 'annual', 'contract']);

export function isLegacyPlanCode(value) {
  return LEGACY_PLAN_CODES.includes(value);
}

export function resolveCompatibilityPackage(organization) {
  const explicitPackageId = organization?.commercial_package_id;
  if (Object.values(COMMERCIAL_PACKAGE_IDS).includes(explicitPackageId)) {
    return {
      packageId: explicitPackageId,
      source: 'explicit',
      legacyPlan: organization?.plan || null,
    };
  }

  const legacyPlan = organization?.plan;
  return {
    packageId: LEGACY_PACKAGE_FALLBACK[legacyPlan] || COMMERCIAL_PACKAGE_IDS.CORE,
    source: isLegacyPlanCode(legacyPlan) ? 'legacy_fallback' : 'safe_default',
    legacyPlan: legacyPlan || null,
  };
}

export const COMMERCIAL_ARCHITECTURE = Object.freeze({
  contractUnit: 'organization',
  supportedIntervals: BILLING_INTERVALS,
  entitlementAuthority: 'backend_policy',
  legacyPlanIsAuthoritative: false,
  publicPricingApproved: false,
  reliabilityScoreCommercialized: false,
});
