import assert from 'node:assert/strict';
import { resolveAuthorizedContext } from '../base44/functions/_shared/userAuthorization.ts';
import { authorizeOperationalAction, authorizeRecordBranch, getCanonicalBranchScope } from '../base44/functions/_shared/operationalAuthorization.ts';
import { projectOperationalReadResult } from '../base44/functions/_shared/dataProjections.ts';
import { dispatchExternalEmail } from '../base44/functions/_shared/externalEffectsPolicy.ts';
const roles = ['ORG_ADMIN','BRANCH_ADMIN','SALES','TECHNICIAN','INVENTORY','CUSTOMER_SERVICE'];
const orgs = ['qa-a','qa-b'].map(id=>({id,status:'active'}));
const branches = ['a1','a2','b1'].map(id=>({id,organization_id:id.startsWith('a')?'qa-a':'qa-b',active:true}));
const accounts = roles.map(role=>({id:'acc-'+role,user_id:'user-'+role,user_email:role.toLowerCase()+'@qa.invalid',organization_id:'qa-a',branch_id:role==='ORG_ADMIN'?null:'a1',role,status:'active'}));
const db = {Organization:orgs,Branch:branches,UserAccount:accounts};
const base44={asServiceRole:{entities:Object.fromEntries(Object.entries(db).map(([name,rows])=>[name,{filter:async(q,sort,limit)=>structuredClone(rows.filter(row=>Object.entries(q).every(([k,v])=>row[k]===v)).slice(0,limit??100))}]))}};
let count=0;
const check=(name,condition)=>{assert.ok(condition,name);count++;console.log('PASS '+name)};
const contexts={};
for(const role of roles){
 const user={id:'user-'+role,email:role.toLowerCase()+'@qa.invalid',role:'user',data:{organization_id:'qa-a'}};
 const auth=await resolveAuthorizedContext(base44,user,{organizationHint:'qa-a'});
 contexts[role]=auth;
 check(role+' canonical membership',auth.ok && auth.role===role && auth.organizationId==='qa-a');
 const foreign=await resolveAuthorizedContext(base44,user,{organizationHint:'qa-b'});
 check(role+' cross-tenant rejected',!foreign.ok && foreign.status===403);
 check(role+' branch scope',authorizeRecordBranch(auth,'a1').ok && authorizeRecordBranch(auth,'a2').ok===(role==='ORG_ADMIN'));
}
check('SALES inventory read',authorizeOperationalAction(contexts.SALES,'Inventario','read').ok);
check('SALES inventory direct mutation denied',!authorizeOperationalAction(contexts.SALES,'Inventario','update').ok);
check('TECHNICIAN sale mutation denied',!authorizeOperationalAction(contexts.TECHNICIAN,'Venta','create').ok);
check('SALES diagnostic mutation denied',!authorizeOperationalAction(contexts.SALES,'DiagnosticoTecnico','create').ok);
check('CUSTOMER_SERVICE financial capability absent',!contexts.CUSTOMER_SERVICE.capabilities.includes('FINANCIAL_READ'));
check('unassigned branch denied',!getCanonicalBranchScope({...contexts.SALES,account:{...contexts.SALES.account,branch_id:null}}).ok);
const inventory={id:'qa-item',branch_id:'a1',precio_venta:100,costo_unitario:40,proveedor:'qa-supplier',cantidad_disponible:3};
const sales=projectOperationalReadResult('Inventario',inventory,contexts.SALES);
const owner=projectOperationalReadResult('Inventario',inventory,contexts.ORG_ADMIN);
check('SALES sees price and stock without cost or supplier',sales.precio_venta===100 && sales.cantidad_disponible===3 && !('costo_unitario' in sales) && !('proveedor' in sales));
check('OWNER sees cost and supplier',owner.costo_unitario===40 && owner.proveedor==='qa-supplier');
const original=globalThis.Deno;let mode;let sends=0;
globalThis.Deno={env:{get:()=>mode}};
try {
 for(const value of [undefined,'QA','TEST_SINK','invalid']){
  mode=value;
  const result=await dispatchExternalEmail({message:{to:'qa@invalid.example'},send:async()=>{sends++}});
  check('external email suppressed for '+String(value),result.status==='suppressed_for_qa' && sends===0);
 }
 mode='PRODUCTION';
 const result=await dispatchExternalEmail({message:{},send:async()=>{sends++}});
 check('explicit production mode calls fake transport only',result.status==='sent' && sends===1);
}finally{if(original===undefined)delete globalThis.Deno;else globalThis.Deno=original}
console.log(count+'/'+count+' synthetic controls PASS; no network, no real accounts, no external transport');
