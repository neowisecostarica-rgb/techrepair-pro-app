import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import {
  EXPECTED_APP_ID,
  EXPECTED_APP_NAME,
  FUNCTION_NAME,
  assertExecutionSafety,
  createCertificationClient,
  runCertification,
  runConcurrentPair,
} from './run-aud01b-staging-probe.mjs';

const functionPath = 'probes/aud01b/base44/functions/aud01b-certification-probe/entry.ts';
const functionDirectory = dirname(resolve(functionPath));
const bundledWriterPath = 'probes/aud01b/base44/functions/aud01b-certification-probe/auditEvent.ts';
const canonicalWriterPath = 'base44/functions/_shared/auditEvent.ts';
const probeSchemaPath = 'probes/aud01b/base44/entities/Aud01bCasProbe.jsonc';

const sha256 = content => createHash('sha256').update(content).digest('hex');

test('target guard rejects missing execution consent and every other app ID without requiring a raw token', () => {
  assert.equal(FUNCTION_NAME, 'aud01b-certification-probe');
  assert.throws(() => assertExecutionSafety({
    execute: false,
    appId: EXPECTED_APP_ID,
    appName: EXPECTED_APP_NAME,
  }), /pass --execute explicitly/);
  assert.throws(() => assertExecutionSafety({
    execute: true,
    appId: '695d708948469128f473d080',
    appName: EXPECTED_APP_NAME,
  }), /unexpected app ID/);
  assert.throws(() => assertExecutionSafety({
    execute: true,
    appId: EXPECTED_APP_ID,
    appName: 'TechRepair Pro',
  }), /unexpected app name/);
});

test('interactive login uses the Base44 SDK and refuses a non-admin session without exposing a token', async () => {
  const calls = [];
  const client = {
    auth: {
      async loginViaEmailPassword(email, password) {
        calls.push({ email, password });
        return { access_token: 'not-logged', user: { role: 'admin' } };
      },
    },
  };
  const result = await createCertificationClient({
    appId: EXPECTED_APP_ID,
    createClient: options => {
      assert.deepEqual(options, { appId: EXPECTED_APP_ID });
      return client;
    },
    requestCredentials: async () => ({ email: 'staging-admin@example.test', password: 'hidden-password' }),
  });
  assert.equal(result, client);
  assert.deepEqual(calls, [{ email: 'staging-admin@example.test', password: 'hidden-password' }]);

  await assert.rejects(() => createCertificationClient({
    appId: EXPECTED_APP_ID,
    createClient: () => ({ auth: { loginViaEmailPassword: async () => ({ user: { role: 'user' } }) } }),
    requestCredentials: async () => ({ email: 'staging-user@example.test', password: 'hidden-password' }),
  }), /staging admin role required/);
});

test('parallel helper starts both writer requests before either completes', async () => {
  let started = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const invoke = async payload => {
    started += 1;
    if (started === 2) release();
    await gate;
    return payload.label;
  };
  const results = await runConcurrentPair(invoke, { label: 'A' }, { label: 'B' });
  assert.equal(started, 2);
  assert.deepEqual(results.map(result => result.status), ['fulfilled', 'fulfilled']);
  assert.deepEqual(results.map(result => result.value), ['A', 'B']);
});

test('compatible orchestration requires exactly one create, one duplicate and a released claim', async () => {
  let writerCalls = 0;
  const invoke = async payload => {
    if (payload.action === 'prepare') return { organization_id: 'organization-cert-0001' };
    if (payload.action === 'invoke_writer') {
      writerCalls += 1;
      return { duplicate: writerCalls === 2, reconciled: false, event_id: 'event-cert-0001' };
    }
    if (payload.action === 'inspect') {
      return { event_count: 1, event_ids: ['event-cert-0001'], claim: { present: false } };
    }
    throw new Error(`Unexpected action: ${payload.action}`);
  };
  const report = await runCertification({
    scenarios: ['compatible'],
    cleanup: false,
    invoke,
    runId: 'run-local-contract-0001',
  });
  assert.equal(report.disposition, 'PASS');
  assert.equal(writerCalls, 2);
});

test('full local orchestration enforces every scenario invariant', async () => {
  const throwCode = code => {
    const error = new Error(code);
    error.code = code;
    throw error;
  };
  const invoke = async payload => {
    if (payload.action === 'prepare') return { organization_id: `organization-${payload.scenario}-0001` };
    if (payload.action === 'seed_ambiguous') return { event_ids: ['event-1', 'event-2'] };
    if (payload.action === 'inspect') {
      const eventCounts = {
        compatible: 1,
        incompatible: 1,
        ownership_loss: 0,
        create_persisted_uncertain: 1,
        create_unproven: 0,
        non_owner_release: 1,
        ambiguous_existing: 2,
      };
      return {
        event_count: eventCounts[payload.scenario],
        event_ids: [],
        claim: { present: ['ownership_loss', 'create_unproven', 'non_owner_release'].includes(payload.scenario) },
      };
    }
    if (payload.action !== 'invoke_writer') throw new Error(`Unexpected action: ${payload.action}`);
    if (payload.scenario === 'compatible') {
      return { duplicate: payload.caller_label === 'CALLER_B', reconciled: false, event_id: 'event-compatible' };
    }
    if (payload.scenario === 'incompatible') {
      if (payload.identity_variant === 'B') return throwCode('AUDIT_OPERATION_ID_COLLISION');
      return { duplicate: false, reconciled: false, event_id: 'event-incompatible' };
    }
    if (payload.scenario === 'ownership_loss') return throwCode('AUDIT_CLAIM_RECOVERY_REQUIRED');
    if (payload.scenario === 'create_persisted_uncertain') {
      return { duplicate: true, reconciled: true, event_id: 'event-reconciled' };
    }
    if (payload.scenario === 'create_unproven') return throwCode('AUD01B_INJECTED_CREATE_UNPROVEN');
    if (payload.scenario === 'non_owner_release') {
      return { duplicate: payload.caller_label === 'CALLER_REPLAY', reconciled: false, event_id: 'event-non-owner' };
    }
    if (payload.scenario === 'ambiguous_existing') return throwCode('AUDIT_OPERATION_ID_AMBIGUOUS');
    throw new Error(`Unexpected scenario: ${payload.scenario}`);
  };
  const report = await runCertification({
    scenarios: [
      'compatible',
      'incompatible',
      'ownership_loss',
      'create_persisted_uncertain',
      'create_unproven',
      'non_owner_release',
      'ambiguous_existing',
    ],
    cleanup: false,
    invoke,
    runId: 'run-local-contract-all-0001',
  });
  assert.equal(report.disposition, 'PASS');
  assert.equal(report.results.length, 7);
  assert.ok(report.results.every(result => result.pass));
});

