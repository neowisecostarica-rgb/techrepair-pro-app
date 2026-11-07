/** Candidate-only domain policy. NOT A LIVE BACKEND WRITER. 
 * Server implementation must use a transactional conditional update and durable audit ledger.
 */
const allowedRoles = new Set(['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES']);
const hasText = value => typeof value === 'string' && value.trim().length > 0;
const refusal = (code, message) => ({ ok: false, code, message });

export function decideDraftSaleCancellation({ sale, organizationId, branchId, role, actorId, operationId }) {
  if (!hasText(organizationId) || !hasText(actorId) || !hasText(operationId)) {
    return refusal('SALE_CANCEL_CONTEXT_REQUIRED', 'Falta identidad autorizada u operación');
  }
  if (!allowedRoles.has(role)) return refusal('SALE_CANCEL_FORBIDDEN', 'Rol no autorizado');
  if (!sale || !hasText(sale.id)) return refusal('SALE_CANCEL_NOT_FOUND', 'No existe la venta');
  if (sale.organization_id !== organizationId) return refusal('SALE_CANCEL_SCOPE_MISMATCH', 'Venta fuera de organización');
  if (!hasText(sale.branch_id) || (role !== 'ORG_ADMIN' && (!hasText(branchId) || sale.branch_id !== branchId))) {
    return refusal('SALE_CANCEL_BRANCH_MISMATCH', 'Venta fuera de sucursal');
  }
  const cancelKey = 'sale-cancel:' + organizationId + ':' + sale.id;
  if (sale.estado === 'anulada') {
    if (sale.cancel_operation_id === operationId) return { ok: true, idempotent: true, operationKey: cancelKey };
    return refusal('SALE_ALREADY_CANCELLED', 'Venta ya anulada con otra operación');
  }
  if (sale.estado !== 'borrador') return refusal('SALE_CANCEL_STATE_FORBIDDEN', 'Solo se puede cancelar un borrador sin efectos');
  if (sale.inventory_commit_status === 'COMMITTED' || sale.inventory_committed_at || sale.post_sale_status === 'COMPLETED' || sale.post_sale_completed_at) {
    return refusal('SALE_CANCEL_EFFECTS_PRESENT', 'Existen efectos de negocio o inventario');
  }
  if (sale.rollback_status === 'failed' || sale.rollback_status === 'partial') {
    return refusal('SALE_CANCEL_ROLLBACK_UNCERTAIN', 'Requiere conciliación manual');
  }
  return { ok: true, idempotent: false, operationKey: cancelKey, expectedState: 'borrador', nextState: 'anulada', auditEventType: 'SALE_DRAFT_CANCELLED' };
}
