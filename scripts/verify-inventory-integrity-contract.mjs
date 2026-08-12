import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  InventoryCommandError,
  executeInventoryCommand,
  reverseInventoryCommand,
} from '../base44/functions/_shared/inventoryMutationService.ts';

function clone(value) {
  return structuredClone(value);
}

function matches(record, query) {
  return Object.entries(query || {}).every(([key, expected]) => {
    if (key === '$or') return expected.some(candidate => matches(record, candidate));
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$in' in expected) return expected.$in.includes(record[key]);
      if ('$ne' in expected) return record[key] !== expected.$ne;
      if ('$exists' in expected) return expected.$exists ? record[key] !== undefined : record[key] === undefined;
    }
    return record[key] === expected;
  });
}

function applyMutation(record, mutation) {
  Object.assign(record, clone(mutation.$set || mutation));
  for (const field of Object.keys(mutation.$unset || {})) delete record[field];
}

function createScenario({ available = 10, reserved = 0, branchId = 'branch-a', failures = [] } = {}) {
  const collections = {
    Branch: [...new Set(['branch-a', branchId])].map(id => ({
      id, organization_id: 'org-a', name: id === 'branch-a' ? 'Central' : 'Secondary', active: true,
    })),
    Inventario: [{
      id: 'inventory-1', organization_id: 'org-a', branch_id: branchId,
      cantidad_disponible: available, cantidad_reservada: reserved, nombre: 'Pantalla',
    }],
    InventarioHistorial: [],
    InventarioReserva: [],
    AuditEvent: [],
  };
  let sequence = 0;
  const shouldFail = (entity, method, phase, payload) => {
    const failure = failures.find(item => item.entity === entity && item.method === method
      && item.phase === phase && (item.times ?? 1) > 0
      && (!item.predicate || item.predicate(payload)));
    if (!failure) return false;
    failure.times = (failure.times ?? 1) - 1;
    return true;
  };
  const entity = name => ({
    async filter(query = {}, _sort, limit = 500) {
      return clone(collections[name].filter(record => matches(record, query)).slice(0, limit));
    },
    async create(data) {
      if (shouldFail(name, 'create', 'before', data)) throw new Error(`simulated ${name}.create failure`);
      const record = { id: `${name.toLowerCase()}-${++sequence}`, ...clone(data) };
      collections[name].push(record);
      if (shouldFail(name, 'create', 'after', data)) throw new Error(`simulated ambiguous ${name}.create`);
      return clone(record);
    },
    async updateMany(query, mutation) {
      if (shouldFail(name, 'updateMany', 'before', { query, mutation })) throw new Error(`simulated ${name}.updateMany failure`);
      const records = collections[name].filter(record => matches(record, query));
      for (const record of records) applyMutation(record, mutation);
      if (shouldFail(name, 'updateMany', 'after', { query, mutation })) throw new Error(`simulated ambiguous ${name}.updateMany`);
      return { updated: records.length };
    },
  });
  const base44 = {
    asServiceRole: {
      entities: {
        Branch: entity('Branch'),
        Inventario: entity('Inventario'),
        InventarioHistorial: entity('InventarioHistorial'),
        InventarioReserva: entity('InventarioReserva'),
        AuditEvent: entity('AuditEvent'),
      },
    },
  };
  const lockAdapter = {
    async acquire({ resources }) { return { resources, owner_token: 'test-owner', locks: [] }; },
    async assertOwned() { return true; },
    async release() { return true; },
  };
  return { base44, collections, lockAdapter };
}

function command(overrides = {}) {
  return {
    organizationId: 'org-a',
    branchId: 'branch-a',
    actorId: 'user-1',
    operationKey: 'operation-1',
    referenceType: 'MANUAL_ADJUSTMENT',
    referenceId: 'adjustment-1',
    reason: 'Conteo fisico',
    movements: [{ inventoryId: 'inventory-1', movementType: 'ADJUST_OUT', quantity: 1 }],
    ...overrides,
  };
}

