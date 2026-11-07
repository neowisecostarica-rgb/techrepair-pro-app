// Diagnostic only: a passing test means the non-atomic race was reproduced, NOT resolved.
import assert from 'node:assert/strict';
import test from 'node:test';
import { appendAuditEvent } from '../base44/functions/_shared/auditEvent.ts';

const event = {
  eventType: 'SALE_PAYMENT_COMMITTED', principalClass: 'HUMAN_MEMBER',
  actorUserId: 'user-test', organizationId: 'org-test', branchId: 'branch-test',
  resourceType: 'Venta', resourceId: 'sale-test', commandPolicyId: 'CP-SALE-001',
  correlationId: 'trace-test', auditOperationId: 'sale:sale-test',
  outcome: 'COMMITTED',
};

test('P0-AUD-01 diagnostic: simultaneous absent reads allow duplicate AuditEvent records', async () => {
  const rows = [];
  let reads = 0;
  let releaseReads;
  const bothRead = new Promise(resolve => { releaseReads = resolve; });
  const entity = {
    async filter() {
      const snapshot = rows.map(row => ({ ...row }));
      reads += 1;
      if (reads === 2) releaseReads();
      await bothRead;
      return snapshot;
    },
    async create(data) {
      const row = { ...data, id: 'audit-' + (rows.length + 1) };
      rows.push(row);
      return row;
    },
  };
  const base44 = { asServiceRole: { entities: { AuditEvent: entity } } };
  const results = await Promise.all([appendAuditEvent(base44, event), appendAuditEvent(base44, event)]);
  assert.equal(reads, 2);
  assert.equal(results.length, 2);
  assert.equal(rows.length, 2, 'Current implementation is vulnerable to duplicate audit writes under concurrency');
  assert.equal(rows[0].audit_operation_id, rows[1].audit_operation_id);
});
