import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const methods = [['efectivo','Efectivo'], ['tarjeta','Tarjeta'], ['transferencia','Transferencia'], ['mixto','Mixto (sin desglose)'], ['unknown','Sin método confirmado']];
const amount = n => Number(n).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ResumenCobros({ sales, loading, error, onRetry }) {
  const groups = Object.fromEntries(methods.map(([key]) => [key, { count: 0, cents: 0 }]));
  const seen = new Set();
  let invalid = false;
  for (const sale of sales || []) {
    if (!sale.id || seen.has(sale.id) || sale.estado !== 'pagada' || typeof sale.total !== 'number' || !Number.isFinite(sale.total) || sale.total < 0 || !Number.isSafeInteger(Math.round(sale.total * 100))) {
      invalid = true;
      continue;
    }
    seen.add(sale.id);
    const key = methods.some(([key]) => key === sale.metodo_pago) ? sale.metodo_pago : 'unknown';
    groups[key].count++;
    groups[key].cents += Math.round(sale.total * 100);
    if (!Number.isSafeInteger(groups[key].cents)) invalid = true;
  }
  return <Card className="border-slate-200">
    <CardHeader><CardTitle>Resumen de cobros registrados</CardTitle><p className="text-sm text-slate-500">Ventas pagadas según el período y la sucursal seleccionados. No equivale a saldo físico, arqueo, ni cierre de caja.</p></CardHeader>
    <CardContent>
      {loading ? <p>Consultando ventas…</p> : error || invalid ? <div role="alert">No se pudo confirmar el conjunto de ventas. <button type="button" className="underline" onClick={onRetry}>Reintentar</button></div> :
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {methods.map(([key,label]) => <div key={key} className="rounded-xl border p-4"><p className="text-sm text-slate-600">{label}</p><p className="font-semibold text-xl tabular-nums">{amount(groups[key].cents / 100)}</p><p className="text-xs text-slate-500">{groups[key].count} ventas</p></div>)}
      </div>}
      <p className="mt-4 text-xs text-slate-500">Importes nominales de los registros existentes; la moneda histórica no está acreditada por documento. Los cobros mixtos no se asignan a efectivo. No se incluyen fondos de apertura, retiros ni gastos.</p>
    </CardContent>
  </Card>;
}
