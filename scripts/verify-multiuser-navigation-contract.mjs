import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { getRoleCapabilities } from '../base44/functions/_shared/roleCapabilities.ts';
import { sanitizeUserAccount } from '../base44/functions/_shared/userAuthorization.ts';
import { MENU_ITEMS } from '../src/config/menuConfig.js';

const tests = [];
const test = (name, run) => tests.push({ name, run });
const visiblePaths = role => {
  const capabilities = getRoleCapabilities(role);
  return MENU_ITEMS
    .filter(item => item.anyCapabilities?.some(capability => capabilities.includes(capability)))
    .map(item => item.path);
};

test('identity projection carries normalized role, capabilities, scope and preset', () => {
  const account = sanitizeUserAccount({
    id: 'ua-1', user_id: 'u-1', user_email: 'user@test', organization_id: 'org-1',
    branch_id: 'branch-1', role: 'SUPPORT', status: 'active',
  });
  assert.equal(account.role, 'CUSTOMER_SERVICE');
  assert.ok(account.capabilities.includes('CUSTOMER_SERVICE_OPERATIONS'));
  assert.equal(account.authorization_scope, 'SINGLE_BRANCH');
  assert.equal(account.authorization_preset_version, 'TRP_MULTIUSER_V1');
});

test('identity gateway publishes one backend-owned authorization projection', async () => {
  const source = await readFile(new URL('../base44/functions/identityGateway/entry.ts', import.meta.url), 'utf8');
  for (const fragment of ['authorizationRole', 'getRoleCapabilities(authorizationRole)', "preset_version: AUTHORIZATION_PRESET_VERSION"]) {
    assert.ok(source.includes(fragment), fragment);
  }
});

test('tenant navigation is capability-based and platform navigation is explicit', () => {
  assert.ok(MENU_ITEMS.every(item => item.anyCapabilities || item.platformRoles));
  assert.ok(MENU_ITEMS.every(item => !Object.hasOwn(item, 'roles')));
  assert.deepEqual(MENU_ITEMS.filter(item => item.platformRoles).map(item => item.path), ['Saas', 'AdminReset']);
});

test('Mi Dia is visible exactly to presets with technical-work eligibility', () => {
  for (const role of ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN']) assert.ok(visiblePaths(role).includes('MiDia'), role);
  for (const role of ['SALES', 'INVENTORY', 'CUSTOMER_SERVICE']) assert.ok(!visiblePaths(role).includes('MiDia'), role);
});

test('customer-service navigation matches its operational capabilities', () => {
  const paths = visiblePaths('CUSTOMER_SERVICE');
  for (const path of ['OrdenesTrabajo', 'Agenda', 'Clientes', 'CRM']) assert.ok(paths.includes(path), path);
  for (const path of ['MiDia', 'Inventario', 'Finanzas', 'Settings']) assert.ok(!paths.includes(path), path);
});

test('authorization resolver outage fails closed with retry-only UX', async () => {
  const [auth, layout, sidebar] = await Promise.all([
    readFile(new URL('../src/components/contexts/AuthContext.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/Layout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/layout/SidebarMenu.jsx', import.meta.url), 'utf8'),
  ]);
  assert.ok(auth.includes('authorizationReady'));
  assert.ok(auth.includes('hasCapability'));
  assert.ok(layout.includes('Ninguna operación fue habilitada'));
  assert.ok(sidebar.includes('if (!Array.isArray(capabilities)) return false'));
});

test('legacy tenant-role assumptions are absent from active frontend code', async () => {
  const root = new URL('../src/', import.meta.url);
  const files = await readdir(root, { recursive: true });
  const sources = await Promise.all(files
    .filter(file => /\.(jsx|js)$/.test(file))
    .map(file => readFile(new URL(file.replaceAll('\\', '/'), root), 'utf8')));
  const combined = sources.join('\n');
  for (const role of ['SUPPORT', 'CFO', 'CEO', 'AUDITOR']) {
    assert.ok(!combined.includes(`'${role}'`) && !combined.includes(`"${role}"`), role);
  }
});

test('frontend guards and menu state that backend commands remain authoritative', async () => {
  const [guard, menu] = await Promise.all([
    readFile(new URL('../src/components/guards/PageGuard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/config/menuConfig.js', import.meta.url), 'utf8'),
  ]);
  assert.ok(guard.includes('autoridad real permanece en cada comando backend'));
  assert.ok(menu.includes('cada comando sigue autorizado en backend'));
});

for (const item of tests) {
  await item.run();
  console.log(`PASS ${item.name}`);
}
console.log(`\n${tests.length}/8 navigation and authorization-context contract groups PASS`);
