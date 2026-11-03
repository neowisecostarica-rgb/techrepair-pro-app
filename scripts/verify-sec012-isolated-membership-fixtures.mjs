import assert from 'node:assert/strict';
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
