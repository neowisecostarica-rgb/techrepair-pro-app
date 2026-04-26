import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import StatsCard from './StatsCard';
import RecentOrders from './RecentOrders';
import QuickActions from './QuickActions';
import QuickStartCard from './QuickStartCard';
import { Wrench, DollarSign, Users, UserCog, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const SOT_BASE_URL = '/v1';

async function fetchMetricsSummary(orgId) {
  const res = await fetch(`${SOT_BASE_URL}/work-orders/metrics/summary`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Organization-Id': orgId,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function DashboardOrgAdmin({ effectiveOrgId }) {
  // ── SOT: única llamada al backend de métricas ──────────────────────────
  const {
    data: metrics,
    isLoading: loadingMetrics,
    isError: errorMetrics,
  } = useQuery({
    queryKey: ['metrics-summary', effectiveOrgId],
    queryFn: () => fetchMetricsSummary(effectiveOrgId),
    enabled: !!effectiveOrgId,
    staleTime: 60_000,
  });

  // ── Setup Card: sigue usando base44 (datos estructurales, no métricas) ──
  const { data: organization } = useQuery({
    queryKey: ['organization', effectiveOrgId],
    queryFn: () => base44.entities.Organization.filter({ id: effectiveOrgId }).then(orgs => orgs[0]),
    enabled: !!effectiveOrgId,
    staleTime: 300_000,
  });

  const { data: userAccounts = [] } = useQuery({
    queryKey: ['userAccounts', effectiveOrgId],
    queryFn: () => base44.entities.UserAccount.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
    staleTime: 300_000,
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes-count', effectiveOrgId],
    queryFn: () => base44.entities.Cliente.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
    staleTime: 300_000,
  });

  // ── RecentOrders: se mantiene con base44 (órdenes individuales con detalle) ──
  const { data: ordenes = [] } = useQuery({
    queryKey: ['ordenes-recent', effectiveOrgId],
    queryFn: () => base44.entities.OrdenTrabajo.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
    staleTime: 60_000,
  });

  // ── Quick Start logic ──────────────────────────────────────────────────
  const setupStatus = useMemo(() => {
    const hasBasicInfo = !!(
      organization?.legal_name &&
      organization?.telefono_negocio &&
      organization?.country &&
      organization?.currency
    );
    const hasCollaborators = userAccounts.some(u => u.role !== 'ORG_ADMIN');
    const hasClients = clientes.length > 0;
    const hasOrders = (metrics?.summary?.total ?? 0) > 0;
    return {
      hasBasicInfo,
      hasCollaborators,
      hasClients,
      hasOrders,
      isSetupIncomplete: !hasBasicInfo || !hasCollaborators || !hasClients || !hasOrders,
    };
  }, [organization, userAccounts, clientes, metrics]);

  // ── Mapeo de métricas SOT → UI ─────────────────────────────────────────
  const ordenesTotal     = metrics?.summary?.total        ?? 0;
  const ordenesAbiertas  = metrics?.operations?.backlog   ?? 0;
  const ordenesCerradas  = ordenesTotal - ordenesAbiertas;
  const ingresosMes      = metrics?.business?.revenue     ?? 0;
  const ventasCount      = metrics?.business?.sales_count ?? 0;
  const clientesActivos  = metrics?.summary?.clients      ?? clientes.length;
  const tecnicosActivos  = metrics?.summary?.technicians  ?? userAccounts.filter(u => u.role === 'TECHNICIAN' && u.active).length;
  const chartData        = metrics?.priority?.daily_breakdown ?? [];

  // Normalizar chart data al shape esperado por recharts
  const ordenesUltimos7Dias = chartData.length > 0
    ? chartData.map(d => ({ fecha: d.label ?? d.date ?? d.day, cantidad: d.count ?? d.cantidad ?? 0 }))
    : Array.from({ length: 7 }, (_, i) => {
        const fecha = new Date();
        fecha.setDate(fecha.getDate() - (6 - i));
        return { fecha: fecha.toLocaleDateString('es', { weekday: 'short' }), cantidad: 0 };
      });

  // ── Estados de carga / error ──────────────────────────────────────────
  if (loadingMetrics) {
    return (
      <div className="max-w-7xl mx-auto p-6 text-center">
        <p className="text-slate-500">Cargando métricas...</p>
      </div>
    );
  }

  if (errorMetrics) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">No se pudieron cargar las métricas del backend. Intenta recargar la página.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">Dashboard Ejecutivo</h1>
        <p className="text-slate-500">Vista general de operaciones (últimos 30 días)</p>
      </div>

      {/* Quick Start Card (only if setup incomplete) */}
      {setupStatus.isSetupIncomplete && (
        <QuickStartCard
          hasBasicInfo={setupStatus.hasBasicInfo}
          hasCollaborators={setupStatus.hasCollaborators}
          hasClients={setupStatus.hasClients}
          hasOrders={setupStatus.hasOrders}
        />
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Órdenes (30d)"
          value={ordenesTotal}
          icon={Wrench}
          bgColor="bg-emerald-500"
          subtitle={`${ordenesAbiertas} abiertas / ${ordenesCerradas} cerradas`}
        />
        <StatsCard
          title="Ingresos (30d)"
          value={`₡${ingresosMes.toLocaleString()}`}
          icon={DollarSign}
          bgColor="bg-blue-500"
          subtitle={ventasCount ? `${ventasCount} ventas` : undefined}
        />
        <StatsCard
          title="Clientes Activos"
          value={clientesActivos}
          icon={Users}
          bgColor="bg-purple-500"
        />
        <StatsCard
          title="Técnicos Activos"
          value={tecnicosActivos}
          icon={UserCog}
          bgColor="bg-orange-500"
        />
      </div>

      {/* Chart */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-lg font-semibold">Órdenes por Día (7 días)</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={ordenesUltimos7Dias}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="fecha" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}
              />
              <Bar dataKey="cantidad" fill="#10b981" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentOrders orders={ordenes.slice(0, 10)} />
        </div>
        <QuickActions />
      </div>
    </div>
  );
}