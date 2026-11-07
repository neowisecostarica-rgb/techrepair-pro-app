import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const management = readFileSync('src/components/ventas/GestionCotizaciones.jsx', 'utf8');
const form = readFileSync('src/components/cotizacion/FormularioCotizacion.jsx', 'utf8');
test('quote management inventory reads are tenant and branch scoped, with a cache per scope', () => {
  assert.match(management, /queryKey: \['inventario-disponible', organizationId, organizationWide \? 'all' : branchId\]/);
  assert.match(management, /organization_id: organizationId,[\s\S]*?\.\.\.\(!organizationWide \? \{ branch_id: branchId \} : \{\}\)/);
  assert.match(management, /enabled: canReadInventory/);
});
test('quote management client details are tenant and branch scoped', () => {
  assert.match(management, /queryKey: \['cliente', organizationId, clienteActual, organizationWide \? 'all' : branchId\]/);
  assert.match(management, /id: clienteActual,\s*organization_id: organizationId,/);
});
test('both quote search surfaces use customer codes, not TRP internal codes', () => {
  for (const source of [management, form]) {
    const search = source.split('const productosInventario = inventario')[1]?.split('.map(p =>')[0];
    assert.ok(search, 'missing inventory search block');
    assert.match(search, /p\.sku\?/);
    assert.match(search, /p\.codigo_barras\?/);
    assert.doesNotMatch(search, /codigo_interno/);
  }
});
