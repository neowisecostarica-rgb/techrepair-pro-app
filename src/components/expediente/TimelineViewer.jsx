/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SFHS: TimelineViewer — FASE 4
 * ═══════════════════════════════════════════════════════════════════════════
 * STATUS: ACTIVE
 * USED_BY: pages/ExpedienteOT
 * DESCRIPTION: Timeline consolidado de OTEvent + ActividadTecnica +
 *   Ventas. Categorías explícitas con etiquetas de texto (no solo colores).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Loader2, GitCommitHorizontal, Wrench, CreditCard,
  MessageCircle, ChevronDown, ChevronUp, AlertCircle, Archive
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// ── Configuración de categorías (label explícito obligatorio) ──────────────
const CATEGORIA_CONFIG = {
  estado: {
    label: 'Estado',
    icon: GitCommitHorizontal,
    badgeClass: 'bg-blue-100 text-blue-700',
    dotClass: 'bg-blue-500',
    lineClass: 'border-blue-200',
  },
  actividad: {
    label: 'Actividad Técnica',
    icon: Wrench,
    badgeClass: 'bg-purple-100 text-purple-700',
    dotClass: 'bg-purple-500',
    lineClass: 'border-purple-200',
  },
  comercial: {
    label: 'Comercial',
    icon: CreditCard,
    badgeClass: 'bg-emerald-100 text-emerald-700',
    dotClass: 'bg-emerald-500',
    lineClass: 'border-emerald-200',
  },
  comunicacion: {
    label: 'Comunicación',
    icon: MessageCircle,
    badgeClass: 'bg-amber-100 text-amber-700',
    dotClass: 'bg-amber-500',
    lineClass: 'border-amber-200',
  },
  custodia: {
    label: 'Custodia',
    icon: Archive,
    badgeClass: 'bg-orange-100 text-orange-700',
    dotClass: 'bg-orange-500',
    lineClass: 'border-orange-200',
  },
};

// ── Labels de OTEvent ─────────────────────────────────────────────────────
const OT_EVENT_LABELS = {
  CREATED:                  'OT Creada',
  FINALIZADA:               'OT Finalizada',
  ENTREGADA:                'Equipo Entregado',
  CANCELADA:                'OT Cancelada',
  SALE_COMPLETED:           'Venta Completada',
  TRANSITION_ASIGNADA:      'Asignada a Técnico',
  TRANSITION_EN_REVISION:   'Revisión Iniciada',
  TRANSITION_DIAGNOSTICADA: 'Diagnóstico Completado',
  TRANSITION_COTIZADA:      'Cotización Emitida',
  TRANSITION_APROBADA:      'Reparación Aprobada',
  TRANSITION_EN_REPARACION: 'Reparación Iniciada',
  TRANSITION_PRUEBAS:       'En Pruebas de Calidad',
  // ── Custodia (P1-A.3-I2) ──────────────────────────────────────────────
  TRANSITION_REASIGNADA:    'Técnico Reasignado',
  // ── Custodia (P1-A.3-I2) ──────────────────────────────────────────────
  CUSTODIA_CONTACTO:        'Contacto de Custodia Registrado',
  CUSTODIA_ABANDONO:        'Abandono Declarado',
  CUSTODIA_DISPOSICION:     'Disposición Final Realizada',
};

// ── Actividad tipo labels ─────────────────────────────────────────────────
const ACTIVIDAD_LABELS = {
  diagnostico: 'Diagnóstico',
  reparacion: 'Reparación',
  instalacion: 'Instalación',
  prueba: 'Prueba',
  limpieza: 'Limpieza',
  entrega: 'Entrega',
  otro: 'Actividad',
};

// ── Normalizar eventos a formato unificado ────────────────────────────────
const CUSTODIA_TIPOS = new Set(['CUSTODIA_CONTACTO', 'CUSTODIA_ABANDONO', 'CUSTODIA_DISPOSICION']);

function normalizarOTEvents(events = []) {
  return events.map(e => ({
    id: `ot-${e.id}`,
    categoria: CUSTODIA_TIPOS.has(e.tipo) ? 'custodia'
             : e.tipo === 'SALE_COMPLETED' ? 'comercial'
             : 'estado',
    titulo: OT_EVENT_LABELS[e.tipo] || e.tipo,
    detalle: e.tipo === 'SALE_COMPLETED' && e.venta_total
      ? `Total: ₡${Number(e.venta_total).toLocaleString('es-CR')}`
      : (e.detalle || null),
    timestamp: e.created_at || e.created_date,
  }));
}

