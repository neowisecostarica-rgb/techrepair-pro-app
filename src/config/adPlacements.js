// Placement inventory only. Commercial authorization must come from a trusted
// server policy; never infer free eligibility from Organization.plan.
export const AD_PLACEMENTS = Object.freeze({
  workspace_top: { pages: ['Dashboard', 'MiDia'], formats: [[970,90],[728,90],[320,100],[320,50]] },
  workspace_side: { pages: ['Dashboard'], formats: [[300,250],[336,280],[300,600]] },
});
export function resolveAdPlacement(policy, organizationId, page, placement) {
  const definition = AD_PLACEMENTS[placement];
  if (!definition?.pages.includes(page) || !organizationId ||
      policy?.organization_id !== organizationId || policy?.eligible !== true ||
      policy?.commercial_consent !== true || policy?.paid_plan !== false) return null;
  const slot = policy.placements?.[placement];
  if (slot?.enabled !== true || !definition.formats.some(([w,h]) => w === slot.width && h === slot.height)) return null;
  return slot;
}
