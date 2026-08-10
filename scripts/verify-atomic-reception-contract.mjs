import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { isCanonicalActiveUserAccount, resolveAuthorizedContext } from '../base44/functions/_shared/userAuthorization.ts';
import {
  getCanonicalBranchScope,
  validateRequestedBranch,
} from '../base44/functions/_shared/operationalAuthorization.ts';

const backendPath = new URL('../base44/functions/createWorkOrder/entry.ts', import.meta.url);
const lockBackendPath = new URL('../base44/functions/resourceLockLite/entry.ts', import.meta.url);
const pagePath = new URL('../src/pages/OrdenesTrabajo.jsx', import.meta.url);
const helperPath = new URL('../src/components/ot/crearOrdenTrabajo.jsx', import.meta.url);
const [backendSource, lockBackendSource, pageSource, helperSource] = await Promise.all([
  readFile(backendPath, 'utf8'),
  readFile(lockBackendPath, 'utf8'),
  readFile(pagePath, 'utf8'),
  readFile(helperPath, 'utf8'),
]);

function matches(record, query) {
  return Object.entries(query || {}).every(([field, expected]) => {
    if (field === '$or') return expected.some(candidate => matches(record, candidate));
    if (expected && typeof expected === 'object') {
      if ('$in' in expected) return expected.$in.includes(record[field]);
      if ('$exists' in expected) return Object.hasOwn(record, field) === expected.$exists;
    }
    if (expected === null) return record[field] == null;
    return record[field] === expected;
  });
}

function applyUpdate(record, update) {
  Object.assign(record, update.$set || {});
  for (const field of Object.keys(update.$unset || {})) delete record[field];
}

function createScenario({
  existingEquipment = null,
  failCreate = null,
  injectExternalEquipmentReferenceOnFailure = false,
  clientOrg = 'org-a',
  branchOrg = 'org-a',
  branchActive = true,
} = {}) {
  const collections = {
    OperationLock: [],
    Cliente: [
      { id: 'client-1', organization_id: clientOrg, nombre_completo: 'Cliente QA 1', identificacion: 'QA-1', telefono: '8888-0001' },
      { id: 'client-2', organization_id: 'org-a', nombre_completo: 'Cliente QA 2', identificacion: 'QA-2', telefono: '8888-0002' },
    ],
    Branch: [{ id: 'branch-1', organization_id: branchOrg, active: branchActive, name: 'Central' }],
    TerminosYCondiciones: [{ id: 'terms-1', organization_id: 'org-a', activo: true, version: 'v1', texto: 'Términos QA' }],
    Equipo: existingEquipment ? [{ organization_id: 'org-a', cliente_id: 'client-1', ...existingEquipment }] : [],
    OrdenTrabajo: [],
    DiagnosticMasterRecord: [],
    OTEvent: [],
    SuperAdminAudit: [],
    UserAccount: [{
      id: 'account-1',
      user_id: 'user-1',
      organization_id: 'org-a',
      branch_id: 'branch-1',
      role: 'ORG_ADMIN',
      status: 'active',
      active: true,
    }],
  };
  const counters = Object.fromEntries(Object.keys(collections).map(name => [name, 0]));

  function handler(name) {
    return {
      async filter(query, sort, limit) {
        let result = collections[name].filter(record => matches(record, query));
        if (sort) {
          const descending = String(sort).startsWith('-');
          const field = String(sort).replace(/^[-+]/, '');
          result = result.toSorted((left, right) => {
            const comparison = String(left[field] || '').localeCompare(String(right[field] || ''));
            return descending ? -comparison : comparison;
          });
        }
        return result.slice(0, limit || result.length).map(record => structuredClone(record));
      },
      async create(data) {
        if (failCreate === name) {
          if (injectExternalEquipmentReferenceOnFailure && collections.Equipo[0]) {
            collections.OrdenTrabajo.push({
              id: 'external-work-order',
              organization_id: 'org-a',
              cliente_id: 'client-1',
              equipo_id: collections.Equipo[0].id,
              reception_correlation_id: '22222222-2222-4222-8222-222222222222',
            });
          }
          throw new Error(`simulated ${name} create failure`);
        }
        counters[name] += 1;
        const record = {
          id: `${name.toLowerCase()}-${counters[name]}`,
          created_date: new Date().toISOString(),
          ...structuredClone(data),
        };
        collections[name].push(record);
        return structuredClone(record);
      },
      async updateMany(query, update) {
        const targets = collections[name].filter(record => matches(record, query));
        targets.forEach(record => applyUpdate(record, update));
        return { success: true, updated: targets.length, has_more: false };
      },
      async delete(id) {
        const index = collections[name].findIndex(record => record.id === id);
        if (index >= 0) collections[name].splice(index, 1);
        return { success: index >= 0 };
      },
    };
  }

  const entities = Object.fromEntries(Object.keys(collections).map(name => [name, handler(name)]));
  const client = {
    auth: { me: async () => ({ id: 'user-1', organization_id: 'org-a', email: 'qa@example.com' }) },
    asServiceRole: { entities },
    functions: { invoke: async () => { throw new Error('Resource Lock Lite is not initialized'); } },
  };
  return { client, collections };
}

