import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  BranchLifecycleError,
  executeBranchLifecycle,
  fingerprintBranchLifecycleRequest,
  normalizeBranchLifecycleRequest,
} from '../base44/functions/_shared/branchLifecycle.ts';
import {
  assertActiveBranch,
  normalizeBranchName,
} from '../base44/functions/_shared/branchProtection.ts';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const clone = value => structuredClone(value);

function matches(record, query = {}) {
  return Object.entries(query).every(([field, expected]) => {
    if (field === '$or') return expected.some(candidate => matches(record, candidate));
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$exists' in expected) return Object.hasOwn(record, field) === expected.$exists;
      if ('$in' in expected) return expected.$in.includes(record[field]);
      if ('$nin' in expected) return !expected.$nin.includes(record[field]);
      if ('$ne' in expected) return record[field] !== expected.$ne;
      if ('$lt' in expected) return record[field] < expected.$lt;
    }
    if (expected === null) return record[field] == null;
    return record[field] === expected;
  });
}

function serialLock() {
  let held = false;
  const waiting = [];
  let sequence = 0;
  const startNext = () => {
    if (held || waiting.length === 0) return;
    held = true;
    waiting.shift()({ id: `lease-${++sequence}` });
  };
  return {
    acquireLock: () => new Promise(resolve => { waiting.push(resolve); startNext(); }),
    releaseLock: async () => { held = false; startNext(); },
  };
}

function scenario(options = {}) {
  const organizationId = options.organizationId || 'org-a';
  const collections = {
    Organization: [{ id: organizationId, name: 'Org A', status: options.organizationStatus || 'active', created_date: '2026-01-01T00:00:00.000Z' }],
    Branch: options.branches || [
      { id: 'branch-a', organization_id: organizationId, name: 'Central', normalized_name: 'central', active: true, created_date: '2026-01-01T00:00:00.000Z' },
      { id: 'branch-b', organization_id: organizationId, name: 'Oeste', normalized_name: 'oeste', active: true, created_date: '2026-01-02T00:00:00.000Z' },
    ],
    BranchLifecycleOperation: options.operations || [],
    UserAccount: options.users || [],
    OrdenTrabajo: options.workOrders || [],
    InventarioReserva: options.reservations || [],
    Venta: options.sales || [],
    Cotizacion: options.quotes || [],
    ActividadTecnica: options.activities || [],
  };
  let sequence = 0;
  const counters = {};
  const failures = (options.failures || []).map(item => ({ times: 1, phase: 'before', ...item }));
  const shouldFail = (name, method, phase) => {
    const failure = failures.find(item => item.name === name && item.method === method && item.phase === phase && item.times > 0);
    if (!failure) return false;
    failure.times -= 1;
    return true;
  };
  const entity = name => ({
    async filter(query = {}, sort = '-created_date', limit = 100) {
      const records = (collections[name] || []).filter(record => matches(record, query));
      if (sort === '-created_date') records.sort((a, b) => String(b.created_date || '').localeCompare(String(a.created_date || '')));
      return clone(records.slice(0, typeof limit === 'number' ? limit : 100));
    },
    async create(data) {
      if (shouldFail(name, 'create', 'before')) throw new Error(`simulated ${name}.create before`);
      const record = { id: `${name.toLowerCase()}-${++sequence}`, created_date: `2026-02-01T00:00:${String(sequence).padStart(2, '0')}.000Z`, ...clone(data) };
      collections[name].push(record);
      counters[`${name}.create`] = (counters[`${name}.create`] || 0) + 1;
      if (shouldFail(name, 'create', 'after')) throw new Error(`simulated ${name}.create after`);
      return clone(record);
    },
    async update(id, data) {
      const record = collections[name].find(item => item.id === id);
      if (!record) throw new Error(`${name} not found`);
      Object.assign(record, clone(data));
      counters[`${name}.update`] = (counters[`${name}.update`] || 0) + 1;
      if (shouldFail(name, 'update', 'after')) throw new Error(`simulated ${name}.update after`);
      return clone(record);
    },
    async updateMany(query, mutation) {
      const targets = collections[name].filter(record => matches(record, query));
      for (const target of targets) Object.assign(target, clone(mutation.$set || mutation));
      counters[`${name}.updateMany`] = (counters[`${name}.updateMany`] || 0) + 1;
      if (shouldFail(name, 'updateMany', 'after')) throw new Error(`simulated ${name}.updateMany after`);
      return { updated: targets.length };
    },
  });
  const entities = Object.fromEntries(Object.keys(collections).map(name => [name, entity(name)]));
  const lock = serialLock();
  return {
    base44: { asServiceRole: { entities } },
    collections,
    counters,
    context: { organizationId, role: options.role || 'ORG_ADMIN', actor: { id: 'admin-1', email: 'admin@example.com' } },
    exec(input, overrides = {}) {
      return executeBranchLifecycle(this.base44, this.context, input, {
        ...lock,
        now: () => '2026-02-02T00:00:00.000Z',
        ...overrides,
      });
    },
  };
}

