import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { normalizeTenantRole } from '../_shared/roleCapabilities.ts';

const MAX_ROWS = 5000;

function issue(category, records) {
  return { category, count: records.length, records };
}

function duplicateKeys(accounts) {
  const groups = new Map();
  for (const account of accounts) {
    const identity = account.user_id || account.user_email?.trim().toLowerCase();
    if (!identity) continue;
    const key = `${account.organization_id}:${identity}`;
    groups.set(key, [...(groups.get(key) || []), account]);
  }
  return [...groups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({ key, account_ids: rows.map(row => row.id) }));
}

function duplicateActiveWork(activities) {
  const groups = new Map();
  for (const activity of activities) {
    const key = activity.tecnico_id || activity.tecnico_email;
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), activity]);
  }
  return [...groups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([effective_technician_user_id, rows]) => ({
      effective_technician_user_id,
      activity_ids: rows.map(row => row.id),
      work_order_ids: rows.map(row => row.orden_trabajo_id),
    }));
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'Metodo no permitido' }, { status: 405 });
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const authorization = await resolveAuthorizedContext(base44, user, {
    organizationHint: typeof body.organization_id === 'string' ? body.organization_id : null,
    allowedRoles: ['ORG_ADMIN'],
  });
  if (!authorization.ok) return Response.json({ error: authorization.error, code: authorization.code }, { status: authorization.status });

  const organizationId = authorization.organizationId;
  const [accounts, branches, activeActivities, requests, workOrders] = await Promise.all([
    base44.asServiceRole.entities.UserAccount.filter({ organization_id: organizationId }, '-created_date', MAX_ROWS),
    base44.asServiceRole.entities.Branch.filter({ organization_id: organizationId }, '-created_date', MAX_ROWS),
    base44.asServiceRole.entities.ActividadTecnica.filter({ organization_id: organizationId, estado: 'en_progreso', soft_deleted: false }, '-created_date', MAX_ROWS),
    base44.asServiceRole.entities.SolicitudTecnica.filter({ organization_id: organizationId }, '-created_date', MAX_ROWS),
    base44.asServiceRole.entities.OrdenTrabajo.filter({ organization_id: organizationId }, '-created_date', MAX_ROWS),
  ]);

  const activeAccounts = (accounts || []).filter(account => account.status === 'active');
  const branchById = new Map((branches || []).map(branch => [branch.id, branch]));
  const workOrderById = new Map((workOrders || []).map(workOrder => [workOrder.id, workOrder]));
  const unknownRoles = activeAccounts
    .filter(account => !normalizeTenantRole(account.role))
    .map(account => ({ account_id: account.id, user_id: account.user_id || null, role: account.role }));
  const invalidBranches = activeAccounts
    .filter(account => normalizeTenantRole(account.role) !== 'ORG_ADMIN')
    .filter(account => !account.branch_id || !branchById.get(account.branch_id)?.active)
    .map(account => ({ account_id: account.id, user_id: account.user_id || null, branch_id: account.branch_id || null }));
  const crossBranchRequests = (requests || [])
    .filter(request => {
      const workOrder = workOrderById.get(request.orden_trabajo_id);
      return !request.branch_id || !workOrder || request.branch_id !== workOrder.branch_id;
    })
    .map(request => ({ request_id: request.id, branch_id: request.branch_id || null, work_order_id: request.orden_trabajo_id }));

  const inconsistencies = [
    issue('UNKNOWN_ACTIVE_ROLE', unknownRoles),
    issue('DUPLICATE_ACTIVE_MEMBERSHIP', duplicateKeys(activeAccounts)),
    issue('INVALID_OR_INACTIVE_BRANCH_ASSIGNMENT', invalidBranches),
    issue('MULTIPLE_ACTIVE_TECHNICAL_SEGMENTS', duplicateActiveWork(activeActivities || [])),
    issue('SOLICITUD_BRANCH_OR_WORK_ORDER_MISMATCH', crossBranchRequests),
  ].filter(item => item.count > 0);
  const fetchedCounts = [accounts, branches, activeActivities, requests, workOrders].map(rows => rows?.length || 0);
  const truncated = fetchedCounts.some(count => count >= MAX_ROWS);

  return Response.json({
    organization: authorization.organization?.name || null,
    organization_id: organizationId,
    actor: { user_id: user.id, role: authorization.role, persisted_role: authorization.persistedRole },
    timestamp: new Date().toISOString(),
    mode: 'READ_ONLY',
    gate: inconsistencies.length === 0 && !truncated ? 'PASS' : 'BLOCKED',
    truncated,
    totals: {
      memberships: accounts?.length || 0,
      active_memberships: activeAccounts.length,
      branches: branches?.length || 0,
      active_technical_segments: activeActivities?.length || 0,
      technical_requests: requests?.length || 0,
      work_orders: workOrders?.length || 0,
      support_memberships: activeAccounts.filter(account => account.role === 'SUPPORT').length,
    },
    roles_present: [...new Set(activeAccounts.map(account => account.role))].sort(),
    inconsistencies,
  });
});

