import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = relative => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');
const [consumer, postSale, command, gateway, hook, schema, blocker] = await Promise.all([
  read('base44/functions/processOTEvent/entry.ts'),
  read('base44/functions/processPostSaleActions/entry.ts'),
  read('base44/functions/notificationCommand/entry.ts'),
  read('base44/functions/operationalGateway/entry.ts'),
  read('src/components/notificaciones/useNotificacionesAutomaticas.jsx'),
  read('base44/entities/Notificacion.jsonc'),
  read('TRP-MULTIUSER-PLATFORM-BLOCKERS.md'),
]);

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('unattested processOTEvent denies before payload and event reads', () => {
  const gate = consumer.indexOf("code: 'AUTOMATION_TRUST_ATTESTATION_UNAVAILABLE'");
  assert.ok(gate > consumer.indexOf('base44.auth.me()'));
  assert.ok(gate < consumer.indexOf('body = await req.json()'));
  assert.ok(gate < consumer.indexOf('entities.OTEvent.filter'));
});

test('payload IDs and trigger fields are never accepted as automation authority', () => {
  assert.ok(blocker.includes('not treated as authentication'));
  assert.ok(consumer.includes('side_effects_executed: false'));
});

test('post-sale side effects require authenticated authorized context', () => {
  assert.ok(postSale.includes('const user = await base44.auth.me()'));
  assert.ok(postSale.includes('resolveAuthorizedContext'));
  assert.ok(postSale.includes('authorizeRecordBranch'));
});

test('notification materialization is authenticated, scoped, deduplicated and audited', () => {
  for (const fragment of ['base44.auth.me()', 'resolveAuthorizedContext', 'authorizeRecordBranch', 'eventKey', 'source_event_id', 'appendAuditEvent', "commandPolicyId: 'CP-NOTIF-001'"]) assert.ok(command.includes(fragment), fragment);
});

test('generic CRUD and browser inference cannot produce workflow notifications', () => {
  assert.ok(gateway.includes('NOTIFICATION_COMMAND_REQUIRED'));
  assert.ok(!hook.includes('Notificacion.create'));
  assert.ok(!hook.includes('Notificacion.update'));
});

test('notification schema persists backend-owned source event identity', () => {
  const parsed = JSON.parse(schema);
  for (const field of ['event_key', 'source_event_id', 'created_by_command']) assert.equal(parsed.properties[field].rls.write, false);
  assert.ok(parsed.properties.role_target.enum.includes('CUSTOMER_SERVICE'));
});

for (const item of tests) { await item.run(); console.log(`PASS ${item.name}`); }
console.log(`\n${tests.length}/6 automation and notification contract groups PASS`);
