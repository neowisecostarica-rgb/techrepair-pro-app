import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import vm from 'node:vm';
import {
  getUserDataField,
  isCanonicalSuperAdmin,
  resolveAuthorizedContext,
  resolveIdentitySnapshot,
  sanitizeOrganization,
  sanitizeUserAccount,
} from '../base44/functions/_shared/userAuthorization.ts';
import { appendSuperAdminAudit } from '../base44/functions/_shared/superAdminAudit.ts';

const root = new URL('../', import.meta.url);
const rootPath = decodeURIComponent(root.pathname).replace(/^\/(?:[A-Za-z]:)/u, match => match.slice(1));
let passed = 0;

function pass(name) {
  passed += 1;
  console.log(`PASS ${name}`);
}

function matches(record, query = {}) {
  return Object.entries(query).every(([key, value]) => record[key] === value);
}

function identityClient(accounts) {
  const organizations = [...new Set(accounts.map(account => account.organization_id).filter(Boolean))]
    .map(id => ({ id, status: 'active' }));
  return {
    asServiceRole: {
      entities: {
        UserAccount: {
          filter: async query => accounts.filter(account => matches(account, query)),
        },
        Organization: {
          filter: async query => organizations.filter(organization => matches(organization, query)),
        },
      },
    },
  };
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

assert.equal(isCanonicalSuperAdmin({ role: 'user', is_super_admin: true }), false);
assert.equal(isCanonicalSuperAdmin({ role: 'admin', is_super_admin: false }), true);
pass('built-in admin role is the only sovereign authority');

{
  const accounts = [{
    id: 'account-a', user_id: 'user-1', user_email: 'user@example.com',
    organization_id: 'org-a', role: 'ORG_ADMIN', status: 'active',
  }];
  const client = identityClient(accounts);
  const manipulated = {
    id: 'user-1', email: 'user@example.com', role: 'user',
    organization_id: 'org-a', impersonating_org_id: 'org-b', is_super_admin: true,
  };
  const ownTenant = await resolveAuthorizedContext(client, manipulated, { organizationHint: 'org-a' });
  const otherTenant = await resolveAuthorizedContext(client, manipulated, { organizationHint: 'org-b' });
  const unauthorizedMembershipAdmin = await resolveAuthorizedContext(
    identityClient([{ ...accounts[0], role: 'SALES' }]),
    manipulated,
    { organizationHint: 'org-a', allowedRoles: ['ORG_ADMIN'] },
  );
  assert.equal(ownTenant.ok, true);
  assert.equal(ownTenant.organizationId, 'org-a');
  assert.equal(otherTenant.ok, false);
  assert.equal(otherTenant.status, 403);
  assert.equal(unauthorizedMembershipAdmin.ok, false);
  pass('editable profile flags cannot grant superadmin or cross-tenant authority');
}

{
  const users = [{ id: 'admin-1', email: 'admin@example.com', role: 'admin' }];
  const organizations = [
    { id: 'org-a', name: 'Tenant A', status: 'active', country: 'CR', currency: 'CRC', plan: 'basic' },
    { id: 'org-b', name: 'Tenant B', status: 'active', country: 'CR', currency: 'CRC', plan: 'basic' },
  ];
  const accounts = [{
    id: 'account-normal', user_id: 'normal-1', user_email: 'normal@example.com',
    organization_id: 'org-a', role: 'ORG_ADMIN', status: 'active',
  }];
  const audits = [];
  const entity = collection => ({
    async filter(query) { return collection.filter(record => matches(record, query)).map(record => structuredClone(record)); },
    async list() { return collection.map(record => structuredClone(record)); },
    async create(data) {
      const record = { id: `${collection === audits ? 'audit' : 'record'}-${collection.length + 1}`, ...structuredClone(data) };
      collection.push(record);
      return structuredClone(record);
    },
    async update(id, data) {
      const record = collection.find(candidate => candidate.id === id);
      if (!record) throw new Error(`record ${id} not found`);
      Object.assign(record, structuredClone(data));
      return structuredClone(record);
    },
    async delete(id) {
      const index = collection.findIndex(record => record.id === id);
      if (index >= 0) collection.splice(index, 1);
    },
  });
  const entities = {
    User: entity(users),
    Organization: entity(organizations),
    UserAccount: entity(accounts),
    SuperAdminAudit: entity(audits),
  };
  let sessionUserId = 'normal-1';
  users.push({ id: 'normal-1', email: 'normal@example.com', role: 'user', organization_id: 'org-a' });
  const client = {
    auth: { me: async () => structuredClone(users.find(user => user.id === sessionUserId)) },
    asServiceRole: { entities },
    users: { inviteUser: async () => ({}) },
  };
  const source = await readFile(new URL('../base44/functions/identityGateway/entry.ts', import.meta.url), 'utf8');
  const executable = source
    .replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\s*/gmu, '')
    .replace('Deno.serve(async (req) => {', 'globalThis.__handler = async (req) => {')
    .replace(/\}\);\s*$/u, '};');
  const context = {
    __createClientFromRequest: () => client,
    appendSuperAdminAudit,
    console,
    crypto,
    Date,
    JSON,
    Object,
    Promise,
    Response,
    Set,
    String,
    structuredClone,
    getUserDataField,
    isCanonicalSuperAdmin,
    resolveAuthorizedContext,
    resolveIdentitySnapshot,
    sanitizeOrganization,
    sanitizeUserAccount,
  };
  context.globalThis = context;
  vm.runInNewContext(`const createClientFromRequest = globalThis.__createClientFromRequest;\n${executable}`, context);
  const invoke = async payload => {
    const response = await context.__handler({ method: 'POST', json: async () => payload });
    return { status: response.status, body: await response.json() };
  };

  const denied = await invoke({ action: 'startImpersonation', organization_id: 'org-b' });
  assert.equal(denied.status, 403);
  assert.equal(audits.length, 0);

  sessionUserId = 'admin-1';
  const started = await invoke({ action: 'startImpersonation', organization_id: 'org-b', correlation_id: 'corr-start' });
  assert.equal(started.status, 200);
  assert.equal(users[0].impersonating_org_id, 'org-b');
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'impersonate_start');
  assert.equal(audits[0].super_admin_id, 'admin-1');

  const ended = await invoke({ action: 'endImpersonation', correlation_id: 'corr-end' });
  assert.equal(ended.status, 200);
  assert.equal(users[0].impersonating_org_id, null);
  assert.equal(audits.length, 2);
  assert.equal(audits[1].action, 'impersonate_end');
  pass('impersonation is backend-only, tenant-scoped and append-only audited');
}

