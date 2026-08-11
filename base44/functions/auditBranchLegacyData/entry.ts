import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { normalizeBranchName } from '../_shared/branchProtection.ts';

const PAGE_SIZE = 250;
const MAX_RECORDS = 5000;
const MAX_EVIDENCE = 50;
const STALE_LOCK_MS = 15 * 60 * 1000;
const BRANCH_SCOPED_ROLES = new Set(['BRANCH_ADMIN', 'TECHNICIAN', 'SALES', 'INVENTORY', 'SUPPORT']);
const TERMINAL_WORK_ORDERS = new Set(['ENTREGADA', 'CANCELADA']);

function addIssue(categories, category, evidence) {
  if (!categories[category]) categories[category] = { count: 0, records: [] };
  categories[category].count += 1;
  if (categories[category].records.length < MAX_EVIDENCE) categories[category].records.push(evidence);
}

function isStale(value) {
  const parsed = Date.parse(String(value || ''));
  return !Number.isFinite(parsed) || Date.now() - parsed > STALE_LOCK_MS;
}

async function readAll(entity, filter = {}) {
  const records = [];
  let cursor = null;
  let truncated = false;
  while (records.length < MAX_RECORDS) {
    const remaining = MAX_RECORDS - records.length;
    const page = await entity.filter({
      ...filter,
      ...(cursor ? { created_date: { $lt: cursor } } : {}),
    }, '-created_date', Math.min(PAGE_SIZE, remaining));
    records.push(...(page || []));
    if (!page?.length || page.length < PAGE_SIZE) break;
    const nextCursor = page[page.length - 1]?.created_date;
    if (!nextCursor || nextCursor === cursor) {
      truncated = true;
      break;
    }
    cursor = nextCursor;
    if (records.length >= MAX_RECORDS) truncated = true;
  }
  return { records, truncated };
}

