import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
let passed = 0;
const pass = name => { passed += 1; console.log(`PASS ${name}`); };

const [init, activity, assignment, qa, qaEvidence, transition, miDia, activeUi, resumeUi] = await Promise.all([
  read('base44/functions/initTechnicalActivity/entry.ts'),
  read('base44/functions/technicalActivityCommand/entry.ts'),
  read('base44/functions/reassignWorkOrderTechnician/entry.ts'),
  read('base44/functions/recordTechnicalTest/entry.ts'),
  read('base44/functions/_shared/qaEvidence.ts'),
  read('base44/functions/transitionWorkOrderStatus/entry.ts'),
  read('src/components/midia/MiDiaTech.jsx'),
  read('src/components/actividades/ActividadActiva.jsx'),
  read('src/components/ot/retomarOrdenTrabajo.jsx'),
]);

{
  assert.match(init, /TECHNICAL_CUSTODY_MUST_BE_ASSUMED/);
  assert.match(init, /runtimeUser\.id !== ot\.tecnico_asignado_id/);
  assert.doesNotMatch(init, /Admin delega la actividad/);
  assert.match(init, /effective_technician_user_id:\s*runtimeUser\.id/);
  assert.match(init, /appendAuditEvent/);
  pass('Owner/Admin technical work requires self custody and never proxies authorship');
}

{
  assert.match(init, /ActividadTecnica\.filter\(\{[\s\S]*tecnico_id:[\s\S]*estado: ESTADO_ACTIVO/);
  assert.match(activity, /ACTIVE_TECHNICAL_WORK_AMBIGUOUS/);
  assert.match(activity, /ONE_ACTIVE_TECHNICAL_WORK/);
  pass('one-active technical work derives from active activity segments');
}

{
  assert.match(activity, /action === 'RESUME'/);
  assert.match(activity, /ActividadTecnica\.create/);
  assert.match(activity, /action === 'PAUSE'/);
  assert.match(activity, /estado: nextSegmentState/);
  assert.doesNotMatch(activity, /ActividadTecnica\.update\([^)]*\{[\s\S]*estado:\s*'en_progreso'/);
  pass('PAUSE closes a segment and RESUME creates a new segment');
}

{
  assert.match(assignment, /ASSUME_TECHNICAL_CUSTODY/);
  assert.match(assignment, /allowAdminSelf/);
  assert.match(assignment, /policyId = initialPath \? 'CP-ASG-001' : 'CP-ASG-002'/);
  assert.match(assignment, /initialPath \|\| \['ORG_ADMIN', 'BRANCH_ADMIN'\]\.includes\(caller\.effectiveRole\)/);
  assert.match(assignment, /REASSIGNMENT_ROLE_NOT_AUTHORIZED/);
  pass('explicit admin self-assume exists and SALES is limited to initial assignment');
}

{
  for (const source of [miDia, activeUi, resumeUi]) {
    assert.doesNotMatch(source, /ActividadTecnica\.(create|update)/);
    assert.match(source, /technicalActivityCommand/);
  }
  pass('Mi Dia pause/resume/close paths use the governed backend command');
}

{
  assert.doesNotMatch(qa, /account\.organization_id/);
  assert.match(qa, /allowedRoles:\s*\['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'\]/);
  assert.match(qa, /QA_ACTIVE_SEGMENT_REQUIRED/);
  assert.match(qa, /effective_technician_user_id:\s*user\.id/);
  assert.match(qa, /appendAuditEvent/);
  assert.match(qaEvidence, /effective_technician_user_id === context\.assignedTechnicianId/);
  pass('QA defect is fixed and authorship follows effective custody instead of literal role');
}

{
  assert.match(transition, /newStatus === 'PRUEBAS'/);
  assert.match(transition, /qa_cycle_id = crypto\.randomUUID|qa_cycle_id:\s*crypto\.randomUUID/);
  assert.match(transition, /PRUEBAS:\s*\['FINALIZADA', 'EN_REPARACION'\]/);
  assert.match(transition, /evaluateCurrentQaEvidence/);
  pass('rework rotates deterministic QA sufficiency before finalization');
}

console.log(`\nMulti-user technical custody and QA: ${passed} groups PASS`);
