import React from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle, Clock, AlertCircle, CreditCard, Wrench, ClipboardList, Package, FlaskConical, Truck } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// ── Timeline definition ────────────────────────────────────────────────────
const TIMELINE_STEPS = [
  {
    id: 'recepcion',
    label: 'Recepción',
    icon: ClipboardList,
    estados: ['EN_COLA_REVISION'],
  },
  {
    id: 'diagnostico',
    label: 'Diagnóstico',
    icon: FlaskConical,
    estados: ['ASIGNADA', 'EN_REVISION', 'DIAGNOSTICADA'],
  },
  {
    id: 'cotizacion',
    label: 'Cotización',
    icon: CreditCard,
    estados: ['COTIZADA', 'APROBADA'],
  },
  {
    id: 'reparacion',
    label: 'Reparación',
    icon: Wrench,
    estados: ['EN_REPARACION'],
  },
  {
    id: 'pruebas',
    label: 'Pruebas',
    icon: Package,
    estados: ['PRUEBAS', 'FINALIZADA'],
  },
  {
    id: 'entrega',
    label: 'Entrega',
    icon: Truck,
    estados: ['ENTREGADA'],
  },
];

// Determine which step index is "current" based on OT estado
function getStepStatus(step, estadoActual) {
  const allEstados = TIMELINE_STEPS.flatMap(s => s.estados);
  const currentIndex = allEstados.indexOf(estadoActual);

  for (const estado of step.estados) {
    const stepIndex = allEstados.indexOf(estado);
    if (stepIndex === currentIndex) return 'current';
    if (stepIndex < currentIndex) return 'done';
  }
  return 'pending';
}

// ── Siguiente acción recomendada ───────────────────────────────────────────
const NEXT_ACTION_MAP = {
  EN_COLA_REVISION: {
    color: 'bg-blue-50 border-blue-200 text-blue-900',
    icon: AlertCircle,
    iconColor: 'text-blue-500',
    title: 'Pendiente de Asignación',
    description: 'Asigna un técnico y cobra el diagnóstico en el POS (concepto: revisión/diagnóstico) para habilitar la revisión técnica.',
  },
  ASIGNADA: {
    color: 'bg-amber-50 border-amber-200 text-amber-900',
    icon: AlertCircle,
    iconColor: 'text-amber-500',
    title: 'Técnico asignado — en espera de revisión',
    description: 'El técnico debe iniciar la revisión desde "Mi Día". Si el pago aún no se ha procesado, el Diagnóstico Técnico estará bloqueado.',
  },
  EN_REVISION: {
    color: 'bg-purple-50 border-purple-200 text-purple-900',
    icon: Clock,
    iconColor: 'text-purple-500',
    title: 'Revisión en Curso',
    description: 'El técnico está realizando la revisión. Puede abrir el Wizard de Diagnóstico Técnico para documentar los hallazgos.',
  },
  DIAGNOSTICADA: {
    color: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    icon: CheckCircle2,
    iconColor: 'text-emerald-500',
    title: 'Diagnóstico Completo',
    description: 'El diagnóstico está listo. El área de ventas debe generar y enviar la cotización al cliente.',
  },
  COTIZADA: {
    color: 'bg-blue-50 border-blue-200 text-blue-900',
    icon: CreditCard,
    iconColor: 'text-blue-500',
    title: 'Esperando Aprobación del Cliente',
    description: 'La cotización fue enviada. En espera de respuesta del cliente para aprobar o rechazar la reparación.',
  },
  APROBADA: {
    color: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    icon: CheckCircle2,
    iconColor: 'text-emerald-500',
    title: 'Reparación Aprobada',
    description: 'El cliente aprobó. Proceder con el cobro en el POS (concepto: reparación) e iniciar la reparación.',
  },
  EN_REPARACION: {
    color: 'bg-purple-50 border-purple-200 text-purple-900',
    icon: Wrench,
    iconColor: 'text-purple-500',
    title: 'Reparación en Progreso',
    description: 'El técnico está ejecutando la reparación. Al terminar, mover la OT a Pruebas.',
  },
  PRUEBAS: {
    color: 'bg-amber-50 border-amber-200 text-amber-900',
    icon: FlaskConical,
    iconColor: 'text-amber-500',
    title: 'En Pruebas de Calidad',
    description: 'La reparación está siendo verificada. Al confirmar el funcionamiento correcto, finalizar la OT.',
  },
  FINALIZADA: {
    color: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    icon: CheckCircle2,
    iconColor: 'text-emerald-500',
    title: 'Reparación Finalizada',
    description: 'La reparación está completa. Notificar al cliente y gestionar la entrega del equipo.',
  },
  ENTREGADA: {
    color: 'bg-slate-50 border-slate-200 text-slate-700',
    icon: CheckCircle2,
    iconColor: 'text-slate-400',
    title: 'OT Completada',
    description: 'El equipo fue entregado al cliente. Esta orden está cerrada.',
  },
  CANCELADA: {
    color: 'bg-red-50 border-red-200 text-red-900',
    icon: AlertCircle,
    iconColor: 'text-red-500',
    title: 'Orden Cancelada',
    description: 'Esta orden fue cancelada y no tiene acciones pendientes.',
  },
};

