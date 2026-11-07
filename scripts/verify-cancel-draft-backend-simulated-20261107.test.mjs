import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Exercise the REAL source handler with an injected in-memory entity adapter.
// This is not an authenticated remote Base44 runtime test.
const source = readFileSync('scripts/candidates/cancelDraftSaleSource.ts', 'utf8')
  .replace(/^import .*;\s*$/gm, '');
const baseSale = { id:'sale-1', organization_id:'org-1', branch_id:'br-1', estado:'borrador' };
function scenario({ sale=baseSale, role='SALES', branch='br-1', auditFails=false, user=null } = {}) {
  const records = [structuredClone(sale)], events=[];
  let handler;
  const entity = {
    async filter(q) {
      return records.filter(row => Object.entries(q).every(([k,v]) => row[k]===v)).map(x=>structuredClone(x));
    },
    async updateMany(q, update) {
      const row=records.find(r => Object.entries(q).every(([k,v]) => {
        if (k==='$or') return v.some(cond => Object.entries(cond).every(([field,expected]) =>
          expected && typeof expected==='object' && '$exists' in expected ? Object.hasOwn(r,field)===expected.$exists : r[field]===expected));
        return r[k]===v;
      }));
      if (!row) return {updated:0};
      Object.assign(row,structuredClone(update.$set));
      return {updated:1};
    },
  };
  const sdk={auth:{me:async()=>user===false?null:({id:'user-1'})},asServiceRole:{entities:{Venta:entity}}};
  const sandbox={
    Response, console, Date,
    Deno:{serve(h){handler=h}},
    createClientFromRequest:()=>sdk,
    resolveAuthorizedContext:async()=> role==='TECHNICIAN'?{ok:false,status:403,error:'Denied'}:{ok:true,role,organizationId:'org-1',principalClass:'HUMAN_MEMBER',persistedRole:role},
    getCanonicalBranchScope:()=>({ok:true,organizationWide:role==='ORG_ADMIN',branchId:branch}),
    appendAuditEvent:async(_sdk,input)=> {if(auditFails)throw Error('audit unavailable');events.push(input);return {event:{id:'audit-1'}}},
  };
  vm.runInNewContext(source,sandbox,{filename:'cancelDraftSale/entry.ts'});
  const invoke=async(body={venta_id:'sale-1',operation_id:'op-1'})=>{
    const response=await handler(new Request('https://invalid.example/cancelDraftSale',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
    return {status:response.status, data:await response.json()};
  };
  return {invoke,records,events};
}
test('authorized draft is logically cancelled with record and audit',async()=>{
  const x=scenario();const r=await x.invoke();
  assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal(x.records.length,1);assert.equal(x.records[0].estado,'anulada');
  assert.equal(x.records[0].cancelado_por,'user-1');assert.equal(x.events.length,1);
});
test('same request returns idempotent response',async()=>{
  const x=scenario();await x.invoke();const r=await x.invoke();
  assert.equal(r.status,200);assert.equal(r.data.idempotent,true);
});
test('second operation cannot cancel an already cancelled draft',async()=>{
  const x=scenario();await x.invoke();const r=await x.invoke({venta_id:'sale-1',operation_id:'other'});
  assert.equal(r.status,409);assert.equal(r.data.code,'SALE_CANCEL_ALREADY_CANCELLED');
});
test('cross-branch, denied role, paid and stock-committed cannot cancel',async()=>{
  for (const config of [{branch:'br-2'},{role:'TECHNICIAN'},{sale:{...baseSale,estado:'pagada'}},{sale:{...baseSale,inventory_commit_status:'COMMITTED'}}]) {
    const x=scenario(config);const r=await x.invoke();assert.notEqual(r.status,200);
    assert.equal(x.records[0].estado,config.sale?.estado||'borrador');assert.equal(x.events.length,0);
  }
});
test('audit failure never reports successful completion',async()=>{
  const x=scenario({auditFails:true});const r=await x.invoke();
  assert.equal(r.status,503);assert.equal(r.data.code,'SALE_CANCEL_AUDIT_UNCERTAIN');
  assert.equal(x.records[0].estado,'anulada');
});
test('legacy draft with null cancellation key can be cancelled safely',async()=>{
  const x=scenario({sale:{...baseSale,cancel_operation_id:null}});const r=await x.invoke();
  assert.equal(r.status,200,JSON.stringify(r.data));
});
