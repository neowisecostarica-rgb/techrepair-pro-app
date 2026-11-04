import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../src/pages/Operacion.jsx',import.meta.url),'utf8');
test('current technician workload does not inherit the date filter from historical charts',()=>{
  assert.match(source,/const ordenesTrabajo = todasLasOrdenes\.filter/);
  assert.match(source,/const cargaPorTecnico = \{\};\s*todasLasOrdenes\.forEach/);
  assert.match(source,/Carga actual por Técnico/);
  assert.match(source,/No hay OTs creadas en el período seleccionado/);
});
test('quote and warranty metric failures cannot look like zero and respect branch scope',()=>{
  assert.match(source,/isPending: quotesPending, isError: quotesError/);
  assert.match(source,/isPending: warrantiesPending, isError: warrantiesError/);
  assert.match(source,/cotizacionesPendientes = quotesVerified \?/);
  assert.match(source,/garantiasPorVencer = warrantiesVerified \?/);
  assert.match(source,/cotizacionesPendientes === null \? '—'/);
  assert.match(source,/garantiasPorVencer === null \? '—'/);
  assert.match(source,/retryQuotes\(\)/);
  assert.match(source,/retryWarranties\(\)/);
  assert.match(source,/queryKey: \['garantias-op', effectiveOrgId, branchIdFijo, sucursalId\]/);
  assert.match(source,/branchIdFijo \? \{ branch_id: branchIdFijo \}/);
});
