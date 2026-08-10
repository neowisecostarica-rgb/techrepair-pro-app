import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PROTECTED_OPERATIONAL_ENTITIES,
  authorizeOperationalAction,
  authorizeRecordBranch,
  getCanonicalBranchScope,
  validateRequestedBranch,
} from '../base44/functions/_shared/operationalAuthorization.ts';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const readJson = async path => JSON.parse(await read(path));
let passed = 0;

function pass(name) {
  passed += 1;
  console.log(`PASS ${name}`);
}

const authorization = (role, branchId = 'branch-a', organizationId = 'org-a') => ({
  ok: true,
  role,
  organizationId,
  account: role === 'ORG_ADMIN' ? { organization_id: organizationId } : {
    organization_id: organizationId,
    branch_id: branchId,
  },
});

{
  const sales = authorization('SALES');
  for (const [entity, operation] of [
    ['Venta', 'create'],
    ['VentaItem', 'create'],
    ['Cotizacion', 'create'],
    ['Cotizacion', 'update'],
    ['Cita', 'create'],
  ]) {
    assert.equal(authorizeOperationalAction(sales, entity, operation).ok, true, `${entity}.${operation}`);
  }
  for (const [entity, operation] of [
    ['Branch', 'create'],
    ['Servicio', 'update'],
    ['TerminosYCondiciones', 'update'],
    ['Inventario', 'update'],
    ['InventarioHistorial', 'create'],
    ['Diagnostico', 'update'],
    ['Expense', 'create'],
    ['PurchaseInvoice', 'create'],
    ['Supplier', 'update'],
  ]) {
    assert.equal(authorizeOperationalAction(sales, entity, operation).ok, false, `${entity}.${operation}`);
  }
  pass('SALES receives commercial capabilities without administrative escalation');
}

{
  const technician = authorization('TECHNICIAN');
  for (const [entity, operation] of [
    ['ActividadTecnica', 'create'],
    ['Diagnostico', 'update'],
    ['PreDiagnostico', 'create'],
    ['DiagnosticoEvidencia', 'create'],
  ]) {
    assert.equal(authorizeOperationalAction(technician, entity, operation).ok, true, `${entity}.${operation}`);
  }
  for (const [entity, operation] of [
    ['Venta', 'create'],
    ['Cotizacion', 'create'],
    ['Branch', 'update'],
    ['TerminosYCondiciones', 'create'],
    ['Inventario', 'create'],
    ['Inventario', 'update'],
    ['InventarioHistorial', 'create'],
  ]) {
    assert.equal(authorizeOperationalAction(technician, entity, operation).ok, false, `${entity}.${operation}`);
  }
  pass('TECHNICIAN is confined to technical operations');
}

{
  const branchAdmin = authorization('BRANCH_ADMIN', 'branch-a');
  const scope = getCanonicalBranchScope(branchAdmin);
  assert.equal(scope.branchId, 'branch-a');
  assert.equal(scope.organizationWide, false);
  assert.equal(validateRequestedBranch(scope, 'branch-a').ok, true);
  assert.equal(validateRequestedBranch(scope, 'branch-b').ok, false);
  assert.equal(authorizeRecordBranch(branchAdmin, 'branch-a').ok, true);
  assert.equal(authorizeRecordBranch(branchAdmin, 'branch-b').ok, false);
  assert.equal(authorizeRecordBranch(branchAdmin, null).ok, false);
  for (const entity of ['OrdenTrabajo', 'Venta', 'Inventario', 'Cita', 'Garantia', 'Expense', 'PurchaseInvoice']) {
    assert.equal(authorizeRecordBranch(branchAdmin, 'branch-b').ok, false, `${entity} from Branch B`);
  }
  pass('BRANCH_ADMIN cannot select or mutate Branch B from Branch A');
}

{
  const orgAdmin = authorization('ORG_ADMIN', null);
  const scope = getCanonicalBranchScope(orgAdmin);
  assert.equal(scope.organizationWide, true);
  assert.equal(authorizeRecordBranch(orgAdmin, 'branch-a').ok, true);
  assert.equal(authorizeRecordBranch(orgAdmin, 'branch-b').ok, true);
  assert.equal(validateRequestedBranch(scope, 'branch-b').ok, true);
  pass('ORG_ADMIN retains organization-wide operational scope');
}

