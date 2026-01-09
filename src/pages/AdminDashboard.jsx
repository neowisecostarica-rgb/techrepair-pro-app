import React, { useState } from 'react';
import PageGuard from '@/components/guards/PageGuard';
import { useOrgAdminMetrics } from '@/components/hooks/useOrgAdminMetrics';
import FiltroFechas from '@/components/admin-dashboard/FiltroFechas';
import ResumenOperativo from '@/components/admin-dashboard/ResumenOperativo';
import ProductividadAgregada from '@/components/admin-dashboard/ProductividadAgregada';
import SaludTaller from '@/components/admin-dashboard/SaludTaller';
import EquipoStatus from '@/components/admin-dashboard/EquipoStatus';
import InventarioOperativo from '@/components/admin-dashboard/InventarioOperativo';
import { Loader2, BarChart3 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function AdminDashboard() {
  return (
    <PageGuard allowedRoles={['ORG_ADMIN']}>
      <AdminDashboardContent />
    </PageGuard>
  );
}

function AdminDashboardContent() {
  const [days, setDays] = useState(7);
  const { metrics, raw, isLoading, error } = useOrgAdminMetrics({ days });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-emerald-600" />
          <p className="text-slate-600">Cargando métricas...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Error al cargar métricas: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 mb-2 flex items-center gap-3">
            <BarChart3 className="w-10 h-10 text-emerald-500" />
            Dashboard Admin
          </h1>
          <p className="text-slate-500">Vista operativa del taller</p>
        </div>
        <FiltroFechas days={days} onChange={setDays} />
      </div>

      {/* Widgets */}
      <div className="space-y-6">
        <ResumenOperativo metrics={metrics} />
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ProductividadAgregada metrics={metrics} />
          <SaludTaller metrics={metrics} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <EquipoStatus metrics={metrics} />
          <InventarioOperativo metrics={metrics} inventarioRaw={raw.inventarioRaw} />
        </div>
      </div>

      {/* Mensaje si no hay datos */}
      {metrics.actividadesTotales === 0 && (
        <Alert>
          <AlertDescription>
            No hay actividades registradas en el periodo seleccionado. 
            Las métricas se calcularán una vez que haya actividades técnicas registradas.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}