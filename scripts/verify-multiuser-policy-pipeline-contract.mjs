import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  EvaluateCommandPolicy,
  evaluateCommandPolicy,
} from '../base44/functions/_shared/commandPolicy.ts';
import {
  evaluateCommandPolicyWithShadow,
  ExecuteSovereignCommand,
  SovereignCommandError,
} from '../base44/functions/_shared/commandExecution.ts';
import {
  ResolveAuthorizationContext,
} from '../base44/functions/_shared/userAuthorization.ts';
import { getRoleCapabilities } from '../base44/functions/_shared/roleCapabilities.ts';

const groups = [];
const test = (name, run) => groups.push({ name, run });

function auditRuntime({ failCreate = false } = {}) {
  const events = [];
  const organization = { id: 'org-a' };
  const matchesOrganization = query => {
    if (query.id !== organization.id) return false;
    if (query.$or) {
      const claimAvailable = !Object.hasOwn(organization, 'audit_claim_token')
        || organization.audit_claim_token === null;
      if (!claimAvailable) return false;
    }
    for (const field of ['audit_claim_token', 'audit_claim_operation_id', 'audit_claim_identity_hash']) {
      if (Object.hasOwn(query, field) && query[field] !== organization[field]) return false;
    }
    return true;
  };
  return {
    events,
    base44: {
      asServiceRole: {
        entities: {
          AuditEvent: {
            filter: async query => events.filter(event => Object.entries(query)
              .every(([field, value]) => event[field] === value)),
            create: async event => {
              if (failCreate) throw new Error('simulated shadow audit failure');
              const created = { id: `audit-${events.length + 1}`, ...event };
              events.push(created);
              return created;
            },
          },
          Organization: {
            filter: async query => query.id === organization.id ? [{ ...organization }] : [],
            updateMany: async (query, update) => {
              if (!matchesOrganization(query)) return { updated: 0 };
              Object.assign(organization, update.$set || {});
              for (const field of Object.keys(update.$unset || {})) delete organization[field];
              return { updated: 1 };
            },
          },
        },
      },
    },
  };
}

function human(role, overrides = {}) {
  return {
    ok: true,
    principalClass: 'HUMAN_MEMBER',
    organizationId: 'org-a',
    branchId: role === 'ORG_ADMIN' ? null : 'branch-a',
    role,
    persistedRole: role,
    capabilities: getRoleCapabilities(role),
    ...overrides,
  };
}

test('frozen architecture exports canonical Resolve, Evaluate and Execute names', () => {
  assert.equal(typeof ResolveAuthorizationContext, 'function');
  assert.equal(EvaluateCommandPolicy, evaluateCommandPolicy);
  assert.equal(typeof ExecuteSovereignCommand, 'function');
});

test('Resolve -> Evaluate -> Execute dispatches one allowed named branch writer', async () => {
  const entities = {
    UserAccount: { filter: async () => [{ id: 'ua-a', user_id: 'user-a', user_email: 'a@example.com', organization_id: 'org-a', role: 'ORG_ADMIN', status: 'active' }] },
    Organization: { filter: async () => [{ id: 'org-a', status: 'active' }] },
    Branch: { filter: async () => [] },
  };
  const authorization = await ResolveAuthorizationContext(
    { asServiceRole: { entities } },
    { id: 'user-a', email: 'a@example.com', role: 'user' },
    { organizationHint: 'org-a' },
  );
  const evaluated = await evaluateCommandPolicyWithShadow({
    policyId: 'CP-BR-001', authorization, relationship: 'ORG_RESOURCE', compatibilityDecision: true,
  });
  let calls = 0;
  const result = await ExecuteSovereignCommand({
    decision: evaluated,
    sovereignWriter: 'manageBranchLifecycle',
    execute: async () => { calls += 1; return 'committed-by-branch-writer'; },
  });
  assert.equal(result, 'committed-by-branch-writer');
  assert.equal(calls, 1);
});

test('canonical DENY reaches Execute and never invokes the sovereign writer', async () => {
  const evaluated = await evaluateCommandPolicyWithShadow({
    policyId: 'CP-DEL-001',
    authorization: human('TECHNICIAN'),
    relationship: 'BRANCH_RESOURCE',
    compatibilityDecision: { ok: false, code: 'CAPABILITY_DENIED' },
  });
  let calls = 0;
  await assert.rejects(
    ExecuteSovereignCommand({
      decision: evaluated,
      sovereignWriter: 'deliverWorkOrder',
      execute: async () => { calls += 1; },
    }),
    error => error instanceof SovereignCommandError && error.code === 'CAPABILITY_DENIED',
  );
  assert.equal(calls, 0);
});

