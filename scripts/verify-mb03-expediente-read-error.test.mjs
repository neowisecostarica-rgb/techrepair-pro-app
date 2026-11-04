import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/pages/ExpedienteOT.jsx', import.meta.url), 'utf8');
test('OT detail separates read errors from missing records and scopes query by organization', () => {
  assert.match(source, /isError: otLoadFailed/);
  assert.match(source, /refetch: retryOTLoad/);
  assert.match(source, /OrdenTrabajo\.filter\(\{ id, organization_id: effectiveOrgId \}\)/);
  assert.match(source, /queryKey: \['expediente-ot', id, effectiveOrgId\]/);
  assert.match(source, /enabled: !!id && !!effectiveOrgId/);
  const errorGuard = source.indexOf('if (otLoadFailed) {');
  const notFoundGuard = source.indexOf('if (!ot) {');
  const tenantGuard = source.indexOf('if (ot.organization_id !== effectiveOrgId)');
  assert.ok(errorGuard > 0 && notFoundGuard > errorGuard && tenantGuard > notFoundGuard);
  assert.match(source, /onClick=\{\(\) => retryOTLoad\(\)\}/);
  assert.match(source, /No se pudo consultar el expediente/);
});
