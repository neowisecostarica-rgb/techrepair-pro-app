import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Wrench, DollarSign, FileText } from 'lucide-react';

const ESTADOS_OT_ACTIVA = [
  'EN_COLA_REVISION', 'ASIGNADA', 'EN_REVISION', 'DIAGNOSTICADA',
  'COTIZADA', 'APROBADA', 'EN_REPARACION', 'PRUEBAS',
];

function StatCard({ icon: Icon, iconBg, title, rows }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3 min-w-0">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{title}</p>
        <div className="space-y-1">
          {rows.map(({ label, value, highlight }) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500 truncate">{label}</span>
              <span className={`text-sm font-bold tabular-nums ${highlight ? 'text-orange-600' : 'text-slate-900'}`}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ResumenEjecutivo({ clienteId }) {
  const { data: ots = [] } = useQuery({
    queryKey: ['ots-cliente-resumen', clienteId],
    queryFn: () => base44.entities.OrdenTrabajo.filter({ cliente_id: clienteId }),
    enabled: !!clienteId,
    staleTime: 60_000,
  });

  const { data: ventas = [] } = useQuery({
    queryKey: ['ventas-cliente-resumen', clienteId],
    queryFn: () => base44.entities.Venta.filter({ cliente_id: clienteId }),
    enabled: !!clienteId,
    staleTime: 60_000,
  });

  const { data: cotizaciones = [] } = useQuery({
    queryKey: ['cotizaciones-cliente-resumen', clienteId],
    queryFn: () => base44.entities.Cotizacion.filter({ cliente_id: clienteId }),
    enabled: !!clienteId,
    staleTime: 60_000,
  });

  const stats = useMemo(() => {
    const otsActivas = ots.filter(o => ESTADOS_OT_ACTIVA.includes(o.estado)).length;
    const ventasPagadas = ventas.filter(v => v.estado === 'pagada');
    const montoAcumulado = ventasPagadas.reduce((sum, v) => sum + (v.total || 0), 0);
    const cotizPendientes = cotizaciones.filter(c =>
      ['borrador', 'enviada', 'en_revision'].includes(c.estado)
    ).length;

    return { otsActivas, otsTotal: ots.length, ventasTotal: ventasPagadas.length, montoAcumulado, cotizPendientes, cotizTotal: cotizaciones.length };
  }, [ots, ventas, cotizaciones]);

  const formatMonto = (n) => {
    if (n >= 1_000_000) return `₡${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `₡${(n / 1_000).toFixed(0)}K`;
    return `₡${n.toFixed(0)}`;
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
      <StatCard
        icon={Wrench}
        iconBg="bg-orange-100 text-orange-600"
        title="Órdenes de Trabajo"
        rows={[
          { label: 'Activas', value: stats.otsActivas, highlight: stats.otsActivas > 0 },
          { label: 'Total', value: stats.otsTotal },
        ]}
      />
      <StatCard
        icon={DollarSign}
        iconBg="bg-emerald-100 text-emerald-600"
        title="Ventas"
        rows={[
          { label: 'Cantidad', value: stats.ventasTotal },
          { label: 'Monto acum.', value: formatMonto(stats.montoAcumulado) },
        ]}
      />
      <StatCard
        icon={FileText}
        iconBg="bg-blue-100 text-blue-600"
        title="Cotizaciones"
        rows={[
          { label: 'Pendientes', value: stats.cotizPendientes, highlight: stats.cotizPendientes > 0 },
          { label: 'Total', value: stats.cotizTotal },
        ]}
      />
    </div>
  );
}