const deactivate = (branchId = 'branch-a', key = 'branch_deactivate_0001') => ({ action: 'DEACTIVATE', branch_id: branchId, reason: 'Cierre operativo', operation_key: key });
const reactivate = (branchId = 'branch-a', key = 'branch_reactivate_0001') => ({ action: 'REACTIVATE', branch_id: branchId, operation_key: key });
const createBranch = (key = 'branch_create_000001', name = 'Escazu') => ({ action: 'CREATE', name, address: 'Centro', phone: '2222', operation_key: key });

test('1 last Branch cannot be deactivated', async () => {
  const s = scenario({ branches: [{ id: 'branch-a', organization_id: 'org-a', name: 'Central', active: true }] });
  await assert.rejects(() => s.exec(deactivate()), { code: 'LAST_ACTIVE_BRANCH' });
});

test('2 last ACTIVE Branch is protected even when inactive records exist', async () => {
  const s = scenario({ branches: [
    { id: 'branch-a', organization_id: 'org-a', name: 'Central', active: true },
    { id: 'branch-b', organization_id: 'org-a', name: 'Oeste', active: false },
  ] });
  await assert.rejects(() => s.exec(deactivate()), { code: 'LAST_ACTIVE_BRANCH' });
});

test('3 safe deactivation succeeds when another active Branch exists', async () => {
  const s = scenario();
  const result = await s.exec(deactivate());
  assert.equal(result.branch.active, false);
  assert.equal(s.collections.Branch.filter(item => item.active).length, 1);
});

test('4 deactivation actor, timestamp and reason are backend-owned', async () => {
  const s = scenario();
  const result = await s.exec(deactivate());
  assert.equal(result.branch.deactivated_by, 'admin-1');
  assert.equal(result.branch.deactivated_at, '2026-02-02T00:00:00.000Z');
  assert.equal(result.branch.deactivation_reason, 'Cierre operativo');
});

test('5 active assigned user blocks deactivation', async () => {
  const s = scenario({ users: [{ id: 'u1', organization_id: 'org-a', branch_id: 'branch-a', role: 'SALES', status: 'active' }] });
  await assert.rejects(() => s.exec(deactivate()), { code: 'BRANCH_DEACTIVATION_BLOCKED' });
});

test('6 invited assigned user blocks deactivation', async () => {
  const s = scenario({ users: [{ id: 'u1', organization_id: 'org-a', branch_id: 'branch-a', role: 'SALES', status: 'invited' }] });
  await assert.rejects(() => s.exec(deactivate()), { code: 'BRANCH_DEACTIVATION_BLOCKED' });
});

test('7 suspended user does not block deactivation', async () => {
  const s = scenario({ users: [{ id: 'u1', organization_id: 'org-a', branch_id: 'branch-a', role: 'SALES', status: 'suspended' }] });
  assert.equal((await s.exec(deactivate())).success, true);
});

test('8 non-terminal work order blocks deactivation', async () => {
  const s = scenario({ workOrders: [{ id: 'ot1', organization_id: 'org-a', branch_id: 'branch-a', estado: 'FINALIZADA' }] });
  await assert.rejects(() => s.exec(deactivate()), { code: 'BRANCH_DEACTIVATION_BLOCKED' });
});

test('9 terminal work order history is preserved and does not block', async () => {
  const s = scenario({ workOrders: [{ id: 'ot1', organization_id: 'org-a', branch_id: 'branch-a', estado: 'ENTREGADA' }] });
  await s.exec(deactivate());
  assert.equal(s.collections.OrdenTrabajo.length, 1);
});

