import React from 'react';
import { Badge } from '@/components/ui/badge';
import { WORK_ORDER_STATUSES } from '@/config/workOrderStatus';
import { Clock, User, Wrench } from 'lucide-react';
import { differenceInHours, differenceInDays } from 'date-fns';

// ── Antigüedad ────────────────────────────────────────────────────────────────
function tiempoDesde(fecha) {
  if (!fecha) return null;
  const horas = differenceInHours(new Date(), new Date(fecha));
  if (horas < 24) return `${horas}h`;
  return `${differenceInDays(new Date(), new Date(fecha))}d`;
}

// ── Estado atención ───────────────────────────────────────────────────────────
const ATENCION_CONFIG = {
  ACTIVO:    { dot: 'bg-emerald-400',  label: 'Activo',    muted: false },
  PAUSADO:   { dot: 'bg-amber-400',    label: 'Pausado',   muted: true  },
  ESPERANDO: { dot: 'bg-sky-400',      label: 'Esperando', muted: true  },
};

// ── Motivo pausa corto ────────────────────────────────────────────────────────
const MOTIVO_CORTO = {
  esperando_repuesto: 'Repuesto',
  esperando_cliente:  'Cliente',
  interrupcion:       'Interrupción',
  otro:               'Otro',
};

// ── Prioridad ─────────────────────────────────────────────────────────────────
const PRIORIDAD_CONFIG = {
  urgente: { className: 'bg-red-100 text-red-700',    label: '🔴 Urgente' },
  high:    { className: 'bg-orange-100 text-orange-700', label: '🟠 Alta' },
  low:     { className: 'bg-slate-100 text-slate-500',   label: 'Baja'    },
};

export default function WorkOrderCard({ ot, tecnicos = [], onClick }) {
  const statusConfig = WORK_ORDER_STATUSES[ot.estado] || { label: ot.estado, color: 'bg-slate-100 text-slate-700' };

  // ── Técnico ────────────────────────────────────────────────────────────────
  const tecnico = tecnicos.find(t => t.user_id === ot.tecnico_asignado_id);
  const tecnicoNombre = tecnico
    ? (tecnico.user_email?.split('@')[0] || tecnico.user_email)
    : null;

  // ── Cliente / Equipo (llegan embebidos desde listWorkOrders) ───────────────
  const clienteName = ot.cliente?.nombre_completo || 'Sin cliente';
  const equipoData  = ot.equipo;
  const equipoInfo  = equipoData
    ? [equipoData.tipo, equipoData.marca, equipoData.modelo].filter(Boolean).join(' ')
    : null;

  // ── Antigüedad ─────────────────────────────────────────────────────────────
  const fechaBase      = ot.fecha_ingreso || ot.created_date;
  const tiempoTexto    = tiempoDesde(fechaBase);
  const horasAntiguedad = fechaBase ? differenceInHours(new Date(), new Date(fechaBase)) : 0;
  const esVieja        = horasAntiguedad >= 48;

  // ── Estado atención ────────────────────────────────────────────────────────
  const atencionKey    = ot.estado_atencion; // 'ACTIVO' | 'PAUSADO' | 'ESPERANDO' | null
  const atencionCfg    = ATENCION_CONFIG[atencionKey] || null;
  const estaBloqueada  = atencionKey === 'PAUSADO' || atencionKey === 'ESPERANDO';

  // ── Prioridad ──────────────────────────────────────────────────────────────
  const prioridadCfg   = PRIORIDAD_CONFIG[ot.prioridad] || null;

  // ── Estilos condicionales ──────────────────────────────────────────────────
  // Bloqueada → opacity suave + borde izquierdo ámbar/azul
  // Vieja (sin bloqueo) → borde rojo
  // Normal → borde slate
  const cardBorder = estaBloqueada
    ? atencionKey === 'PAUSADO'
      ? 'border-l-4 border-l-amber-400 border-slate-200'
      : 'border-l-4 border-l-sky-400 border-slate-200'
    : esVieja
      ? 'border border-red-200'
      : 'border border-slate-200 hover:border-slate-300';

  return (
    <div
      onClick={() => onClick?.(ot)}
      className={`bg-white rounded-xl ${cardBorder} p-3 shadow-sm cursor-pointer transition-all hover:shadow-md
        ${estaBloqueada ? 'opacity-75' : ''}`}
    >
      {/* ── Row 1: Código + Badge estado ───────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-mono font-bold text-emerald-600 truncate">{ot.codigo_ot || 'OT-LEGACY'}</span>
          {esVieja && !estaBloqueada && (
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" title="+48h sin actividad" />
          )}
        </div>
        <Badge className={`${statusConfig.color} border-0 text-xs shrink-0`}>{statusConfig.label}</Badge>
      </div>

      {/* ── Row 2: Cliente ─────────────────────────────────────────────────── */}
      <p className="font-semibold text-slate-900 text-sm mb-0.5 leading-tight truncate">{clienteName}</p>

      {/* ── Row 3: Motivo ──────────────────────────────────────────────────── */}
      {ot.motivo_ingreso && (
        <p className="text-xs text-slate-500 mb-1 line-clamp-1">{ot.motivo_ingreso}</p>
      )}

      {/* ── Row 4: Equipo ──────────────────────────────────────────────────── */}
      {equipoInfo && (
        <div className="flex items-center gap-1 text-xs text-slate-400 mb-2">
          <Wrench className="w-3 h-3 shrink-0" />
          <span className="truncate">{equipoInfo}</span>
        </div>
      )}

      {/* ── Divider ────────────────────────────────────────────────────────── */}
      <div className="border-t border-slate-100 my-2" />

      {/* ── Row 5: Footer — técnico + estado atención + antigüedad ─────────── */}
      <div className="flex items-center justify-between gap-1">

        {/* Técnico */}
        <div className="flex items-center gap-1 text-xs text-slate-500 min-w-0">
          <User className="w-3 h-3 shrink-0 text-slate-400" />
          {tecnicoNombre
            ? <span className="truncate font-medium">{tecnicoNombre}</span>
            : <span className="italic text-slate-300">Sin asignar</span>
          }
        </div>

        {/* Estado atención + antigüedad */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Estado atención */}
          {atencionCfg && (
            <div className="flex items-center gap-1" title={`Estado: ${atencionCfg.label}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${atencionCfg.dot} shrink-0`} />
              <span className="text-xs text-slate-400">{atencionCfg.label}</span>
            </div>
          )}

          {/* Antigüedad */}
          {tiempoTexto && (
            <div className="flex items-center gap-0.5 text-xs text-slate-400">
              <Clock className="w-3 h-3" />
              <span>{tiempoTexto}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 6: Motivo pausa + Prioridad (solo si aplican) ──────────────── */}
      {(estaBloqueada && ot.motivo_pausa) || prioridadCfg ? (
        <div className="flex items-center justify-between gap-2 mt-1.5">
          {estaBloqueada && ot.motivo_pausa ? (
            <span className="text-xs text-slate-400 italic">
              {atencionKey === 'PAUSADO' ? '⏸' : '⌛'} {MOTIVO_CORTO[ot.motivo_pausa] || ot.motivo_pausa}
            </span>
          ) : <span />}

          {prioridadCfg && (
            <Badge className={`${prioridadCfg.className} border-0 text-xs`}>{prioridadCfg.label}</Badge>
          )}
        </div>
      ) : null}
    </div>
  );
}