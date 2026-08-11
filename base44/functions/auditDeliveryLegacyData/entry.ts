import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import {
  DeliveryCommandError,
  determineWarrantyApplicability,
  evaluateCommercialDeliveryGate,
} from '../_shared/deliveryAtomicity.ts';

const PAGE_SIZE = 250;
const MAX_RECORDS = 5000;
const MAX_REFERENCES_PER_CATEGORY = 200;

async function loadPaged(entity, baseFilter = {}) {
  const records = [];
  let cursor = null;
  let truncated = false;
  while (records.length < MAX_RECORDS) {
    const filter = cursor ? { ...baseFilter, created_date: { $lt: cursor } } : { ...baseFilter };
    const page = await entity.filter(filter, '-created_date', Math.min(PAGE_SIZE, MAX_RECORDS - records.length));
    records.push(...(page || []));
    if (!page || page.length < PAGE_SIZE) break;
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

function groupBy(records, key) {
  const grouped = new Map();
  for (const record of records || []) {
    const value = typeof key === 'function' ? key(record) : record?.[key];
    if (!value) continue;
    const bucket = grouped.get(value) || [];
    bucket.push(record);
    grouped.set(value, bucket);
  }
  return grouped;
}

function addIssue(categories, category, record) {
  if (!categories[category]) categories[category] = { count: 0, records: [] };
  categories[category].count += 1;
  if (categories[category].records.length < MAX_REFERENCES_PER_CATEGORY) {
    categories[category].records.push(record);
  }
}

function missingEvidence(log) {
  return [
    !log.branch_id && 'branch_id',
    log.acceptance !== true && 'acceptance',
    !String(log.checkbox_texto_legal || '').trim() && 'checkbox_texto_legal',
    !log.delivered_by_user_id && 'actor',
    !log.delivered_by_role && 'actor_role',
    !log.delivered_at && 'delivered_at',
    !log.operation_key && 'operation_key',
    !log.fingerprint && 'fingerprint',
    log.delivery_status !== 'COMMITTED' && 'delivery_status',
    !['ISSUED', 'NOT_APPLICABLE'].includes(log.delivery_warranty_outcome) && 'delivery_warranty_outcome',
  ].filter(Boolean);
}

function validWarrantyDates(warranty) {
  const issued = Date.parse(`${warranty.fecha_emision || ''}T00:00:00.000Z`);
  const starts = Date.parse(`${warranty.fecha_inicio || ''}T00:00:00.000Z`);
  const ends = Date.parse(`${warranty.fecha_fin || ''}T00:00:00.000Z`);
  return Number.isFinite(issued) && Number.isFinite(starts) && Number.isFinite(ends)
    && issued <= starts && starts < ends;
}

async function findAnyWorkOrder(base44, id) {
  if (!id) return null;
  const records = await base44.asServiceRole.entities.OrdenTrabajo.filter({ id }, '-created_date', 2);
  return records?.[0] || null;
}

Deno.serve(async req => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Metodo no permitido', code: 'METHOD_NOT_ALLOWED' }, { status: 405 });
  }
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });
    const authorization = await resolveAuthorizedContext(base44, user, { allowedRoles: ['ORG_ADMIN'] });
    if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status });
    const organizationId = authorization.organizationId;

    const loaded = await Promise.all([
      loadPaged(base44.asServiceRole.entities.OrdenTrabajo, { organization_id: organizationId }),
      loadPaged(base44.asServiceRole.entities.EntregaLog, { organization_id: organizationId }),
      loadPaged(base44.asServiceRole.entities.Garantia, { organization_id: organizationId }),
      loadPaged(base44.asServiceRole.entities.ActividadTecnica, { organization_id: organizationId }),
      loadPaged(base44.asServiceRole.entities.DiagnosticoTecnico, { organization_id: organizationId }),
      loadPaged(base44.asServiceRole.entities.OTEvent, { organization_id: organizationId }),
      loadPaged(base44.asServiceRole.entities.Venta, { organization_id: organizationId }),
      loadPaged(base44.asServiceRole.entities.Cotizacion, { organization_id: organizationId }),
      loadPaged(base44.asServiceRole.entities.WorkflowGate, { organization_id: organizationId }),
    ]);
    const [otsResult, logsResult, warrantiesResult, activitiesResult, diagnosticsResult,
      eventsResult, salesResult, quotesResult, gatesResult] = loaded;
    const truncated = loaded.some(result => result.truncated);
    const ots = otsResult.records;
    const logs = logsResult.records;
    const warranties = warrantiesResult.records;
    const activities = activitiesResult.records;
    const diagnostics = diagnosticsResult.records;
    const events = eventsResult.records;
    const sales = salesResult.records;
    const quotes = quotesResult.records;
    const gates = gatesResult.records;
    const otById = new Map(ots.map(ot => [ot.id, ot]));
    const logsByOt = groupBy(logs, 'orden_trabajo_id');
    const warrantiesByOt = groupBy(warranties.filter(warranty => warranty.origen_tipo === 'OT'), 'origen_id');
    const activitiesByOt = groupBy(activities, 'orden_trabajo_id');
    const diagnosticsByOt = groupBy(diagnostics, 'orden_trabajo_id');
    const eventsByOt = groupBy(events.filter(event => event.tipo === 'ENTREGADA'), 'orden_trabajo_id');
    const salesByOt = groupBy(sales, 'referencia_ot_id');
    const quotesByOt = groupBy(quotes, 'orden_trabajo_id');
    const gatesByOt = groupBy(gates, 'subject_id');
    const categories = {};

    for (const ot of ots) {
      const deliveryLogs = logsByOt.get(ot.id) || [];
      const otWarranties = warrantiesByOt.get(ot.id) || [];
      if (ot.delivery_status === 'PENDING') {
        addIssue(categories, 'delivery_operation_pending', { work_order_id: ot.id, operation_key: ot.delivery_operation_key || null });
      }
      if (ot.estado !== 'ENTREGADA') continue;

      if (deliveryLogs.length === 0) addIssue(categories, 'delivered_without_log', { work_order_id: ot.id });
      if (deliveryLogs.length > 1) addIssue(categories, 'delivered_with_multiple_logs', { work_order_id: ot.id, log_ids: deliveryLogs.map(log => log.id) });
      if (deliveryLogs.length === 1) {
        const fields = missingEvidence(deliveryLogs[0]);
        if (fields.length) addIssue(categories, 'delivery_evidence_missing', { work_order_id: ot.id, log_id: deliveryLogs[0].id, fields });
        if (deliveryLogs[0].branch_id && deliveryLogs[0].branch_id !== ot.branch_id) {
          addIssue(categories, 'delivery_log_branch_mismatch', { work_order_id: ot.id, log_id: deliveryLogs[0].id });
        }
      }

      const active = (activitiesByOt.get(ot.id) || []).filter(activity => activity.estado === 'en_progreso' && activity.soft_deleted !== true);
      if (active.length) addIssue(categories, 'delivered_with_active_activity', { work_order_id: ot.id, activity_ids: active.map(item => item.id) });
      const deliveryEvents = eventsByOt.get(ot.id) || [];
      if (deliveryEvents.length === 0) addIssue(categories, 'delivered_without_event', { work_order_id: ot.id });
      if (deliveryEvents.length > 1) addIssue(categories, 'delivered_with_duplicate_events', { work_order_id: ot.id, event_ids: deliveryEvents.map(item => item.id) });

      let applicability;
      try {
        applicability = determineWarrantyApplicability(diagnosticsByOt.get(ot.id) || []);
      } catch (error) {
        addIssue(categories, 'warranty_applicability_undetermined', { work_order_id: ot.id, code: error.code || 'UNKNOWN' });
      }
      if (applicability?.applicable && otWarranties.length === 0) {
        addIssue(categories, 'warranty_missing_when_applicable', { work_order_id: ot.id, intervention_type: applicability.intervention_type });
      }
      if (otWarranties.length > 1) addIssue(categories, 'work_order_warranty_duplicated', { work_order_id: ot.id, warranty_ids: otWarranties.map(item => item.id) });

      if (applicability) {
        try {
          evaluateCommercialDeliveryGate({
            ot,
            applicability,
            sales: salesByOt.get(ot.id) || [],
            quotes: quotesByOt.get(ot.id) || [],
            workflowGates: gatesByOt.get(ot.id) || [],
          });
        } catch (error) {
          addIssue(categories, 'delivered_with_unsatisfied_commercial_obligation', { work_order_id: ot.id, code: error.code || 'UNKNOWN' });
        }
      }
    }

    for (const log of logs) {
      const ot = otById.get(log.orden_trabajo_id);
      if (!ot) {
        const external = await findAnyWorkOrder(base44, log.orden_trabajo_id);
        addIssue(categories, external && external.organization_id !== organizationId ? 'delivery_log_organization_mismatch' : 'orphan_delivery_log', {
          log_id: log.id, work_order_id: log.orden_trabajo_id || null,
        });
      } else if (ot.estado !== 'ENTREGADA') {
        addIssue(categories, 'log_for_non_delivered_work_order', { log_id: log.id, work_order_id: ot.id, state: ot.estado });
      }
    }

    const tokenGroups = groupBy(warranties, 'public_access_token');
    for (const warranty of warranties) {
      if (!warranty.public_access_token) addIssue(categories, 'warranty_token_missing', { warranty_id: warranty.id });
      if (!validWarrantyDates(warranty)) addIssue(categories, 'warranty_dates_inconsistent', { warranty_id: warranty.id });
      if (warranty.delivery_status === 'PENDING') addIssue(categories, 'warranty_delivery_pending', { warranty_id: warranty.id, operation_key: warranty.delivery_operation_key || null });
      if (warranty.origen_tipo !== 'OT') continue;
      const ot = otById.get(warranty.origen_id);
      if (!ot) {
        const external = await findAnyWorkOrder(base44, warranty.origen_id);
        addIssue(categories, external && external.organization_id !== organizationId ? 'warranty_organization_mismatch' : 'orphan_work_order_warranty', {
          warranty_id: warranty.id, work_order_id: warranty.origen_id || null,
        });
        continue;
      }
      if (warranty.branch_id && warranty.branch_id !== ot.branch_id) addIssue(categories, 'warranty_branch_mismatch', { warranty_id: warranty.id, work_order_id: ot.id });
      if (ot.estado !== 'ENTREGADA') addIssue(categories, 'warranty_for_non_delivered_work_order', { warranty_id: warranty.id, work_order_id: ot.id, state: ot.estado });
      if (warranty.estado === 'ACTIVA' && ot.estado !== 'ENTREGADA') addIssue(categories, 'warranty_active_before_delivery', { warranty_id: warranty.id, work_order_id: ot.id });
    }
    for (const [token, matching] of tokenGroups) {
      if (token && matching.length > 1) addIssue(categories, 'warranty_token_duplicated', { token, warranty_ids: matching.map(item => item.id) });
    }
    for (const sale of sales) {
      if (sale.referencia_ot_id && sale.post_sale_status === 'PENDING') {
        addIssue(categories, 'post_sale_pending_related_to_work_order', { sale_id: sale.id, work_order_id: sale.referencia_ot_id });
      }
    }

    const totalIssues = Object.values(categories).reduce((total, category) => total + category.count, 0);
    const gate = totalIssues === 0 && !truncated ? 'PASS' : 'BLOCKED';
    return Response.json({
      success: true,
      read_only: true,
      organization_id: organizationId,
      actor_role: authorization.role,
      timestamp: new Date().toISOString(),
      gate,
      truncated,
      totals: {
        work_orders: ots.length,
        delivery_logs: logs.length,
        warranties: warranties.length,
        technical_activities: activities.length,
        diagnostics: diagnostics.length,
        events: events.length,
        sales: sales.length,
        quotes: quotes.length,
        workflow_gates: gates.length,
        inconsistencies: totalIssues,
      },
      inconsistencies: categories,
    });
  } catch (error) {
    const status = error instanceof DeliveryCommandError ? error.status : 500;
    return Response.json({ success: false, read_only: true, error: error.message, code: error.code || 'DELIVERY_AUDIT_FAILED' }, { status });
  }
});
