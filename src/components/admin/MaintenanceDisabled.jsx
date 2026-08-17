import React from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function MaintenanceDisabled({ title }) {
  return (
    <div className="min-h-screen bg-slate-50 p-6 flex items-center justify-center">
      <Card className="max-w-xl border-amber-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          <p>Esta herramienta de mantenimiento está deshabilitada en el cliente de producción.</p>
          <p className="flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 mt-0.5 text-emerald-600" />
            Las operaciones de identidad, tenant, seed y borrado sólo pueden ejecutarse mediante un flujo backend autorizado y auditable.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
