import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  DeliveryCommandError,
  DELIVERY_LEGAL_TEXT,
  addUtcMonths,
  determineWarrantyApplicability,
  evaluateCommercialDeliveryGate,
  executeDeliveryCommand,
  fingerprintDeliveryRequest,
  normalizeDeliveryRequest,
} from '../base44/functions/_shared/deliveryAtomicity.ts';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

function clone(value) {
  return structuredClone(value);
}

function matches(record, query = {}) {
  return Object.entries(query).every(([field, expected]) => {
    if (field === '$or') return expected.some(candidate => matches(record, candidate));
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$exists' in expected) return Object.hasOwn(record, field) === expected.$exists;
      if ('$in' in expected) return expected.$in.includes(record[field]);
      if ('$ne' in expected) return record[field] !== expected.$ne;
      if ('$lt' in expected) return record[field] < expected.$lt;
    }
    if (expected === null) return record[field] == null;
    return record[field] === expected;
  });
}

function scenario(options = {}) {
  const orgId = options.organizationId || 'org-a';
  const branchId = options.branchId || 'branch-a';
  const interventionType = options.interventionType || 'reparacion_puntual';
  const warrantyApplicable = ['reparacion_puntual', 'mantenimiento_correctivo'].includes(interventionType);
  const saleConcept = warrantyApplicable ? 'reparacion' : 'revision_diagnostico';
  const saleId = warrantyApplicable ? 'sale-repair' : 'sale-revision';
  const collections = {
    Organization: [{
      id: orgId,
      garantia_config: { texto_reparaciones: 'Garantia MVP', meses_vigencia_reparaciones: 3 },
      created_date: '2026-01-01T00:00:00.000Z',
    }],
    Branch: [{
      id: branchId, organization_id: orgId, name: 'Central', active: options.branchActive !== false,
      created_date: '2026-01-01T00:00:00.000Z',
    }],
    OrdenTrabajo: [{
      id: 'ot-1', organization_id: orgId, branch_id: branchId, cliente_id: 'client-1', equipo_id: 'equipment-1',
      codigo_ot: 'OT-1', estado: options.state || 'FINALIZADA', diagnostico_habilitado: !warrantyApplicable,
      revision_venta_id: !warrantyApplicable ? saleId : null, created_date: '2026-01-01T00:00:00.000Z',
    }],
    ActividadTecnica: options.activeActivity ? [{
      id: 'activity-1', organization_id: orgId, orden_trabajo_id: 'ot-1', estado: 'en_progreso', soft_deleted: false,
      created_date: '2026-01-02T00:00:00.000Z',
    }] : [],
    DiagnosticoTecnico: [{
      id: 'diag-1', organization_id: orgId, orden_trabajo_id: 'ot-1', estado: 'listo_aprobacion',
      bloqueado: true, credito_consumido_finalizacion: true, tipo_intervencion: interventionType,
      fecha_completado: '2026-01-03T00:00:00.000Z', created_date: '2026-01-02T00:00:00.000Z',
    }],
    Venta: [{
      id: saleId, organization_id: orgId, branch_id: branchId, cliente_id: 'client-1', referencia_ot_id: 'ot-1',
      tipo_concepto: saleConcept, estado: options.saleState || 'pagada', inventory_commit_status: 'COMMITTED',
      total: 113, cotizacion_id: warrantyApplicable ? 'quote-1' : null, created_date: '2026-01-04T00:00:00.000Z',
    }],
    Cotizacion: warrantyApplicable ? [{
      id: 'quote-1', organization_id: orgId, branch_id: branchId, cliente_id: 'client-1', orden_trabajo_id: 'ot-1',
      estado: 'aprobada', decision_status: 'COMMITTED', estado_conversion: 'CONVERTIDA', venta_id: saleId,
      total: 113, created_date: '2026-01-03T00:00:00.000Z',
    }] : [],
    WorkflowGate: !warrantyApplicable ? [{
      id: 'gate-1', organization_id: orgId, subject_type: 'OrdenTrabajo', subject_id: 'ot-1',
      wait_reason: 'COMMERCIAL_AUTHORIZATION', status: 'RESOLVED', resolution_payload: { sale_id: saleId },
      created_date: '2026-01-04T00:00:00.000Z',
    }] : [],
    EntregaLog: [],
    Garantia: [],
    OTEvent: [],
  };
  if (options.onlyDiagnosticPaidForRepair) {
    collections.Venta = [{
      id: 'sale-diagnostic', organization_id: orgId, branch_id: branchId, cliente_id: 'client-1',
      referencia_ot_id: 'ot-1', tipo_concepto: 'revision_diagnostico', estado: 'pagada',
      inventory_commit_status: 'COMMITTED', total: 25, created_date: '2026-01-04T00:00:00.000Z',
    }];
    collections.Cotizacion = [];
  }
  const failures = (options.failures || []).map(failure => ({ times: 1, phase: 'before', ...failure }));
  const counters = {};
  let sequence = 0;
  const shouldFail = (entity, method, phase, payload) => {
    const failure = failures.find(candidate => candidate.entity === entity
      && candidate.method === method
      && candidate.phase === phase
      && candidate.times > 0
      && (!candidate.predicate || candidate.predicate(payload)));
    if (!failure) return false;
    failure.times -= 1;
    return true;
  };
  const entity = name => ({
    async filter(query = {}, sort = '-created_date', limit = 100) {
      const sorted = collections[name].filter(record => matches(record, query));
      if (sort === '-created_date') sorted.sort((a, b) => String(b.created_date || '').localeCompare(String(a.created_date || '')));
      return clone(sorted.slice(0, typeof limit === 'number' ? limit : 100));
    },
    async create(data) {
      if (shouldFail(name, 'create', 'before', data)) throw new Error(`simulated ${name}.create before`);
      const record = { id: `${name.toLowerCase()}-${++sequence}`, created_date: new Date().toISOString(), ...clone(data) };
      collections[name].push(record);
      counters[`${name}.create`] = (counters[`${name}.create`] || 0) + 1;
      if (shouldFail(name, 'create', 'after', data)) throw new Error(`simulated ${name}.create after`);
      return clone(record);
    },
    async updateMany(query, mutation) {
      const payload = { query, mutation };
      if (shouldFail(name, 'updateMany', 'before', payload)) throw new Error(`simulated ${name}.updateMany before`);
      const targets = collections[name].filter(record => matches(record, query));
      for (const target of targets) {
        Object.assign(target, clone(mutation.$set || mutation));
        for (const field of Object.keys(mutation.$unset || {})) delete target[field];
      }
      counters[`${name}.updateMany`] = (counters[`${name}.updateMany`] || 0) + 1;
      if (shouldFail(name, 'updateMany', 'after', payload)) throw new Error(`simulated ${name}.updateMany after`);
      return { updated: targets.length };
    },
    async update(id, data) {
      const target = collections[name].find(record => record.id === id);
      if (!target) throw new Error(`${name} not found`);
      Object.assign(target, clone(data));
      return clone(target);
    },
  });
  const entities = Object.fromEntries(Object.keys(collections).map(name => [name, entity(name)]));
  const base44 = { asServiceRole: { entities } };
  const context = {
    organizationId: orgId,
    role: 'ORG_ADMIN',
    actor: { id: 'user-1', email: 'admin@example.com' },
    authorizeBranch(candidate) {
      if (candidate !== branchId) throw new DeliveryCommandError('cross branch', 'DELIVERY_CROSS_BRANCH_DENIED', 403);
    },
  };
  return { base44, collections, counters, context };
}

