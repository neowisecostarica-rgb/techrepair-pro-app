import React from 'react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import WorkOrderCard from './WorkOrderCard';

const COLUMN_STYLES = {
  PENDIENTE: 'bg-amber-50 border-amber-200',
  EN_PROCESO: 'bg-blue-50 border-blue-200',
  FINALIZADO: 'bg-emerald-50 border-emerald-200',
};

const COLUMN_TITLES = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En Proceso',
  FINALIZADO: 'Finalizado',
};

const COLUMN_COUNT_COLORS = {
  PENDIENTE: 'bg-amber-200 text-amber-800',
  EN_PROCESO: 'bg-blue-200 text-blue-800',
  FINALIZADO: 'bg-emerald-200 text-emerald-800',
};

export default function KanbanColumn({ columnId, workOrders, clientes, equipos, tecnicos = [], onCardClick }) {
  const style = COLUMN_STYLES[columnId] || 'bg-slate-50 border-slate-200';
  const title = COLUMN_TITLES[columnId] || columnId;
  const countColor = COLUMN_COUNT_COLORS[columnId] || 'bg-slate-200 text-slate-700';

  return (
    <div className={`flex-1 min-w-[280px] max-w-sm rounded-2xl border ${style} flex flex-col`}>
      {/* Column Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-inherit">
        <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wide">{title}</h3>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${countColor}`}>
          {workOrders.length}
        </span>
      </div>

      {/* Droppable area */}
      <Droppable droppableId={columnId}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 p-3 space-y-3 min-h-[200px] transition-colors rounded-b-2xl
              ${snapshot.isDraggingOver ? 'bg-white/60' : ''}`}
          >
            {workOrders.map((ot, index) => (
              <Draggable key={ot.id} draggableId={ot.id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className={snapshot.isDragging ? 'rotate-1 shadow-lg ring-2 ring-emerald-400 rounded-xl' : ''}
                  >
                    <WorkOrderCard
                     ot={ot}
                     clientes={clientes}
                     equipos={equipos}
                     tecnicos={tecnicos}
                     onClick={onCardClick}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}

            {workOrders.length === 0 && !snapshot.isDraggingOver && (
              <div className="flex items-center justify-center h-24 text-xs text-slate-400">
                Sin órdenes
              </div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}