test('10 active technical activity blocks even with terminal parent', async () => {
  const s = scenario({
    workOrders: [{ id: 'ot1', organization_id: 'org-a', branch_id: 'branch-a', estado: 'ENTREGADA' }],
    activities: [{ id: 'act1', organization_id: 'org-a', orden_trabajo_id: 'ot1', estado: 'en_progreso' }],
  });
  await assert.rejects(() => s.exec(deactivate()), { code: 'BRANCH_DEACTIVATION_BLOCKED' });
});

test('11 active inventory reservation blocks', async () => {
  const s = scenario({ reservations: [{ id: 'r1', organization_id: 'org-a', branch_id: 'branch-a', state: 'RESERVED' }] });
  await assert.rejects(() => s.exec(deactivate()), { code: 'BRANCH_DEACTIVATION_BLOCKED' });
});

test('12 processing sale blocks', async () => {
  const s = scenario({ sales: [{ id: 'v1', organization_id: 'org-a', branch_id: 'branch-a', estado: 'procesando' }] });
  await assert.rejects(() => s.exec(deactivate()), { code: 'BRANCH_DEACTIVATION_BLOCKED' });
});

test('13 pending inventory sale commit blocks', async () => {
  const s = scenario({ sales: [{ id: 'v1', organization_id: 'org-a', branch_id: 'branch-a', estado: 'pagada', inventory_commit_status: 'PENDING' }] });
  await assert.rejects(() => s.exec(deactivate()), { code: 'BRANCH_DEACTIVATION_BLOCKED' });
});

test('14 pending post-sale operation blocks', async () => {
  const s = scenario({ sales: [{ id: 'v1', organization_id: 'org-a', branch_id: 'branch-a', estado: 'pagada', post_sale_status: 'PENDING' }] });
  await assert.rejects(() => s.exec(deactivate()), { code: 'BRANCH_DEACTIVATION_BLOCKED' });
});

test('15 pending delivery blocks', async () => {
  const s = scenario({ workOrders: [{ id: 'ot1', organization_id: 'org-a', branch_id: 'branch-a', estado: 'ENTREGADA', delivery_status: 'PENDING' }] });
  await assert.rejects(() => s.exec(deactivate()), { code: 'BRANCH_DEACTIVATION_BLOCKED' });
});

test('16 pending work-order lifecycle lock blocks', async () => {
  const s = scenario({ workOrders: [{ id: 'ot1', organization_id: 'org-a', branch_id: 'branch-a', estado: 'ENTREGADA', lifecycle_lock_token: 'lock' }] });
  await assert.rejects(() => s.exec(deactivate()), { code: 'BRANCH_DEACTIVATION_BLOCKED' });
});

test('17 pending quote lifecycle blocks', async () => {
  const s = scenario({ quotes: [{ id: 'q1', organization_id: 'org-a', branch_id: 'branch-a', decision_status: 'PENDING' }] });
  await assert.rejects(() => s.exec(deactivate()), { code: 'BRANCH_DEACTIVATION_BLOCKED' });
});

test('18 fresh direct-sale lock blocks', async () => {
  const now = new Date().toISOString();
  const s = scenario({ branches: [
    { id: 'branch-a', organization_id: 'org-a', name: 'Central', active: true, sale_lock_token: 'x', sale_lock_at: now },
    { id: 'branch-b', organization_id: 'org-a', name: 'Oeste', active: true },
  ] });
  await assert.rejects(() => s.exec(deactivate()), { code: 'BRANCH_DEACTIVATION_BLOCKED' });
});

test('19 stale sale lock is audit debt but not an active blocker', async () => {
  const s = scenario({ branches: [
    { id: 'branch-a', organization_id: 'org-a', name: 'Central', active: true, sale_lock_token: 'x', sale_lock_at: '2020-01-01T00:00:00Z' },
    { id: 'branch-b', organization_id: 'org-a', name: 'Oeste', active: true },
  ] });
  assert.equal((await s.exec(deactivate())).success, true);
});

test('20 reactivation preserves Branch identity', async () => {
  const s = scenario({ branches: [
    { id: 'branch-a', organization_id: 'org-a', name: 'Central', active: false },
    { id: 'branch-b', organization_id: 'org-a', name: 'Oeste', active: true },
  ] });
  const result = await s.exec(reactivate());
  assert.equal(result.branch.id, 'branch-a');
  assert.equal(result.branch.active, true);
});

test('21 repeated REACTIVATE with a new key is idempotent', async () => {
  const s = scenario();
  const result = await s.exec(reactivate());
  assert.equal(result.idempotent, true);
  assert.equal(s.counters['Branch.updateMany'] || 0, 0);
});

