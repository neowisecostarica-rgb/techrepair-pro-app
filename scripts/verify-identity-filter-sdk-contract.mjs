import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createEntitiesModule } from '../node_modules/@base44/sdk/dist/modules/entities.js';

const calls = [];
const entities = createEntitiesModule({
  appId: 'contract-only',
  axios: {
    get: async (url, config) => {
      calls.push({ url, params: config.params });
      return { data: [] };
    },
  },
  getSocket: () => null,
});

await entities.User.filter({ id: 'u1' }, 1);
assert.equal(calls.at(-1).params.sort, 1);
assert.equal(calls.at(-1).params.limit, undefined);
console.log('PASS SDK reproduces invalid numeric sort when limit is passed as second argument');

await entities.User.filter({ id: 'u1' }, '-created_date', 1);
assert.equal(calls.at(-1).params.sort, '-created_date');
assert.equal(calls.at(-1).params.limit, 1);
console.log('PASS SDK accepts explicit sort and limit in third argument');

const sources = [
  'base44/functions/identityGateway/entry.ts',
  'base44/functions/identityGateway/_shared/userAuthorization.ts',
];
for (const file of sources) {
  const source = readFileSync(file, 'utf8');
  const invalidSecondArg = /\.filter\(\{[^{}]*\},\s*(?:1|2|10|20|100|500)\s*\)/g;
  assert.equal([...source.matchAll(invalidSecondArg)].length, 0, `${file}: no numeric sort arguments`);
}
console.log('PASS identity gateway source has no numeric second-argument entity filters');

const authorizations = [];
function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (entry.name === 'userAuthorization.ts') authorizations.push(path);
  }
}
scan('base44/functions');
const numericMembershipFilter = /\.filter\(\{\s*(?:user_id:\s*user\.id|user_email:\s*user\.email)\s*\},\s*100\s*\)/g;
let corrected = 0;
for (const file of authorizations) {
  const source = readFileSync(file, 'utf8');
  assert.equal([...source.matchAll(numericMembershipFilter)].length, 0, `${file}: numeric sort is invalid`);
  corrected += [...source.matchAll(/\.filter\(\{\s*(?:user_id:\s*user\.id|user_email:\s*user\.email)\s*\},\s*'-created_date',\s*100\s*\)/g)].length;
}
assert.ok(corrected >= 58, 'all membership filters should use explicit sort and limit');
console.log(`PASS ${authorizations.length} authorization copies have correct SDK membership filter signatures (${corrected} verified calls)`);
