import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {
  applyInventoryStockCas,
  rollbackInventoryStockCas,
} from '../base44/functions/_shared/inventoryStockCas.ts';
import { resolveAuthorizedContext } from '../base44/functions/_shared/userAuthorization.ts';
import {
  getCanonicalBranchScope,
  validateRequestedBranch,
} from '../base44/functions/_shared/operationalAuthorization.ts';
import {
  assertClientFinancialHints,
  assertPersistedTotalsMatch,
  calculateCommercialTotals,
  moneyMatches,
} from '../base44/functions/_shared/commercialIntegrity.ts';

const backendPath = new URL('../base44/functions/createSale/entry.ts', import.meta.url);
const posPath = new URL('../src/pages/PuntoVenta.jsx', import.meta.url);
const [backendSource, posSource] = await Promise.all([
  readFile(backendPath, 'utf8'),
  readFile(posPath, 'utf8'),
]);

function matches(record, query) {
  return Object.entries(query || {}).every(([field, expected]) => {
    if (field === '$or') return expected.some(candidate => matches(record, candidate));
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$exists' in expected) return Object.hasOwn(record, field) === expected.$exists;
      if ('$in' in expected) return expected.$in.includes(record[field]);
      if ('$ne' in expected) return record[field] !== expected.$ne;
      if ('$lte' in expected) return record[field] <= expected.$lte;
    }
    if (expected === null) return record[field] == null;
    return record[field] === expected;
  });
}

function applyUpdate(record, update) {
  Object.assign(record, structuredClone(update.$set || {}));
  for (const field of Object.keys(update.$unset || {})) delete record[field];
}

