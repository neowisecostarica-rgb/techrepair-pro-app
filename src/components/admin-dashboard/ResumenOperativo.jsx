import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Briefcase, CheckCircle, Zap } from 'lucide-react';

export default function ResumenOperativo({ metrics }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="border-0 shadow-lg">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">OTs Abiertas</p>
              <p className="text-3xl font-bold text-slate-900">{metrics.otsAbiertas}</p>
            </div>
            <Briefcase className="w-10 h-10 text-blue-500" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">OTs Cerradas</p>
              <p className="text-3xl font-bold text-slate-900">{metrics.otsCerradas}</p>
            </div>
            <CheckCircle className="w-10 h-10 text-emerald-500" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Actividades Totales</p>
              <p className="text-3xl font-bold text-slate-900">{metrics.actividadesTotales}</p>
            </div>
            <Zap className="w-10 h-10 text-orange-500" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}