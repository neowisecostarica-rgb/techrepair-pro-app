import { appendAuditEvent } from './auditEvent.ts';

export async function appendDeviceCredentialRevealAudit(base44, {
  authorization,
  user,
  workOrder,
  correlationId,
}) {
  const auditOperationId = crypto.randomUUID();
  const result = await appendAuditEvent(base44, {
    eventType: 'DEVICE_CREDENTIAL_REVEALED',
    principalClass: authorization.principalClass,
    actorUserId: user.id,
    actorPrimaryRole: authorization.persistedRole,
    effectiveTechnicianUserId: user.id,
    organizationId: authorization.organizationId,
    branchId: workOrder.branch_id,
    resourceType: 'OrdenTrabajo',
    resourceId: workOrder.id,
    commandPolicyId: 'CP-TECH-001',
    correlationId,
    auditOperationId,
    operationSemantics: { action: 'DEVICE_CREDENTIAL_REVEAL' },
    metadata: { projection: 'DEVICE_CREDENTIAL_REVEAL' },
  });
  return { ...result, auditOperationId };
}