{
  const entityDirectory = join(rootPath, 'base44', 'entities');
  const sensitive = ['UserAccount', 'Organization', 'SuperAdminAudit'];
  for (const name of sensitive) {
    const schema = JSON.parse(await readFile(join(entityDirectory, `${name}.jsonc`), 'utf8'));
    assert.deepEqual(schema.rls, { create: false, read: false, update: false, delete: false });
  }
  const userSchema = JSON.parse(await readFile(join(entityDirectory, 'User.jsonc'), 'utf8'));
  for (const field of ['is_super_admin', 'organization_id', 'impersonating_org_id', 'impersonating_started_at']) {
    assert.equal(userSchema.properties[field].rls.write, false);
  }
  assert.deepEqual(userSchema.properties.impersonation_previous_organization_id.rls, { read: false, write: false });

  const schemas = (await readdir(entityDirectory)).filter(name => name.endsWith('.jsonc'));
  for (const filename of schemas) {
    const source = await readFile(join(entityDirectory, filename), 'utf8');
    JSON.parse(source);
    assert.doesNotMatch(source, /\{\{user\.impersonating_org_id\}\}/);
    assert.doesNotMatch(source, /\{\{user\.organization_id\}\}/);
  }
  pass('RLS and User field-level security fail closed at the tenant boundary');
}

{
  const srcFiles = (await walk(join(rootPath, 'src'))).filter(path => ['.js', '.jsx'].includes(extname(path)));
  const forbidden = /base44\.entities\.(?:UserAccount|User|Organization|SuperAdminAudit)|base44\.auth\.updateMe/;
  for (const path of srcFiles) {
    const source = await readFile(path, 'utf8');
    assert.doesNotMatch(source, forbidden, relative(rootPath, path));
  }
  pass('frontend has no direct sensitive identity, tenant or audit access');
}

{
  const functionFiles = (await walk(join(rootPath, 'base44', 'functions'))).filter(path => extname(path) === '.ts');
  const creators = [];
  for (const path of functionFiles) {
    const source = await readFile(path, 'utf8');
    const normalized = relative(rootPath, path).replaceAll('\\', '/');
    if (/SuperAdminAudit\.create/.test(source)) creators.push(relative(rootPath, path).replaceAll('\\', '/'));
    assert.doesNotMatch(source, /SuperAdminAudit\.(?:update|updateMany|delete)/, relative(rootPath, path));
    if (!['base44/functions/_shared/userAuthorization.ts', 'base44/functions/identityGateway/entry.ts'].includes(normalized)) {
      assert.doesNotMatch(
        source,
        /(?:user|runtimeUser|callerUser)\??\.(?:is_super_admin|impersonating_org_id|organization_id)|data\?\.is_super_admin/,
        normalized,
      );
    }
  }
  assert.deepEqual(creators, ['base44/functions/_shared/superAdminAudit.ts']);

  const records = [];
  const client = { asServiceRole: { entities: { SuperAdminAudit: { create: async record => (records.push(record), record) } } } };
  await assert.rejects(() => appendSuperAdminAudit(client, { id: 'user-1', role: 'user' }, { action: 'view_logs' }));
  await appendSuperAdminAudit(client, { id: 'admin-1', email: 'admin@example.com', role: 'admin' }, {
    action: 'view_logs', correlationId: 'corr-audit', metadata: { scope: 'qa' },
  });
  assert.equal(records[0].super_admin_id, 'admin-1');
  assert.equal(records[0].correlation_id, 'corr-audit');
  assert.ok(records[0].recorded_at);
  pass('SuperAdminAudit has one canonical append-only writer with backend-derived actor data');
}

for (const page of ['AdminReset', 'AdminSeedCompuStore', 'MigrationAdmin', 'CrearUsuariosPrueba']) {
  const source = await readFile(join(rootPath, 'src', 'pages', `${page}.jsx`), 'utf8');
  assert.match(source, /MaintenanceDisabled/);
  assert.doesNotMatch(source, /base44|entities\./);
}
pass('browser seed, reset, migration and test-user mutation paths are disabled');

console.log(`\n${passed}/7 identity and tenant security contract checks passed.`);
