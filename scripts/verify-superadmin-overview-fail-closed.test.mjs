import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/pages/Saas.jsx', import.meta.url), 'utf8');
test('platform admin never renders empty overview when canonical identity query fails', () => {
  assert.match(source, /isLoading: adminOverviewLoading/);
  assert.match(source, /isError: adminOverviewFailed/);
  assert.match(source, /refetch: reloadAdminOverview/);
  assert.match(source, /if \(adminOverviewFailed \|\| !adminOverview\)/);
  assert.match(source, /No se pudo consultar la plataforma/);
  assert.match(source, /onClick=\{\(\) => reloadAdminOverview\(\)\}/);
  const errorGuard = source.indexOf('if (adminOverviewFailed || !adminOverview)');
  const consoleRender = source.indexOf('<div id="overview"');
  assert.ok(errorGuard !== -1 && consoleRender > errorGuard);
});
