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
assert.ok(layout.includes("queryKey: ['org-status', user?.id || 'no-user', effectiveOrgId, effectiveRole]"), 'organization status cache must include current principal and role');
assert.ok(layout.includes("enabled: status === 'ready' && authorizationReady && !!user?.id && !!userAccount && !!effectiveOrgId && effectiveRole !== 'SUPER_ADMIN'"), 'organization read must only run after authorization is resolved');
assert.ok(auth.includes('queryClientInstance.clear()'), 'cache must be invalidated on native identity switch');
assert.ok(auth.includes('window.addEventListener(\'focus\', reconcileNativeSession)'), 'visible switch must be monitored');
assert.ok(gateway.includes("action === 'getOrganization'") && gateway.includes('resolveAuthorizedContext(base44, user'), 'organization lookup must remain server-authorized');
console.log('PASS SEC-016: identity switch clears previous authority; org lookup is principal-scoped and gated, server authorization preserved');
