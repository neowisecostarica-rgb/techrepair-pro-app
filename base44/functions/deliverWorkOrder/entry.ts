import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { authorizeRecordBranch } from '../_shared/operationalAuthorization.ts';
import { DeliveryCommandError, executeDeliveryCommand } from '../_shared/deliveryAtomicity.ts';
import { appendAuditEvent } from '../_shared/auditEvent.ts';
import {
  projectDeliveryLogMutationResult,
  projectWarrantyMutationResult,
  projectWorkOrderMutationResult,
} from '../_shared/dataProjections.ts';
import { evaluateCommandPolicyWithShadow, ExecuteSovereignCommand } from '../_shared/commandExecution.ts';

const DELIVERY_ROLES = ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES'];

Deno.serve(async req => {
  if (req.method !== 'POST') {
    return Response.json({ success: false, code: 'METHOD_NOT_ALLOWED', error: 'Metodo no permitido' }, { status: 405 });
  }
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, code: 'DELIVERY_UNAUTHENTICATED', error: 'No autenticado' }, { status: 401 });
    const authorization = await resolveAuthorizedContext(base44, user);
    if (!authorization.ok) {
      return Response.json({ success: false, code: 'DELIVERY_UNAUTHORIZED', error: authorization.error }, { status: authorization.status });
    }
    const body = await req.json();
    const workOrderId = String(body.work_order_id || body.orden_trabajo_id || '').trim();
    if (!workOrderId) throw new DeliveryCommandError('work_order_id es requerido.', 'DELIVERY_WORK_ORDER_REQUIRED', 400);
    const [workOrder] = await base44.asServiceRole.entities.OrdenTrabajo.filter({
      id: workOrderId,
      organization_id: authorization.organizationId,
    }, 1);
    if (!workOrder) throw new DeliveryCommandError('Orden de trabajo no encontrada.', 'DELIVERY_WORK_ORDER_NOT_FOUND', 404);
    const branchDecision = authorizeRecordBranch(authorization, workOrder.branch_id);
    const compatibilityAllowed = DELIVERY_ROLES.includes(authorization.role)
      && branchDecision.ok
      && ['FINALIZADA', 'ENTREGADA'].includes(workOrder.estado);
    const policyDecision = await evaluateCommandPolicyWithShadow({
      base44,
      policyId: 'CP-DEL-001',
      authorization,
      relationship: branchDecision.ok ? 'BRANCH_RESOURCE' : 'NONE',
      scopeSatisfied: branchDecision.ok,
      preconditionSatisfied: ['FINALIZADA', 'ENTREGADA'].includes(workOrder.estado),
      preconditionStatus: 409,
      preconditionCode: 'DELIVERY_INVALID_STATE',
      compatibilityDecision: {
        ok: compatibilityAllowed,
        code: compatibilityAllowed ? 'ALLOW' : 'LEGACY_DELIVERY_DENY',
      },
      audit: {
        actorUserId: user.id,
        branchId: workOrder.branch_id,
        resourceType: 'OrdenTrabajo',
        resourceId: workOrder.id,
        correlationId: String(body.operation_key || body.delivery_operation_key || `delivery-shadow:${workOrder.id}:${user.id}`),
        operationKey: body.operation_key || body.delivery_operation_key || null,
      },
    });

    return await ExecuteSovereignCommand({
      decision: policyDecision,
      sovereignWriter: 'deliverWorkOrder',
      execute: async () => {
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
          auditOperationId: `work-order-delivery:${result.work_order.id}`,
          operationKey: result.operation_key,
          operationSemantics: { from_status: 'FINALIZADA', to_status: 'ENTREGADA' },
          outcome: result.idempotent ? 'IDEMPOTENT_REPLAY' : 'COMMITTED',
          priorState: { estado: 'FINALIZADA' },
          newState: { estado: 'ENTREGADA', delivery_log_id: result.delivery_log?.id || null },
          metadata: { warranty_outcome: result.warranty_outcome, warranty_id: result.warranty?.id || null },
        });
        return Response.json({
          success: result.success === true,
          idempotent: result.idempotent === true,
          recovered: result.recovered === true,
          warranty_outcome: result.warranty_outcome || null,
          non_critical_side_effects: result.non_critical_side_effects
            ? {
                event_status: result.non_critical_side_effects.event_status || null,
              }
            : null,
          work_order: projectWorkOrderMutationResult(result.work_order),
          delivery_log: projectDeliveryLogMutationResult(result.delivery_log),
          warranty: projectWarrantyMutationResult(result.warranty),
        });
      },
    });
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
