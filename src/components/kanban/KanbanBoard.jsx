import React, { useState } from 'react';
import { DragDropContext } from '@hello-pangea/dnd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { WORK_ORDER_STATUSES, KANBAN_COLUMNS } from '@/config/workOrderStatus';
import { transicionarEstadoOT } from '@/components/ot/transicionarEstadoOT';
import { useAuthContext } from '@/components/contexts/AuthContext';
import KanbanColumn from './KanbanColumn';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const BACKEND_URL = 'https://techrepairpro-core-1.onrender.com';

const COLUMN_TO_DEFAULT_STATUS = {
  PENDIENTE: 'EN_COLA_REVISION',
  EN_PROCESO: 'EN_REVISION',
  FINALIZADO: 'FINALIZADA',
};

export default function KanbanBoard({ onCardClick }) {
  const { effectiveOrgId } = useAuthContext();
  const queryClient = useQueryClient();
  const [isTransitioning, setIsTransitioning] = useState(false);

  const { data: ordenes = [], isLoading } = useQuery({
    queryKey: ['ordenes', effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const res = await fetch(`${BACKEND_URL}/v1/work-orders`, {
        headers: { 'Content-Type': 'application/json', 'x-organization-id': effectiveOrgId }
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Error cargando órdenes');
      return resData.data || [];
    },
    enabled: !!effectiveOrgId,
  });

  // Clientes y equipos para enrichment de tarjetas (aún vía base44 — no migrados)
  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes', effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const res = await fetch(`${BACKEND_URL}/v1/clients`, {
        headers: { 'Content-Type': 'application/json', 'x-organization-id': effectiveOrgId }
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Error cargando clientes');
      return resData.data || [];
    },
    enabled: !!effectiveOrgId,
  });

  const { data: equipos = [] } = useQuery({
    queryKey: ['equipos', effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const res = await fetch(`${BACKEND_URL}/v1/equipment`, {
        headers: { 'Content-Type': 'application/json', 'x-organization-id': effectiveOrgId }
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Error cargando equipos');
      return resData.data || [];
    },
    enabled: !!effectiveOrgId,
  });

  // Agrupar OTs por columna según SOT
  const grouped = Object.keys(KANBAN_COLUMNS).reduce((acc, col) => {
    acc[col] = ordenes.filter(ot => WORK_ORDER_STATUSES[ot.estado]?.column === col);
    return acc;
  }, {});

  const onDragEnd = async (result) => {
    const { draggableId, source, destination } = result;

    // Sin destino o misma columna → noop
    if (!destination || source.droppableId === destination.droppableId) return;

    const nuevoEstado = COLUMN_TO_DEFAULT_STATUS[destination.droppableId];
    if (!nuevoEstado) return;

    setIsTransitioning(true);
    try {
      await transicionarEstadoOT(draggableId, nuevoEstado, {
        organizationId: effectiveOrgId,
      });
      // Re-fetch desde backend — no optimistic update
      await queryClient.invalidateQueries({ queryKey: ['ordenes', effectiveOrgId] });
    } catch (error) {
      console.error('Error al transicionar estado OT:', error);
      alert('No se pudo cambiar el estado: ' + error.message);
    } finally {
      setIsTransitioning(false);
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
    <div className="relative">
      {isTransitioning && (
        <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center rounded-xl">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
        </div>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Object.entries(KANBAN_COLUMNS).map(([columnId]) => (
            <KanbanColumn
              key={columnId}
              columnId={columnId}
              workOrders={grouped[columnId] || []}
              clientes={clientes}
              equipos={equipos}
              onCardClick={onCardClick}
            />
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}