function loadServerHandler(source, client, filename) {
  const executable = source
    .replace(/^import .*?;\s*/gmu, '')
    .replace('Deno.serve(async (req) => {', 'globalThis.__handler = async (req) => {')
    .replace(/\}\);\s*$/u, '};');
  const context = {
    __createClientFromRequest: () => client,
    console,
    crypto: webcrypto,
    TextEncoder,
    Request,
    Response,
    structuredClone,
    setTimeout,
    isCanonicalActiveUserAccount,
    resolveAuthorizedContext,
    getCanonicalBranchScope,
    validateRequestedBranch,
  };
  context.globalThis = context;
  vm.runInNewContext(`const createClientFromRequest = globalThis.__createClientFromRequest;\n${executable}`, context, { filename });
  return context.__handler;
}

function loadHandler(client) {
  const lockHandler = loadServerHandler(lockBackendSource, client, 'resourceLockLite/entry.ts');
  client.functions.invoke = async (name, payload) => {
    if (name !== 'resourceLockLite') throw new Error(`Unexpected nested function: ${name}`);
    const response = await lockHandler(new Request('https://example.test/resourceLockLite', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }));
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.message);
      error.data = data;
      error.status = response.status;
      error.code = data.code;
      throw error;
    }
    return { data };
  };
  return loadServerHandler(backendSource, client, 'createWorkOrder/entry.ts');
}

const baseCorrelation = '11111111-1111-4111-8111-111111111111';

function validPayload(overrides = {}) {
  return {
    correlation_id: baseCorrelation,
    cliente_id: 'client-1',
    branch_id: 'branch-1',
    equipment_mode: 'create',
    equipment: {
      tipo: 'laptop',
      marca: 'Lenovo',
      modelo: 'ThinkPad E14',
      serie: 'QA-SERIAL-001',
      estado_fisico: 'bueno',
    },
    terms_id: 'terms-1',
    motivo_ingreso: 'No enciende',
    ...overrides,
  };
}

function concurrentPayload({ clientId, correlationId, serial }) {
  return validPayload({
    cliente_id: clientId,
    correlation_id: correlationId,
    equipment: {
      tipo: 'laptop',
      marca: 'Lenovo',
      modelo: `Modelo ${clientId}`,
      serie: serial,
      estado_fisico: 'bueno',
    },
  });
}

async function invoke(handler, payload) {
  const response = await handler(new Request('https://example.test/createWorkOrder', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }));
  return { status: response.status, body: await response.json() };
}

const tests = [];
function test(name, run) { tests.push({ name, run }); }

test('1. new reception creates exactly one complete aggregate', async () => {
  const scenario = createScenario();
  const result = await invoke(loadHandler(scenario.client), validPayload());
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.success, true);
  assert.equal(scenario.collections.Equipo.length, 1);
  assert.equal(scenario.collections.OrdenTrabajo.length, 1);
  assert.equal(scenario.collections.DiagnosticMasterRecord.length, 1);
  assert.equal(scenario.collections.OTEvent.length, 1);
});

test('2. existing equipment is reused and never recreated', async () => {
  const scenario = createScenario({ existingEquipment: { id: 'equipment-existing', tipo: 'laptop', marca: 'Dell', serie: 'EXIST-1' } });
  const result = await invoke(loadHandler(scenario.client), validPayload({
    equipment_mode: 'existing',
    equipo_id: 'equipment-existing',
    equipment: undefined,
  }));
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.equipment.created, false);
  assert.equal(scenario.collections.Equipo.length, 1);
});

test('3. duplicate serial fails before creating any aggregate', async () => {
  const scenario = createScenario({ existingEquipment: { id: 'equipment-existing', tipo: 'laptop', marca: 'Dell', serie: 'QA-SERIAL-001' } });
  const result = await invoke(loadHandler(scenario.client), validPayload());
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'RECEPTION_SERIAL_CONFLICT');
  assert.equal(scenario.collections.OrdenTrabajo.length, 0);
});

