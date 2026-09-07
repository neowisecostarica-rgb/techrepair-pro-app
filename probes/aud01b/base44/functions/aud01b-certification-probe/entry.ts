import { createClientFromRequest } from 'npm:@base44/sdk';
import { appendAuditEvent, buildAuditEvent } from './auditEvent.ts';

const EXPECTED_APP_ID = '6a831a96fe7af85246647a99';
const EXPECTED_APP_NAME = 'TRP-AUD01B-CAS-CERT-DO-NOT-PUBLISH';
const DISPOSABLE_PREFIX = 'AUD01B-CERT-DISPOSABLE-';
const SENTINEL_KIND = 'TARGET';
const MAX_RELEASE_DELAY_MS = 30_000;

const SCENARIOS = new Set([
  'compatible',
  'incompatible',
  'ownership_loss',
  'create_persisted_uncertain',
  'create_unproven',
  'non_owner_release',
  'ambiguous_existing',
]);

class ProbeError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function cleanIdentifier(value, field) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9_-]{8,96}$/.test(text)) {
    throw new ProbeError(`AUD01B_PROBE_INVALID_${field.toUpperCase()}`);
  }
  return text;
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function requireAdmin(base44) {
  const user = await base44.auth.me();
  if (!user || user.role !== 'admin') {
    throw new ProbeError('AUD01B_PROBE_ADMIN_REQUIRED', 403);
  }
  return user;
}

async function assertCertificationTarget(base44, body) {
  if (body?.app_id !== EXPECTED_APP_ID || body?.app_name !== EXPECTED_APP_NAME) {
    throw new ProbeError('AUD01B_PROBE_TARGET_REFUSED', 403);
  }
  const sentinels = await base44.asServiceRole.entities.Aud01bCasProbe.filter({
    marker: EXPECTED_APP_ID,
    record_kind: SENTINEL_KIND,
  }, '-created_date', 2);
  if (sentinels?.length !== 1 || sentinels[0].claim_state !== 'TARGET_CONFIRMED') {
    throw new ProbeError('AUD01B_PROBE_SENTINEL_MISSING', 403);
  }
}

function disposableOrganizationName(runId, scenario) {
  return `${DISPOSABLE_PREFIX}${runId}-${scenario}`.slice(0, 240);
}

function operationId(runId, scenario) {
  return `AUD01B-CERT-${runId}-${scenario}`.slice(0, 240);
}

async function requireDisposableOrganization(base44, organizationId, runId, scenario) {
  const records = await base44.asServiceRole.entities.Organization.filter({ id: organizationId }, '-created_date', 2);
  if (records?.length !== 1) throw new ProbeError('AUD01B_PROBE_ORGANIZATION_INVALID', 404);
  if (records[0].name !== disposableOrganizationName(runId, scenario)) {
    throw new ProbeError('AUD01B_PROBE_NON_DISPOSABLE_ORGANIZATION_REFUSED', 403);
  }
  return records[0];
}

function auditInput({ user, organizationId, runId, scenario, callerLabel, identityVariant = 'A' }) {
  const incompatibleSuffix = scenario === 'incompatible' && identityVariant === 'B' ? 'resource-B' : 'resource-A';
  return {
    eventType: 'AUD01B_CERT_OPERATION_COMMITTED',
    principalClass: 'SYSTEM_AUTOMATION',
    actorUserId: user.id,
    actorPrimaryRole: 'ADMIN',
    organizationId,
    resourceType: 'Aud01bCasProbe',
    resourceId: `${runId}:${scenario}:${incompatibleSuffix}`,
    commandPolicyId: 'AUD01B-CERT-001',
    correlationId: `${runId}:${scenario}:${callerLabel}`,
    auditOperationId: operationId(runId, scenario),
    operationSemantics: { certification: 'AUD-01B', scenario, run_id: runId },
    outcome: 'COMMITTED',
    metadata: { disposable: true, caller_label: callerLabel },
  };
}

