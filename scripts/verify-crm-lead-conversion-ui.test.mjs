import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/pages/CRM.jsx', import.meta.url), 'utf8');
test('CRM lead conversion only closes after server success', () => {
  const mutation = source.split('const convertToClienteMutation = useMutation({')[1]?.split('const handleCreateLead')[0];
  assert.ok(mutation, 'conversion mutation exists');
  assert.match(mutation, /onSuccess:[\s\S]*?setLeadToConvert\(null\)/);
  assert.match(mutation, /onError:[\s\S]*?No se pudo convertir el prospecto/);
  const handler = source.split('const confirmLeadConversion = () => {')[1]?.split('const handleQuickStatusChange')[0];
  assert.ok(handler, 'confirmation handler exists');
  assert.match(handler, /if \(convertToClienteMutation\.isPending\) return;/);
  assert.match(handler, /convertToClienteMutation\.mutate\(/);
  assert.doesNotMatch(handler, /setLeadToConvert\(null\)/);
  assert.match(source, /disabled=\{convertToClienteMutation\.isPending\}/);
});