test('4. work-order failure compensates newly created equipment', async () => {
  const scenario = createScenario({ failCreate: 'OrdenTrabajo' });
  const result = await invoke(loadHandler(scenario.client), validPayload());
  assert.equal(result.status, 500);
  assert.equal(result.body.code, 'RECEPTION_WORK_ORDER_CREATE_FAILED');
  assert.equal(result.body.compensation.status, 'SUCCEEDED');
  assert.equal(scenario.collections.Equipo.length, 0);
  assert.equal(scenario.collections.OrdenTrabajo.length, 0);
});

test('5. DMR failure compensates work order and new equipment', async () => {
  const scenario = createScenario({ failCreate: 'DiagnosticMasterRecord' });
  const result = await invoke(loadHandler(scenario.client), validPayload());
  assert.equal(result.status, 500);
  assert.equal(result.body.code, 'RECEPTION_DMR_CREATE_FAILED');
  assert.equal(result.body.compensation.status, 'SUCCEEDED');
  assert.equal(scenario.collections.Equipo.length, 0);
  assert.equal(scenario.collections.OrdenTrabajo.length, 0);
  assert.equal(scenario.collections.DiagnosticMasterRecord.length, 0);
});

test('6. retry after an ambiguous response returns the same aggregate', async () => {
  const scenario = createScenario();
  const handler = loadHandler(scenario.client);
  const first = await invoke(handler, validPayload());
  const retry = await invoke(handler, validPayload());
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.idempotent, true);
  assert.equal(retry.body.work_order.id, first.body.work_order.id);
  assert.equal(scenario.collections.OrdenTrabajo.length, 1);
});

test('7. concurrent double submit persists at most one aggregate', async () => {
  const scenario = createScenario();
  const handler = loadHandler(scenario.client);
  const results = await Promise.all([
    invoke(handler, validPayload()),
    invoke(handler, validPayload()),
  ]);
  assert.ok(results.some(result => result.status === 200));
  assert.equal(scenario.collections.Equipo.length, 1);
  assert.equal(scenario.collections.OrdenTrabajo.length, 1);
  assert.equal(scenario.collections.DiagnosticMasterRecord.length, 1);
  assert.equal(scenario.collections.OTEvent.length, 1);
});

test('8. cross-tenant client is rejected without writes', async () => {
  const scenario = createScenario({ clientOrg: 'org-b' });
  const result = await invoke(loadHandler(scenario.client), validPayload());
  assert.equal(result.status, 404);
  assert.equal(result.body.code, 'RECEPTION_CLIENT_NOT_FOUND');
  assert.equal(scenario.collections.Equipo.length, 0);
});

test('9. invalid branch is rejected before the lock and writes', async () => {
  const scenario = createScenario({ branchOrg: 'org-b' });
  const result = await invoke(loadHandler(scenario.client), validPayload());
  assert.equal(result.status, 400);
  assert.equal(result.body.code, 'RECEPTION_BRANCH_INVALID');
  assert.equal(scenario.collections.OperationLock.length, 0);
});

test('10. UI consumes Base44Error.data and renders persistent reference', () => {
  assert.match(pageSource, /error\?\.data \|\| error\?\.response\?\.data/u);
  assert.match(pageSource, /receptionError\.correlationId/u);
  assert.match(pageSource, /Referencia:/u);
});

test('11. success response drives navigation to the created record', async () => {
  const scenario = createScenario();
  const result = await invoke(loadHandler(scenario.client), validPayload());
  assert.equal(result.body.navigate_to, `/expediente/${result.body.work_order.id}`);
  assert.match(pageSource, /navigate\(result\.navigate_to\)/u);
});

test('12. controlled failures leave zero orphan equipment', async () => {
  for (const failCreate of ['OrdenTrabajo', 'DiagnosticMasterRecord', 'OTEvent']) {
    const scenario = createScenario({ failCreate });
    await invoke(loadHandler(scenario.client), validPayload());
    const referenced = new Set(scenario.collections.OrdenTrabajo.map(order => order.equipo_id));
    const orphans = scenario.collections.Equipo.filter(equipment =>
      equipment.created_by_reception && !referenced.has(equipment.id)
    );
    assert.equal(orphans.length, 0, `orphan after ${failCreate} failure`);
  }
});