function faultInjectedClient(base44, { faultMode, organizationId }) {
  const entities = base44.asServiceRole.entities;
  let ownedClaimReads = 0;

  const organization = {
    async filter(query, ...args) {
      const records = await entities.Organization.filter(query, ...args);
      const current = records?.[0];
      if (faultMode === 'loss_before_create'
        && current?.id === organizationId
        && current.audit_claim_token) {
        ownedClaimReads += 1;
        if (ownedClaimReads === 2) {
          await entities.Organization.updateMany({
            id: organizationId,
            audit_claim_token: current.audit_claim_token,
          }, {
            $set: {
              audit_claim_token: `foreign-${crypto.randomUUID()}`,
              audit_claim_operation_id: current.audit_claim_operation_id,
              audit_claim_identity_hash: current.audit_claim_identity_hash,
              audit_claimed_at: new Date().toISOString(),
            },
          });
          return entities.Organization.filter(query, ...args);
        }
      }
      return records;
    },
    async updateMany(query, mutation) {
      if (faultMode === 'suppress_release' && mutation?.$unset?.audit_claim_token !== undefined) {
        return { success: true, updated: 0 };
      }
      return entities.Organization.updateMany(query, mutation);
    },
  };

  const auditEvent = {
    filter: (...args) => entities.AuditEvent.filter(...args),
    async create(event) {
      if (faultMode === 'throw_before_persist') {
        throw Object.assign(new Error('AUD01B_INJECTED_CREATE_UNPROVEN'), {
          code: 'AUD01B_INJECTED_CREATE_UNPROVEN',
        });
      }
      const created = await entities.AuditEvent.create(event);
      if (faultMode === 'persist_then_throw') {
        throw Object.assign(new Error('AUD01B_INJECTED_CREATE_RESPONSE_LOST'), {
          code: 'AUD01B_INJECTED_CREATE_RESPONSE_LOST',
        });
      }
      return created;
    },
  };

  return {
    asServiceRole: {
      entities: {
        Organization: organization,
        AuditEvent: auditEvent,
      },
    },
  };
}

async function prepare(base44, body) {
  const runId = cleanIdentifier(body.run_id, 'run_id');
  const scenario = cleanIdentifier(body.scenario, 'scenario');
  if (!SCENARIOS.has(scenario)) throw new ProbeError('AUD01B_PROBE_SCENARIO_REFUSED');
  const name = disposableOrganizationName(runId, scenario);
  const existing = await base44.asServiceRole.entities.Organization.filter({ name }, '-created_date', 2);
  if (existing?.length) throw new ProbeError('AUD01B_PROBE_RUN_ALREADY_EXISTS', 409);
  const organization = await base44.asServiceRole.entities.Organization.create({
    name,
    country: 'CR',
    currency: 'CRC',
    plan: 'basic',
    status: 'active',
  });
  return { organization_id: organization.id, operation_id: operationId(runId, scenario) };
}

async function invokeWriter(base44, user, body) {
  const runId = cleanIdentifier(body.run_id, 'run_id');
  const scenario = cleanIdentifier(body.scenario, 'scenario');
  const callerLabel = cleanIdentifier(body.caller_label, 'caller_label');
  if (!SCENARIOS.has(scenario)) throw new ProbeError('AUD01B_PROBE_SCENARIO_REFUSED');
  const organizationId = cleanIdentifier(body.organization_id, 'organization_id');
  await requireDisposableOrganization(base44, organizationId, runId, scenario);

  const releaseEpochMs = Number(body.release_epoch_ms);
  if (!Number.isSafeInteger(releaseEpochMs)) throw new ProbeError('AUD01B_PROBE_RELEASE_TIME_REQUIRED');
  const delay = releaseEpochMs - Date.now();
  if (delay > MAX_RELEASE_DELAY_MS || delay < -5_000) {
    throw new ProbeError('AUD01B_PROBE_RELEASE_TIME_REFUSED');
  }
  if (delay > 0) await wait(delay);

  const faultMode = typeof body.fault_mode === 'string' ? body.fault_mode : 'none';
  const allowedFaults = new Set(['none', 'loss_before_create', 'persist_then_throw', 'throw_before_persist', 'suppress_release']);
  if (!allowedFaults.has(faultMode)) throw new ProbeError('AUD01B_PROBE_FAULT_MODE_REFUSED');
  const identityVariant = body.identity_variant === 'B' ? 'B' : 'A';
  const input = auditInput({ user, organizationId, runId, scenario, callerLabel, identityVariant });
  const result = await appendAuditEvent(faultInjectedClient(base44, { faultMode, organizationId }), input);
  return {
    duplicate: result.duplicate === true,
    reconciled: result.reconciled === true,
    event_id: result.event?.id || null,
  };
}