const source = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('two consumers of the last unit allow only one winner', async () => {
  const scenario = createScenario({ available: 1 });
  const [left, right] = await Promise.allSettled([
    executeInventoryCommand(scenario.base44, command({ operationKey: 'consume-a' }), scenario.lockAdapter),
    executeInventoryCommand(scenario.base44, command({ operationKey: 'consume-b' }), scenario.lockAdapter),
  ]);
  assert.equal([left.status, right.status].filter(status => status === 'fulfilled').length, 1);
  assert.equal(scenario.collections.Inventario[0].cantidad_disponible, 0);
});

test('sale versus manual adjustment cannot oversell the last available unit', async () => {
  const scenario = createScenario({ available: 1 });
  const outcomes = await Promise.allSettled([
    executeInventoryCommand(scenario.base44, command({
      operationKey: 'sale-last', referenceType: 'SALE', referenceId: 'sale-1',
      movements: [{ inventoryId: 'inventory-1', movementType: 'SALE', quantity: 1 }],
    }), scenario.lockAdapter),
    executeInventoryCommand(scenario.base44, command({ operationKey: 'adjust-last' }), scenario.lockAdapter),
  ]);
  assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
  assert.equal(scenario.collections.Inventario[0].cantidad_disponible, 0);
});

test('a reserved last unit can be consumed but cannot be sold as available', async () => {
  const scenario = createScenario({ available: 0, reserved: 1 });
  scenario.collections.InventarioReserva.push({
    id: 'reservation-1', organization_id: 'org-a', branch_id: 'branch-a', work_order_id: 'ot-1',
    inventario_id: 'inventory-1', inventory_id: 'inventory-1', quantity: 1, state: 'RESERVED',
  });
  const [sale, consume] = await Promise.allSettled([
    executeInventoryCommand(scenario.base44, command({
      operationKey: 'sale-reserved-last', movements: [{ inventoryId: 'inventory-1', movementType: 'SALE', quantity: 1 }],
    }), scenario.lockAdapter),
    executeInventoryCommand(scenario.base44, command({
      operationKey: 'consume-reserved-last',
      movements: [{ inventoryId: 'inventory-1', movementType: 'CONSUME', quantity: 1, reservationId: 'reservation-1', workOrderId: 'ot-1' }],
    }), scenario.lockAdapter),
  ]);
  assert.equal(sale.status, 'rejected');
  assert.equal(consume.status, 'fulfilled');
  assert.deepEqual([scenario.collections.Inventario[0].cantidad_disponible, scenario.collections.Inventario[0].cantidad_reservada], [0, 0]);
});

test('identical replay has one effect and conflicting reuse fails closed', async () => {
  const scenario = createScenario();
  const input = command({ operationKey: 'stable-key' });
  const first = await executeInventoryCommand(scenario.base44, input, scenario.lockAdapter);
  const replay = await executeInventoryCommand(scenario.base44, input, scenario.lockAdapter);
  assert.equal(first.idempotent, false);
  assert.equal(replay.idempotent, true);
  assert.equal(scenario.collections.Inventario[0].cantidad_disponible, 9);
  assert.equal(scenario.collections.InventarioHistorial.filter(row => !row.reversal_of).length, 1);
  await assert.rejects(
    executeInventoryCommand(scenario.base44, command({ operationKey: 'stable-key', movements: [{ inventoryId: 'inventory-1', movementType: 'ADJUST_OUT', quantity: 2 }] }), scenario.lockAdapter),
    error => error instanceof InventoryCommandError && error.code === 'INVENTORY_IDEMPOTENCY_CONFLICT',
  );
});

