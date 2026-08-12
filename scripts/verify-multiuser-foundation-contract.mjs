import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  AUTHORIZATION_PRESET_VERSION,
  CAPABILITIES,
  getRoleCapabilities,
  getRoleScope,
  normalizeTenantRole,
} from '../base44/functions/_shared/roleCapabilities.ts';
import {
  COMMAND_POLICIES,
  COMMAND_POLICY_VERSION,
  OT_TRANSITION_POLICIES,
  evaluateCommandPolicy,
  validateCommandPolicyRegistry,
} from '../base44/functions/_shared/commandPolicy.ts';
import { buildAuditEvent } from '../base44/functions/_shared/auditEvent.ts';
import { createRequestAuthorizationResolver, resolveAuthorizedContext } from '../base44/functions/_shared/userAuthorization.ts';

let passed = 0;
const pass = (name) => { passed += 1; console.log(`PASS ${name}`); };

{
  assert.equal(AUTHORIZATION_PRESET_VERSION, 'TRP_MULTIUSER_V1');
  assert.equal(normalizeTenantRole('SUPPORT'), 'CUSTOMER_SERVICE');
  assert.equal(normalizeTenantRole('CEO'), null);
  assert.equal(getRoleScope('ORG_ADMIN'), 'ORGANIZATION');
  for (const role of ['BRANCH_ADMIN', 'TECHNICIAN', 'SALES', 'INVENTORY', 'CUSTOMER_SERVICE', 'SUPPORT']) {
    assert.equal(getRoleScope(role), 'SINGLE_BRANCH');
  }
  pass('role normalization and frozen scope presets are exact');
}

{
  assert.deepEqual(new Set(getRoleCapabilities('ORG_ADMIN')), new Set(CAPABILITIES));
  assert.equal(getRoleCapabilities('BRANCH_ADMIN').includes('USER_ADMINISTRATION'), false);
  assert.equal(getRoleCapabilities('TECHNICIAN').includes('TECHNICAL_WORK'), true);
  assert.equal(getRoleCapabilities('TECHNICIAN').includes('SALE_OPERATIONS'), false);
  assert.equal(getRoleCapabilities('SALES').includes('TECHNICAL_ASSIGNMENT'), true);
  assert.equal(getRoleCapabilities('CUSTOMER_SERVICE').includes('TECHNICAL_WORK'), false);
  assert.deepEqual(getRoleCapabilities('SUPPORT'), getRoleCapabilities('CUSTOMER_SERVICE'));
  pass('fixed capabilities preserve limited SALES assignment and deny user admin outside ORG_ADMIN');
}

{
  const validation = validateCommandPolicyRegistry();
  assert.deepEqual(validation, { ok: true, errors: [] });
  assert.equal(COMMAND_POLICY_VERSION, 'TRP_MULTIUSER_COMMAND_POLICY_V1');
  const requiredFamilies = ['OT', 'ASG', 'TECH', 'DIAG', 'QA', 'QUOTE', 'SALE', 'DEL', 'INV', 'REQ', 'CUST', 'EQP', 'CRM', 'AGENDA', 'CUSTODY', 'RECYCLE', 'FIN', 'NOTIF', 'USER', 'PROV', 'BR', 'PUBLIC', 'AUTO'];
  for (const family of requiredFamilies) {
    assert.ok(Object.keys(COMMAND_POLICIES).some(id => id.startsWith(`CP-${family}-`)), family);
  }
  pass('versioned command registry covers every required mutation family without placeholders');
}

{
  const human = {
    ok: true,
    principalClass: 'HUMAN_MEMBER',
    capabilities: getRoleCapabilities('TECHNICIAN'),
  };
  assert.equal(evaluateCommandPolicy({ policyId: 'CP-TECH-001', authorization: human, relationship: 'EFFECTIVE_TECHNICIAN' }).ok, true);
  assert.equal(evaluateCommandPolicy({ policyId: 'CP-TECH-001', authorization: human, relationship: 'BRANCH_RESOURCE' }).code, 'RESOURCE_RELATIONSHIP_DENIED');
  assert.equal(evaluateCommandPolicy({ policyId: 'CP-SALE-001', authorization: human, relationship: 'BRANCH_RESOURCE' }).code, 'CAPABILITY_DENIED');
  assert.equal(evaluateCommandPolicy({ policyId: 'CP-UNKNOWN', authorization: human, relationship: 'NONE' }).code, 'COMMAND_POLICY_UNKNOWN');
  pass('command evaluation denies unknown policy, missing capability and wrong relationship');
}

{
  const token = { ok: true, principalClass: 'CUSTOMER_TOKEN', capabilities: [] };
  assert.equal(evaluateCommandPolicy({ policyId: 'CP-QUOTE-002', authorization: token, relationship: 'CUSTOMER_TOKEN_RESOURCE', authorityContract: 'QUOTE_DECISION' }).ok, true);
  assert.equal(evaluateCommandPolicy({ policyId: 'CP-QUOTE-002', authorization: token, relationship: 'CUSTOMER_TOKEN_RESOURCE', authorityContract: 'PUBLIC_DOCUMENT_READ' }).code, 'AUTHORITY_CONTRACT_DENIED');
  assert.equal(evaluateCommandPolicy({ policyId: 'CP-QUOTE-002', authorization: { ...token, principalClass: 'HUMAN_MEMBER' }, relationship: 'CUSTOMER_TOKEN_RESOURCE', authorityContract: 'QUOTE_DECISION' }).code, 'PRINCIPAL_CLASS_DENIED');
  pass('public quote decision authority stays purpose-bound and separate from membership capabilities');
}

