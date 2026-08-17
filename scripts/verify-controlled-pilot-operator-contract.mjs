import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  evaluateControlledPilotHumanAccess,
  inspectControlledPilotConfiguration,
} from '../base44/functions/_shared/controlledPilotAuthority.ts';
import { getCanonicalBranchScope } from '../base44/functions/_shared/operationalAuthorization.ts';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = relative => readFile(join(root, relative), 'utf8');
let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

const organization = {
  id: 'org-pilot',
  controlled_pilot_mode: true,
  controlled_pilot_operator_user_id: 'user-operator',
  controlled_pilot_branch_id: 'branch-pilot',
};
const operator = { id: 'user-operator' };
const operatorAccount = {
  user_id: 'user-operator',
  organization_id: 'org-pilot',
  status: 'active',
  role: 'ORG_ADMIN',
};

test('nonpilot configuration preserves ordinary authorization behavior', () => {
  assert.deepEqual(inspectControlledPilotConfiguration({ id: 'org-normal' }), {
    enabled: false,
    valid: true,
    operatorUserId: null,
    branchId: null,
  });
  assert.equal(evaluateControlledPilotHumanAccess({ organization: { id: 'org-normal' } }).ok, true);
});

test('malformed enabled configuration fails closed', () => {
  const decision = evaluateControlledPilotHumanAccess({
    organization: { id: 'org-pilot', controlled_pilot_mode: true },
    user: operator,
    account: operatorAccount,
  });
  assert.equal(decision.ok, false);
  assert.equal(decision.code, 'CONTROLLED_PILOT_CONFIGURATION_INVALID');
});

test('only the exact active ORG_ADMIN operator is admitted', () => {
  const allowed = evaluateControlledPilotHumanAccess({ organization, user: operator, account: operatorAccount });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.pilotMode, true);
  assert.equal(allowed.branchId, 'branch-pilot');

  for (const candidate of [
    { user: { id: 'other' }, account: operatorAccount },
    { user: operator, account: { ...operatorAccount, user_id: 'other' } },
    { user: operator, account: { ...operatorAccount, status: 'suspended' } },
    { user: operator, account: { ...operatorAccount, role: 'BRANCH_ADMIN' } },
  ]) {
    assert.equal(evaluateControlledPilotHumanAccess({ organization, ...candidate }).ok, false);
  }
});

test('superadmin and impersonation authority cannot enter the pilot tenant', () => {
  const denied = evaluateControlledPilotHumanAccess({ organization, user: { id: 'platform-admin' }, account: null, isSuperAdmin: true });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, 'CONTROLLED_PILOT_OPERATOR_REQUIRED');
});

test('pilot ORG_ADMIN authority is reduced to the configured branch', () => {
  assert.deepEqual(getCanonicalBranchScope({
    ok: true,
    role: 'ORG_ADMIN',
    pilotMode: true,
    pilotBranchId: 'branch-pilot',
  }), { ok: true, organizationWide: false, branchId: 'branch-pilot' });
});

const [transition, publicRead, publicPortal, issuer, identity, membership, automation, lifecycle, panel, schema] = await Promise.all([
  source('base44/functions/transitionWorkOrderStatus/entry.ts'),
  source('base44/functions/getPublicCommercialDocument/entry.ts'),
  source('src/pages/PortalCotizacion.jsx'),
  source('base44/functions/issuePublicDocumentToken/entry.ts'),
  source('base44/functions/identityGateway/entry.ts'),
  source('base44/functions/manageOrgUser/entry.ts'),
  source('base44/functions/processOTEvent/entry.ts'),
  source('base44/functions/handleOTLifecycleEvent/entry.ts'),
  source('src/components/expediente/PanelOperativoDiagnostico.jsx'),
  source('base44/entities/Organization.jsonc'),
]);

test('persistent config and activation enforce exactly one active operator account', () => {
  for (const field of ['controlled_pilot_mode', 'controlled_pilot_operator_user_id', 'controlled_pilot_branch_id']) {
    assert.match(schema, new RegExp(`"${field}"`));
  }
  assert.match(identity, /activeAccounts\.length !== 1/);
  assert.match(identity, /operatorAccount\.role !== 'ORG_ADMIN'/);
  assert.match(identity, /CONTROLLED_PILOT_BRANCH_INVALID/);
});

test('configuration has explicit disable and audit-failure rollback recovery', () => {
  assert.match(identity, /action === 'configureControlledPilot'/);
  assert.match(identity, /controlled_pilot_mode: false/);
  assert.match(identity, /controlled_pilot_operator_user_id: null/);
  assert.match(identity, /controlled_pilot_branch_id: null/);
  assert.match(identity, /Organization\.update\(organization\.id, before\)\.catch/);
  assert.match(identity, /CONTROLLED_PILOT_IMPERSONATION_ACTIVE/);
});

test('public quote mutation is denied while public work-order telemetry becomes read-only', () => {
  assert.match(transition, /CONTROLLED_PILOT_PUBLIC_DECISION_DISABLED/);
  assert.match(issuer, /body\.type === 'quote' && action === 'issue'/);
  assert.match(publicRead, /if \(!inspectControlledPilotConfiguration\(organization\)\.enabled\)/);
  assert.match(publicRead, /customer_decision_enabled/);
  assert.match(publicPortal, /!customerDecisionEnabled/);
});

test('membership, impersonation, platform admin and automation bypasses are closed', () => {
  assert.match(identity, /CONTROLLED_PILOT_MEMBERSHIP_FROZEN/);
  assert.match(identity, /CONTROLLED_PILOT_IMPERSONATION_DISABLED/);
  assert.match(identity, /CONTROLLED_PILOT_ADMIN_MUTATION_DISABLED/);
  assert.match(membership, /CONTROLLED_PILOT_MEMBERSHIP_FROZEN/);
  assert.match(automation, /CONTROLLED_PILOT_AUTOMATION_MUTATION_DISABLED/);
  assert.match(lifecycle, /CONTROLLED_PILOT_AUTOMATION_MUTATION_DISABLED/);
});

test('operator recording uses the sovereign commercial core with HUMAN attribution', () => {
  assert.match(transition, /body\.action === 'RECORD_CUSTOMER_DECISION'/);
  assert.match(transition, /policyId: 'CP-QUOTE-003'/);
  assert.match(transition, /expected_quote_version/);
  assert.match(transition, /claimPublicQuoteDecision/);
  assert.match(transition, /reserveApprovedQuoteInventory/);
  assert.match(transition, /eventType: 'OPERATOR_RECORDED_CUSTOMER_DECISION'/);
  assert.match(transition, /customer_token_used: false/);
  assert.match(panel, /controlledPilotMode/);
  assert.match(panel, /legacy_nonpilot: true/);
});

console.log(`\nControlled Pilot Operator Contract: ${passed} groups PASS`);
