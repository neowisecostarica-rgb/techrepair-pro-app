import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {
  assertPersistedTotalsMatch,
  calculateCommercialTotals,
  quoteDecisionIsCommitted,
  quoteDecisionOperationKey,
} from '../base44/functions/_shared/commercialIntegrity.ts';

const transitionSource = await readFile(
  new URL('../base44/functions/transitionWorkOrderStatus/entry.ts', import.meta.url),
  'utf8',
);
const gatewaySource = await readFile(
  new URL('../base44/functions/operationalGateway/entry.ts', import.meta.url),
  'utf8',
);
const saleSource = await readFile(
  new URL('../base44/functions/createSale/entry.ts', import.meta.url),
  'utf8',
);

function matches(record, query) {
  return Object.entries(query || {}).every(([field, expected]) => {
    if (field === '$or') return expected.some(candidate => matches(record, candidate));
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$exists' in expected) return Object.hasOwn(record, field) === expected.$exists;
      if ('$in' in expected) return expected.$in.includes(record[field]);
    }
    if (expected === null) return record[field] == null;
    return record[field] === expected;
  });
}

function applyUpdate(record, update) {
  Object.assign(record, structuredClone(update.$set || {}));
  for (const field of Object.keys(update.$unset || {})) delete record[field];
}

function createScenario({ eventFailures = 0, ambiguousQuoteCommits = 0 } = {}) {
  const collections = {
    Cotizacion: [{
      id: 'quote-1', organization_id: 'org-a', branch_id: 'branch-a', cliente_id: 'client-1',
      orden_trabajo_id: 'ot-1', diagnostico_tecnico_id: 'diagnostic-1',
      public_access_token: 'cot_contract_token_123456789', estado: 'enviada',
      items: [{
        tipo: 'servicio', referencia_id: 'service-1', descripcion: 'Reparacion',
        cantidad: 1, precio_unitario: 100, descuento_porcentaje: 0, subtotal: 100,
      }],
      subtotal: 100, descuento_total: 0, impuesto: 13, total: 113,
    }],
    OrdenTrabajo: [{
      id: 'ot-1', organization_id: 'org-a', branch_id: 'branch-a', cliente_id: 'client-1',
      estado: 'COTIZADA', codigo_ot: 'OT-COMMERCIAL-1',
    }],
    DiagnosticoDocumento: [{
      id: 'document-1', organization_id: 'org-a', diagnostico_id: 'diagnostic-1', estado: 'ENVIADO',
      aprobacion_status: 'PENDIENTE',
    }],
    OTEvent: [],
  };
  let remainingEventFailures = eventFailures;
  let remainingAmbiguousQuoteCommits = ambiguousQuoteCommits;

  function entity(name) {
    return {
      async filter(query, sort, limit) {
        return collections[name]
          .filter(record => matches(record, query))
          .slice(0, limit || collections[name].length)
          .map(record => structuredClone(record));
      },
      async updateMany(query, update) {
        const targets = collections[name].filter(record => matches(record, query));
        targets.forEach(record => applyUpdate(record, update));
        if (name === 'Cotizacion'
          && update.$set?.decision_status === 'COMMITTED'
          && remainingAmbiguousQuoteCommits > 0) {
          remainingAmbiguousQuoteCommits -= 1;
          throw new Error('simulated ambiguous quote commit response');
        }
        return { updated: targets.length };
      },
      async update(id, data) {
        const record = collections[name].find(candidate => candidate.id === id);
        if (!record) throw new Error(`${name} ${id} not found`);
        Object.assign(record, structuredClone(data));
        return structuredClone(record);
      },
      async create(data) {
        if (name === 'OTEvent' && remainingEventFailures > 0) {
          remainingEventFailures -= 1;
          throw new Error('simulated OTEvent failure');
        }
        const record = { id: `${name.toLowerCase()}-${collections[name].length + 1}`, ...structuredClone(data) };
        collections[name].push(record);
        return structuredClone(record);
      },
    };
  }

  const entities = Object.fromEntries(Object.keys(collections).map(name => [name, entity(name)]));
  return {
    collections,
    client: {
      auth: { me: async () => null },
      asServiceRole: { entities },
    },
  };
}

function loadHandler(client) {
  const executable = transitionSource
    .replace(/^import[\s\S]*?;\s*/gmu, '')
    .replace('Deno.serve(async (req) => {', 'globalThis.__handler = async (req) => {')
    .replace(/\}\);\s*$/u, '};');
  const context = {
    __createClientFromRequest: () => client,
    resolveAuthorizedContext: async () => ({ ok: false }),
    authorizeRecordBranch: () => ({ ok: false }),
    evaluateCurrentQaEvidence: async () => ({ valid: false }),
    assertPersistedTotalsMatch,
    calculateCommercialTotals,
    quoteDecisionIsCommitted,
    quoteDecisionOperationKey,
    console,
    crypto: webcrypto,
    Request,
    Response,
    structuredClone,
  };
  context.globalThis = context;
  vm.runInNewContext(
    `const createClientFromRequest = globalThis.__createClientFromRequest;\n${executable}`,
    context,
    { filename: 'transitionWorkOrderStatus/entry.ts' },
  );
  return context.__handler;
}

