import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, TrendingUp } from 'lucide-react';

export default function ProductividadAgregada({ metrics }) {
  const tipoLabels = {
    diagnostico: 'Diagnóstico',
    reparacion: 'Reparación',
    instalacion: 'Instalación',
    prueba: 'Prueba',
    limpieza: 'Limpieza',
    entrega: 'Entrega',
    otro: 'Otro'
  };

  const tiposConDatos = Object.entries(metrics.tiempoPromedioPorTipo || {})
    .filter(([_, tiempo]) => tiempo > 0)
    .sort((a, b) => b[1] - a[1]); // Ordenar por tiempo DESC

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="border-b border-slate-100">
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-emerald-500" />
          Productividad Agregada
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {tiposConDatos.slice(0, 6).map(([tipo, tiempo]) => (
              <div key={tipo} className="p-3 bg-slate-50 rounded-lg">
                <p className="text-xs text-slate-500">{tipoLabels[tipo]}</p>
                <p className="text-xl font-bold text-slate-900">
                  {Math.round(tiempo)} <span className="text-sm font-normal">min</span>
                </p>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Tasa de Finalización</p>
                <p className="text-2xl font-bold text-emerald-600">
                  {(metrics.tasaFinalizacion * 100).toFixed(1)}%
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-emerald-500" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}