test('Execute rejects forged decisions and mismatched writer identities', async () => {
  await assert.rejects(
    ExecuteSovereignCommand({ decision: { ok: true, policy: { writer: 'deliverWorkOrder' } }, sovereignWriter: 'deliverWorkOrder', execute: async () => null }),
    error => error.code === 'UNEVALUATED_COMMAND_DECISION',
  );
  const evaluated = await evaluateCommandPolicyWithShadow({
    policyId: 'CP-DEL-001', authorization: human('SALES'), relationship: 'BRANCH_RESOURCE', compatibilityDecision: true,
  });
  await assert.rejects(
    ExecuteSovereignCommand({ decision: evaluated, sovereignWriter: 'createSale', execute: async () => null }),
    error => error.code === 'SOVEREIGN_WRITER_MISMATCH',
  );
});

test('Execute trusts only the exact evaluated object and rejects spread or structured clones', async () => {
  const evaluated = await evaluateCommandPolicyWithShadow({
    policyId: 'CP-DEL-001', authorization: human('SALES'), relationship: 'BRANCH_RESOURCE', compatibilityDecision: true,
  });
  let calls = 0;
  for (const clonedDecision of [{ ...evaluated }, structuredClone(evaluated)]) {
    await assert.rejects(
      ExecuteSovereignCommand({
        decision: clonedDecision,
        sovereignWriter: 'deliverWorkOrder',
        execute: async () => { calls += 1; },
      }),
      error => error.code === 'UNEVALUATED_COMMAND_DECISION',
    );
  }
  assert.equal(calls, 0);
});

test('shadow mismatch is auditable, observe-only and contains no bearer value', async () => {
  const runtime = auditRuntime();
  const authorization = human('ORG_ADMIN');
  const evaluated = await evaluateCommandPolicyWithShadow({
    base44: runtime.base44,
    policyId: 'CP-BR-001',
    authorization,
    relationship: 'ORG_RESOURCE',
    compatibilityDecision: { ok: false, code: 'LEGACY_ROLE_DENY' },
    audit: {
      actorUserId: 'user-a', resourceType: 'Branch', resourceId: 'branch-a', correlationId: 'shadow-a',
    },
  });
  assert.equal(evaluated.ok, true);
  assert.equal(evaluated.shadow.mismatch, true);
  assert.equal(evaluated.shadow.evidenceRecorded, true);
  assert.equal(runtime.events.length, 1);
  assert.equal(runtime.events[0].event_type, 'AUTHORIZATION_SHADOW_MISMATCH');
  assert.equal(runtime.events[0].metadata.shadow_can_grant, false);
  assert.doesNotMatch(JSON.stringify(runtime.events[0]), /secret-token-value|customer_token|public_access_token/);
});

test('shadow ALLOW can never override canonical DENY', async () => {
  const runtime = auditRuntime();
  const evaluated = await evaluateCommandPolicyWithShadow({
    base44: runtime.base44,
    policyId: 'CP-DEL-001',
    authorization: human('TECHNICIAN'),
    relationship: 'BRANCH_RESOURCE',
    compatibilityDecision: { ok: true, code: 'LEGACY_ALLOW' },
    audit: {
      actorUserId: 'tech-a', branchId: 'branch-a', resourceType: 'OrdenTrabajo', resourceId: 'ot-a', correlationId: 'shadow-deny-a',
    },
  });
  assert.equal(evaluated.ok, false);
  assert.equal(evaluated.code, 'CAPABILITY_DENIED');
  assert.equal(runtime.events[0].outcome, 'DENIED');
  let calls = 0;
  await assert.rejects(ExecuteSovereignCommand({
    decision: evaluated, sovereignWriter: 'deliverWorkOrder', execute: async () => { calls += 1; },
  }));
  assert.equal(calls, 0);
});

test('an unauditable canonical-ALLOW mismatch fails closed before mutation', async () => {
  const runtime = auditRuntime({ failCreate: true });
  const evaluated = await evaluateCommandPolicyWithShadow({
    base44: runtime.base44,
    policyId: 'CP-BR-001',
    authorization: human('ORG_ADMIN'),
    relationship: 'ORG_RESOURCE',
    compatibilityDecision: false,
    audit: {
      actorUserId: 'admin-a', resourceType: 'Branch', resourceId: 'branch-a', correlationId: 'shadow-failure-a',
    },
  });
  assert.equal(evaluated.ok, false);
  assert.equal(evaluated.code, 'SHADOW_AUTHORIZATION_AUDIT_REQUIRED');
});

