import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ResolveAuthorizationContext } from '../base44/functions/_shared/userAuthorization.ts';

const orgs = [
  { id:'sec012-org-a', status:'active', controlled_pilot_mode:false },
  { id:'sec012-org-b', status:'active', controlled_pilot_mode:false },
];
const branches = [
  { id:'sec012-branch-a',organization_id:'sec012-org-a',active:true },
  { id:'sec012-branch-b',organization_id:'sec012-org-b',active:true },
];
const memberships = [
  { id:'sec012-membership-a', user_id:'sec012-sales-user',user_email:'sales@sec012.invalid',organization_id:'sec012-org-a',branch_id:'sec012-branch-a',status:'active',role:'SALES' },
  { id:'sec012-membership-invite',user_email:'invite@sec012.invalid',organization_id:'sec012-org-b',branch_id:'sec012-branch-b',status:'invited',role:'SALES' },
  { id:'sec012-membership-service',user_id:'sec012-service-user',user_email:'service@sec012.invalid',organization_id:'sec012-org-a',branch_id:'sec012-branch-a',status:'active',role:'CUSTOMER_SERVICE' },
];
const match = (row,query)=>Object.entries(query).every(([key,value])=>row[key]===value);
const collections={UserAccount:memberships,Organization:orgs,Branch:branches};
const calls=[];
const base44={asServiceRole:{entities:Object.fromEntries(Object.entries(collections).map(([name,rows])=>[name,{filter:async (query,sort,limit)=>{calls.push({name,query,sort,limit});return rows.filter(r=>match(r,query)).slice(0,limit??100);} }]))}};
const identity=(id,email)=>({id,email,role:'user',organization_id:'sec012-org-a'});

const valid = await ResolveAuthorizationContext(base44,identity('sec012-sales-user','sales@sec012.invalid'),{organizationHint:'sec012-org-a',allowedRoles:['SALES']});
assert.equal(valid.ok,true,'verified SALES user must be granted org A');
assert.equal(valid.organizationId,'sec012-org-a');
assert.equal(valid.branchId,'sec012-branch-a');
assert.equal(valid.role,'SALES');
console.log('PASS matching canonical SALES user has access to org A/branch A');

const cross = await ResolveAuthorizationContext(base44,identity('sec012-sales-user','sales@sec012.invalid'),{organizationHint:'sec012-org-b',allowedRoles:['SALES']});
assert.equal(cross.ok,false,'SALES cannot select another organization');
console.log('PASS cross-tenant org B access denied');

const temporary = await ResolveAuthorizationContext(base44,identity('sec012-temporary-user','sales@sec012.invalid'),{organizationHint:'sec012-org-a',allowedRoles:['SALES']});
assert.equal(temporary.ok,false,'email match alone must not authorize temp user');
console.log('PASS test user with same email but different ID is denied');

const invited=await ResolveAuthorizationContext(base44,identity('sec012-invited-user','invite@sec012.invalid'),{organizationHint:'sec012-org-b',allowedRoles:['SALES']});
assert.equal(invited.ok,false,'invitation is not active membership');
console.log('PASS invited user cannot access CRM as active SALES');

const service=await ResolveAuthorizationContext(base44,identity('sec012-service-user','service@sec012.invalid'),{organizationHint:'sec012-org-a',allowedRoles:['SALES']});
assert.equal(service.ok,false,'CUSTOMER_SERVICE cannot elevate to SALES');
console.log('PASS customer-service role denied SALES operations');

assert.ok(calls.some(x=>x.name==='UserAccount'&&x.query.user_id==='sec012-sales-user'));
assert.ok(calls.every(x=>x.sort==='-created_date'));
console.log('PASS all database lookups use explicit SDK sort');

console.log('SEC-012: 6/6 simulated fixture authorization checks PASS; NO real user or tenant record was created');

const roleFiles = [];
function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (entry.name === 'roleCapabilities.ts') roleFiles.push(path);
  }
}
scan('base44/functions');
assert.ok(roleFiles.length >= 26);
for (const path of roleFiles) {
  const source = readFileSync(path, 'utf8');
  const role = source.split('CUSTOMER_SERVICE: [', 2)[1]?.split('],', 1)[0];
  assert.ok(role, path + ': missing CUSTOMER_SERVICE preset');
  assert.ok(!role.includes("'CRM_OPERATIONS'"), path + ': CUSTOMER_SERVICE must not have CRM_OPERATIONS');
  const sales = source.split('SALES: [', 2)[1]?.split('],', 1)[0];
  assert.ok(sales?.includes("'CRM_OPERATIONS'"), path + ': SALES must retain CRM_OPERATIONS');
}
const crm = readFileSync('base44/functions/crmGateway/entry.ts', 'utf8');
const page = readFileSync('src/pages/CRM.jsx', 'utf8');
assert.ok(crm.includes("const ALLOWED_ROLES = ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES']"));
assert.ok(page.includes("allowedRoles={['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES']}"));
console.log(`PASS CRM roles aligned across ${roleFiles.length} policy copies, backend gateway and page guard`);
