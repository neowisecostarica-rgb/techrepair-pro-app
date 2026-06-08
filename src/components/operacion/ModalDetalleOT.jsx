import React, { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Calendar, Wrench, Phone, ChevronDown, ChevronUp, User, PackageOpen, ClipboardList, CheckCircle2, Clock } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { WORK_ORDER_STATUSES } from '@/config/workOrderStatus';

// ── Bloque colapsable liviano ──────────────────────────────────────────────────
function Bloque({ label, accent, icon: Icon, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left ${accent} hover:brightness-95 transition`}
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[11px] font-semibold uppercase tracking-wide flex-1">{label}</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 opacity-50" /> : <ChevronDown className="w-3.5 h-3.5 opacity-50" />}
      </button>
      {open && <div className="px-3 py-2.5 bg-white">{children}</div>}
    </div>
  );
}

// ── Fila de dato compacta ─────────────────────────────────────────────────────
function Dato({ label, children }) {
  return (
    <div className="flex items-baseline gap-1.5 py-0.5">
      <span className="text-[10px] text-slate-400 w-24 shrink-0">{label}</span>
      <span className="text-xs text-slate-800 font-medium">{children}</span>
    </div>
  );
}

export default function ModalDetalleOT({ ot, cliente, tecnico, onClose }) {
  if (!ot) return null;

  const config  = WORK_ORDER_STATUSES[ot.estado] || { color: 'bg-slate-100 text-slate-700', label: ot.estado };
  const diasTaller = ot.fecha_ingreso
    ? differenceInDays(new Date(), new Date(ot.fecha_ingreso))
    : differenceInDays(new Date(), new Date(ot.created_date));

  const PRIORIDAD_COLOR = { urgente: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700' };
  const prioBadge = PRIORIDAD_COLOR[ot.prioridad];

  return (
    <Dialog open={!!ot} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto p-0 gap-0">

        {/* ══ STICKY HEADER — Bloque 0: Identificación rápida ══════════════════ */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-mono font-bold text-emerald-600">{ot.codigo_ot}</span>
              <Badge className={`${config.color} border-0 text-xs`}>{config.label}</Badge>
              {prioBadge && (
                <Badge className={`${prioBadge} border-0 text-xs`}>{ot.prioridad}</Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 shrink-0">
              <Clock className="w-3 h-3" />
              <span>{diasTaller}d en taller</span>
            </div>
          </div>

          {/* Bloqueo visible si existe */}
          {ot.estado_atencion === 'PAUSADO' && ot.motivo_pausa && (
            <div className="mt-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-center gap-1">
              <span>⏸ Pausado:</span>
              <span className="font-medium capitalize">{ot.motivo_pausa.replace('_', ' ')}</span>
            </div>
          )}
          {ot.estado_atencion === 'ESPERANDO' && (
            <div className="mt-1.5 text-[10px] text-sky-700 bg-sky-50 border border-sky-200 rounded px-2 py-1">
              ⌛ Esperando respuesta externa
            </div>
          )}
        </div>

        <div className="p-3 space-y-2">

          {/* ══ BLOQUE 1: Resumen Ejecutivo ══════════════════════════════════════ */}
          <Bloque label="Resumen Ejecutivo" accent="bg-slate-50 text-slate-600" icon={CheckCircle2} defaultOpen={true}>
            <Dato label="Técnico">{tecnico ? tecnico.user_email?.split('@')[0] : <span className="text-slate-300 italic">Sin asignar</span>}</Dato>
            <Dato label="Ingresó">{format(new Date(ot.fecha_ingreso || ot.created_date), "dd MMM yyyy", { locale: es })}</Dato>
            {ot.fecha_entrega_estimada && (
              <Dato label="Prometida">{format(new Date(ot.fecha_entrega_estimada), "dd MMM yyyy", { locale: es })}</Dato>
            )}
            <Dato label="Diagnóstico">
              {ot.diagnostico_habilitado
                ? <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Habilitado</span>
                : <span className="text-slate-400">Pendiente de pago</span>
              }
            </Dato>
            {ot.cliente_aprobado !== undefined && ot.cliente_aprobado !== null && (
              <Dato label="Aprobación cliente">
                {ot.cliente_aprobado
                  ? <span className="text-emerald-600">✅ Aprobado</span>
                  : <span className="text-red-500">❌ Rechazado</span>
                }
              </Dato>
            )}
          </Bloque>

          {/* ══ BLOQUE 2: Cliente y Equipo ═══════════════════════════════════════ */}
          {cliente && (
            <Bloque label="Cliente y Equipo" accent="bg-emerald-50 text-emerald-700" icon={User} defaultOpen={true}>
              <Dato label="Cliente">{cliente.nombre_completo}</Dato>
              {cliente.telefono && (
                <Dato label="Teléfono">
                  <a href={`tel:${cliente.telefono}`} className="flex items-center gap-1 text-emerald-600 hover:underline">
                    <Phone className="w-3 h-3" />{cliente.telefono}
                  </a>
                </Dato>
              )}
              {ot.serie_ingreso && <Dato label="Serie / IMEI"><span className="font-mono">{ot.serie_ingreso}</span></Dato>}
              {ot.contrasena_ingreso && <Dato label="PIN">{ot.contrasena_ingreso}</Dato>}
              {ot.estado_fisico_ingreso && <Dato label="Estado físico"><span className="capitalize">{ot.estado_fisico_ingreso}</span></Dato>}
              {ot.tipo_ingreso && <Dato label="Ingreso"><span className="capitalize">{ot.tipo_ingreso}</span></Dato>}
            </Bloque>
          )}

          {/* ══ BLOQUE 3: Diagnóstico ════════════════════════════════════════════ */}
          {(ot.motivo_ingreso || ot.diagnostico_resumido || ot.observaciones_ingreso) && (
            <Bloque label="Diagnóstico" accent="bg-blue-50 text-blue-700" icon={ClipboardList} defaultOpen={true}>
              {ot.motivo_ingreso && <Dato label="Motivo">{ot.motivo_ingreso}</Dato>}
              {ot.diagnostico_resumido && (
                <div className="mt-1.5 text-xs text-slate-700 bg-emerald-50 border border-emerald-100 rounded px-2.5 py-2 leading-relaxed">
                  {ot.diagnostico_resumido}
                </div>
              )}
              {ot.observaciones_ingreso && (
                <div className="mt-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded px-2.5 py-2 leading-relaxed">
                  {ot.observaciones_ingreso}
                </div>
              )}
            </Bloque>
          )}

          {/* ══ BLOQUE 4: Recepción / Accesorios (colapsado por defecto) ════════ */}
          {ot.accesorios_ingreso && (
            <Bloque label="Accesorios Entregados" accent="bg-purple-50 text-purple-700" icon={PackageOpen} defaultOpen={false}>
              <p className="text-xs text-slate-700 leading-relaxed">{ot.accesorios_ingreso}</p>
            </Bloque>
          )}

          {/* ══ BLOQUE 5: Bitácora de fechas ════════════════════════════════════ */}
          <Bloque label="Bitácora" accent="bg-slate-50 text-slate-500" icon={Calendar} defaultOpen={false}>
            <Dato label="Creada">{format(new Date(ot.created_date), "dd MMM yyyy HH:mm", { locale: es })}</Dato>
            {ot.fecha_revision_inicio && (
              <Dato label="Revisión iniciada">{format(new Date(ot.fecha_revision_inicio), "dd MMM yyyy HH:mm", { locale: es })}</Dato>
            )}
            {ot.fecha_diagnostico && (
              <Dato label="Diagnóstico">{format(new Date(ot.fecha_diagnostico), "dd MMM yyyy HH:mm", { locale: es })}</Dato>
            )}
            {ot.cliente_aprobado_at && (
              <Dato label="Aprobó cliente">{format(new Date(ot.cliente_aprobado_at), "dd MMM yyyy HH:mm", { locale: es })}</Dato>
            )}
            {ot.revision_pagada_at && (
              <Dato label="Revisión pagada">{format(new Date(ot.revision_pagada_at), "dd MMM yyyy HH:mm", { locale: es })}</Dato>
            )}
            <Dato label="Última actividad">{format(new Date(ot.updated_date), "dd MMM yyyy HH:mm", { locale: es })}</Dato>
          </Bloque>

        </div>
      </DialogContent>
    </Dialog>
  );
}