test('command-specific lifecycle policy evaluates capability, relationship, scope and state', () => {
  const authorization = human('TECHNICIAN');
  assert.equal(EvaluateCommandPolicy({
    policyId: 'CP-OT-002', authorization,
    relationship: 'EFFECTIVE_TECHNICIAN',
    commandCapability: { allOf: ['TECHNICAL_WORK'] },
    commandRelationship: 'EFFECTIVE_TECHNICIAN',
  }).ok, true);
  assert.equal(EvaluateCommandPolicy({
    policyId: 'CP-OT-002', authorization,
    relationship: 'BRANCH_RESOURCE',
    commandCapability: { allOf: ['TECHNICAL_WORK'] },
    commandRelationship: 'EFFECTIVE_TECHNICIAN',
  }).code, 'RESOURCE_RELATIONSHIP_DENIED');
  assert.equal(EvaluateCommandPolicy({
    policyId: 'CP-OT-002', authorization,
    relationship: 'EFFECTIVE_TECHNICIAN',
    commandCapability: { allOf: ['TECHNICAL_WORK'] },
    commandRelationship: 'EFFECTIVE_TECHNICIAN',
    preconditionSatisfied: false,
  }).code, 'COMMAND_PRECONDITION_DENIED');
});

test('public customer authority remains resource/operation scoped and isolated from staff capabilities', async () => {
  const customer = { ok: true, principalClass: 'CUSTOMER_TOKEN', organizationId: 'org-a', capabilities: [] };
  const allowed = await evaluateCommandPolicyWithShadow({
    policyId: 'CP-QUOTE-002', authorization: customer,
    relationship: 'CUSTOMER_TOKEN_RESOURCE', authorityContract: 'QUOTE_DECISION', compatibilityDecision: true,
  });
  assert.equal((await ExecuteSovereignCommand({
    decision: allowed, sovereignWriter: 'handlePublicCustomerDecisionV2', execute: async () => 'public-decision',
  })), 'public-decision');
  assert.equal(EvaluateCommandPolicy({
    policyId: 'CP-QUOTE-002', authorization: human('SALES'),
    relationship: 'CUSTOMER_TOKEN_RESOURCE', authorityContract: 'QUOTE_DECISION',
  }).code, 'PRINCIPAL_CLASS_DENIED');
  assert.equal(EvaluateCommandPolicy({
    policyId: 'CP-QUOTE-002', authorization: customer,
    relationship: 'CUSTOMER_TOKEN_RESOURCE', authorityContract: 'PUBLIC_DOCUMENT_READ',
  }).code, 'AUTHORITY_CONTRACT_DENIED');
});

test('representative production entrypoints traverse Evaluate -> Execute -> named writer', async () => {
  const files = {
    lifecycle: '../base44/functions/transitionWorkOrderStatus/entry.ts',
    assignment: '../base44/functions/reassignWorkOrderTechnician/entry.ts',
    inventory: '../base44/functions/technicalRequestCommand/entry.ts',
    delivery: '../base44/functions/deliverWorkOrder/entry.ts',
    branch: '../base44/functions/manageBranchLifecycle/entry.ts',
  };
  for (const [name, path] of Object.entries(files)) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /evaluateCommandPolicyWithShadow\s*\(/, `${name}:evaluate`);
    assert.match(source, /ExecuteSovereignCommand\s*\(/, `${name}:execute`);
  }
  const lifecycle = await readFile(new URL(files.lifecycle, import.meta.url), 'utf8');
  const policy = await readFile(new URL('../base44/functions/_shared/commandPolicy.ts', import.meta.url), 'utf8');
  assert.match(lifecycle, /sovereignWriter:\s*'transitionWorkOrderStatus'/);
  assert.match(lifecycle, /sovereignWriter:\s*'handlePublicCustomerDecisionV2'/);
  assert.match(policy, /'DIAGNOSTICADA->APROBADA'/);
  assert.match(policy, /'COTIZADA->APROBADA'/);
});

test('unattended processOTEvent still fails closed before payload or event reads', async () => {
  const source = await readFile(new URL('../base44/functions/processOTEvent/entry.ts', import.meta.url), 'utf8');
  const blocker = source.indexOf('AUTOMATION_TRUST_ATTESTATION_UNAVAILABLE');
  assert.ok(blocker > 0);
  assert.ok(blocker < source.indexOf('body = await req.json()'));
  assert.ok(blocker < source.indexOf('entities.OTEvent.filter'));
});

for (const group of groups) {
  await group.run();
  console.log(`PASS ${group.name}`);
}
console.log(`\n${groups.length}/${groups.length} canonical policy-pipeline integration groups PASS`);
