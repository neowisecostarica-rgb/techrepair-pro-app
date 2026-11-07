import test from 'node:test';
import assert from 'node:assert/strict';
import { decideDraftSaleCancellation as decide } from './candidates/cancelDraftSalePolicy.mjs';
const sale = { id: 'sale-1', organization_id: 'org-A', branch_id: 'br-1', estado: 'borrador' };
const context = { sale, organizationId: 'org-A', branchId: 'br-1', role: 'SALES', actorId: 'seller-1', operationId: 'attempt-1' };
const check = changes => decide({ ...context, ...changes });
test('draft cancellation is a logical state transition, never deletion', () => {
  const result = check();
  assert.equal(result.ok, true);
  assert.equal(result.nextState, 'anulada');
  assert.equal(result.auditEventType, 'SALE_DRAFT_CANCELLED');
});
test('organization and branch isolation fails closed', () => {
  assert.equal(check({ organizationId: 'org-B' }).code, 'SALE_CANCEL_SCOPE_MISMATCH');
  assert.equal(check({ branchId: 'br-2' }).code, 'SALE_CANCEL_BRANCH_MISMATCH');
  assert.equal(check({ branchId: null }).ok, false);
});
test('unauthorized roles and missing identifiers cannot cancel', () => {
  assert.equal(check({ role: 'TECHNICIAN' }).code, 'SALE_CANCEL_FORBIDDEN');
  assert.equal(check({ actorId: '' }).ok, false);
  assert.equal(check({ operationId: '' }).ok, false);
});
test('paid, processing or inconsistent sales fail closed', () => {
  for (const estado of ['pagada','procesando','inconsistente']) {
    assert.equal(check({ sale: { ...sale, estado } }).code, 'SALE_CANCEL_STATE_FORBIDDEN');
  }
});
test('committed inventory, completed post-sale and failed rollback block cancellation', () => {
  for (const marker of [{ inventory_commit_status: 'COMMITTED' }, { inventory_committed_at: '2026-11-07T00:00:00Z' }, { post_sale_status: 'COMPLETED' }, { rollback_status: 'partial' }]) {
    assert.equal(check({ sale: { ...sale, ...marker } }).ok, false);
  }
});
test('same cancelled operation replays; a different operation conflicts', () => {
  const cancelled = { ...sale, estado: 'anulada', cancel_operation_id: 'attempt-1' };
  assert.equal(check({ sale: cancelled }).idempotent, true);
  assert.equal(check({ sale: cancelled, operationId: 'other-attempt' }).code, 'SALE_ALREADY_CANCELLED');
});
