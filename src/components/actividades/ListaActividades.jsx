import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useActividadesTecnicas } from '../hooks/useActividadesTecnicas';
import { CheckCircle, Clock, AlertCircle, Loader2, Activity, BarChart2 } from 'lucide-react';

export default function ListaActividades({ ordenTrabajoId }) {
  const { actividades, isLoading } = useActividadesTecnicas(ordenTrabajoId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (actividades.length === 0) {
    return (
      <Card className="border-0 shadow-md">
        <CardContent className="p-8 text-center">
          <Clock className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-400">No hay actividades registradas</p>
        </CardContent>
      </Card>
    );
  }

  const tipoLabels = {
    diagnostico: 'Diagnóstico',
    reparacion: 'Reparación',
    instalacion: 'Instalación',
    prueba: 'Prueba',
    limpieza: 'Limpieza',
    entrega: 'Entrega',
    otro: 'Otro'
  };

  const estadoConfig = {
    en_progreso: {
      icon: Clock,
      color: 'bg-blue-100 text-blue-700',
      label: 'En Progreso'
    },
    finalizada: {
      icon: CheckCircle,
      color: 'bg-green-100 text-green-700',
      label: 'Finalizada'
    },
    bloqueada: {
      icon: AlertCircle,
      color: 'bg-orange-100 text-orange-700',
      label: 'Bloqueada'
    }
  };

  const resultadoLabels = {
    ok: 'OK',
    reproceso: 'Reproceso',
    incompleto: 'Incompleto'
  };

  const actividadActual = actividades.find(a => a.estado === 'en_progreso') || actividades.find(a => a.estado === 'bloqueada');
  const finalizadas = actividades.filter(a => a.estado === 'finalizada').length;
  const bloqueadas = actividades.filter(a => a.estado === 'bloqueada').length;
  const enProceso = actividades.filter(a => a.estado === 'en_progreso').length;

  return (
    <div className="space-y-4">

      {/* Card 1 — Actividad actual */}
      <Card className="border border-slate-200 shadow-sm">
        <CardHeader className="pb-3 pt-4 px-4 border-b border-slate-100">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-500" />
            Actividad Actual
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {actividadActual ? (
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${estadoConfig[actividadActual.estado]?.color || 'bg-slate-100 text-slate-600'}`}>
                {(() => { const Icon = estadoConfig[actividadActual.estado]?.icon || Clock; return <Icon className="w-5 h-5" />; })()}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {tipoLabels[actividadActual.tipo_actividad] || actividadActual.tipo_actividad}
                </p>
                <Badge className={`${estadoConfig[actividadActual.estado]?.color} border-0 text-xs mt-1`}>
                  {estadoConfig[actividadActual.estado]?.label}
                </Badge>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400 italic">Sin actividad activa en este momento</p>
          )}
        </CardContent>
      </Card>

      {/* Card 2 — Resumen operativo */}
      <Card className="border border-slate-200 shadow-sm">
        <CardHeader className="pb-3 pt-4 px-4 border-b border-slate-100">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-emerald-500" />
            Resumen Operativo
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-4 gap-3 text-center">
            <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
              <p className="text-lg font-bold text-slate-900">{actividades.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">Total</p>
            </div>
            <div className="p-2 bg-green-50 rounded-lg border border-green-100">
              <p className="text-lg font-bold text-green-700">{finalizadas}</p>
              <p className="text-xs text-green-600 mt-0.5">Finalizadas</p>
            </div>
            <div className="p-2 bg-blue-50 rounded-lg border border-blue-100">
              <p className="text-lg font-bold text-blue-700">{enProceso}</p>
              <p className="text-xs text-blue-600 mt-0.5">En Proceso</p>
            </div>
            <div className="p-2 bg-orange-50 rounded-lg border border-orange-100">
              <p className="text-lg font-bold text-orange-700">{bloqueadas}</p>
              <p className="text-xs text-orange-600 mt-0.5">Bloqueadas</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 3 — Historial */}
      <Card className="border border-slate-200 shadow-sm">
        <CardHeader className="pb-3 pt-4 px-4 border-b border-slate-100">
          <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            Historial de Actividades
          </CardTitle>
        </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-slate-100">
          {actividades.map((actividad) => {
            const config = estadoConfig[actividad.estado];
            const Icon = config.icon;

            return (
              <div key={actividad.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center mt-1">
                      <Icon className="w-5 h-5 text-slate-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-slate-900">
                          {tipoLabels[actividad.tipo_actividad] || actividad.tipo_actividad}
                        </h4>
                        <Badge className={`${config.color} border-0`}>
                          {config.label}
                        </Badge>
                      </div>
                      
                      {actividad.subtipo && (
                        <p className="text-sm text-slate-600 mb-2">{actividad.subtipo}</p>
                      )}

                      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                        <span>
                          Inicio: {new Date(actividad.started_at).toLocaleString('es', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        {actividad.duracion_minutos !== null && (
                          <span className="font-semibold text-slate-700">
                            ⏱️ {actividad.duracion_minutos} min
                          </span>
                        )}
                        {actividad.resultado && (
                          <Badge variant="outline" className="text-xs">
                            {resultadoLabels[actividad.resultado] || actividad.resultado}
                          </Badge>
                        )}
                      </div>

                      {actividad.estado === 'bloqueada' && actividad.causa_bloqueo && (
                        <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-800">
                          <strong>Causa:</strong> {actividad.causa_bloqueo}
                        </div>
                      )}

                      {actividad.notas && (
                        <p className="mt-2 text-xs text-slate-600 italic">{actividad.notas}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>

    </div>
  );
}