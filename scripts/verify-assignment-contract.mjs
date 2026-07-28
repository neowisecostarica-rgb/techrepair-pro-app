import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const backendPath = new URL('../base44/functions/reassignWorkOrderTechnician/entry.ts', import.meta.url);
const queuePath = new URL('../src/pages/ColaRevision.jsx', import.meta.url);
const workOrdersPath = new URL('../src/pages/OrdenesTrabajo.jsx', import.meta.url);

const [backendSource, queueSource, workOrdersSource] = await Promise.all([
  readFile(backendPath, 'utf8'),
  readFile(queuePath, 'utf8'),
  readFile(workOrdersPath, 'utf8'),
]);

function matches(record, query) {
  return Object.entries(query).every(([field, expected]) => {
    if (field === '$or') return expected.some(candidate => matches(record, candidate));
    if (expected && typeof expected === 'object' && '$exists' in expected) {
      return Object.hasOwn(record, field) === expected.$exists;
    }
    if (expected === null) return record[field] == null;
    return record[field] === expected;
  });
}

function applyUpdate(record, update) {
  Object.assign(record, update.$set || {});
  for (const field of Object.keys(update.$unset || {})) delete record[field];
}

function createScenario({
  workOrder,
  callerRole = 'ORG_ADMIN',
  callerStatus = 'active',
  callerActive = true,
  destinationOrgId = 'org-a',
  destinationRole = 'TECHNICIAN',
  destinationStatus,
  destinationActive = true,
  superAdmin = false,
  failAudit = false,
  events = [],
}) {
  const user = superAdmin
    ? {
        id: 'super-1',
        email: 'super@example.com',
        is_super_admin: true,
        impersonating_org_id: 'org-a',
      }
    : {
        id: 'caller-1',
        email: 'admin@example.com',
        organization_id: 'org-a',
      };
  const workOrders = [{ organization_id: 'org-a', ...workOrder }];
  const userAccounts = [
    {
      id: 'caller-account',
      user_id: 'caller-1',
      user_email: 'admin@example.com',
      organization_id: 'org-a',
      role: callerRole,
      ...(callerStatus === null ? {} : { status: callerStatus }),
      active: callerActive,
    },
    {
      id: 'tech-account',
      user_id: 'tech-2',
      user_email: 'tech2@example.com',
      organization_id: destinationOrgId,
      role: destinationRole,
      status: destinationStatus ?? (destinationActive ? 'active' : 'suspended'),
      active: destinationActive,
    },
  ];

  const entities = {
    UserAccount: {
      async filter(query) {
        return userAccounts
          .filter(record => matches(record, query))
          .map(record => structuredClone(record));
      },
    },
    OrdenTrabajo: {
      async filter(query) {
        return workOrders
          .filter(record => matches(record, query))
          .map(record => structuredClone(record));
      },
      async updateMany(query, update) {
        const record = workOrders.find(candidate => matches(candidate, query));
        if (!record) return { updated: 0 };
        applyUpdate(record, update);
        return { updated: 1 };
      },
    },
    OTEvent: {
      async filter(query) {
        return events
          .filter(record => matches(record, query))
          .map(record => structuredClone(record));
      },
      async create(data) {
        if (failAudit) throw new Error('simulated audit failure');
        const event = { id: `event-${events.length + 1}`, ...data };
        events.push(event);
        return event;
      },
    },
  };

  return {
    workOrders,
    events,
    client: {
      auth: { me: async () => user },
      asServiceRole: { entities },
      functions: {
        invoke() {
          throw new Error('assignment must not invoke another backend function');
        },
      },
    },
  };
}

function loadHandler(client) {
  const executable = backendSource
    .replace(/^import .*?;\s*/u, '')
    .replace(
      'Deno.serve(async (req) => {',
      'globalThis.__handler = async (req) => {',
    )
    .replace(/\}\);\s*$/u, '};');
  const context = {
    __createClientFromRequest: () => client,
    console,
    crypto,
    Date,
    JSON,
    Object,
    Response,
  };
  context.globalThis = context;
  vm.runInNewContext(
    `const createClientFromRequest = globalThis.__createClientFromRequest;\n${executable}`,
    context,
  );
  return context.__handler;
}

async function invoke(scenario, payload = {}) {
  const handler = loadHandler(scenario.client);
  const response = await handler({
    method: 'POST',
    json: async () => ({
      orden_trabajo_id: 'ot-1',
      tecnico_asignado_id: 'tech-2',
      motivo: 'Cobertura operativa',
      ...payload,
    }),
  });
  return { response, body: await response.json() };
}

