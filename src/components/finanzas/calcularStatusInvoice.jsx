/**
 * Calcula el status dinámico de una factura de compra (PurchaseInvoice)
 * NO persistir este status en BD - siempre calcularlo on-the-fly
 */
export function calcularStatusInvoice(invoice) {
  if (!invoice) return 'pending';
  
  const saldo = invoice.total_amount - (invoice.paid_amount || 0);
  const hoy = new Date();
  const vencimiento = new Date(invoice.due_date);
  
  // Pagado completamente
  if (saldo === 0) return 'paid';
  
  // Vencido (tiene saldo y pasó fecha vencimiento)
  if (hoy > vencimiento && saldo > 0) return 'overdue';
  
  // Pago parcial (tiene algo pagado pero no todo)
  if (invoice.paid_amount > 0 && saldo > 0) return 'partial';
  
  // Pendiente (nada pagado, dentro de plazo)
  return 'pending';
}

/**
 * Aplica status calculado a una lista de facturas
 */
export function aplicarStatusInvoices(invoices) {
  if (!Array.isArray(invoices)) return [];
  
  return invoices.map(invoice => ({
    ...invoice,
    status: calcularStatusInvoice(invoice),
    saldo: invoice.total_amount - (invoice.paid_amount || 0)
  }));
}

/**
 * Configuración de estilos por status
 */
export const statusInvoiceConfig = {
  pending: {
    label: 'Pendiente',
    className: 'bg-slate-100 text-slate-700',
    icon: '⏳'
  },
  partial: {
    label: 'Pago Parcial',
    className: 'bg-blue-100 text-blue-700',
    icon: '💰'
  },
  paid: {
    label: 'Pagada',
    className: 'bg-emerald-100 text-emerald-700',
    icon: '✅'
  },
  overdue: {
    label: 'Vencida',
    className: 'bg-red-100 text-red-700',
    icon: '🔴'
  }
};