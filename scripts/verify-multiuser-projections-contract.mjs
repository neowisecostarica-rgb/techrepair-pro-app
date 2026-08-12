import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PROJECTION_VERSION,
  assertProjectionExcludes,
  projectCustomerQuote,
  projectCustomerServiceWorkOrder,
  projectInventoryAdmin,
  projectInventoryRead,
  projectWorkOrderAssignedTechnical,
  projectWorkOrderList,
  projectWorkOrderTeamAwareness,
} from '../base44/functions/_shared/dataProjections.ts';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
let passed = 0;
const pass = name => { passed += 1; console.log(`PASS ${name}`); };
const secrets = ['contrasena_ingreso', 'public_access_token', 'public_access_expires_at', 'terminos_texto_snapshot', 'costo_unitario', 'margen', 'lifecycle_lock_token', 'qa_cycle_id'];

const workOrder = {
  id: 'ot-a', codigo_ot: 'OT-A', organization_id: 'org-a', branch_id: 'branch-a', cliente_id: 'customer-a', equipo_id: 'equipment-a',
  estado: 'EN_REVISION', estado_atencion: 'ACTIVO', prioridad: 'normal', tecnico_asignado_id: 'user-a', motivo_ingreso: 'No enciende',
  diagnostico_resumido: 'Fuente', contrasena_ingreso: '1234', public_access_token: 'secret-token', costo_unitario: 50,
  lifecycle_lock_token: 'lock', qa_cycle_id: 'qa-secret', created_date: '2026-01-01T00:00:00.000Z',
};
const customer = { id: 'customer-a', nombre_completo: 'Ada', telefono: '555', email: 'ada@example.com', notas: 'private' };
const equipment = { id: 'equipment-a', tipo: 'Laptop', marca: 'X', modelo: 'Y', serie: 'Z', fotos: ['safe-technical-photo'] };

{
  assert.equal(PROJECTION_VERSION, 'TRP_MULTIUSER_PROJECTIONS_V2_2C');
  const dto = projectWorkOrderList(workOrder, customer, equipment);
  assert.equal(dto.cliente_nombre_completo, 'Ada');
  assert.equal(dto.equipo_display, 'Laptop X Y Z');
  assert.equal(dto.created_at, workOrder.created_date);
  assert.equal(assertProjectionExcludes(dto, secrets), true);
  assert.equal(Object.hasOwn(dto, 'cliente'), false);
  pass('operational list is allowlisted and never embeds raw joined entities');
}

{
  const dto = projectWorkOrderTeamAwareness(workOrder, equipment);
  assert.equal(dto.diagnostico_resumido, 'Fuente');
  assert.equal(Object.hasOwn(dto, 'cliente_id'), false);
  assert.equal(assertProjectionExcludes(dto, [...secrets, 'telefono', 'email']), true);
  pass('team awareness contains coordination fields without customer PII or credential');
}

{
  const dto = projectWorkOrderAssignedTechnical(workOrder, customer, equipment, { technical_request_ids: ['request-a'], injected: ['no'] });
  assert.equal(dto.cliente_nombre_completo, 'Ada');
  assert.deepEqual(dto.technical_request_ids, ['request-a']);
  assert.equal(Object.hasOwn(dto, 'injected'), false);
  assert.equal(assertProjectionExcludes(dto, secrets), true);
  assert.equal(Object.hasOwn(dto, 'telefono'), false);
  pass('assigned technical DTO denies credential, QA internals and customer contact');
}

{
  const item = { id: 'inv-a', branch_id: 'branch-a', nombre: 'Part', cantidad_disponible: 2, costo_unitario: 3, proveedor: 'Supplier', public_access_token: 'bad' };
  assert.equal(Object.hasOwn(projectInventoryRead(item), 'costo_unitario'), false);
  assert.equal(projectInventoryAdmin(item).costo_unitario, 3);
  assert.equal(Object.hasOwn(projectInventoryAdmin(item), 'public_access_token'), false);
  pass('inventory read and admin projections separate unit cost without adding unrelated secrets');
}

{
  const dto = projectCustomerServiceWorkOrder({ ...workOrder, fecha_entrega_estimada: '2026-01-10', delivery_commercial_snapshot: { cost: 1 } });
  assert.equal(dto.estado, 'EN_REVISION');
  assert.equal(assertProjectionExcludes(dto, [...secrets, 'delivery_commercial_snapshot']), true);
  const quote = projectCustomerQuote({ id: 'q-a', items: [{ id: 'line-a', descripcion: 'Part', cantidad: 1, precio_unitario: 10, costo_unitario: 3 }], total: 10, public_access_token: 'bad' });
  assert.equal(quote.items[0].precio_unitario, 10);
  assert.equal(Object.hasOwn(quote.items[0], 'costo_unitario'), false);
  assert.equal(Object.hasOwn(quote, 'public_access_token'), false);
  pass('Customer Service and quote DTOs preserve customer-facing state and deny costs/tokens');
}

{
  const [listSource, customer360Source, credentialSource, technicalSource] = await Promise.all([
    read('base44/functions/listWorkOrders/entry.ts'),
    read('base44/functions/customer360Gateway/entry.ts'),
    read('base44/functions/revealDeviceCredential/entry.ts'),
    read('base44/functions/getWorkOrderTechnicalContext/entry.ts'),
  ]);
  assert.doesNotMatch(listSource, /\.\.\.orden/);
  assert.match(listSource, /projectWorkOrderList/);
  assert.match(customer360Source, /CUSTOMER_360_AUTHORIZED/);
  assert.doesNotMatch(customer360Source, /return Response\.json\(\{ cliente, ordenes/);
  assert.match(credentialSource, /EFFECTIVE_TECHNICIAN_REQUIRED/);
  assert.match(credentialSource, /appendAuditEvent/);
  assert.match(technicalSource, /WORK_ORDER_TEAM_AWARENESS/);
  assert.match(technicalSource, /WORK_ORDER_ASSIGNED_TECHNICAL/);
  pass('protected endpoints route through named DTOs and credential reveal is isolated/audited');
}

console.log(`\nMulti-user projections: ${passed} groups PASS`);

