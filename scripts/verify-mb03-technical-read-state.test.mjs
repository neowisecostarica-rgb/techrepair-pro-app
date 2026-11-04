import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/expediente/ExpedienteTecnico.jsx', import.meta.url), 'utf8');
test('technical records show unavailable distinct from missing and permit retry', () => {
  for (const [entity, state] of [['dmr','dmrFailed'],['diag','diagnosisFailed'],['doc','documentFailed'],['evidencias','evidenceFailed']]) {
    assert.match(source, new RegExp('isError: ' + state), entity);
  }
  for (const name of ['retryDMR','retryDiagnosis','retryDocument','retryEvidence']) assert.ok(source.includes(name + '()'), name);
  assert.match(source, /Información técnica sin verificar/);
  assert.match(source, /dmrFailed \? <Badge/);
  assert.match(source, /diagnosisFailed \? <Badge/);
  assert.match(source, /loadingDMR \? \(/);
  assert.match(source, /loadingDiagnosis \? \(/);
  assert.match(source, /No fue posible verificar el diagnóstico técnico/);
});
