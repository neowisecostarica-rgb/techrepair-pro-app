import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import StatsCard from './StatsCard';
import { Building2, Users, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getIdentityAdminOverview } from '@/api/identity';

export default function DashboardSuperAdmin() {
  // Global queries (no org filter)
  const { data: overview = {}, isLoading: loadingIdentity } = useQuery({
    queryKey: ['identity', 'admin-overview'],
    queryFn: getIdentityAdminOverview,
  });
  const organizations = overview.organizations || [];
  const userAccounts = overview.accounts || [];

  const { data: ordenes = [], isLoading: loadingOrdenes } = useQuery({
    queryKey: ['ordenes'],
    queryFn: () => base44.entities.OrdenTrabajo.list('-created_date', 1000),
  });

  const isLoading = loadingIdentity || loadingOrdenes;

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center">
        <p className="text-slate-500">Cargando métricas de plataforma...</p>
      </div>
    );
  }

  const orgsActivas = organizations.filter(o => o.status === 'active').length;
  const usuariosActivos = userAccounts.filter(u => u.active === true).length;
  const totalOrdenes = ordenes.length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">Dashboard Super Admin</h1>
        <p className="text-slate-500">Métricas globales de la plataforma</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatsCard
          title="Organizaciones Activas"
          value={orgsActivas}
          icon={Building2}
          bgColor="bg-purple-500"
          subtitle={`${organizations.length} totales`}
        />
        <StatsCard
          title="Usuarios Activos"
          value={usuariosActivos}
          icon={Users}
          bgColor="bg-blue-500"
          subtitle={`${userAccounts.length} totales`}
        />
        <StatsCard
          title="Órdenes (Global)"
          value={totalOrdenes}
          icon={Wrench}
          bgColor="bg-emerald-500"
        />
      </div>

      {/* Quick Action */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-6 text-center">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Panel de Administración</h3>
          <Link to={createPageUrl('Saas')}>
            <Button size="lg">Ir al Panel SaaS</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