{
  const exactEdges = [
    'EN_COLA_REVISION->ASIGNADA', 'ASIGNADA->EN_REVISION', 'EN_REVISION->DIAGNOSTICADA',
    'DIAGNOSTICADA->COTIZADA', 'DIAGNOSTICADA->APROBADA', 'COTIZADA->APROBADA',
    'APROBADA->EN_REPARACION', 'EN_REPARACION->PRUEBAS', 'PRUEBAS->FINALIZADA',
    'PRUEBAS->EN_REPARACION', 'FINALIZADA->ENTREGADA',
  ];
  assert.deepEqual(Object.keys(OT_TRANSITION_POLICIES), exactEdges);
  assert.equal(OT_TRANSITION_POLICIES['DIAGNOSTICADA->APROBADA'].alternativePublicAuthority, 'QUOTE_DECISION');
  assert.equal(OT_TRANSITION_POLICIES['COTIZADA->APROBADA'].alternativePublicAuthority, 'QUOTE_DECISION');
  assert.equal(Object.keys(OT_TRANSITION_POLICIES).some(edge => edge.endsWith('->CANCELADA')), false);
  pass('non-cancellation lifecycle and both public approval alternatives match v2.2C.1');
}

{
  assert.throws(() => buildAuditEvent({}), /AUDIT_EVENT_FIELD_REQUIRED/);
  const event = buildAuditEvent({
    eventType: 'TECHNICAL_ACTIVITY_STARTED',
    principalClass: 'HUMAN_MEMBER',
    actorUserId: 'user-a',
    actorPrimaryRole: 'ORG_ADMIN',
    effectiveTechnicianUserId: 'user-a',
    organizationId: 'org-a',
    branchId: 'branch-a',
    resourceType: 'OrdenTrabajo',
    resourceId: 'ot-a',
    commandPolicyId: 'CP-TECH-001',
    correlationId: 'corr-a',
  });
  assert.equal(event.outcome, 'COMMITTED');
  assert.equal(event.effective_technician_user_id, 'user-a');
  pass('append-oriented AuditEvent requires canonical attribution and correlation');
}

{
  const entities = {
    UserAccount: { filter: async () => [{ id: 'ua-a', user_id: 'user-a', user_email: 'a@example.com', organization_id: 'org-a', branch_id: 'branch-a', role: 'SUPPORT', status: 'active' }] },
    Organization: { filter: async query => query.id === 'org-a' && query.status === 'active' ? [{ id: 'org-a', status: 'active' }] : [] },
    Branch: { filter: async query => query.id === 'branch-a' && query.active === true ? [{ id: 'branch-a', organization_id: 'org-a', active: true }] : [] },
  };
  const resolved = await resolveAuthorizedContext({ asServiceRole: { entities } }, { id: 'user-a', email: 'a@example.com', role: 'user', organization_id: 'org-a' }, { organizationHint: 'org-a' });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.persistedRole, 'SUPPORT');
  assert.equal(resolved.role, 'CUSTOMER_SERVICE');
  assert.equal(resolved.branchId, 'branch-a');
  assert.equal(resolved.capabilities.includes('TECHNICAL_WORK'), false);
  pass('ResolveAuthorizationContext verifies active tenant and branch while normalizing legacy SUPPORT');
}

{
  let membershipReads = 0;
  const entities = {
    UserAccount: { filter: async () => { membershipReads += 1; return [{ id: 'ua-a', user_id: 'user-a', user_email: 'a@example.com', organization_id: 'org-a', branch_id: 'branch-a', role: 'TECHNICIAN', status: 'active' }]; } },
    Organization: { filter: async () => [{ id: 'org-a', status: 'active' }] },
    Branch: { filter: async () => [{ id: 'branch-a', organization_id: 'org-a', active: true }] },
  };
  const resolve = createRequestAuthorizationResolver({ asServiceRole: { entities } }, { id: 'user-a', email: 'a@example.com', role: 'user' });
  assert.equal((await resolve({ organizationHint: 'org-a' })).ok, true);
  assert.equal((await resolve({ organizationHint: 'org-a' })).ok, true);
  assert.equal(membershipReads, 2, 'user-id and email membership queries execute only once per request cache key');
  pass('request-scoped resolver cache reuses one backend authority snapshot');
}

{
  const duplicate = { id: 'ua-b', user_id: 'user-a', user_email: 'a@example.com', organization_id: 'org-a', branch_id: 'branch-a', role: 'TECHNICIAN', status: 'active' };
  const entities = {
    UserAccount: { filter: async () => [{ ...duplicate, id: 'ua-a' }, duplicate] },
  };
  const resolved = await resolveAuthorizedContext({ asServiceRole: { entities } }, { id: 'user-a', email: 'a@example.com', role: 'user' }, { organizationHint: 'org-a' });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.code, 'MEMBERSHIP_AMBIGUOUS');
  pass('duplicate active membership ambiguity denies before organization or branch resolution');
}

{
  const schema = JSON.parse(await readFile(new URL('../base44/entities/AuditEvent.jsonc', import.meta.url), 'utf8'));
  assert.deepEqual(schema.rls, { create: false, read: false, update: false, delete: false });
  assert.ok(schema.required.includes('principal_class'));
  pass('AuditEvent rejects every direct client CRUD path');
}

console.log(`\nMulti-user foundation: ${passed} groups PASS`);
