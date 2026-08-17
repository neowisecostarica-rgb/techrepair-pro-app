export function lifecycleAuditPendingMarker(input) {
  const facts = typeof input === 'string' ? { operationId: input } : input;
  return {
    lifecycle_audit_pending: true,
    lifecycle_audit_correlation_id: facts.operationId,
    lifecycle_audit_external_correlation_id: facts.externalCorrelationId || null,
    lifecycle_audit_previous_status: facts.previousStatus || null,
    lifecycle_audit_new_status: facts.newStatus || null,
    lifecycle_audit_command: facts.command || 'transitionWorkOrderStatus',
    lifecycle_audit_actor_user_id: facts.actorUserId || null,
    lifecycle_audit_actor_role: facts.actorRole || null,
    lifecycle_audit_committed_at: facts.committedAt || null,
    lifecycle_audit_error: null,
  };
}

export async function clearLifecycleAuditPending(base44, { organizationId, workOrderId, status, operationId, correlationId }) {
  return base44.asServiceRole.entities.OrdenTrabajo.updateMany({
    id: workOrderId,
    organization_id: organizationId,
    estado: status,
    lifecycle_audit_correlation_id: operationId || correlationId,
  }, { $set: {
    lifecycle_audit_pending: false,
    lifecycle_audit_error: null,
  } });
}

export async function recordLifecycleAuditFailure(base44, { organizationId, workOrderId, status, operationId, correlationId, error }) {
  try {
    return await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
      id: workOrderId,
      organization_id: organizationId,
      estado: status,
      lifecycle_audit_correlation_id: operationId || correlationId,
    }, { $set: {
      lifecycle_audit_pending: true,
      lifecycle_audit_error: String(error?.message || error || 'UNKNOWN_AUDIT_ERROR').slice(0, 500),
    } });
  } catch (markerError) {
    console.error('[transitionWorkOrderStatus] no se pudo actualizar el marcador durable de auditoria:', markerError.message);
    return null;
  }
}

export function lifecycleAuditRecoveryFacts(workOrder, fallback = {}) {
  return {
    operationId: workOrder?.lifecycle_audit_correlation_id || fallback.operationId || null,
    externalCorrelationId: workOrder?.lifecycle_audit_external_correlation_id || fallback.externalCorrelationId || null,
    previousStatus: workOrder?.lifecycle_audit_previous_status || fallback.previousStatus || null,
    newStatus: workOrder?.lifecycle_audit_new_status || fallback.newStatus || null,
    command: workOrder?.lifecycle_audit_command || fallback.command || 'transitionWorkOrderStatus',
    actorUserId: workOrder?.lifecycle_audit_actor_user_id || fallback.actorUserId || null,
    actorRole: workOrder?.lifecycle_audit_actor_role || fallback.actorRole || null,
    committedAt: workOrder?.lifecycle_audit_committed_at || fallback.committedAt || null,
  };
}
