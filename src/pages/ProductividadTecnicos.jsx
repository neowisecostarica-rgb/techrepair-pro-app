import React, { useState } from 'react';
import PageGuard from '@/components/guards/PageGuard';
import { useTecnicoMetrics } from '@/components/hooks/useTecnicoMetrics';
import FiltroFechas from '@/components/admin-dashboard/FiltroFechas';
import TecnicoCard from '@/components/admin-dashboard/TecnicoCard';
import { Loader2, Users } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function ProductividadTecnicos() {
  return (
    <PageGuard allowedRoles={['ORG_ADMIN']}>
      <ProductividadTecnicosContent />
    </PageGuard>
  );
}

function ProductividadTecnicosContent() {
  const [days, setDays] = useState(30);
  const { tecnicos, isLoading } = useTecnicoMetrics({ days });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-emerald-600" />
          <p className="text-slate-600">Cargando métricas de técnicos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 mb-2 flex items-center gap-3">
            <Users className="w-10 h-10 text-blue-500" />
            Productividad por Técnico
          </h1>
          <p className="text-slate-500">Métricas individuales para gestión</p>
        </div>
        <FiltroFechas days={days} onChange={setDays} />
      </div>

      {/* Nota explicativa */}
      <Alert className="bg-blue-50 border-blue-200">
        <AlertDescription className="text-blue-800">
          <strong>Nota:</strong> Esta vista es privada y solo visible para administradores. 
          Las métricas muestran promedios comparados con el equipo, no rankings de "mejor/peor".
        </AlertDescription>
      </Alert>

      {/* Lista de técnicos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tecnicos.map(tecnico => (
          <TecnicoCard key={tecnico.tecnico_id} tecnico={tecnico} />
        ))}
      </div>

      {/* Mensaje si no hay datos */}
      {tecnicos.length === 0 && (
        <Alert>
          <AlertDescription>
            No hay técnicos con actividades en el periodo seleccionado.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}