import React from 'react';
import { CheckCircle2, Building2, Package, Users, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function StepWelcome({ organizationName, onContinue }) {
  const autoConfigured = [
    { icon: Building2, label: 'Sucursal Principal', detail: 'Lista para recibir equipos' },
    { icon: Package, label: '5 categorías de inventario', detail: 'Servicios, Repuestos, Equipos, Accesorios, Reciclaje' },
    { icon: Users, label: 'Tu cuenta de administrador', detail: 'Acceso completo a todas las funciones' },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-teal-50">
          <CheckCircle2 className="h-8 w-8 text-teal-700" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">¡Tu espacio TRP está listo!</h2>
        <p className="mt-1 text-slate-500">
          Configuramos lo esencial para que operes desde ya. Revisa lo que quedó listo:
        </p>
      </div>

      <div className="space-y-3">
        {autoConfigured.map((item) => (
          <div key={item.label} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <item.icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-teal-700" />
            <div>
              <p className="font-semibold text-slate-900">{item.label}</p>
              <p className="text-sm text-slate-500">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-teal-50 border border-teal-200 p-4">
        <p className="text-sm text-teal-900">
          <strong>Lo que sigue:</strong> opcionalmente configura los datos de tu negocio, invita a tu equipo
          y recibe tu primer equipo. Puedes saltar cualquier paso y configurarlo después.
        </p>
      </div>

      <Button onClick={onContinue} className="w-full" size="lg">
        Continuar
      </Button>
    </div>
  );
}