test('certification function is staging-only and checks the sentinel before dispatch', async () => {
  const source = await readFile(functionPath, 'utf8');
  assert.match(source, new RegExp(EXPECTED_APP_ID));
  assert.match(source, new RegExp(EXPECTED_APP_NAME));
  assert.match(source, /Aud01bCasProbe\.filter/);
  assert.match(source, /claim_state !== 'TARGET_CONFIRMED'/);
  assert.match(source, /AUD01B_PROBE_TARGET_REFUSED/);
  assert.match(source, /AUD01B_PROBE_NON_DISPOSABLE_ORGANIZATION_REFUSED/);
  assert.ok(source.indexOf('await assertCertificationTarget(base44, body)') < source.indexOf("body.action === 'prepare'"));
});

test('certification function and bundled writer transpile as Deno TypeScript modules', async () => {
  for (const modulePath of [functionPath, bundledWriterPath]) {
    const source = await readFile(modulePath, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: modulePath,
      reportDiagnostics: true,
    });
    assert.deepEqual(output.diagnostics || [], [], modulePath);
  }
});

test('bundled writer is byte-identical to the canonical candidate writer', async () => {
  const [canonicalWriter, bundledWriter, entry] = await Promise.all([
    readFile(canonicalWriterPath),
    readFile(bundledWriterPath),
    readFile(functionPath),
  ]);
  assert.deepEqual(bundledWriter, canonicalWriter);
  assert.equal(sha256(bundledWriter), sha256(canonicalWriter));
  assert.equal(sha256(bundledWriter), '27c2360c2394ba27149d0acff5c7238148423a50a52795c2142f8d7289baccc0');
  assert.equal(sha256(entry), '6fa2c9bc6c47903b6f4634c76be4ae32d6c3fb28b86d2689612a07796c9906b3');
});

test('every relative import stays inside the certification function directory', async () => {
  const modulePaths = [functionPath, bundledWriterPath];
  const relativeSpecifiers = [];
  for (const modulePath of modulePaths) {
    const source = await readFile(modulePath, 'utf8');
    const importPattern = /(?:from\s+|import\s*)['"]([^'"]+)['"]/g;
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue;
      relativeSpecifiers.push({ modulePath, specifier });
      const resolvedImport = resolve(dirname(resolve(modulePath)), specifier);
      const localPath = relative(functionDirectory, resolvedImport);
      assert.ok(localPath && !localPath.startsWith('..') && !isAbsolute(localPath), `${modulePath}: ${specifier}`);
      await readFile(resolvedImport);
    }
  }
  assert.deepEqual(relativeSpecifiers, [{ modulePath: functionPath, specifier: './auditEvent.ts' }]);
});

test('fault injection covers ownership loss and both uncertain-create outcomes', async () => {
  const source = await readFile(functionPath, 'utf8');
  for (const marker of [
    'loss_before_create',
    'persist_then_throw',
    'throw_before_persist',
    'suppress_release',
    'AUD01B_INJECTED_CREATE_UNPROVEN',
    'AUD01B_INJECTED_CREATE_RESPONSE_LOST',
  ]) assert.ok(source.includes(marker), marker);
});

test('canonical resources contain the persisted-ownership implementation', async () => {
  const [writer, organization, auditEvent, probeSchema] = await Promise.all([
    readFile(canonicalWriterPath, 'utf8'),
    readFile('base44/entities/Organization.jsonc', 'utf8'),
    readFile('base44/entities/AuditEvent.jsonc', 'utf8'),
    readFile(probeSchemaPath, 'utf8'),
  ]);
  for (const marker of ['assertAuditClaimOwned', 'confirmAuditVisible', 'AUDIT_OPERATION_ID_AMBIGUOUS']) {
    assert.ok(writer.includes(marker), marker);
  }
  for (const field of ['audit_claim_token', 'audit_claim_operation_id', 'audit_claim_identity_hash', 'audit_claimed_at']) {
    assert.ok(organization.includes(`"${field}"`), field);
  }
  assert.ok(auditEvent.includes('"audit_operation_id"'));
  assert.ok(probeSchema.includes('Disposable records used only'));
});

test('CLI entry refuses to initialize Base44 without --execute', () => {
  const result = spawnSync(process.execPath, ['scripts/run-aud01b-staging-probe.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {},
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /AUD01B_PROBE_REFUSED/);
});

test('runner help documents hidden interactive credentials and forbids raw token input', () => {
  const result = spawnSync(process.execPath, ['scripts/run-aud01b-staging-probe.mjs', '--help'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {},
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /hidden password/);
  assert.match(result.stdout, /never requests, prints or stores a raw access token/);
  assert.doesNotMatch(result.stdout, /AUD01B_CERT_TOKEN/);
});