test('reserve, release, consume and return preserve canonical counters', async () => {
  const scenario = createScenario({ available: 5 });
  const reserved = await executeInventoryCommand(scenario.base44, command({
    operationKey: 'reserve-1', referenceType: 'WORK_ORDER', referenceId: 'ot-1',
    movements: [{ inventoryId: 'inventory-1', movementType: 'RESERVE', quantity: 2, workOrderId: 'ot-1', quoteId: 'quote-1' }],
  }), scenario.lockAdapter);
  const reservationId = reserved.results[0].reservation_id;
  assert.deepEqual([
    scenario.collections.Inventario[0].cantidad_disponible,
    scenario.collections.Inventario[0].cantidad_reservada,
  ], [3, 2]);

  await executeInventoryCommand(scenario.base44, command({
    operationKey: 'consume-1', referenceType: 'WORK_ORDER', referenceId: 'ot-1',
    movements: [{ inventoryId: 'inventory-1', movementType: 'CONSUME', quantity: 2, reservationId, workOrderId: 'ot-1' }],
  }), scenario.lockAdapter);
  assert.deepEqual([
    scenario.collections.Inventario[0].cantidad_disponible,
    scenario.collections.Inventario[0].cantidad_reservada,
  ], [3, 0]);

  await executeInventoryCommand(scenario.base44, command({
    operationKey: 'return-1', referenceType: 'WORK_ORDER', referenceId: 'ot-1',
    movements: [{ inventoryId: 'inventory-1', movementType: 'RETURN', quantity: 2, reservationId, workOrderId: 'ot-1' }],
  }), scenario.lockAdapter);
  assert.deepEqual([
    scenario.collections.Inventario[0].cantidad_disponible,
    scenario.collections.Inventario[0].cantidad_reservada,
  ], [5, 0]);
});

test('release is idempotent and restores available stock exactly once', async () => {
  const scenario = createScenario({ available: 2 });
  const reserved = await executeInventoryCommand(scenario.base44, command({
    operationKey: 'reserve-release',
    movements: [{ inventoryId: 'inventory-1', movementType: 'RESERVE', quantity: 1, workOrderId: 'ot-1' }],
  }), scenario.lockAdapter);
  const release = command({
    operationKey: 'cancel-release',
    movements: [{ inventoryId: 'inventory-1', movementType: 'RELEASE', quantity: 1, reservationId: reserved.results[0].reservation_id, workOrderId: 'ot-1' }],
  });
  await executeInventoryCommand(scenario.base44, release, scenario.lockAdapter);
  const replay = await executeInventoryCommand(scenario.base44, release, scenario.lockAdapter);
  assert.equal(replay.idempotent, true);
  assert.deepEqual([scenario.collections.Inventario[0].cantidad_disponible, scenario.collections.Inventario[0].cantidad_reservada], [2, 0]);
});

test('initial balance only applies to a zero projection', async () => {
  const scenario = createScenario({ available: 0, reserved: 0 });
  await executeInventoryCommand(scenario.base44, command({
    operationKey: 'initial-1',
    movements: [{ inventoryId: 'inventory-1', movementType: 'INITIAL_BALANCE', quantity: 4 }],
  }), scenario.lockAdapter);
  assert.equal(scenario.collections.Inventario[0].cantidad_disponible, 4);
  await assert.rejects(executeInventoryCommand(scenario.base44, command({
    operationKey: 'initial-2',
    movements: [{ inventoryId: 'inventory-1', movementType: 'INITIAL_BALANCE', quantity: 1 }],
  }), scenario.lockAdapter), error => error.code === 'INVENTORY_INITIAL_BALANCE_CONFLICT');
});

test('POS sale movement reduces available and writes a canonical ledger row', async () => {
  const scenario = createScenario({ available: 3 });
  await executeInventoryCommand(scenario.base44, command({
    operationKey: 'pos-sale-1', referenceType: 'SALE', referenceId: 'sale-pos',
    movements: [{ inventoryId: 'inventory-1', movementType: 'SALE', quantity: 2 }],
  }), scenario.lockAdapter);
  assert.equal(scenario.collections.Inventario[0].cantidad_disponible, 1);
  assert.equal(scenario.collections.InventarioHistorial[0].movement_type, 'SALE');
});

