import React from 'react';
import { Button } from '@/components/ui/button';
import { Phone, Mail, MessageCircle, Pencil, Building2, User, CreditCard, Calendar, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const ESTADOS_OT_ACTIVA = [
  'EN_COLA_REVISION', 'ASIGNADA', 'EN_REVISION', 'DIAGNOSTICADA',
  'COTIZADA', 'APROBADA', 'EN_REPARACION', 'PRUEBAS',
];

/** Mapeo de estado OT → etiqueta + color del badge operativo */
const BADGE_ESTADO = {
  EN_REVISION:      { label: 'En Revisión',       cls: 'bg-yellow-100 text-yellow-700 border-yellow-200',  dot: 'bg-yellow-500' },
  DIAGNOSTICADA:    { label: 'Diagnóstico listo',  cls: 'bg-purple-100 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
  COTIZADA:         { label: 'Pendiente Cliente',  cls: 'bg-amber-100  text-amber-700  border-amber-200',  dot: 'bg-amber-500 animate-pulse' },
  APROBADA:         { label: 'Aprobada',           cls: 'bg-blue-100   text-blue-700   border-blue-200',   dot: 'bg-blue-500' },
  EN_REPARACION:    { label: 'En Reparación',      cls: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500 animate-pulse' },
  PRUEBAS:          { label: 'En Pruebas',         cls: 'bg-indigo-100 text-indigo-700 border-indigo-200', dot: 'bg-indigo-500' },
  EN_COLA_REVISION: { label: 'En Cola',            cls: 'bg-slate-100  text-slate-600  border-slate-200',  dot: 'bg-slate-400' },
  ASIGNADA:         { label: 'Asignada',           cls: 'bg-teal-100   text-teal-700   border-teal-200',   dot: 'bg-teal-500' },
};

function BadgeEstadoOT({ otActiva }) {
  if (!otActiva) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200">
        <span className="w-2 h-2 rounded-full bg-slate-400" />
        Sin pendientes
      </span>
    );
  }
  const cfg = BADGE_ESTADO[otActiva.estado] || BADGE_ESTADO['ASIGNADA'];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.cls}`}>
      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function BadgeTipo({ tipo }) {
  const map = {
    empresa:    { label: 'Empresa',    icon: Building2, cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    individual: { label: 'Individual', icon: User,      cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  };
  const cfg = map[tipo] || map['individual'];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.cls}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

export default function ClientePerfilHeader({ cliente, ordenes = [], onEditarCliente }) {
  // OT activa más reciente (orden por fecha_ingreso desc)
  const otActiva = ordenes
    .filter(o => ESTADOS_OT_ACTIVA.includes(o.estado))
    .sort((a, b) => new Date(b.fecha_ingreso || b.created_date) - new Date(a.fecha_ingreso || a.created_date))[0] || null;

  const iniciales = (cliente.nombre_completo || 'C')
    .split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();

  const fechaAlta = cliente.created_date
    ? format(new Date(cliente.created_date), "d MMM yyyy", { locale: es })
    : null;

  const telLimpio = cliente.telefono?.replace(/\D/g, '') || '';

  return (
    <div className="bg-gradient-to-br from-slate-50 to-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-5">

        {/* Avatar */}
        <div className="flex-shrink-0 self-start">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-2xl flex items-center justify-center text-white font-bold text-2xl sm:text-3xl shadow-md select-none">
            {iniciales}
          </div>
        </div>

        {/* Info principal */}
        <div className="flex-1 min-w-0">
          {/* Nombre + badges */}
          <div className="flex flex-wrap items-start gap-2 mb-2">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight">
              {cliente.nombre_completo}
            </h2>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <BadgeEstadoOT otActiva={otActiva} />
              <BadgeTipo tipo={cliente.tipo_cliente} />
            </div>
          </div>

          {/* OT activa — código de referencia rápida */}
          {otActiva && (
            <p className="text-xs text-slate-400 mb-2 font-mono">
              OT ref: {otActiva.codigo_ot}
            </p>
          )}

          {/* Datos de contacto */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-slate-600 mt-2">
            {cliente.telefono && (
              <div className="flex items-center gap-2 truncate">
                <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="truncate">{cliente.telefono}</span>
              </div>
            )}
            {cliente.email && (
              <div className="flex items-center gap-2 truncate">
                <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="truncate">{cliente.email}</span>
              </div>
            )}
            {cliente.identificacion && (
              <div className="flex items-center gap-2 truncate">
                <CreditCard className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="truncate">{cliente.identificacion}</span>
              </div>
            )}
            {fechaAlta && (
              <div className="flex items-center gap-2 text-slate-400">
                <Calendar className="w-4 h-4 flex-shrink-0" />
                <span>Cliente desde {fechaAlta}</span>
              </div>
            )}
          </div>
        </div>

        {/* Acciones rápidas */}
        <div className="flex flex-row sm:flex-col gap-2 sm:flex-shrink-0 w-full sm:w-auto mt-1 sm:mt-0">
          {cliente.telefono && (
            <a href={`https://wa.me/${telLimpio}`} target="_blank" rel="noopener noreferrer" className="flex-1 sm:flex-none">
              <Button variant="outline" size="sm" className="w-full gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-400">
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp</span>
              </Button>
            </a>
          )}
          {cliente.telefono && (
            <a href={`tel:${telLimpio}`} className="flex-1 sm:flex-none">
              <Button variant="outline" size="sm" className="w-full gap-2 border-blue-300 text-blue-700 hover:bg-blue-50 hover:border-blue-400">
                <Phone className="w-4 h-4" />
                <span>Llamar</span>
              </Button>
            </a>
          )}
          {otActiva && (
            <a href={`/Operacion?ot=${otActiva.id}`} className="flex-1 sm:flex-none">
              <Button variant="outline" size="sm" className="w-full gap-2 border-orange-300 text-orange-700 hover:bg-orange-50 hover:border-orange-400">
                <ExternalLink className="w-4 h-4" />
                <span>Ver OT</span>
              </Button>
            </a>
          )}
          <Button
            variant="outline" size="sm"
            onClick={onEditarCliente}
            className="flex-1 sm:flex-none w-full gap-2 border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            <Pencil className="w-4 h-4" />
            <span>Editar</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
