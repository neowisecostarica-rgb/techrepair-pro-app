import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

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
});

test('canonical membership and branch writers invoke observation without a hard response path', async () => {
  const [users, branches] = await Promise.all([
    read('../base44/functions/manageOrgUser/entry.ts'),
    read('../base44/functions/manageBranchLifecycle/entry.ts'),
  ]);
  assert.match(users, /import \{ observeUserSeatLimit \}/);
  assert.match(users, /await observeUserSeatLimit\(base44/);
  assert.match(users, /resourceId: created\.id/);
  assert.match(branches, /import \{ observeBranchLimit \}/);
  assert.match(branches, /await observeBranchLimit\(base44/);
  assert.match(branches, /\['CREATE', 'REACTIVATE'\]/);
  assert.doesNotMatch(users, /PLAN_LIMIT_REACHED/);
  assert.doesNotMatch(branches, /PLAN_LIMIT_REACHED/);
});
