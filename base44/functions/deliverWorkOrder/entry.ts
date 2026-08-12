import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { authorizeRecordBranch } from '../_shared/operationalAuthorization.ts';
import { DeliveryCommandError, executeDeliveryCommand } from '../_shared/deliveryAtomicity.ts';
import { appendAuditEvent } from '../_shared/auditEvent.ts';

const DELIVERY_ROLES = ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES'];

Deno.serve(async req => {
  if (req.method !== 'POST') {
    return Response.json({ success: false, code: 'METHOD_NOT_ALLOWED', error: 'Metodo no permitido' }, { status: 405 });
  }
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, code: 'DELIVERY_UNAUTHENTICATED', error: 'No autenticado' }, { status: 401 });
    const authorization = await resolveAuthorizedContext(base44, user, { allowedRoles: DELIVERY_ROLES });
    if (!authorization.ok) {
      return Response.json({ success: false, code: 'DELIVERY_UNAUTHORIZED', error: authorization.error }, { status: authorization.status });
    }
    const body = await req.json();
    const result = await executeDeliveryCommand(base44, {
      organizationId: authorization.organizationId,
      role: authorization.role,
      actor: { id: user.id, email: user.email },
      authorizeBranch(branchId) {
        const decision = authorizeRecordBranch(authorization, branchId);
        if (!decision.ok) {
          throw new DeliveryCommandError(
            decision.error,
            decision.code || 'DELIVERY_CROSS_BRANCH_DENIED',
            decision.status || 403,
          );
        }
      },
    }, body);
    await appendAuditEvent(base44, {
      eventType: 'WORK_ORDER_DELIVERED',
      principalClass: authorization.principalClass,
      actorUserId: user.id,
      actorPrimaryRole: authorization.persistedRole,
      organizationId: authorization.organizationId,
      branchId: result.work_order.branch_id,
      resourceType: 'OrdenTrabajo',
      resourceId: result.work_order.id,
      commandPolicyId: 'CP-DEL-001',
      correlationId: result.operation_key,
      operationKey: result.operation_key,
      outcome: result.idempotent ? 'IDEMPOTENT_REPLAY' : 'COMMITTED',
      priorState: { estado: 'FINALIZADA' },
      newState: { estado: 'ENTREGADA', delivery_log_id: result.delivery_log?.id || null },
      metadata: { warranty_outcome: result.warranty_outcome, warranty_id: result.warranty?.id || null },
    });
    return Response.json(result);
  } catch (error) {
    const status = Number(error?.status) || 500;
    const code = error?.code || 'DELIVERY_INTERNAL_ERROR';
    console.error(`[deliverWorkOrder] ${code}: ${error?.message}`);
    return Response.json({
      success: false,
      code,
      error: error?.message || 'No se pudo completar la entrega',
      retryable: error?.details?.retryable === true,
      details: error?.details || undefined,
    }, { status });
  }
});
