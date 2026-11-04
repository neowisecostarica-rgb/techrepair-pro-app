import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/pages/VentasCotizaciones.jsx', import.meta.url), 'utf8');
test('quote preparation keeps backend send separate from sharing and catches both errors', () => {
  const action = source.split('const enviarCotizacion = async (cotizacion) => {')[1]?.split('// Escuchar eventos')[0];
  assert.ok(action, 'preparation handler exists');
  assert.match(action, /if \(!cotizacion \|\| sendingQuoteId\) return/);
  assert.match(action, /await base44\.functions\.invoke\('approveCotizacion'/);
  assert.match(action, /if \(!response\?\.data\?\.success\)/);
  assert.match(action, /setCotizacionSeleccionada\(updatedQuote\)/);
  assert.match(action, /const link = await emitirEnlaceCotizacion/);
  assert.match(action, /await navigator\.clipboard\.writeText\(link\)/);
  assert.match(action, /Cotización preparada; enlace no copiado/);
  assert.match(action, /No se pudo preparar la cotización/);
  assert.match(action, /finally\s*\{\s*setSendingQuoteId\(null\)/);
  assert.match(source, /disabled=\{!!sendingQuoteId\}/);
});