test('cross-branch mutation fails closed', async () => {
  const scenario = createScenario({ branchId: 'branch-b' });
  await assert.rejects(
    executeInventoryCommand(scenario.base44, command(), scenario.lockAdapter),
    error => error instanceof InventoryCommandError && error.code === 'INVENTORY_CROSS_BRANCH_DENIED',
  );
});

test('ledger failure restores projection and leaves no silent mutation', async () => {
  const scenario = createScenario({
    failures: [{ entity: 'InventarioHistorial', method: 'create', phase: 'before', times: 1 }],
  });
  await assert.rejects(executeInventoryCommand(scenario.base44, command(), scenario.lockAdapter));
  assert.equal(scenario.collections.Inventario[0].cantidad_disponible, 10);
});

test('ambiguous projection response is reconciled by canonical markers', async () => {
  const scenario = createScenario({
    failures: [{ entity: 'Inventario', method: 'updateMany', phase: 'after', times: 1 }],
  });
  const result = await executeInventoryCommand(scenario.base44, command({ operationKey: 'ambiguous-cas' }), scenario.lockAdapter);
  assert.equal(result.success, true);
  assert.equal(scenario.collections.Inventario[0].cantidad_disponible, 9);
  assert.equal(scenario.collections.InventarioHistorial.length, 1);
});

test('multi-item failure restores every projection with append-only compensation', async () => {
  const scenario = createScenario({
    failures: [{
      entity: 'InventarioHistorial', method: 'create', phase: 'before', times: 1,
      predicate: row => row.inventario_id === 'inventory-2',
    }],
  });
  scenario.collections.Inventario.push({
    id: 'inventory-2', organization_id: 'org-a', branch_id: 'branch-a',
    cantidad_disponible: 5, cantidad_reservada: 0, nombre: 'Bateria',
  });
  const multiCommand = command({
    operationKey: 'multi-fail',
    movements: [
      { inventoryId: 'inventory-1', movementType: 'ADJUST_OUT', quantity: 1 },
      { inventoryId: 'inventory-2', movementType: 'ADJUST_OUT', quantity: 1 },
    ],
  });
  await assert.rejects(executeInventoryCommand(scenario.base44, multiCommand, scenario.lockAdapter));
  assert.deepEqual(scenario.collections.Inventario.map(row => row.cantidad_disponible), [10, 5]);
  assert.equal(scenario.collections.InventarioHistorial.length, 2);
  assert.equal(scenario.collections.InventarioHistorial[1].movement_type, 'REVERSAL');
  const retry = await executeInventoryCommand(scenario.base44, multiCommand, scenario.lockAdapter);
  assert.equal(retry.success, true);
  assert.deepEqual(scenario.collections.Inventario.map(row => row.cantidad_disponible), [9, 4]);
  for (const inventoryId of ['inventory-1', 'inventory-2']) {
    const net = scenario.collections.InventarioHistorial
      .filter(row => row.inventario_id === inventoryId)
      .reduce((sum, row) => sum + Number(row.available_delta || 0), 0);
    assert.equal(net, -1);
  }
  await reverseInventoryCommand(scenario.base44, {
    organizationId: 'org-a', branchId: 'branch-a', actorId: 'user-1',
    operationKey: 'multi-fail', reversalOperationKey: 'multi-fail:business-undo',
  }, scenario.lockAdapter);
  assert.deepEqual(scenario.collections.Inventario.map(row => row.cantidad_disponible), [10, 5]);
});

