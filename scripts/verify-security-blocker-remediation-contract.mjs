import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import {
  projectDeliveryLogMutationResult,
  projectOperationalMutationResult,
  projectWarrantyMutationResult,
  projectWorkOrderMutationResult,
} from '../base44/functions/_shared/dataProjections.ts';
import { resolvePublicResourceRelations } from '../base44/functions/_shared/publicResourceRelations.ts';
import { hasWorkOrderTargetAuthority } from '../base44/functions/_shared/lifecycleAuthority.ts';
import {
  clearLifecycleAuditPending,
  lifecycleAuditPendingMarker,
  recordLifecycleAuditFailure,
} from '../base44/functions/_shared/lifecycleAuditRecovery.ts';
import { getRoleCapabilities } from '../base44/functions/_shared/roleCapabilities.ts';
import { pickProjection } from '../base44/functions/_shared/dataProjections.ts';
import {
  evaluateCommandPolicyWithShadow,
  ExecuteSovereignCommand,
  SovereignCommandError,
} from '../base44/functions/_shared/commandExecution.ts';

const tests = [];
const test = (name, run) => tests.push({ name, run });
const clone = value => structuredClone(value);

function matches(record, query) {
  return Object.entries(query || {}).every(([key, value]) => record?.[key] === value);
}

function publicClient(collections) {
  const entities = new Proxy({}, {
    get(_target, name) {
      return {
        async filter(query) {
          return clone((collections[name] || []).filter(record => matches(record, query)));
        },
      };
    },
  });
  return { asServiceRole: { entities } };
}

function technicalScenario({ role = 'TECHNICIAN', assignedUserId = 'tech-a', auditFailure = false } = {}) {
  const user = { id: role === 'TECHNICIAN' ? 'tech-a' : 'admin-a', email: `${role.toLowerCase()}@example.com`, full_name: 'Actor' };
  const records = {
    OrdenTrabajo: [{ id: 'ot-a', organization_id: 'org-a', branch_id: 'branch-a', cliente_id: 'client-a', equipo_id: 'equipment-a', tecnico_asignado_id: assignedUserId }],
    Diagnostico: [], DiagnosticoTecnico: [], DiagnosticoDocumento: [], DiagnosticoEvidencia: [], DiagnosticoResultado: [],
    BloqueoTecnico: [], NotaInterna: [], RegistroTiempo: [],
  };
  const audits = [];
  let sequence = 0;
  const entities = new Proxy({}, {
    get(_target, name) {
      records[name] ||= [];
      return {
        async filter(query) { return clone(records[name].filter(record => matches(record, query))); },
        async create(data) {
          const record = { id: `${String(name).toLowerCase()}-${++sequence}`, ...clone(data) };
          records[name].push(record);
          return clone(record);
        },
        async update(id, data) {
          const record = records[name].find(item => item.id === id);
          Object.assign(record, clone(data));
          return clone(record);
        },
        async delete(id) {
          const index = records[name].findIndex(item => item.id === id);
          if (index >= 0) records[name].splice(index, 1);
        },
      };
    },
  });
  const authorization = {
    ok: true,
    principalClass: 'HUMAN_MEMBER',
    organizationId: 'org-a',
    branchId: role === 'ORG_ADMIN' ? null : 'branch-a',
    role,
    persistedRole: role,
    capabilities: getRoleCapabilities(role),
  };
  const client = { auth: { me: async () => user }, asServiceRole: { entities } };
  return { user, records, audits, authorization, client, auditFailure };
}

