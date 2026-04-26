import React, { useState, useMemo } from 'react';
import { DragDropContext } from '@hello-pangea/dnd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { WORK_ORDER_STATUSES, KANBAN_COLUMNS } from '@/config/workOrderStatus';
import { transicionarEstadoOT } from '@/components/ot/transicionarEstadoOT';
import { useAuthContext } from '@/components/contexts/AuthContext';
import KanbanColumn from './KanbanColumn';
import { Loader2, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
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

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [tecnicoFiltro, setTecnicoFiltro] = useState('');

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

  // Técnicos desde base44.entities.UserAccount (no es OrdenTrabajo — permitido)
  const { data: tecnicos = [] } = useQuery({
    queryKey: ['tecnicos', effectiveOrgId],
    queryFn: () => base44.entities.UserAccount.filter({ organization_id: effectiveOrgId, role: 'TECHNICIAN' }),
    enabled: !!effectiveOrgId,
  });

  // Filtrar OTs antes de agrupar
  const ordenesFiltradas = useMemo(() => {
    let resultado = ordenes;

    if (tecnicoFiltro) {
      resultado = resultado.filter(ot => ot.tecnico_asignado_id === tecnicoFiltro);
    }

    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase();
      resultado = resultado.filter(ot => {
        const cliente = clientes.find(c => c.id === ot.cliente_id);
        const equipo = equipos.find(e => e.id === ot.equipo_id);
        return (
          ot.codigo_ot?.toLowerCase().includes(q) ||
          cliente?.nombre_completo?.toLowerCase().includes(q) ||
          equipo?.marca?.toLowerCase().includes(q) ||
          equipo?.modelo?.toLowerCase().includes(q)
        );
      });
    }

    return resultado;
  }, [ordenes, busqueda, tecnicoFiltro, clientes, equipos]);

  // Agrupar OTs filtradas por columna
  const grouped = useMemo(() =>
    Object.keys(KANBAN_COLUMNS).reduce((acc, col) => {
      acc[col] = ordenesFiltradas.filter(ot => WORK_ORDER_STATUSES[ot.estado]?.column === col);
      return acc;
    }, {}),
    [ordenesFiltradas]
  );

  const onDragEnd = async (result) => {
    const { draggableId, source, destination } = result;
    if (!destination || source.droppableId === destination.droppableId) return;

    const nuevoEstado = COLUMN_TO_DEFAULT_STATUS[destination.droppableId];
    if (!nuevoEstado) return;

    setIsTransitioning(true);
    try {
      await transicionarEstadoOT(draggableId, nuevoEstado, { organizationId: effectiveOrgId });
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

      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Búsqueda */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <Input
            placeholder="Buscar por cliente, equipo o código OT..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
          {busqueda && (
            <button onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-3 h-3 text-slate-400 hover:text-slate-600" />
            </button>
          )}
        </div>

        {/* Filtro por técnico */}
        <select
          value={tecnicoFiltro}
          onChange={e => setTecnicoFiltro(e.target.value)}
          className="h-9 text-sm border border-slate-200 rounded-md px-3 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-400"
        >
          <option value="">Todos los técnicos</option>
          {tecnicos.map(t => (
            <option key={t.id} value={t.user_id || t.id}>
              {t.full_name || t.user_email || t.email || t.id}
            </option>
          ))}
        </select>

        {/* Indicador de filtros activos */}
        {(busqueda || tecnicoFiltro) && (
          <button
            onClick={() => { setBusqueda(''); setTecnicoFiltro(''); }}
            className="text-xs text-slate-500 hover:text-red-500 underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Object.entries(KANBAN_COLUMNS).map(([columnId]) => (
            <KanbanColumn
              key={columnId}
              columnId={columnId}
              workOrders={grouped[columnId] || []}
              clientes={clientes}
              equipos={equipos}
              tecnicos={tecnicos}
              onCardClick={onCardClick}
            />
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}