import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = JSON.parse(readFileSync('base44/entities/UserAccount.jsonc', 'utf8'));
assert.equal(schema.name, 'UserAccount');
assert.equal(schema.properties?.user_id?.type, 'string', 'canonical user_id must remain declared');
assert.ok(!(schema.required || []).includes('user_id'), 'historical invitations must remain compatible');
assert.deepEqual(schema.rls, { create: false, read: false, update: false, delete: false }, 'UserAccount direct RLS must stay closed');
for (const field of ['user_email','role','organization_id','branch_id','status','active']) {
  assert.ok(schema.properties[field], `must preserve ${field}`);
}
const auth = readFileSync('base44/functions/identityGateway/_shared/userAuthorization.ts', 'utf8');
assert.ok(auth.includes("UserAccount.filter({ user_id: user.id }, '-created_date', 100)"));
assert.ok(auth.includes("UserAccount.filter({ user_email: user.email }, '-created_date', 100)"));
assert.ok(auth.includes('account.user_id === user.id'), 'active memberships require matching canonical user ID');
assert.ok(auth.includes("account?.status === 'active'"));
console.log('PASS UserAccount canonical user_id schema, legacy optionality, fail-closed RLS, and identity membership contracts');
