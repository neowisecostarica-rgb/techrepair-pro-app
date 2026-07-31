import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const backendPath = new URL('../base44/functions/getSmartIntakeByWorkOrder/entry.ts', import.meta.url);
const workOrdersPath = new URL('../src/pages/OrdenesTrabajo.jsx', import.meta.url);
const expedientePath = new URL('../src/components/expediente/ExpedienteTecnico.jsx', import.meta.url);
const myDayPath = new URL('../src/components/midia/MiDiaTech.jsx', import.meta.url);
const technicalWizardPath = new URL('../src/components/diagnostico-tecnico/WizardDiagnosticoTecnico.jsx', import.meta.url);
const legacyWizardPath = new URL('../src/components/prediagnostico/WizardPreDiagnostico.jsx', import.meta.url);

const [
  backendSource,
  workOrdersSource,
  expedienteSource,
  myDaySource,
  technicalWizardSource,
  legacyWizardSource,
] = await Promise.all([
  readFile(backendPath, 'utf8'),
  readFile(workOrdersPath, 'utf8'),
  readFile(expedientePath, 'utf8'),
  readFile(myDayPath, 'utf8'),
  readFile(technicalWizardPath, 'utf8'),
  readFile(legacyWizardPath, 'utf8'),
]);

function matches(record, query) {
  return Object.entries(query).every(([field, expected]) => record[field] === expected);
}

function createScenario({
  user = { id: 'user-a', organization_id: 'org-a', email: 'user@example.com' },
  accounts,
  workOrders,
  preDiagnosticos = [],
} = {}) {
  const userAccounts = accounts || [{
    id: 'account-a',
    user_id: user.id,
    organization_id: 'org-a',
    branch_id: 'branch-a',
    role: 'SALES',
    status: 'active',
    active: true,
  }];
  const orders = workOrders || [{
    id: 'ot-1',
    organization_id: 'org-a',
    branch_id: 'branch-a',
    diagnostico_resumido: 'Resumen de recepción',
  }];

  const entities = {
    UserAccount: {
      async filter(query) {
        return userAccounts.filter(record => matches(record, query)).map(record => structuredClone(record));
      },
    },
    OrdenTrabajo: {
      async filter(query) {
        return orders.filter(record => matches(record, query)).map(record => structuredClone(record));
      },
    },
    PreDiagnostico: {
      async filter(query) {
        return preDiagnosticos.filter(record => matches(record, query)).map(record => structuredClone(record));
      },
    },
  };

  return {
    client: {
      auth: { me: async () => user },
      asServiceRole: { entities },
    },
  };
}

function loadHandler(client) {
  const executable = backendSource
    .replace(/^import .*?;\s*/u, '')
    .replace('Deno.serve(async (req) => {', 'globalThis.__handler = async (req) => {')
    .replace(/\}\);\s*$/u, '};');
  const context = {
    __createClientFromRequest: () => client,
    console,
    Date,
    JSON,
    Object,
    Response,
    String,
  };
  context.globalThis = context;
  vm.runInNewContext(
    `const createClientFromRequest = globalThis.__createClientFromRequest;\n${executable}`,
    context,
  );
  return context.__handler;
}

async function invoke(scenario, workOrderId = 'ot-1') {
  const handler = loadHandler(scenario.client);
  const response = await handler({ json: async () => ({ workOrderId }) });
  return { response, body: await response.json() };
}

const completedLegacy = {
  id: 'prediag-complete',
  organization_id: 'org-a',
  orden_trabajo_id: 'ot-1',
  estado: 'completado',
  uso_principal: 'trabajo',
  equipo_critico: true,
  problema_principal: 'no_enciende',
  respuestas: { cuando_inicio: 'Hoy', golpes_liquidos: 'no' },
  riesgo_datos: 'alto',
  riesgo_fisico: 'medio',
  observaciones_riesgo: 'Datos sin respaldo',
  completado_por_user_id: 'user-a',
  completado_at: '2026-07-31T10:00:00.000Z',
  created_date: '2026-07-31T09:00:00.000Z',
  updated_date: '2026-07-31T10:00:00.000Z',
};

