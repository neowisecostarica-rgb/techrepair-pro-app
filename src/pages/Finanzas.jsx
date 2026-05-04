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
  if (number === null || number === undefined) return '0%';
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

  // Calcular fechas según preset
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

  // getFinancialMetrics — fuente principal
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

  // Ventas pagadas para el gráfico de línea temporal
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

  // Sucursales para filtro
  const { data: sucursales = [] } = useQuery({
    queryKey: ['branches-finanzas', effectiveOrgId],
    queryFn: () => base44.entities.Branch.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId && !isBranchAdmin,
  });

  // Gráfico de ingresos en el tiempo
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

  // Métricas
  const revenue = metrics?.sales?.total_revenue ?? 0;
  const grossMargin = metrics?.sales?.gross_margin ?? 0;
  const salesCount = metrics?.sales?.total_sales_count ?? 0;
  const cac = metrics?.marketing?.cac ?? 0;
  const marketingSpend = metrics?.marketing?.marketing_spend ?? 0;
  const newClients = metrics?.marketing?.total_new_clients ?? 0;

  // Margen en monto absoluto: gross_margin% sobre revenue
  const marginAmount = revenue * (grossMargin / 100);

  // Insight simple
  let insight = null;
  if (revenue > 0 && marketingSpend > 0) {
    if (revenue > marketingSpend * 3) {
      insight = 'Tus ingresos superan ampliamente la inversión en marketing este período.';
    } else if (revenue > marketingSpend) {
      insight = 'Tus ventas superan tu inversión en marketing este período.';
    } else {
      insight = 'Tu inversión en marketing supera los ingresos este período — revisa la estrategia.';
    }
  } else if (revenue > 0) {
    insight = 'No hay inversión en marketing registrada para comparar con ingresos.';
  }

  const isLoading = isLoadingMetrics;

  const sucursalFijaNombre = isBranchAdmin && branchIdFijo
    ? (sucursales.find(s => s.id === branchIdFijo)?.name || 'Tu Sucursal')
    : null;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">

      {/* ── A. HEADER ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Estado Financiero</h1>
          {isBranchAdmin && (
            <p className="text-sm text-slate-500 mt-1">{sucursalFijaNombre || 'Tu Sucursal'}</p>
          )}
        </div>
        <div className="shrink-0">
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
      </div>

      {/* ── LOADING ───────────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-slate-500 text-sm">Cargando métricas financieras...</p>
          </div>
        </div>
      )}

      {!isLoading && (
        <>
          {/* ── B. BLOQUE PRINCIPAL — 4 KPI CARDS ───────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">

            {/* Ingresos */}
            <Card className="border-0 shadow-md bg-white rounded-2xl">
              <CardContent className="p-7">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-emerald-600" />
                  </div>
                  <span className="text-sm font-medium text-slate-500">Ingresos</span>
                </div>
                <p className="text-4xl font-bold text-slate-900 leading-none">{fmt(revenue)}</p>
                <p className="text-xs text-slate-400 mt-2">en el período seleccionado</p>
              </CardContent>
            </Card>

            {/* Margen */}
            <Card className="border-0 shadow-md bg-white rounded-2xl">
              <CardContent className="p-7">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                    <BarChart2 className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="text-sm font-medium text-slate-500">Margen</span>
                </div>
                <p className="text-4xl font-bold text-slate-900 leading-none">{pct(grossMargin)}</p>
                <p className="text-xs text-slate-400 mt-2">{fmt(marginAmount)} equivalente</p>
              </CardContent>
            </Card>

            {/* CAC */}
            <Card className="border-0 shadow-md bg-white rounded-2xl">
              <CardContent className="p-7">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center">
                    <Users className="w-5 h-5 text-violet-600" />
                  </div>
                  <span className="text-sm font-medium text-slate-500">CAC</span>
                </div>
                <p className="text-4xl font-bold text-slate-900 leading-none">{fmt(cac)}</p>
                <p className="text-xs text-slate-400 mt-2">por cliente nuevo</p>
              </CardContent>
            </Card>

            {/* Ventas */}
            <Card className="border-0 shadow-md bg-white rounded-2xl">
              <CardContent className="p-7">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                    <ShoppingCart className="w-5 h-5 text-amber-600" />
                  </div>
                  <span className="text-sm font-medium text-slate-500">Ventas</span>
                </div>
                <p className="text-4xl font-bold text-slate-900 leading-none">{salesCount}</p>
                <p className="text-xs text-slate-400 mt-2">en el período</p>
              </CardContent>
            </Card>
          </div>

          {/* ── C. BLOQUE SECUNDARIO — 2 MÉTRICAS ───────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Card className="border-0 shadow-sm bg-slate-50 rounded-2xl">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-sm">
                  <Megaphone className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Inversión Marketing</p>
                  <p className="text-xl font-semibold text-slate-800">{fmt(marketingSpend)}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm bg-slate-50 rounded-2xl">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-sm">
                  <Users className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Clientes Nuevos</p>
                  <p className="text-xl font-semibold text-slate-800">{newClients}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── D. GRÁFICO — Ingresos en el tiempo ──────────────────────────────── */}
          <Card className="border-0 shadow-md rounded-2xl bg-white">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold text-slate-700 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                Ingresos en el tiempo
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dataLinea.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={dataLinea} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="fecha"
                      stroke="#cbd5e1"
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#cbd5e1"
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={v => `₡${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      formatter={v => [fmt(v), 'Ingresos']}
                      contentStyle={{
                        borderRadius: '10px',
                        border: '0',
                        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
                        fontSize: '13px',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 5, fill: '#10b981' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[260px] flex flex-col items-center justify-center text-slate-300 gap-2">
                  <TrendingUp className="w-10 h-10" />
                  <p className="text-sm">Sin ventas en el período</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── E. INSIGHT ───────────────────────────────────────────────────────── */}
          {insight && (
            <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 rounded-2xl px-5 py-4">
              <Lightbulb className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <p className="text-sm text-emerald-800">{insight}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}