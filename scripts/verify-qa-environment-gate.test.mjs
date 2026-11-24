import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateQaGate,buildSyntheticQaManifest} from './candidates/qaEnvironmentGate.mjs';
const all={testDataEnabled:true,runtimeTestDataConfirmed:true,syntheticOnly:true,nativeIdentitiesDedicated:true,externalEmailBlocked:true,invitationsBlocked:true,paymentSandboxConfirmed:true,workflowsAndWebhooksBlocked:true,noAutomaticProductionSeed:true,releaseReconciled:true};
test('enabled test data alone is insufficient',()=>assert.equal(evaluateQaGate({testDataEnabled:true}).decision,'NO_GO'));
for(const field of Object.keys(all))test('missing evidence blocks '+field,()=>assert.deepEqual(evaluateQaGate({...all,[field]:false}),{decision:'NO_GO',blockers:[field]}));
test('all evidence permits operator review only',()=>assert.equal(evaluateQaGate(all).decision,'ELIGIBLE_FOR_OPERATOR_REVIEW'));
test('truthy strings are not evidence',()=>assert.equal(evaluateQaGate({...all,runtimeTestDataConfirmed:'true'}).decision,'NO_GO'));
test('manifest is deterministic and purely synthetic',()=>{
 const a=buildSyntheticQaManifest(),b=buildSyntheticQaManifest();assert.deepEqual(a,b);
 assert.equal(a.organizations.length,2);assert.equal(a.branches.length,3);assert.equal(a.identities.length,13);
 assert.equal(new Set(a.identities.map(x=>x.email)).size,13);
 assert.ok(a.identities.every(x=>x.email.endsWith('@example.invalid')&&x.platformRole==='user'));
 assert.ok(a.identities.every(x=>x.role==='ORG_ADMIN'?x.branch===null:a.branches.some(b=>b.key===x.branch&&b.organization===x.organization)));
 assert.equal(a.mode,'OFFLINE_MANIFEST_ONLY');
});
