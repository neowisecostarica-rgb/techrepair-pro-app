import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/Saas.jsx', import.meta.url), 'utf8');
test('secondary administrative reads are not treated as verified zero counts', () => {
  for (const collection of ['branches', 'orders', 'warranties', 'partners']) {
    assert.match(source, new RegExp(collection + 'Verified = Array\\.isArray\\('));
    assert.match(source, new RegExp('retry' + collection.charAt(0).toUpperCase() + collection.slice(1) + 'Query'));
  }
  assert.match(source, /totalHealthIssues = secondaryHealthVerified \?/);
  assert.match(source, /totalHealthIssues === null \? '—' : totalHealthIssues/);
  assert.match(source, /branchesVerified \? allSucursales\.filter/);
  assert.match(source, /tenantReady = branchesVerified &&/);
  assert.match(source, /No se pudo consultar la plataforma/);
  assert.match(source, /Indicadores secundarios sin verificar/);
  assert.match(source, /disabled=\{!partnersVerified\}/);
  assert.match(source, /\(partnersVerified \? partners : \[\]\)\.map/);
});
