import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { appendAuditEvent, buildAuditEvent } from '../base44/functions/_shared/auditEvent.ts';
import { appendDeviceCredentialRevealAudit } from '../base44/functions/_shared/deviceCredentialAudit.ts';

function matches(record, query) {
  if (query.$or && !query.$or.some(candidate => matches(record, candidate))) return false;
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$or') return true;
    if (expected && typeof expected === 'object' && '$exists' in expected) {
      return (record[key] !== undefined) === expected.$exists;
    }
    return record[key] === expected;
  });
}

function applyMutation(record, mutation) {
  Object.assign(record, structuredClone(mutation.$set || {}));
  for (const key of Object.keys(mutation.$unset || {})) delete record[key];
}

function memoryBase44(options = {}) {
  const records = structuredClone(options.records || []);
  const organization = {
    id: 'org-1',
    ...(options.orphanClaim ? {
      audit_claim_token: 'orphan-token',
      audit_claim_operation_id: 'different-live-operation',
      audit_claim_identity_hash: 'orphan-hash',
      audit_claimed_at: '2026-08-15T09:00:00.000Z',
    } : {}),
  };
  const metrics = { createCalls: 0, activeCreates: 0, maxActiveCreates: 0, claimUpdates: 0 };
  let ambiguousClaimPending = options.ambiguousClaim === true;
  let ambiguousCreatePending = options.ambiguousCreate === true;
  let ambiguousReleasePending = options.ambiguousRelease === true;
  let uncertainCreatePending = options.uncertainCreate === true;
  let ownedClaimReads = 0;
  let signalCreateStarted;
  let releaseHeldCreate;
  const createStarted = new Promise(resolve => { signalCreateStarted = resolve; });
  const heldCreateReleased = new Promise(resolve => { releaseHeldCreate = resolve; });
  const auditEntity = {
    async filter(query) {
      return records
        .filter(record => matches(record, query))
        .slice(0, 2)
        .map(record => structuredClone(record));
    },
    async create(event) {
      metrics.createCalls += 1;
      metrics.activeCreates += 1;
      metrics.maxActiveCreates = Math.max(metrics.maxActiveCreates, metrics.activeCreates);
      if (options.createDelayMs) await new Promise(resolve => setTimeout(resolve, options.createDelayMs));
      if (uncertainCreatePending) {
        uncertainCreatePending = false;
        metrics.activeCreates -= 1;
        throw new Error('simulated uncertain AuditEvent.create response');
      }
      const record = { ...structuredClone(event), id: `audit-${records.length + 1}` };
      records.push(record);
      if (options.holdCreate) {
        signalCreateStarted();
        await heldCreateReleased;
      }
      metrics.activeCreates -= 1;
      if (ambiguousCreatePending) {
        ambiguousCreatePending = false;
        throw new Error('simulated ambiguous AuditEvent.create response');
      }
      return structuredClone(record);
    },
  };
  const organizationEntity = {
    async filter(query) {
      if (options.loseOwnershipBeforeCreate && organization.audit_claim_token) {
        ownedClaimReads += 1;
        if (ownedClaimReads === 2) {
          organization.audit_claim_token = 'foreign-token';
          organization.audit_claim_operation_id = 'foreign-operation';
          organization.audit_claim_identity_hash = 'foreign-hash';
        }
      }
      return matches(organization, query) ? [structuredClone(organization)] : [];
    },
    async updateMany(query, mutation) {
      if (!matches(organization, query)) return { updated: 0 };
      if (options.falsePositiveClaimUpdate && mutation.$set?.audit_claim_token) {
        metrics.claimUpdates += 1;
        return { updated: 1 };
      }
      applyMutation(organization, mutation);
      metrics.claimUpdates += 1;
      if (ambiguousClaimPending && mutation.$set?.audit_claim_token) {
        ambiguousClaimPending = false;
        throw new Error('simulated ambiguous Organization.updateMany response');
      }
      if (ambiguousReleasePending && mutation.$unset?.audit_claim_token !== undefined) {
        ambiguousReleasePending = false;
        throw new Error('simulated ambiguous claim release response');
      }
      return { updated: 1 };
    },
  };
  return {
    records,
    organization,
    metrics,
    createStarted,
    releaseCreate: () => releaseHeldCreate(),
    base44: { asServiceRole: { entities: { AuditEvent: auditEntity, Organization: organizationEntity } } },
  };
}