const request = (overrides = {}) => ({
  work_order_id: 'ot-1', acceptance: true, nota_entrega: 'Equipo retirado', operation_key: 'delivery_operation_0001', ...overrides,
});

async function deliver(setup, overrides = {}) {
  return executeDeliveryCommand(setup.base44, setup.context, request(overrides));
}

test('1 happy path commits one delivery, warranty and OT', async () => {
  const setup = scenario();
  const result = await deliver(setup);
  assert.equal(result.success, true);
  assert.equal(result.work_order.estado, 'ENTREGADA');
  assert.equal(result.work_order.delivery_status, 'COMMITTED');
  assert.equal(setup.collections.EntregaLog.length, 1);
  assert.equal(setup.collections.Garantia.length, 1);
});

test('2 sequential double submit recovers exactly one result', async () => {
  const setup = scenario();
  await deliver(setup);
  const replay = await deliver(setup);
  assert.equal(replay.idempotent, true);
  assert.equal(setup.collections.EntregaLog.length, 1);
  assert.equal(setup.collections.Garantia.length, 1);
});

test('3 same key replay returns the original operation', async () => {
  const setup = scenario();
  const first = await deliver(setup);
  const second = await deliver(setup);
  assert.equal(second.delivery_log.id, first.delivery_log.id);
  assert.equal(second.warranty.id, first.warranty.id);
});

