import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dash = read('src/components/dashboard/DashboardOrgAdmin.jsx');
const paging = read('src/lib/workOrderPagination.js');
const finance = read('src/pages/Finanzas.jsx');
const backend = read('base44/functions/getFinancialMetrics/entry.ts');
const tests = [
 ['dashboard financial cache includes organization, role and branch', /\['dashboard-financial', effectiveOrgId, effectiveRole, canonicalBranchId, startDate, endDate\]/.test(dash)],
 ['failed metrics cannot render a false zero', /value=\{financialError \|\| !financialData \? "—"/.test(dash) && /!isLoadingMetrics && !isErrorMetrics && !!metrics/.test(finance)],
 ['malformed OT response cannot be interpreted as empty', /!Array\.isArray\(page\?\.records\)/.test(paging) && /collectWorkOrderPages/.test(dash) && /value=\{ordersError \? "—"/.test(dash)],
 ['OT chart and recent orders hidden on failed read', /\{!ordersError && <Card/.test(dash) && /\{!ordersError && <RecentOrders/.test(dash)],
 ['financial and chart queries require canonical branch for branch admin', (finance.match(/enabled: !!effectiveOrgId && !!fechaDesde && !!fechaHasta && \(!isBranchAdmin \|\| !!branchIdFijo\)/g) || []).length === 2],
 ['financial chart separates loading, error and empty states', /salesError \? \(/.test(finance) && /loadingSales \? \(/.test(finance) && /!!metrics && !loadingSales && !salesError/.test(finance)],
 ['explicit retries available and no automatic retries on critical reads', /retryFinancial\(\)/.test(dash) && /retryOrders\(\)/.test(dash) && /retryMetrics\(\)/.test(finance) && /retrySales\(\)/.test(finance) && (dash.match(/retry: false/g)||[]).length >= 2 && (finance.match(/retry: false/g)||[]).length >= 2],
 ['backend financial role and branch guards remain intact', /allowedRoles: \['ORG_ADMIN', 'BRANCH_ADMIN'\]/.test(backend) && /validateRequestedBranch\(branchScope, requestedBranchId\)/.test(backend)]
];
for (const [name, ok] of tests) { assert.ok(ok, name); console.log('PASS ' + name); }
console.log(`${tests.length}/${tests.length} A3 read state source contracts PASS`);