function createScenario({ stock = 10, failure = null, preload = false, postSaleFailures = 0 } = {}) {
  const collections = {
    UserAccount: [{
      id: 'account-1', user_id: 'user-1', user_email: 'qa@example.com',
      organization_id: 'org-a', branch_id: 'branch-1', role: 'SALES', status: 'active', active: true,
    }],
    Branch: [{ id: 'branch-1', organization_id: 'org-a', name: 'Central', active: true }],
    OrdenTrabajo: [{
      id: 'ot-1', organization_id: 'org-a', branch_id: 'branch-1', cliente_id: 'client-1',
      estado: 'APROBADA', codigo_ot: 'OT-QA-1',
    }],
    Venta: preload ? [{
      id: 'sale-preload', organization_id: 'org-a', branch_id: 'branch-1', cliente_id: 'client-1',
      estado: 'borrador', total: 113, subtotal: 100, impuesto: 13, created_by_user_id: 'user-1',
    }] : [],
    VentaItem: preload ? [{
      id: 'preload-item-1', organization_id: 'org-a', venta_id: 'sale-preload', tipo: 'producto',
      referencia_id: 'inventory-1', descripcion: 'Repuesto', cantidad: 5, precio_unitario: 20, subtotal: 100,
    }] : [],
    Inventario: [{
      id: 'inventory-1', organization_id: 'org-a', categoria_id: 'category-1', nombre: 'Repuesto',
      branch_id: 'branch-1', cantidad_disponible: stock, costo_unitario: 8, precio_venta: 20,
    }],
    Servicio: [{ id: 'service-1', organization_id: 'org-a', nombre: 'Servicio', precio: 20, activo: true }],
    CategoriaInventario: [{ id: 'category-1', organization_id: 'org-a', permite_stock: true }],
    InventarioHistorial: [],
    Cotizacion: [{
      id: 'quote-1', organization_id: 'org-a', branch_id: 'branch-1', cliente_id: 'client-1',
      orden_trabajo_id: 'ot-1', estado: 'aprobada', decision_status: 'COMMITTED',
      decision_target_status: 'APROBADA', estado_conversion: 'PENDIENTE',
      total: 113, subtotal: 100, descuento_total: 0, impuesto: 13,
      items: [
        { tipo: 'producto', referencia_id: 'inventory-1', descripcion: 'Repuesto', cantidad: 2, precio_unitario: 20, descuento_porcentaje: 0, subtotal: 40 },
        { tipo: 'producto', referencia_id: 'inventory-1', descripcion: 'Repuesto', cantidad: 3, precio_unitario: 20, descuento_porcentaje: 0, subtotal: 60 },
      ],
      contenido_aprobado_snapshot: {
        items: [
          { tipo: 'producto', referencia_id: 'inventory-1', descripcion: 'Repuesto', cantidad: 2, precio_unitario: 20, descuento_porcentaje: 0, subtotal: 40 },
          { tipo: 'producto', referencia_id: 'inventory-1', descripcion: 'Repuesto', cantidad: 3, precio_unitario: 20, descuento_porcentaje: 0, subtotal: 60 },
        ],
        total: 113, subtotal: 100, descuento_total: 0, impuesto: 13,
      },
    }],
    OTEvent: [],
  };
  const counters = Object.fromEntries(Object.keys(collections).map(name => [name, collections[name].length]));
  const metrics = { transitions: 0, postSaleCalls: 0 };
  let remainingFailures = failure?.times ?? (failure ? 1 : 0);
  let remainingPostSaleFailures = postSaleFailures;

  function shouldFail(name, method, phase, payload) {
    if (!failure || remainingFailures <= 0) return false;
    if (failure.entity !== name || failure.method !== method || (failure.phase || 'before') !== phase) return false;
    if (failure.predicate && !failure.predicate(payload)) return false;
    remainingFailures -= 1;
    return true;
  }

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
        if (shouldFail(name, 'create', 'before', data)) throw new Error(`simulated ${name}.create failure`);
        counters[name] += 1;
        const record = {
          id: `${name.toLowerCase()}-${counters[name]}`,
          created_date: new Date().toISOString(),
          ...structuredClone(data),
        };
        collections[name].push(record);
        if (shouldFail(name, 'create', 'after', data)) throw new Error(`simulated ambiguous ${name}.create response`);
        return structuredClone(record);
      },
      async updateMany(query, update) {
        const payload = { query, update };
        if (shouldFail(name, 'updateMany', 'before', payload)) throw new Error(`simulated ${name}.updateMany failure`);
        const targets = collections[name].filter(record => matches(record, query));
        targets.forEach(record => applyUpdate(record, update));
        if (shouldFail(name, 'updateMany', 'after', payload)) {
          throw new Error(`simulated ambiguous ${name}.updateMany response`);
        }
        return { success: true, updated: targets.length, has_more: false };
      },
      async delete(id) {
        if (shouldFail(name, 'delete', 'before', { id })) throw new Error(`simulated ${name}.delete failure`);
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
    functions: {
      async invoke(name, { sale_id }) {
        assert.equal(name, 'processPostSaleActions');
        metrics.postSaleCalls += 1;
        if (remainingPostSaleFailures > 0) {
          remainingPostSaleFailures -= 1;
          throw new Error('simulated post-sale timeout');
        }
        const sale = collections.Venta.find(record => record.id === sale_id);
        if (!sale?.referencia_ot_id) return { data: { success: true } };
        if (!collections.OTEvent.some(event => event.sale_id === sale_id)) {
          collections.OTEvent.push({
            id: `event-${collections.OTEvent.length + 1}`,
            organization_id: sale.organization_id,
            orden_trabajo_id: sale.referencia_ot_id,
            tipo: 'SALE_COMPLETED',
            sale_id,
          });
        }
        const ot = collections.OrdenTrabajo.find(record => record.id === sale.referencia_ot_id);
        if (sale.tipo_concepto === 'reparacion' && ot.estado === 'APROBADA') {
          ot.estado = 'EN_REPARACION';
          metrics.transitions += 1;
        }
        return { data: { success: true } };
      },
    },
  };
  return { client, collections, metrics };
}

function loadHandler(client) {
  const executable = backendSource
    .replace(/^import[\s\S]*?;\s*/gmu, '')
    .replace('Deno.serve(async req => {', 'globalThis.__handler = async req => {')
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
    applyInventoryStockCas,
    rollbackInventoryStockCas,
    resolveAuthorizedContext,
    getCanonicalBranchScope,
    validateRequestedBranch,
    assertClientFinancialHints,
    assertPersistedTotalsMatch,
    calculateCommercialTotals,
    moneyMatches,
  };
  context.globalThis = context;
  vm.runInNewContext(`const createClientFromRequest = globalThis.__createClientFromRequest;\n${executable}`, context, { filename: 'createSale/entry.ts' });
  return context.__handler;
}