test('4 same key and different payload conflicts', async () => {
  const setup = scenario();
  await deliver(setup);
  await assert.rejects(() => deliver(setup, { nota_entrega: 'Otra nota' }), { code: 'DELIVERY_FINGERPRINT_CONFLICT' });
});

test('5 different key after commit is ALREADY_DELIVERED', async () => {
  const setup = scenario();
  await deliver(setup);
  await assert.rejects(() => deliver(setup, { operation_key: 'delivery_operation_0002' }), { code: 'ALREADY_DELIVERED' });
});

test('6 concurrent deliveries produce at most one logical result', async () => {
  const setup = scenario();
  const settled = await Promise.allSettled([deliver(setup), deliver(setup, { operation_key: 'delivery_operation_0002' })]);
  assert.equal(settled.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(setup.collections.EntregaLog.length, 1);
  assert.equal(setup.collections.Garantia.length, 1);
});

test('7 cross branch is blocked before critical writes', async () => {
  const setup = scenario();
  setup.context.authorizeBranch = () => { throw new DeliveryCommandError('cross', 'DELIVERY_CROSS_BRANCH_DENIED', 403); };
  await assert.rejects(() => deliver(setup), { code: 'DELIVERY_CROSS_BRANCH_DENIED' });
  assert.equal(setup.collections.EntregaLog.length, 0);
});

test('8 cross organization does not expose the OT', async () => {
  const setup = scenario();
  setup.context.organizationId = 'org-b';
  await assert.rejects(() => deliver(setup), { code: 'DELIVERY_WORK_ORDER_NOT_FOUND' });
});

test('9 invalid state is blocked', async () => {
  const setup = scenario({ state: 'PRUEBAS' });
  await assert.rejects(() => deliver(setup), { code: 'DELIVERY_INVALID_STATE' });
});

test('10 missing acceptance is blocked', async () => {
  const setup = scenario();
  await assert.rejects(() => deliver(setup, { acceptance: false }), { code: 'DELIVERY_ACCEPTANCE_REQUIRED' });
});

test('11 failure before first critical write has zero business effects', async () => {
  const setup = scenario({ failures: [{ entity: 'OrdenTrabajo', method: 'updateMany', predicate: ({ mutation }) => mutation.$set?.delivery_status === 'PENDING' }] });
  await assert.rejects(() => deliver(setup));
  assert.equal(setup.collections.EntregaLog.length, 0);
  assert.equal(setup.collections.Garantia.length, 0);
  assert.equal(setup.collections.OrdenTrabajo[0].delivery_status, undefined);
});

test('12 failure after claim is recoverable', async () => {
  const setup = scenario({ failures: [{ entity: 'EntregaLog', method: 'create' }] });
  await assert.rejects(() => deliver(setup));
  assert.equal(setup.collections.OrdenTrabajo[0].delivery_status, 'PENDING');
  const recovered = await deliver(setup);
  assert.equal(recovered.success, true);
});

test('13 ambiguous EntregaLog create is reconciled', async () => {
  const setup = scenario({ failures: [{ entity: 'EntregaLog', method: 'create', phase: 'after' }] });
  const result = await deliver(setup);
  assert.equal(result.success, true);
  assert.equal(setup.collections.EntregaLog.length, 1);
});

test('14 warranty create failure leaves no SUCCESS and replay recovers', async () => {
  const setup = scenario({ failures: [{ entity: 'Garantia', method: 'create' }] });
  await assert.rejects(() => deliver(setup));
  assert.equal(setup.collections.OrdenTrabajo[0].estado, 'FINALIZADA');
  const recovered = await deliver(setup);
  assert.equal(recovered.warranty.estado, 'ACTIVA');
});

test('15 OT CAS failure is recoverable', async () => {
  const setup = scenario({ failures: [{
    entity: 'OrdenTrabajo', method: 'updateMany',
    predicate: ({ mutation }) => mutation.$set?.estado === 'ENTREGADA',
  }] });
  await assert.rejects(() => deliver(setup));
  assert.equal(setup.collections.Garantia[0].delivery_status, 'PENDING');
  const result = await deliver(setup);
  assert.equal(result.work_order.delivery_status, 'COMMITTED');
});

test('16 warranty activation failure is recoverable', async () => {
  const setup = scenario({ failures: [{
    entity: 'Garantia', method: 'updateMany', predicate: ({ mutation }) => mutation.$set?.estado === 'ACTIVA',
  }] });
  await assert.rejects(() => deliver(setup));
  const result = await deliver(setup);
  assert.equal(result.warranty.estado, 'ACTIVA');
});

test('17 log commit failure is recoverable', async () => {
  const setup = scenario({ failures: [{
    entity: 'EntregaLog', method: 'updateMany', predicate: ({ mutation }) => mutation.$set?.delivery_status === 'COMMITTED',
  }] });
  await assert.rejects(() => deliver(setup));
  const result = await deliver(setup);
  assert.equal(result.delivery_log.delivery_status, 'COMMITTED');
});

test('18 final logical commit failure is recoverable', async () => {
  const setup = scenario({ failures: [{
    entity: 'OrdenTrabajo', method: 'updateMany', predicate: ({ mutation }) => mutation.$set?.delivery_status === 'COMMITTED',
  }] });
  await assert.rejects(() => deliver(setup));
  const result = await deliver(setup);
  assert.equal(result.work_order.delivery_status, 'COMMITTED');
});

test('19 timeout after logical commit replays SUCCESS without new writes', async () => {
  const setup = scenario();
  await deliver(setup);
  setup.collections.Venta[0].estado = 'inconsistente';
  const replay = await deliver(setup);
  assert.equal(replay.success, true);
  assert.equal(replay.idempotent, true);
});

test('20 maximum one warranty exists for canonical OT identity', async () => {
  const setup = scenario();
  await deliver(setup);
  await deliver(setup);
  assert.deepEqual(setup.collections.Garantia.map(item => item.source_identity), ['WORK_ORDER:ot-1']);
});

test('21 warranty dates and token are deterministic on replay', async () => {
  const setup = scenario();
  const first = await deliver(setup);
  const second = await deliver(setup);
  assert.equal(second.warranty.fecha_fin, first.warranty.fecha_fin);
  assert.equal(second.warranty.public_access_token, first.warranty.public_access_token);
});

test('22 NOT_APPLICABLE commits without creating warranty', async () => {
  const setup = scenario({ interventionType: 'limpieza' });
  const result = await deliver(setup);
  assert.equal(result.warranty_outcome, 'NOT_APPLICABLE');
  assert.equal(result.warranty, null);
  assert.equal(setup.collections.Garantia.length, 0);
});

test('23 indeterminate warranty applicability fails closed', async () => {
  const setup = scenario({ interventionType: 'otro' });
  await assert.rejects(() => deliver(setup), { code: 'DELIVERY_WARRANTY_APPLICABILITY_UNDETERMINED' });
});

test('24 diagnostic payment alone cannot liquidate a repair', async () => {
  const setup = scenario({ onlyDiagnosticPaidForRepair: true });
  await assert.rejects(() => deliver(setup), { code: 'DELIVERY_COMMERCIAL_REPAIR_UNPAID' });
});

test('25 complete repair obligation allows delivery', async () => {
  const setup = scenario();
  const result = await deliver(setup);
  assert.equal(result.delivery_log.commercial_snapshot.pending_balance, 0);
});

test('26 pending repair sale blocks delivery', async () => {
  const setup = scenario({ saleState: 'procesando' });
  await assert.rejects(() => deliver(setup), { code: 'DELIVERY_COMMERCIAL_REPAIR_UNPAID' });
});

test('27 replay never recalculates a committed commercial gate', async () => {
  const setup = scenario();
  await deliver(setup);
  setup.collections.Venta.length = 0;
  const replay = await deliver(setup);
  assert.equal(replay.success, true);
});

test('28 active technical activity fails closed without fabrication', async () => {
  const setup = scenario({ activeActivity: true });
  await assert.rejects(() => deliver(setup), { code: 'DELIVERY_ACTIVE_TECHNICAL_ACTIVITY' });
  assert.equal(setup.collections.ActividadTecnica[0].estado, 'en_progreso');
});

test('29 non-critical OTEvent failure does not corrupt delivery', async () => {
  const setup = scenario({ failures: [{ entity: 'OTEvent', method: 'create' }] });
  const result = await deliver(setup);
  assert.equal(result.success, true);
  assert.equal(result.non_critical_side_effects.event_status, 'PENDING_RETRY');
});

test('30 server owns actor, timestamp, legal snapshot and branch', async () => {
  const setup = scenario();
  await deliver(setup, { actor: 'forged', branch_id: 'forged', delivered_at: '2000-01-01T00:00:00Z' });
  const log = setup.collections.EntregaLog[0];
  assert.equal(log.delivered_by_user_id, 'user-1');
  assert.equal(log.branch_id, 'branch-a');
  assert.equal(log.checkbox_texto_legal, DELIVERY_LEGAL_TEXT);
  assert.notEqual(log.delivered_at, '2000-01-01T00:00:00Z');
});

test('31 canonical intervention mapping is explicit', () => {
  const record = type => [{ id: 'd', estado: 'listo_aprobacion', bloqueado: true, credito_consumido_finalizacion: true, tipo_intervencion: type }];
  assert.equal(determineWarrantyApplicability(record('reparacion_puntual')).applicable, true);
  assert.equal(determineWarrantyApplicability(record('mantenimiento_correctivo')).applicable, true);
  assert.equal(determineWarrantyApplicability(record('revision_general')).outcome, 'NOT_APPLICABLE');
  assert.equal(determineWarrantyApplicability(record('mantenimiento_preventivo')).outcome, 'NOT_APPLICABLE');
});

test('32 normalized fingerprint is stable and note-sensitive', async () => {
  const one = normalizeDeliveryRequest(request());
  const two = normalizeDeliveryRequest({ ...request(), nota_entrega: '  Equipo retirado  ' });
  assert.equal(await fingerprintDeliveryRequest(one), await fingerprintDeliveryRequest(two));
  assert.notEqual(await fingerprintDeliveryRequest(one), await fingerprintDeliveryRequest(normalizeDeliveryRequest({ ...request(), nota_entrega: 'Cambio' })));
});

test('33 UTC month calculation is deterministic at month end', () => {
  assert.equal(addUtcMonths('2026-01-31', 1), '2026-02-28');
});

test('34 source files close direct lifecycle and CRUD bypasses', async () => {
  const [transition, postSale, policy, gateway, frontend, auditor] = await Promise.all([
    readFile(new URL('../base44/functions/transitionWorkOrderStatus/entry.ts', import.meta.url), 'utf8'),
    readFile(new URL('../base44/functions/processPostSaleActions/entry.ts', import.meta.url), 'utf8'),
    readFile(new URL('../base44/functions/_shared/operationalAuthorization.ts', import.meta.url), 'utf8'),
    readFile(new URL('../base44/functions/operationalGateway/entry.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ot/EntregarOT.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../base44/functions/auditDeliveryLegacyData/entry.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(transition, /DELIVERY_COMMAND_REQUIRED/);
  assert.doesNotMatch(postSale, /saldo_final:\s*\{\s*FINALIZADA:\s*'ENTREGADA'/);
  assert.match(policy, /EntregaLog: \{ read: COMMERCIAL_ROLES, create: \[\], update: \[\], delete: \[\]/);
  assert.match(gateway, /Las garantias de OrdenTrabajo solo pueden emitirse mediante deliverWorkOrder/);
  assert.match(frontend, /functions\.invoke\('deliverWorkOrder'/);
  assert.doesNotMatch(frontend, /entities\.(EntregaLog|Garantia|ActividadTecnica)\.(create|update)/);
  assert.match(auditor, /read_only: true/);
  assert.match(auditor, /delivery_operation_pending/);
});

test('35 pure commercial gate reports the exact paid source', () => {
  const setup = scenario();
  const result = evaluateCommercialDeliveryGate({
    ot: setup.collections.OrdenTrabajo[0],
    applicability: { applicable: true },
    sales: setup.collections.Venta,
    quotes: setup.collections.Cotizacion,
    workflowGates: setup.collections.WorkflowGate,
  });
  assert.deepEqual({ sale: result.sale_id, quote: result.quote_id, pending: result.pending_balance }, {
    sale: 'sale-repair', quote: 'quote-1', pending: 0,
  });
});
