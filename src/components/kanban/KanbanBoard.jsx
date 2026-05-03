import React, { useState, useMemo, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KANBAN_COLUMNS, STATUS_TO_COLUMN } from '@/config/workOrderStatus';
import { transicionarEstadoOT } from '@/components/ot/transicionarEstadoOT';
import { base44 } from '@/api/base44Client';
import WorkOrderCard from './WorkOrderCard';
import { Loader2 } from 'lucide-react';

export default function KanbanBoard({ onCardClick }) {
  const queryClient = useQueryClient();
  const [localOrdenes, setLocalOrdenes] = useState(null); // optimistic state
  const [errorMsg, setErrorMsg] = useState('');

  const { data: fetchedOrdenes = [], isLoading } = useQuery({
    queryKey: ['listWorkOrders'],
    queryFn: async () => {
      const res = await base44.functions.invoke('listWorkOrders', {});
      return res.data?.workOrders || res.data || [];
    },
  });

  // Usar estado local (optimista) si existe, si no el del servidor
  const ordenes = localOrdenes ?? fetchedOrdenes;

  // Sincronizar localOrdenes cuando lleguen datos frescos del servidor
  useEffect(() => {
    setLocalOrdenes(null);
  }, [fetchedOrdenes]);

  // Agrupar por columna según STATUS_TO_COLUMN
  const grouped = useMemo(() => {
    return Object.keys(KANBAN_COLUMNS).reduce((acc, colId) => {
      acc[colId] = ordenes.filter(ot => STATUS_TO_COLUMN[ot.estado] === colId);
      return acc;
    }, {});
  }, [ordenes]);

  const onDragEnd = async (result) => {
    const { draggableId, source, destination } = result;
    if (!destination || source.droppableId === destination.droppableId) return;

    const colDestino = KANBAN_COLUMNS[destination.droppableId];
    if (!colDestino) return;

    const nuevoEstado = colDestino.defaultStatus;
    const otAnterior = ordenes.find(ot => ot.id === draggableId);
    if (!otAnterior) return;

    // Actualización optimista: mover tarjeta localmente
    const nuevasOrdenes = ordenes.map(ot =>
      ot.id === draggableId ? { ...ot, estado: nuevoEstado } : ot
    );
    setLocalOrdenes(nuevasOrdenes);
    setErrorMsg('');

    try {
      await transicionarEstadoOT(draggableId, nuevoEstado);
      // Refrescar datos reales en background
      queryClient.invalidateQueries({ queryKey: ['listWorkOrders'] });
    } catch (error) {
      // Revertir a estado original
      setLocalOrdenes(ordenes.map(ot =>
        ot.id === draggableId ? { ...ot, estado: otAnterior.estado } : ot
      ));
      setErrorMsg('No se pudo cambiar el estado: ' + (error.message || 'Error desconocido'));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div>
      {errorMsg && (
        <div className="mb-3 px-4 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg('')} className="ml-4 text-red-400 hover:text-red-600 font-bold">✕</button>
        </div>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Object.entries(KANBAN_COLUMNS).map(([colId, col]) => {
            const cards = grouped[colId] || [];
            return (
              <div
                key={colId}
                className={`flex-shrink-0 w-64 rounded-xl border ${col.colorClass} flex flex-col`}
              >
                {/* Header columna */}
                <div className="px-4 py-3 border-b border-current/10">
                  <div className="flex items-center justify-between">
                    <span className={`font-semibold text-sm ${col.headerClass}`}>{col.label}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${col.colorClass} ${col.headerClass} border`}>
                      {cards.length}
                    </span>
                  </div>
                </div>

                {/* Drop zone */}
                <Droppable droppableId={colId}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 p-3 space-y-3 min-h-[120px] transition-colors ${snapshot.isDraggingOver ? 'bg-white/60' : ''}`}
                    >
                      {cards.map((ot, index) => (
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
                            >
                              <WorkOrderCard
                                ot={ot}
                                clientes={[]}
                                equipos={[]}
                                onClick={onCardClick}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {cards.length === 0 && !snapshot.isDraggingOver && (
                        <p className="text-center text-xs text-slate-400 pt-4">Sin órdenes</p>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}