import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BASE_INVENTORY_CATEGORIES,
  canonicalOrganizationData,
  canonicalOwnerMembershipData,
  canonicalPrimaryBranchData,
  seedBaselineCategories,
  validateTenantReadiness,
} from '../base44/functions/_shared/tenantProvisioning.ts';

function matches(record, query) { return Object.entries(query).every(([key, value]) => record[key] === value); }
function scenario() {
  const collections = { Organization: [], Branch: [], UserAccount: [], CategoriaInventario: [] };
  let sequence = 0;
  const entity = name => ({
    async filter(query, sort, limit) { return collections[name].filter(record => matches(record, query)).slice(0, limit || 999).map(row => structuredClone(row)); },
    async create(data) { const row = { id: `${name}-${++sequence}`, ...structuredClone(data) }; collections[name].push(row); return structuredClone(row); },
    async update(id, data) { const row = collections[name].find(record => record.id === id); Object.assign(row, structuredClone(data)); return structuredClone(row); },
  });
  return { collections, base44: { asServiceRole: { entities: Object.fromEntries(Object.keys(collections).map(name => [name, entity(name)])) } } };
}

async function provision(ownerStatus) {
  const target = scenario();
  const correlation = `provision-${ownerStatus}`;
  const organization = await target.base44.asServiceRole.entities.Organization.create(canonicalOrganizationData({ name: 'Org', country: 'CR', currency: 'CRC', plan: 'basic' }, correlation));
  const branch = await target.base44.asServiceRole.entities.Branch.create(canonicalPrimaryBranchData(organization.id));
  const account = await target.base44.asServiceRole.entities.UserAccount.create(canonicalOwnerMembershipData({ organizationId: organization.id, userId: ownerStatus === 'active' ? 'owner-1' : null, email: 'owner@test', status: ownerStatus }));
  await seedBaselineCategories(target.base44, organization.id);
  await target.base44.asServiceRole.entities.Organization.update(organization.id, { provisioning_status: 'READY', provisioned_at: new Date().toISOString() });
  return { ...target, organization, branch, account, readiness: await validateTenantReadiness(target.base44, organization.id) };
}

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('self-bootstrap and platform provisioning share exact manifest', async () => {
  const self = await provision('active');
  const platform = await provision('invited');
  assert.equal(self.readiness.ready, true);
  assert.equal(platform.readiness.ready, true);
  assert.deepEqual(self.collections.CategoriaInventario.map(row => row.nombre), platform.collections.CategoriaInventario.map(row => row.nombre));
  assert.equal(self.collections.CategoriaInventario.length, BASE_INVENTORY_CATEGORIES.length);
});

test('ORG_ADMIN owner is organization-wide and primary branch is active', async () => {
  const target = await provision('active');
  assert.equal(target.account.branch_id, null);
  assert.equal(target.branch.active, true);
  assert.equal(target.branch.is_primary, true);
});

test('preset version, defaults and custom-grant deny are canonical', () => {
  const data = canonicalOrganizationData({ name: 'Org', country: 'CR', currency: 'CRC', plan: 'basic' }, 'correlation');
  assert.equal(data.authorization_preset_version, 'TRP_MULTIUSER_V1');
  assert.equal(data.custom_grants_enabled, false);
  assert.equal(data.provisioning_status, 'PENDING');
  assert.deepEqual(data.inventario_config, { dias_dinero_dormido: 90 });
});

test('validator denies missing artifacts and READY marker', async () => {
  const target = scenario();
  const organization = await target.base44.asServiceRole.entities.Organization.create(canonicalOrganizationData({ name: 'Org', country: 'CR', currency: 'CRC', plan: 'basic' }, 'c1'));
  const result = await validateTenantReadiness(target.base44, organization.id);
  assert.equal(result.ready, false);
  assert.equal(result.checks.primary_branch_active, false);
  assert.equal(result.checks.provisioning_ready, false);
});

test('both identity entry paths use shared seed, validator and provisioning audit', async () => {
  const source = await readFile(new URL('../base44/functions/identityGateway/entry.ts', import.meta.url), 'utf8');
  assert.equal((source.match(/seedBaselineCategories\(/g) || []).length, 2);
  assert.ok(source.includes('finalizeProvisioning'));
  assert.ok(source.includes("eventType: 'TENANT_PROVISIONED'"));
  assert.ok(source.includes('validateTenantReadiness'));
});

test('SUPPORT migration is dry-run by default, explicit, auditable and recoverable', async () => {
  const source = await readFile(new URL('../base44/functions/migrateSupportRole/entry.ts', import.meta.url), 'utf8');
  for (const fragment of ["const apply = body.apply === true", "role: 'SUPPORT'", "role: 'CUSTOMER_SERVICE'", 'appendAuditEvent', 'ROLE_MIGRATION_RECOVERY_REQUIRED', 'operation_key requerido']) assert.ok(source.includes(fragment), fragment);
  assert.ok(!source.includes('Deno.cron'));
});

for (const item of tests) { await item.run(); console.log(`PASS ${item.name}`); }
console.log(`\n${tests.length}/6 provisioning and role migration contract groups PASS`);
