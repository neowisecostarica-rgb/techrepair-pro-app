import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const backend = readFileSync('base44/functions/cancelDraftSale/entry.ts', 'utf8');
const config = JSON.parse(readFileSync('base44/functions/cancelDraftSale/function.jsonc', 'utf8'));
const schema = JSON.parse(readFileSync('base44/entities/Venta.jsonc', 'utf8'));
const screen = readFileSync('src/pages/PuntoVenta.jsx', 'utf8');
test('standalone packaged backend has no relative dependencies', () => {
  assert.equal(config.name, 'cancelDraftSale');
  assert.doesNotMatch(backend, /from\s*['"]\.\.?\//);
  assert.match(backend, /createClientFromRequest/);
  assert.match(backend, /resolveAuthorizedContext/);
  assert.match(backend, /getCanonicalBranchScope/);
});
test('backend uses status CAS scoped to org and branch and never deletes', () => {
  assert.match(backend, /Venta\.updateMany/);
  assert.match(backend, /estado:\s*["']borrador["']/);
  assert.match(backend, /organization_id:\s*orgId/);
  assert.match(backend, /branch_id:\s*sale\.branch_id/);
  assert.match(backend, /estado:\s*["']anulada["']/);
  assert.doesNotMatch(backend, /Venta\.delete/);
});
test('cancel rejects paid or in-flight orders and retained stock commits', () => {
  assert.match(backend, /SALE_CANCEL_STATE_FORBIDDEN/);
  assert.match(backend, /SALE_CANCEL_EFFECTS_PRESENT/);
  assert.match(backend, /inventory_commit_status/);
  assert.match(backend, /post_sale_status/);
  assert.match(backend, /SALE_CANCEL_WRITE_UNCERTAIN/);
});
test('sale stores who cancelled and immutable operation identity', () => {
  for (const field of ['cancel_operation_id','cancelado_at','cancelado_por']) {
    assert.ok(schema.properties[field], 'Missing ' + field);
    assert.equal(schema.properties[field].rls.write, false);
  }
  assert.match(backend, /auditOperationId/);
});
test('POS can cancel only a preloaded draft, with UI state and explicit errors', () => {
  assert.match(screen, /preloadedVenta\?\.estado !== 'borrador'/);
  assert.match(screen, /base44\.functions\.invoke\('cancelDraftSale'/);
  assert.match(screen, /Anular borrador/);
  assert.match(screen, /No se confirmó la anulación/);
});
