import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { matchesInitialTenant } from '../src/components/onboarding/onboardingEntitlement.js';

const expected = {orgId:'org-a', userId:'owner-a', branchId:'branch-a', country:'CR',currency:'CRC'};
const context = () => ({
 ok:true, user:{id:'owner-a',organization_id:'org-a'},
 userAccount:{user_id:'owner-a',organization_id:'org-a',role:'ORG_ADMIN',status:'active'},
 organizations:[{id:'org-a',status:'active',provisioning_status:'READY',country:'CR',currency:'CRC',plan:'basic'}],
 entitlement:{legacy_plan:'basic',package_id:'core',license_status:'active'}
});
test('valid server-confirmed initial core package',()=>assert.equal(matchesInitialTenant(context(),expected),true));
for(const [label,mutate] of [
 ['other user',c=>c.user.id='owner-b'],
 ['other active org',c=>c.user.organization_id='org-b'],
 ['different account owner',c=>c.userAccount.user_id='owner-b'],
 ['different account org',c=>c.userAccount.organization_id='org-b'],
 ['inactive membership',c=>c.userAccount.status='suspended'],
 ['non-owner role',c=>c.userAccount.role='SALES'],
 ['wrong country',c=>c.organizations[0].country='US'],
 ['wrong currency',c=>c.organizations[0].currency='USD'],
 ['org not ready',c=>c.organizations[0].provisioning_status='PENDING'],
 ['org suspended',c=>c.organizations[0].status='suspended'],
 ['missing entitlement',c=>c.entitlement=null],
 ['wrong effective package',c=>c.entitlement.package_id='advanced'],
 ['wrong legacy plan',c=>c.entitlement.legacy_plan='pro'],
 ['inactive license',c=>c.entitlement.license_status='pending'],
 ['context not confirmed',c=>c.ok=false],
])test('rejects '+label,()=>{const c=context();mutate(c);assert.equal(matchesInitialTenant(c,expected),false)});

test('locale initializer handles storage access failure and respects browser locale',()=>{
 const source=readFileSync(new URL('../src/i18n/index.jsx',import.meta.url),'utf8');
 const fn=source.match(/function initial\(\)\{[^\n]+\}/)[0];
 const ctx={window:{},navigator:{language:'pt-BR'},KEY:'trp.locale',SUPPORTED_LOCALES:['es','en','pt','fr','no'],localStorage:{getItem(){throw new Error('blocked')}}};
 assert.equal(vm.runInNewContext(fn+';initial()',ctx),'pt');
 ctx.navigator.language='xx-XX';assert.equal(vm.runInNewContext(fn+';initial()',ctx),'es');
 ctx.localStorage={getItem:()=> 'fr'};assert.equal(vm.runInNewContext(fn+';initial()',ctx),'fr');
});
test('bootstrap rechecks effective server entitlement before entering wizard',()=>{
 const s=readFileSync(new URL('../src/pages/Onboarding.jsx',import.meta.url),'utf8');
 assert.match(s,/if \(expected && !matchesInitialTenant\(context, expected\)\) throw/);
 assert.match(s,/pendingBootstrap.current = \{ orgId: result.organization.id/);
 assert.match(s,/setEffectiveOrgId\(result\?\.organization\?\.id \|\| null\);\s*await checkUserStatus\(\)/);
 assert.match(s,/expected && primary\[0\].id !== expected.branchId/);
});
