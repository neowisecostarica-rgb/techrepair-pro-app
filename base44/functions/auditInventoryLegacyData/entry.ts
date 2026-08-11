import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';

const LIMIT = 500;
const SAMPLE_LIMIT = 50;
const physicalTypes = new Set(['producto', 'repuesto']);
const sample = records => records.slice(0, SAMPLE_LIMIT).map(record => record.id || record);

Deno.serve(async req => {
  if (req.method !== 'POST') return Response.json({ error: 'Metodo no permitido' }, { status: 405 });
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });
  const authorization = await resolveAuthorizedContext(base44, user, { allowedRoles: ['ORG_ADMIN'] });
  if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status });
  const organizationId = authorization.organizationId;
  const entities = base44.asServiceRole.entities;

  const [inventory, ledger, quotes, diagnostics, activities, requests, reservations] = await Promise.all([
    entities.Inventario.filter({ organization_id: organizationId }, '-created_date', LIMIT),
    entities.InventarioHistorial.filter({ organization_id: organizationId }, '-created_date', LIMIT),
    entities.Cotizacion.filter({ organization_id: organizationId }, '-created_date', LIMIT),
    entities.DiagnosticoTecnico.filter({ organization_id: organizationId }, '-created_date', LIMIT),
    entities.ActividadTecnica.filter({ organization_id: organizationId }, '-created_date', LIMIT),
    entities.SolicitudTecnica.filter({ organization_id: organizationId }, '-created_date', LIMIT),
    entities.InventarioReserva.filter({ organization_id: organizationId }, '-created_date', LIMIT),
  ]);

  const missingBranch = inventory.filter(record => !record.branch_id);
  const negativeProjection = inventory.filter(record => Number(record.cantidad_disponible || 0) < 0 || Number(record.cantidad_reservada || 0) < 0);
  const stockWithoutLedger = inventory.filter(record => Number(record.cantidad_disponible || 0) + Number(record.cantidad_reservada || 0) !== 0
    && !ledger.some(row => row.inventario_id === record.id));
  const malformedLedger = ledger.filter(row => !row.branch_id || !row.movement_key || !row.movement_type || !row.operation_key);
  const duplicateMovementKeys = [...new Set(ledger.map(row => row.movement_key).filter(Boolean)
    .filter((key, index, all) => all.indexOf(key) !== index))];
  const quoteReferenceGaps = [];
  for (const quote of quotes) {
    for (const [index, item] of (quote.items || []).entries()) {
      if (!physicalTypes.has(item.tipo)) continue;
      if (!item.referencia_id || item.item_id) quoteReferenceGaps.push(`${quote.id}:${index}`);
    }
  }
  const diagnosticReferenceGaps = [];
  for (const diagnostic of diagnostics) {
    for (const [index, part] of (diagnostic.repuestos_requeridos || []).entries()) {
      if (!part.inventario_id) diagnosticReferenceGaps.push(`${diagnostic.id}:${index}`);
    }
  }
  const activityQuantityGaps = activities.filter(record => record.inventario_id && !(Number(record.inventario_cantidad) > 0));
  const invalidReservations = reservations.filter(record => !record.branch_id || !record.inventario_id
    || !(Number(record.quantity) > 0) || !['PENDING', 'RESERVED', 'CONSUMED', 'RELEASED', 'RETURNED'].includes(record.state));
  const fulfilledWithoutMovement = requests.filter(record => ['COMPLETADA', 'ATENDIDA', 'FULFILLED'].includes(record.estado)
    && record.inventario_id
    && !ledger.some(row => row.reference_id === record.id || row.work_order_id === record.orden_trabajo_id));

  const checks = {
    inventory_missing_branch: { count: missingBranch.length, sample_ids: sample(missingBranch) },
    negative_projection: { count: negativeProjection.length, sample_ids: sample(negativeProjection) },
    stock_without_any_ledger: { count: stockWithoutLedger.length, sample_ids: sample(stockWithoutLedger) },
    malformed_or_legacy_ledger: { count: malformedLedger.length, sample_ids: sample(malformedLedger) },
    duplicate_movement_keys: { count: duplicateMovementKeys.length, sample_ids: duplicateMovementKeys.slice(0, SAMPLE_LIMIT) },
    quote_reference_gaps: { count: quoteReferenceGaps.length, sample_ids: quoteReferenceGaps.slice(0, SAMPLE_LIMIT) },
    diagnostic_part_reference_gaps: { count: diagnosticReferenceGaps.length, sample_ids: diagnosticReferenceGaps.slice(0, SAMPLE_LIMIT) },
    activity_quantity_gaps: { count: activityQuantityGaps.length, sample_ids: sample(activityQuantityGaps) },
    invalid_reservations: { count: invalidReservations.length, sample_ids: sample(invalidReservations) },
    fulfilled_requests_without_movement: { count: fulfilledWithoutMovement.length, sample_ids: sample(fulfilledWithoutMovement) },
  };
  const totalFindings = Object.values(checks).reduce((sum, check) => sum + check.count, 0);
  return Response.json({
    success: true,
    read_only: true,
    organization_id: organizationId,
    gate: totalFindings === 0 ? 'PASS' : 'REQUIRED',
    total_findings: totalFindings,
    truncated: [inventory, ledger, quotes, diagnostics, activities, requests, reservations].some(rows => rows.length >= LIMIT),
    checks,
  });
});