function normalizarActividades(actividades = []) {
  return actividades.map(a => ({
    id: `act-${a.id}`,
    categoria: 'actividad',
    titulo: `${ACTIVIDAD_LABELS[a.tipo_actividad] || 'Actividad'}: ${a.subtipo || ''}`.trim(),
    detalle: [
      a.estado === 'finalizada' && a.duracion_minutos ? `${a.duracion_minutos} min` : null,
      a.estado === 'bloqueada' ? `Bloqueada: ${a.causa_bloqueo || ''}` : null,
      a.notas || null,
    ].filter(Boolean).join(' · ') || null,
    badge: a.estado === 'finalizada' ? 'OK' : a.estado === 'bloqueada' ? 'Bloqueada' : 'En progreso',
    badgeClass: a.estado === 'finalizada' ? 'bg-green-100 text-green-700'
              : a.estado === 'bloqueada'   ? 'bg-orange-100 text-orange-700'
              : 'bg-blue-100 text-blue-700',
    timestamp: a.started_at,
  }));
}

// ── Item de timeline ───────────────────────────────────────────────────────
function TimelineItem({ item, isLast }) {
  const catConf = CATEGORIA_CONFIG[item.categoria] || CATEGORIA_CONFIG.estado;
  const Icon = catConf.icon;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex gap-3">
      {/* Línea vertical + dot */}
      <div className="flex flex-col items-center">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${catConf.dotClass}`}>
          <Icon className="w-3.5 h-3.5 text-white" />
        </div>
        {!isLast && <div className="w-px flex-1 bg-slate-200 mt-1" />}
      </div>

      {/* Contenido */}
      <div className={`pb-4 flex-1 min-w-0 ${isLast ? '' : ''}`}>
        <div className="flex flex-wrap items-center gap-2 mb-0.5">
          {/* Etiqueta de categoría — visible siempre, no solo color */}
          <Badge className={`${catConf.badgeClass} border-0 text-[10px] px-1.5 py-0`}>
            {catConf.label}
          </Badge>
          {item.badge && (
            <Badge className={`${item.badgeClass} border-0 text-[10px] px-1.5 py-0`}>
              {item.badge}
            </Badge>
          )}
          <span className="text-[10px] text-slate-400 ml-auto shrink-0">
            {item.timestamp
              ? format(new Date(item.timestamp), "dd MMM · HH:mm", { locale: es })
              : '—'
            }
          </span>
        </div>

        <p className="text-sm font-semibold text-slate-800 leading-snug">{item.titulo}</p>

        {item.detalle && (
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.detalle}</p>
        )}
      </div>
    </div>
  );
}

// ── Filtro de categorías ──────────────────────────────────────────────────
const FILTROS = [
  { key: 'todos', label: 'Todos' },
  { key: 'estado', label: 'Estados' },
  { key: 'actividad', label: 'Técnico' },
  { key: 'comercial', label: 'Comercial' },
  { key: 'custodia', label: 'Custodia' },
];

export default function TimelineViewer({ ordenTrabajoId, organizationId }) {
  const [filtroActivo, setFiltroActivo] = useState('todos');
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);

  const { data: otEvents = [], isLoading: loadingEvents } = useQuery({
    queryKey: ['timeline-events', ordenTrabajoId],
    queryFn: () => base44.entities.OTEvent.filter({ orden_trabajo_id: ordenTrabajoId }),
    enabled: !!ordenTrabajoId,
    staleTime: 30 * 1000,
  });

  const { data: actividades = [], isLoading: loadingActs } = useQuery({
    queryKey: ['timeline-actividades', ordenTrabajoId],
    queryFn: () => base44.entities.ActividadTecnica.filter({
      orden_trabajo_id: ordenTrabajoId,
      soft_deleted: false,
    }),
    enabled: !!ordenTrabajoId,
    staleTime: 30 * 1000,
  });

  const isLoading = loadingEvents || loadingActs;

  // ── Construir timeline unificado ──────────────────────────────────────
  const todosLosItems = [
    ...normalizarOTEvents(otEvents),
    ...normalizarActividades(actividades),
  ].sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta; // más reciente primero
  });

  const itemsFiltrados = filtroActivo === 'todos'
    ? todosLosItems
    : todosLosItems.filter(i => i.categoria === filtroActivo);

  const itemsVisible = itemsFiltrados.slice(0, page * PAGE_SIZE);
  const hayMas = itemsFiltrados.length > itemsVisible.length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-500 mr-3" />
        <span className="text-slate-500">Cargando bitácora...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Filtros de categoría ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {FILTROS.map(f => (
          <button
            key={f.key}
            onClick={() => { setFiltroActivo(f.key); setPage(1); }}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all border ${
              filtroActivo === f.key
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="text-xs text-slate-400 self-center ml-auto">
          {itemsFiltrados.length} evento{itemsFiltrados.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Timeline ────────────────────────────────────────────────────── */}
      {itemsVisible.length === 0 ? (
        <div className="py-12 text-center">
          <AlertCircle className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Sin eventos en esta categoría</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 p-4">
          {itemsVisible.map((item, idx) => (
            <TimelineItem
              key={item.id}
              item={item}
              isLast={idx === itemsVisible.length - 1}
            />
          ))}

          {hayMas && (
            <div className="pt-2 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage(p => p + 1)}
                className="text-slate-500"
              >
                <ChevronDown className="w-4 h-4 mr-1" />
                Ver más ({itemsFiltrados.length - itemsVisible.length} restantes)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}