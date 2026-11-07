import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveExactCatalogItem } from '../src/components/pos/resolveExactCatalogItem.js';
const items = [
  { id: 'a', nombre: 'Disco SSD', sku: 'SSD-500', codigo_barras: '745000001', codigo_interno: 'TRP-001' },
  { id: 'b', nombre: 'Memoria', sku: 'RAM-16', codigo_barras: '745000002', codigo_interno: 'TRP-002' },
];
test('scanner matches barcode and customer-defined SKU', () => {
  assert.equal(resolveExactCatalogItem(items, '745000001').item.id, 'a');
  assert.equal(resolveExactCatalogItem(items, ' ssd-500 ').item.id, 'a');
});
test('internal code never resolves a sale item', () => {
  assert.equal(resolveExactCatalogItem(items, 'TRP-001').status, 'not_found');
});
test('unknown and blank codes do not match', () => {
  assert.equal(resolveExactCatalogItem(items, 'missing').status, 'not_found');
  assert.equal(resolveExactCatalogItem(items, ' ').status, 'empty');
});
test('duplicate barcodes or SKUs are never auto-added', () => {
  assert.equal(resolveExactCatalogItem([...items, { id: 'c', codigo_barras: '745000001' }], '745000001').status, 'ambiguous');
  assert.equal(resolveExactCatalogItem([...items, { id: 'c', sku: 'SSD-500' }], 'SSD-500').status, 'ambiguous');
});
test('unique barcode has precedence over a matching SKU', () => {
  const catalog = [...items, { id: 'c', sku: '745000001' }];
  assert.equal(resolveExactCatalogItem(catalog, '745000001').item.id, 'a');
});
