import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, UserCheck } from 'lucide-react';

export default function EquipoStatus({ metrics }) {
  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="border-b border-slate-100">
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-500" />
          Estado del Equipo
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-lg">
            <div className="flex items-center gap-3">
              <UserCheck className="w-8 h-8 text-emerald-600" />
              <div>
                <p className="text-sm font-medium text-slate-900">Técnicos Activos</p>
                <p className="text-xs text-slate-500">Con actividades en el periodo</p>
              </div>
            </div>
            <p className="text-4xl font-bold text-emerald-600">{metrics.tecnicosActivos}</p>
          </div>

          {metrics.tecnicosIdle !== null && (
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-slate-900">Técnicos Sin Actividad</p>
                <p className="text-xs text-slate-500">En el periodo seleccionado</p>
              </div>
              <p className="text-2xl font-bold text-slate-600">{metrics.tecnicosIdle}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}