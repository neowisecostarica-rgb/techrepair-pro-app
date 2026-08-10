import React, { useMemo } from 'react';
import { isCanonicalActiveUserAccount } from '../../../base44/functions/_shared/userAuthorization.ts';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import StatsCard from './StatsCard';
import RecentOrders from './RecentOrders';
import QuickActions from './QuickActions';
import QuickStartCard from './QuickStartCard';
import { Wrench, DollarSign, Users, UserCog } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { startOfMonth, endOfMonth, format, subDays, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

const ESTADOS_ABIERTOS = [
  'EN_COLA_REVISION',
  'ASIGNADA',
  'EN_REVISION',
  'DIAGNOSTICADA',
  'COTIZADA',
  'EN_REPARACION',
];

function safeDate(value) {
  if (!value) return null;
  const parsed = typeof value === 'string' ? parseISO(value) : new Date(value);
  return isValid(parsed) ? parsed : null;
}

function dateKey(value) {
  const d = safeDate(value);
  if (!d) return null;
  return d.toISOString().split('T')[0];
}

export default function DashboardOrgAdmin({ effectiveOrgId }) {
  const hoy = new Date();

  const startDateObj = startOfMonth(hoy);
  const endDateObj = endOfMonth(hoy);

  const startDate = startDateObj.toISOString().split('T')[0];
  const endDate = endDateObj.toISOString().split('T')[0];

  const {
    data: currentUser,
    isLoading: loadingCurrentUser,
  } = useQuery({
    queryKey: ['dashboard-current-user'],
    queryFn: () => base44.auth.me(),
    staleTime: 300_000,
  });

  const canLoadOrgData = !!effectiveOrgId && !!currentUser;

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

      return res.data || {};
    },
    enabled: canLoadOrgData,
    staleTime: 60_000,
  });

  const {
    data: ordenes = [],
    isLoading: loadingOrdenes,
  } = useQuery({
    queryKey: ['ordenes-dashboard', effectiveOrgId],
    queryFn: () =>
      base44.entities.OrdenTrabajo.filter(
        { organization_id: effectiveOrgId },
        '-created_date',
        500
      ),
    enabled: canLoadOrgData,
    staleTime: 60_000,
  });

  const { data: organization } = useQuery({
    queryKey: ['organization', effectiveOrgId],
    queryFn: () =>
      base44.entities.Organization
        .filter({ id: effectiveOrgId })
        .then(orgs => orgs?.[0] || null),
    enabled: canLoadOrgData,
    staleTime: 300_000,
  });

  const { data: userAccounts = [] } = useQuery({
    queryKey: ['userAccounts', effectiveOrgId],
    queryFn: () =>
      base44.entities.UserAccount.filter(
        { organization_id: effectiveOrgId },
        '-created_date',
        200
      ),
    enabled: canLoadOrgData,
    staleTime: 300_000,
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes-count', effectiveOrgId],
    queryFn: () =>
      base44.entities.Cliente.filter(
        { organization_id: effectiveOrgId },
        '-created_date',
        500
      ),
    enabled: canLoadOrgData,
    staleTime: 300_000,
  });

  const ordenesMes = useMemo(() => {
    return ordenes.filter(o => {
      const created = safeDate(o.created_date || o.created_at);
      if (!created) return false;
      return created >= startDateObj && created <= endDateObj;
    });
  }, [ordenes, startDateObj, endDateObj]);

  const ordenesUltimos7Dias = useMemo(() => {
    const countsByDate = ordenes.reduce((acc, orden) => {
      const key = dateKey(orden.created_date || orden.created_at);
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return Array.from({ length: 7 }, (_, i) => {
      const dia = subDays(hoy, 6 - i);
      const diaStr = dia.toISOString().split('T')[0];

      return {
        fecha: format(dia, 'EEE', { locale: es }),
        cantidad: countsByDate[diaStr] || 0,
      };
    });
  }, [ordenes, hoy]);

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

  const ingresosMes = financialData?.sales?.total_revenue ?? 0;
  const ventasCount = financialData?.sales?.total_sales_count ?? 0;

  const ordenesTotal = ordenesMes.length;
  const ordenesAbiertas = ordenesMes.filter(o => ESTADOS_ABIERTOS.includes(o.estado)).length;
  const ordenesCerradas = Math.max(ordenesTotal - ordenesAbiertas, 0);

  const clientesActivos = clientes.length;

  const tecnicosConOTMes = useMemo(() => {
    const ids = new Set();

    ordenesMes.forEach(o => {
      const techKey =
        o.tecnico_asignado_id ||
        o.tecnico_id ||
        o.tecnico_asignado_email ||
        o.tecnico_email;

      if (techKey) ids.add(techKey);
    });

    return ids.size;
  }, [ordenesMes]);

  const tecnicosRegistrados = userAccounts.filter(
    u => u.role === 'TECHNICIAN' && isCanonicalActiveUserAccount(u)
  ).length;

  const loadingMetrics = loadingCurrentUser || loadingFinancial || loadingOrdenes;

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

      {setupStatus.isSetupIncomplete && (
        <QuickStartCard
          hasBasicInfo={setupStatus.hasBasicInfo}
          hasCollaborators={setupStatus.hasCollaborators}
          hasClients={setupStatus.hasClients}
          hasOrders={setupStatus.hasOrders}
        />
      )}

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
          value={`₡${Number(ingresosMes || 0).toLocaleString()}`}
          icon={DollarSign}
          bgColor="bg-blue-500"
          subtitle={ventasCount ? `${ventasCount} ventas` : 'Sin ventas registradas'}
        />

        <StatsCard
          title="Clientes Activos"
          value={clientesActivos}
          icon={Users}
          bgColor="bg-purple-500"
        />

        <StatsCard
          title="Técnicos con OT"
          value={tecnicosConOTMes}
          icon={UserCog}
          bgColor="bg-orange-500"
          subtitle={`${tecnicosRegistrados} técnicos registrados`}
        />
      </div>

      <Card className="border-0 shadow-lg">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-lg font-semibold">Órdenes por Día (7 días)</CardTitle>
        </CardHeader>

        <CardContent className="p-6">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={ordenesUltimos7Dias}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="fecha" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
              />
              <Bar dataKey="cantidad" fill="#10b981" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentOrders orders={ordenes.slice(0, 10)} />
        </div>

        <QuickActions />
      </div>
    </div>
  );
}