function input(overrides = {}) {
  return {
    eventType: 'TEST_OPERATION_COMMITTED',
    principalClass: 'HUMAN_MEMBER',
    actorUserId: 'user-1',
    actorPrimaryRole: 'TECHNICIAN',
    effectiveTechnicianUserId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    resourceType: 'OrdenTrabajo',
    resourceId: 'ot-1',
    commandPolicyId: 'CP-TEST-001',
    correlationId: 'trace-1',
    auditOperationId: 'backend-operation-1',
    operationSemantics: { action: 'TEST' },
    outcome: 'COMMITTED',
    priorState: { estado: 'A' },
    newState: { estado: 'B' },
    metadata: { description: 'first' },
    occurredAt: '2026-08-15T10:00:00.000Z',
    ...overrides,
  };
}

async function listTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? listTypeScriptFiles(target) : (entry.name.endsWith('.ts') ? [target] : []);
  }));
  return nested.flat();
}

test('A — same correlation with two backend operations creates two events', async () => {
  const store = memoryBase44();
  await appendAuditEvent(store.base44, input({ auditOperationId: 'operation-A', correlationId: 'shared-trace' }));
  await appendAuditEvent(store.base44, input({ auditOperationId: 'operation-B', correlationId: 'shared-trace' }));
  assert.equal(store.records.length, 2);
});

test('B — compatible replay resolves to one existing event', async () => {
  const store = memoryBase44();
  const first = await appendAuditEvent(store.base44, input());
  const replay = await appendAuditEvent(store.base44, input());
  assert.equal(first.duplicate, false);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.event.id, first.event.id);
  assert.equal(store.records.length, 1);
});

test('C — incompatible operation-ID reuse fails closed', async () => {
  const attacks = [
    { eventType: 'ATTACKER_EVENT' },
    { resourceType: 'Venta' },
    { resourceId: 'ot-attacker-target' },
    { commandPolicyId: 'CP-ATTACKER' },
    { actorUserId: 'attacker-user' },
    { operationSemantics: { action: 'DIFFERENT_OPERATION' } },
  ];
  for (const attack of attacks) {
    const store = memoryBase44();
    await appendAuditEvent(store.base44, input());
    await assert.rejects(
      appendAuditEvent(store.base44, input(attack)),
      error => error?.code === 'AUDIT_OPERATION_ID_COLLISION' && error.message === 'AUDIT_OPERATION_ID_COLLISION',
    );
    assert.equal(store.records.length, 1);
  }
});

test('D — outcome changes do not change operation identity', async () => {
  const store = memoryBase44();
  await appendAuditEvent(store.base44, input({ outcome: 'COMMITTED' }));
  const replay = await appendAuditEvent(store.base44, input({ outcome: 'IDEMPOTENT_REPLAY' }));
  assert.equal(replay.duplicate, true);
  assert.equal(store.records.length, 1);
});

test('E — metadata, timestamps and descriptive state do not change operation identity', async () => {
  const store = memoryBase44();
  await appendAuditEvent(store.base44, input());
  const replay = await appendAuditEvent(store.base44, input({
    metadata: { description: 'changed', retry: true },
    priorState: { estado: 'already-committed' },
    newState: { estado: 'still-committed', extra: 'description' },
    occurredAt: '2026-08-15T11:00:00.000Z',
  }));
  assert.equal(replay.duplicate, true);
  assert.equal(store.records.length, 1);
});

test('F — correlation is independent from operation identity', async () => {
  const store = memoryBase44();
  await appendAuditEvent(store.base44, input({ correlationId: 'trace-A' }));
  const replay = await appendAuditEvent(store.base44, input({ correlationId: 'trace-B' }));
  await appendAuditEvent(store.base44, input({ auditOperationId: 'backend-operation-2', correlationId: 'trace-A' }));
  assert.equal(replay.duplicate, true);
  assert.equal(store.records.length, 2);
});

