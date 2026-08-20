import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import {
  projectOperationalMutationResult,
  projectOperationalReadResult,
  projectSuperAdminAudit,
  projectWorkOrderMutationResult,
  pickProjection,
} from '../base44/functions/_shared/dataProjections.ts';
import {
  authorizeOperationalAction,
  pickAllowedFields,
  recordIsInsideBranchScope,
  sanitizeOperationalFilter,
  sanitizeOperationalMutation,
  validateRequestedBranch,
  WORK_ORDER_EDITABLE_FIELDS,
} from '../base44/functions/_shared/operationalAuthorization.ts';
import { resolvePublicResourceRelations } from '../base44/functions/_shared/publicResourceRelations.ts';
import { issuePublicTokenMetadata, validatePublicTokenRecord } from '../base44/functions/_shared/publicTokenContract.ts';
import { appendAuditEvent } from '../base44/functions/_shared/auditEvent.ts';
import {
  clearLifecycleAuditPending,
  lifecycleAuditPendingMarker,
  lifecycleAuditRecoveryFacts,
  recordLifecycleAuditFailure,
} from '../base44/functions/_shared/lifecycleAuditRecovery.ts';
import { getRoleCapabilities } from '../base44/functions/_shared/roleCapabilities.ts';
import { OT_TRANSITION_POLICIES } from '../base44/functions/_shared/commandPolicy.ts';
import { hasWorkOrderTargetAuthority, workOrderTargetRoles } from '../base44/functions/_shared/lifecycleAuthority.ts';
import {
  evaluateCommandPolicyWithShadow,
  ExecuteSovereignCommand,
  SovereignCommandError,
} from '../base44/functions/_shared/commandExecution.ts';
import { inspectControlledPilotConfiguration } from '../base44/functions/_shared/controlledPilotAuthority.ts';

const tests = [];
const test = (name, run) => tests.push({ name, run });
const clone = value => structuredClone(value);
const matches = (record, query) => Object.entries(query || {}).every(([key, value]) => record?.[key] === value);

async function vmHandler(path, serveSignature, context) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const executable = source
    .replace(/^import[\s\S]*?;\s*/gmu, '')
    .replace(serveSignature, 'globalThis.__handler = async (req) => {')
    .replace(/\}\);\s*$/u, '};');
  context.globalThis = context;
  vm.runInNewContext(executable, context, { filename: path });
  return context.__handler;
}