function repairPayload(overrides = {}) {
  const base = {
    ventaData: {
      cliente_id: 'client-1',
      origen_venta: 'taller',
      tipo_concepto: 'reparacion',
      referencia_ot_id: 'ot-1',
      cotizacion_id: 'quote-1',
      metodo_pago: 'tarjeta',
      total: 113,
      subtotal: 100,
      impuesto: 13,
      descuento_total: 0,
      branch_id: 'branch-1',
    },
    itemsCarrito: [
      { tipo: 'producto', referencia_id: 'inventory-1', descripcion: 'Repuesto', cantidad: 2, precio_unitario: 20, subtotal: 40 },
      { tipo: 'producto', referencia_id: 'inventory-1', descripcion: 'Repuesto', cantidad: 3, precio_unitario: 20, subtotal: 60 },
    ],
    cotizacionOrigenId: 'quote-1',
    ventaPreloadId: null,
    idempotency_key: 'client-random-key',
  };
  return {
    ...base,
    ...overrides,
    ventaData: { ...base.ventaData, ...(overrides.ventaData || {}) },
  };
}

function directPayload(overrides = {}) {
  const base = repairPayload({
    ventaData: {
      cliente_id: 'client-1', origen_venta: 'tienda', tipo_concepto: 'otro',
      referencia_ot_id: null, cotizacion_id: null, branch_id: 'branch-1',
      metodo_pago: 'efectivo', total: 22.6, subtotal: 20, impuesto: 2.6,
    },
    itemsCarrito: [{ tipo: 'servicio', referencia_id: 'service-1', descripcion: 'Servicio', cantidad: 1, precio_unitario: 20, subtotal: 20 }],
    cotizacionOrigenId: null,
    idempotency_key: 'direct-operation-1',
  });
  return { ...base, ...overrides, ventaData: { ...base.ventaData, ...(overrides.ventaData || {}) } };
}

async function invoke(handler, payload) {
  const response = await handler(new Request('https://example.test/createSale', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }));
  return { status: response.status, body: await response.json() };
}

const tests = [];
function test(name, run) { tests.push({ name, run }); }

test('normal OT sale commits one sale, aggregated stock, quote and event', async () => {
  const scenario = createScenario();
  const result = await invoke(loadHandler(scenario.client), repairPayload());
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.success, true);
  assert.equal(scenario.collections.Venta.length, 1);
  assert.equal(scenario.collections.Venta[0].estado, 'pagada');
  assert.equal(scenario.collections.Inventario[0].cantidad_disponible, 5);
  assert.equal(scenario.collections.InventarioHistorial.length, 1);
  assert.equal(scenario.collections.Cotizacion[0].venta_id, scenario.collections.Venta[0].id);
  assert.equal(scenario.collections.OTEvent.length, 1);
  assert.equal(scenario.metrics.transitions, 1);
});

test('sequential retry returns the same committed sale without side effects', async () => {
  const scenario = createScenario();
  const handler = loadHandler(scenario.client);
  const first = await invoke(handler, repairPayload());
  const retry = await invoke(handler, repairPayload());
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(retry.body.data.id, first.body.data.id);
  assert.equal(retry.body.idempotent, true);
  assert.equal(scenario.collections.Venta.length, 1);
  assert.equal(scenario.collections.Inventario[0].cantidad_disponible, 5);
  assert.equal(scenario.collections.InventarioHistorial.length, 1);
  assert.equal(scenario.collections.OTEvent.length, 1);
  assert.equal(scenario.metrics.transitions, 1);
});

test('transient post-sale failures retry without duplicating the commercial event', async () => {
  const scenario = createScenario({ postSaleFailures: 2 });
  const result = await invoke(loadHandler(scenario.client), repairPayload());
  assert.equal(result.body.success, true, JSON.stringify(result.body));
  assert.equal(result.body.post_sale_pending, false);
  assert.equal(scenario.metrics.postSaleCalls, 3);
  assert.equal(scenario.collections.OTEvent.length, 1);
  assert.equal(scenario.metrics.transitions, 1);
});

test('a paid sale with pending post-actions is completed by the same retry', async () => {
  const scenario = createScenario({ postSaleFailures: 3 });
  const handler = loadHandler(scenario.client);
  const committed = await invoke(handler, repairPayload());
  assert.equal(committed.body.success, true, JSON.stringify(committed.body));
  assert.equal(committed.body.post_sale_pending, true);
  assert.equal(scenario.collections.Venta.length, 1);
  assert.equal(scenario.collections.Inventario[0].cantidad_disponible, 5);
  assert.equal(scenario.collections.OTEvent.length, 0);

  const recovered = await invoke(handler, repairPayload({ idempotency_key: 'retry-after-timeout' }));
  assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
  assert.equal(recovered.body.data.id, committed.body.data.id);
  assert.equal(recovered.body.post_sale_pending, false);
  assert.equal(scenario.collections.OTEvent.length, 1);
  assert.equal(scenario.metrics.transitions, 1);
});

