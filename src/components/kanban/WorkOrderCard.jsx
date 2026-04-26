import React from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { Badge } from '@/components/ui/badge';
import { WORK_ORDER_STATUSES } from '@/config/workOrderStatus';
import { Clock } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function WorkOrderCard({ ot, index, clientes = [], equipos = [], onClick }) {
  const statusConfig = WORK_ORDER_STATUSES[ot.estado] || { label: ot.estado, color: 'bg-slate-100 text-slate-700' };

  const cliente = clientes.find(c => c.id === ot.cliente_id);
  const equipo = equipos.find(e => e.id === ot.equipo_id);

  const clienteName = cliente?.nombre_completo || 'Cliente sin identificar';
  const equipoInfo = equipo ? `${equipo.marca} ${equipo.modelo || ''}`.trim() : 'Equipo desconocido';
  const fechaIngreso = ot.fecha_ingreso || ot.created_date;

  return (
    <Draggable draggableId={ot.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onClick?.(ot)}
          className={`bg-white rounded-xl border border-slate-200 p-4 shadow-sm cursor-pointer transition-all
            ${snapshot.isDragging ? 'shadow-lg ring-2 ring-emerald-400 rotate-1' : 'hover:shadow-md hover:border-slate-300'}`}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-xs font-mono font-bold text-emerald-600">{ot.codigo_ot || 'OT-LEGACY'}</p>
            <Badge className={`${statusConfig.color} border-0 text-xs shrink-0`}>{statusConfig.label}</Badge>
          </div>

          <p className="font-semibold text-slate-900 text-sm mb-1 leading-tight">{clienteName}</p>
          <p className="text-xs text-slate-500 mb-1 line-clamp-2">{ot.motivo_ingreso}</p>
          <p className="text-xs text-slate-400 mb-3">{equipoInfo}</p>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <Clock className="w-3 h-3" />
              {fechaIngreso ? format(new Date(fechaIngreso), 'dd MMM', { locale: es }) : '—'}
            </div>
            {ot.prioridad && ot.prioridad !== 'normal' && (
              <Badge className={`border-0 text-xs ${
                ot.prioridad === 'urgente' ? 'bg-red-100 text-red-700' :
                ot.prioridad === 'high' ? 'bg-orange-100 text-orange-700' :
                'bg-slate-100 text-slate-600'
              }`}>
                {ot.prioridad}
              </Badge>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}