function entityStore(records) {
  return new Proxy({}, {
    get(_target, name) {
      records[name] ||= [];
      return {
        async filter(query) { return clone(records[name].filter(record => matches(record, query))); },
        async list() { return clone(records[name]); },
        async create(data) {
          const record = { id: `${String(name).toLowerCase()}-${records[name].length + 1}`, ...clone(data) };
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
}

function technicalScenario(role = 'TECHNICIAN') {
  const user = { id: role === 'TECHNICIAN' ? 'tech-a' : 'admin-a', email: `${role.toLowerCase()}@example.test`, full_name: 'Actor' };
  const records = {
    OrdenTrabajo: [
      { id: 'ot-a', organization_id: 'org-a', branch_id: 'branch-a', cliente_id: 'client-a', equipo_id: 'equipment-a', tecnico_asignado_id: 'tech-a' },
      { id: 'ot-b', organization_id: 'org-a', branch_id: 'branch-a', cliente_id: 'client-b', equipo_id: 'equipment-b', tecnico_asignado_id: 'tech-a' },
      { id: 'ot-cross', organization_id: 'org-b', branch_id: 'branch-b', cliente_id: 'client-cross', equipo_id: 'equipment-cross', tecnico_asignado_id: 'tech-a' },
    ],
    Diagnostico: [{ id: 'diag-a', organization_id: 'org-a', orden_trabajo_id: 'ot-a', tecnico_id: 'tech-a', conclusion_tecnica: 'before' }],
    DiagnosticoTecnico: [
      { id: 'parent-a', organization_id: 'org-a', orden_trabajo_id: 'ot-a', tecnico_id: 'tech-a' },
      { id: 'parent-b', organization_id: 'org-a', orden_trabajo_id: 'ot-b', tecnico_id: 'tech-a' },
    ],
    DiagnosticoDocumento: [{ id: 'doc-a', organization_id: 'org-a', diagnostico_id: 'parent-a', estado: 'EMITIDO' }],
    DiagnosticoEvidencia: [], DiagnosticoResultado: [], BloqueoTecnico: [], NotaInterna: [], RegistroTiempo: [],
  };
  const authorization = {
    ok: true, principalClass: 'HUMAN_MEMBER', organizationId: 'org-a',
    branchId: role === 'ORG_ADMIN' ? null : 'branch-a', role, persistedRole: role,
    capabilities: getRoleCapabilities(role),
  };
  const entities = entityStore(records);
  return { user, records, authorization, client: { auth: { me: async () => user }, asServiceRole: { entities } } };
}

async function technicalHandler(scenario) {
  return vmHandler('../base44/functions/technicalRecordCommand/entry.ts', 'Deno.serve(async req => {', {
    createClientFromRequest: () => scenario.client,
    resolveAuthorizedContext: async () => scenario.authorization,
    authorizeRecordBranch: (_authorization, branchId) => branchId === 'branch-a' ? { ok: true } : { ok: false, status: 403, code: 'BRANCH_DENIED', error: 'denied' },
    appendAuditEvent: async () => ({ duplicate: false }),
    pickProjection,
    evaluateCommandPolicyWithShadow,
    ExecuteSovereignCommand,
    SovereignCommandError,
    crypto: webcrypto, Request, Response, structuredClone, console,
  });
}

async function call(handler, path, body) {
  const response = await handler(new Request(`https://local/${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
  return { response, body: await response.json() };
}

test('technicalRecordCommand authorizes existing custody and makes all relationships immutable', async () => {
  const scenario = technicalScenario();
  const handler = await technicalHandler(scenario);
  const normal = await call(handler, 'technical', {
    entity: 'Diagnostico', operation: 'update', id: 'diag-a', data: { conclusion_tecnica: 'after' },
  });
  assert.equal(normal.response.status, 200, JSON.stringify(normal.body));
  assert.equal(scenario.records.Diagnostico[0].conclusion_tecnica, 'after');

  for (const data of [
    { orden_trabajo_id: 'ot-b' },
    { orden_trabajo_id: 'ot-cross' },
    { tecnico_id: 'tech-b' },
    { organization_id: 'org-b' },
  ]) {
    const denied = await call(handler, 'technical', { entity: 'Diagnostico', operation: 'update', id: 'diag-a', data });
    assert.equal(denied.response.status, 409);
    assert.equal(denied.body.code, 'TECHNICAL_RELATIONSHIP_IMMUTABLE');
  }
  const childDenied = await call(handler, 'technical', {
    entity: 'DiagnosticoDocumento', operation: 'update', id: 'doc-a', data: { diagnostico_id: 'parent-b' },
  });
  assert.equal(childDenied.response.status, 409);
  assert.equal(scenario.records.DiagnosticoDocumento[0].diagnostico_id, 'parent-a');
});

test('technicalRecordCommand denies administrator proxy updates and reparenting', async () => {
  const scenario = technicalScenario('ORG_ADMIN');
  const handler = await technicalHandler(scenario);
  const authorship = await call(handler, 'technical', {
    entity: 'Diagnostico', operation: 'update', id: 'diag-a', data: { conclusion_tecnica: 'admin' },
  });
  assert.equal(authorship.response.status, 403);
  const reparent = await call(handler, 'technical', {
    entity: 'Diagnostico', operation: 'update', id: 'diag-a', data: { orden_trabajo_id: 'ot-b' },
  });
  assert.equal(reparent.response.status, 409);
  assert.equal(scenario.records.Diagnostico[0].orden_trabajo_id, 'ot-a');
});

test('technicalRecordCommand denies mutation of another technician authored record', async () => {
  const scenario = technicalScenario();
  scenario.records.Diagnostico[0].tecnico_id = 'tech-other';
  const handler = await technicalHandler(scenario);
  const denied = await call(handler, 'technical', {
    entity: 'Diagnostico', operation: 'update', id: 'diag-a', data: { conclusion_tecnica: 'takeover' },
  });
  assert.equal(denied.response.status, 403);
  assert.equal(denied.body.code, 'TECHNICAL_RECORD_AUTHORSHIP_REQUIRED');
  assert.equal(scenario.records.Diagnostico[0].conclusion_tecnica, 'before');
});

async function diagnosticSummaryHandler({ role, assigned = true }) {
  const user = { id: role === 'TECHNICIAN' ? 'tech-a' : 'admin-a', email: 'actor@example.test' };
  const ot = {
    id: 'ot-a', organization_id: 'org-a', branch_id: 'branch-a', estado: 'EN_REVISION',
    tecnico_asignado_id: assigned ? user.id : 'tech-other', contrasena_ingreso: '4321', public_access_token: 'bearer',
  };
  const entities = entityStore({ OrdenTrabajo: [ot], OTEvent: [] });
  const authorization = role === 'TECHNICIAN'
    ? { ok: true, organizationId: 'org-a', role, persistedRole: role, account: { branch_id: 'branch-a' } }
    : { ok: false, status: 403, error: 'Rol no autorizado' };
  const handler = await vmHandler('../base44/functions/updateDiagnosticoResumen/entry.ts', 'Deno.serve(async (req) => {', {
    createClientFromRequest: () => ({ auth: { me: async () => user }, asServiceRole: { entities } }),
    resolveAuthorizedContext: async () => authorization,
    authorizeRecordBranch: () => ({ ok: true }),
    projectWorkOrderMutationResult,
    Response, console,
  });
  return { handler, ot };
}

test('updateDiagnosticoResumen permits only the effective technician and returns a safe DTO', async () => {
  const own = await diagnosticSummaryHandler({ role: 'TECHNICIAN' });
  const allowed = await call(own.handler, 'summary', { ordenTrabajoId: 'ot-a', diagnostico_resumido: 'canonical summary' });
  assert.equal(allowed.response.status, 200);
  assert.equal(allowed.body.data.diagnostico_resumido, 'canonical summary');
  assert.equal(Object.hasOwn(allowed.body.data, 'contrasena_ingreso'), false);
  assert.equal(Object.hasOwn(allowed.body.data, 'public_access_token'), false);

  const wrong = await diagnosticSummaryHandler({ role: 'TECHNICIAN', assigned: false });
  assert.equal((await call(wrong.handler, 'summary', { ordenTrabajoId: 'ot-a', diagnostico_resumido: 'wrong' })).response.status, 403);
  for (const role of ['ORG_ADMIN', 'BRANCH_ADMIN']) {
    const admin = await diagnosticSummaryHandler({ role });
    assert.equal((await call(admin.handler, 'summary', { ordenTrabajoId: 'ot-a', diagnostico_resumido: 'proxy' })).response.status, 403);
    assert.equal(admin.ot.diagnostico_resumido, undefined);
  }
});

test('operationalGateway projects real protected list/filter/get responses before returning', async () => {
  const records = { OrdenTrabajo: [{
    id: 'ot-a', organization_id: 'org-a', branch_id: 'branch-a', estado: 'EN_REVISION', codigo_ot: 'OT-1',
    contrasena_ingreso: '9999', public_access_token: 'bearer-secret', lifecycle_lock_token: 'lock-secret',
  }] };
  const entities = entityStore(records);
  const authorization = { ok: true, organizationId: 'org-a', role: 'ORG_ADMIN', account: null, isPlatformGlobal: false };
  const handler = await vmHandler('../base44/functions/operationalGateway/entry.ts', 'Deno.serve(async (req) => {', {
    createClientFromRequest: () => ({ auth: { me: async () => ({ id: 'admin-a' }) }, asServiceRole: { entities } }),
    resolveIdentitySnapshot: async (_base44, user) => ({ ok: true, user, isSuperAdmin: false }),
    resolveAuthorizedContext: async () => authorization,
    authorizeOperationalAction, pickAllowedFields, recordIsInsideBranchScope,
    sanitizeOperationalFilter, sanitizeOperationalMutation, validateRequestedBranch, WORK_ORDER_EDITABLE_FIELDS,
    calculateCommercialTotals: () => ({}), resolvePublicResourceRelations,
    projectOperationalMutationResult, projectOperationalReadResult,
    Response, console,
  });
  for (const [adapterMethod, method] of [['list', 'list'], ['filter', 'filter'], ['get', 'filter']]) {
    const result = await call(handler, 'gateway', { operation: 'read', method, entity: 'OrdenTrabajo', filter: { id: 'ot-a' }, limit: 1 });
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    const dto = result.body.records[0];
    assert.equal(dto.id, 'ot-a', adapterMethod);
    for (const field of ['contrasena_ingreso', 'public_access_token', 'lifecycle_lock_token']) assert.equal(Object.hasOwn(dto, field), false);
  }
});

test('retired dmrOrchestrator cannot create DMR for any authenticated role or retry', async () => {
  let creates = 0;
  let activeRole = 'SALES';
  const handler = await vmHandler('../base44/functions/dmrOrchestrator/entry.ts', 'Deno.serve(async (req) => {', {
    createClientFromRequest: () => ({
      auth: { me: async () => ({ id: `user-${activeRole.toLowerCase()}`, role: activeRole }) },
      asServiceRole: { entities: { DiagnosticMasterRecord: { create: async () => { creates += 1; } } } },
    }),
    Response,
  });
  for (const role of ['SALES', 'CUSTOMER_SERVICE']) {
    activeRole = role;
    for (let retry = 0; retry < 2; retry += 1) {
      const result = await call(handler, 'dmr', { otId: 'ot-a', role });
      assert.equal(result.response.status, 410);
      assert.equal(result.body.code, 'DMR_ORCHESTRATOR_RETIRED');
    }
  }
  assert.equal(creates, 0);
});

test('dmrAuditor projects protected platform audit rows', async () => {
  const records = { SuperAdminAudit: [{
    id: 'audit-a', super_admin_id: 'platform-a', super_admin_email: 'admin@example.test',
    action: 'DMR_CREATED', target_organization_id: 'org-a', target_organization_name: 'Org A',
    context: 'created by reception', recorded_at: '2026-08-14T00:00:00.000Z',
    correlation_id: 'trace-a', ip_address: '192.0.2.1', metadata: '{"secret":"internal"}',
  }] };
  const handler = await vmHandler('../base44/functions/dmrAuditor/entry.ts', 'Deno.serve(async (req) => {', {
    createClientFromRequest: () => ({
      auth: { me: async () => ({ id: 'platform-a', role: 'SUPER_ADMIN' }) },
      asServiceRole: { entities: entityStore(records) },
    }),
    isCanonicalSuperAdmin: () => true,
    projectSuperAdminAudit,
    Response, console,
  });
  const result = await call(handler, 'dmr-audit', { operation: 'getDmrAuditByOrg', orgId: 'org-a' });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.events.length, 1);
  assert.equal(result.body.events[0].action, 'DMR_CREATED');
  assert.equal(Object.hasOwn(result.body.events[0], 'ip_address'), false);
  assert.equal(Object.hasOwn(result.body.events[0], 'metadata'), false);
});

test('audit operation identity separates external tracing from mutation evidence', async () => {
  const events = [];
  const organization = { id: 'org-a' };
  const organizationMatches = query => Object.entries(query).every(([key, value]) => {
    if (key === '$or') return value.some(candidate => organizationMatches(candidate));
    if (value && typeof value === 'object' && '$exists' in value) {
      return (organization[key] !== undefined) === value.$exists;
    }
    return organization[key] === value;
  });
  const base44 = {
    asServiceRole: { entities: { AuditEvent: {
      async filter(query) { return clone(events.filter(event => matches(event, query))); },
      async create(event) {
        const record = { id: `audit-${events.length + 1}`, ...clone(event) };
        events.push(record);
        return clone(record);
      },
    }, Organization: {
      async filter(query) { return organizationMatches(query) ? [clone(organization)] : []; },
      async updateMany(query, mutation) {
        if (!organizationMatches(query)) return { updated: 0 };
        Object.assign(organization, clone(mutation.$set || {}));
        for (const key of Object.keys(mutation.$unset || {})) delete organization[key];
        return { updated: 1 };
      },
    } } },
  };
  const common = {
    eventType: 'WORK_ORDER_STATUS_TRANSITIONED', principalClass: 'HUMAN_MEMBER', actorUserId: 'tech-a',
    organizationId: 'org-a', resourceType: 'OrdenTrabajo', resourceId: 'ot-a', commandPolicyId: 'CP-OT-002',
    correlationId: 'attacker-reused-correlation', externalCorrelationId: 'attacker-reused-correlation',
  };
  const first = await appendAuditEvent(base44, {
    ...common, auditOperationId: 'backend-operation-a', operationKey: 'backend-operation-a',
    priorState: { estado: 'EN_REPARACION' }, newState: { estado: 'PRUEBAS' },
  });
  const retry = await appendAuditEvent(base44, {
    ...common, auditOperationId: 'backend-operation-a', operationKey: 'backend-operation-a',
    priorState: { estado: 'EN_REPARACION' }, newState: { estado: 'PRUEBAS' },
  });
  const second = await appendAuditEvent(base44, {
    ...common, auditOperationId: 'backend-operation-b', operationKey: 'backend-operation-b',
    priorState: { estado: 'PRUEBAS' }, newState: { estado: 'FINALIZADA' },
  });
  const differentCommand = await appendAuditEvent(base44, {
    ...common,
    eventType: 'TECHNICAL_RECORD_MUTATED',
    commandPolicyId: 'CP-DIAG-002',
    auditOperationId: 'backend-operation-c', operationKey: 'backend-operation-c',
    priorState: { conclusion_tecnica: 'before' }, newState: { conclusion_tecnica: 'after' },
  });
  assert.equal(first.duplicate, false);
  assert.equal(retry.duplicate, true);
  assert.equal(second.duplicate, false);
  assert.equal(differentCommand.duplicate, false);
  assert.equal(events.length, 3);
  assert.deepEqual(events.map(event => event.audit_operation_id), ['backend-operation-a', 'backend-operation-b', 'backend-operation-c']);
});

test('lifecycle recovery preserves the true committed before/after facts', () => {
  const marker = lifecycleAuditPendingMarker({
    operationId: 'backend-operation-a', externalCorrelationId: 'request-a',
    previousStatus: 'EN_REPARACION', newStatus: 'PRUEBAS', command: 'transitionWorkOrderStatus',
    actorUserId: 'tech-a', actorRole: 'TECHNICIAN', committedAt: '2026-08-14T12:00:00.000Z',
  });
  const alreadyMutated = { estado: 'PRUEBAS', ...marker };
  const facts = lifecycleAuditRecoveryFacts(alreadyMutated, { previousStatus: alreadyMutated.estado, newStatus: alreadyMutated.estado });
  assert.equal(facts.previousStatus, 'EN_REPARACION');
  assert.equal(facts.newStatus, 'PRUEBAS');
  assert.equal(facts.operationId, 'backend-operation-a');
});

test('transitionWorkOrderStatus handler recovers the original lifecycle evidence', async () => {
  const operationId = 'backend-operation-transition-a';
  const externalCorrelationId = 'attacker-reused-correlation';
  const workOrder = {
    id: 'ot-a', organization_id: 'org-a', branch_id: 'branch-a', estado: 'PRUEBAS',
    tecnico_asignado_id: 'tech-a',
    ...lifecycleAuditPendingMarker({
      operationId, externalCorrelationId, previousStatus: 'EN_REPARACION', newStatus: 'PRUEBAS',
      command: 'transitionWorkOrderStatus', actorUserId: 'tech-a', actorRole: 'TECHNICIAN',
      committedAt: '2026-08-14T12:00:00.000Z',
    }),
  };
  const auditEvents = [];
  const auditOrganization = { id: 'org-a' };
  const auditOrganizationMatches = query => Object.entries(query).every(([key, value]) => {
    if (key === '$or') return value.some(candidate => auditOrganizationMatches(candidate));
    if (value && typeof value === 'object' && '$exists' in value) {
      return (auditOrganization[key] !== undefined) === value.$exists;
    }
    return auditOrganization[key] === value;
  });
  const entities = {
    OrdenTrabajo: {
      async filter(query) { return matches(workOrder, query) ? [clone(workOrder)] : []; },
      async updateMany(query, update) {
        if (!matches(workOrder, query)) return { updated: 0 };
        Object.assign(workOrder, clone(update.$set || {}));
        return { updated: 1 };
      },
    },
    AuditEvent: {
      async filter(query) { return clone(auditEvents.filter(event => matches(event, query))); },
      async create(event) {
        const record = { id: `audit-${auditEvents.length + 1}`, ...clone(event) };
        auditEvents.push(record);
        return clone(record);
      },
    },
    Organization: {
      async filter(query) { return auditOrganizationMatches(query) ? [clone(auditOrganization)] : []; },
      async updateMany(query, update) {
        if (!auditOrganizationMatches(query)) return { updated: 0 };
        Object.assign(auditOrganization, clone(update.$set || {}));
        for (const key of Object.keys(update.$unset || {})) delete auditOrganization[key];
        return { updated: 1 };
      },
    },
  };
  const authorization = {
    ok: true, principalClass: 'HUMAN_MEMBER', organizationId: 'org-a', branchId: 'branch-a',
    role: 'TECHNICIAN', persistedRole: 'TECHNICIAN', isSuperAdmin: false,
    capabilities: getRoleCapabilities('TECHNICIAN'),
  };
  const handler = await vmHandler('../base44/functions/transitionWorkOrderStatus/entry.ts', 'Deno.serve(async (req) => {', {
    createClientFromRequest: () => ({
      auth: { me: async () => ({ id: 'tech-a', email: 'tech-a@example.test' }) },
      asServiceRole: { entities },
    }),
    resolveAuthorizedContext: async () => authorization,
    authorizeRecordBranch: () => ({ ok: true }),
    appendAuditEvent,
    projectWorkOrderMutationResult,
    hasWorkOrderTargetAuthority,
    workOrderTargetRoles,
    clearLifecycleAuditPending,
    lifecycleAuditPendingMarker,
    lifecycleAuditRecoveryFacts,
    recordLifecycleAuditFailure,
    evaluateCommandPolicyWithShadow,
    ExecuteSovereignCommand,
    SovereignCommandError,
    OT_TRANSITION_POLICIES,
    crypto: webcrypto, Request, Response, console,
  });
  for (let retry = 0; retry < 2; retry += 1) {
    const result = await call(handler, 'transition', {
      orden_trabajo_id: 'ot-a', newStatus: 'PRUEBAS', correlation_id: externalCorrelationId,
    });
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.previous_status, 'EN_REPARACION');
    assert.equal(result.body.new_status, 'PRUEBAS');
  }
  assert.equal(auditEvents.length, 1);
  assert.equal(auditEvents[0].audit_operation_id, operationId);
  assert.equal(auditEvents[0].external_correlation_id, externalCorrelationId);
  assert.deepEqual(auditEvents[0].prior_state, { estado: 'EN_REPARACION' });
  assert.deepEqual(auditEvents[0].new_state, { estado: 'PRUEBAS' });
});

function publicCollections({ mismatchedWarranty = false } = {}) {
  const token = 'receipt-token-123456789';
  const issued = issuePublicTokenMetadata({
    purpose: 'RECEIPT_READ', resourceId: 'sale-a', token,
    now: new Date(Date.now() - 60_000).toISOString(),
  });
  return { token, records: {
    Organization: [{ id: 'org-a', name: 'Org A' }],
    Cliente: [{ id: 'client-a', organization_id: 'org-a', nombre_completo: 'Client A' }, { id: 'client-b', organization_id: 'org-a', nombre_completo: 'Client B' }],
    Equipo: [{ id: 'equipment-a', organization_id: 'org-a', cliente_id: 'client-a', branch_id: 'branch-a' }],
    OrdenTrabajo: [{ id: 'ot-a', organization_id: 'org-a', cliente_id: 'client-a', equipo_id: 'equipment-a', branch_id: 'branch-a', codigo_ot: 'OT-1' }],
    Venta: [{ id: 'sale-a', organization_id: 'org-a', branch_id: 'branch-a', cliente_id: 'client-a', referencia_ot_id: 'ot-a', estado: 'pagada', ...issued }],
    VentaItem: [{ id: 'line-a', organization_id: 'org-a', venta_id: 'sale-a', tipo: 'producto', descripcion: 'Part', cantidad: 1, precio_unitario: 20, subtotal: 20, costo_unitario_snapshot: 4, line_key: 'internal' }],
    Garantia: [{ id: 'warranty-a', organization_id: 'org-a', branch_id: 'branch-a', cliente_id: mismatchedWarranty ? 'client-b' : 'client-a', origen_tipo: 'OT', origen_id: 'ot-a', estado: 'ACTIVA', texto_snapshot: 'Terms' }],
  } };
}

async function publicHandler(scenario, overrides = {}) {
  const stored = entityStore(scenario.records);
  const entities = new Proxy({}, {
    get(_target, name) {
      const entity = stored[name];
      if (!overrides[name]) return entity;
      return { ...entity, filter: overrides[name] };
    },
  });
  return vmHandler('../base44/functions/getPublicCommercialDocument/entry.ts', 'Deno.serve(async (req) => {', {
    createClientFromRequest: () => ({ asServiceRole: { entities } }),
    validatePublicTokenRecord, resolvePublicResourceRelations,
    inspectControlledPilotConfiguration,
    Response, console,
  });
}

test('public receipt validates its nested graph and projects sale items', async () => {
  const valid = publicCollections();
  const validResult = await call(await publicHandler(valid), 'public', { type: 'receipt', token: valid.token });
  assert.equal(validResult.response.status, 200, JSON.stringify(validResult.body));
  const item = validResult.body.data.items[0];
  assert.equal(item.descripcion, 'Part');
  assert.equal(Object.hasOwn(item, 'costo_unitario_snapshot'), false);
  assert.equal(Object.hasOwn(item, 'line_key'), false);

  const invalid = publicCollections({ mismatchedWarranty: true });
  const invalidResult = await call(await publicHandler(invalid), 'public', { type: 'receipt', token: invalid.token });
  assert.equal(invalidResult.response.status, 404);
  assert.equal(Object.hasOwn(invalidResult.body, 'data'), false);
});

function publicWorkOrderCollections() {
  const token = 'work-order-token-123456789';
  const issued = issuePublicTokenMetadata({
    purpose: 'WORK_ORDER_STATUS_READ', resourceId: 'ot-a', token,
    now: new Date(Date.now() - 60_000).toISOString(),
  });
  return { token, records: {
    Organization: [{ id: 'org-a', name: 'Org A' }],
    Cliente: [{ id: 'client-a', organization_id: 'org-a', nombre_completo: 'Client A' }],
    Equipo: [{ id: 'equipment-a', organization_id: 'org-a', cliente_id: 'client-a', branch_id: 'branch-a' }],
    OrdenTrabajo: [
      { id: 'ot-a', organization_id: 'org-a', branch_id: 'branch-a', cliente_id: 'client-a', equipo_id: 'equipment-a', codigo_ot: 'OT-1', estado: 'DIAGNOSTICADA', ...issued },
      { id: 'ot-b', organization_id: 'org-a', branch_id: 'branch-a', cliente_id: 'client-a', equipo_id: 'equipment-a', codigo_ot: 'OT-2' },
    ],
    DiagnosticoTecnico: [{ id: 'diag-a', organization_id: 'org-a', orden_trabajo_id: 'ot-a', estado: 'listo_aprobacion' }],
    DiagnosticoEvidencia: [{ id: 'evidence-a', organization_id: 'org-a', diagnostico_id: 'diag-a', tipo: 'foto', url: 'https://example.test/photo', internal_note: 'never public' }],
    Cotizacion: [{ id: 'quote-a', organization_id: 'org-a', branch_id: 'branch-a', cliente_id: 'client-a', orden_trabajo_id: 'ot-a', estado: 'enviada', items: [] }],
  } };
}

test('public work-order handler fails closed on wrong quote/evidence graph nodes', async () => {
  const valid = publicWorkOrderCollections();
  const ok = await call(await publicHandler(valid), 'public', { type: 'work_order', token: valid.token });
  assert.equal(ok.response.status, 200, JSON.stringify(ok.body));
  assert.equal(Object.hasOwn(ok.body.data.evidencias[0], 'internal_note'), false);

  const wrongQuote = { ...valid.records.Cotizacion[0], id: 'quote-b', orden_trabajo_id: 'ot-b' };
  const quoteFailure = await call(await publicHandler(publicWorkOrderCollections(), {
    Cotizacion: async () => [clone(wrongQuote)],
  }), 'public', { type: 'work_order', token: valid.token });
  assert.equal(quoteFailure.response.status, 404);

  const wrongEvidence = { ...valid.records.DiagnosticoEvidencia[0], id: 'evidence-b', diagnostico_id: 'diag-other' };
  const evidenceFailure = await call(await publicHandler(publicWorkOrderCollections(), {
    DiagnosticoEvidencia: async () => [clone(wrongEvidence)],
  }), 'public', { type: 'work_order', token: valid.token });
  assert.equal(evidenceFailure.response.status, 404);

  const crossTenantEvidence = { ...valid.records.DiagnosticoEvidencia[0], id: 'evidence-c', organization_id: 'org-b' };
  const tenantFailure = await call(await publicHandler(publicWorkOrderCollections(), {
    DiagnosticoEvidencia: async () => [clone(crossTenantEvidence)],
  }), 'public', { type: 'work_order', token: valid.token });
  assert.equal(tenantFailure.response.status, 404);
});

test('all named protected mutation handlers use positive response projectors', async () => {
  const checks = [
    ['../base44/functions/initTechnicalActivity/entry.ts', /projectTechnicalActivity\(/u],
    ['../base44/functions/technicalActivityCommand/entry.ts', /projectTechnicalActivity\(/u],
    ['../base44/functions/recordTechnicalTest/entry.ts', /projectTechnicalTest\(/u],
    ['../base44/functions/createSale/entry.ts', /projectSaleMutationResult\(/u],
    ['../base44/functions/createInventoryItem/entry.ts', /projectInventoryAdmin\(/u],
    ['../base44/functions/updateInventoryItem/entry.ts', /projectInventoryAdmin\(/u],
    ['../base44/functions/manageOrgUser/entry.ts', /projectUserAccount\(/u],
    ['../base44/functions/notificationCommand/entry.ts', /projectNotification\(/u],
    ['../base44/functions/dmrAuditor/entry.ts', /\.map\(projectSuperAdminAudit\)/u],
    ['../base44/functions/identityGateway/entry.ts', /auditLogs: \(auditLogs \|\| \[\]\)\.map\(projectSuperAdminAudit\)/u],
  ];
  for (const [path, pattern] of checks) assert.match(await readFile(new URL(path, import.meta.url), 'utf8'), pattern, path);
  const lifecycleSource = await readFile(new URL('../base44/functions/transitionWorkOrderStatus/entry.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(lifecycleSource, /diagnostico_resumido/u, 'diagnostic summary must have one named writer');
});

for (const { name, run } of tests) {
  await run();
  console.log(`PASS ${name}`);
}
console.log(`\n${tests.length}/${tests.length} security round-2 groups PASS`);