{
  const missingBranch = authorization('BRANCH_ADMIN', null);
  const decision = authorizeOperationalAction(missingBranch, 'OrdenTrabajo', 'read');
  assert.equal(decision.ok, false);
  assert.equal(decision.code, 'OPERATIONAL_BRANCH_REQUIRED');
  pass('non-organization roles fail closed without canonical branch membership');
}

{
  const backendOnly = [...PROTECTED_OPERATIONAL_ENTITIES, 'Lead', 'MensajeCliente'];
  for (const entity of backendOnly) {
    const schema = await readJson(`base44/entities/${entity}.jsonc`);
    assert.deepEqual(
      schema.rls,
      { create: false, read: false, update: false, delete: false },
      `${entity} must reject direct SDK/API CRUD`,
    );
  }
  pass(`${backendOnly.length} operational schemas reject direct API bypass`);
}

{
  const [clientAdapter, gateway] = await Promise.all([
    read('src/api/base44Client.js'),
    read('base44/functions/operationalGateway/entry.ts'),
  ]);
  assert.doesNotMatch(clientAdapter, /export\s+\{\s*rawBase44/);
  assert.match(clientAdapter, /operationalGateway/);
  assert.match(clientAdapter, /protectedOperationalEntities/);
  for (const entity of PROTECTED_OPERATIONAL_ENTITIES) {
    assert.match(clientAdapter, new RegExp(`['\"]${entity}['\"]`), `${entity} must route through the gateway`);
  }
  assert.match(gateway, /resolveAuthorizedContext/);
  assert.match(gateway, /authorizeOperationalAction/);
  assert.match(gateway, /sanitizeOperationalFilter/);
  assert.match(gateway, /sanitizeOperationalMutation/);
  assert.match(gateway, /resolveRecordBranchIds/);
  pass('frontend entity compatibility adapter terminates at the governed backend gateway');
}

{
  const sources = await Promise.all([
    read('base44/functions/listWorkOrders/entry.ts'),
    read('base44/functions/getFinancialMetrics/entry.ts'),
    read('base44/functions/reassignWorkOrderTechnician/entry.ts'),
    read('base44/functions/createSale/entry.ts'),
    read('base44/functions/updateInventoryItem/entry.ts'),
    read('base44/functions/adjustInventoryStock/entry.ts'),
    read('base44/functions/getSmartIntakeByWorkOrder/entry.ts'),
    read('base44/functions/customer360Gateway/entry.ts'),
    read('base44/functions/crmGateway/entry.ts'),
  ]);
  for (const source of sources) {
    assert.match(source, /getCanonicalBranchScope|resolveAuthorizedBranch|authorizeRecordBranch/);
  }
  assert.match(sources[0], /branch_id/);
  assert.match(sources[1], /branch_id/);
  assert.match(sources[2], /destination.*branch|branch_id/is);
  pass('orders, metrics, reassignment, sales, inventory, CRM and Customer 360 enforce branch server-side');
}

{
  const [dmr, custody, lifecycleHandler, eventConsumer] = await Promise.all([
    read('base44/functions/dmrOrchestrator/entry.ts'),
    read('base44/functions/updateCustodiaData/entry.ts'),
    read('base44/functions/handleOTLifecycleEvent/entry.ts'),
    read('base44/functions/processOTEvent/entry.ts'),
  ]);
  assert.match(dmr, /canonical OT/i);
  assert.match(dmr, /resolveAuthorizedContext/);
  assert.doesNotMatch(dmr, /const \{ otId, orgId, ot, cliente, equipo \} = body/);
  for (const source of [custody, lifecycleHandler, eventConsumer]) {
    assert.match(source, /authorizeRecordBranch/);
  }
  pass('privileged backend routes do not trust caller-owned tenant or branch context');
}

console.log(`\nOperational Authorization Contract: ${passed} groups PASS`);
