import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import StatsCard from './StatsCard';
import RecentOrders from './RecentOrders';
import QuickActions from './QuickActions';
import QuickStartCard from './QuickStartCard';
import { Wrench, DollarSign, Users, UserCog } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { startOfMonth, endOfMonth, format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';

export default function DashboardOrgAdmin({ effectiveOrgId }) {
  const hoy = new Date();
  const startDate = startOfMonth(hoy).toISOString().split('T')[0];
  const endDate = endOfMonth(hoy).toISOString().split('T')[0];

  // ── Métricas financieras via función existente ─────────────────────────
  const {
    data: financialData,
    isLoading: loadingFinancial,
  } = useQuery({
    queryKey: ['dashboard-financial', effectiveOrgId, startDate, endDate],
    queryFn: async () => {
      const res = await base44.functions.invoke('getFinancialMetrics', {
        organization_id: effectiveOrgId,
        start_date: startDate,
        end_date: endDate,
      });
      return res.data;
    },
    enabled: !!effectiveOrgId,
    staleTime: 60_000,
  });

  // ── OTs del mes (para conteo y chart) ─────────────────────────────────
  const { data: ordenes = [], isLoading: loadingOrdenes } = useQuery({
    queryKey: ['ordenes-dashboard', effectiveOrgId, startDate],
    queryFn: () => base44.entities.OrdenTrabajo.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
    staleTime: 60_000,
  });

  // ── Datos estructurales ───────────────────────────────────────────────
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

  const loadingMetrics = loadingFinancial || loadingOrdenes;

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
    const hasOrders = ordenes.length > 0;
    return {
      hasBasicInfo,
      hasCollaborators,
      hasClients,
      hasOrders,
      isSetupIncomplete: !hasBasicInfo || !hasCollaborators || !hasClients || !hasOrders,
    };
  }, [organization, userAccounts, clientes, ordenes]);

  // ── Mapeo de métricas ─────────────────────────────────────────────────
  const ingresosMes  = financialData?.sales?.total_revenue    ?? 0;
  const ventasCount  = financialData?.sales?.total_sales_count ?? 0;

  // OTs del mes actual
  const ordenesMes = ordenes.filter(o => {
    const f = new Date(o.created_date);
    return f >= new Date(startDate) && f <= new Date(endDate);
  });
  const estadosAbiertos = ['EN_COLA_REVISION', 'ASIGNADA', 'EN_REVISION', 'DIAGNOSTICADA', 'COTIZADA', 'EN_REPARACION'];
  const ordenesTotal    = ordenesMes.length;
  const ordenesAbiertas = ordenesMes.filter(o => estadosAbiertos.includes(o.estado)).length;
  const ordenesCerradas = ordenesTotal - ordenesAbiertas;

  const clientesActivos = clientes.length;
  const tecnicosActivos = userAccounts.filter(u => u.role === 'TECHNICIAN' && u.active !== false).length;

  // Chart: OTs por día (últimos 7 días)
  const ordenesUltimos7Dias = Array.from({ length: 7 }, (_, i) => {
    const dia = subDays(hoy, 6 - i);
    const diaStr = dia.toISOString().split('T')[0];
    const cantidad = ordenes.filter(o => o.created_date?.startsWith(diaStr)).length;
    return { fecha: format(dia, 'EEE', { locale: es }), cantidad };
  });

  // ── Loading state ──────────────────────────────────────────────────────
  if (loadingMetrics) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Dashboard Ejecutivo</h1>
          <p className="text-slate-500">Vista general de operaciones (mes actual)</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">Dashboard Ejecutivo</h1>
        <p className="text-slate-500">Vista general de operaciones (mes actual)</p>
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
          title="Órdenes (mes)"
          value={ordenesTotal}
          icon={Wrench}
          bgColor="bg-emerald-500"
          subtitle={`${ordenesAbiertas} abiertas / ${ordenesCerradas} cerradas`}
        />
        <StatsCard
          title="Ingresos (mes)"
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