import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/pages/PuntoVenta.jsx', import.meta.url), 'utf8');
test('POS confirmation locks synchronously before any await and releases after completion', () => {
  const handler = source.split('const confirmarYProcesarVenta = async () => {')[1]?.split('const handleSearchKeyDown')[0];
  assert.ok(handler);
  const guard = handler.indexOf('if (saleConfirmationLock.current || createVentaMutation.isPending) return;');
  const lock = handler.indexOf('saleConfirmationLock.current = true;');
  const firstAwait = handler.indexOf('await ');
  assert.ok(guard >= 0 && lock > guard && firstAwait > lock, 'lock must precede first await');
  assert.match(handler, /await createVentaMutation\.mutateAsync\(ventaData\)/);
  assert.match(handler, /finally\s*\{\s*saleConfirmationLock\.current = false;/);
  assert.match(source, /disabled=\{isPreparingSale \|\| createVentaMutation\.isPending\}/);
  assert.match(source, /idempotency_key: idempotencyKey/);
});