const tests = [
  {
    name: 'initial assignment commits technician, ASIGNADA, and one canonical event',
    async run() {
      const scenario = createScenario({
        workOrder: { id: 'ot-1', estado: 'EN_COLA_REVISION' },
      });
      const { response, body } = await invoke(scenario);
      assert.equal(response.status, 200);
      assert.equal(body.operation, 'INITIAL_ASSIGNMENT');
      assert.equal(scenario.workOrders[0].estado, 'ASIGNADA');
      assert.equal(scenario.workOrders[0].tecnico_asignado_id, 'tech-2');
      assert.deepEqual(scenario.events.map(event => event.tipo), ['TRANSITION_ASIGNADA']);
    },
  },
  {
    name: 'reassignment preserves workflow state and creates only reassignment audit',
    async run() {
      const scenario = createScenario({
        workOrder: {
          id: 'ot-1',
          estado: 'EN_REVISION',
          tecnico_asignado_id: 'tech-1',
          tecnico_asignado_email: 'tech1@example.com',
        },
      });
      const { response, body } = await invoke(scenario);
      assert.equal(response.status, 200);
      assert.equal(body.operation, 'REASSIGNMENT');
      assert.equal(scenario.workOrders[0].estado, 'EN_REVISION');
      assert.equal(scenario.workOrders[0].tecnico_asignado_id, 'tech-2');
      assert.deepEqual(scenario.events.map(event => event.tipo), ['TRANSITION_REASIGNADA']);
    },
  },
  {
    name: 'partial initial assignment recovers without duplicate canonical events',
    async run() {
      const existingEvents = [{
        id: 'event-existing',
        organization_id: 'org-a',
        orden_trabajo_id: 'ot-1',
        tipo: 'TRANSITION_ASIGNADA',
      }];
      const scenario = createScenario({
        workOrder: {
          id: 'ot-1',
          estado: 'EN_COLA_REVISION',
          tecnico_asignado_id: 'tech-2',
          tecnico_asignado_email: 'tech2@example.com',
        },
        events: existingEvents,
      });
      const { response, body } = await invoke(scenario);
      assert.equal(response.status, 200);
      assert.equal(body.operation, 'INITIAL_ASSIGNMENT_RECOVERY');
      assert.equal(scenario.workOrders[0].estado, 'ASIGNADA');
      assert.equal(scenario.events.length, 1);
    },
  },
  {
    name: 'recovery refuses to silently replace the partially assigned technician',
    async run() {
      const scenario = createScenario({
        workOrder: {
          id: 'ot-1',
          estado: 'EN_COLA_REVISION',
          tecnico_asignado_id: 'tech-1',
        },
      });
      const { response, body } = await invoke(scenario);
      assert.equal(response.status, 409);
      assert.equal(body.code, 'INITIAL_ASSIGNMENT_RECOVERY_TECHNICIAN_MISMATCH');
      assert.equal(scenario.workOrders[0].estado, 'EN_COLA_REVISION');
      assert.equal(scenario.workOrders[0].tecnico_asignado_id, 'tech-1');
      assert.equal(scenario.events.length, 0);
    },
  },
  {
    name: 'audit failure rolls initial assignment back without residual state',
    async run() {
      const scenario = createScenario({
        workOrder: { id: 'ot-1', estado: 'EN_COLA_REVISION' },
        failAudit: true,
      });
      const { response, body } = await invoke(scenario);
      assert.equal(response.status, 500);
      assert.equal(body.code, 'ASSIGNMENT_AUDIT_FAILED_ROLLED_BACK');
      assert.equal(scenario.workOrders[0].estado, 'EN_COLA_REVISION');
      assert.equal(scenario.workOrders[0].tecnico_asignado_id, undefined);
      assert.equal(scenario.events.length, 0);
    },
  },
  {
    name: 'audit failure rolls reassignment back without changing workflow state',
    async run() {
      const scenario = createScenario({
        workOrder: {
          id: 'ot-1',
          estado: 'EN_REPARACION',
          tecnico_asignado_id: 'tech-1',
          tecnico_asignado_email: 'tech1@example.com',
        },
        failAudit: true,
      });
      const { response, body } = await invoke(scenario);
      assert.equal(response.status, 500);
      assert.equal(body.code, 'ASSIGNMENT_AUDIT_FAILED_ROLLED_BACK');
      assert.equal(scenario.workOrders[0].estado, 'EN_REPARACION');
      assert.equal(scenario.workOrders[0].tecnico_asignado_id, 'tech-1');
      assert.equal(scenario.events.length, 0);
    },
  },
  {
    name: 'retry after completed initial assignment is idempotent',
    async run() {
      const scenario = createScenario({
        workOrder: { id: 'ot-1', estado: 'EN_COLA_REVISION' },
      });
      const first = await invoke(scenario);
      const retry = await invoke(scenario);
      assert.equal(first.response.status, 200);
      assert.equal(retry.response.status, 200);
      assert.equal(retry.body.idempotent, true);
      assert.equal(scenario.workOrders[0].estado, 'ASIGNADA');
      assert.equal(scenario.events.length, 1);
    },
  },
  {
    name: 'SALES can perform the intake assignment required by workflowConfig',
    async run() {
      const scenario = createScenario({
        callerRole: 'SALES',
        workOrder: { id: 'ot-1', estado: 'EN_COLA_REVISION' },
      });
      const { response, body } = await invoke(scenario);
      assert.equal(response.status, 200);
      assert.equal(body.operation, 'INITIAL_ASSIGNMENT');
      assert.equal(scenario.workOrders[0].estado, 'ASIGNADA');
      assert.equal(scenario.events.length, 1);
    },
  },
  {
    name: 'BRANCH_ADMIN can assign within the active organization',
    async run() {
      const scenario = createScenario({
        callerRole: 'BRANCH_ADMIN',
        workOrder: { id: 'ot-1', estado: 'EN_COLA_REVISION' },
      });
      const { response, body } = await invoke(scenario);
      assert.equal(response.status, 200);
      assert.equal(body.operation, 'INITIAL_ASSIGNMENT');
      assert.equal(scenario.workOrders[0].estado, 'ASIGNADA');
    },
  },
  {
    name: 'TECHNICIAN role is rejected before any assignment mutation',
    async run() {
      const scenario = createScenario({
        callerRole: 'TECHNICIAN',
        workOrder: { id: 'ot-1', estado: 'EN_COLA_REVISION' },
      });
      const { response, body } = await invoke(scenario);
      assert.equal(response.status, 403);
      assert.equal(body.code, 'ASSIGNMENT_ROLE_NOT_AUTHORIZED');
      assert.equal(scenario.workOrders[0].tecnico_asignado_id, undefined);
      assert.equal(scenario.events.length, 0);
    },
  },
  {
    name: 'canonical invited status is rejected even when legacy active is true',
    async run() {
      const scenario = createScenario({
        callerStatus: 'invited',
        workOrder: { id: 'ot-1', estado: 'EN_COLA_REVISION' },
      });
      const { response, body } = await invoke(scenario);
      assert.equal(response.status, 403);
      assert.equal(body.code, 'CALLER_ACCOUNT_NOT_ACTIVE');
      assert.equal(scenario.workOrders[0].tecnico_asignado_id, undefined);
      assert.equal(scenario.events.length, 0);
    },
  },
  {
    name: 'legacy account without status remains supported through active fallback',
    async run() {
      const scenario = createScenario({
        callerStatus: null,
        callerActive: true,
        workOrder: { id: 'ot-1', estado: 'EN_COLA_REVISION' },
      });
      const { response, body } = await invoke(scenario);
      assert.equal(response.status, 200);
      assert.equal(body.operation, 'INITIAL_ASSIGNMENT');
      assert.equal(scenario.workOrders[0].estado, 'ASIGNADA');
    },
  },
  {
    name: 'canonical active status takes precedence over contradictory legacy active flag',
    async run() {
      const scenario = createScenario({
        callerStatus: 'active',
        callerActive: false,
        workOrder: { id: 'ot-1', estado: 'EN_COLA_REVISION' },
      });
      const { response } = await invoke(scenario);
      assert.equal(response.status, 200);
      assert.equal(scenario.workOrders[0].estado, 'ASIGNADA');
    },
  },
  {
    name: 'cross-tenant destination technician is rejected',
    async run() {
      const scenario = createScenario({
        destinationOrgId: 'org-b',
        workOrder: { id: 'ot-1', estado: 'EN_COLA_REVISION' },
      });
      const { response, body } = await invoke(scenario);
      assert.equal(response.status, 422);
      assert.equal(body.code, 'DESTINATION_TECHNICIAN_INVALID');
      assert.equal(scenario.workOrders[0].tecnico_asignado_id, undefined);
    },
  },
  {
    name: 'inactive destination technician is rejected',
    async run() {
      const scenario = createScenario({
        destinationActive: false,
        workOrder: { id: 'ot-1', estado: 'EN_COLA_REVISION' },
      });
      const { response, body } = await invoke(scenario);
      assert.equal(response.status, 422);
      assert.equal(body.code, 'DESTINATION_TECHNICIAN_INVALID');
      assert.equal(scenario.workOrders[0].tecnico_asignado_id, undefined);
    },
  },
  {
    name: 'invited destination technician is rejected despite legacy active flag',
    async run() {
      const scenario = createScenario({
        destinationStatus: 'invited',
        destinationActive: true,
        workOrder: { id: 'ot-1', estado: 'EN_COLA_REVISION' },
      });
      const { response, body } = await invoke(scenario);
      assert.equal(response.status, 422);
      assert.equal(body.code, 'DESTINATION_TECHNICIAN_INVALID');
      assert.equal(scenario.workOrders[0].tecnico_asignado_id, undefined);
    },
  },
  {
    name: 'non-technician destination account is rejected',
    async run() {
      const scenario = createScenario({
        destinationRole: 'SALES',
        workOrder: { id: 'ot-1', estado: 'EN_COLA_REVISION' },
      });
      const { response, body } = await invoke(scenario);
      assert.equal(response.status, 422);
      assert.equal(body.code, 'DESTINATION_TECHNICIAN_INVALID');
      assert.equal(scenario.workOrders[0].tecnico_asignado_id, undefined);
    },
  },
  {
    name: 'terminal work orders reject reassignment without mutation',
    async run() {
      const scenario = createScenario({
        workOrder: {
          id: 'ot-1',
          estado: 'ENTREGADA',
          tecnico_asignado_id: 'tech-1',
        },
      });
      const { response, body } = await invoke(scenario);
      assert.equal(response.status, 409);
      assert.equal(body.code, 'WORK_ORDER_ASSIGNMENT_FORBIDDEN_STATE');
      assert.equal(scenario.workOrders[0].tecnico_asignado_id, 'tech-1');
      assert.equal(scenario.events.length, 0);
    },
  },
  {
    name: 'same-technician retry does not bypass an in-progress lifecycle lock',
    async run() {
      const scenario = createScenario({
        workOrder: {
          id: 'ot-1',
          estado: 'ASIGNADA',
          tecnico_asignado_id: 'tech-2',
          lifecycle_lock_token: 'operation-in-flight',
          lifecycle_lock_operation: 'initialTechnicianAssignment',
          lifecycle_lock_at: new Date().toISOString(),
        },
      });
      const { response, body } = await invoke(scenario);
      assert.equal(response.status, 409);
      assert.equal(body.code, 'ASSIGNMENT_OPERATION_IN_PROGRESS');
      assert.equal(scenario.events.length, 0);
    },
  },
  {
    name: 'invalid reason returns a deterministic error before mutation',
    async run() {
      const scenario = createScenario({
        workOrder: { id: 'ot-1', estado: 'EN_COLA_REVISION' },
      });
      const { response, body } = await invoke(scenario, { motivo: 123 });
      assert.equal(response.status, 400);
      assert.equal(body.code, 'ASSIGNMENT_REASON_INVALID');
      assert.equal(scenario.workOrders[0].tecnico_asignado_id, undefined);
      assert.equal(scenario.events.length, 0);
    },
  },
  {
    name: 'impersonating SUPER_ADMIN executes with tenant-scoped ORG_ADMIN authority',
    async run() {
      const scenario = createScenario({
        superAdmin: true,
        workOrder: { id: 'ot-1', estado: 'EN_COLA_REVISION' },
      });
      const { response, body } = await invoke(scenario);
      assert.equal(response.status, 200);
      assert.equal(body.operation, 'INITIAL_ASSIGNMENT');
      assert.equal(scenario.workOrders[0].estado, 'ASIGNADA');
    },
  },
];

assert.match(queueSource, /const ALLOWED_ROLES = \['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES'\]/);
assert.match(workOrdersSource, /\['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES'\]\.includes\(effectiveRole\)/);
assert.doesNotMatch(backendSource, /functions\.invoke\(['"]transitionWorkOrderStatus['"]/);
assert.doesNotMatch(backendSource, /ActividadTecnica|WorkflowGate|initTechnicalActivity/);

for (const test of tests) {
  await test.run();
  console.log(`PASS ${test.name}`);
}

console.log(`\n${tests.length} assignment acceptance tests passed.`);
