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

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value ?? null;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

// Immutable compatibility tuple for an organization-scoped audit operation.
// Tracing, outcome, timestamps, snapshots, descriptive metadata and roles are
// intentionally excluded. Stateful writers provide the minimal operation
// semantics that distinguish incompatible uses of the same operation ID.
function immutableIdentity(event) {
  return stable({
    event_type: event.event_type,
    principal_class: event.principal_class,
    actor_user_id: event.actor_user_id,
    effective_technician_user_id: event.effective_technician_user_id,
    resource_type: event.resource_type,
    resource_id: event.resource_id,
    command_policy_id: event.command_policy_id,
    operation_semantics: event.operation_semantics || {},
  });
}

function assertCompatible(existing, candidate) {
  if (JSON.stringify(immutableIdentity(existing)) === JSON.stringify(immutableIdentity(candidate))) return;
  const error = new Error('AUDIT_OPERATION_ID_COLLISION');
  error.code = 'AUDIT_OPERATION_ID_COLLISION';
  throw error;
}

async function findExisting(base44, event) {
  const existing = await base44.asServiceRole.entities.AuditEvent.filter({
    organization_id: event.organization_id,
    audit_operation_id: event.audit_operation_id,
  }, '-created_date', 2);
  if (existing?.length > 1) {
    for (const record of existing) assertCompatible(record, event);
    const error = new Error('AUDIT_OPERATION_ID_AMBIGUOUS');
    error.code = 'AUDIT_OPERATION_ID_AMBIGUOUS';
    throw error;
  }
  if (existing?.length === 1) {
    assertCompatible(existing[0], event);
    return existing[0];
  }
  return null;
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
    external_correlation_id: clean(input.externalCorrelationId || input.correlationId),
    audit_operation_id: clean(input.auditOperationId),
    operation_key: clean(input.operationKey),
    operation_semantics: cleanObject(input.operationSemantics),
    outcome: clean(input.outcome) || 'COMMITTED',
    prior_state: cleanObject(input.priorState),
    new_state: cleanObject(input.newState),
    custody_snapshot: cleanObject(input.custodySnapshot),
    metadata: cleanObject(input.metadata),
    occurred_at: input.occurredAt || new Date().toISOString(),
  };
  for (const field of ['event_type', 'principal_class', 'organization_id', 'resource_type', 'resource_id', 'command_policy_id', 'correlation_id', 'audit_operation_id']) {
    if (!event[field]) throw new Error(`AUDIT_EVENT_FIELD_REQUIRED:${field}`);
  }
  return event;
}

// Serialize audit read+create against an existing organization record. This
// protects against cooperating concurrent writers when Base44's updateMany
// CAS is atomic. It is NOT a database UNIQUE constraint or an ACID transaction:
// an expired lease during a stalled write or non-CAS runtime can still race.
const AUDIT_LEASE_MS = 60000;
const AUDIT_WAIT_MS = 8000;
const AUDIT_RETRY_MS = 55;
const auditWait = ms => new Promise(resolve => setTimeout(resolve, ms));

function auditLockError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

async function lockAuditOrganization(base44, organizationId) {
  const orgs = base44.asServiceRole.entities.Organization;
  if (!orgs?.filter || !orgs?.updateMany) throw auditLockError('AUDIT_LOCK_UNAVAILABLE');
  const token = crypto.randomUUID();
  const until = Date.now() + AUDIT_WAIT_MS;
  while (Date.now() <= until) {
    const now = Date.now();
    const lockData = { audit_lock_token: token, audit_lock_at: new Date(now).toISOString() };
    let claim;
    try {
      claim = await orgs.updateMany({
        id: organizationId,
        $or: [
          { audit_lock_token: { $exists: false } },
          { audit_lock_token: null },
          { audit_lock_token: '' },
        ],
      }, { $set: lockData });
    } catch (error) {
      const org = (await orgs.filter({ id: organizationId }, '-created_date', 1))?.[0];
      if (org?.audit_lock_token === token) return { token, orgs };
      throw auditLockError('AUDIT_LOCK_WRITE_UNCERTAIN');
    }
    if (claim?.updated === 1) return { token, orgs };
    const org = (await orgs.filter({ id: organizationId }, '-created_date', 1))?.[0];
    if (!org) throw auditLockError('AUDIT_ORGANIZATION_NOT_FOUND');
    if (org.audit_lock_token === token) return { token, orgs };
    const lockedAt = Date.parse(org.audit_lock_at || '');
    if (org.audit_lock_token && Number.isFinite(lockedAt)
      && now - lockedAt > AUDIT_LEASE_MS) {
      const recovered = await orgs.updateMany({
        id: organizationId,
        audit_lock_token: org.audit_lock_token,
        audit_lock_at: org.audit_lock_at,
      }, { $set: lockData });
      if (recovered?.updated === 1) return { token, orgs };
    }
    if (Date.now() >= until) break;
    await auditWait(Math.min(AUDIT_RETRY_MS, until - Date.now()));
  }
  throw auditLockError('AUDIT_LOCK_TIMEOUT');
}

export async function appendAuditEvent(base44, input) {
  const event = buildAuditEvent(input);
  const lock = await lockAuditOrganization(base44, event.organization_id);
  try {
    const existing = await findExisting(base44, event);
    if (existing) return { event: existing, duplicate: true };
    try {
      const created = await base44.asServiceRole.entities.AuditEvent.create(event);
      return { event: created, duplicate: false };
    } catch (error) {
      const reconciled = await findExisting(base44, event);
      if (reconciled) return { event: reconciled, duplicate: true, reconciled: true };
      throw error;
    }
  } finally {
    try {
      const released = await lock.orgs.updateMany({
        id: event.organization_id, audit_lock_token: lock.token,
      }, { $unset: { audit_lock_token: '', audit_lock_at: '' } });
      if (released?.updated !== 1) {
        console.warn('[auditEvent] Audit lock owner changed during operation');
      }
    } catch (error) {
      console.error('[auditEvent] Audit lock release uncertain', error?.message);
    }
  }
}
