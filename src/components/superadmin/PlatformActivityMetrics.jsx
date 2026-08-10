import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Zap, Globe, Users } from 'lucide-react';
import { getIdentityAdminOverview } from '@/api/identity';

export default function PlatformActivityMetrics({ organizations }) {
  const { data: allVentas = [], isLoading } = useQuery({
    queryKey: ['super-admin-platform-activity'],
    queryFn: () => base44.entities.Venta.filter({ estado: 'pagada' }),
    enabled: organizations?.length > 0,
    staleTime: 60000,
  });

  const { data: identityOverview = {} } = useQuery({
    queryKey: ['identity', 'admin-overview'],
    queryFn: getIdentityAdminOverview,
    staleTime: 60000,
  });
  const allUserAccounts = identityOverview.accounts || [];

  const today = new Date().toISOString().split('T')[0];
  const transaccionesHoy = allVentas.filter(v => v.created_date?.startsWith(today));
  const volumenHoy = transaccionesHoy.reduce((s, v) => s + (v.total || 0), 0);
  const volumenTotal = allVentas.reduce((s, v) => s + (v.total || 0), 0);
  const usuariosActivos = allUserAccounts.filter(u => u.active).length;
  const orgsActivas = organizations.filter(o => o.status === 'active').length;

  // Top orgs por volumen transaccional (actividad, no rentabilidad)
  const actividadPorOrg = organizations.map(org => ({
    name: org.name,
    transacciones: allVentas.filter(v => v.organization_id === org.id).length,
    volumen: allVentas
      .filter(v => v.organization_id === org.id)
      .reduce((s, v) => s + (v.total || 0), 0),
  })).sort((a, b) => b.transacciones - a.transacciones).slice(0, 5);

  const formatVolumen = (val) =>
    val >= 1000000
      ? `${(val / 1000000).toFixed(1)}M`
      : val >= 1000
      ? `${(val / 1000).toFixed(1)}K`
      : val.toFixed(0);

  if (isLoading) {
    return (
      <Card className="border-0 shadow-xl">
        <CardContent className="p-6">
          <div className="h-6 bg-slate-100 rounded animate-pulse w-64 mb-4" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-xl">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="w-5 h-5 text-slate-600" />
          Platform Activity — Uso del Sistema
        </CardTitle>
        <p className="text-xs text-slate-400 mt-1">
          Métricas de actividad transaccional agregada. No representa finanzas ni rentabilidad de los tenants.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-slate-500" />
              <p className="text-xs font-semibold text-slate-500">Orgs Activas</p>
            </div>
            <p className="text-2xl font-bold text-slate-900">{orgsActivas}</p>
            <p className="text-xs text-slate-400 mt-1">de {organizations.length} totales</p>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-slate-500" />
              <p className="text-xs font-semibold text-slate-500">Usuarios Activos</p>
            </div>
            <p className="text-2xl font-bold text-slate-900">{usuariosActivos}</p>
            <p className="text-xs text-slate-400 mt-1">en plataforma</p>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-slate-500" />
              <p className="text-xs font-semibold text-slate-500">Transacciones Hoy</p>
            </div>
            <p className="text-2xl font-bold text-slate-900">{transaccionesHoy.length}</p>
            <p className="text-xs text-slate-400 mt-1">vol. {formatVolumen(volumenHoy)}</p>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-slate-500" />
              <p className="text-xs font-semibold text-slate-500">Total Transacciones</p>
            </div>
            <p className="text-2xl font-bold text-slate-900">{allVentas.length}</p>
            <p className="text-xs text-slate-400 mt-1">vol. {formatVolumen(volumenTotal)}</p>
          </div>
        </div>

        {actividadPorOrg.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Actividad por Organización (transacciones procesadas)
            </p>
            <div className="space-y-2">
              {actividadPorOrg.map((org, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-sm text-slate-600">{org.name}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-slate-400">{org.transacciones} transacciones</span>
                    <span className="text-xs text-slate-500 font-mono">vol. {formatVolumen(org.volumen)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
