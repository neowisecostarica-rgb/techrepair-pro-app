import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function SaludTaller({ metrics }) {
  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="border-b border-slate-100">
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-orange-500" />
          Salud del Taller
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              <div>
                <p className="text-sm font-medium text-slate-900">OTs con Bloqueos</p>
                <p className="text-xs text-slate-500">Requieren atención</p>
              </div>
            </div>
            <Badge className="bg-orange-600 text-white text-lg">
              {metrics.otsConBloqueos}
            </Badge>
          </div>

          <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              <div>
                <p className="text-sm font-medium text-slate-900">OTs Antiguas</p>
                <p className="text-xs text-slate-500">Más de 7 días abiertas</p>
              </div>
            </div>
            <Badge className="bg-yellow-600 text-white text-lg">
              {metrics.otsAntiguas}
            </Badge>
          </div>

          <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
            <div className="flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-red-600" />
              <div>
                <p className="text-sm font-medium text-slate-900">Tasa de Reproceso</p>
                <p className="text-xs text-slate-500">Actividades con reproceso</p>
              </div>
            </div>
            <Badge className="bg-red-600 text-white text-lg">
              {(metrics.reprocesoRate * 100).toFixed(1)}%
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}