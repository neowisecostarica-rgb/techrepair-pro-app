import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const auth = readFileSync('src/components/contexts/AuthContext.jsx','utf8');
const layout = readFileSync('src/Layout.jsx','utf8');
const gateway = readFileSync('base44/functions/identityGateway/entry.ts','utf8');

const beginning = auth.slice(auth.indexOf('  const loadAuthData = async () => {'), auth.indexOf('    try {\n      const context = await getIdentityContext();'));
for (const state of ['setStatus(\'loading\')','setUser(null)','setUserAccount(null)','setAuthorization(null)','setIdentityStatus(null)','setMultiOrgAccounts(null)']) {
  assert.ok(beginning.includes(state), 'previous identity state must clear at transition: '+state);
}
assert.ok(beginning.indexOf("setStatus('loading')") < beginning.indexOf('setAuthorization(null)'));
// SEC-018 supersedes the additional org-status query. AuthContext must expose
// the current identityGateway organization snapshot, and Layout must fail closed.
assert.ok(auth.includes('setAuthorizedOrganizations([])'), 'native identity changes clear previous tenant snapshot');
assert.ok(auth.includes('setAuthorizedOrganizations(Array.isArray(context.organizations) ? context.organizations : [])'));
assert.ok(layout.includes('authorizedOrganizations.find(org => org?.id === effectiveOrgId)'), 'Layout selects only the currently authorized organization');
assert.ok(!layout.includes("queryKey: ['org-status'"), 'no duplicate organization-status fetch gate');
assert.ok(layout.includes("!organization || !['active', 'suspended'].includes(organization.status)"), 'unknown org status fails closed');
assert.ok(layout.includes("organization?.status === 'suspended' && !isImpersonating"), 'suspended organization still blocks tenant');
assert.ok(auth.includes('queryClientInstance.clear()'), 'cache must be invalidated on native identity switch');
assert.ok(auth.includes('window.addEventListener(\'focus\', reconcileNativeSession)'), 'visible switch must be monitored');
assert.ok(gateway.includes("action === 'getOrganization'") && gateway.includes('resolveAuthorizedContext(base44, user'), 'organization lookup must remain server-authorized');
console.log('PASS SEC-016/018: session isolation, canonical tenant snapshot and fail-closed suspension, backend authorization preserved');