// ── Indicadores críticos para variant="card" ─────────────────────────────────
const CRITICAL_BADGE = {
  EN_COLA_REVISION: { label: 'Sin asignar',           className: 'bg-blue-100 text-blue-700'    },
  ASIGNADA:         { label: 'En espera de revisión',  className: 'bg-amber-100 text-amber-700'  },
  COTIZADA:         { label: 'Esperando cliente',      className: 'bg-blue-100 text-blue-700'    },
  FINALIZADA:       { label: 'Lista para entrega',     className: 'bg-emerald-100 text-emerald-700' },
  CANCELADA:        { label: 'Cancelada',              className: 'bg-red-100 text-red-700'      },
};

// ── Shared: Timeline visual ───────────────────────────────────────────────────
function OTTimeline({ ot }) {
  return (
    <div className="flex items-center gap-0 w-full">
      {TIMELINE_STEPS.map((step, index) => {
        const status = getStepStatus(step, ot.estado);
        const Icon = step.icon;
        const isLast = index === TIMELINE_STEPS.length - 1;
        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-0.5 min-w-[44px]">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                status === 'done'    ? 'bg-emerald-500 border-emerald-500 text-white'
                : status === 'current' ? 'bg-blue-500 border-blue-500 text-white ring-2 ring-blue-200'
                : 'bg-white border-slate-200 text-slate-300'
              }`}>
                {status === 'done'
                  ? <CheckCircle2 className="w-3 h-3" />
                  : <Icon className="w-3 h-3" />
                }
              </div>
              <span className={`text-[9px] text-center leading-tight ${
                status === 'current' ? 'text-blue-600 font-semibold'
                : status === 'done'  ? 'text-emerald-500'
                : 'text-slate-300'
              }`}>{step.label}</span>
            </div>
            {!isLast && (
              <div className={`flex-1 h-px mb-3.5 ${
                getStepStatus(TIMELINE_STEPS[index + 1], ot.estado) !== 'pending' ||
                getStepStatus(step, ot.estado) === 'done'
                  ? 'bg-emerald-400' : 'bg-slate-200'
              }`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function OTOperationalLayer({ ot, variant = 'default' }) {
  if (!ot) return null;

  // ── variant="card": Vista Ejecutiva ─────────────────────────────────────────
  if (variant === 'card') {
    const criticalBadge = CRITICAL_BADGE[ot.estado];
    const showPagoPendiente = !ot.diagnostico_habilitado &&
      ['EN_COLA_REVISION', 'ASIGNADA'].includes(ot.estado);

    return (
      <div className="space-y-1.5">
        {/* Timeline visual */}
        <div className="rounded-md border border-slate-100 bg-slate-50/60 px-2 py-1.5">
          <OTTimeline ot={ot} />
        </div>

        {/* Indicadores críticos — solo cuando hay algo relevante */}
        {(showPagoPendiente || criticalBadge) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {showPagoPendiente && (
              <Badge className="bg-orange-100 text-orange-700 border-0 text-[10px] px-1.5 py-0">
                ⚠ Pago pendiente
              </Badge>
            )}
            {criticalBadge && !showPagoPendiente && (
              <Badge className={`border-0 text-[10px] px-1.5 py-0 ${criticalBadge.className}`}>
                {criticalBadge.label}
              </Badge>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── variant="default": Panel completo (sin cambios) ──────────────────────────
  const nextAction = NEXT_ACTION_MAP[ot.estado];
  const NextIcon = nextAction?.icon || AlertCircle;

  return (
    <div className="space-y-2.5">

      {/* ── Siguiente Acción — ARRIBA DE TODO (decisión inmediata) ─────────── */}
      {nextAction && (
        <div className={`rounded-lg border px-3 py-2.5 ${nextAction.color}`}>
          <div className="flex items-start gap-2.5">
            <NextIcon className={`w-4 h-4 mt-0.5 shrink-0 ${nextAction.iconColor}`} />
            <div>
              <p className="font-semibold text-sm leading-tight">{nextAction.title}</p>
              <p className="text-xs mt-0.5 opacity-80 leading-relaxed">{nextAction.description}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Timeline compacta (una sola línea) ──────────────────────────────── */}
      <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2">
        <div className="flex items-center gap-0">
          <OTTimeline ot={ot} />
        </div>
      </div>

      {/* ── Estado diagnóstico — fila compacta ──────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-100 bg-slate-50/60">
        {ot.diagnostico_habilitado
          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          : <Circle className="w-3.5 h-3.5 text-slate-300 shrink-0" />
        }
        <span className="text-xs text-slate-600">Revisión:</span>
        <Badge className={`border-0 text-[10px] px-1.5 py-0 ${
          ot.diagnostico_habilitado
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-slate-100 text-slate-500'
        }`}>
          {ot.diagnostico_habilitado ? '✓ Habilitado' : 'Pendiente de pago'}
        </Badge>
        {ot.revision_pagada_at && (
          <span className="text-[10px] text-slate-400 ml-auto">
            {format(new Date(ot.revision_pagada_at), "dd MMM HH:mm", { locale: es })}
          </span>
        )}
      </div>

    </div>
  );
}