async function loadTechnicalHandler(scenario) {
  const source = await readFile(new URL('../base44/functions/technicalRecordCommand/entry.ts', import.meta.url), 'utf8');
  const executable = source
    .replace(/^import[\s\S]*?;\s*/gmu, '')
    .replace('Deno.serve(async req => {', 'globalThis.__handler = async req => {')
    .replace(/\}\);\s*$/u, '};');
  const context = {
    createClientFromRequest: () => scenario.client,
    resolveAuthorizedContext: async () => scenario.authorization,
    authorizeRecordBranch: (authorization, branchId) => (
      authorization.role === 'ORG_ADMIN' || authorization.branchId === branchId
        ? { ok: true }
        : { ok: false, status: 403, code: 'BRANCH_SCOPE_DENIED', error: 'Sucursal denegada' }
    ),
    appendAuditEvent: async (_base44, event) => {
      if (scenario.auditFailure) throw new Error('simulated audit failure');
      scenario.audits.push(clone(event));
      return event;
    },
    pickProjection,
    evaluateCommandPolicyWithShadow,
    ExecuteSovereignCommand,
    SovereignCommandError,
    crypto: webcrypto,
    Request,
    Response,
    structuredClone,
    console,
  };
  context.globalThis = context;
  vm.runInNewContext(executable, context, { filename: 'technicalRecordCommand/entry.ts' });
  return context.__handler;
}

async function invokeTechnical(scenario, body) {
  const handler = await loadTechnicalHandler(scenario);
  const response = await handler(new Request('https://local/technical-record', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
  return { response, body: await response.json() };
}

async function loadLegacyHandler(user) {
  const source = await readFile(new URL('../base44/functions/changeWorkOrderStatus/entry.ts', import.meta.url), 'utf8');
  const executable = source
    .replace(/^import[\s\S]*?;\s*/gmu, '')
    .replace('Deno.serve(async (req) => {', 'globalThis.__handler = async (req) => {')
    .replace(/\}\);\s*$/u, '};');
  const context = {
    createClientFromRequest: () => ({ auth: { me: async () => user } }),
    Response,
  };
  context.globalThis = context;
  vm.runInNewContext(executable, context, { filename: 'changeWorkOrderStatus/entry.ts' });
  return context.__handler;
}

test('mutation projections expose only positive allowlists', () => {
  const dangerous = {
    id: 'record-a', organization_id: 'org-a', branch_id: 'branch-a', estado: 'FINALIZADA',
    operation_key: 'op-a', public_access_token: 'bearer-secret', lifecycle_lock_token: 'lock-secret',
    password: 'password-secret', api_key: 'key-secret', request_fingerprint: 'fingerprint-a',
  };
  for (const dto of [
    projectWorkOrderMutationResult(dangerous),
    projectDeliveryLogMutationResult(dangerous),
    projectWarrantyMutationResult(dangerous),
  ]) {
    assert.equal(dto.id, 'record-a');
    for (const field of ['public_access_token', 'lifecycle_lock_token', 'password', 'api_key', 'request_fingerprint']) {
      assert.equal(Object.hasOwn(dto, field), false, `${field} leaked`);
    }
  }
  const operational = projectOperationalMutationResult(dangerous, [
    'estado', 'public_access_token', 'lifecycle_lock_token', 'password', 'api_key', 'request_fingerprint',
  ]);
  assert.deepEqual(operational, { id: 'record-a', organization_id: 'org-a', branch_id: 'branch-a', estado: 'FINALIZADA' });
});

test('cancellation replay uses the same frozen target-role authority as the initial cancellation', () => {
  for (const role of ['ORG_ADMIN', 'BRANCH_ADMIN']) {
    assert.equal(hasWorkOrderTargetAuthority({ targetStatus: 'CANCELADA', role }), true);
  }
  for (const role of ['TECHNICIAN', 'SALES']) {
    assert.equal(hasWorkOrderTargetAuthority({ targetStatus: 'CANCELADA', role }), false);
  }
  assert.equal(hasWorkOrderTargetAuthority({ targetStatus: 'CANCELADA', role: 'SUPER_ADMIN', isSuperAdmin: true }), true);
});

