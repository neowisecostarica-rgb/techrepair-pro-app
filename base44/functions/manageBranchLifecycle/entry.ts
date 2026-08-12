import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { BranchLifecycleError, executeBranchLifecycle } from '../_shared/branchLifecycle.ts';
import { appendAuditEvent } from '../_shared/auditEvent.ts';

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
      allowedRoles: ['ORG_ADMIN'],
    });
    if (!authorization.ok) {
      return Response.json({ error: authorization.error, code: 'BRANCH_LIFECYCLE_FORBIDDEN' }, { status: authorization.status });
    }
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
      operationKey: body.operation_key,
      outcome: result.idempotent ? 'IDEMPOTENT_REPLAY' : 'COMMITTED',
      newState: { action: result.action, active: result.branch?.active },
    });
    return Response.json(result);
  } catch (error) {
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
