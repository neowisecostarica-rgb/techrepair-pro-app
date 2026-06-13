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
import { AlertCircle, CheckCircle2, Clock, Wrench, CreditCard, FlaskConical, Package, Truck, User, ShieldAlert, Timer } from 'lucide-react';
import { differenceInHours, differenceInDays, parseISO } from 'date-fns';

// ── SOT Operativo: Estado → Próxima Acción → Responsable ──────────────────
// La única fuente de verdad para derivar qué hacer y quién lo hace
const ESTADO_SOT = {
  EN_COLA_REVISION: {
    accion: 'Asignar técnico y cobrar diagnóstico en POS',
    responsable: 'SALES / BRANCH_ADMIN',
    icon: AlertCircle,
    color: 'bg-blue-50 border-blue-200',
    iconColor: 'text-blue-500',
    labelColor: 'text-blue-900',
  },
  ASIGNADA: {
    accion: 'Técnico debe iniciar revisión desde Mi Día',
    responsable: 'TECHNICIAN',
    icon: Clock,
    color: 'bg-amber-50 border-amber-200',
    iconColor: 'text-amber-500',
    labelColor: 'text-amber-900',
  },
  EN_REVISION: {
    accion: 'Completar diagnóstico técnico detallado',
    responsable: 'TECHNICIAN',
    icon: FlaskConical,
    color: 'bg-purple-50 border-purple-200',
    iconColor: 'text-purple-500',
    labelColor: 'text-purple-900',
  },
  DIAGNOSTICADA: {
    accion: 'Generar y enviar cotización al cliente',
    responsable: 'SALES / BRANCH_ADMIN',
    icon: CreditCard,
    color: 'bg-yellow-50 border-yellow-200',
    iconColor: 'text-yellow-600',
    labelColor: 'text-yellow-900',
  },
  COTIZADA: {
    accion: 'Esperar aprobación / rechazo del cliente',
    responsable: 'SALES (seguimiento)',
    icon: Clock,
    color: 'bg-orange-50 border-orange-200',
    iconColor: 'text-orange-500',
    labelColor: 'text-orange-900',
  },
  APROBADA: {
    accion: 'Cobrar reparación en POS e iniciar trabajo',
    responsable: 'SALES → TECHNICIAN',
    icon: Wrench,
    color: 'bg-teal-50 border-teal-200',
    iconColor: 'text-teal-500',
    labelColor: 'text-teal-900',
  },
  EN_REPARACION: {
    accion: 'Ejecutar reparación y mover a Pruebas al terminar',
    responsable: 'TECHNICIAN',
    icon: Wrench,
    color: 'bg-indigo-50 border-indigo-200',
    iconColor: 'text-indigo-500',
    labelColor: 'text-indigo-900',
  },
  PRUEBAS: {
    accion: 'Verificar funcionamiento y finalizar OT',
    responsable: 'TECHNICIAN',
    icon: Package,
    color: 'bg-cyan-50 border-cyan-200',
    iconColor: 'text-cyan-500',
    labelColor: 'text-cyan-900',
  },
  FINALIZADA: {
    accion: 'Notificar cliente y gestionar entrega',
    responsable: 'SALES / BRANCH_ADMIN',
    icon: CheckCircle2,
    color: 'bg-emerald-50 border-emerald-200',
    iconColor: 'text-emerald-500',
    labelColor: 'text-emerald-900',
  },
  ENTREGADA: {
    accion: 'OT completada — sin acciones pendientes',
    responsable: '—',
    icon: CheckCircle2,
    color: 'bg-slate-50 border-slate-200',
    iconColor: 'text-slate-400',
    labelColor: 'text-slate-600',
  },
  CANCELADA: {
    accion: 'OT cancelada — sin acciones pendientes',
    responsable: '—',
    icon: AlertCircle,
    color: 'bg-red-50 border-red-200',
    iconColor: 'text-red-400',
    labelColor: 'text-red-900',
  },
};

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