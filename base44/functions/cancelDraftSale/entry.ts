import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { getCanonicalBranchScope } from '../_shared/operationalAuthorization.ts';
import { appendAuditEvent } from '../_shared/auditEvent.ts';

const response = (message, status, code) =>
  Response.json({ success: false, error: message, code }, { status });
const id = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 160;

Deno.serve(async req => {
  if (req.method !== 'POST') return response('Método no permitido', 405, 'METHOD_NOT_ALLOWED');
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return response('No autenticado', 401, 'UNAUTHENTICATED');
    const authorization = await resolveAuthorizedContext(base44, user, {
      allowedRoles: ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES'],
    });
    if (!authorization.ok) return response(authorization.error, authorization.status, 'SALE_CANCEL_UNAUTHORIZED');
    const scope = getCanonicalBranchScope(authorization);
    if (!scope.ok) return response(scope.error, scope.status, scope.code || 'SALE_CANCEL_BRANCH_INVALID');
    const body = await req.json().catch(() => ({}));
    if (!id(body.venta_id) || !id(body.operation_id)) {
      return response('venta_id y operation_id son obligatorios', 400, 'SALE_CANCEL_ID_REQUIRED');
    }
    const orgId = authorization.organizationId;
    const records = await base44.asServiceRole.entities.Venta.filter({
      id: body.venta_id, organization_id: orgId,
    }, '-created_date', 2);
    if (records.length !== 1) return response('Venta no encontrada o ambigua', 404, 'SALE_CANCEL_NOT_FOUND');
    const sale = records[0];
    if (!scope.organizationWide && sale.branch_id !== scope.branchId) {
      return response('Venta fuera de sucursal', 403, 'SALE_CANCEL_BRANCH_MISMATCH');
    }
    if (!sale.branch_id) return response('Sucursal del borrador no identificada', 409, 'SALE_CANCEL_BRANCH_MISSING');
    if (sale.estado !== 'borrador' && sale.estado !== 'anulada') {
      return response('Solo se puede anular un borrador sin procesar', 409, 'SALE_CANCEL_STATE_FORBIDDEN');
    }
    if (sale.inventory_commit_status === 'COMMITTED' || sale.inventory_committed_at
      || sale.post_sale_status === 'COMPLETED' || sale.post_sale_completed_at
      || ['failed', 'partial'].includes(sale.rollback_status)) {
      return response('La venta tiene movimientos o estado incierto; requiere conciliación', 409, 'SALE_CANCEL_EFFECTS_PRESENT');
    }
    const audit = async () => appendAuditEvent(base44, {
      eventType: 'SALE_DRAFT_CANCELLED',
      principalClass: authorization.principalClass,
      actorUserId: user.id,
      actorPrimaryRole: authorization.persistedRole,
      organizationId: orgId,
      branchId: sale.branch_id,
      resourceType: 'Venta',
      resourceId: sale.id,
      commandPolicyId: 'CP-SALE-CANCEL-001',
      correlationId: body.operation_id,
      auditOperationId: 'sale-cancel:' + sale.id,
      operationKey: body.operation_id,
      operationSemantics: { action: 'CANCEL_DRAFT' },
      newState: { estado: 'anulada' },
    });
    if (sale.estado === 'anulada') {
      if (sale.cancel_operation_id !== body.operation_id) {
        return response('El borrador fue anulado por otra operación', 409, 'SALE_CANCEL_ALREADY_CANCELLED');
      }
      try {
        await audit();
        return Response.json({ success: true, idempotent: true, venta_id: sale.id, estado: 'anulada' });
      } catch (error) {
        console.error('[cancelDraftSale] audit replay failed', error?.message);
        return response('Anulación registrada; auditoría pendiente de conciliación', 503, 'SALE_CANCEL_AUDIT_UNCERTAIN');
      }
    }
    let claimed;
    try {
      claimed = await base44.asServiceRole.entities.Venta.updateMany({
        id: sale.id, organization_id: orgId, branch_id: sale.branch_id, estado: 'borrador',
        cancel_operation_id: { $exists: false },
      }, { $set: {
        estado: 'anulada', cancel_operation_id: body.operation_id,
        cancelado_at: new Date().toISOString(), cancelado_por: user.id,
      } });
    } catch (error) {
      console.error('[cancelDraftSale] conditional write uncertain', error?.message);
      return response('Estado de anulación incierto, verificar antes de reintentar', 503, 'SALE_CANCEL_WRITE_UNCERTAIN');
    }
    if (claimed?.updated !== 1) {
      return response('Otro proceso cambió el borrador; recargá la pantalla', 409, 'SALE_CANCEL_CONCURRENT_UPDATE');
    }
    try {
      await audit();
    } catch (error) {
      console.error('[cancelDraftSale] audit write uncertain', error?.message);
      return response('Borrador anulado, auditoría pendiente de conciliación', 503, 'SALE_CANCEL_AUDIT_UNCERTAIN');
    }
    return Response.json({ success: true, venta_id: sale.id, estado: 'anulada', idempotent: false });
  } catch (error) {
    console.error('[cancelDraftSale]', error?.message);
    return response('No se pudo anular el borrador', 500, 'SALE_CANCEL_INTERNAL_ERROR');
  }
});
