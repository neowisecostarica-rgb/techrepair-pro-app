// Offline source-contract test: no SDK, browser, network or persistent records.
import assert from 'node:assert/strict';
import {buildSyntheticQaManifest} from './candidates/qaEnvironmentGate.mjs';
import {resolveAuthorizedContext} from '../base44/functions/_shared/userAuthorization.ts';
import {resolveAuthorizedBranch,authorizeOperationalAction} from '../base44/functions/_shared/operationalAuthorization.ts';
import {projectOperationalReadResult} from '../base44/functions/_shared/dataProjections.ts';

const manifest=buildSyntheticQaManifest();
const organizations=manifest.organizations.map(x=>({id:x.key,name:x.name,status:'active',country:x.country,currency:x.currency}));
const branches=manifest.branches.map(x=>({id:x.key,organization_id:x.organization,active:true,is_primary:x.primary}));
const memberships=manifest.identities.map(x=>({id:'membership-'+x.key,user_id:'user-'+x.key,user_email:x.email,organization_id:x.organization,branch_id:x.branch,role:x.role,status:'active'}));
const mock=(accounts=memberships)=>({asServiceRole:{entities:Object.fromEntries(Object.entries({Organization:organizations,Branch:branches,UserAccount:accounts}).map(([name,rows])=>[name,{filter:async(q,sort,limit)=>structuredClone(rows.filter(row=>Object.entries(q).every(([k,v])=>row[k]===v)).slice(0,limit??100))}]))}});
const db=mock();
let count=0;
function check(label,condition){assert.ok(condition,label);count++;}
for(const fixture of manifest.identities){
 const user={id:'user-'+fixture.key,email:fixture.email,role:fixture.platformRole,data:{organization_id:fixture.organization}};
 const auth=await resolveAuthorizedContext(db,user,{organizationHint:fixture.organization});
 check(fixture.key+' canonical identity and role',auth.ok&&auth.role===fixture.role&&auth.organizationId===fixture.organization);
 check(fixture.key+' foreign tenant denied',!(await resolveAuthorizedContext(db,user,{organizationHint:fixture.organization==='qa-a'?'qa-b':'qa-a'})).ok);
 check(fixture.key+' same email wrong ID denied',!(await resolveAuthorizedContext(db,{...user,id:'unbound-user'},{organizationHint:fixture.organization})).ok);
 const suspended=memberships.map(x=>x.user_id===user.id?{...x,status:'suspended'}:x);
 check(fixture.key+' suspended membership denied',!(await resolveAuthorizedContext(mock(suspended),user,{organizationHint:fixture.organization})).ok);
 for(const branch of branches){
   const allowed=branch.organization_id===fixture.organization&&(fixture.role==='ORG_ADMIN'||fixture.branch===branch.id);
   check(fixture.key+' branch '+branch.id,(await resolveAuthorizedBranch(db,auth,branch.id)).ok===allowed);
 }
 const salesRoles=['ORG_ADMIN','BRANCH_ADMIN','SALES'];
 const inventoryRoles=['ORG_ADMIN','BRANCH_ADMIN','SALES','TECHNICIAN','INVENTORY'];
 check(fixture.key+' quote create policy',authorizeOperationalAction(auth,'Cotizacion','create').ok===salesRoles.includes(fixture.role));
 check(fixture.key+' inventory read policy',authorizeOperationalAction(auth,'Inventario','read').ok===inventoryRoles.includes(fixture.role));
 check(fixture.key+' direct inventory mutation denied',!authorizeOperationalAction(auth,'Inventario','update').ok);
 if(fixture.role==='SALES'||fixture.role==='ORG_ADMIN'){
   const record={id:'synthetic-inv',branch_id:fixture.branch??branches.find(b=>b.organization_id===fixture.organization).id,precio_venta:100,costo_unitario:40,proveedor:'synthetic',cantidad_disponible:3};
   const projection=projectOperationalReadResult('Inventario',record,auth);
   check(fixture.key+' price and stock visible',projection.precio_venta===100&&projection.cantidad_disponible===3);
   check(fixture.key+' cost/supplier segregation',('costo_unitario' in projection) === (fixture.role==='ORG_ADMIN')&&('proveedor' in projection) === (fixture.role==='ORG_ADMIN'));
 }
 console.log('PASS '+fixture.key);
}
console.log(count+'/'+count+' checks PASS across 13 offline identities; not an authenticated runtime QA.');
