import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, Clock, AlertCircle, RefreshCw } from 'lucide-react';

export default function TecnicoCard({ tecnico }) {
  const tipoLabels = {
    diagnostico: 'Diagnóstico',
    reparacion: 'Reparación',
    instalacion: 'Instalación'
  };

  // Mostrar solo top 3 tipos con más actividad
  const tiposTop = Object.entries(tecnico.tiempoPromedioPorTipo || {})
    .filter(([_, tiempo]) => tiempo > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const causasTop = Object.entries(tecnico.bloqueosPorCausa || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <Card className="border-0 shadow-md hover:shadow-lg transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-xl flex items-center justify-center">
            <User className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-slate-900">{tecnico.tecnico_email}</h3>
            <Badge variant="outline" className="mt-1">
              {tecnico.actividadesCount} actividades
            </Badge>
          </div>
        </div>

        <div className="space-y-3">
          {/* Tiempos promedio */}
          {tiposTop.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Tiempos Promedio
              </p>
              <div className="space-y-1">
                {tiposTop.map(([tipo, tiempo]) => (
                  <div key={tipo} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{tipoLabels[tipo] || tipo}</span>
                    <span className="font-medium text-slate-900">{Math.round(tiempo)} min</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reprocesos */}
          <div className="flex items-center justify-between p-2 bg-red-50 rounded">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-red-600" />
              <span className="text-sm text-slate-700">Reprocesos</span>
            </div>
            <span className="text-sm font-bold text-red-600">
              {(tecnico.reprocesoRate * 100).toFixed(1)}%
            </span>
          </div>

          {/* Bloqueos */}
          <div className="flex items-center justify-between p-2 bg-orange-50 rounded">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-orange-600" />
              <span className="text-sm text-slate-700">Bloqueos</span>
            </div>
            <span className="text-sm font-bold text-orange-600">
              {(tecnico.bloqueosRate * 100).toFixed(1)}%
            </span>
          </div>

          {/* Causas de bloqueo */}
          {causasTop.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-500 mb-1">Causas principales:</p>
              {causasTop.map(([causa, count]) => (
                <div key={causa} className="text-xs text-slate-600 flex items-center justify-between">
                  <span>• {causa}</span>
                  <span className="font-medium">({count})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}