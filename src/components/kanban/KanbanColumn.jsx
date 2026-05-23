import React from 'react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import WorkOrderCard from './WorkOrderCard';

// KanbanColumn — Micro Bloque 3.1 — Única fuente oficial: KANBAN_COLUMNS (workOrderStatus.js)
// Recibe `column` completo desde KANBAN_COLUMNS: { id, label, colorClass, headerClass, ... }
// NO contiene configs hardcodeadas de columnas.

export default function KanbanColumn({ column, workOrders, clientes = [], equipos = [], tecnicos = [], onCardClick }) {
  return (
    <div className={`flex-1 min-w-[280px] max-w-sm rounded-2xl border ${column.colorClass} flex flex-col`}>
      {/* Column Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-current/10">
        <h3 className={`font-bold text-sm uppercase tracking-wide ${column.headerClass}`}>{column.label}</h3>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${column.colorClass} ${column.headerClass}`}>
          {workOrders.length}
        </span>
      </div>

      {/* Droppable area */}
      <Droppable droppableId={column.id}>
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
                    style={{
                      ...provided.draggableProps.style,
                      opacity: snapshot.isDragging ? 0.85 : 1,
                    }}
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