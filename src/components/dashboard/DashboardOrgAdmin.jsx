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

export default function DashboardOrgAdmin({ effectiveOrgId }) {
  // Queries with organization filter
  const { data: ordenes = [], isLoading: loadingOrdenes } = useQuery({
    queryKey: ['ordenes', effectiveOrgId],
    queryFn: () => base44.entities.OrdenTrabajo.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
  });

  const { data: ventas = [], isLoading: loadingVentas } = useQuery({
    queryKey: ['ventas', effectiveOrgId],
    queryFn: () => base44.entities.Venta.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
  });

  const { data: clientes = [], isLoading: loadingClientes } = useQuery({
    queryKey: ['clientes', effectiveOrgId],
    queryFn: () => base44.entities.Cliente.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
  });

  const { data: userAccounts = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['userAccounts', effectiveOrgId],
    queryFn: () => base44.entities.UserAccount.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
  });

  const { data: organization } = useQuery({
    queryKey: ['organization', effectiveOrgId],
    queryFn: () => base44.entities.Organization.filter({ id: effectiveOrgId }).then(orgs => orgs[0]),
    enabled: !!effectiveOrgId,
  });

  // Quick Start logic: calculate setup status (MUST run before early return)
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

    const isSetupIncomplete = !hasBasicInfo || !hasCollaborators || !hasClients || !hasOrders;

    return {
      hasBasicInfo,
      hasCollaborators,
      hasClients,
      hasOrders,
      isSetupIncomplete,
    };
  }, [organization, userAccounts, clientes, ordenes]);

  const isLoading = loadingOrdenes || loadingVentas || loadingClientes || loadingUsers;

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-6 text-center">
        <p className="text-slate-500">Cargando métricas...</p>
      </div>
    );
  }

  // Calculate metrics (last 30 days)
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const ordenesLast30Days = ordenes.filter(o => {
    const createdDate = new Date(o.created_date);
    return createdDate >= thirtyDaysAgo;
  });

  const ordenesAbiertas = ordenes.filter(o => 
    !['ENTREGADA', 'CANCELADA'].includes(o.estado)
  ).length;

  const ordenesCerradas = ordenes.filter(o => 
    ['ENTREGADA', 'CANCELADA'].includes(o.estado)
  ).length;

  const ventasLast30Days = ventas.filter(v => {
    const createdDate = new Date(v.created_date);
    return createdDate >= thirtyDaysAgo && v.estado === 'pagada';
  });

  const ingresosMes = ventasLast30Days.reduce((sum, v) => sum + (v.total || 0), 0);

  const clientesActivos = clientes.length;

  const tecnicosActivos = userAccounts.filter(u => 
    u.role === 'TECHNICIAN' && u.active === true
  ).length;

  // Chart data: orders by day (last 7 days)
  const ordenesUltimos7Dias = Array.from({ length: 7 }, (_, i) => {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - (6 - i));
    const ordenesDelDia = ordenes.filter(o => {
      const ordenFecha = new Date(o.created_date);
      return ordenFecha.toDateString() === fecha.toDateString();
    });
    return {
      fecha: fecha.toLocaleDateString('es', { weekday: 'short' }),
      cantidad: ordenesDelDia.length
    };
  });

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
          value={ordenesLast30Days.length}
          icon={Wrench}
          bgColor="bg-emerald-500"
          subtitle={`${ordenesAbiertas} abiertas / ${ordenesCerradas} cerradas`}
        />
        <StatsCard
          title="Ingresos (30d)"
          value={`₡${ingresosMes.toLocaleString()}`}
          icon={DollarSign}
          bgColor="bg-blue-500"
          subtitle={`${ventasLast30Days.length} ventas`}
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