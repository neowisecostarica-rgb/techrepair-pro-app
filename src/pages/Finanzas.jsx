import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageGuard from '@/components/guards/PageGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Users,
  Megaphone,
  BarChart2,
  Lightbulb,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  subMonths,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuthContext } from '@/components/contexts/AuthContext';
import FiltrosFinanzas from '@/components/finanzas/FiltrosFinanzas';

export default function Finanzas() {
  return (
    <PageGuard allowedRoles={['ORG_ADMIN', 'BRANCH_ADMIN']}>
      <FinanzasContent />
    </PageGuard>
  );
}

function fmt(number) {
  if (number === null || number === undefined) return '₡0';
  return `₡${Number(number).toLocaleString('es-CR', { maximumFractionDigits: 0 })}`;
}

function pct(number) {
  if (number === null || number === undefined) return '0.0%';
  return `${Number(number).toFixed(1)}%`;
}

function FinanzasContent() {
  const { effectiveOrgId, userAccount, effectiveRole } = useAuthContext();
  const [periodoPreset, setPeriodoPreset] = useState('mes');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [sucursalId, setSucursalId] = useState(null);

  const isBranchAdmin = effectiveRole === 'BRANCH_ADMIN';
  const branchIdFijo = isBranchAdmin ? userAccount?.branch_id : null;

  useEffect(() => {
    const hoy = new Date();
    let desde, hasta;
    switch (periodoPreset) {
      case 'mes':
        desde = startOfMonth(hoy);
        hasta = endOfMonth(hoy);
        break;
      case 'mes_anterior': {
        const mesAnterior = subMonths(hoy, 1);
        desde = startOfMonth(mesAnterior);
        hasta = endOfMonth(mesAnterior);
        break;
      }
      case 'trimestre':
        desde = startOfQuarter(hoy);
        hasta = endOfQuarter(hoy);
        break;
      case 'año':
        desde = startOfYear(hoy);
        hasta = endOfYear(hoy);
        break;
      case 'personalizado':
        return;
      default:
        desde = startOfMonth(hoy);
        hasta = endOfMonth(hoy);
    }
    setFechaDesde(desde.toISOString().split('T')[0]);
    setFechaHasta(hasta.toISOString().split('T')[0]);
  }, [periodoPreset]);

  const { data: metrics, isLoading: isLoadingMetrics } = useQuery({
    queryKey: ['financial-metrics', effectiveOrgId, fechaDesde, fechaHasta, sucursalId, branchIdFijo],
    queryFn: async () => {
      const payload = {
        organization_id: effectiveOrgId,
        start_date: fechaDesde,
        end_date: fechaHasta,
      };
      if (branchIdFijo) payload.branch_id = branchIdFijo;
      else if (sucursalId) payload.branch_id = sucursalId;
      const res = await base44.functions.invoke('getFinancialMetrics', payload);
      return res.data;
    },
    enabled: !!effectiveOrgId && !!fechaDesde && !!fechaHasta,
  });

  const { data: ventasPagadas = [] } = useQuery({
    queryKey: ['finanzas-linea', effectiveOrgId, fechaDesde, fechaHasta, sucursalId, branchIdFijo],
    queryFn: async () => {
      let query = { organization_id: effectiveOrgId, estado: 'pagada' };
      if (branchIdFijo) query.branch_id = branchIdFijo;
      else if (sucursalId) query.branch_id = sucursalId;
      const all = await base44.entities.Venta.filter(query);
      return all.filter(v => {
        const d = new Date(v.created_date);
        const desde = new Date(fechaDesde);
        const hasta = new Date(fechaHasta);
        hasta.setHours(23, 59, 59);
        return d >= desde && d <= hasta;
      });
    },
    enabled: !!effectiveOrgId && !!fechaDesde && !!fechaHasta,
  });

  const { data: sucursales = [] } = useQuery({
    queryKey: ['branches-finanzas', effectiveOrgId],
    queryFn: () => base44.entities.Branch.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId && !isBranchAdmin,
  });

  const ventasPorDia = {};
  ventasPagadas.forEach(v => {
    const fecha = format(new Date(v.created_date), 'yyyy-MM-dd');
    ventasPorDia[fecha] = (ventasPorDia[fecha] || 0) + v.total;
  });
  const dataLinea = Object.keys(ventasPorDia)
    .sort()
    .map(fecha => ({
      fecha: format(new Date(fecha), 'dd MMM', { locale: es }),
      total: ventasPorDia[fecha],
    }));

  const revenue      = metrics?.sales?.total_revenue     ?? 0;
  const grossMargin  = metrics?.sales?.gross_margin       ?? 0;
  const salesCount   = metrics?.sales?.total_sales_count  ?? 0;
  const cac          = metrics?.marketing?.cac             ?? 0;
  const marketingSpend = metrics?.marketing?.marketing_spend    ?? 0;
  const newClients   = metrics?.marketing?.total_new_clients ?? 0;
  const marginAmount = revenue * (grossMargin / 100);

  let insight = null;
  if (revenue > 0 && marketingSpend > 0) {
    if (revenue > marketingSpend * 3) {
      insight = 'Estás generando más ingresos que lo que inviertes en atraer clientes — un buen ratio de retorno.';
    } else if (revenue > marketingSpend) {
      insight = 'Estás generando más ingresos que lo que inviertes en marketing este período.';
    } else {
      insight = 'Tu inversión en marketing supera los ingresos actuales — vale la pena revisar la estrategia de adquisición.';
    }
  }

  const sucursalFijaNombre = isBranchAdmin && branchIdFijo
    ? (sucursales.find(s => s.id === branchIdFijo)?.name || 'Tu Sucursal')
    : null;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">

      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Finanzas</h1>
          {isBranchAdmin && sucursalFijaNombre && (
            <p className="text-sm text-slate-400 mt-0.5">{sucursalFijaNombre}</p>
          )}
        </div>
        <FiltrosFinanzas
          periodoPreset={periodoPreset}
          onPeriodoPresetChange={setPeriodoPreset}
          fechaDesde={fechaDesde}
          fechaHasta={fechaHasta}
          onFechaDesdeChange={setFechaDesde}
          onFechaHastaChange={setFechaHasta}
          sucursalId={sucursalId}
          onSucursalChange={setSucursalId}
          sucursales={sucursales}
          mostrarSelectorSucursal={!isBranchAdmin}
          sucursalFija={sucursalFijaNombre}
        />
      </div>

      {/* ── LOADING ── */}
      {isLoadingMetrics && (
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="w-9 h-9 border-[3px] border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-400 text-sm">Calculando métricas...</p>
          </div>
        </div>
      )}

      {!isLoadingMetrics && (
        <>
          {/* ── KPI CARDS ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">

            {/* Ingresos */}
            <Card className="border-0 shadow-sm ring-1 ring-slate-100 rounded-2xl bg-white">
              <CardContent className="p-7">
                <div className="flex justify-between items-start mb-5">
                  <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-emerald-500 opacity-80" />
                  </div>
                </div>
                <p className="text-4xl font-bold text-slate-900 leading-none tracking-tight">
                  {fmt(revenue)}
                </p>
                <p className="text-sm text-slate-400 mt-2 font-medium">Ingresos</p>
              </CardContent>
            </Card>

            {/* Margen */}
            <Card className="border-0 shadow-sm ring-1 ring-slate-100 rounded-2xl bg-white">
              <CardContent className="p-7">
                <div className="flex justify-between items-start mb-5">
                  <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                    <BarChart2 className="w-4 h-4 text-blue-500 opacity-80" />
                  </div>
                </div>
                <p className="text-4xl font-bold text-slate-900 leading-none tracking-tight">
                  {pct(grossMargin)}
                </p>
                <p className="text-sm text-slate-400 mt-2 font-medium">Margen</p>
                <p className="text-xs text-slate-400 mt-0.5">{fmt(marginAmount)} ganancia</p>
              </CardContent>
            </Card>

            {/* CAC */}
            <Card className="border-0 shadow-sm ring-1 ring-slate-100 rounded-2xl bg-white">
              <CardContent className="p-7">
                <div className="flex justify-between items-start mb-5">
                  <div className="w-9 h-9 bg-violet-50 rounded-xl flex items-center justify-center">
                    <Users className="w-4 h-4 text-violet-500 opacity-80" />
                  </div>
                </div>
                <p className="text-4xl font-bold text-slate-900 leading-none tracking-tight">
                  {fmt(cac)}
                </p>
                <p className="text-sm text-slate-400 mt-2 font-medium">CAC</p>
                <p className="text-xs text-slate-400 mt-0.5">por cliente nuevo</p>
              </CardContent>
            </Card>

            {/* Ventas */}
            <Card className="border-0 shadow-sm ring-1 ring-slate-100 rounded-2xl bg-white">
              <CardContent className="p-7">
                <div className="flex justify-between items-start mb-5">
                  <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center">
                    <ShoppingCart className="w-4 h-4 text-amber-500 opacity-80" />
                  </div>
                </div>
                <p className="text-4xl font-bold text-slate-900 leading-none tracking-tight">
                  {salesCount}
                </p>
                <p className="text-sm text-slate-400 mt-2 font-medium">Ventas</p>
              </CardContent>
            </Card>
          </div>

          {/* ── BLOQUE SECUNDARIO ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-4 bg-slate-50 rounded-2xl px-6 py-5">
              <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0">
                <Megaphone className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-800">{fmt(marketingSpend)}</p>
                <p className="text-xs text-slate-400 font-medium">Inversión Marketing</p>
              </div>
            </div>

            <div className="flex items-center gap-4 bg-slate-50 rounded-2xl px-6 py-5">
              <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0">
                <Users className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-800">{newClients}</p>
                <p className="text-xs text-slate-400 font-medium">Clientes Nuevos</p>
              </div>
            </div>
          </div>

          {/* ── GRÁFICO ── */}
          <Card className="border-0 shadow-sm ring-1 ring-slate-100 rounded-2xl bg-white">
            <CardHeader className="px-7 pt-7 pb-2">
              <CardTitle className="text-sm font-semibold text-slate-500 flex items-center gap-2 uppercase tracking-wider">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                Ingresos en el tiempo
              </CardTitle>
            </CardHeader>
            <CardContent className="px-7 pb-7 pt-2">
              {dataLinea.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={dataLinea} margin={{ top: 8, right: 4, bottom: 4, left: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" />
                    <XAxis
                      dataKey="fecha"
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={v => `₡${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      formatter={v => [fmt(v), 'Ingresos']}
                      contentStyle={{
                        borderRadius: '12px',
                        border: '0',
                        boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
                        fontSize: '13px',
                        padding: '8px 14px',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: '#10b981', strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex flex-col items-center justify-center text-slate-200 gap-2">
                  <TrendingUp className="w-10 h-10" />
                  <p className="text-sm text-slate-400">Sin datos en el período</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── INSIGHT ── */}
          {insight && (
            <div className="flex items-start gap-3 rounded-2xl px-6 py-4 bg-emerald-50 border border-emerald-100">
              <Lightbulb className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <p className="text-sm text-emerald-800 leading-relaxed">{insight}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}