import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { resolveAuthorizedContext } from '../base44/functions/_shared/userAuthorization.ts';
import { authorizeRecordBranch } from '../base44/functions/_shared/operationalAuthorization.ts';
import { executeInventoryCommand } from '../base44/functions/_shared/inventoryMutationService.ts';
import { appendAuditEvent } from '../base44/functions/_shared/auditEvent.ts';
import {
  evaluateCommandPolicyWithShadow,
  ExecuteSovereignCommand,
} from '../base44/functions/_shared/commandExecution.ts';

const source = await readFile(new URL('../base44/functions/technicalRequestCommand/entry.ts', import.meta.url), 'utf8');
const gatewaySource = await readFile(new URL('../base44/functions/operationalGateway/entry.ts', import.meta.url), 'utf8');

function matches(record, query) {
  return Object.entries(query || {}).every(([field, expected]) => {
    if (field === '$or') return expected.some(candidate => matches(record, candidate));
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$in' in expected) return expected.$in.includes(record[field]);
      if ('$exists' in expected) return Object.hasOwn(record, field) === expected.$exists;
    }
    if (expected === null) return record[field] == null;
    return record[field] === expected;
  });
}

function scenario({ stock = 5, memberBranch = 'branch-a', requestState = 'requested', mode = 'EXISTING_STOCK' } = {}) {
  const collections = {
    Organization: [{ id: 'org-a', name: 'Org', status: 'active' }],
    Branch: [{ id: 'branch-a', organization_id: 'org-a', active: true }, { id: 'branch-b', organization_id: 'org-a', active: true }],
    UserAccount: [{ id: 'ua-1', user_id: 'inventory-user', user_email: 'inventory@test', organization_id: 'org-a', branch_id: memberBranch, role: 'INVENTORY', status: 'active' }],
    OrdenTrabajo: [{ id: 'ot-1', organization_id: 'org-a', branch_id: 'branch-a', tecnico_asignado_id: 'tech-user' }],
    SolicitudTecnica: [{ id: 'request-1', organization_id: 'org-a', branch_id: 'branch-a', orden_trabajo_id: 'ot-1', tecnico_id: 'tech-user', requester_user_id: 'tech-user', tipo: 'repuesto', descripcion: 'Pantalla', cantidad: 2, estado: requestState, fulfillment_mode: mode, inventario_id: 'inventory-1' }],
    Inventario: [{ id: 'inventory-1', organization_id: 'org-a', branch_id: 'branch-a', nombre: 'Pantalla', cantidad_disponible: stock, cantidad_reservada: 0 }],
    InventarioReserva: [],
    InventarioHistorial: [],
    AuditEvent: [],
  };
  const counters = {};
  const entity = name => ({
    async filter(query, sort, limit) { return (collections[name] || []).filter(row => matches(row, query)).slice(0, limit || 999).map(row => structuredClone(row)); },
    async create(data) { counters[name] = (counters[name] || 0) + 1; const row = { id: `${name.toLowerCase()}-${counters[name]}`, ...structuredClone(data) }; collections[name].push(row); return structuredClone(row); },
    async updateMany(query, update) { const rows = collections[name].filter(row => matches(row, query)); rows.forEach(row => { Object.assign(row, structuredClone(update.$set || {})); for (const field of Object.keys(update.$unset || {})) delete row[field]; }); return { updated: rows.length }; },
    async update(id, data) { const row = collections[name].find(item => item.id === id); Object.assign(row, structuredClone(data)); return structuredClone(row); },
    async delete(id) { const index = collections[name].findIndex(row => row.id === id); if (index >= 0) collections[name].splice(index, 1); },
  });
  const entities = Object.fromEntries(Object.keys(collections).map(name => [name, entity(name)]));
  const client = {
    auth: { me: async () => ({ id: 'inventory-user', email: 'inventory@test' }) },
    asServiceRole: { entities },
    functions: { invoke: async () => ({ data: { success: true, lease: { token: 'test-lease' } } }) },
  };
  return { client, collections };
}