test('13. event failure compensates DMR, work order, and new equipment', async () => {
  const scenario = createScenario({ failCreate: 'OTEvent' });
  const result = await invoke(loadHandler(scenario.client), validPayload());
  assert.equal(result.body.compensation.status, 'SUCCEEDED');
  assert.equal(result.body.code, 'RECEPTION_EVENT_CREATE_FAILED');
  assert.equal(scenario.collections.DiagnosticMasterRecord.length, 0);
  assert.equal(scenario.collections.OrdenTrabajo.length, 0);
  assert.equal(scenario.collections.Equipo.length, 0);
});

test('14. compensation never deletes pre-existing equipment', async () => {
  const scenario = createScenario({
    existingEquipment: { id: 'equipment-existing', tipo: 'laptop', marca: 'Dell', serie: 'EXIST-1' },
    failCreate: 'DiagnosticMasterRecord',
  });
  const result = await invoke(loadHandler(scenario.client), validPayload({
    equipment_mode: 'existing',
    equipo_id: 'equipment-existing',
    equipment: undefined,
  }));
  assert.equal(result.body.compensation.status, 'SUCCEEDED');
  assert.equal(scenario.collections.Equipo.length, 1);
  assert.equal(scenario.collections.Equipo[0].id, 'equipment-existing');
});

test('15. frontend sends one orchestrator request and never createEquipment', () => {
  const submitSection = pageSource.slice(pageSource.indexOf('const handleSubmit'), pageSource.indexOf('const handleCopiarLink'));
  assert.doesNotMatch(submitSection, /createEquipment/u);
  assert.match(helperSource, /correlation_id: datosOT\.correlation_id/u);
  assert.match(helperSource, /equipment_mode: datosOT\.equipment_mode/u);
});

test('16. compensation preserves a newly created equipment referenced by another work order', async () => {
  const scenario = createScenario({
    failCreate: 'DiagnosticMasterRecord',
    injectExternalEquipmentReferenceOnFailure: true,
  });
  const result = await invoke(loadHandler(scenario.client), validPayload());
  assert.equal(result.body.compensation.status, 'SUCCEEDED');
  assert.equal(scenario.collections.Equipo.length, 1);
  assert.ok(result.body.compensation.preserved.some(item => item.includes('referenced_by_other_work_order')));
});

test('17. reusing a correlation with different data is rejected', async () => {
  const scenario = createScenario();
  const handler = loadHandler(scenario.client);
  const first = await invoke(handler, validPayload());
  const conflict = await invoke(handler, validPayload({ motivo_ingreso: 'Pantalla rota' }));
  assert.equal(first.status, 200);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, 'RECEPTION_IDEMPOTENCY_CONFLICT');
  assert.equal(scenario.collections.OrdenTrabajo.length, 1);
});

