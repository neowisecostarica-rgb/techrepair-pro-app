import test from 'node:test';
import assert from 'node:assert/strict';
import { appendAtomicAuditLedger, prepareAtomicAuditRecord, ledgerSqlContract } from './candidates/atomicAuditLedgerCandidate.ts';
const fixture = (organization_id = 'org-A', resource_id = 'ot-A') => ({
  organization_id, audit_operation_id: 'operation-1', event_type: 'WORK_ORDER_COMMITTED',
  principal_class: 'TENANT_USER', actor_user_id: 'u1', resource_type: 'OrdenTrabajo',
  resource_id, command_policy_id: 'CP-OT-001', operation_semantics: { a: 1, b: 2 },
});
const simulatedUniqueDatabase = () => {
  const rows = new Map();
  return { rows, async query(sql, params) {
    const key = params[0] + '/' + params[1];
    if (sql.includes('INSERT INTO')) {
      if (rows.has(key)) return { rows: [] };
      const inserted = { ledger_id: rows.size + 1, immutable_sha256: params[2] };
      rows.set(key, inserted);
      return { rows: [inserted] };
    }
    const existing = rows.get(key);
    return { rows: existing ? [existing] : [] };
  } };
};
test('candidate requires the unique constraint; no check-then-create', () => {
  assert.match(ledgerSqlContract.insert, /ON CONFLICT \(organization_id, audit_operation_id\) DO NOTHING/);
  assert.match(ledgerSqlContract.insert, /RETURNING ledger_id, immutable_sha256/);
});
test('stable identity hash disregards object key order', async () => {
  const a = await prepareAtomicAuditRecord(fixture());
  const b = await prepareAtomicAuditRecord({ ...fixture(), operation_semantics: { b: 2, a: 1 } });
  assert.equal(a.hash, b.hash);
  assert.equal(a.hash.length, 64);
  assert.doesNotMatch(a.payload, /operation_semantics|actor_user_id|password|snapshot/);
});
test('8 simultaneous writes yield one model row, idempotent retries and tenant isolation', async () => {
  const db = simulatedUniqueDatabase();
  const results = await Promise.all(Array.from({ length: 8 }, () => appendAtomicAuditLedger(db, fixture())));
  assert.equal(results.filter(x => !x.duplicate).length, 1);
  assert.equal(db.rows.size, 1);
  assert.equal((await appendAtomicAuditLedger(db, fixture())).duplicate, true);
  await appendAtomicAuditLedger(db, fixture('org-B'));
  assert.equal(db.rows.size, 2);
  await assert.rejects(appendAtomicAuditLedger(db, fixture('org-A', 'ot-conflict')), /AUDIT_OPERATION_ID_COLLISION/);
  assert.equal(db.rows.size, 2);
});
test('failure is closed if unconfigured or if insert is ambiguous', async () => {
  await assert.rejects(appendAtomicAuditLedger(undefined, fixture()), /AUDIT_LEDGER_NOT_CONFIGURED/);
  const unavailable = { async query() { throw new Error('DB_DOWN'); } };
  await assert.rejects(appendAtomicAuditLedger(unavailable, fixture()), /DB_DOWN/);
  const ambiguous = { async query(sql) { return { rows: sql.includes('INSERT') ? [] : [] }; } };
  await assert.rejects(appendAtomicAuditLedger(ambiguous, fixture()), /AUDIT_LEDGER_UNAVAILABLE/);
});