function handler(client) {
  const executable = source
    .replace(/^import[\s\S]*?;\s*/gmu, '')
    .replace('Deno.serve(async req => {', 'globalThis.__handler = async req => {')
    .replace(/\}\);\s*$/u, '};');
  const context = { __client: client, resolveAuthorizedContext, authorizeRecordBranch, executeInventoryCommand, appendAuditEvent, evaluateCommandPolicyWithShadow, ExecuteSovereignCommand, crypto: webcrypto, TextEncoder, Request, Response, structuredClone, console };
  context.globalThis = context;
  vm.runInNewContext(`const createClientFromRequest = () => globalThis.__client;\n${executable}`, context, { filename: 'technicalRequestCommand/entry.ts' });
  return context.__handler;
}

async function fulfill(target, operationKey = 'request-fulfill-1') {
  const response = await handler(target.client)(new Request('https://test/technicalRequestCommand', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'FULFILL', request_id: 'request-1', inventory_id: 'inventory-1', operation_key: operationKey }) }));
  return { status: response.status, body: await response.json() };
}

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('fulfillment reserves then consumes and persists ledger references', async () => {
  const target = scenario();
  const result = await fulfill(target);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(target.collections.SolicitudTecnica[0].estado, 'fulfilled');
  assert.deepEqual([target.collections.Inventario[0].cantidad_disponible, target.collections.Inventario[0].cantidad_reservada], [3, 0]);
  assert.deepEqual(target.collections.InventarioHistorial.map(row => row.movement_type), ['RESERVE', 'CONSUME']);
  assert.ok(target.collections.SolicitudTecnica[0].inventory_reservation_id);
  assert.ok(target.collections.SolicitudTecnica[0].inventory_movement_id);
  assert.equal(target.collections.AuditEvent.filter(event => event.event_type === 'TECHNICAL_REQUEST_FULFILLED').length, 1);
  assert.equal(target.collections.AuditEvent.filter(event => event.event_type === 'INVENTORY_COMMAND_COMMITTED').length, 2);
});

test('same operation replay is idempotent and never consumes twice', async () => {
  const target = scenario();
  const first = await fulfill(target, 'same-operation');
  const replay = await fulfill(target, 'same-operation');
  assert.equal(first.status, 200);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.idempotent, true);
  assert.equal(target.collections.Inventario[0].cantidad_disponible, 3);
  assert.equal(target.collections.InventarioHistorial.length, 2);
});

test('concurrent different claims allow at most one stock commit', async () => {
  const target = scenario();
  const [left, right] = await Promise.all([fulfill(target, 'operation-left'), fulfill(target, 'operation-right')]);
  assert.deepEqual([left.status, right.status].sort(), [200, 409]);
  assert.equal(target.collections.Inventario[0].cantidad_disponible, 3);
  assert.equal(target.collections.InventarioHistorial.filter(row => row.movement_type === 'CONSUME').length, 1);
});

test('insufficient stock fails without ledger or projection mutation', async () => {
  const target = scenario({ stock: 1 });
  const result = await fulfill(target);
  assert.equal(result.status, 409);
  assert.equal(target.collections.Inventario[0].cantidad_disponible, 1);
  assert.equal(target.collections.InventarioHistorial.length, 0);
  assert.equal(target.collections.SolicitudTecnica[0].estado, 'requested');
});

test('branch-scoped inventory actor cannot fulfill another branch', async () => {
  const target = scenario({ memberBranch: 'branch-b' });
  const result = await fulfill(target);
  assert.equal(result.status, 403);
  assert.equal(target.collections.InventarioHistorial.length, 0);
});

test('new spend requires approved state before inventory fulfillment', async () => {
  const pending = scenario({ mode: 'NEW_SPEND', requestState: 'requested' });
  assert.equal((await fulfill(pending)).status, 409);
  const approved = scenario({ mode: 'NEW_SPEND', requestState: 'approved' });
  assert.equal((await fulfill(approved)).status, 200);
  assert.ok(gatewaySource.includes('TECHNICAL_REQUEST_COMMAND_REQUIRED'));
});

for (const item of tests) { await item.run(); console.log(`PASS ${item.name}`); }
console.log(`\n${tests.length}/6 technical request contract groups PASS`);