test('two simultaneous OT charges produce one logical result', async () => {
  const scenario = createScenario();
  const handler = loadHandler(scenario.client);
  const [left, right] = await Promise.all([
    invoke(handler, repairPayload()),
    invoke(handler, repairPayload({ idempotency_key: 'another-client-key' })),
  ]);
  assert.deepEqual([left.status, right.status].sort(), [200, 201]);
  assert.equal(left.body.data.id, right.body.data.id);
  assert.equal(scenario.collections.Venta.length, 1);
  assert.equal(scenario.collections.Inventario[0].cantidad_disponible, 5);
  assert.equal(scenario.collections.InventarioHistorial.length, 1);
  assert.equal(scenario.collections.OTEvent.length, 1);
  assert.equal(scenario.metrics.transitions, 1);
});

test('altered monetary payload is rejected before idempotency can mask tampering', async () => {
  const scenario = createScenario();
  const handler = loadHandler(scenario.client);
  await invoke(handler, repairPayload());
  const altered = repairPayload({
    idempotency_key: 'changed-client-key-cannot-bypass-business-identity',
    ventaData: { total: 136, subtotal: 120, impuesto: 16 },
    itemsCarrito: [{ tipo: 'producto', referencia_id: 'inventory-1', descripcion: 'Repuesto', cantidad: 6, precio_unitario: 20, subtotal: 120 }],
  });
  const conflict = await invoke(handler, altered);
  assert.equal(conflict.status, 409, JSON.stringify(conflict.body));
  assert.equal(conflict.body.code, 'SALE_AMOUNT_TAMPERING');
  assert.equal(scenario.collections.Venta.length, 1);
  assert.equal(scenario.collections.Inventario[0].cantidad_disponible, 5);
});

test('unit-price tampering is rejected against the approved snapshot', async () => {
  const scenario = createScenario();
  const payload = repairPayload();
  payload.itemsCarrito[0].precio_unitario = 1;
  const result = await invoke(loadHandler(scenario.client), payload);
  assert.equal(result.status, 409, JSON.stringify(result.body));
  assert.equal(result.body.code, 'SALE_PRICE_TAMPERING');
  assert.equal(scenario.collections.Venta.length, 0);
});

test('quantity tampering is rejected against the approved snapshot', async () => {
  const scenario = createScenario();
  const payload = repairPayload();
  payload.itemsCarrito[0].cantidad = 1;
  const result = await invoke(loadHandler(scenario.client), payload);
  assert.equal(result.status, 409, JSON.stringify(result.body));
  assert.equal(result.body.code, 'SALE_ITEM_TAMPERING');
});

test('discount tampering is rejected against the approved snapshot', async () => {
  const scenario = createScenario();
  const payload = repairPayload();
  payload.itemsCarrito[0].descuento_porcentaje = 50;
  const result = await invoke(loadHandler(scenario.client), payload);
  assert.equal(result.status, 409, JSON.stringify(result.body));
  assert.equal(result.body.code, 'SALE_DISCOUNT_TAMPERING');
});

test('cost injection is rejected as a server-authority violation', async () => {
  const scenario = createScenario();
  const payload = repairPayload();
  payload.itemsCarrito[0].costo_unitario = 0.01;
  const result = await invoke(loadHandler(scenario.client), payload);
  assert.equal(result.status, 409, JSON.stringify(result.body));
  assert.equal(result.body.code, 'SALE_SERVER_AUTHORITY_FIELD_FORBIDDEN');
});

test('unapproved quote cannot be converted by a direct API request', async () => {
  const scenario = createScenario();
  scenario.collections.Cotizacion[0].estado = 'enviada';
  scenario.collections.Cotizacion[0].decision_status = undefined;
  const result = await invoke(loadHandler(scenario.client), repairPayload());
  assert.equal(result.status, 409, JSON.stringify(result.body));
  assert.equal(result.body.code, 'SALE_QUOTE_NOT_APPROVED');
});

test('quote and work-order identifiers cannot be swapped by the client', async () => {
  const scenario = createScenario();
  const quoteMismatch = await invoke(loadHandler(scenario.client), repairPayload({
    cotizacionOrigenId: 'quote-other',
  }));
  assert.equal(quoteMismatch.status, 409, JSON.stringify(quoteMismatch.body));
  assert.equal(quoteMismatch.body.code, 'SALE_QUOTE_ID_MISMATCH');

  const workOrderMismatch = await invoke(loadHandler(scenario.client), repairPayload({
    ventaData: { referencia_ot_id: 'ot-other' },
  }));
  assert.equal(workOrderMismatch.status, 409, JSON.stringify(workOrderMismatch.body));
  assert.equal(workOrderMismatch.body.code, 'SALE_QUOTE_WORK_ORDER_MISMATCH');
});