async function decide(handler, newStatus = 'APROBADA') {
  const response = await handler(new Request('https://example.test/transitionWorkOrderStatus', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.10' },
    body: JSON.stringify({ customer_token: 'cot_contract_token_123456789', newStatus }),
  }));
  return { status: response.status, body: await response.json() };
}

const tests = [];
function test(name, run) { tests.push({ name, run }); }

test('approval atomically commits quote, immutable snapshot, OT, evidence and one event', async () => {
  const scenario = createScenario();
  const result = await decide(loadHandler(scenario.client));
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(scenario.collections.Cotizacion[0].decision_status, 'COMMITTED');
  assert.equal(scenario.collections.Cotizacion[0].estado, 'aprobada');
  assert.equal(scenario.collections.Cotizacion[0].contenido_aprobado_snapshot.total, 113);
  assert.equal(scenario.collections.OrdenTrabajo[0].estado, 'APROBADA');
  assert.equal(scenario.collections.DiagnosticoDocumento[0].aprobacion_status, 'APROBADA');
  assert.equal(scenario.collections.OTEvent.length, 1);
});

test('replay is idempotent and cannot duplicate the lifecycle event', async () => {
  const scenario = createScenario();
  const handler = loadHandler(scenario.client);
  const first = await decide(handler);
  const replay = await decide(handler);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.idempotent, true);
  assert.equal(scenario.collections.OTEvent.length, 1);
});

test('partial failure remains recoverable and retry completes the same decision', async () => {
  const scenario = createScenario({ eventFailures: 1 });
  const handler = loadHandler(scenario.client);
  const failed = await decide(handler);
  assert.equal(failed.status, 500, JSON.stringify(failed.body));
  assert.equal(scenario.collections.Cotizacion[0].decision_status, 'PENDING');
  assert.equal(scenario.collections.OrdenTrabajo[0].estado, 'APROBADA');
  assert.equal(scenario.collections.OTEvent.length, 0);

  const recovered = await decide(handler);
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  assert.equal(scenario.collections.Cotizacion[0].decision_status, 'COMMITTED');
  assert.equal(scenario.collections.OTEvent.length, 1);
});

test('an ambiguous final quote commit is reconciled without reporting a false failure', async () => {
  const scenario = createScenario({ ambiguousQuoteCommits: 1 });
  const result = await decide(loadHandler(scenario.client));
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(scenario.collections.Cotizacion[0].decision_status, 'COMMITTED');
  assert.equal(scenario.collections.OTEvent.length, 1);
});

test('simultaneous decisions serialize on the persisted lifecycle lock', async () => {
  const scenario = createScenario();
  const handler = loadHandler(scenario.client);
  const [left, right] = await Promise.all([decide(handler), decide(handler)]);
  assert.deepEqual([left.status, right.status].sort(), [200, 409]);
  const retry = left.status === 409 ? await decide(handler) : await decide(handler);
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(scenario.collections.OTEvent.length, 1);
});

test('a conflicting public decision cannot overwrite an approved quote', async () => {
  const scenario = createScenario();
  const handler = loadHandler(scenario.client);
  await decide(handler);
  const conflict = await decide(handler, 'CANCELADA');
  assert.equal(conflict.status, 409, JSON.stringify(conflict.body));
  assert.equal(conflict.body.code, 'PUBLIC_QUOTE_DECISION_CONFLICT');
  assert.equal(scenario.collections.Cotizacion[0].estado, 'aprobada');
});

test('source contract closes generic final-state, conversion and client token writes', () => {
  assert.match(gatewaySource, /Una cotizacion nueva siempre inicia en borrador/);
  assert.match(gatewaySource, /calculateCommercialTotals\(data\.items \|\| current\?\.items \|\| \[\]\)/);
  assert.match(gatewaySource, /\['aprobada', 'rechazada', 'vencida'\]\.includes\(data\.estado\)/);
  assert.match(gatewaySource, /conversion de cotizacion solo puede materializarse mediante createSale/);
  assert.match(gatewaySource, /cot_\$\{crypto\.randomUUID\(\)\}/);
  assert.match(saleSource, /quote\.decision_status !== 'COMMITTED'/);
  assert.match(saleSource, /calculateCommercialTotals\(sourceItems\)/);
  assert.match(transitionSource, /handlePublicCustomerDecisionV2/);
  assert.match(transitionSource, /decision_status: 'PENDING'/);
  assert.match(transitionSource, /decision_status: 'COMMITTED'/);
});

let passed = 0;
for (const current of tests) {
  try {
    await current.run();
    passed += 1;
    console.log(`PASS ${current.name}`);
  } catch (error) {
    console.error(`FAIL ${current.name}`);
    throw error;
  }
}
console.log(`\n${passed}/${tests.length} commercial integrity acceptance tests passed.`);