test('22 repeated DEACTIVATE does not rewrite audit timestamps', async () => {
  const s = scenario();
  const first = await s.exec(deactivate());
  const second = await s.exec(deactivate('branch-a', 'branch_deactivate_0002'));
  assert.equal(second.idempotent, true);
  assert.equal(second.branch.deactivated_at, first.branch.deactivated_at);
});

test('23 same key and payload replays deterministic snapshot', async () => {
  const s = scenario();
  const first = await s.exec(deactivate());
  const replay = await s.exec(deactivate());
  assert.deepEqual(replay.branch, first.branch);
  assert.equal(replay.recovered, true);
});

test('24 same key with different payload conflicts', async () => {
  const s = scenario();
  await s.exec(deactivate());
  await assert.rejects(() => s.exec({ ...deactivate(), reason: 'Otro motivo' }), { code: 'BRANCH_FINGERPRINT_CONFLICT' });
});

test('25 CREATE produces an active canonical tenant Branch', async () => {
  const s = scenario();
  const result = await s.exec(createBranch());
  assert.equal(result.branch.active, true);
  assert.equal(result.branch.organization_id, 'org-a');
});

test('26 CREATE active:false is rejected', async () => {
  const s = scenario();
  await assert.rejects(() => s.exec({ ...createBranch(), active: false }), { code: 'BRANCH_CREATE_INACTIVE_FORBIDDEN' });
});

test('27 CREATE replay creates exactly one Branch', async () => {
  const s = scenario();
  const first = await s.exec(createBranch());
  const replay = await s.exec(createBranch());
  assert.equal(replay.branch.id, first.branch.id);
  assert.equal(s.collections.Branch.filter(item => item.name === 'Escazu').length, 1);
});

test('28 normalized duplicate name strips case and diacritics', async () => {
  const s = scenario({ branches: [{ id: 'branch-a', organization_id: 'org-a', name: 'Sucursal Escazú', active: true }] });
  await assert.rejects(() => s.exec(createBranch('branch_create_000002', 'SUCURSAL ESCAZU')), { code: 'BRANCH_NAME_CONFLICT' });
});

test('29 UPDATE_DETAILS changes only legitimate fields', async () => {
  const s = scenario();
  const result = await s.exec({ action: 'UPDATE_DETAILS', branch_id: 'branch-a', name: 'Centro', address: 'Nueva', phone: '9999', operation_key: 'branch_update_000001' });
  assert.equal(result.branch.name, 'Centro');
  assert.equal(result.branch.address, 'Nueva');
  assert.equal(result.branch.active, true);
});

test('30 UPDATE_DETAILS cannot change active', async () => {
  const s = scenario();
  await assert.rejects(() => s.exec({ action: 'UPDATE_DETAILS', branch_id: 'branch-a', name: 'Centro', active: false, operation_key: 'branch_update_000002' }), { code: 'BRANCH_ACTIVE_CHANGE_FORBIDDEN' });
});

test('31 cross-organization Branch is not exposed', async () => {
  const s = scenario({ branches: [{ id: 'branch-x', organization_id: 'org-b', name: 'Other', active: true }] });
  await assert.rejects(() => s.exec(reactivate('branch-x')), { code: 'BRANCH_NOT_FOUND' });
});

test('32 non-ORG_ADMIN role is denied', async () => {
  const s = scenario({ role: 'BRANCH_ADMIN' });
  await assert.rejects(() => s.exec(deactivate()), { code: 'BRANCH_LIFECYCLE_FORBIDDEN' });
});

test('33 DELETE is always forbidden before lock or writes', async () => {
  const s = scenario();
  await assert.rejects(() => s.exec({ action: 'DELETE', branch_id: 'branch-a', operation_key: 'branch_delete_000001' }), { code: 'BRANCH_HARD_DELETE_FORBIDDEN' });
  assert.equal(s.collections.Branch.length, 2);
});