test('G — every live appendAuditEvent call supplies auditOperationId', async () => {
  const root = path.resolve('base44/functions');
  const files = await listTypeScriptFiles(root);
  const callers = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    function visit(node) {
      if (ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === 'appendAuditEvent') {
        const argument = node.arguments[1];
        assert.ok(ts.isObjectLiteralExpression(argument), `${path.relative(root, file)} must pass an inline audit contract`);
        const explicit = argument.properties.some(property => {
          if (!('name' in property) || !property.name) return false;
          return (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
            && property.name.text === 'auditOperationId';
        });
        assert.ok(explicit, `${path.relative(root, file)}:${ast.getLineAndCharacterOfPosition(node.getStart()).line + 1} omits auditOperationId`);
        callers.push(file);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  assert.equal(callers.length, 24, 'review the migration matrix when the live caller inventory changes');
  const shared = await readFile(path.join(root, '_shared', 'auditEvent.ts'), 'utf8');
  assert.doesNotMatch(shared, /deriveAuditOperationId/);
  assert.match(shared, /claimIdentityHash/);
});

test('H — real credential-reveal writer records reused correlation as distinct acts', async () => {
  const store = memoryBase44();
  const context = {
    authorization: { principalClass: 'HUMAN_MEMBER', persistedRole: 'TECHNICIAN', organizationId: 'org-1' },
    user: { id: 'tech-1' },
    workOrder: { id: 'ot-credential', branch_id: 'branch-1' },
    correlationId: 'attacker-reused-correlation',
  };
  const first = await appendDeviceCredentialRevealAudit(store.base44, context);
  const second = await appendDeviceCredentialRevealAudit(store.base44, context);
  assert.notEqual(first.auditOperationId, second.auditOperationId);
  assert.equal(store.records.length, 2);
  const handler = await readFile(path.resolve('base44/functions/revealDeviceCredential/entry.ts'), 'utf8');
  assert.match(handler, /appendDeviceCredentialRevealAudit\(base44/);
});

test('I — concurrent compatible replays are serialized by one atomic tenant claim', async () => {
  const store = memoryBase44({ createDelayMs: 50 });
  const [first, second] = await Promise.all([
    appendAuditEvent(store.base44, input()),
    appendAuditEvent(store.base44, input()),
  ]);
  assert.equal(store.metrics.createCalls, 1);
  assert.equal(store.metrics.maxActiveCreates, 1);
  assert.equal(store.records.length, 1);
  assert.equal(first.event.id, second.event.id);
  assert.deepEqual([first.duplicate, second.duplicate].sort(), [false, true]);
});

test('J — concurrent incompatible operation reuse creates once and fails the collision closed', async () => {
  const store = memoryBase44({ createDelayMs: 50 });
  const results = await Promise.allSettled([
    appendAuditEvent(store.base44, input()),
    appendAuditEvent(store.base44, input({ operationSemantics: { action: 'ATTACK' } })),
  ]);
  assert.equal(store.metrics.createCalls, 1);
  assert.equal(store.records.length, 1);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const [rejected] = results.filter(result => result.status === 'rejected');
  assert.equal(rejected.reason?.code, 'AUDIT_OPERATION_ID_COLLISION');
});

test('K — ambiguous atomic claim success is reconciled by the backend token', async () => {
  const store = memoryBase44({ ambiguousClaim: true });
  const result = await appendAuditEvent(store.base44, input());
  assert.equal(result.duplicate, false);
  assert.equal(store.metrics.createCalls, 1);
  assert.equal(store.records.length, 1);
  assert.equal(store.organization.audit_claim_token, undefined);
});

test('L — ambiguous AuditEvent create success reconciles without a second create', async () => {
  const store = memoryBase44({ ambiguousCreate: true });
  const result = await appendAuditEvent(store.base44, input());
  assert.equal(result.duplicate, true);
  assert.equal(result.reconciled, true);
  assert.equal(store.metrics.createCalls, 1);
  assert.equal(store.records.length, 1);
  assert.equal(store.organization.audit_claim_token, undefined);
});

test('M — ambiguous claim release is reconciled without changing the committed result', async () => {
  const store = memoryBase44({ ambiguousRelease: true });
  const result = await appendAuditEvent(store.base44, input());
  assert.equal(result.duplicate, false);
  assert.equal(store.metrics.createCalls, 1);
  assert.equal(store.records.length, 1);
  assert.equal(store.organization.audit_claim_token, undefined);
});

test('N — an orphan claim fails closed without expiry, takeover or AuditEvent creation', async () => {
  const store = memoryBase44({ orphanClaim: true });
  await assert.rejects(
    appendAuditEvent(store.base44, input()),
    error => error?.code === 'AUDIT_CLAIM_RECOVERY_REQUIRED',
  );
  assert.equal(store.metrics.createCalls, 0);
  assert.equal(store.records.length, 0);
  assert.equal(store.organization.audit_claim_token, 'orphan-token');
});

test('O — a successful update count is not ownership without persisted claim verification', async () => {
  const store = memoryBase44({ falsePositiveClaimUpdate: true });
  await assert.rejects(
    appendAuditEvent(store.base44, input()),
    error => error?.code === 'AUDIT_CLAIM_RECOVERY_REQUIRED',
  );
  assert.equal(store.metrics.createCalls, 0);
  assert.equal(store.records.length, 0);
  assert.equal(store.organization.audit_claim_token, undefined);
});

test('P — ownership lost after acquisition fails closed immediately before create', async () => {
  const store = memoryBase44({ loseOwnershipBeforeCreate: true });
  await assert.rejects(
    appendAuditEvent(store.base44, input()),
    error => error?.code === 'AUDIT_CLAIM_RECOVERY_REQUIRED',
  );
  assert.equal(store.metrics.createCalls, 0);
  assert.equal(store.records.length, 0);
  assert.equal(store.organization.audit_claim_token, 'foreign-token');
});

test('Q — uncertain create failure retains the owned claim and prevents an unsafe retry', async () => {
  const store = memoryBase44({ uncertainCreate: true });
  await assert.rejects(
    appendAuditEvent(store.base44, input()),
    /simulated uncertain AuditEvent\.create response/,
  );
  assert.equal(store.metrics.createCalls, 1);
  assert.equal(store.records.length, 0);
  assert.ok(store.organization.audit_claim_token);
  assert.equal(store.organization.audit_claim_operation_id, 'backend-operation-1');
});

test('R — a compatible non-owner replay cannot release the active writer claim', async () => {
  const store = memoryBase44({ holdCreate: true });
  const ownerResult = appendAuditEvent(store.base44, input());
  await store.createStarted;
  const ownerToken = store.organization.audit_claim_token;
  let replay;
  try {
    replay = await appendAuditEvent(store.base44, input());
    assert.equal(replay.duplicate, true);
    assert.equal(store.organization.audit_claim_token, ownerToken);
  } finally {
    store.releaseCreate();
  }
  const owner = await ownerResult;
  assert.equal(owner.duplicate, false);
  assert.equal(store.organization.audit_claim_token, undefined);
});

test('S — multiple compatible existing events fail closed as ambiguous', async () => {
  const canonical = buildAuditEvent(input());
  const store = memoryBase44({
    records: [
      { ...structuredClone(canonical), id: 'audit-existing-1' },
      { ...structuredClone(canonical), id: 'audit-existing-2' },
    ],
  });
  await assert.rejects(
    appendAuditEvent(store.base44, input()),
    error => error?.code === 'AUDIT_OPERATION_ID_AMBIGUOUS',
  );
  assert.equal(store.metrics.createCalls, 0);
  assert.equal(store.records.length, 2);
  assert.equal(store.organization.audit_claim_token, undefined);
});

test('missing backend operation identity fails closed', async () => {
  const store = memoryBase44();
  const missing = input();
  delete missing.auditOperationId;
  await assert.rejects(
    appendAuditEvent(store.base44, missing),
    /AUDIT_EVENT_FIELD_REQUIRED:audit_operation_id/,
  );
  assert.equal(store.records.length, 0);
});
