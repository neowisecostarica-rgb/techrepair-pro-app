import React from 'react';
import { Badge } from '@/components/ui/badge';
import { WORK_ORDER_STATUSES, STATUS_TO_COLUMN } from '@/config/workOrderStatus';
import { Clock } from 'lucide-react';
import { format, differenceInHours, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';

// Mensaje de acción por columna Kanban
const COLUMN_ACTION = {
  EN_COLA:       'Revisar',
  EN_PROCESO:    'Diagnosticar',
  EN_REPARACION: 'Reparar',
  FINALIZADAS:   'Entregar',
  ENTREGADAS:    'Completado',
  CANCELADAS:    'Cerrado',
};

function tiempoDesdeCreacion(fecha) {
  if (!fecha) return null;
  const now = new Date();
  const desde = new Date(fecha);
  const horas = differenceInHours(now, desde);
  if (horas < 24) return `Hace ${horas}h`;
  const dias = differenceInDays(now, desde);
  return `Hace ${dias}d`;
}

export default function WorkOrderCard({ ot, clientes = [], equipos = [], onClick }) {
  const statusConfig = WORK_ORDER_STATUSES[ot.estado] || { label: ot.estado, color: 'bg-slate-100 text-slate-700' };

  const cliente = clientes?.find(c => c.id === ot.cliente_id);
  const equipo = equipos?.find(e => e.id === ot.equipo_id);

  const clienteName = ot.cliente?.nombre_completo || cliente?.nombre_completo || 'Sin cliente';
  const equipoData = ot.equipo || equipo;
  const equipoInfo = equipoData
    ? [equipoData.tipo, equipoData.marca, equipoData.modelo].filter(Boolean).join(' ')
    : 'Sin equipo';

  const fechaBase = ot.fecha_ingreso || ot.created_date;
  const tiempoTexto = tiempoDesdeCreacion(fechaBase);
  const horasDesdeCreacion = fechaBase ? differenceInHours(new Date(), new Date(fechaBase)) : 0;
  const esVieja = horasDesdeCreacion >= 48;

  const columnaId = STATUS_TO_COLUMN[ot.estado];
  const mensajeAccion = COLUMN_ACTION[columnaId] || null;

  return (
    <div
      onClick={() => onClick?.(ot)}
      className={`bg-white rounded-xl border p-4 shadow-sm cursor-pointer transition-all hover:shadow-md ${
        esVieja ? 'border-red-200' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-mono font-bold text-emerald-600">{ot.codigo_ot || 'OT-LEGACY'}</p>
          {esVieja && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="OT con más de 48h" />}
        </div>
        <Badge className={`${statusConfig.color} border-0 text-xs shrink-0`}>{statusConfig.label}</Badge>
      </div>

      {/* Datos principales */}
      <p className="font-semibold text-slate-900 text-sm mb-1 leading-tight">{clienteName}</p>
      <p className="text-xs text-slate-500 mb-1 line-clamp-2">{ot.motivo_ingreso}</p>
      <p className="text-xs text-slate-400 mb-3">{equipoInfo}</p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <Clock className="w-3 h-3" />
          <span>{tiempoTexto || (fechaBase ? format(new Date(fechaBase), 'dd MMM', { locale: es }) : '—')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {mensajeAccion && (
            <span className="text-xs text-slate-400 font-medium">{mensajeAccion}</span>
          )}
          {ot.prioridad && ot.prioridad !== 'normal' && (
            <Badge className={`border-0 text-xs ${
              ot.prioridad === 'urgente' ? 'bg-red-100 text-red-700' :
              ot.prioridad === 'high'    ? 'bg-orange-100 text-orange-700' :
              'bg-slate-100 text-slate-600'
            }`}>
              {ot.prioridad}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}