test('a compensated multi-item reservation can retry with the same operation key', async () => {
  const scenario = createScenario({
    failures: [{
      entity: 'InventarioHistorial', method: 'create', phase: 'before', times: 1,
      predicate: row => row.inventario_id === 'inventory-2',
    }],
  });
  scenario.collections.Inventario.push({
    id: 'inventory-2', organization_id: 'org-a', branch_id: 'branch-a',
    cantidad_disponible: 5, cantidad_reservada: 0, nombre: 'Bateria',
  });
  const reserveBoth = command({
    operationKey: 'reserve-multi-retry', referenceType: 'WORK_ORDER', referenceId: 'ot-1',
    movements: [
      { inventoryId: 'inventory-1', movementType: 'RESERVE', quantity: 1, workOrderId: 'ot-1' },
      { inventoryId: 'inventory-2', movementType: 'RESERVE', quantity: 1, workOrderId: 'ot-1' },
    ],
  });
  await assert.rejects(executeInventoryCommand(scenario.base44, reserveBoth, scenario.lockAdapter));
  const retry = await executeInventoryCommand(scenario.base44, reserveBoth, scenario.lockAdapter);
  assert.equal(retry.success, true);
  assert.deepEqual(scenario.collections.Inventario.map(row => [row.cantidad_disponible, row.cantidad_reservada]), [[9, 1], [4, 1]]);
  assert.deepEqual(scenario.collections.InventarioReserva.map(row => row.state), ['RESERVED', 'RESERVED']);
});

test('reversal is append-only and never deletes the original movement', async () => {
  const scenario = createScenario();
  await executeInventoryCommand(scenario.base44, command({ operationKey: 'sale-stock' }), scenario.lockAdapter);
  await reverseInventoryCommand(scenario.base44, {
    organizationId: 'org-a', branchId: 'branch-a', actorId: 'user-1',
    operationKey: 'sale-stock', reversalOperationKey: 'sale-stock:reversal', reason: 'Venta revertida',
  }, scenario.lockAdapter);
  assert.equal(scenario.collections.Inventario[0].cantidad_disponible, 10);
  assert.equal(scenario.collections.InventarioHistorial.length, 2);
  assert.equal(scenario.collections.InventarioHistorial[1].reversal_of, scenario.collections.InventarioHistorial[0].id);
});

test('reversing a consume restores the reservation state and reserved projection', async () => {
  const scenario = createScenario({ available: 2 });
  const reserve = await executeInventoryCommand(scenario.base44, command({
    operationKey: 'reserve-for-reversal',
    movements: [{ inventoryId: 'inventory-1', movementType: 'RESERVE', quantity: 1, workOrderId: 'ot-1' }],
  }), scenario.lockAdapter);
  const reservationId = reserve.results[0].reservation_id;
  const consumeCommand = command({
    operationKey: 'consume-for-reversal',
    movements: [{ inventoryId: 'inventory-1', movementType: 'CONSUME', quantity: 1, reservationId, workOrderId: 'ot-1' }],
  });
  await executeInventoryCommand(scenario.base44, consumeCommand, scenario.lockAdapter);
  await reverseInventoryCommand(scenario.base44, {
    organizationId: 'org-a', branchId: 'branch-a', actorId: 'user-1',
    operationKey: 'consume-for-reversal', reversalOperationKey: 'consume-for-reversal:undo',
  }, scenario.lockAdapter);
  assert.equal(scenario.collections.InventarioReserva[0].state, 'RESERVED');
  assert.deepEqual([scenario.collections.Inventario[0].cantidad_disponible, scenario.collections.Inventario[0].cantidad_reservada], [1, 1]);
  const replay = await executeInventoryCommand(scenario.base44, consumeCommand, scenario.lockAdapter);
  assert.equal(replay.idempotent, true);
  assert.equal(scenario.collections.InventarioReserva[0].state, 'RESERVED');
  assert.deepEqual([scenario.collections.Inventario[0].cantidad_disponible, scenario.collections.Inventario[0].cantidad_reservada], [1, 1]);
});

test('schemas make the ledger and reservation state backend-owned', async () => {
  const [ledger, reservation] = await Promise.all([
    source('base44/entities/InventarioHistorial.jsonc'),
    source('base44/entities/InventarioReserva.jsonc'),
  ]);
  for (const schema of [JSON.parse(ledger), JSON.parse(reservation)]) {
    assert.deepEqual(schema.rls, { create: false, read: false, update: false, delete: false });
  }
  assert.match(ledger, /"movement_key"/);
  assert.match(ledger, /"reversal_of"/);
});