const tests = [
  {
    name: 'legacy completed intake maps to the canonical DTO',
    async run() {
      const { response, body } = await invoke(createScenario({ preDiagnosticos: [completedLegacy] }));
      assert.equal(response.status, 200);
      assert.equal(body.status, 'FOUND');
      assert.equal(body.intake.sourceType, 'LEGACY_PREDIAGNOSTICO');
      assert.equal(body.intake.lifecycleState, 'COMPLETED');
      assert.equal(body.intake.isCompleted, true);
      assert.equal(body.intake.isDraft, false);
      assert.equal(body.intake.mainUse, 'trabajo');
      assert.equal(body.intake.isCriticalEquipment, true);
      assert.equal(body.intake.mainReportedProblem, 'no_enciende');
      assert.deepEqual(body.intake.conditionalAnswers, completedLegacy.respuestas);
      assert.equal(body.intake.dataRiskLevel, 'alto');
      assert.equal(body.intake.physicalRiskLevel, 'medio');
      assert.equal(body.intake.completedByUserId, 'user-a');
    },
  },
  {
    name: 'legacy draft preserves draft behavior',
    async run() {
      const draft = {
        ...completedLegacy,
        id: 'prediag-draft',
        estado: 'borrador',
        completado_por_user_id: undefined,
        completado_at: undefined,
      };
      const { body } = await invoke(createScenario({ preDiagnosticos: [draft] }));
      assert.equal(body.intake.lifecycleState, 'DRAFT');
      assert.equal(body.intake.isDraft, true);
      assert.equal(body.intake.isCompleted, false);
      assert.equal(body.intake.completedAt, null);
    },
  },
  {
    name: 'missing optional undeclared fields map safely',
    async run() {
      const minimal = {
        id: 'prediag-minimal',
        organization_id: 'org-a',
        orden_trabajo_id: 'ot-1',
        estado: 'borrador',
      };
      const { body } = await invoke(createScenario({ preDiagnosticos: [minimal] }));
      assert.equal(body.status, 'FOUND');
      assert.equal(body.intake.mainUse, null);
      assert.equal(body.intake.isCriticalEquipment, false);
      assert.deepEqual(body.intake.conditionalAnswers, {});
      assert.equal(body.intake.dataRiskLevel, 'ninguno');
      assert.equal(body.intake.physicalRiskLevel, 'ninguno');
    },
  },
  {
    name: 'malformed optional fields warn without crashing',
    async run() {
      const malformed = {
        ...completedLegacy,
        id: 'prediag-malformed',
        uso_principal: 42,
        equipo_critico: 'true',
        respuestas: [],
      };
      const { body } = await invoke(createScenario({ preDiagnosticos: [malformed] }));
      assert.equal(body.status, 'FOUND_WITH_WARNINGS');
      assert.equal(body.intake.mainUse, null);
      assert.equal(body.intake.isCriticalEquipment, false);
      assert.deepEqual(body.intake.conditionalAnswers, {});
      assert.ok(body.warnings.some(warning => warning.field === 'uso_principal'));
      assert.ok(body.warnings.some(warning => warning.field === 'respuestas'));
    },
  },
  {
    name: 'no legacy record returns a valid not-found result',
    async run() {
      const { response, body } = await invoke(createScenario());
      assert.equal(response.status, 200);
      assert.deepEqual(body, { status: 'NOT_FOUND', intake: null, warnings: [] });
    },
  },
  {
    name: 'caller without membership in the token organization is rejected',
    async run() {
      const scenario = createScenario({
        user: { id: 'user-a', organization_id: 'org-a' },
        accounts: [{
          id: 'account-b', user_id: 'user-a', organization_id: 'org-b', role: 'SALES', status: 'active',
        }],
      });
      const { response, body } = await invoke(scenario);
      assert.equal(response.status, 403);
      assert.equal(body.code, 'CALLER_MEMBERSHIP_INACTIVE');
    },
  },
  {
    name: 'work-order organization mismatch is rejected',
    async run() {
      const scenario = createScenario({
        workOrders: [{ id: 'ot-1', organization_id: 'org-b' }],
      });
      const { response, body } = await invoke(scenario);
      assert.equal(response.status, 403);
      assert.equal(body.code, 'WORK_ORDER_ORGANIZATION_MISMATCH');
    },
  },
  {
    name: 'duplicate legacy records use deterministic newest selection and warn',
    async run() {
      const older = {
        ...completedLegacy,
        id: 'prediag-older',
        problema_principal: 'lento',
        updated_date: '2026-07-30T10:00:00.000Z',
      };
      const newer = {
        ...completedLegacy,
        id: 'prediag-newer',
        problema_principal: 'pantalla',
        updated_date: '2026-07-31T10:00:00.000Z',
      };
      const { body } = await invoke(createScenario({ preDiagnosticos: [older, newer] }));
      assert.equal(body.status, 'FOUND_WITH_WARNINGS');
      assert.equal(body.intake.id, 'prediag-newer');
      assert.equal(body.intake.mainReportedProblem, 'pantalla');
      assert.equal(body.warnings[0].code, 'DUPLICATE_LEGACY_PREDIAGNOSTICO');
      assert.equal(body.warnings[0].selectedLegacyId, 'prediag-newer');
    },
  },
  {
    name: 'existing work-order summary is preserved in the DTO',
    async run() {
      const { body } = await invoke(createScenario({ preDiagnosticos: [completedLegacy] }));
      assert.equal(body.intake.summary, 'Resumen de recepción');
    },
  },
];

const activeConsumerSources = [
  ['OrdenesTrabajo.jsx', workOrdersSource],
  ['ExpedienteTecnico.jsx', expedienteSource],
  ['MiDiaTech.jsx', myDaySource],
  ['WizardDiagnosticoTecnico.jsx', technicalWizardSource],
];

for (const [name, source] of activeConsumerSources) {
  assert.doesNotMatch(source, /entities\.PreDiagnostico/, `${name} must use the canonical Smart Intake path`);
}

assert.match(workOrdersSource, /getSmartIntakeByWorkOrder/);
assert.match(expedienteSource, /smartIntakeQueryKeys\.byWorkOrder/);
assert.match(myDaySource, /getSmartIntakeByWorkOrder/);
assert.match(technicalWizardSource, /smartIntake\.mainReportedProblem/);
assert.match(legacyWizardSource, /invalidateSmartIntake\(queryClient, ordenTrabajo\.id\)/);
assert.doesNotMatch(legacyWizardSource, /queryKey:\s*\['prediagnostico'/);

for (const test of tests) {
  await test.run();
  console.log(`PASS ${test.name}`);
}

console.log(`\n${tests.length} Smart Intake handler tests and 6 source-contract checks passed.`);
