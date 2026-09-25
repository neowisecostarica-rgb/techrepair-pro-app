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

import { useI18n } from '@/i18n';
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { listIdentityAccounts } from '@/api/identity';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Loader2, GitCommitHorizontal, Wrench, CreditCard,
  MessageCircle, ChevronDown, AlertCircle, Archive
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
const getOTEventLabels = (t) => ({
  CREATED:                  t('timeline.otCreated','OT Creada'),
  FINALIZADA:               t('timeline.otFinalized','OT Finalizada'),
  ENTREGADA:                t('timeline.equipmentDelivered','Equipo Entregado'),
  CANCELADA:                t('timeline.otCancelled','OT Cancelada'),
  SALE_COMPLETED:           t('timeline.saleCompleted','Venta Completada'),
  TRANSITION_ASIGNADA:      t('timeline.assignedToTech','Asignada a Técnico'),
  TRANSITION_EN_REVISION:   t('timeline.reviewStarted','Revisión Iniciada'),
  TRANSITION_DIAGNOSTICADA: t('timeline.diagnosisCompleted','Diagnóstico Completado'),
  TRANSITION_COTIZADA:      t('timeline.quoteIssued','Cotización Emitida'),
  TRANSITION_APROBADA:      t('timeline.repairApproved','Reparación Aprobada'),
  TRANSITION_EN_REPARACION: t('timeline.repairStarted','Reparación Iniciada'),
  TRANSITION_PRUEBAS:       t('timeline.inQualityTests','En Pruebas de Calidad'),
  TRANSITION_REASIGNADA:    t('timeline.techReassigned','Técnico Reasignado'),
  CUSTODIA_CONTACTO:        t('timeline.custodyContact','Contacto de Custodia Registrado'),
  CUSTODIA_ABANDONO:        t('timeline.abandonDeclared','Abandono Declarado'),
  CUSTODIA_DISPOSICION:     t('timeline.finalDisposition','Disposición Final Realizada'),
});

// ── Actividad tipo labels ─────────────────────────────────────────────────
const getActividadLabels = (t) => ({
  diagnostico: t('timeline.diagnosis','Diagnóstico'),
  reparacion: t('timeline.repair','Reparación'),
  instalacion: t('timeline.installation','Instalación'),
  prueba: t('timeline.test','Prueba'),
  limpieza: t('timeline.cleaning','Limpieza'),
  entrega: t('timeline.delivery','Entrega'),
  otro: t('timeline.activity','Actividad'),
});

// ── Normalizar eventos a formato unificado ────────────────────────────────
const CUSTODIA_TIPOS = new Set(['CUSTODIA_CONTACTO', 'CUSTODIA_ABANDONO', 'CUSTODIA_DISPOSICION']);

function formatearReasignacion(detalle, tecnicos = [], t = (k, f) => f) {
  let data = {};
  try {
    data = typeof detalle === 'string' ? JSON.parse(detalle) : (detalle || {});
  } catch { /* fallback a objeto vacío */ }

  const resolverNombre = (userId) => {
    if (!userId) return null;
    const found = tecnicos.find(t => t.user_id === userId);
    return found ? (found.user_email?.split('@')[0] || found.user_email) : null;
  };

  const nombreAnterior = resolverNombre(data.tecnico_anterior_id);
  const nombreNuevo = resolverNombre(data.tecnico_nuevo_id);
  const ejecutor = data.usuario_ejecutor || null;
  const motivo = data.motivo || null;

  const lineas = [
    nombreAnterior ? `De: ${nombreAnterior}` : (data.tecnico_anterior_id ? `De: técnico anterior` : null),
    nombreNuevo    ? `A: ${nombreNuevo}`      : (data.tecnico_nuevo_id    ? `A: técnico nuevo`     : null),
    ejecutor       ? `Por: ${ejecutor}`       : null,
    motivo         ? `Motivo: ${motivo}`      : null,
  ].filter(Boolean);

  // GAP-004 FIX: Behavioral Contract — fallbacks explícitos para motivo nulo/vacío
  // y detalle malformado. Siempre retorna texto legible.
  if (lineas.length === 0) {
    return t('timeline.reassignNoDetails','Reasignación de técnico sin detalles registrados');
  }
  // Si motivo es nulo, añadir nota explícita solo si hay otros datos disponibles
  if (!motivo && lineas.length > 0) {
    lineas.push('Sin motivo registrado');
  }
  return lineas.join('\n');
}

function normalizarOTEvents(events = [], tecnicos = [], t) {
  const labels = getOTEventLabels(t);
  return events.map(e => {
    const base = {
      id: `ot-${e.id}`,
      categoria: CUSTODIA_TIPOS.has(e.tipo) ? 'custodia'
               : e.tipo === 'SALE_COMPLETED' ? 'comercial'
               : 'estado',
      titulo: labels[e.tipo] || e.tipo,
      timestamp: e.created_at || e.created_date,
    };

    if (e.tipo === 'TRANSITION_REASIGNADA') {
      return { ...base, detalle: formatearReasignacion(e.detalle, tecnicos, t) };
    }

    return {
      ...base,
      detalle: e.tipo === 'SALE_COMPLETED' && e.venta_total
        ? `Total: ₡${Number(e.venta_total).toLocaleString('es-CR')}`
        : (e.detalle || null),
    };
  });
}

function normalizarActividades(actividades = [], t) {
  const labels = getActividadLabels(t);
  return actividades.map(a => ({
    id: `act-${a.id}`,
    categoria: 'actividad',
    titulo: `${labels[a.tipo_actividad] || t('timeline.activity','Actividad')}: ${a.subtipo || ''}`.trim(),
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
  const { t } = useI18n();
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
            {t('timeline.cat_' + item.categoria, catConf.label)}
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
          <div className="text-xs text-slate-500 mt-0.5 leading-relaxed space-y-0.5">
            {item.detalle.split('\n').map((linea, i) => (
              <p key={i}>{linea}</p>
            ))}
          </div>
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
const FILTRO_KEYS = { todos: 'timeline.filterAll', estado: 'timeline.filterStates', actividad: 'timeline.filterTech', comercial: 'timeline.filterCommercial', custodia: 'timeline.filterCustody' };

export default function TimelineViewer({ ordenTrabajoId, organizationId }) {
  const { t } = useI18n();
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

  // ── Técnicos para resolver nombres en reasignaciones ─────────────────
  const { data: tecnicos = [] } = useQuery({
    queryKey: ['timeline-tecnicos', organizationId],
    queryFn: () => listIdentityAccounts(organizationId).then(({ accounts }) =>
      accounts.filter(account => account.role === 'TECHNICIAN')
    ),
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = loadingEvents || loadingActs;

  // ── Construir timeline unificado ──────────────────────────────────────
  const todosLosItems = [
    ...normalizarOTEvents(otEvents, tecnicos, t),
    ...normalizarActividades(actividades, t),
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
        <span className="text-slate-500">{t('sweep.loadingLog','Cargando bitácora...')}</span>
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
            {t(FILTRO_KEYS[f.key] || 'timeline.filter_' + f.key, f.label)}
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
          <p className="text-slate-400 text-sm">{t('timeline.noEventsInCategory','Sin eventos en esta categoría')}</p>
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
                {t('timeline.viewMore','Ver más')} ({itemsFiltrados.length - itemsVisible.length} {t('timeline.remaining','restantes')})
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}