async function inspect(base44, body) {
  const runId = cleanIdentifier(body.run_id, 'run_id');
  const scenario = cleanIdentifier(body.scenario, 'scenario');
  const organizationId = cleanIdentifier(body.organization_id, 'organization_id');
  const organization = await requireDisposableOrganization(base44, organizationId, runId, scenario);
  const events = await base44.asServiceRole.entities.AuditEvent.filter({
    organization_id: organizationId,
    audit_operation_id: operationId(runId, scenario),
  }, 'created_date', 10);
  return {
    organization_id: organizationId,
    operation_id: operationId(runId, scenario),
    event_count: events.length,
    event_ids: events.map(event => event.id),
    claim: {
      present: Boolean(organization.audit_claim_token),
      operation_id: organization.audit_claim_operation_id || null,
      identity_hash_present: Boolean(organization.audit_claim_identity_hash),
      claimed_at: organization.audit_claimed_at || null,
    },
  };
}

async function seedAmbiguous(base44, user, body) {
  const runId = cleanIdentifier(body.run_id, 'run_id');
  const scenario = cleanIdentifier(body.scenario, 'scenario');
  if (scenario !== 'ambiguous_existing') throw new ProbeError('AUD01B_PROBE_SCENARIO_REFUSED');
  const organizationId = cleanIdentifier(body.organization_id, 'organization_id');
  await requireDisposableOrganization(base44, organizationId, runId, scenario);
  const event = buildAuditEvent(auditInput({
    user,
    organizationId,
    runId,
    scenario,
    callerLabel: 'SEED',
    identityVariant: 'A',
  }));
  const first = await base44.asServiceRole.entities.AuditEvent.create(event);
  const second = await base44.asServiceRole.entities.AuditEvent.create({
    ...event,
    correlation_id: `${runId}:${scenario}:SEED-2`,
    external_correlation_id: `${runId}:${scenario}:SEED-2`,
  });
  return { event_ids: [first.id, second.id] };
}

async function cleanup(base44, body) {
  const runId = cleanIdentifier(body.run_id, 'run_id');
  const scenario = cleanIdentifier(body.scenario, 'scenario');
  const organizationId = cleanIdentifier(body.organization_id, 'organization_id');
  await requireDisposableOrganization(base44, organizationId, runId, scenario);
  const events = await base44.asServiceRole.entities.AuditEvent.filter({ organization_id: organizationId }, 'created_date', 500);
  for (const event of events) await base44.asServiceRole.entities.AuditEvent.delete(event.id);
  await base44.asServiceRole.entities.Organization.delete(organizationId);
  return { deleted_events: events.length, deleted_organization: true };
}

function errorResponse(error) {
  const code = typeof error?.code === 'string' ? error.code : 'AUD01B_PROBE_INTERNAL_ERROR';
  const status = Number.isInteger(error?.status) ? error.status : 409;
  return Response.json({ ok: false, error: { code } }, { status });
}

Deno.serve(async req => {
  try {
    if (req.method !== 'POST') throw new ProbeError('AUD01B_PROBE_METHOD_NOT_ALLOWED', 405);
    const body = await req.json();
    const base44 = createClientFromRequest(req);
    const user = await requireAdmin(base44);
    await assertCertificationTarget(base44, body);

    let result;
    if (body.action === 'prepare') result = await prepare(base44, body);
    else if (body.action === 'invoke_writer') result = await invokeWriter(base44, user, body);
    else if (body.action === 'inspect') result = await inspect(base44, body);
    else if (body.action === 'seed_ambiguous') result = await seedAmbiguous(base44, user, body);
    else if (body.action === 'cleanup') result = await cleanup(base44, body);
    else throw new ProbeError('AUD01B_PROBE_ACTION_REFUSED');

    return Response.json({ ok: true, action: body.action, result });
  } catch (error) {
    return errorResponse(error);
  }
});