test('34 concurrent deactivation preserves at least one ACTIVE Branch', async () => {
  const s = scenario();
  const settled = await Promise.allSettled([
    s.exec(deactivate('branch-a', 'branch_deactivate_A001')),
    s.exec(deactivate('branch-b', 'branch_deactivate_B001')),
  ]);
  assert.equal(settled.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(s.collections.Branch.filter(item => item.active).length, 1);
});

test('35 organization lock is released after a blocker', async () => {
  const s = scenario({ users: [{ id: 'u1', organization_id: 'org-a', branch_id: 'branch-a', role: 'SALES', status: 'active' }] });
  await assert.rejects(() => s.exec(deactivate()));
  s.collections.UserAccount.length = 0;
  assert.equal((await s.exec(deactivate('branch-a', 'branch_deactivate_0003'))).success, true);
});

test('36 unrelated PENDING lifecycle operation fails closed', async () => {
  const s = scenario({ operations: [{ id: 'op1', organization_id: 'org-a', operation_key: 'pending_other_0001', request_fingerprint: 'x', action: 'CREATE', status: 'PENDING' }] });
  await assert.rejects(() => s.exec(createBranch()), { code: 'BRANCH_LIFECYCLE_RECOVERY_REQUIRED' });
});

test('37 exact duplicate Branch name is blocked', async () => {
  const s = scenario();
  await assert.rejects(() => s.exec(createBranch('branch_create_000003', 'Central')), { code: 'BRANCH_NAME_CONFLICT' });
});

test('38 assertActiveBranch returns the canonical active record', async () => {
  const s = scenario();
  assert.equal((await assertActiveBranch(s.base44, 'org-a', 'branch-a')).id, 'branch-a');
});

test('39 assertActiveBranch rejects inactive records', async () => {
  const s = scenario({ branches: [{ id: 'branch-a', organization_id: 'org-a', name: 'Central', active: false }] });
  await assert.rejects(() => assertActiveBranch(s.base44, 'org-a', 'branch-a'), { code: 'BRANCH_INACTIVE' });
});

test('40 generic CRUD source blocks Branch hard delete and mutations', async () => {
  const [gateway, policy] = await Promise.all([
    readFile(new URL('../base44/functions/operationalGateway/entry.ts', import.meta.url), 'utf8'),
    readFile(new URL('../base44/functions/_shared/operationalAuthorization.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(gateway, /BRANCH_HARD_DELETE_FORBIDDEN/);
  assert.match(gateway, /BRANCH_LIFECYCLE_COMMAND_REQUIRED/);
  assert.match(policy, /Branch:\s*\{\s*read:[^}]+create:\s*\[\],\s*update:\s*\[\],\s*delete:\s*\[\]/);
});

test('41 user assignment source validates a canonical active Branch', async () => {
  const source = await readFile(new URL('../base44/functions/manageOrgUser/entry.ts', import.meta.url), 'utf8');
  assert.match(source, /validateBranchAssignment/);
  assert.match(source, /assertActiveBranch/);
  assert.match(source, /USER_BRANCH_INVALID/);
});

test('42 guards and auditor cover protected domains without legacy writes', async () => {
  const paths = [
    '../base44/functions/createSale/entry.ts',
    '../base44/functions/_shared/deliveryAtomicity.ts',
    '../base44/functions/_shared/inventoryMutationService.ts',
    '../base44/functions/initTechnicalActivity/entry.ts',
    '../base44/functions/crmGateway/entry.ts',
    '../base44/functions/customer360Gateway/entry.ts',
  ];
  for (const path of paths) assert.match(await readFile(new URL(path, import.meta.url), 'utf8'), /assertActiveBranch/);
  const audit = await readFile(new URL('../base44/functions/auditBranchLegacyData/entry.ts', import.meta.url), 'utf8');
  assert.match(audit, /gate:/);
  assert.match(audit, /truncated/);
  assert.doesNotMatch(audit, /entities\.[A-Za-z0-9_]+\.(create|update|delete)\(/);
  const lifecycle = await readFile(new URL('../base44/functions/_shared/branchLifecycle.ts', import.meta.url), 'utf8');
  const resourceLock = await readFile(new URL('../base44/functions/resourceLockLite/entry.ts', import.meta.url), 'utf8');
  assert.match(lifecycle, /organization_id: organizationId/);
  assert.match(resourceLock, /resolveOrganization\(base44, user, body\.organization_id \|\| null\)/);
});

test('43 normalization and fingerprint are deterministic', async () => {
  assert.equal(normalizeBranchName(' Sucursal   Escazú '), 'sucursal escazu');
  const input = createBranch();
  assert.equal(await fingerprintBranchLifecycleRequest(input), await fingerprintBranchLifecycleRequest({ ...input }));
  assert.equal(normalizeBranchLifecycleRequest(input).action, 'CREATE');
  assert.ok(BranchLifecycleError);
});
