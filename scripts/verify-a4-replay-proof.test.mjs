import test from 'node:test';
import assert from 'node:assert/strict';
import {fingerprintOperation,verifyCommittedReplay} from './candidates/enterpriseReplayProof.mjs';
const fixture=()=>{
 const request={organizationId:'qa-a',branchId:'a1',actorId:'u1',action:'ONBOARD_OPEN',operationKey:'key1',resourceId:'r1',payload:{subject:'QA',systems:['system-a'],notes:'QA note'}};
 return {auth:{ok:true,role:'BRANCH_ADMIN',organizationId:'qa-a',branchId:'a1'},actorId:'u1',request,record:{id:'r1',organization_id:'qa-a',branch_id:'a1'},receipt:{...request,status:'COMMITTED',fingerprint:fingerprintOperation(request)}};
};
test('exact committed replay accepted',()=>assert.equal(verifyCommittedReplay(fixture()).ok,true));
test('canonical object key ordering',()=>{const x=fixture();x.request.payload={notes:'QA note',systems:['system-a'],subject:'QA'};assert.equal(verifyCommittedReplay(x).ok,true)});
for(const [name,mutate,status] of [
 ['foreign tenant',x=>x.record.organization_id='qa-b',403],
 ['foreign branch',x=>x.record.branch_id='a2',403],
 ['unassigned branch',x=>x.auth.branchId=null,403],
 ['null record branch',x=>x.record.branch_id=null,403],
 ['another actor',x=>x.actorId='u2',403],
 ['unauthorized role',x=>x.auth.role='SALES',403],
 ['receipt tenant differs',x=>x.receipt.organizationId='qa-b',403],
 ['missing receipt',x=>x.receipt=null,409],
 ['pending audit',x=>x.receipt.status='PENDING',409],
 ['changed resource',x=>x.request.resourceId='r2',409],
 ['changed action',x=>x.request.action='OFFBOARD_OPEN',409],
 ['changed operation key',x=>x.request.operationKey='key2',409],
 ['changed subject',x=>x.request.payload.subject='other',409],
 ['changed access list',x=>x.request.payload.systems.push('system-b'),409],
 ['changed notes',x=>x.request.payload.notes='different',409],
 ['legacy receipt without hash',x=>delete x.receipt.fingerprint,409],
 ['invalid payload',x=>x.request.payload.notes=undefined,409],
]) test(name,()=>{const x=fixture();mutate(x);const result=verifyCommittedReplay(x);assert.equal(result.ok,false);assert.equal(result.status,status);assert.ok(!('record' in result));});
