import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveAuthorizedContext } from '../base44/functions/_shared/userAuthorization.ts';

let passed = 0;

function pass(name) {
  passed += 1;
  console.log(`PASS ${name}`);
}

function makeBase44(accounts) {
  return {
    asServiceRole: {
      entities: {
        UserAccount: {
          filter: async ({ user_id }) => accounts.filter(account => account.user_id === user_id),
        },
      },
    },
  };
}

{
  const authorization = await resolveAuthorizedContext(
    makeBase44([{ id: 'account-a', user_id: 'user-1', organization_id: 'org-a', role: 'SALES', status: 'active' }]),
    { id: 'user-1', organization_id: 'org-a' },
    { allowedRoles: ['SALES'] },
  );
  assert.equal(authorization.ok, true);
  assert.equal(authorization.organizationId, 'org-a');
  pass('canonical active membership resolves the selected tenant');
}

{
  const authorization = await resolveAuthorizedContext(
    makeBase44([{ id: 'account-a', user_id: 'user-1', organization_id: 'org-a', role: 'SALES', status: 'invited', active: true }]),
    { id: 'user-1', organization_id: 'org-a' },
    { allowedRoles: ['SALES'] },
  );
  assert.equal(authorization.ok, false);
  assert.equal(authorization.status, 403);
  pass('legacy active cannot authorize an invited membership');
}

{
  const authorization = await resolveAuthorizedContext(
    makeBase44([
      { id: 'account-a', user_id: 'user-1', organization_id: 'org-a', role: 'SALES', status: 'active' },
      { id: 'account-b', user_id: 'user-1', organization_id: 'org-b', role: 'SALES', status: 'active' },
    ]),
    { id: 'user-1' },
    { allowedRoles: ['SALES'] },
  );
  assert.equal(authorization.ok, false);
  assert.match(authorization.error, /Selecciona/);
  pass('multi-tenant membership requires an explicit valid selection');
}

{
  const authorization = await resolveAuthorizedContext(
    makeBase44([]),
    { id: 'super-1', role: 'admin', impersonating_org_id: 'org-a' },
    { allowedRoles: ['ORG_ADMIN'] },
  );
  assert.equal(authorization.ok, true);
  assert.equal(authorization.role, 'ORG_ADMIN');
  pass('super-admin impersonation resolves tenant-scoped ORG_ADMIN authority');
}

const authContext = await readFile(new URL('../src/components/contexts/AuthContext.jsx', import.meta.url), 'utf8');
const crmPage = await readFile(new URL('../src/pages/CRM.jsx', import.meta.url), 'utf8');
const crmGateway = await readFile(new URL('../base44/functions/crmGateway/entry.ts', import.meta.url), 'utf8');
const customerGateway = await readFile(new URL('../base44/functions/customer360Gateway/entry.ts', import.meta.url), 'utf8');
const customerCommunication = await readFile(new URL('../src/components/ventas/ComunicacionCliente.jsx', import.meta.url), 'utf8');
const onboarding = await readFile(new URL('../src/pages/Onboarding.jsx', import.meta.url), 'utf8');
const identityGateway = await readFile(new URL('../base44/functions/identityGateway/entry.ts', import.meta.url), 'utf8');

assert.doesNotMatch(authContext, /updateMe\s*\(\s*\{[^}]*role\s*:/s);
assert.doesNotMatch(authContext, /synced_app_role|needsRoleSync/);
assert.match(authContext, /role:\s*'ORG_ADMIN',[\s\S]*status:\s*'active'/);
pass('frontend identity sync never self-elevates platform role and impersonation stays active');

assert.doesNotMatch(crmPage, /entities\.(Lead|UserAccount)/);
assert.match(crmPage, /invokeCrm\('list'/);
assert.match(crmGateway, /resolveAuthorizedContext/);
assert.match(crmGateway, /asServiceRole\.entities\.Lead/);
assert.match(crmGateway, /Convierte el lead a cliente/);
pass('CRM reads and mutations use the tenant-aware backend gateway');

assert.match(customerGateway, /organization_id: organizationId, cliente_id: clienteId/g);
assert.match(customerGateway, /asServiceRole\.entities\.MensajeCliente\.create/);
assert.match(customerCommunication, /recordCustomerMessage/);
assert.doesNotMatch(customerCommunication, /entities\.MensajeCliente/);
pass('Customer 360 messaging is tenant-scoped and backend-owned');

assert.match(onboarding, /bootstrapIdentityOrganization/);
assert.doesNotMatch(onboarding, /entities\.(UserAccount|Organization|User)/);
assert.match(identityGateway, /status:\s*'active',[\s\S]*active:\s*true/);
assert.match(identityGateway, /accepted_at:/);
assert.doesNotMatch(onboarding, /find\(a\s*=>\s*a\.active\s*&&/);
pass('onboarding activates invitations with canonical status and tenant context');

console.log(`\n${passed}/8 CRM and Customer 360 stability checks passed.`);
