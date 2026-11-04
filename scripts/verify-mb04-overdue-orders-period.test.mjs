import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../src/pages/Operacion.jsx', import.meta.url),'utf8');
test('overdue orders are not hidden by chart period and tenant scope is retained',()=>{
  assert.match(source,/query = \{ organization_id: effectiveOrgId \}/);
  assert.match(source,/query\.branch_id = branchIdFijo/);
  assert.match(source,/const ordenesTrabajo = todasLasOrdenes\.filter\(ot =>/);
  assert.match(source,/const otsActivas = todasLasOrdenes\.filter\(ot =>/);
  assert.match(source,/const otsDemoradas = todasLasOrdenes\.filter\(ot =>/);
  assert.match(source,/const otsEnCola = todasLasOrdenes\.filter/);
  assert.match(source,/isError: ordersFailed/);
  assert.match(source,/No se pudieron consultar las órdenes de Operación/);
  assert.match(source,/onClick=\{\(\) => retryOrders\(\)\}/);
});
