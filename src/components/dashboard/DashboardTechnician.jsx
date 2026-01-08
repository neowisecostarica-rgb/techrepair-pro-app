import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import StatsCard from './StatsCard';
import { Wrench, Clock, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { Button } from '@/components/ui/button';

export default function DashboardTechnician({ effectiveOrgId, userId }) {
  const { data: ordenes = [], isLoading } = useQuery({
    queryKey: ['ordenes', effectiveOrgId, userId],
    queryFn: () => base44.entities.OrdenTrabajo.filter({ 
      organization_id: effectiveOrgId,
      tecnico_asignado_id: userId
    }),
    enabled: !!effectiveOrgId && !!userId,
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center">
        <p className="text-slate-500">Cargando tus órdenes...</p>
      </div>
    );
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Assigned today
  const ordenesHoy = ordenes.filter(o => {
    const createdDate = new Date(o.created_date);
    return createdDate >= today;
  });

  // Overdue (more than 7 days without update)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const ordenesAtrasadas = ordenes.filter(o => {
    if (['ENTREGADA', 'CANCELADA'].includes(o.estado)) return false;
    const lastActivity = o.ultima_actividad_at ? new Date(o.ultima_actividad_at) : new Date(o.created_date);
    return lastActivity < sevenDaysAgo;
  });

  // Calculate avg resolution time
  const ordenesCompletadas = ordenes.filter(o => o.estado === 'ENTREGADA' && o.fecha_cierre);
  const avgResolutionDays = ordenesCompletadas.length > 0
    ? ordenesCompletadas.reduce((sum, o) => {
        const start = new Date(o.created_date);
        const end = new Date(o.fecha_cierre);
        const diffDays = (end - start) / (1000 * 60 * 60 * 24);
        return sum + diffDays;
      }, 0) / ordenesCompletadas.length
    : 0;

  // Active orders
  const ordenesActivas = ordenes.filter(o => 
    !['ENTREGADA', 'CANCELADA'].includes(o.estado)
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">Mi Dashboard</h1>
        <p className="text-slate-500">Tus métricas y órdenes asignadas</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatsCard
          title="Asignadas Hoy"
          value={ordenesHoy.length}
          icon={Wrench}
          bgColor="bg-emerald-500"
        />
        <StatsCard
          title="Atrasadas"
          value={ordenesAtrasadas.length}
          icon={Clock}
          bgColor="bg-red-500"
        />
        <StatsCard
          title="Tiempo Prom. (días)"
          value={avgResolutionDays.toFixed(1)}
          icon={CheckCircle}
          bgColor="bg-blue-500"
        />
      </div>

      {/* Active Orders */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">
              Órdenes Activas ({ordenesActivas.length})
            </h3>
            <Link to={createPageUrl('MiDia')}>
              <Button size="sm">Ver Mi Día</Button>
            </Link>
          </div>
          <div className="space-y-3">
            {ordenesActivas.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No tienes órdenes activas</p>
            ) : (
              ordenesActivas.slice(0, 5).map(orden => (
                <div key={orden.id} className="p-4 bg-slate-50 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">OT-{orden.id.slice(0, 6)}</p>
                    <p className="text-sm text-slate-600">{orden.motivo_ingreso}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Estado</p>
                    <p className="text-sm font-medium text-emerald-600">{orden.estado}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}