test('repeated product lines validate their aggregated quantity', async () => {
  const scenario = createScenario({ stock: 4 });
  const result = await invoke(loadHandler(scenario.client), repairPayload());
  assert.equal(result.status, 400, JSON.stringify(result.body));
  assert.equal(result.body.code, 'SALE_STOCK_INSUFFICIENT');
  assert.equal(scenario.collections.Venta.length, 0);
  assert.equal(scenario.collections.VentaItem.length, 0);
  assert.equal(scenario.collections.Inventario[0].cantidad_disponible, 4);
});

test('sale creation failure leaves no inventory or financial residue and retry succeeds', async () => {
  const scenario = createScenario({ failure: { entity: 'Venta', method: 'create', phase: 'before', times: 1 } });
  const handler = loadHandler(scenario.client);
  const failed = await invoke(handler, repairPayload());
  assert.equal(failed.status, 500, JSON.stringify(failed.body));
  assert.equal(scenario.collections.Venta.length, 0);
  assert.equal(scenario.collections.Inventario[0].cantidad_disponible, 10);
  const retry = await invoke(handler, repairPayload());
  assert.equal(retry.status, 201, JSON.stringify(retry.body));
  assert.equal(scenario.collections.Venta.length, 1);
  assert.equal(scenario.collections.Inventario[0].cantidad_disponible, 5);
});

test('inventory history failure compensates stock, items and sale', async () => {
  const scenario = createScenario({ failure: { entity: 'InventarioHistorial', method: 'create', phase: 'before', times: 1 } });
  const failed = await invoke(loadHandler(scenario.client), repairPayload());
  assert.equal(failed.status, 500, JSON.stringify(failed.body));
  assert.equal(scenario.collections.Venta.length, 0);
  assert.equal(scenario.collections.VentaItem.length, 0);
  assert.equal(scenario.collections.InventarioHistorial.length, 0);
  assert.equal(scenario.collections.Inventario[0].cantidad_disponible, 10);
});

test('failure on a later product compensates every prior inventory mutation', async () => {
  const scenario = createScenario({
    failure: {
      entity: 'InventarioHistorial', method: 'create', phase: 'before', times: 1,
      predicate: data => data.inventario_id === 'inventory-2',
    },
  });
  scenario.collections.Inventario.push({
    id: 'inventory-2', organization_id: 'org-a', categoria_id: 'category-1', nombre: 'Segundo repuesto',
    branch_id: 'branch-1', cantidad_disponible: 7, costo_unitario: 4, precio_venta: 5,
  });
  const payload = directPayload({
    ventaData: { total: 124.3, subtotal: 110, impuesto: 14.3 },
    itemsCarrito: [
      { tipo: 'producto', referencia_id: 'inventory-1', descripcion: 'Repuesto', cantidad: 5, precio_unitario: 20, subtotal: 100 },
      { tipo: 'producto', referencia_id: 'inventory-2', descripcion: 'Segundo repuesto', cantidad: 2, precio_unitario: 5, subtotal: 10 },
    ],
  });
  const failed = await invoke(loadHandler(scenario.client), payload);
  assert.equal(failed.status, 500, JSON.stringify(failed.body));
  assert.deepEqual(scenario.collections.Inventario.map(item => item.cantidad_disponible), [10, 7]);
  assert.equal(scenario.collections.InventarioHistorial.length, 0);
  assert.equal(scenario.collections.Venta.length, 0);
  assert.equal(scenario.collections.VentaItem.length, 0);
});

test('ambiguous sale create response is reconciled instead of duplicated', async () => {
  const scenario = createScenario({ failure: { entity: 'Venta', method: 'create', phase: 'after', times: 1 } });
  const result = await invoke(loadHandler(scenario.client), repairPayload());
  assert.equal(result.body.success, true, JSON.stringify(result.body));
  assert.equal(scenario.collections.Venta.length, 1);
  assert.equal(scenario.collections.Inventario[0].cantidad_disponible, 5);
});