Deno.serve(async req => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Metodo no permitido', code: 'METHOD_NOT_ALLOWED' }, { status: 405 });
  }
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'No autenticado', code: 'UNAUTHENTICATED' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const authorization = await resolveAuthorizedContext(base44, user, {
      organizationHint: body.organization_id || null,
      allowedRoles: ['ORG_ADMIN'],
    });
    if (!authorization.ok) {
      return Response.json({ error: authorization.error, code: 'BRANCH_AUDIT_FORBIDDEN' }, { status: authorization.status });
    }
    const organizationId = authorization.organizationId;
    const entities = base44.asServiceRole.entities;
    const [organization] = await entities.Organization.filter({ id: organizationId }, '-created_date', 1);
    if (!organization) return Response.json({ error: 'Organizacion no encontrada', code: 'ORGANIZATION_NOT_FOUND' }, { status: 404 });

    const entityNames = [
      'Branch', 'UserAccount', 'OrdenTrabajo', 'Venta', 'Cotizacion', 'Inventario',
      'InventarioHistorial', 'InventarioReserva', 'EntregaLog', 'Garantia',
      'ActividadTecnica', 'DiagnosticMasterRecord', 'Diagnostico', 'DiagnosticoTecnico',
      'DiagnosticoDocumento', 'DiagnosticoEvidencia', 'DiagnosticoResultado',
      'OTEvent', 'VentaItem', 'ComprobanteVentaLog', 'WorkflowGate',
      'BranchLifecycleOperation',
    ];
    const loaded = await Promise.all(entityNames.map(async name => [name, await readAll(entities[name], {
      organization_id: organizationId,
    })]));
    const collections = Object.fromEntries(loaded.map(([name, result]) => [name, result.records]));
    const truncatedEntities = loaded.filter(([, result]) => result.truncated).map(([name]) => name);
    const categories = {};
    const branches = collections.Branch || [];
    const branchMap = new Map(branches.map(branch => [branch.id, branch]));
    const branchCache = new Map(branchMap);

    if (organization.status === 'active' && branches.length === 0) {
      addIssue(categories, 'active_organization_without_branch', { organization_id: organizationId });
    }
    if (organization.status === 'active' && !branches.some(branch => branch.active === true)) {
      addIssue(categories, 'active_organization_without_active_branch', { organization_id: organizationId });
    }

    const names = new Map();
    for (const branch of branches) {
      if (!branch.organization_id) addIssue(categories, 'branch_missing_organization', { branch_id: branch.id });
      if (!String(branch.name || '').trim()) addIssue(categories, 'branch_missing_name', { branch_id: branch.id });
      if (branch.active !== true && branch.active !== false) addIssue(categories, 'branch_active_ambiguous', { branch_id: branch.id, active: branch.active ?? null });
      const normalized = normalizeBranchName(branch.normalized_name || branch.name);
      if (normalized) {
        const previous = names.get(normalized);
        if (previous) addIssue(categories, 'duplicate_normalized_branch_name', { branch_id: branch.id, conflicting_branch_id: previous, normalized_name: normalized });
        else names.set(normalized, branch.id);
      }
      if (branch.sale_lock_token && isStale(branch.sale_lock_at)) {
        addIssue(categories, 'stale_branch_sale_lock', { branch_id: branch.id, sale_lock_at: branch.sale_lock_at || null });
      }
    }

    async function resolveBranchReference(record, entityName, required = true) {
      const branchId = record.branch_id;
      if (!branchId) {
        if (required) addIssue(categories, 'missing_required_branch_id', { entity: entityName, record_id: record.id });
        return null;
      }
      let branch = branchCache.get(branchId);
      if (!branch) {
        const found = await entities.Branch.filter({ id: branchId }, '-created_date', 1);
        branch = found?.[0] || null;
        branchCache.set(branchId, branch);
      }
      if (!branch) {
        addIssue(categories, 'branch_reference_not_found', { entity: entityName, record_id: record.id, branch_id: branchId });
      } else if (!branch.organization_id) {
        addIssue(categories, 'branch_reference_missing_organization', { entity: entityName, record_id: record.id, branch_id: branchId });
      } else if (branch.organization_id !== organizationId) {
        addIssue(categories, 'cross_organization_branch_reference', {
          entity: entityName,
          record_id: record.id,
          branch_id: branchId,
          branch_organization_id: branch.organization_id,
        });
      }
      return branch;
    }

    for (const account of collections.UserAccount || []) {
      const requiresBranch = BRANCH_SCOPED_ROLES.has(account.role);
      const branch = await resolveBranchReference(account, 'UserAccount', requiresBranch);
      if (branch?.active !== true && account.branch_id && ['active', 'invited'].includes(account.status)) {
        addIssue(categories, 'user_assigned_to_inactive_branch', { account_id: account.id, branch_id: account.branch_id, status: account.status });
      }
    }

    const direct = [
      ['OrdenTrabajo', true], ['Venta', true], ['Cotizacion', true], ['Inventario', true],
      ['InventarioHistorial', true], ['InventarioReserva', true], ['EntregaLog', true], ['Garantia', true],
    ];
    for (const [entityName, required] of direct) {
      for (const record of collections[entityName] || []) await resolveBranchReference(record, entityName, required);
    }

    const workOrders = new Map((collections.OrdenTrabajo || []).map(record => [record.id, record]));
    const sales = new Map((collections.Venta || []).map(record => [record.id, record]));
    const inventories = new Map((collections.Inventario || []).map(record => [record.id, record]));
    const diagnostics = new Map([
      ...(collections.Diagnostico || []),
      ...(collections.DiagnosticoTecnico || []),
    ].map(record => [record.id, record]));

    for (const ledger of collections.InventarioHistorial || []) {
      const inventory = inventories.get(ledger.inventory_id || ledger.inventario_id);
      if (!inventory) addIssue(categories, 'inventory_ledger_parent_unresolved', { ledger_id: ledger.id, inventory_id: ledger.inventory_id || ledger.inventario_id || null });
      else if (ledger.branch_id !== inventory.branch_id) addIssue(categories, 'inventory_ledger_branch_mismatch', { ledger_id: ledger.id, inventory_id: inventory.id, branch_id: ledger.branch_id, expected_branch_id: inventory.branch_id });
    }
    for (const reservation of collections.InventarioReserva || []) {
      const inventory = inventories.get(reservation.inventory_id || reservation.inventario_id);
      const ot = workOrders.get(reservation.work_order_id);
      if (!inventory || !ot) addIssue(categories, 'inventory_reservation_parent_unresolved', { reservation_id: reservation.id, inventory_id: reservation.inventory_id || reservation.inventario_id || null, work_order_id: reservation.work_order_id || null });
      else if (reservation.branch_id !== inventory.branch_id || reservation.branch_id !== ot.branch_id) addIssue(categories, 'inventory_reservation_branch_mismatch', { reservation_id: reservation.id, branch_id: reservation.branch_id, inventory_branch_id: inventory.branch_id, work_order_branch_id: ot.branch_id });
    }

    for (const log of collections.EntregaLog || []) {
      const ot = workOrders.get(log.orden_trabajo_id);
      if (!ot) addIssue(categories, 'delivery_log_parent_unresolved', { delivery_log_id: log.id, work_order_id: log.orden_trabajo_id });
      else if (log.branch_id !== ot.branch_id) addIssue(categories, 'delivery_log_branch_mismatch', { delivery_log_id: log.id, work_order_id: ot.id, branch_id: log.branch_id, expected_branch_id: ot.branch_id });
    }
    for (const warranty of collections.Garantia || []) {
      const origin = warranty.origen_tipo === 'OT' || warranty.source === 'WORK_ORDER'
        ? workOrders.get(warranty.origen_id || warranty.source_id)
        : sales.get(warranty.origen_id || warranty.source_id);
      if (!origin) addIssue(categories, 'warranty_origin_unresolved', { warranty_id: warranty.id, origin_id: warranty.origen_id || warranty.source_id || null });
      else if (warranty.branch_id !== origin.branch_id) addIssue(categories, 'warranty_branch_mismatch', { warranty_id: warranty.id, branch_id: warranty.branch_id, expected_branch_id: origin.branch_id });
    }

    const otChildren = [
      ['ActividadTecnica', 'orden_trabajo_id'], ['DiagnosticMasterRecord', 'orden_trabajo_id'],
      ['Diagnostico', 'orden_trabajo_id'], ['DiagnosticoTecnico', 'orden_trabajo_id'],
      ['OTEvent', 'orden_trabajo_id'],
    ];
    for (const [entityName, parentField] of otChildren) {
      for (const record of collections[entityName] || []) {
        if (!workOrders.has(record[parentField])) addIssue(categories, 'indirect_work_order_parent_unresolved', { entity: entityName, record_id: record.id, work_order_id: record[parentField] || null });
      }
    }
    for (const entityName of ['DiagnosticoDocumento', 'DiagnosticoEvidencia', 'DiagnosticoResultado']) {
      for (const record of collections[entityName] || []) {
        if (!diagnostics.has(record.diagnostico_id)) addIssue(categories, 'diagnostic_parent_unresolved', { entity: entityName, record_id: record.id, diagnostico_id: record.diagnostico_id || null });
      }
    }
    for (const item of collections.VentaItem || []) {
      if (!sales.has(item.venta_id)) addIssue(categories, 'sale_item_parent_unresolved', { sale_item_id: item.id, sale_id: item.venta_id || null });
    }
    for (const log of collections.ComprobanteVentaLog || []) {
      if (!sales.has(log.venta_id)) addIssue(categories, 'sale_log_parent_unresolved', { sale_log_id: log.id, sale_id: log.venta_id || null });
    }
    for (const gate of collections.WorkflowGate || []) {
      if (gate.subject_type === 'OrdenTrabajo' && !workOrders.has(gate.subject_id)) addIssue(categories, 'workflow_gate_parent_unresolved', { gate_id: gate.id, subject_id: gate.subject_id });
    }

    for (const ot of collections.OrdenTrabajo || []) {
      const branch = branchMap.get(ot.branch_id);
      if (branch?.active === false && (!TERMINAL_WORK_ORDERS.has(ot.estado) || ot.delivery_status === 'PENDING' || ot.lifecycle_lock_token)) {
        addIssue(categories, 'active_operation_on_inactive_branch', { entity: 'OrdenTrabajo', record_id: ot.id, branch_id: ot.branch_id, state: ot.estado });
      }
      if (ot.lifecycle_lock_token && isStale(ot.lifecycle_lock_at)) addIssue(categories, 'stale_work_order_lifecycle_lock', { work_order_id: ot.id, branch_id: ot.branch_id, lifecycle_lock_at: ot.lifecycle_lock_at || null });
    }
    for (const reservation of collections.InventarioReserva || []) {
      const branch = branchMap.get(reservation.branch_id);
      if (branch?.active === false && ['PENDING', 'RESERVED'].includes(reservation.state)) addIssue(categories, 'active_operation_on_inactive_branch', { entity: 'InventarioReserva', record_id: reservation.id, branch_id: reservation.branch_id, state: reservation.state });
    }
    for (const activity of collections.ActividadTecnica || []) {
      if (activity.estado !== 'en_progreso' || activity.soft_deleted === true) continue;
      const ot = workOrders.get(activity.orden_trabajo_id);
      const branch = ot ? branchMap.get(ot.branch_id) : null;
      if (branch?.active === false) addIssue(categories, 'active_operation_on_inactive_branch', { entity: 'ActividadTecnica', record_id: activity.id, branch_id: ot.branch_id, state: activity.estado });
    }
    for (const operation of collections.BranchLifecycleOperation || []) {
      if (operation.status === 'PENDING' && isStale(operation.started_at)) addIssue(categories, 'stale_branch_lifecycle_operation', { operation_id: operation.id, operation_key: operation.operation_key, branch_id: operation.branch_id || null });
    }

    const truncated = truncatedEntities.length > 0;
    return Response.json({
      organization: organization.name || null,
      organization_id: organizationId,
      actor: { id: user.id, role: authorization.role },
      timestamp: new Date().toISOString(),
      gate: Object.keys(categories).length === 0 && !truncated ? 'PASS' : 'BLOCKED',
      truncated,
      truncated_entities: truncatedEntities,
      totals: Object.fromEntries(entityNames.map(name => [name, collections[name]?.length || 0])),
      categories,
    });
  } catch (error) {
    console.error('[auditBranchLegacyData]', error?.message || error);
    return Response.json({ error: 'No fue posible completar la auditoria read-only', code: 'BRANCH_AUDIT_INTERNAL_ERROR' }, { status: 500 });
  }
});
