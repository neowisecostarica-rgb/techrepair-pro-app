// UI response contracts; no transaction or authorization authority.
export function confirmReception(result, correlationId) {
  if (result?.success !== true || !result.work_order?.id || !result.equipment?.id || !result.dmr?.id || !result.event?.id || result.correlation_id !== correlationId) {
    throw new Error(result?.error || 'Recepción no confirmada. Verificá el expediente antes de repetir el registro.');
  }
  return result;
}
export function confirmEquipment(result, customerId) {
  if (!result?.id || result.cliente_id !== customerId || result.error) {
    throw new Error(result?.error || 'El servidor no confirmó el equipo de este cliente.');
  }
  return result;
}
export function confirmDelivery(result, order) {
  if (result?.success !== true || !order?.id || result.work_order?.id !== order.id || result.work_order?.estado !== 'ENTREGADA' || result.work_order?.organization_id !== order.organization_id || result.work_order?.branch_id !== order.branch_id || !result.delivery_log?.id) {
    throw new Error(result?.error || 'Entrega no confirmada. Verificá el expediente antes de repetir.');
  }
  return result;
}
export function deliveryNotice(result) {
  const warranty = result.warranty_outcome === 'ISSUED' && result.warranty?.id ? 'Garantía registrada.' : result.warranty_outcome === 'NOT_APPLICABLE' ? 'Garantía no aplicable.' : 'Garantía pendiente de verificación.';
  return warranty + (result.non_critical_side_effects?.event_status === 'PENDING_RETRY' ? ' Seguimiento pendiente de conciliación. No repitás la entrega.' : '');
}
