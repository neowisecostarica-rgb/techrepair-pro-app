import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { queryClientInstance } from '../src/lib/query-client.js';
import {
  resolveIdentitySnapshot,
  resolveAuthorizedContext,
} from '../base44/functions/operationalGateway/_shared/userAuthorization.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
let checks = 0;
function pass(title) { checks += 1; console.log(`PASS ${title}`); }

const user = { id: 'user-1', email: 'owner@qa.invalid', role: 'user', data: { organization_id: 'org-1' } };
const account = { id: 'account-1', user_id: 'user-1', user_email: 'owner@qa.invalid', organization_id: 'org-1', role: 'ORG_ADMIN', status: 'active' };
const organization = { id: 'org-1', status: 'active', name: 'QA synthetic' };
const calls = { accounts: 0, organizations: 0 };
const base44 = { asServiceRole: { entities: {
  UserAccount: { filter: async (query) => {
    calls.accounts += 1;
    return query.user_id === user.id || query.user_email === user.email ? [account] : [];
  }},
  Organization: { filter: async (query) => {
    calls.organizations += 1;
    return query.id === organization.id && query.status === 'active' ? [organization] : [];
  }},
  Branch: { filter: async () => [] },
}}};

const snapshot = await resolveIdentitySnapshot(base44, user);
assert.equal(snapshot.ok, true);
assert.equal(calls.accounts, 2);
const authorized = await resolveAuthorizedContext(base44, user, {
  organizationHint: 'org-1',
  identitySnapshot: snapshot,
});
assert.equal(authorized.ok, true);
assert.equal(authorized.role, 'ORG_ADMIN');
assert.equal(authorized.organizationId, 'org-1');
assert.equal(calls.accounts, 2, 'El gateway no debe volver a consultar las mismas membresías');
pass('dos consultas de membresía por solicitud, sin verificación duplicada');

const forbidden = await resolveAuthorizedContext(base44, user, {
  organizationHint: 'org-foreign',
  identitySnapshot: snapshot,
});
assert.equal(forbidden.ok, false);
assert.equal(forbidden.status, 403);
pass('el snapshot no permite acceso a otra empresa');

const unknownUser = { ...user, id: 'user-foreign' };
const beforeDifferentUser = calls.accounts;
const crossUser = await resolveAuthorizedContext(base44, unknownUser, {
  organizationHint: 'org-1',
  identitySnapshot: snapshot,
});
assert.equal(crossUser.ok, false);
assert.equal(crossUser.status, 403);
assert.equal(calls.accounts, beforeDifferentUser + 2, 'Otra identidad debe releer autoridad desde el SDK');
pass('un snapshot de otro usuario se rechaza y revalida');

const files = [
  'base44/functions/operationalGateway/entry.ts',
  'base44/functions/identityGateway/entry.ts',
  'base44/functions/listWorkOrders/entry.ts',
];
for (const file of files) {
  const source = read(file);
  transformSync(source, { loader: 'ts', target: 'es2022' }); // Parseo real de TypeScript.
  assert.match(source, /Rate limit exceeded:\\s\*entity_list|Rate limit exceeded:\\s\*entity_list\\b/);
  assert.match(source, /status:\s*429/);
  assert.match(source, /'Retry-After'|"Retry-After"/);
  assert.match(source, /ENTITY_LIST_RATE_LIMITED/);
  pass(`${file} conserva contrato 429 + Retry-After`);
}
assert.doesNotMatch(read('base44/functions/listWorkOrders/entry.ts'), /error:\s*error\.message/);
pass('la lista OT no expone mensajes internos al cliente');
const retry = queryClientInstance.getDefaultOptions().queries.retry;
assert.equal(retry(0, { response: { status: 429 } }), false);
assert.equal(retry(0, { response: { status: 500 } }), true);
assert.equal(retry(1, { response: { status: 500 } }), false);
pass('React Query no reintenta la cuota 429 ni duplica un segundo intento');
console.log(`\n${checks}/${checks} controles backend rate-limit/aislamiento PASS`);
