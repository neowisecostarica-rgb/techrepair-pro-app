import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildAuditEvent } from '../base44/functions/_shared/auditEvent.ts';

const read = relative => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');
const sources = Object.fromEntries(await Promise.all([
  ['reception', 'base44/functions/createWorkOrder/entry.ts'],
  ['assignment', 'base44/functions/reassignWorkOrderTechnician/entry.ts'],
  ['technical', 'base44/functions/technicalActivityCommand/entry.ts'],
  ['qa', 'base44/functions/recordTechnicalTest/entry.ts'],
  ['lifecycle', 'base44/functions/transitionWorkOrderStatus/entry.ts'],
  ['sale', 'base44/functions/createSale/entry.ts'],
  ['inventory', 'base44/functions/_shared/inventoryMutationService.ts'],
  ['request', 'base44/functions/technicalRequestCommand/entry.ts'],
  ['delivery', 'base44/functions/deliverWorkOrder/entry.ts'],
  ['branch', 'base44/functions/manageBranchLifecycle/entry.ts'],
  ['user', 'base44/functions/manageOrgUser/entry.ts'],
  ['token', 'base44/functions/issuePublicDocumentToken/entry.ts'],
  ['provisioning', 'base44/functions/identityGateway/entry.ts'],
].map(async ([name, path]) => [name, await read(path)])));

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('AuditEvent requires principal, tenant, resource, policy, correlation and backend operation identity', () => {
  const event = buildAuditEvent({ eventType: 'TEST', principalClass: 'HUMAN_MEMBER', organizationId: 'org-1', resourceType: 'Test', resourceId: 'r1', commandPolicyId: 'CP-TEST', correlationId: 'c1', auditOperationId: 'op-1' });
  assert.equal(event.principal_class, 'HUMAN_MEMBER');
  assert.equal(event.audit_operation_id, 'op-1');
  assert.throws(() => buildAuditEvent({ eventType: 'TEST' }), /AUDIT_EVENT_FIELD_REQUIRED/);
});

test('critical command families write append-only AuditEvent evidence', () => {
  for (const [family, source] of Object.entries(sources)) assert.ok(source.includes('appendAuditEvent'), `${family} missing AuditEvent`);
});

test('customer decisions use CUSTOMER_TOKEN without fabricated human actor', () => {
  assert.ok(sources.lifecycle.includes("principalClass: 'CUSTOMER_TOKEN'"));
  assert.ok(!sources.lifecycle.includes("created_by_user_id: 'portal_cliente'"));
});

test('inventory audit correlates exact ledger movement references', () => {
  for (const fragment of ['INVENTORY_COMMAND_COMMITTED', 'movement_id: row.movement_id', 'reservation_id: row.reservation_id', "commandPolicyId: 'CP-INV-001'"]) assert.ok(sources.inventory.includes(fragment), fragment);
});

test('delivery and branch lifecycle do not report wrapper success before audit', () => {
  const deliveryAudit = sources.delivery.indexOf('appendAuditEvent');
  const deliverySuccess = sources.delivery.indexOf('return Response.json({', deliveryAudit);
  assert.ok(deliveryAudit >= 0 && deliverySuccess > deliveryAudit);
  const branchAudit = sources.branch.indexOf('appendAuditEvent');
  const branchSuccess = sources.branch.indexOf('return Response.json({', branchAudit);
  assert.ok(branchAudit >= 0 && branchSuccess > branchAudit);
});

test('custody and QA compensate domain state when required audit fails', () => {
  assert.ok(sources.assignment.includes('ASSIGNMENT_AUDIT_FAILED_ROLLED_BACK'));
  assert.ok(sources.qa.includes('PruebaTecnica.delete(test.id)'));
  assert.ok(sources.technical.includes('ActividadTecnica.delete(segment.id)'));
});

test('public-token mutations and user administration are audited', () => {
  assert.ok(sources.token.includes('PUBLIC_TOKEN_REVOKED'));
  assert.ok(sources.token.includes('PUBLIC_TOKEN_ISSUED'));
  assert.ok(sources.user.includes('USER_MEMBERSHIP_MUTATED'));
});

for (const item of tests) { await item.run(); console.log(`PASS ${item.name}`); }
console.log(`\n${tests.length}/7 audit coverage contract groups PASS`);
