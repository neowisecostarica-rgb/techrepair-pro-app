import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';

export const EXPECTED_APP_ID = '6a831a96fe7af85246647a99';
export const EXPECTED_APP_NAME = 'TRP-AUD01B-CAS-CERT-DO-NOT-PUBLISH';
export const CANDIDATE_SHA = '97e3a37831ec9130b87c9b16e9e4aca3739d85fc';
export const BASE_SHA = '1eb93a4a4b34c41561de95046dfa1880376f8dbc';
export const FUNCTION_NAME = 'aud01b-certification-probe';

const ALL_SCENARIOS = [
  'compatible',
  'incompatible',
  'ownership_loss',
  'create_persisted_uncertain',
  'create_unproven',
  'non_owner_release',
  'ambiguous_existing',
];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function assertExecutionSafety({ execute, appId, appName }) {
  invariant(execute === true, 'AUD01B_PROBE_REFUSED: pass --execute explicitly');
  invariant(appId === EXPECTED_APP_ID, 'AUD01B_PROBE_REFUSED: unexpected app ID');
  invariant(appName === EXPECTED_APP_NAME, 'AUD01B_PROBE_REFUSED: unexpected app name');
}

async function promptLine(label) {
  if (!process.stdin.isTTY) throw new Error('AUD01B_PROBE_REFUSED: interactive terminal required');
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await readline.question(label)).trim();
  } finally {
    readline.close();
  }
}

