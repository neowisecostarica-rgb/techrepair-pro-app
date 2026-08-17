/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SFHS: ExpedienteComercial — FASE 6
 * ═══════════════════════════════════════════════════════════════════════════
 * STATUS: ACTIVE
 * USED_BY: pages/ExpedienteOT
 * DESCRIPTION: Integración comercial: Cotizaciones, Ventas, Pagos y
 *   Documentos. Solo lectura — sin modificar flujo comercial existente.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { FileText, ShoppingCart, ChevronDown, ChevronUp, ExternalLink
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { issuePublicLink } from '@/api/publicLinks';

// ── Bloque colapsable ─────────────────────────────────────────────────────
function Bloque({ label, icon: Icon, accentClass = 'bg-slate-50 text-slate-600', defaultOpen = true, badge, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center gap-2 px-4 py-3 text-left ${accentClass} hover:brightness-95 transition`}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wide flex-1">{label}</span>
        {badge && <span className="ml-auto mr-2">{badge}</span>}
        {open ? <ChevronUp className="w-4 h-4 opacity-50" /> : <ChevronDown className="w-4 h-4 opacity-50" />}
      </button>
      {open && <div className="px-4 py-3 bg-white">{children}</div>}
    </div>
  );
}

const COTIZACION_ESTADO_CONF = {
  borrador:   { label: 'Borrador',   color: 'bg-slate-100 text-slate-600' },
  enviada:    { label: 'Enviada',    color: 'bg-blue-100 text-blue-700' },
  aprobada:   { label: 'Aprobada',   color: 'bg-emerald-100 text-emerald-700' },
  rechazada:  { label: 'Rechazada',  color: 'bg-red-100 text-red-700' },
  vencida:    { label: 'Vencida',    color: 'bg-orange-100 text-orange-700' },
};

const VENTA_ESTADO_CONF = {
  borrador:       { label: 'Borrador',      color: 'bg-slate-100 text-slate-600' },
  procesando:     { label: 'Procesando',    color: 'bg-blue-100 text-blue-700' },
  pagada:         { label: 'Pagada',        color: 'bg-emerald-100 text-emerald-700' },
  anulada:        { label: 'Anulada',       color: 'bg-red-100 text-red-700' },
  inconsistente:  { label: 'Inconsistente', color: 'bg-orange-100 text-orange-700' },
};

const METODO_PAGO_LABELS = {
  efectivo:      'Efectivo',
  tarjeta:       'Tarjeta',
  transferencia: 'Transferencia',
  mixto:         'Mixto',
};

const CONCEPTO_LABELS = {
  revision_diagnostico: 'Revisión / Diagnóstico',
  reparacion:           'Reparación',
  venta_producto:       'Venta de Producto',
  otro:                 'Otro',
};

export default function ExpedienteComercial({ ot, ventas = [], cotizaciones = [], effectiveRole }) {
  // ── Cargar items de ventas para detallar pagos ────────────────────────────
  const ventasIds = ventas.map(v => v.id);
  const { data: ventaItems = [] } = useQuery({
    queryKey: ['expediente-venta-items', ventasIds.join(',')],
    queryFn: async () => {
      if (ventasIds.length === 0) return [];
      // Carga ítems de todas las ventas en paralelo
      const results = await Promise.all(
        ventasIds.map(vid => base44.entities.VentaItem.filter({ venta_id: vid }))
      );
      return results.flat();
    },
    enabled: ventasIds.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  const totalCobrado = ventas
    .filter(v => v.estado === 'pagada')
    .reduce((acc, v) => acc + (Number(v.total) || 0), 0);

  if (!ot) return null;

  return (
    <div className="space-y-3">

      {/* ── Resumen financiero ────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Cotizaciones</p>
          <p className="text-2xl font-bold text-slate-800">{cotizaciones.length}</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Ventas</p>
          <p className="text-2xl font-bold text-slate-800">{ventas.length}</p>
        </div>
        <div className={`rounded-xl border p-3 text-center ${totalCobrado > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Total Cobrado</p>
          <p className={`text-xl font-bold ${totalCobrado > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
            ₡{totalCobrado.toLocaleString('es-CR')}
          </p>
        </div>
      </div>

      {/* ── Cotizaciones ─────────────────────────────────────────────────── */}
      <Bloque
        label={`Cotizaciones (${cotizaciones.length})`}
        icon={FileText}
        accentClass="bg-blue-50 text-blue-700"
        defaultOpen={cotizaciones.length > 0}
        badge={
          cotizaciones.find(c => c.estado === 'aprobada')
            ? <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">Aprobada</Badge>
            : null
        }
      >
        {cotizaciones.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-2">Sin cotizaciones registradas.</p>
        ) : (
          <div className="space-y-3">
            {cotizaciones.map(cot => {
              const conf = COTIZACION_ESTADO_CONF[cot.estado] || { label: cot.estado, color: 'bg-slate-100 text-slate-600' };
              return (
                <div key={cot.id} className="border border-slate-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge className={`${conf.color} border-0 text-xs`}>{conf.label}</Badge>
                      {cot.numero && (
                        <span className="text-xs font-mono text-slate-500">{cot.numero}</span>
                      )}
                    </div>
                    <span className="text-sm font-bold text-slate-900">
                      ₡{Number(cot.total || 0).toLocaleString('es-CR')}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>Creada: {format(new Date(cot.created_date), "dd MMM yyyy", { locale: es })}</span>
                    {cot.valida_hasta && (
                      <span>Válida hasta: {format(new Date(cot.valida_hasta), "dd MMM yyyy", { locale: es })}</span>
                    )}
                  </div>
                  {cot.notas && (
                    <p className="mt-2 text-xs text-slate-600 bg-slate-50 rounded p-2">{cot.notas}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Bloque>

      {/* ── Ventas y Pagos ────────────────────────────────────────────────── */}
      <Bloque
        label={`Ventas y Pagos (${ventas.length})`}
        icon={ShoppingCart}
        accentClass="bg-emerald-50 text-emerald-700"
        defaultOpen={ventas.length > 0}
      >
        {ventas.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-2">Sin ventas registradas para esta OT.</p>
        ) : (
          <div className="space-y-3">
            {ventas.map(venta => {
              const conf = VENTA_ESTADO_CONF[venta.estado] || { label: venta.estado, color: 'bg-slate-100 text-slate-600' };
              const itemsVenta = ventaItems.filter(i => i.venta_id === venta.id);

              return (
                <div key={venta.id} className="border border-slate-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge className={`${conf.color} border-0 text-xs`}>{conf.label}</Badge>
                      {venta.tipo_concepto && (
                        <span className="text-xs text-slate-500">{CONCEPTO_LABELS[venta.tipo_concepto] || venta.tipo_concepto}</span>
                      )}
                    </div>
                    <span className="text-base font-bold text-slate-900">
                      ₡{Number(venta.total || 0).toLocaleString('es-CR')}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-3 text-xs text-slate-500 mb-2">
                    <span>{format(new Date(venta.created_date), "dd MMM yyyy HH:mm", { locale: es })}</span>
                    {venta.metodo_pago && (
                      <span className="font-medium text-slate-700">
                        {METODO_PAGO_LABELS[venta.metodo_pago] || venta.metodo_pago}
                      </span>
                    )}
                    {venta.descuento_total > 0 && (
                      <span className="text-amber-600">Descuento: ₡{Number(venta.descuento_total).toLocaleString('es-CR')}</span>
                    )}
                  </div>

                  {/* Ítems de venta */}
                  {itemsVenta.length > 0 && (
                    <div className="border-t border-slate-50 pt-2 space-y-1">
                      {itemsVenta.map((item, i) => (
                        <div key={i} className="flex justify-between text-xs text-slate-600">
                          <span>{item.descripcion} {item.cantidad > 1 ? `×${item.cantidad}` : ''}</span>
                          <span className="font-medium">₡{Number(item.subtotal || 0).toLocaleString('es-CR')}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Comprobante público */}
                  {venta.estado === 'pagada' && (
                    <div className="mt-2">
                      <button
                        onClick={async () => window.open(await issuePublicLink('receipt', venta.id), '_blank', 'noopener,noreferrer')}
                        className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" /> Ver comprobante
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Bloque>

    </div>
  );
}