test('lifecycle audit recovery persists pending, failure and cleared states under the exact transition correlation', async () => {
  const workOrder = { id: 'ot-a', organization_id: 'org-a', estado: 'PRUEBAS' };
  const updates = [];
  const base44 = {
    asServiceRole: {
      entities: {
        OrdenTrabajo: {
          async updateMany(query, mutation) {
            assert.equal(matches(workOrder, query), true);
            updates.push({ query: clone(query), mutation: clone(mutation) });
            Object.assign(workOrder, clone(mutation.$set));
            return { updated: 1 };
          },
        },
      },
    },
  };
  Object.assign(workOrder, lifecycleAuditPendingMarker('transition-correlation-a'));
  assert.equal(workOrder.lifecycle_audit_pending, true);
  await recordLifecycleAuditFailure(base44, {
    organizationId: 'org-a', workOrderId: 'ot-a', status: 'PRUEBAS',
    correlationId: 'transition-correlation-a', error: new Error('audit unavailable'),
  });
  assert.equal(workOrder.lifecycle_audit_pending, true);
  assert.equal(workOrder.lifecycle_audit_error, 'audit unavailable');
  await clearLifecycleAuditPending(base44, {
    organizationId: 'org-a', workOrderId: 'ot-a', status: 'PRUEBAS', correlationId: 'transition-correlation-a',
  });
  assert.equal(workOrder.lifecycle_audit_pending, false);
  assert.equal(workOrder.lifecycle_audit_error, null);
  assert.equal(updates.every(update => update.query.lifecycle_audit_correlation_id === 'transition-correlation-a'), true);
});

test('public relations accept complete same-tenant graphs for every public document type', async () => {
  const collections = {
    Organization: [{ id: 'org-a' }],
    Cliente: [{ id: 'client-a', organization_id: 'org-a' }],
    Equipo: [{ id: 'equipment-a', organization_id: 'org-a', cliente_id: 'client-a', branch_id: 'branch-a' }],
    OrdenTrabajo: [{ id: 'ot-a', organization_id: 'org-a', cliente_id: 'client-a', branch_id: 'branch-a' }],
    Venta: [{ id: 'sale-a', organization_id: 'org-a', cliente_id: 'client-a', branch_id: 'branch-a' }],
  };
  const base44 = publicClient(collections);
  const cases = [
    ['quote', { organization_id: 'org-a', cliente_id: 'client-a', orden_trabajo_id: 'ot-a', branch_id: 'branch-a' }],
    ['warranty', { organization_id: 'org-a', cliente_id: 'client-a', origen_tipo: 'OT', origen_id: 'ot-a', branch_id: 'branch-a' }],
    ['receipt', { organization_id: 'org-a', cliente_id: 'client-a', referencia_ot_id: 'ot-a', branch_id: 'branch-a' }],
    ['work_order', { organization_id: 'org-a', cliente_id: 'client-a', equipo_id: 'equipment-a', branch_id: 'branch-a' }],
  ];
  for (const [type, record] of cases) {
    assert.equal((await resolvePublicResourceRelations(base44, { type, record })).ok, true, type);
  }
});

test('public relations fail closed on cross-tenant and mismatched parent references', async () => {
  const base44 = publicClient({
    Organization: [{ id: 'org-a' }, { id: 'org-b' }],
    Cliente: [{ id: 'client-b', organization_id: 'org-b' }, { id: 'client-a', organization_id: 'org-a' }],
    Equipo: [{ id: 'equipment-a', organization_id: 'org-a', cliente_id: 'client-b' }],
    OrdenTrabajo: [{ id: 'ot-a', organization_id: 'org-a', cliente_id: 'client-b', branch_id: 'branch-a' }],
    Venta: [],
  });
  const crossTenant = await resolvePublicResourceRelations(base44, {
    type: 'quote', record: { organization_id: 'org-a', cliente_id: 'client-b' },
  });
  assert.deepEqual(crossTenant, { ok: false, code: 'PUBLIC_QUOTE_CLIENT_INVALID' });
  const mismatchedParent = await resolvePublicResourceRelations(base44, {
    type: 'quote', record: { organization_id: 'org-a', cliente_id: 'client-a', orden_trabajo_id: 'ot-a' },
  });
  assert.deepEqual(mismatchedParent, { ok: false, code: 'PUBLIC_QUOTE_CLIENT_RELATIONSHIP_INVALID' });
  const mismatchedEquipment = await resolvePublicResourceRelations(base44, {
    type: 'work_order', record: { organization_id: 'org-a', cliente_id: 'client-a', equipo_id: 'equipment-a' },
  });
  assert.deepEqual(mismatchedEquipment, { ok: false, code: 'PUBLIC_WORK_ORDER_EQUIPMENT_RELATIONSHIP_INVALID' });
  const anonymousReceiptWithCustomerWorkOrder = await resolvePublicResourceRelations(base44, {
    type: 'receipt', record: { organization_id: 'org-a', referencia_ot_id: 'ot-a' },
  });
  assert.deepEqual(anonymousReceiptWithCustomerWorkOrder, { ok: false, code: 'PUBLIC_RECEIPT_CLIENT_RELATIONSHIP_INVALID' });
});

