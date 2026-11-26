// UI contracts only. Backend authorization and transaction integrity remain authoritative.
export function quoteConversionError(quote) {
  if (!quote?.id || quote.estado !== 'aprobada') return 'Solo las cotizaciones aprobadas pueden convertirse en venta.';
  if (quote.venta_id || quote.convertida_at || quote.estado_conversion === 'CONVERTIDA') return 'Esta cotización ya fue convertida. Consultá el historial de ventas.';
  if (quote.estado_conversion === 'EN_PROCESO_FACTURACION') return 'La conversión está en proceso. Verificá su estado antes de continuar.';
  if (quote.estado_conversion && quote.estado_conversion !== 'SIN_CONVERTIR') return 'Estado de conversión no reconocido. Revisá la cotización.';
  if (!Array.isArray(quote.items) || !quote.items.length) return 'La cotización no contiene ítems.';
  return null;
}
export function quoteSaleState(quote) {
  return { cotizacion_origen: quote, carrito: quote.items.map(item => ({ ...item, tipo: item.tipo || 'producto', referencia_id: item.referencia_id || null })), cliente_id: quote.cliente_id, orden_trabajo_id: quote.orden_trabajo_id };
}
export function confirmedSale(response, organizationId, branchId) {
  const result = response?.data;
  const sale = result?.data;
  if (result?.success !== true || !sale?.id || sale.estado !== 'pagada' || sale.organization_id !== organizationId || sale.branch_id !== branchId) {
    throw new Error(result?.error || 'No se confirmó el registro. Conservá el intento y verificá el historial antes de repetir el cobro.');
  }
  return { venta: sale, postSalePending: result.post_sale_pending !== false, recovered: result.recovered === true || result.idempotent === true };
}
export function createAttemptCategoryLoader(load) {
  const pending = new Map();
  return id => {
    if (!id) return Promise.resolve(null);
    if (!pending.has(id)) pending.set(id, Promise.resolve().then(() => load(id)));
    return pending.get(id);
  };
}
