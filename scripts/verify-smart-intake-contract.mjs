import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { isCanonicalActiveUserAccount, resolveAuthorizedContext } from '../base44/functions/_shared/userAuthorization.ts';

const backendPath = new URL('../base44/functions/getSmartIntakeByWorkOrder/entry.ts', import.meta.url);
const smartIntakeApiPath = new URL('../src/api/smartIntake.js', import.meta.url);
const workOrdersPath = new URL('../src/pages/OrdenesTrabajo.jsx', import.meta.url);
const expedientePath = new URL('../src/components/expediente/ExpedienteTecnico.jsx', import.meta.url);
const myDayPath = new URL('../src/components/midia/MiDiaTech.jsx', import.meta.url);
const technicalWizardPath = new URL('../src/components/diagnostico-tecnico/WizardDiagnosticoTecnico.jsx', import.meta.url);
const legacyWizardPath = new URL('../src/components/prediagnostico/WizardPreDiagnostico.jsx', import.meta.url);

const [
  backendSource,
  smartIntakeApiSource,
  workOrdersSource,
  expedienteSource,
  myDaySource,
  technicalWizardSource,
  legacyWizardSource,
] = await Promise.all([
  readFile(backendPath, 'utf8'),
  readFile(smartIntakeApiPath, 'utf8'),
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
  user,
  accounts,
  workOrders,
  preDiagnosticos = [],
  logger = console,
} = {}) {
  const resolvedUser = user === undefined
    ? { id: 'user-a', organization_id: 'org-a', email: 'user@example.com' }
    : user;
  const userAccounts = accounts || (resolvedUser ? [{
    id: 'account-a',
    user_id: resolvedUser.id,
    organization_id: 'org-a',
    branch_id: 'branch-a',
    role: 'SALES',
    status: 'active',
    active: true,
  }] : []);
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
      auth: { me: async () => resolvedUser },
      asServiceRole: { entities },
    },
    logger,
  };
}

function loadHandler(client, logger = console) {
  const executable = backendSource
    .replace(/^import .*?;\s*/gmu, '')
    .replace('Deno.serve(async (req) => {', 'globalThis.__handler = async (req) => {')
    .replace(/\}\);\s*$/u, '};');
  const context = {
    __createClientFromRequest: () => client,
    console: logger,
    Date,
    JSON,
    Object,
    Response,
    String,
    isCanonicalActiveUserAccount,
    resolveAuthorizedContext,
  };
  context.globalThis = context;
  vm.runInNewContext(
    `const createClientFromRequest = globalThis.__createClientFromRequest;\n${executable}`,
    context,
  );
  return context.__handler;
}

async function invoke(scenario, workOrderId = 'ot-1') {
  const handler = loadHandler(scenario.client, scenario.logger);
  const response = await handler({ json: async () => ({ workOrderId }) });
  return { response, body: await response.json() };
}

function loadSmartIntakeClient(base44Client, logger = console) {
  const executable = smartIntakeApiSource
    .replace(/^import .*?;\s*/u, '')
    .replace(/^export /gmu, '');
  const context = {
    __base44: base44Client,
    console: logger,
  };
  context.globalThis = context;
  vm.runInNewContext(
    `const base44 = globalThis.__base44;\n${executable}\n`
      + 'globalThis.__smartIntakeApi = {'
      + ' getSmartIntakeByWorkOrder, getLegacyPreDiagnosticoForEditing, invalidateSmartIntake'
      + ' };',
    context,
  );
  return context.__smartIntakeApi;
}