test('an administrator cannot silently author a technician-owned diagnostic', async () => {
  const scenario = technicalScenario({ role: 'ORG_ADMIN', assignedUserId: 'tech-a' });
  const result = await invokeTechnical(scenario, {
    entity: 'Diagnostico', operation: 'create', data: { orden_trabajo_id: 'ot-a', conclusion_tecnica: 'forged admin authorship' },
  });
  assert.equal(result.response.status, 403);
  assert.equal(result.body.code, 'EFFECTIVE_TECHNICIAN_REQUIRED');
  assert.equal(scenario.records.Diagnostico.length, 0);
});

test('the effective technician writes through the named command with server-owned custody fields and a safe DTO', async () => {
  const scenario = technicalScenario();
  const result = await invokeTechnical(scenario, {
    entity: 'Diagnostico', operation: 'create',
    data: {
      orden_trabajo_id: 'ot-a', organization_id: 'org-b', tecnico_id: 'forged-tech', cliente_id: 'client-b',
      conclusion_tecnica: 'Valid conclusion', public_access_token: 'must-not-return', lifecycle_lock_token: 'must-not-return',
    },
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.record.organization_id, 'org-a');
  assert.equal(result.body.record.orden_trabajo_id, 'ot-a');
  assert.equal(result.body.record.tecnico_id, 'tech-a');
  assert.equal(result.body.record.cliente_id, 'client-a');
  assert.equal(Object.hasOwn(result.body.record, 'public_access_token'), false);
  assert.equal(Object.hasOwn(result.body.record, 'lifecycle_lock_token'), false);
  assert.equal(scenario.audits.length, 1);
  assert.equal(scenario.audits[0].eventType, 'TECHNICAL_RECORD_MUTATED');
});

test('a technical child cannot attach to a diagnostic outside the authorized tenant', async () => {
  const scenario = technicalScenario();
  scenario.records.Diagnostico.push({ id: 'diag-b', organization_id: 'org-b', orden_trabajo_id: 'ot-a' });
  const result = await invokeTechnical(scenario, {
    entity: 'DiagnosticoEvidencia', operation: 'create', data: { diagnostico_id: 'diag-b', tipo: 'foto', url: 'https://example.test/evidence' },
  });
  assert.equal(result.response.status, 404);
  assert.equal(result.body.code, 'TECHNICAL_DIAGNOSTIC_PARENT_INVALID');
  assert.equal(scenario.records.DiagnosticoEvidencia.length, 0);
});

test('the retired legacy work-order writer cannot mutate any authenticated request', async () => {
  const handler = await loadLegacyHandler({ id: 'tech-a', email: 'tech@example.com' });
  const response = await handler(new Request('https://local/legacy', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ orden_trabajo_id: 'ot-other', estado_atencion: 'PAUSADO' }),
  }));
  const body = await response.json();
  assert.equal(response.status, 410);
  assert.equal(body.code, 'LEGACY_WORK_ORDER_WRITER_RETIRED');
});

for (const { name, run } of tests) {
  await run();
  console.log(`PASS ${name}`);
}
console.log(`\n${tests.length}/${tests.length} security-blocker remediation groups PASS`);
