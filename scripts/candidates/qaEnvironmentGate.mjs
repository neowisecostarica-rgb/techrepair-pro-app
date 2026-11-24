// Offline QA gate: evidence must be independently established by an operator.
// Neither URL flags nor this function authorize a runtime write.
export function evaluateQaGate(evidence = {}) {
  const blockers = [];
  for (const field of ['testDataEnabled','runtimeTestDataConfirmed','syntheticOnly','nativeIdentitiesDedicated','externalEmailBlocked','invitationsBlocked','paymentSandboxConfirmed','workflowsAndWebhooksBlocked','noAutomaticProductionSeed','releaseReconciled']) {
    if (evidence[field] !== true) blockers.push(field);
  }
  return {decision:blockers.length ? 'NO_GO' : 'ELIGIBLE_FOR_OPERATOR_REVIEW',blockers};
}
export function buildSyntheticQaManifest() {
  const organizations = [
    {key:'qa-a',name:'QA Taller Alfa',country:'CR',currency:'CRC'},
    {key:'qa-b',name:'QA Taller Beta',country:'US',currency:'USD'}
  ];
  const branches = [
    {key:'qa-a1',organization:'qa-a',primary:true},
    {key:'qa-a2',organization:'qa-a',primary:false},
    {key:'qa-b1',organization:'qa-b',primary:true}
  ];
  const roles=['ORG_ADMIN','BRANCH_ADMIN','SALES','TECHNICIAN','INVENTORY','CUSTOMER_SERVICE'];
  const identities=organizations.flatMap(org=>roles.map(role=>({
    key:org.key+'-'+role.toLowerCase(),organization:org.key,role,
    branch:role==='ORG_ADMIN'?null:org.key+'1',
    email:org.key+'-'+role.toLowerCase()+'@example.invalid',
    platformRole:'user'
  })));
  identities.push({key:'qa-a2-sales',organization:'qa-a',role:'SALES',branch:'qa-a2',email:'qa-a2-sales@example.invalid',platformRole:'user'});
  return {mode:'OFFLINE_MANIFEST_ONLY',organizations,branches,identities};
}