test('catalog update rejects every sovereign inventory field', async () => {
  const backend = await source('base44/functions/updateInventoryItem/entry.ts');
  for (const field of ['cantidad_disponible', 'cantidad_reservada', 'organization_id', 'branch_id', 'last_inventory_operation_key']) {
    assert.match(backend, new RegExp(`'${field}'`));
  }
  assert.match(backend, /INVENTORY_SOVEREIGN_FIELD_FORBIDDEN/);
  assert.doesNotMatch(backend, /\.\.\.updateData/);
});

test('create, adjust and sale all delegate physical mutations to one service', async () => {
  const [createItem, adjust, sale] = await Promise.all([
    source('base44/functions/createInventoryItem/entry.ts'),
    source('base44/functions/adjustInventoryStock/entry.ts'),
    source('base44/functions/createSale/entry.ts'),
  ]);
  for (const backend of [createItem, adjust, sale]) assert.match(backend, /executeInventoryCommand\(base44/);
  assert.match(createItem, /movementType: 'INITIAL_BALANCE'/);
  assert.match(adjust, /INVENTORY_OPERATION_KEY_REQUIRED/);
  assert.match(sale, /branch_id: sale\.branch_id/);
  assert.doesNotMatch(sale, /InventarioHistorial\.delete/);
});

test('approved quote identity, reservation, explicit consume and no-double-decrement are wired', async () => {
  const [gateway, transition, activity, sale, quoteSchema] = await Promise.all([
    source('base44/functions/operationalGateway/entry.ts'),
    source('base44/functions/transitionWorkOrderStatus/entry.ts'),
    source('base44/functions/initTechnicalActivity/entry.ts'),
    source('base44/functions/createSale/entry.ts'),
    source('base44/entities/Cotizacion.jsonc'),
  ]);
  assert.match(quoteSchema, /"referencia_id"/);
  assert.match(gateway, /normalizeQuoteItems/);
  assert.match(transition, /movementType: 'RESERVE'/);
  assert.match(transition, /ot-cancel-release:/);
  assert.match(activity, /confirmar_consumo_repuesto/);
  assert.match(activity, /movementType: 'CONSUME'/);
  assert.match(sale, /reservation\?\.state === 'CONSUMED'/);
});

test('legacy data gate is read-only and reports deploy-time follow-up', async () => {
  const audit = await source('base44/functions/auditInventoryLegacyData/entry.ts');
  assert.match(audit, /allowedRoles: \['ORG_ADMIN'\]/);
  assert.match(audit, /read_only: true/);
  assert.doesNotMatch(audit, /\.create\(|\.update\(|\.updateMany\(|\.delete\(/);
  assert.match(audit, /gate: totalFindings === 0 \? 'PASS' : 'REQUIRED'/);
});

test('no runtime inventory owner deletes the physical ledger', async () => {
  const owners = await Promise.all([
    source('base44/functions/createInventoryItem/entry.ts'),
    source('base44/functions/updateInventoryItem/entry.ts'),
    source('base44/functions/adjustInventoryStock/entry.ts'),
    source('base44/functions/createSale/entry.ts'),
    source('base44/functions/_shared/inventoryMutationService.ts'),
  ]);
  for (const owner of owners) assert.doesNotMatch(owner, /InventarioHistorial\.delete/);
});

test('frontend inventory creation and editing cannot bypass backend owners', async () => {
  const [inventoryPage, quickCreate, diagnosticSetup] = await Promise.all([
    source('src/pages/Inventario.jsx'),
    source('src/components/inventario/CrearProductoRapido.jsx'),
    source('src/components/inventario/setupProductoDiagnostico.jsx'),
  ]);
  assert.match(inventoryPage, /functions\.invoke\('createInventoryItem'/);
  assert.match(inventoryPage, /if \(!editingItem\)/);
  assert.match(quickCreate, /functions\.invoke\('createInventoryItem'/);
  assert.match(diagnosticSetup, /functions\.invoke\('createInventoryItem'/);
  assert.doesNotMatch(diagnosticSetup, /entities\.Inventario\.create/);
});