test('ambiguous inventory CAS response is reconciled by sale ownership markers', async () => {
  const scenario = createScenario({
    failure: {
      entity: 'Inventario', method: 'updateMany', phase: 'after', times: 1,
      predicate: ({ update }) => update.$set?.last_sale_id,
    },
  });
  const result = await invoke(loadHandler(scenario.client), repairPayload());
  assert.equal(result.body.success, true, JSON.stringify(result.body));
  assert.equal(scenario.collections.Inventario[0].cantidad_disponible, 5);
  assert.equal(scenario.collections.InventarioHistorial.length, 1);
});

test('ambiguous line creation response is reconciled without duplicate VentaItems', async () => {
  const scenario = createScenario({ failure: { entity: 'VentaItem', method: 'create', phase: 'after', times: 1 } });
  const result = await invoke(loadHandler(scenario.client), repairPayload());
  assert.equal(result.body.success, true, JSON.stringify(result.body));
  assert.equal(scenario.collections.VentaItem.length, 2);
  assert.equal(new Set(scenario.collections.VentaItem.map(item => item.line_key)).size, 2);
});

test('ambiguous quote conversion response is reconciled to the same sale', async () => {
  const scenario = createScenario({
    failure: {
      entity: 'Cotizacion', method: 'updateMany', phase: 'after', times: 1,
      predicate: ({ update }) => update.$set?.estado_conversion === 'CONVERTIDA',
    },
  });
  const result = await invoke(loadHandler(scenario.client), repairPayload());
  assert.equal(result.body.success, true, JSON.stringify(result.body));
  assert.equal(scenario.collections.Cotizacion[0].venta_id, scenario.collections.Venta[0].id);
  assert.equal(scenario.collections.Venta.length, 1);
});

test('ambiguous final commit response recovers the paid sale', async () => {
  const scenario = createScenario({
    failure: {
      entity: 'Venta', method: 'updateMany', phase: 'after', times: 1,
      predicate: ({ update }) => update.$set?.estado === 'pagada',
    },
  });
  const result = await invoke(loadHandler(scenario.client), repairPayload());
  assert.equal(result.body.success, true, JSON.stringify(result.body));
  assert.equal(scenario.collections.Venta.length, 1);
  assert.equal(scenario.collections.Venta[0].estado, 'pagada');
  assert.equal(scenario.collections.Inventario[0].cantidad_disponible, 5);
});

test('two simultaneous direct service sales with the same key serialize on Branch', async () => {
  const scenario = createScenario();
  const handler = loadHandler(scenario.client);
  const [left, right] = await Promise.all([invoke(handler, directPayload()), invoke(handler, directPayload())]);
  assert.deepEqual([left.status, right.status].sort(), [200, 201]);
  assert.equal(left.body.data.id, right.body.data.id);
  assert.equal(scenario.collections.Venta.length, 1);
});

test('direct sale rejects reuse of its persisted key with another payload', async () => {
  const scenario = createScenario();
  const handler = loadHandler(scenario.client);
  await invoke(handler, directPayload());
  const conflict = await invoke(handler, directPayload({ ventaData: { metodo_pago: 'tarjeta' } }));
  assert.equal(conflict.status, 409, JSON.stringify(conflict.body));
  assert.equal(conflict.body.code, 'SALE_IDEMPOTENCY_CONFLICT');
  assert.equal(scenario.collections.Venta.length, 1);
});

test('preloaded quote sale is claimed and committed without a second Venta', async () => {
  const scenario = createScenario({ preload: true });
  const result = await invoke(loadHandler(scenario.client), repairPayload({ ventaPreloadId: 'sale-preload' }));
  assert.equal(result.body.success, true, JSON.stringify(result.body));
  assert.equal(result.body.data.id, 'sale-preload');
  assert.equal(scenario.collections.Venta.length, 1);
  assert.equal(scenario.collections.Venta[0].estado, 'pagada');
  assert.equal(scenario.collections.Inventario[0].cantidad_disponible, 5);
});

test('source contract uses persisted CAS and has no random idempotency fallback', () => {
  assert.match(backendSource, /sale_lock_token/);
  assert.match(backendSource, /updateMany\(\{/);
  assert.match(backendSource, /request_fingerprint/);
  assert.match(backendSource, /expectedStock: plan\.stockAnterior/);
  assert.doesNotMatch(backendSource, /auto_\$\{Date\.now/);
  assert.match(posSource, /setIdempotencyKey\(`ik_\$\{crypto\.randomUUID\(\)\}`\)/);
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
console.log(`\n${passed}/${tests.length} atomic sale acceptance tests passed.`);
