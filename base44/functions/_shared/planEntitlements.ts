import { appendAuditEvent } from './auditEvent.ts';

// Proposed limits only. This module observes and audits; it never blocks a command.
export const PLAN_ENTITLEMENTS = Object.freeze({
  basic: Object.freeze({ maxBranches: 1, maxUsers: 3 }),
  pro: Object.freeze({ maxBranches: 3, maxUsers: 10 }),
  premium: Object.freeze({ maxBranches: null, maxUsers: null }),
});

async function organizationAndLimits(base44: any, organizationId: string) {
  const organizations = await base44.asServiceRole.entities.Organization.filter({ id: organizationId }, '-created_date', 2);
  if (organizations?.length !== 1) return null;
  const requestedPlan = String(organizations[0].plan || 'basic').toLowerCase();
  const plan = Object.hasOwn(PLAN_ENTITLEMENTS, requestedPlan) ? requestedPlan : 'basic';
  return { plan, limits: PLAN_ENTITLEMENTS[plan] };
}

async function auditObservation(base44: any, input: any) {
  try {
    await appendAuditEvent(base44, {
      eventType: 'PLAN_ENTITLEMENT_OBSERVED_EXCEEDED',
      principalClass: input.authorization.principalClass,
      actorUserId: input.actor.id,
      actorPrimaryRole: input.authorization.persistedRole,
      organizationId: input.organizationId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      commandPolicyId: input.commandPolicyId,
      correlationId: input.correlationId,
      auditOperationId: `plan-observation:${input.resourceType}:${input.organizationId}:${input.correlationId}`,
      operationKey: input.correlationId,
      operationSemantics: { observation: 'PLAN_LIMIT_EXCEEDED', resource: input.resourceType },
      outcome: 'COMMITTED',
      newState: { mode: 'OBSERVE_ONLY', plan: input.plan, usage: input.usage, limit: input.limit },
      metadata: { action: input.action, enforcement: 'disabled', proposed_limit: input.limit },
    });
  } catch (error) {
    // Audit availability must not change the outcome of a business command.
    console.error('[planEntitlements] observation audit failed', error?.message || error);
  }
}

export async function observeUserSeatLimit(base44: any, input: any) {
  try {
    const entitlement = await organizationAndLimits(base44, input.organizationId);
    if (!entitlement || entitlement.limits.maxUsers === null) return null;
    const accounts = await base44.asServiceRole.entities.UserAccount.filter({ organization_id: input.organizationId }, '-created_date', 1001);
    const currentUsage = (accounts || []).filter(account => account.status === 'active' || account.status === 'invited').length;
    const usage = currentUsage + (input.includePending === true ? 1 : 0);
    if (usage <= entitlement.limits.maxUsers) return { ...entitlement, usage, exceeded: false };
    await auditObservation(base44, { ...input, resourceType: 'UserAccount', plan: entitlement.plan, usage, limit: entitlement.limits.maxUsers });
    return { ...entitlement, usage, exceeded: true };
  } catch (error) {
    console.error('[planEntitlements] user-seat observation failed', error?.message || error);
    return null;
  }
}

export async function observeBranchLimit(base44: any, input: any) {
  try {
    const entitlement = await organizationAndLimits(base44, input.organizationId);
    if (!entitlement || entitlement.limits.maxBranches === null) return null;
    const branches = await base44.asServiceRole.entities.Branch.filter({ organization_id: input.organizationId, active: true }, '-created_date', 1001);
    const usage = (branches || []).length;
    if (usage <= entitlement.limits.maxBranches) return { ...entitlement, usage, exceeded: false };
    await auditObservation(base44, { ...input, resourceType: 'Branch', plan: entitlement.plan, usage, limit: entitlement.limits.maxBranches });
    return { ...entitlement, usage, exceeded: true };
  } catch (error) {
    console.error('[planEntitlements] branch observation failed', error?.message || error);
    return null;
  }
}
