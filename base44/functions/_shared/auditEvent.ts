const MAX_TEXT = 240;

function clean(value, max = MAX_TEXT) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function cleanObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value));
}

export function buildAuditEvent(input) {
  const event = {
    event_type: clean(input.eventType),
    principal_class: clean(input.principalClass),
    actor_user_id: clean(input.actorUserId),
    actor_primary_role: clean(input.actorPrimaryRole),
    effective_technician_user_id: clean(input.effectiveTechnicianUserId),
    organization_id: clean(input.organizationId),
    branch_id: clean(input.branchId),
    resource_type: clean(input.resourceType),
    resource_id: clean(input.resourceId),
    command_policy_id: clean(input.commandPolicyId),
    correlation_id: clean(input.correlationId),
    operation_key: clean(input.operationKey),
    outcome: clean(input.outcome) || 'COMMITTED',
    prior_state: cleanObject(input.priorState),
    new_state: cleanObject(input.newState),
    custody_snapshot: cleanObject(input.custodySnapshot),
    metadata: cleanObject(input.metadata),
    occurred_at: input.occurredAt || new Date().toISOString(),
  };
  for (const field of ['event_type', 'principal_class', 'organization_id', 'resource_type', 'resource_id', 'command_policy_id', 'correlation_id']) {
    if (!event[field]) throw new Error(`AUDIT_EVENT_FIELD_REQUIRED:${field}`);
  }
  return event;
}

export async function appendAuditEvent(base44, input) {
  const event = buildAuditEvent(input);
  const existing = await base44.asServiceRole.entities.AuditEvent.filter({
    organization_id: event.organization_id,
    correlation_id: event.correlation_id,
    event_type: event.event_type,
    resource_type: event.resource_type,
    resource_id: event.resource_id,
  }, '-created_date', 2);
  if (existing?.length > 1) throw new Error('AUDIT_EVENT_AMBIGUOUS');
  if (existing?.length === 1) return { event: existing[0], duplicate: true };
  try {
    return { event: await base44.asServiceRole.entities.AuditEvent.create(event), duplicate: false };
  } catch (error) {
    const reconciled = await base44.asServiceRole.entities.AuditEvent.filter({
      organization_id: event.organization_id,
      correlation_id: event.correlation_id,
      event_type: event.event_type,
      resource_type: event.resource_type,
      resource_id: event.resource_id,
    }, '-created_date', 2);
    if (reconciled?.length === 1) return { event: reconciled[0], duplicate: true, reconciled: true };
    throw error;
  }
}

