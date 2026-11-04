import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/pages/PuntoVenta.jsx', import.meta.url), 'utf8');
test('opening POS never provisions a catalog item or a default diagnosis price', () => {
  assert.doesNotMatch(source, /verificarOCrearProductoDiagnostico/);
  assert.doesNotMatch(source, /setupProductoDiagnostico/);
  assert.match(source, /base44\.entities\.Inventario\.filter/);
  assert.match(source, /base44\.entities\.Servicio\.filter/);
  assert.match(source, /createSale/);
});
