import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const midia = readFileSync('src/pages/MiDia.jsx', 'utf8');
const boundary = readFileSync('src/components/midia/MiDiaErrorBoundary.jsx','utf8');
const sales = readFileSync('src/components/midia/MiDiaSales.jsx','utf8');
const admin = readFileSync('src/components/midia/MiDiaAdmin.jsx','utf8');
assert.ok(midia.includes("<PageGuard allowedRoles={['ORG_ADMIN', 'TECHNICIAN', 'BRANCH_ADMIN', 'SALES']}>"));
for (const marker of ["<MiDiaAdmin", "<MiDiaSales", "<MiDiaTech", "<MiDiaErrorBoundary", "user?.id || 'no-user'"]) {
  assert.ok(midia.includes(marker), marker);
}
assert.ok(boundary.includes('static getDerivedStateFromError()'));
assert.ok(boundary.includes('componentDidCatch(error, info)'));
assert.ok(boundary.includes('No se pudo mostrar el panel'));
assert.ok(boundary.includes('role="alert"'));
assert.ok(boundary.includes('window.location.reload()'));
assert.ok(!boundary.includes('this.state.error?.message'), 'do not expose backend errors in UI');
assert.ok(sales.includes("queryFn: () => invokeCrm('list', effectiveOrgId)"));
assert.ok(admin.includes("base44.entities.OrdenTrabajo.filter"));
console.log('PASS SEC-017 MiDia role routing, render error containment, safe retry, backend-only reads preserved');