test('18. different clients and different serials complete concurrently without false conflicts', async () => {
  const scenario = createScenario();
  const handler = loadHandler(scenario.client);
  const results = await Promise.all([
    invoke(handler, concurrentPayload({
      clientId: 'client-1',
      correlationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      serial: 'SERIAL-A',
    })),
    invoke(handler, concurrentPayload({
      clientId: 'client-2',
      correlationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      serial: 'SERIAL-B',
    })),
  ]);
  assert.deepEqual(results.map(result => result.status).toSorted(), [200, 200]);
  assert.equal(scenario.collections.OrdenTrabajo.length, 2);
  assert.equal(new Set(scenario.collections.OrdenTrabajo.map(order => order.codigo_ot)).size, 2);
  assert.equal(new Set(scenario.collections.DiagnosticMasterRecord.map(dmr => dmr.dmr_number)).size, 2);
  assert.equal(scenario.collections.OTEvent.length, 2);
  assert.equal(scenario.collections.Equipo.length, 2);
  assert.equal(scenario.collections.OperationLock.filter(lock => lock.status === 'ACTIVE').length, 0);
  const firstLeaseResources = scenario.collections.OperationLock
    .filter(lock => lock.correlation_id === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    .map(lock => lock.resource);
  assert.deepEqual(firstLeaseResources, firstLeaseResources.toSorted());
});

test('19. different clients and the same serial produce one aggregate and one controlled conflict', async () => {
  const scenario = createScenario();
  const handler = loadHandler(scenario.client);
  const results = await Promise.all([
    invoke(handler, concurrentPayload({
      clientId: 'client-1',
      correlationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      serial: 'SERIAL-X',
    })),
    invoke(handler, concurrentPayload({
      clientId: 'client-2',
      correlationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      serial: 'SERIAL-X',
    })),
  ]);
  assert.deepEqual(results.map(result => result.status).toSorted(), [200, 409]);
  assert.equal(results.find(result => result.status === 409).body.code, 'RECEPTION_SERIAL_CONFLICT');
  assert.equal(scenario.collections.Equipo.filter(equipment => equipment.serie === 'SERIAL-X').length, 1);
  assert.equal(scenario.collections.OrdenTrabajo.length, 1);
  assert.equal(scenario.collections.DiagnosticMasterRecord.length, 1);
  assert.equal(scenario.collections.OTEvent.length, 1);
});

test('20. same client and different serials serialize and both complete', async () => {
  const scenario = createScenario();
  const handler = loadHandler(scenario.client);
  const results = await Promise.all([
    invoke(handler, concurrentPayload({
      clientId: 'client-1',
      correlationId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      serial: 'SERIAL-C',
    })),
    invoke(handler, concurrentPayload({
      clientId: 'client-1',
      correlationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      serial: 'SERIAL-D',
    })),
  ]);
  assert.deepEqual(results.map(result => result.status).toSorted(), [200, 200]);
  assert.equal(scenario.collections.Equipo.length, 2);
  assert.equal(scenario.collections.OrdenTrabajo.length, 2);
});

test('21. same client and same serial produce one aggregate only', async () => {
  const scenario = createScenario();
  const handler = loadHandler(scenario.client);
  const results = await Promise.all([
    invoke(handler, concurrentPayload({
      clientId: 'client-1',
      correlationId: '12345678-1234-4234-8234-1234567890ab',
      serial: 'SERIAL-Z',
    })),
    invoke(handler, concurrentPayload({
      clientId: 'client-1',
      correlationId: '87654321-4321-4321-8321-ba0987654321',
      serial: 'SERIAL-Z',
    })),
  ]);
  assert.deepEqual(results.map(result => result.status).toSorted(), [200, 409]);
  assert.equal(scenario.collections.Equipo.length, 1);
  assert.equal(scenario.collections.OrdenTrabajo.length, 1);
});

test('22. acquisition timeout is bounded and leaves no partial aggregate', async () => {
  const scenario = createScenario();
  scenario.collections.OperationLock.push({
    id: 'busy-client-lock',
    organization_id: 'org-a',
    operation: 'RECEPTION_CREATE',
    resource: 'client:client-1',
    correlation_id: '99999999-9999-4999-8999-999999999999',
    request_fingerprint: 'busy',
    locked_by: 'other-owner',
    locked_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    status: 'ACTIVE',
  });
  const result = await invoke(loadHandler(scenario.client), validPayload({ lock_timeout_ms: 1 }));
  assert.equal(result.status, 423);
  assert.equal(result.body.code, 'LOCK_ACQUIRE_TIMEOUT');
  assert.equal(result.body.retryable, true);
  assert.equal(scenario.collections.Equipo.length, 0);
  assert.equal(scenario.collections.OrdenTrabajo.length, 0);
});

test('23. correlations sharing the former truncated prefix still produce unique OT and DMR identifiers', async () => {
  const scenario = createScenario();
  const handler = loadHandler(scenario.client);
  const results = await Promise.all([
    invoke(handler, concurrentPayload({
      clientId: 'client-1',
      correlationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      serial: 'SERIAL-PREFIX-A',
    })),
    invoke(handler, concurrentPayload({
      clientId: 'client-2',
      correlationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',
      serial: 'SERIAL-PREFIX-B',
    })),
  ]);
  assert.deepEqual(results.map(result => result.status).toSorted(), [200, 200]);
  assert.equal(new Set(results.map(result => result.body.work_order.code)).size, 2);
  assert.equal(new Set(results.map(result => result.body.dmr.number)).size, 2);
  assert.ok(results.every(result => /-[0-9A-F]{32}$/u.test(result.body.work_order.code)));
  assert.ok(results.every(result => /-[0-9A-F]{32}$/u.test(result.body.dmr.number)));
});

test('24. timeout during a partially acquired set releases the acquired resource', async () => {
  const scenario = createScenario();
  const result = await invoke(loadHandler(scenario.client), validPayload({ lock_timeout_ms: 1 }));
  assert.equal(result.status, 423);
  assert.equal(result.body.code, 'LOCK_ACQUIRE_TIMEOUT');
  assert.equal(scenario.collections.OperationLock.filter(lock => lock.status === 'ACTIVE').length, 0);
  assert.equal(scenario.collections.Equipo.length, 0);
  assert.equal(scenario.collections.OrdenTrabajo.length, 0);
});

let passed = 0;
for (const { name, run } of tests) {
  await run();
  passed += 1;
  console.log(`PASS ${name}`);
}
console.log(`\n${passed}/${tests.length} atomic reception contract tests passed.`);
