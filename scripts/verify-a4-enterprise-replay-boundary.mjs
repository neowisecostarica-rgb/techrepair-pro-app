import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
import {authorizeRecordBranch} from '../base44/functions/_shared/operationalAuthorization.ts';
const auth={ok:true,role:'BRANCH_ADMIN',organizationId:'qa-a',branchId:'a1',account:{branch_id:'a1'}};
const cases=[
 ['manageAssetAssignment','AssetAssignment','assignment',{action:'ASSIGN',equipo_id:'qa-device',operation_key:'qa-key'}],
 ['manageEnterpriseOnboarding','EnterpriseOnboarding','onboarding',{action:'OPEN',subject_name:'QA',operation_key:'qa-key'}],
 ['manageEnterpriseOffboarding','EnterpriseOffboarding','offboarding',{action:'OPEN',subject_name:'QA',operation_key:'qa-key'}]
];
for(const [fn,entity,field,body] of cases){
 const foreign={id:'qa-other',organization_id:'qa-a',branch_id:'a2',operation_key:'qa-key'};
 let handler;let writes=0;
 const fake={auth:{me:async()=>({id:'qa-user'})},asServiceRole:{entities:{
 Organization:{filter:async()=>[{id:'qa-a',status:'active'}]},
 Equipo:{filter:async()=>[{id:'qa-device',organization_id:'qa-a',branch_id:'a1'}]},
 [entity]:{filter:async q=>q.organization_id==='qa-a'&&q.operation_key==='qa-key'?[foreign]:[],create:async()=>{writes++;throw Error('unexpected write')}}
 }}};
 const source=readFileSync(new URL('../scripts/base44-function-sources/'+fn+'/entry.ts',import.meta.url),'utf8').replace(/import\s*\{[^}]+\}\s*from\s*['"][^'"]+['"];?/g,'');
 const code=transformSync(source,{loader:'ts',target:'es2022'}).code;
 vm.runInNewContext(code,{Deno:{serve:f=>{handler=f}},createClientFromRequest:()=>fake,resolveAuthorizedContext:async()=>auth,resolveEffectiveEntitlement:async()=>({capabilities:['ENTERPRISE_ASSET_CUSTODY','ENTERPRISE_ONBOARDING','ENTERPRISE_OFFBOARDING']}),appendAuditEvent:async()=>{throw Error('unexpected audit')},Response,crypto,console});
 const response=await handler(new Request('https://qa.invalid/',{method:'POST',body:JSON.stringify(body)}));
 const result=await response.json();
 assert.equal(writes,0);
 assert.equal(authorizeRecordBranch(auth,foreign.branch_id).ok,false);
 assert.equal(response.status,200);
 assert.equal(result[field]?.id,foreign.id);
 console.log('DEFECT REPRODUCED '+fn+' — synthetic cross-branch replay returned prior record');
}
console.log('3/3 known defects reproduced in source handlers with mocked dependencies; NOT security PASS');
