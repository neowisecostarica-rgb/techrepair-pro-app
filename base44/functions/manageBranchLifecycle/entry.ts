import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { BranchLifecycleError, executeBranchLifecycle } from '../_shared/branchLifecycle.ts';
import { appendAuditEvent } from '../_shared/auditEvent.ts';
import { observeBranchLimit } from '../_shared/planEntitlements.ts';
import { projectOperationalReadResult } from '../_shared/dataProjections.ts';
import {
  evaluateCommandPolicyWithShadow,
  ExecuteSovereignCommand,
  SovereignCommandError,
} from '../_shared/commandExecution.ts';

Deno.serve(async req => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Metodo no permitido', code: 'METHOD_NOT_ALLOWED' }, { status: 405 });
  }
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'No autenticado', code: 'UNAUTHENTICATED' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const authorization = await resolveAuthorizedContext(base44, user, {
      organizationHint: body.organization_id || null,
    });
    if (!authorization.ok) {
      return Response.json({ error: authorization.error, code: 'BRANCH_LIFECYCLE_FORBIDDEN' }, { status: authorization.status });
    }
    const compatibilityAllowed = authorization.role === 'ORG_ADMIN';
    const resourceId = body.branch_id || `pending:${String(body.operation_key || body.action || 'branch').slice(0, 180)}`;
    const policyDecision = await evaluateCommandPolicyWithShadow({
      base44,
      policyId: 'CP-BR-001',
      authorization,
      relationship: 'ORG_RESOURCE',
      compatibilityDecision: {
        ok: compatibilityAllowed,
        code: compatibilityAllowed ? 'ALLOW' : 'LEGACY_BRANCH_ROLE_DENY',
      },
      audit: {
        actorUserId: user.id,
        branchId: body.branch_id || null,
        resourceType: 'Branch',
        resourceId,
        correlationId: String(body.operation_key || `branch-shadow:${resourceId}:${user.id}`),
        operationKey: body.operation_key || null,
      },
    });
    return await ExecuteSovereignCommand({
      decision: policyDecision,
      sovereignWriter: 'manageBranchLifecycle',
      execute: async () => {
        const result = await executeBranchLifecycle(base44, {
          organizationId: authorization.organizationId,
          role: authorization.role,
          actor: { id: user.id, email: user.email || null },
        }, body);
        await appendAuditEvent(base44, {
          eventType: 'BRANCH_LIFECYCLE_COMMITTED',
          principalClass: authorization.principalClass,
          actorUserId: user.id,
          actorPrimaryRole: authorization.persistedRole,
          organizationId: authorization.organizationId,
          branchId: result.branch?.id || body.branch_id || null,
          resourceType: 'Branch',
          resourceId: result.branch?.id || body.branch_id,
          commandPolicyId: 'CP-BR-001',
          correlationId: body.operation_key,
          auditOperationId: `branch-lifecycle:${result.operation_id}`,
          operationKey: body.operation_key,
          operationSemantics: { action: result.action },
          outcome: result.idempotent ? 'IDEMPOTENT_REPLAY' : 'COMMITTED',
          newState: { action: result.action, active: result.branch?.active },
        });
        if (!result.idempotent && result.branch?.active === true && ['CREATE', 'REACTIVATE'].includes(result.action)) {
          await observeBranchLimit(base44, {
            organizationId: authorization.organizationId,
            resourceId: result.branch.id,
            action: result.action,
            correlationId: body.operation_key,
            commandPolicyId: 'CP-BR-001',
            authorization,
            actor: user,
          });
        }
        return Response.json({
          success: result.success === true,
          action: result.action,
          branch: projectOperationalReadResult('Branch', result.branch, authorization),
          idempotent: result.idempotent === true,
          recovered: result.recovered === true,
        });
      },
    });
  } catch (error) {
    if (error instanceof SovereignCommandError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof BranchLifecycleError) {
      return Response.json({
        error: error.message,
        code: error.code,
        ...error.details,
      }, { status: error.status });
    }
    console.error('[manageBranchLifecycle]', error?.message || error);
    return Response.json({ error: 'No fue posible gestionar la sucursal', code: 'BRANCH_LIFECYCLE_INTERNAL_ERROR' }, { status: 500 });
  }
});
