/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SFHS: CentroMando — FASE 3
 * ═══════════════════════════════════════════════════════════════════════════
 * STATUS: ACTIVE
 * USED_BY: pages/ExpedienteOT
 * DESCRIPTION: Tarjetas operacionales: Próxima Acción (derivada del SOT de
 *   estados), Responsable, Riesgos Operativos y SLA.
 *   La Próxima Acción se deriva del estado → NO de ultima_actividad.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React from 'react';
import { AlertCircle, CheckCircle2, Clock, Wrench, CreditCard, FlaskConical, Package, User, ShieldAlert, Timer } from 'lucide-react';
import { differenceInHours, differenceInDays } from 'date-fns';
import { ESTADO_SOT as ESTADO_SOT_CONFIG } from '@/config/workflowConfig';

// ── Mapa de iconos: resuelve iconName (string) → componente Lucide ─────────
const ICON_MAP = { AlertCircle, CheckCircle2, Clock, Wrench, CreditCard, FlaskConical, Package };

// ── Hidrata config con componente de icono real ───────────────────────────
const ESTADO_SOT = Object.fromEntries(
  Object.entries(ESTADO_SOT_CONFIG).map(([estado, cfg]) => [
    estado,
    { ...cfg, icon: ICON_MAP[cfg.iconName] || AlertCircle },
  ])
);

// ── Evaluación de riesgos operativos ──────────────────────────────────────
function evaluarRiesgos(ot) {
  const riesgos = [];
  const ahora = new Date();
  const fechaIngreso = new Date(ot.fecha_ingreso || ot.created_date);
  const diasEnTaller = differenceInDays(ahora, fechaIngreso);

  if (diasEnTaller > 7) {
    riesgos.push({ nivel: 'alto', texto: `${diasEnTaller} días en taller sin cierre` });
  } else if (diasEnTaller > 3) {
    riesgos.push({ nivel: 'medio', texto: `${diasEnTaller} días en taller` });
  }

  if (ot.estado_atencion === 'PAUSADO') {
    riesgos.push({ nivel: 'medio', texto: `Atención pausada: ${(ot.motivo_pausa || '').replace(/_/g, ' ')}` });
  }

  if (ot.estado === 'COTIZADA' && ot.fecha_diagnostico) {
    const horasEsperando = differenceInHours(ahora, new Date(ot.fecha_diagnostico));
    if (horasEsperando > 48) {
      riesgos.push({ nivel: 'alto', texto: `Cliente sin respuesta hace ${Math.floor(horasEsperando / 24)}d` });
    }
  }

  if (['EN_COLA_REVISION', 'ASIGNADA'].includes(ot.estado) && !ot.diagnostico_habilitado) {
    riesgos.push({ nivel: 'info', texto: 'Diagnóstico pendiente de pago' });
  }

  return riesgos;
}

// ── SLA: tiempo restante vs fecha prometida ───────────────────────────────
function calcularSLA(ot) {
  if (!ot.fecha_entrega_estimada) return null;
  const ahora = new Date();
  const prometida = new Date(ot.fecha_entrega_estimada);
  const horasRestantes = differenceInHours(prometida, ahora);

  if (horasRestantes < 0) return { estado: 'vencido', texto: `Vencido hace ${Math.abs(horasRestantes)}h`, color: 'text-red-600', bg: 'bg-red-50 border-red-200' };
  if (horasRestantes <= 24) return { estado: 'critico', texto: `${horasRestantes}h restantes`, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' };
  const dias = Math.floor(horasRestantes / 24);
  return { estado: 'ok', texto: `${dias}d restantes`, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' };
}

// ── Micro-tarjeta ─────────────────────────────────────────────────────────
function MiniCard({ icon: Icon, label, children, className = '' }) {
  return (
    <div className={`rounded-lg border p-3 flex-1 min-w-[140px] ${className}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="w-3.5 h-3.5 opacity-60" />
        <span className="text-[10px] uppercase tracking-wide font-semibold opacity-60">{label}</span>
      </div>
      {children}
    </div>
  );
}

export default function CentroMando({ ot }) {
  if (!ot) return null;

  const sot = ESTADO_SOT[ot.estado] || ESTADO_SOT.EN_COLA_REVISION;
  const SotIcon = sot.icon;
  const riesgos = evaluarRiesgos(ot);
  const sla = calcularSLA(ot);
  const nivelRiesgoMax = riesgos.find(r => r.nivel === 'alto') ? 'alto'
                       : riesgos.find(r => r.nivel === 'medio') ? 'medio'
                       : riesgos.length > 0 ? 'info' : null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

      {/* ── Próxima Acción (del SOT) ─────────────────────────────────────── */}
      <MiniCard icon={SotIcon} label="Próxima Acción" className={`col-span-1 sm:col-span-2 ${sot.color} ${sot.labelColor}`}>
        <p className="text-sm font-semibold leading-snug">{sot.accion}</p>
      </MiniCard>

      {/* ── Responsable ──────────────────────────────────────────────────── */}
      <MiniCard icon={User} label="Responsable" className={`${sot.color} ${sot.labelColor}`}>
        <p className="text-sm font-semibold">{sot.responsable}</p>
      </MiniCard>

      {/* ── Riesgos Operativos ────────────────────────────────────────────── */}
      <MiniCard
        icon={ShieldAlert}
        label="Riesgos"
        className={
          nivelRiesgoMax === 'alto'  ? 'bg-red-50 border-red-200 text-red-900'   :
          nivelRiesgoMax === 'medio' ? 'bg-amber-50 border-amber-200 text-amber-900' :
          'bg-slate-50 border-slate-200 text-slate-700'
        }
      >
        {riesgos.length === 0 ? (
          <p className="text-xs text-slate-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Sin riesgos detectados
          </p>
        ) : (
          <ul className="space-y-0.5">
            {riesgos.map((r, i) => (
              <li key={i} className="text-xs leading-snug flex items-start gap-1">
                <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                  r.nivel === 'alto' ? 'bg-red-500' : r.nivel === 'medio' ? 'bg-amber-500' : 'bg-blue-400'
                }`} />
                {r.texto}
              </li>
            ))}
          </ul>
        )}
      </MiniCard>

      {/* ── SLA ───────────────────────────────────────────────────────────── */}
      <MiniCard icon={Timer} label="SLA" className={sla ? `${sla.bg} ${sla.color}` : 'bg-slate-50 border-slate-200 text-slate-500'}>
        {sla ? (
          <p className={`text-sm font-bold ${sla.color}`}>{sla.texto}</p>
        ) : (
          <p className="text-xs text-slate-400">Sin fecha prometida</p>
        )}
      </MiniCard>

    </div>
  );
}