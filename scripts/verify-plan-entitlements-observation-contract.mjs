import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  addsUserSeat,
  consumesUserSeat,
  observeBranchLimit,
  observeUserSeatLimit,
  PLAN_ENTITLEMENTS,
} from '../base44/functions/_shared/planEntitlements.ts';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('plan entitlement policy is observation-only and declares proposed limits', async () => {
  const source = await read('../base44/functions/_shared/planEntitlements.ts');
  assert.match(source, /basic: Object\.freeze\(\{ maxBranches: 1, maxUsers: 3 \}\)/);
  assert.match(source, /pro: Object\.freeze\(\{ maxBranches: 3, maxUsers: 10 \}\)/);
  assert.match(source, /premium: Object\.freeze\(\{ maxBranches: null, maxUsers: null \}\)/);
  assert.match(source, /PLAN_ENTITLEMENT_OBSERVED_EXCEEDED/);
  assert.match(source, /mode: 'OBSERVE_ONLY'/);
  assert.match(source, /enforcement: 'disabled'/);
  assert.match(source, /observation audit failed/);
  assert.doesNotMatch(source, /PLAN_LIMIT_REACHED/);
  assert.deepEqual(PLAN_ENTITLEMENTS.basic, { maxBranches: 1, maxUsers: 3 });
  assert.deepEqual(PLAN_ENTITLEMENTS.pro, { maxBranches: 3, maxUsers: 10 });
  assert.deepEqual(PLAN_ENTITLEMENTS.premium, { maxBranches: null, maxUsers: null });
});

test('seat policy counts invited and active memberships and detects only new consumption', () => {
  assert.equal(consumesUserSeat('invited'), true);
  assert.equal(consumesUserSeat('active'), true);
  assert.equal(consumesUserSeat('suspended'), false);
  assert.equal(addsUserSeat(null, 'invited'), true);
  assert.equal(addsUserSeat('suspended', 'active'), true);
  assert.equal(addsUserSeat('suspended', 'invited'), true);
  assert.equal(addsUserSeat('invited', 'active'), false);
  assert.equal(addsUserSeat('active', 'active'), false);
});

function observationBase44({ plan = 'basic', accounts = [], branches = [] } = {}) {
  return {
    asServiceRole: {
      entities: {
        Organization: { filter: async () => [{ id: 'org-a', plan }] },
        UserAccount: { filter: async () => accounts },
        Branch: { filter: async () => branches },
      },
    },
  };
}

const observationInput = {
  organizationId: 'org-a',
  resourceId: 'resource-a',
  action: 'contract_test',
  correlationId: 'contract-correlation',
  commandPolicyId: 'CP-TEST-001',
  authorization: { principalClass: 'HUMAN_MEMBER', persistedRole: 'ORG_ADMIN' },
  actor: { id: 'actor-a' },
};

test('user observation reports persisted post-mutation usage without blocking the command', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const atLimit = await observeUserSeatLimit(observationBase44({
      accounts: [{ status: 'active' }, { status: 'invited' }, { status: 'active' }],
    }), observationInput);
    assert.deepEqual(atLimit, {
      plan: 'basic', limits: PLAN_ENTITLEMENTS.basic, usage: 3, exceeded: false,
    });

    const exceeded = await observeUserSeatLimit(observationBase44({
      accounts: [{ status: 'active' }, { status: 'invited' }, { status: 'active' }, { status: 'active' }],
    }), observationInput);
    assert.deepEqual(exceeded, {
      plan: 'basic', limits: PLAN_ENTITLEMENTS.basic, usage: 4, exceeded: true,
    });
  } finally {
    console.error = originalError;
  }
});

test('branch observation reports the persisted active-branch total and premium remains unlimited', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const exceeded = await observeBranchLimit(observationBase44({
      branches: [{ id: 'b1' }, { id: 'b2' }],
    }), observationInput);
    assert.deepEqual(exceeded, {
      plan: 'basic', limits: PLAN_ENTITLEMENTS.basic, usage: 2, exceeded: true,
    });

    const unlimited = await observeBranchLimit(observationBase44({
      plan: 'premium', branches: Array.from({ length: 20 }, (_, index) => ({ id: `b${index}` })),
    }), observationInput);
    assert.equal(unlimited, null);
  } finally {
    console.error = originalError;
  }
});

test('canonical membership and branch writers invoke observation without a hard response path', async () => {
  const [users, branches] = await Promise.all([
    read('../base44/functions/manageOrgUser/entry.ts'),
    read('../base44/functions/manageBranchLifecycle/entry.ts'),
  ]);
  assert.match(users, /import \{ addsUserSeat, observeUserSeatLimit \}/);
  assert.match(users, /observeAddedSeat/);
  assert.match(users, /await observeAddedSeat\(null, created, 'invite_created'\)/);
  assert.match(users, /await observeAddedSeat\(account, updated, 'invite_reissued'\)/);
  assert.match(users, /await observeAddedSeat\(target\[0\], updated, 'status_updated'\)/);
  assert.match(users, /await observeAddedSeat\(target\[0\], updated, 'account_updated'\)/);
  assert.match(branches, /import \{ observeBranchLimit \}/);
  assert.match(branches, /await observeBranchLimit\(base44/);
  assert.match(branches, /\['CREATE', 'REACTIVATE'\]/);
  assert.doesNotMatch(users, /PLAN_LIMIT_REACHED/);
  assert.doesNotMatch(branches, /PLAN_LIMIT_REACHED/);
});
