import jsPDF from 'jspdf';
import { format } from 'date-fns';
const money = value => '₡' + Number(value || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = value => { try { return value ? format(new Date(value), 'dd/MM/yyyy') : '—'; } catch { return '—'; } };
/** Presentation-only document: never changes any record, authorizes a quote, or issues a fiscal invoice. */
export function descargarDocumentoCotizacion(cotizacion, cliente, organization, tipo = 'cotizacion') {
  if (!cotizacion?.id || !['cotizacion', 'proforma'].includes(tipo)) throw new Error('Documento comercial inválido');
  const doc = new jsPDF(), pageWidth = doc.internal.pageSize.width, margin = 14;
  let y = 22;
  const ensure = needed => { if (y + needed > 275) { doc.addPage(); y = 20; } };
  const line = (label, value) => {
    ensure(9); doc.setFont('helvetica', 'bold'); doc.text(label, margin, y);
    doc.setFont('helvetica', 'normal'); doc.text(String(value ?? '—'), margin + 35, y); y += 8;
  };
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text(tipo === 'proforma' ? 'PROFORMA COMERCIAL' : 'COTIZACIÓN COMERCIAL', pageWidth / 2, y, { align: 'center' });
  y += 11; doc.setFontSize(9); doc.setTextColor(160, 30, 30);
  doc.text('Este documento NO es una factura ni comprobante fiscal', pageWidth / 2, y, { align: 'center' });
  doc.setTextColor(0, 0, 0); y += 15; doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text(String(organization?.name || 'Negocio').slice(0, 80), margin, y); y += 9; doc.setFontSize(10);
  if (organization?.telefono_negocio) line('Teléfono:', organization.telefono_negocio);
  line('Cliente:', cliente?.nombre_completo || 'N/A');
  line('Estado:', cotizacion.estado || '—'); line('Fecha:', date(cotizacion.created_date));
  if (cotizacion.valida_hasta) line('Válida hasta:', date(cotizacion.valida_hasta));
  y += 5; ensure(14); doc.setFont('helvetica', 'bold'); doc.text('DETALLE', margin, y); y += 9;
  (cotizacion.items || []).forEach((item, index) => {
    const desc = doc.splitTextToSize(String(item.descripcion || 'Sin descripción'), pageWidth - 70);
    ensure(Math.max(16, 6 * desc.length + 12)); doc.setFont('helvetica', 'normal');
    doc.text(String(index + 1) + '.', margin, y); doc.text(desc, margin + 8, y); y += 6 * desc.length + 2; doc.setFontSize(9);
    const discount = Number(item.descuento_porcentaje || 0) ? ' (-' + item.descuento_porcentaje + '%)' : '';
    doc.text(String(Number(item.cantidad || 0)) + ' x ' + money(item.precio_unitario) + discount, margin + 8, y);
    doc.text(money(item.subtotal), pageWidth - margin, y, { align: 'right' }); y += 12; doc.setFontSize(10);
  });
  ensure(40); doc.line(margin, y, pageWidth - margin, y); y += 8;
  doc.text('Subtotal:', margin, y); doc.text(money(cotizacion.subtotal), pageWidth - margin, y, { align: 'right' }); y += 8;
  if (Number(cotizacion.descuento_total || 0)) {
    doc.text('Descuento:', margin, y); doc.text('-' + money(cotizacion.descuento_total), pageWidth - margin, y, { align: 'right' }); y += 8;
  }
  doc.text('Impuestos:', margin, y); doc.text(money(cotizacion.impuesto), pageWidth - margin, y, { align: 'right' }); y += 9;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text('TOTAL:', margin, y); doc.text(money(cotizacion.total), pageWidth - margin, y, { align: 'right' });
  if (cotizacion.notas) {
    y += 14; const notes = doc.splitTextToSize(String(cotizacion.notas), pageWidth - 2 * margin);
    ensure(notes.length * 5 + 9); doc.setFontSize(10); doc.text('Notas:', margin, y); y += 7;
    doc.setFont('helvetica', 'normal'); doc.text(notes, margin, y);
  }
  doc.save((tipo === 'proforma' ? 'Proforma_' : 'Cotizacion_') + cotizacion.id + '.pdf');
}