async function promptHidden(label) {
  if (!process.stdin.isTTY) throw new Error('AUD01B_PROBE_REFUSED: interactive terminal required');
  return new Promise((resolve, reject) => {
    let value = '';
    const input = process.stdin;
    const finish = callback => {
      input.setRawMode(false);
      input.pause();
      input.removeListener('data', onData);
      callback();
    };
    const onData = chunk => {
      const text = chunk.toString('utf8');
      for (const character of text) {
        if (character === '\r' || character === '\n') {
          process.stdout.write('\n');
          finish(() => resolve(value));
          return;
        }
        if (character === '\u0003') {
          finish(() => reject(new Error('AUD01B_PROBE_REFUSED: interactive login cancelled')));
          return;
        }
        if (character === '\b' || character === '\u007f') {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };
    process.stdout.write(label);
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

async function promptCredentials() {
  const email = await promptLine('Staging admin email: ');
  const password = await promptHidden('Staging admin password: ');
  invariant(email.length > 0, 'AUD01B_PROBE_REFUSED: staging admin email required');
  invariant(password.length > 0, 'AUD01B_PROBE_REFUSED: staging admin password required');
  return { email, password };
}

export async function createCertificationClient({ appId, createClient, requestCredentials }) {
  const client = createClient({ appId });
  const { email, password } = await requestCredentials();
  const session = await client.auth.loginViaEmailPassword(email, password);
  invariant(session?.user?.role === 'admin', 'AUD01B_PROBE_REFUSED: staging admin role required');
  return client;
}

export async function runConcurrentPair(invoke, left, right) {
  return Promise.allSettled([
    Promise.resolve().then(() => invoke(left)),
    Promise.resolve().then(() => invoke(right)),
  ]);
}

function unwrapFunctionResponse(response) {
  const body = response?.data ?? response;
  if (!body?.ok) {
    const error = new Error(body?.error?.code || 'AUD01B_PROBE_REMOTE_ERROR');
    error.code = body?.error?.code || 'AUD01B_PROBE_REMOTE_ERROR';
    throw error;
  }
  return body.result;
}

function normalizeRejection(reason) {
  const body = reason?.response?.data ?? reason?.data;
  return {
    code: body?.error?.code || reason?.code || reason?.message || 'UNKNOWN_ERROR',
  };
}

function compactSettled(results) {
  return results.map(result => result.status === 'fulfilled'
    ? { status: 'fulfilled', value: result.value }
    : { status: 'rejected', reason: normalizeRejection(result.reason) });
}

function countStatus(results, status) {
  return results.filter(result => result.status === status).length;
}

function assertCompatible(results, inspection) {
  invariant(countStatus(results, 'fulfilled') === 2, 'compatible: both callers must complete');
  const duplicates = results.map(result => result.value.duplicate).sort();
  invariant(JSON.stringify(duplicates) === JSON.stringify([false, true]), 'compatible: expected one create and one duplicate');
  invariant(inspection.event_count === 1, 'compatible: expected exactly one event');
  invariant(inspection.claim.present === false, 'compatible: claim must be released');
}

function assertIncompatible(results, inspection) {
  invariant(countStatus(results, 'fulfilled') === 1, 'incompatible: expected one winner');
  invariant(countStatus(results, 'rejected') === 1, 'incompatible: expected one rejected caller');
  const rejected = results.find(result => result.status === 'rejected');
  invariant(rejected.reason.code === 'AUDIT_OPERATION_ID_COLLISION', 'incompatible: expected collision');
  invariant(inspection.event_count === 1, 'incompatible: expected exactly one event');
  invariant(inspection.claim.present === false, 'incompatible: claim must be released');
}

function assertOwnershipLoss(results, inspection) {
  invariant(results[0]?.status === 'rejected', 'ownership_loss: writer must fail closed');
  invariant(results[0].reason.code === 'AUDIT_CLAIM_RECOVERY_REQUIRED', 'ownership_loss: expected recovery-required');
  invariant(inspection.event_count === 0, 'ownership_loss: create must not run');
  invariant(inspection.claim.present === true, 'ownership_loss: foreign claim must remain');
}

function assertPersistedUncertain(results, inspection) {
  invariant(results[0]?.status === 'fulfilled', 'create_persisted_uncertain: writer must reconcile');
  invariant(results[0].value.duplicate === true && results[0].value.reconciled === true,
    'create_persisted_uncertain: expected reconciled duplicate');
  invariant(inspection.event_count === 1, 'create_persisted_uncertain: expected one event');
  invariant(inspection.claim.present === false, 'create_persisted_uncertain: claim must be released');
}

function assertUnprovenCreate(results, inspection) {
  invariant(results[0]?.status === 'rejected', 'create_unproven: writer must report failure');
  invariant(results[0].reason.code === 'AUD01B_INJECTED_CREATE_UNPROVEN', 'create_unproven: expected injected failure');
  invariant(inspection.event_count === 0, 'create_unproven: no event may be visible');
  invariant(inspection.claim.present === true, 'create_unproven: claim must be retained');
}

function assertNonOwnerRelease(results, inspection) {
  invariant(countStatus(results, 'fulfilled') === 2, 'non_owner_release: both calls must complete');
  invariant(results[1].value.duplicate === true, 'non_owner_release: replay must be duplicate');
  invariant(inspection.event_count === 1, 'non_owner_release: expected one event');
  invariant(inspection.claim.present === true, 'non_owner_release: replay must not clear the active claim');
}

function assertAmbiguous(results, inspection) {
  invariant(results[0]?.status === 'rejected', 'ambiguous_existing: writer must fail closed');
  invariant(results[0].reason.code === 'AUDIT_OPERATION_ID_AMBIGUOUS', 'ambiguous_existing: expected ambiguity');
  invariant(inspection.event_count === 2, 'ambiguous_existing: seeded ambiguity must remain visible');
  invariant(inspection.claim.present === false, 'ambiguous_existing: no claim may be acquired');
}

function parseArguments(argv) {
  const options = { execute: false, cleanup: false, scenarios: [...ALL_SCENARIOS] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--execute') options.execute = true;
    else if (arg === '--cleanup') options.cleanup = true;
    else if (arg === '--scenario') {
      const scenario = argv[index + 1];
      invariant(ALL_SCENARIOS.includes(scenario), `Unknown scenario: ${scenario || '<missing>'}`);
      options.scenarios = [scenario];
      index += 1;
    } else if (arg === '--help') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function invocationPayload(context, overrides = {}) {
  return {
    app_id: EXPECTED_APP_ID,
    app_name: EXPECTED_APP_NAME,
    run_id: context.runId,
    scenario: context.scenario,
    organization_id: context.organizationId,
    ...overrides,
  };
}

async function executeScenario({ scenario, runId, invoke, cleanup }) {
  const context = { scenario, runId, organizationId: null };
  const prepared = await invoke({
    app_id: EXPECTED_APP_ID,
    app_name: EXPECTED_APP_NAME,
    action: 'prepare',
    run_id: runId,
    scenario,
  });
  context.organizationId = prepared.organization_id;

  let settled;
  try {
    const releaseEpochMs = Date.now() + 2_000;
    if (scenario === 'compatible' || scenario === 'incompatible') {
      settled = compactSettled(await runConcurrentPair(invoke,
        invocationPayload(context, {
          action: 'invoke_writer',
          caller_label: 'CALLER_A',
          identity_variant: 'A',
          release_epoch_ms: releaseEpochMs,
          fault_mode: 'none',
        }),
        invocationPayload(context, {
          action: 'invoke_writer',
          caller_label: 'CALLER_B',
          identity_variant: scenario === 'incompatible' ? 'B' : 'A',
          release_epoch_ms: releaseEpochMs,
          fault_mode: 'none',
        })));
    } else if (scenario === 'non_owner_release') {
      const first = await Promise.allSettled([invoke(invocationPayload(context, {
        action: 'invoke_writer',
        caller_label: 'CALLER_OWNER',
        identity_variant: 'A',
        release_epoch_ms: Date.now(),
        fault_mode: 'suppress_release',
      }))]);
      const second = await Promise.allSettled([invoke(invocationPayload(context, {
        action: 'invoke_writer',
        caller_label: 'CALLER_REPLAY',
        identity_variant: 'A',
        release_epoch_ms: Date.now(),
        fault_mode: 'none',
      }))]);
      settled = compactSettled([first[0], second[0]]);
    } else if (scenario === 'ambiguous_existing') {
      await invoke(invocationPayload(context, { action: 'seed_ambiguous' }));
      settled = compactSettled(await Promise.allSettled([invoke(invocationPayload(context, {
        action: 'invoke_writer',
        caller_label: 'CALLER_AMBIGUOUS',
        identity_variant: 'A',
        release_epoch_ms: Date.now(),
        fault_mode: 'none',
      }))]));
    } else {
      const faultModes = {
        ownership_loss: 'loss_before_create',
        create_persisted_uncertain: 'persist_then_throw',
        create_unproven: 'throw_before_persist',
      };
      settled = compactSettled(await Promise.allSettled([invoke(invocationPayload(context, {
        action: 'invoke_writer',
        caller_label: 'CALLER_FAULT',
        identity_variant: 'A',
        release_epoch_ms: Date.now(),
        fault_mode: faultModes[scenario],
      }))]));
    }

    const inspection = await invoke(invocationPayload(context, { action: 'inspect' }));
    if (scenario === 'compatible') assertCompatible(settled, inspection);
    else if (scenario === 'incompatible') assertIncompatible(settled, inspection);
    else if (scenario === 'ownership_loss') assertOwnershipLoss(settled, inspection);
    else if (scenario === 'create_persisted_uncertain') assertPersistedUncertain(settled, inspection);
    else if (scenario === 'create_unproven') assertUnprovenCreate(settled, inspection);
    else if (scenario === 'non_owner_release') assertNonOwnerRelease(settled, inspection);
    else if (scenario === 'ambiguous_existing') assertAmbiguous(settled, inspection);
    return { scenario, pass: true, calls: settled, inspection };
  } catch (error) {
    let inspection = null;
    try {
      if (context.organizationId) inspection = await invoke(invocationPayload(context, { action: 'inspect' }));
    } catch {
      // Preserve the primary certification failure.
    }
    return {
      scenario,
      pass: false,
      error: normalizeRejection(error),
      calls: settled || [],
      inspection,
    };
  } finally {
    if (cleanup && context.organizationId) {
      await invoke(invocationPayload(context, { action: 'cleanup' }));
    }
  }
}

export async function runCertification({ scenarios, cleanup, invoke, runId }) {
  const results = [];
  for (const scenario of scenarios) {
    results.push(await executeScenario({ scenario, runId, invoke, cleanup }));
  }
  return {
    disposition: results.every(result => result.pass) ? 'PASS' : 'FAIL',
    app: { id: EXPECTED_APP_ID, name: EXPECTED_APP_NAME },
    candidate_sha: CANDIDATE_SHA,
    base_sha: BASE_SHA,
    run_id: runId,
    generated_at: new Date().toISOString(),
    cleanup_requested: cleanup,
    results,
  };
}

function printHelp() {
  console.log(`AUD-01B isolated staging probe\n\nRequired environment:\n  AUD01B_CERT_APP_ID=${EXPECTED_APP_ID}\n  AUD01B_CERT_APP_NAME=${EXPECTED_APP_NAME}\n\nExecution:\n  node scripts/run-aud01b-staging-probe.mjs --execute [--scenario compatible] [--cleanup]\n\nThe runner prompts for a staging-admin email and a hidden password. It never requests, prints or stores a raw access token. Without --execute, no Base44 client is created and no remote request is made.`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const appId = process.env.AUD01B_CERT_APP_ID;
  const appName = process.env.AUD01B_CERT_APP_NAME;
  assertExecutionSafety({ execute: options.execute, appId, appName });

  const { createClient } = await import('@base44/sdk');
  const client = await createCertificationClient({ appId, createClient, requestCredentials: promptCredentials });
  const invoke = async payload => unwrapFunctionResponse(await client.functions.invoke(FUNCTION_NAME, payload));
  const runId = `run-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const report = await runCertification({ scenarios: options.scenarios, cleanup: options.cleanup, invoke, runId });
  console.log(JSON.stringify(report, null, 2));
  if (report.disposition !== 'PASS') process.exitCode = 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch(error => {
    console.error(error?.message || error);
    process.exitCode = 2;
  });
}
