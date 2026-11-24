import React from 'react';
import { Wrench, ArrowRight, CheckCircle2, Instagram } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createPageUrl } from '@/utils';
import { safeInstagramProfile } from './onboardingProgress';

export default function StepFirstRecepcion({ onFinish }) {
  const instagramUrl = safeInstagramProfile(import.meta.env.VITE_TRP_INSTAGRAM_URL);
  const goToRecepcion = () => {
    onFinish?.();
    window.location.href = `${createPageUrl('OrdenesTrabajo')}?activation=first_work_order`;
  };

  const goToMiDia = () => {
    onFinish?.();
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

      {instagramUrl && (
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="font-medium text-slate-900">Más que un software. Una comunidad.</p>
          <p className="text-sm text-slate-600 mt-1">Consejos, herramientas y novedades para técnicos.</p>
          <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-teal-700">
            <Instagram className="h-4 w-4" /> Síguenos en Instagram
          </a>
          <p className="mt-2 text-xs text-slate-500">Opcional. No condiciona el acceso a TRP.</p>
        </div>
      )}
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