function createCapturingLogger() {
  const entries = { error: [], warn: [], log: [] };
  return {
    entries,
    error: (...args) => entries.error.push(args),
    warn: (...args) => entries.warn.push(args),
    log: (...args) => entries.log.push(args),
  };
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
    name: 'unauthenticated caller is rejected',
    async run() {
      const { response, body } = await invoke(createScenario({
        user: null,
        accounts: [],
        workOrders: [],
      }));
      assert.equal(response.status, 401);
      assert.equal(body.code, 'AUTHENTICATION_REQUIRED');
    },
  },
  {
    name: 'SUPER_ADMIN without impersonation is rejected',
    async run() {
      const { response, body } = await invoke(createScenario({
        user: { id: 'super-a', role: 'admin' },
        accounts: [],
      }));
      assert.equal(response.status, 403);
      assert.equal(body.code, 'EFFECTIVE_ORGANIZATION_REQUIRED');
    },
  },
  {
    name: 'SUPER_ADMIN with impersonation reads only the selected organization',
    async run() {
      const legacy = {
        ...completedLegacy,
        organization_id: 'org-b',
      };
      const { response, body } = await invoke(createScenario({
        user: {
          id: 'super-a',
          role: 'admin',
          impersonating_org_id: 'org-b',
        },
        accounts: [],
        workOrders: [{ id: 'ot-1', organization_id: 'org-b' }],
        preDiagnosticos: [legacy],
      }));
      assert.equal(response.status, 200);
      assert.equal(body.status, 'FOUND');
      assert.equal(body.intake.organizationId, 'org-b');
    },
  },
  {
    name: 'multiple memberships resolve the token organization membership',
    async run() {
      const legacy = {
        ...completedLegacy,
        organization_id: 'org-b',
      };
      const { response, body } = await invoke(createScenario({
        user: { id: 'user-a', organization_id: 'org-b' },
        accounts: [
          {
            id: 'account-a', user_id: 'user-a', organization_id: 'org-a', role: 'SALES', status: 'active',
          },
          {
            id: 'account-b', user_id: 'user-a', organization_id: 'org-b', role: 'TECHNICIAN', status: 'active',
          },
        ],
        workOrders: [{ id: 'ot-1', organization_id: 'org-b' }],
        preDiagnosticos: [legacy],
      }));
      assert.equal(response.status, 200);
      assert.equal(body.status, 'FOUND');
      assert.equal(body.intake.organizationId, 'org-b');
    },
  },
  {
    name: 'multiple memberships without an organization hint are rejected',
    async run() {
      const { response, body } = await invoke(createScenario({
        user: { id: 'user-a' },
        accounts: [
          {
            id: 'account-a', user_id: 'user-a', organization_id: 'org-a', role: 'SALES', status: 'active',
          },
          {
            id: 'account-b', user_id: 'user-a', organization_id: 'org-b', role: 'TECHNICIAN', status: 'active',
          },
        ],
      }));
      assert.equal(response.status, 403);
      assert.equal(body.code, 'CALLER_MEMBERSHIP_INACTIVE');
    },
  },
  {
    name: 'suspended membership is rejected despite the legacy active flag',
    async run() {
      const { response, body } = await invoke(createScenario({
        accounts: [{
          id: 'account-a',
          user_id: 'user-a',
          organization_id: 'org-a',
          role: 'SALES',
          status: 'suspended',
          active: true,
        }],
      }));
      assert.equal(response.status, 403);
      assert.equal(body.code, 'CALLER_MEMBERSHIP_INACTIVE');
    },
  },
  {
    name: 'invited membership is rejected despite the legacy active flag',
    async run() {
      const { response, body } = await invoke(createScenario({
        accounts: [{
          id: 'account-a',
          user_id: 'user-a',
          organization_id: 'org-a',
          role: 'SALES',
          status: 'invited',
          active: true,
        }],
      }));
      assert.equal(response.status, 403);
      assert.equal(body.code, 'CALLER_MEMBERSHIP_INACTIVE');
    },
  },
  {
    name: 'legacy membership without canonical status is rejected',
    async run() {
      const { response, body } = await invoke(createScenario({
        accounts: [{
          id: 'account-a',
          user_id: 'user-a',
          organization_id: 'org-a',
          role: 'SALES',
          active: true,
        }],
        preDiagnosticos: [completedLegacy],
      }));
      assert.equal(response.status, 403);
      assert.equal(body.code, 'CALLER_MEMBERSHIP_INACTIVE');
    },
  },
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
    name: 'single canonical membership overrides a stale token organization without leaking the other tenant',
    async run() {
      const scenario = createScenario({
        user: { id: 'user-a', organization_id: 'org-a' },
        accounts: [{
          id: 'account-b', user_id: 'user-a', organization_id: 'org-b', role: 'SALES', status: 'active',
        }],
      });
      const { response, body } = await invoke(scenario);
      assert.equal(response.status, 404);
      assert.equal(body.code, 'WORK_ORDER_NOT_FOUND');
    },
  },
  {
    name: 'missing and cross-tenant work orders have indistinguishable responses',
    async run() {
      const missingLogger = createCapturingLogger();
      const crossTenantLogger = createCapturingLogger();
      const missing = await invoke(createScenario({
        workOrders: [],
        logger: missingLogger,
      }));
      const crossTenant = await invoke(createScenario({
        workOrders: [{ id: 'ot-1', organization_id: 'org-b' }],
        logger: crossTenantLogger,
      }));

      assert.equal(missing.response.status, 404);
      assert.equal(crossTenant.response.status, 404);
      assert.deepEqual(crossTenant.body, missing.body);
      assert.deepEqual(crossTenant.body, {
        error: 'Orden de trabajo no encontrada',
        code: 'WORK_ORDER_NOT_FOUND',
      });
      assert.equal(crossTenantLogger.entries.warn.length, 1);
      assert.equal(crossTenantLogger.entries.warn[0][1].reason, 'CROSS_TENANT');
      assert.equal(missingLogger.entries.warn[0][1].reason, 'NOT_FOUND');
    },
  },
  {
    name: 'cross-tenant legacy records are not readable through a valid work order',
    async run() {
      const crossTenantLegacy = {
        ...completedLegacy,
        organization_id: 'org-b',
      };
      const { response, body } = await invoke(createScenario({
        preDiagnosticos: [crossTenantLegacy],
      }));
      assert.equal(response.status, 200);
      assert.deepEqual(body, { status: 'NOT_FOUND', intake: null, warnings: [] });
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
    name: 'duplicate timestamp ties use a deterministic record-id tie break',
    async run() {
      const tiedZ = {
        ...completedLegacy,
        id: 'prediag-z',
        updated_date: '2026-07-31T10:00:00.000Z',
      };
      const tiedA = {
        ...completedLegacy,
        id: 'prediag-a',
        updated_date: '2026-07-31T10:00:00.000Z',
      };
      const { body } = await invoke(createScenario({ preDiagnosticos: [tiedZ, tiedA] }));
      assert.equal(body.status, 'FOUND_WITH_WARNINGS');
      assert.equal(body.intake.id, 'prediag-a');
      assert.equal(body.warnings[0].selectedLegacyId, 'prediag-a');
    },
  },
  {
    name: 'existing work-order summary is preserved in the DTO',
    async run() {
      const { body } = await invoke(createScenario({ preDiagnosticos: [completedLegacy] }));
      assert.equal(body.intake.summary, 'Resumen de recepción');
    },
  },
  {
    name: 'unexpected backend failures return a stable sanitized error',
    async run() {
      const logger = createCapturingLogger();
      const scenario = createScenario({ logger });
      scenario.client.asServiceRole.entities.UserAccount.filter = async () => {
        throw new Error('internal-database-host.example');
      };
      const { response, body } = await invoke(scenario);
      assert.equal(response.status, 500);
      assert.deepEqual(body, {
        error: 'No se pudo consultar Smart Intake',
        code: 'SMART_INTAKE_READ_FAILED',
      });
      assert.doesNotMatch(JSON.stringify(body), /internal-database-host/u);
      assert.equal(logger.entries.error.length, 1);
      assert.match(logger.entries.error[0][1].message, /internal-database-host/u);
    },
  },
  {
    name: 'client accepts the canonical NOT_FOUND envelope',
    async run() {
      const api = loadSmartIntakeClient({
        functions: {
          invoke: async () => ({
            data: { status: 'NOT_FOUND', intake: null, warnings: [] },
          }),
        },
        entities: { PreDiagnostico: { filter: async () => [] } },
      });
      const result = await api.getSmartIntakeByWorkOrder('ot-1');
      assert.equal(result.status, 'NOT_FOUND');
      assert.equal(result.intake, null);
      assert.deepEqual([...result.warnings], []);
    },
  },
  {
    name: 'client rejects semantically invalid envelopes',
    async run() {
      const missingIntakeApi = loadSmartIntakeClient({
        functions: {
          invoke: async () => ({
            data: { status: 'FOUND', intake: null, warnings: [] },
          }),
        },
        entities: { PreDiagnostico: { filter: async () => [] } },
      });
      await assert.rejects(
        () => missingIntakeApi.getSmartIntakeByWorkOrder('ot-1'),
        /Respuesta invalida del servicio Smart Intake/u,
      );

      const malformedWarningsApi = loadSmartIntakeClient({
        functions: {
          invoke: async () => ({
            data: { status: 'NOT_FOUND', intake: null, warnings: {} },
          }),
        },
        entities: { PreDiagnostico: { filter: async () => [] } },
      });
      await assert.rejects(
        () => malformedWarningsApi.getSmartIntakeByWorkOrder('ot-1'),
        /Respuesta invalida del servicio Smart Intake/u,
      );
    },
  },
  {
    name: 'legacy editing bridge loads the exact record selected by the backend',
    async run() {
      const legacyRecords = [
        { ...completedLegacy, id: 'prediag-older' },
        { ...completedLegacy, id: 'prediag-newer' },
      ];
      let receivedQuery = null;
      const api = loadSmartIntakeClient({
        functions: {
          invoke: async () => ({
            data: {
              status: 'FOUND_WITH_WARNINGS',
              intake: {
                id: 'prediag-newer',
                legacyReference: {
                  entityName: 'PreDiagnostico',
                  recordId: 'prediag-newer',
                  rawState: 'completado',
                },
              },
              warnings: [{ code: 'DUPLICATE_LEGACY_PREDIAGNOSTICO' }],
            },
          }),
        },
        entities: {
          PreDiagnostico: {
            filter: async (query) => {
              receivedQuery = query;
              return legacyRecords.filter(record => matches(record, query));
            },
          },
        },
      }, createCapturingLogger());

      const selected = await api.getLegacyPreDiagnosticoForEditing('ot-1', 'org-a');
      assert.equal(selected.id, 'prediag-newer');
      assert.equal(receivedQuery.id, 'prediag-newer');
      assert.equal(receivedQuery.organization_id, 'org-a');
      assert.equal(receivedQuery.orden_trabajo_id, 'ot-1');
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
assert.match(legacyWizardSource, /getLegacyPreDiagnosticoForEditing/);
assert.match(legacyWizardSource, /invalidateSmartIntake\(queryClient, ordenTrabajo\.id\)/);
assert.doesNotMatch(legacyWizardSource, /PreDiagnostico\.filter/);
assert.doesNotMatch(legacyWizardSource, /queryKey:\s*\['prediagnostico'/);

for (const test of tests) {
  await test.run();
  console.log(`PASS ${test.name}`);
}

console.log(`\n${tests.length} Smart Intake stabilization tests and 12 source-contract checks passed.`);
