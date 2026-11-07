// CAS serializer diagnostic: passing demonstrates protection in an atomic in-memory
// adapter. It does NOT establish Base44 server-side atomicity or DB UNIQUE.
import assert from 'node:assert/strict';
import test from 'node:test';
import { appendAuditEvent } from '../base44/functions/_shared/auditEvent.ts';

const event = {
  eventType: 'SALE_PAYMENT_COMMITTED', principalClass: 'HUMAN_MEMBER',
  actorUserId: 'user-test', organizationId: 'org-test', branchId: 'branch-test',
  resourceType: 'Venta', resourceId: 'sale-test', commandPolicyId: 'CP-SALE-001',
  correlationId: 'trace-test', auditOperationId: 'sale:sale-test', outcome: 'COMMITTED',
};

test('P0 audit: two simultaneous cooperating writers serialize through a CAS organization lock', async () => {
  const rows=[];
  const org={id:'org-test'};
  const matches=(row,q)=>Object.entries(q).every(([key,v])=>{
    if(key==='$or')return v.some(part=>matches(row,part));
    if(v && typeof v==='object' && '$exists' in v)return Object.hasOwn(row,key)===v.$exists;
    return row[key]===v;
  });
  const organization={
    async filter(q){return matches(org,q)?[structuredClone(org)]:[]},
    async updateMany(q,change){
      if(!matches(org,q))return {updated:0};
      Object.assign(org,change.$set||{});
      for(const key of Object.keys(change.$unset||{}))delete org[key];
      return {updated:1};
    },
  };
  const audit={
    async filter(q){return rows.filter(row=>matches(row,q)).map(x=>structuredClone(x))},
    async create(data){
      await new Promise(resolve=>setTimeout(resolve,12));
      const r={...structuredClone(data),id:'audit-'+(rows.length+1)};
      rows.push(r);return r;
    },
  };
  const base44={asServiceRole:{entities:{Organization:organization,AuditEvent:audit}}};
  const result=await Promise.all([appendAuditEvent(base44,event),appendAuditEvent(base44,event)]);
  assert.equal(rows.length,1);
  assert.equal(result.filter(r=>r.duplicate).length,1);
  assert.equal(org.audit_lock_token,undefined);
});
