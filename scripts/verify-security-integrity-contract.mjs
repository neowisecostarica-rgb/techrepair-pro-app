import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isCanonicalActiveUserAccount } from '../base44/functions/_shared/userAuthorization.ts';
import { evaluateCurrentQaEvidence } from '../base44/functions/_shared/qaEvidence.ts';
import { eventMatchesCurrentWorkOrderState } from '../base44/functions/_shared/lifecycleSecurity.ts';
import { applyInventoryStockCas, rollbackInventoryStockCas } from '../base44/functions/_shared/inventoryStockCas.ts';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const readJson = async path => JSON.parse(await read(path));
const tests = [];
const test = (name, run) => tests.push({ name, run });

test('invited and ambiguous memberships never authorize', () => {
  assert.equal(isCanonicalActiveUserAccount({ status: 'invited', active: true }), false);
  assert.equal(isCanonicalActiveUserAccount({ status: 'suspended', active: true }), false);
  assert.equal(isCanonicalActiveUserAccount({ active: true }), false);
  assert.equal(isCanonicalActiveUserAccount({ status: 'active', active: false }), true);
});

test('OTEvent and QA evidence are immutable from the client', async () => {
  const [eventSchema, qaSchema, wizard, qaComponent] = await Promise.all([
    readJson('base44/entities/OTEvent.jsonc'),
    readJson('base44/entities/PruebaTecnica.jsonc'),
    read('src/components/prediagnostico/WizardPreDiagnostico.jsx'),
    read('src/components/tecnico/PruebasTecnicas.jsx'),
  ]);
  assert.equal(eventSchema.rls.create, false);
  assert.equal(eventSchema.rls.update, false);
  assert.equal(qaSchema.rls.create, false);
  assert.equal(qaSchema.rls.update, false);
  assert.equal(qaSchema.rls.delete, false);
  assert.doesNotMatch(wizard, /entities\.OTEvent\.create/);
  assert.doesNotMatch(qaComponent, /entities\.PruebaTecnica\.create/);
});

test('critical lifecycle events require the real work-order state', () => {
  assert.equal(eventMatchesCurrentWorkOrderState('FINALIZADA', { estado: 'PRUEBAS' }), false);
  assert.equal(eventMatchesCurrentWorkOrderState('FINALIZADA', { estado: 'FINALIZADA' }), true);
  assert.equal(eventMatchesCurrentWorkOrderState('ENTREGADA', { estado: 'FINALIZADA' }), false);
  assert.equal(eventMatchesCurrentWorkOrderState('CANCELADA', { estado: 'CANCELADA' }), true);
});

const qaContext = {
  organizationId: 'org-a',
  workOrderId: 'ot-1',
  assignedTechnicianId: 'tech-1',
  cycleId: 'cycle-2',
  cycleStartedAt: '2026-08-05T10:00:00.000Z',
  now: Date.parse('2026-08-05T11:00:00.000Z'),
};
const qaRecord = (overrides = {}) => ({
  organization_id: 'org-a',
  orden_trabajo_id: 'ot-1',
  tecnico_id: 'tech-1',
  author_user_id: 'tech-1',
  author_role: 'TECHNICIAN',
  qa_cycle_id: 'cycle-2',
  qa_cycle_started_at: '2026-08-05T10:00:00.000Z',
  recorded_via_backend: true,
  recorded_at: '2026-08-05T10:05:00.000Z',
  resultado: 'exitoso',
  ...overrides,
});

test('QA evidence validates author, tenant, technician, cycle and freshness', () => {
  assert.equal(evaluateCurrentQaEvidence([qaRecord()], qaContext).valid, true);
  assert.equal(evaluateCurrentQaEvidence([qaRecord({ author_user_id: 'forged' })], qaContext).valid, false);
  assert.equal(evaluateCurrentQaEvidence([qaRecord({ organization_id: 'org-b' })], qaContext).valid, false);
  assert.equal(evaluateCurrentQaEvidence([qaRecord({ qa_cycle_id: 'cycle-1' })], qaContext).valid, false);
  assert.equal(evaluateCurrentQaEvidence([qaRecord({ recorded_at: '2026-08-05T09:59:00.000Z' })], qaContext).valid, false);
});

test('a later incompatible QA result invalidates prior success', () => {
  const evaluation = evaluateCurrentQaEvidence([
    qaRecord(),
    qaRecord({ recorded_at: '2026-08-05T10:06:00.000Z', resultado: 'fallido' }),
  ], qaContext);
  assert.equal(evaluation.valid, false);
  assert.equal(evaluation.code, 'QA_LATER_INCOMPATIBLE_RESULT');
});

function inventoryEntity(record) {
  return {
    async updateMany(query, mutation) {
      const matches = Object.entries(query).every(([key, value]) => record[key] === value);
      if (!matches) return { updated: 0 };
      Object.assign(record, mutation.$set || {});
      for (const key of Object.keys(mutation.$unset || {})) delete record[key];
      return { updated: 1 };
    },
  };
}

test('inventory CAS prevents lost updates and ownership-unsafe rollback', async () => {
  const record = { id: 'inv-1', organization_id: 'org-a', cantidad_disponible: 10 };
  const entity = inventoryEntity(record);
  const first = await applyInventoryStockCas(entity, {
    inventoryId: 'inv-1', organizationId: 'org-a', expectedStock: 10, newStock: 8,
    movementDate: '2026-08-05', operationId: 'op-1', operationKey: 'key-1',
  });
  const stale = await applyInventoryStockCas(entity, {
    inventoryId: 'inv-1', organizationId: 'org-a', expectedStock: 10, newStock: 9,
    movementDate: '2026-08-05', operationId: 'op-2', operationKey: 'key-2',
  });
  assert.equal(first.updated, 1);
  assert.equal(stale.updated, 0);
  record.cantidad_disponible = 7;
  record.last_sale_id = 'op-3';
  record.last_sale_operation_key = 'key-3';
  const unsafeRollback = await rollbackInventoryStockCas(entity, {
    inventoryId: 'inv-1', organizationId: 'org-a', expectedCurrentStock: 8,
    previousStock: 10, operationId: 'op-1', operationKey: 'key-1',
  });
  assert.equal(unsafeRollback.updated, 0);
  assert.equal(record.cantidad_disponible, 7);
});

test('localized tenant policies cover operational and SaaS entities', async () => {
  for (const entity of ['NoConformidad', 'Reciclaje']) {
    const schema = await readJson(`base44/entities/${entity}.jsonc`);
    assert.ok(schema.required.includes('organization_id'));
    assert.equal(schema.rls.read, false);
  }
  for (const entity of ['Partner', 'PartnerReferral']) {
    const schema = await readJson(`base44/entities/${entity}.jsonc`);
    assert.equal(schema.rls.read.user_condition.is_super_admin, true);
  }
});

let passed = 0;
for (const current of tests) {
  await current.run();
  passed += 1;
  console.log(`PASS ${current.name}`);
}
console.log(`\n${passed}/${tests.length} security and integrity contract checks passed.`);
