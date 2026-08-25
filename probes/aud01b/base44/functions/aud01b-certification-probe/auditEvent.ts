const MAX_TEXT = 240;
const CLAIM_WAIT_ATTEMPTS = 20;
const CLAIM_WAIT_MS = 25;

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
  throw auditError('AUDIT_OPERATION_ID_COLLISION');
}

function auditError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function sha256(value) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function claimIdentityHash(event) {
  return sha256(JSON.stringify(immutableIdentity(event)));
}

async function findExisting(base44, event) {
  const existing = await base44.asServiceRole.entities.AuditEvent.filter({
    organization_id: event.organization_id,
    audit_operation_id: event.audit_operation_id,
  }, '-created_date', 2);
  if (existing?.length > 1) {
    for (const record of existing) assertCompatible(record, event);
    throw auditError('AUDIT_OPERATION_ID_AMBIGUOUS');
  }
  if (existing?.length === 1) {
    assertCompatible(existing[0], event);
    return existing[0];
  }
  return null;
}

async function loadOrganization(base44, organizationId) {
  const organizations = await base44.asServiceRole.entities.Organization.filter({ id: organizationId }, '-created_date', 2);
  if (organizations?.length !== 1) throw auditError('AUDIT_CLAIM_ORGANIZATION_INVALID');
  return organizations[0];
}

function ownsAuditClaim(organization, event, identityHash, token) {
  return organization.audit_claim_token === token
    && organization.audit_claim_operation_id === event.audit_operation_id
    && organization.audit_claim_identity_hash === identityHash;
}

async function assertAuditClaimOwned(base44, event, identityHash, token) {
  const organization = await loadOrganization(base44, event.organization_id);
  if (!ownsAuditClaim(organization, event, identityHash, token)) {
    throw auditError('AUDIT_CLAIM_RECOVERY_REQUIRED');
  }
  return organization;
}

async function acquireAuditClaim(base44, event, identityHash) {
  const token = crypto.randomUUID();
  for (let attempt = 0; attempt < CLAIM_WAIT_ATTEMPTS; attempt += 1) {
    const existing = await findExisting(base44, event);
    if (existing) return { existing };

    const organization = await loadOrganization(base44, event.organization_id);
    if (organization.audit_claim_token) {
      if (organization.audit_claim_operation_id === event.audit_operation_id
        && organization.audit_claim_identity_hash !== identityHash) {
        throw auditError('AUDIT_OPERATION_ID_COLLISION');
      }
      await wait(CLAIM_WAIT_MS);
      continue;
    }

    const claim = {
      audit_claim_token: token,
      audit_claim_operation_id: event.audit_operation_id,
      audit_claim_identity_hash: identityHash,
      audit_claimed_at: new Date().toISOString(),
    };
    let result;
    try {
      result = await base44.asServiceRole.entities.Organization.updateMany({
        id: event.organization_id,
        $or: [
          { audit_claim_token: { $exists: false } },
          { audit_claim_token: null },
        ],
      }, { $set: claim });
    } catch {
      const reconciled = await loadOrganization(base44, event.organization_id);
      if (ownsAuditClaim(reconciled, event, identityHash, token)) {
        return { token, reconciled: true };
      }
      throw auditError('AUDIT_CLAIM_RECOVERY_REQUIRED');
    }
    if (result?.updated === 1) {
      await assertAuditClaimOwned(base44, event, identityHash, token);
      return { token };
    }
    await wait(CLAIM_WAIT_MS);
  }
  throw auditError('AUDIT_CLAIM_RECOVERY_REQUIRED');
}

async function releaseAuditClaim(base44, event, identityHash, token) {
  try {
    const result = await base44.asServiceRole.entities.Organization.updateMany({
      id: event.organization_id,
      audit_claim_token: token,
      audit_claim_operation_id: event.audit_operation_id,
      audit_claim_identity_hash: identityHash,
    }, {
      $unset: {
        audit_claim_token: '',
        audit_claim_operation_id: '',
        audit_claim_identity_hash: '',
        audit_claimed_at: '',
      },
    });
    if (result?.updated === 1) return true;
  } catch (error) {
    const reconciled = await loadOrganization(base44, event.organization_id);
    if (reconciled.audit_claim_token !== token) return true;
    throw error;
  }
  const reconciled = await loadOrganization(base44, event.organization_id);
  return reconciled.audit_claim_token !== token;
}

async function assertCompletedClaimCompatible(base44, event, identityHash) {
  const organization = await loadOrganization(base44, event.organization_id);
  if (!organization.audit_claim_token) return;
  if (organization.audit_claim_operation_id !== event.audit_operation_id) return;
  if (organization.audit_claim_identity_hash !== identityHash) {
    throw auditError('AUDIT_CLAIM_IDENTITY_MISMATCH');
  }
}

async function confirmAuditVisible(base44, event, createdId) {
  for (let attempt = 0; attempt < CLAIM_WAIT_ATTEMPTS; attempt += 1) {
    const visible = await findExisting(base44, event);
    if (visible) {
      if (createdId && visible.id !== createdId) throw auditError('AUDIT_OPERATION_ID_AMBIGUOUS');
      return visible;
    }
    await wait(CLAIM_WAIT_MS);
  }
  throw auditError('AUDIT_EVENT_VISIBILITY_UNCONFIRMED');
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

export async function appendAuditEvent(base44, input) {
  const event = buildAuditEvent(input);
  const identityHash = await claimIdentityHash(event);
  const existing = await findExisting(base44, event);
  if (existing) {
    await assertCompletedClaimCompatible(base44, event, identityHash);
    return { event: existing, duplicate: true };
  }

  const claim = await acquireAuditClaim(base44, event, identityHash);
  if (claim.existing) {
    await assertCompletedClaimCompatible(base44, event, identityHash);
    return { event: claim.existing, duplicate: true };
  }

  let retainClaim = true;
  try {
    const afterClaim = await findExisting(base44, event);
    if (afterClaim) {
      retainClaim = false;
      return { event: afterClaim, duplicate: true };
    }

    await assertAuditClaimOwned(base44, event, identityHash, claim.token);

    let created;
    try {
      created = await base44.asServiceRole.entities.AuditEvent.create(event);
    } catch (error) {
      try {
        const reconciled = await confirmAuditVisible(base44, event);
        retainClaim = false;
        return { event: reconciled, duplicate: true, reconciled: true };
      } catch (reconciliationError) {
        if (reconciliationError?.code !== 'AUDIT_EVENT_VISIBILITY_UNCONFIRMED') {
          throw reconciliationError;
        }
        throw error;
      }
    }

    const visible = await confirmAuditVisible(base44, event, created.id);
    retainClaim = false;
    return { event: visible, duplicate: false };
  } finally {
    if (!retainClaim) {
      try {
        const released = await releaseAuditClaim(base44, event, identityHash, claim.token);
        if (!released) console.error('[auditEvent] audit claim release requires reconciliation');
      } catch (error) {
        console.error('[auditEvent] audit claim release requires reconciliation', error?.message || error);
      }
    }
  }
}
