import React from 'react';
import { Wrench, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '@/utils';

export default function StepFirstRecepcion() {
  const goToRecepcion = () => {
    window.location.href = `${createPageUrl('OrdenesTrabajo')}?activation=first_work_order`;
  };

  const goToMiDia = () => {
    window.location.href = createPageUrl('MiDia');
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-teal-50">
          <Wrench className="h-8 w-8 text-teal-700" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Recibe tu primer equipo</h2>
        <p className="mt-1 text-slate-500">
          Ya tienes todo lo necesario para operar. Recibe el primer equipo de un cliente
          y verás cómo TRP organiza todo el flujo: recepción, diagnóstico, cotización,
          reparación y entrega.
        </p>
      </div>

      <div className="space-y-3">
        {[
          'Registra al cliente y su equipo en un solo formulario',
          'Genera el DMR (documento de recepción) automáticamente',
          'El equipo entra a cola de revisión listo para tu técnico',
        ].map((item, i) => (
          <div key={i} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-teal-700" />
            <p className="text-sm text-slate-700">{item}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <Button onClick={goToRecepcion} size="lg" className="w-full">
          Recibir primer equipo
          <ArrowRight className="h-4 w-4" />
        </Button>
        <Button onClick={goToMiDia} variant="ghost" className="w-full text-slate-500">
          Ir a Mi Día por ahora
        </Button>
      </div>
    </div>
  );
}