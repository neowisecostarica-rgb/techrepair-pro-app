import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, Mail, MessageCircle, Pencil, Building2, User, CreditCard, Calendar } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Header Customer 360 del perfil de cliente.
 * Reutiliza únicamente datos de OrdenTrabajo y Cliente ya existentes.
 * No crea entidades ni funciones backend nuevas.
 */

const ESTADOS_OT_ACTIVA = [
  'EN_COLA_REVISION',
  'ASIGNADA',
  'EN_REVISION',
  'DIAGNOSTICADA',
  'COTIZADA',
  'APROBADA',
  'EN_REPARACION',
  'PRUEBAS',
];

/** Badge de actividad del cliente basado en OTs reales */
function BadgeActividad({ otActiva, tieneOTs }) {
  if (otActiva) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200">
        <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
        OT Activa
      </span>
    );
  }
  if (tieneOTs) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        Cliente Activo
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200">
      <span className="w-2 h-2 rounded-full bg-slate-400" />
      Sin actividad reciente
    </span>
  );
}

/** Badge de tipo de cliente */
function BadgeTipo({ tipo }) {
  const map = {
    empresa: { label: 'Empresa', icon: Building2, cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    individual: { label: 'Individual', icon: User, cls: 'bg-slate-100 text-slate-600 border-slate-200' },
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

export default function ClientePerfilHeader({ cliente, onEditarCliente }) {
  const { data: ordenes = [] } = useQuery({
    queryKey: ['ots-cliente-header', cliente.id],
    queryFn: () =>
      base44.entities.OrdenTrabajo.filter({ cliente_id: cliente.id }),
    enabled: !!cliente.id,
    staleTime: 60_000,
  });

  const otActiva = ordenes.some((o) => ESTADOS_OT_ACTIVA.includes(o.estado));
  const tieneOTs = ordenes.length > 0;

  const iniciales = (cliente.nombre_completo || 'C')
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  const fechaAlta = cliente.created_date
    ? format(new Date(cliente.created_date), "d MMM yyyy", { locale: es })
    : null;

  const telLimpio = cliente.telefono?.replace(/\D/g, '') || '';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
      {/* Layout: flex columna en móvil, fila en sm+ */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-5">

        {/* ── Avatar ── */}
        <div className="flex-shrink-0 self-start">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-2xl flex items-center justify-center text-white font-bold text-2xl sm:text-3xl shadow-md select-none">
            {iniciales}
          </div>
        </div>

        {/* ── Info principal ── */}
        <div className="flex-1 min-w-0">
          {/* Nombre + badges */}
          <div className="flex flex-wrap items-start gap-2 mb-2">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight truncate max-w-xs sm:max-w-none">
              {cliente.nombre_completo}
            </h2>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <BadgeActividad otActiva={otActiva} tieneOTs={tieneOTs} />
              <BadgeTipo tipo={cliente.tipo_cliente} />
            </div>
          </div>

          {/* Datos de contacto — grid de 2 cols en tablet+ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-slate-600 mt-3">
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

        {/* ── Acciones rápidas ──
             En móvil: fila completa al pie; en sm+: columna alineada a la derecha */}
        <div className="flex flex-row sm:flex-col gap-2 sm:gap-2 sm:flex-shrink-0 w-full sm:w-auto mt-2 sm:mt-0">
          {cliente.telefono && (
            <a
              href={`https://wa.me/${telLimpio}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-none"
            >
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-400"
              >
                <MessageCircle className="w-4 h-4" />
                <span className="sm:inline">WhatsApp</span>
              </Button>
            </a>
          )}
          {cliente.telefono && (
            <a href={`tel:${telLimpio}`} className="flex-1 sm:flex-none">
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 border-blue-300 text-blue-700 hover:bg-blue-50 hover:border-blue-400"
              >
                <Phone className="w-4 h-4" />
                <span className="sm:inline">Llamar</span>
              </Button>
            </a>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onEditarCliente}
            className="flex-1 sm:flex-none w-full gap-2 border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            <Pencil className="w-4 h-4" />
            <span className="sm:inline">Editar</span>
          </Button>
        </div>
      </div>
    </div>
  );
}