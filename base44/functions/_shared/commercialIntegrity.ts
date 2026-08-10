export const COMMERCIAL_TAX_RATE = 0.13;
const MONEY_TOLERANCE = 0.01;

export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function finiteNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} no es numerico`);
  return parsed;
}

export function calculateCommercialTotals(items, taxRate = COMMERCIAL_TAX_RATE) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('Se requiere al menos una linea comercial');
  let subtotal = 0;
  let discount = 0;
  const canonicalItems = items.map((item, index) => {
    const quantity = finiteNumber(item.cantidad, `Item ${index + 1}: cantidad`);
    const unitPrice = finiteNumber(item.precio_unitario, `Item ${index + 1}: precio_unitario`);
    const discountPercent = finiteNumber(item.descuento_porcentaje || 0, `Item ${index + 1}: descuento`);
    if (quantity <= 0) throw new Error(`Item ${index + 1}: cantidad debe ser mayor a cero`);
    if (unitPrice < 0) throw new Error(`Item ${index + 1}: precio no puede ser negativo`);
    if (discountPercent < 0 || discountPercent > 100) throw new Error(`Item ${index + 1}: descuento fuera de rango`);
    const gross = roundMoney(quantity * unitPrice);
    const lineDiscount = roundMoney(gross * discountPercent / 100);
    const lineSubtotal = roundMoney(gross - lineDiscount);
    subtotal = roundMoney(subtotal + lineSubtotal);
    discount = roundMoney(discount + lineDiscount);
    return {
      ...item,
      cantidad: quantity,
      precio_unitario: roundMoney(unitPrice),
      descuento_porcentaje: roundMoney(discountPercent),
      subtotal: lineSubtotal,
    };
  });
  const impuesto = roundMoney(subtotal * taxRate);
  return {
    items: canonicalItems,
    subtotal,
    descuento_total: discount,
    impuesto,
    total: roundMoney(subtotal + impuesto),
  };
}

export function moneyMatches(left, right) {
  return Number.isFinite(Number(left))
    && Math.abs(roundMoney(left) - roundMoney(right)) <= MONEY_TOLERANCE;
}

export function assertPersistedTotalsMatch(source, calculated, label = 'documento comercial') {
  for (const field of ['subtotal', 'descuento_total', 'impuesto', 'total']) {
    if (!moneyMatches(source?.[field] || 0, calculated[field])) {
      const error = new Error(`${label}: ${field} no coincide con sus lineas persistidas`);
      error.code = 'COMMERCIAL_PERSISTED_TOTAL_MISMATCH';
      throw error;
    }
  }
}

export function assertClientFinancialHints(hints, calculated) {
  for (const field of ['subtotal', 'descuento_total', 'impuesto', 'total']) {
    if (hints?.[field] == null || hints[field] === '') continue;
    if (!moneyMatches(hints[field], calculated[field])) {
      const error = new Error(`El valor enviado para ${field} no coincide con la autoridad del servidor`);
      error.code = 'SALE_AMOUNT_TAMPERING';
      throw error;
    }
  }
}

export function quoteDecisionOperationKey(quoteId, targetStatus) {
  return `quote-decision:${quoteId}:${targetStatus}`;
}

export function quoteDecisionIsCommitted(quote, targetStatus) {
  const quoteStatus = targetStatus === 'APROBADA' ? 'aprobada' : 'rechazada';
  return quote?.estado === quoteStatus
    && quote?.decision_status === 'COMMITTED'
    && quote?.decision_target_status === targetStatus;
}
