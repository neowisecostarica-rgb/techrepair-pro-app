import React from 'react';
import { Laptop, Smartphone, Monitor, Printer, Tablet, HelpCircle } from 'lucide-react';

const TIPO_ICON = {
  laptop:     { icon: Laptop,     bg: 'bg-blue-100 text-blue-600' },
  desktop:    { icon: Monitor,    bg: 'bg-slate-100 text-slate-600' },
  smartphone: { icon: Smartphone, bg: 'bg-emerald-100 text-emerald-600' },
  tablet:     { icon: Tablet,     bg: 'bg-purple-100 text-purple-600' },
  impresora:  { icon: Printer,    bg: 'bg-orange-100 text-orange-600' },
  otro:       { icon: HelpCircle, bg: 'bg-slate-100 text-slate-500' },
};

function EquipoRow({ equipo }) {
  const cfg = TIPO_ICON[equipo.tipo] || TIPO_ICON.otro;
  const Icon = cfg.icon;
  const nombre = [equipo.marca, equipo.modelo].filter(Boolean).join(' ');

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{nombre || '(Sin nombre)'}</p>
        {equipo.serie && (
          <p className="text-xs text-slate-400 mt-0.5">Serie: {equipo.serie}</p>
        )}
      </div>
    </div>
  );
}

export default function EquiposCliente({ equipos = [], isLoading = false }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mt-4">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Equipos del Cliente
      </h3>

      {isLoading && (
        <p className="text-sm text-slate-400 py-2">Cargando equipos...</p>
      )}

      {!isLoading && equipos.length === 0 && (
        <p className="text-sm text-slate-400 py-2">No hay equipos registrados para este cliente.</p>
      )}

      {!isLoading && equipos.length > 0 && (
        <div>
          {equipos.map(eq => <EquipoRow key={eq.id} equipo={eq} />)}
        </div>
      )}
    </div>
  );
}
