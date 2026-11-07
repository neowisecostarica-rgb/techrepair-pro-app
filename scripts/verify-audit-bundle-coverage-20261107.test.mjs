import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const audited = [
  'adjustInventoryStock','createInventoryItem','createSale','createWorkOrder',
  'initTechnicalActivity','manageOrgUser','reassignWorkOrderTechnician',
  'transitionWorkOrderStatus','cancelDraftSale','deliverWorkOrder',
  'identityGateway','issuePublicDocumentToken','manageAssetAssignment',
  'manageBranchLifecycle','manageEnterpriseOffboarding',
  'manageEnterpriseOnboarding','migrateSupportRole','notificationCommand',
  'recordTechnicalTest','revealDeviceCredential','technicalActivityCommand',
  'technicalRecordCommand','technicalRequestCommand',
];
test('all 23 audit writers use the CAS lock in their standalone deploy bundles',()=>{
  for (const name of audited){
    const path=`base44/functions/${name}`;
    const cfg=JSON.parse(readFileSync(path+'/function.jsonc','utf8'));
    assert.equal(cfg.entry,'bundle.ts',`${name}: config must serve standalone bundle`);
    const code=readFileSync(path+'/bundle.ts','utf8');
    for (const fragment of ['audit_lock_token','audit_lock_at','AUDIT_LOCK_TIMEOUT','AUDIT_LOCK_UNAVAILABLE','AUDIT_OPERATION_ID_COLLISION']){
      assert.ok(code.includes(fragment),`${name} missing ${fragment}`);
    }
    assert.doesNotMatch(code,/from\s*['"]\.\.\//,name);
  }
});
test('organization CAS lease fields exist and are protected from direct client writes',()=>{
  const org=JSON.parse(readFileSync('base44/entities/Organization.jsonc','utf8'));
  for(const key of ['audit_lock_token','audit_lock_at']){
    assert.equal(org.properties[key].rls.write,false);
    assert.equal(org.properties[key].rls.read,false);
  }
});
