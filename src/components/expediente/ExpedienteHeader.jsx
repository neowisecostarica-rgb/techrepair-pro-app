/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SFHS: ExpedienteHeader — FASE 2
 * ═══════════════════════════════════════════════════════════════════════════
 * STATUS: ACTIVE
 * USED_BY: pages/ExpedienteOT
 * DESCRIPTION: Header ejecutivo sticky del expediente OT. Solo lectura.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Clock, User, Wrench, Phone, CheckCircle2, Circle, AlertTriangle } from 'lucide-react';
import { WORK_ORDER_STATUSES } from '@/config/workOrderStatus';

const PRIORIDAD_CONFIG = {
  urgente: { label: 'Urgente', color: 'bg-red-100 text-red-700' },
  high:    { label: 'Alta',    color: 'bg-orange-100 text-orange-700' },
  normal:  { label: 'Normal',  color: 'bg-slate-100 text-slate-600' },
  low:     { label: 'Baja',    color: 'bg-slate-100 text-slate-400' },
};

// ── Indicador de estado (diagnóstico / cotización / venta) ─────────────────
function IndicadorEstado({ label, activo, activoLabel, pendienteLabel }) {
  return (
    <div className="flex flex-col items-center gap-1 px-3 py-2 bg-white/60 rounded-lg border border-white/80 min-w-[90px]">
      <span className="text-[10px] text-slate-500 uppercase tracking-wide font-medium">{label}</span>
      {activo ? (
        <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="w-3 h-3" />
          {activoLabel}
        </span>
      ) : (
        <span className="flex items-center gap-1 text-xs text-amber-600">
          <Circle className="w-3 h-3" />
          {pendienteLabel}
        </span>
      )}
    </div>
  );
}

export default function ExpedienteHeader({ ot, cliente, equipo, tecnico, revisionPagada, cotizacionAprobada, ventaPagada }) {
  if (!ot) return null;

  const estadoConf = WORK_ORDER_STATUSES[ot.estado] || { label: ot.estado, color: 'bg-slate-100 text-slate-700' };
  const prioConf   = PRIORIDAD_CONFIG[ot.prioridad] || PRIORIDAD_CONFIG.normal;
  const diasTaller = differenceInDays(new Date(), new Date(ot.fecha_ingreso || ot.created_date));
  const tecnicoLabel = tecnico?.user_email?.split('@')[0] || 'Sin asignar';
  const equipoLabel  = equipo ? `${equipo.marca || ''} ${equipo.modelo || ''}`.trim() || equipo.tipo : '—';

  const isPausado   = ot.estado_atencion === 'PAUSADO';
  const isEsperando = ot.estado_atencion === 'ESPERANDO';

  return (
    <div className="sticky top-0 z-30 bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl p-4 shadow-xl text-white">
      
      {/* Alerta de atención pausada */}
      {(isPausado || isEsperando) && (
        <div className={`mb-3 flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${
          isPausado ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
        }`}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {isPausado
            ? `⏸ Pausado: ${(ot.motivo_pausa || '').replace(/_/g, ' ')}`
            : '⌛ Esperando respuesta externa'
          }
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center gap-4">

        {/* ── Bloque izquierdo: ID + estado ─────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center font-bold text-sm shrink-0">
            OT
          </div>
          <div className="min-w-0">
            <p className="text-lg font-mono font-bold text-emerald-400 leading-none">{ot.codigo_ot}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <Badge className={`${estadoConf.color} border-0 text-xs`}>{estadoConf.label}</Badge>
              <Badge className={`${prioConf.color} border-0 text-xs`}>{prioConf.label}</Badge>
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {diasTaller}d en taller
              </span>
            </div>
          </div>
        </div>

        {/* ── Bloque central: cliente + equipo ──────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-4 flex-1">
          <div className="flex items-start gap-2">
            <User className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Cliente</p>
              <p className="text-sm font-semibold text-white leading-tight">{cliente?.nombre_completo || '—'}</p>
              {cliente?.telefono && (
                <a href={`tel:${cliente.telefono}`} className="text-xs text-emerald-400 flex items-center gap-1 hover:text-emerald-300 mt-0.5">
                  <Phone className="w-3 h-3" />{cliente.telefono}
                </a>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Wrench className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Equipo</p>
              <p className="text-sm font-semibold text-white leading-tight">{equipoLabel}</p>
              {ot.serie_ingreso && (
                <p className="text-xs text-slate-400 font-mono mt-0.5">{ot.serie_ingreso}</p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2">
            <User className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Técnico</p>
              <p className="text-sm font-semibold text-white leading-tight">{tecnicoLabel}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {format(new Date(ot.fecha_ingreso || ot.created_date), "dd MMM yyyy", { locale: es })}
              </p>
            </div>
          </div>
        </div>

        {/* ── Bloque derecho: indicadores de estado comercial ───────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          <IndicadorEstado
            label="Diagnóstico"
            activo={revisionPagada}
            activoLabel="Pagado"
            pendienteLabel="Pendiente"
          />
          <IndicadorEstado
            label="Cotización"
            activo={cotizacionAprobada}
            activoLabel="Aprobada"
            pendienteLabel="Pendiente"
          />
          <IndicadorEstado
            label="Venta"
            activo={ventaPagada}
            activoLabel="Pagada"
            pendienteLabel="Pendiente"
          />
        </div>

      </div>
    </div>
  );
}