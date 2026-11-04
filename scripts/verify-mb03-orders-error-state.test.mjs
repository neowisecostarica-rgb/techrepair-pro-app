import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/pages/OrdenesTrabajo.jsx', import.meta.url), 'utf8');
test('work orders have explicit read error and retry instead of false empty lists', () => {
  assert.match(source, /isError: ordersLoadError/);
  assert.match(source, /refetch: retryOrdersLoad/);
  assert.match(source, /No se pudieron consultar las órdenes de trabajo/);
  assert.match(source, /onClick=\{\(\) => retryOrdersLoad\(\)\}/);
  assert.match(source, /vistaActiva === 'kanban' && !ordersLoadError/);
  assert.match(source, /!isLoadingOrdenes && !ordersLoadError && <div className="space-y-4">/);
  assert.match(source, /!isLoadingOrdenes && !ordersLoadError && \(/);
  assert.match(source, /receptionSubmitInFlightRef\.current/);
});
