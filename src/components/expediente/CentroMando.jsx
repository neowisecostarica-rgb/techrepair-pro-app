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

import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Wrench, CreditCard, FlaskConical, Package, User, ShieldAlert, Timer, Play, Loader2, Lock, Send, FileText, Archive } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { differenceInHours, differenceInDays } from 'date-fns';
import { ESTADO_SOT as ESTADO_SOT_CONFIG } from '@/config/workflowConfig';
import { MOTIVOS_BLOQUEO } from '@/config/motivosBloqueo';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { useAuthContext } from '@/components/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { calcularCustodia, CUSTODIA_CONFIG } from '@/lib/custodiaEngine';

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

// ── Config visual estado documental ──────────────────────────────────────
const DOC_ESTADO_CONFIG = {
  NO_EXISTE: { label: 'Sin documento',     color: 'bg-slate-50 border-slate-200 text-slate-500',   icon: FileText  },
  BORRADOR:  { label: 'Borrador',          color: 'bg-blue-50 border-blue-200 text-blue-700',      icon: FileText  },
  EMITIDO:   { label: 'Emitido',           color: 'bg-amber-50 border-amber-200 text-amber-700',   icon: FileText  },
  ENVIADO:   { label: 'Enviado al cliente',color: 'bg-purple-50 border-purple-200 text-purple-700',icon: Send      },
  ANULADO:   { label: 'Anulado',           color: 'bg-red-50 border-red-200 text-red-600',         icon: FileText  },
};

const CANAL_LABEL = { WHATSAPP: 'WhatsApp', EMAIL: 'Correo', MANUAL: 'Manual' };

export default function CentroMando({ ot, effectiveRole }) {
  const [iniciando, setIniciando] = useState(false);
  const [errorInicio, setErrorInicio] = useState(null);
  const [bloqueoPendiente, setBloqueoPendiente] = useState(null);
  const { user } = useAuthContext();
  const queryClient = useQueryClient();

  // ── Diagnóstico Documental (para separar estado documental del comercial) ─
  const { data: diagList = [] } = useQuery({
    queryKey: ['panel-diag-tecnico', ot?.id],
    queryFn: () => base44.entities.DiagnosticoTecnico.filter({ orden_trabajo_id: ot.id, bloqueado: false }),
    enabled: !!ot?.id,
    staleTime: 30_000,
  });
  const diagId = diagList[0]?.id || null;

  const { data: docList = [] } = useQuery({
    queryKey: ['panel-diag-doc', ot?.id],
    queryFn: () => base44.entities.DiagnosticoDocumento.filter({ diagnostico_id: diagId }),
    enabled: !!diagId,
    staleTime: 30_000,
  });
  const docActivo = docList.find(d => d.estado !== 'ANULADO') || null;
  const docEstado = docActivo?.estado || (diagList[0] ? 'BORRADOR' : 'NO_EXISTE');
  const docCfg = DOC_ESTADO_CONFIG[docEstado] || DOC_ESTADO_CONFIG.NO_EXISTE;

  if (!ot) return null;

  const clienteAprobado = Boolean(ot?.cliente_aprobado);

  const sot = ESTADO_SOT[ot.estado] || ESTADO_SOT.EN_COLA_REVISION;
  const SotIcon = sot.icon;
  const riesgos = evaluarRiesgos(ot);
  const sla = calcularSLA(ot);
  const nivelRiesgoMax = riesgos.find(r => r.nivel === 'alto') ? 'alto'
                       : riesgos.find(r => r.nivel === 'medio') ? 'medio'
                       : riesgos.length > 0 ? 'info' : null;



  // ── Bloqueo operativo de diagnóstico ─────────────────────────────────────
  const diagnosticoBloqueado = !ot.diagnostico_habilitado
    && ['EN_COLA_REVISION', 'ASIGNADA', 'EN_REVISION'].includes(ot.estado);
  const motivoBloqueo = ot.motivo_bloqueo_diagnostico
    ? (MOTIVOS_BLOQUEO[ot.motivo_bloqueo_diagnostico] || MOTIVOS_BLOQUEO.OTRO)
    : MOTIVOS_BLOQUEO.PENDIENTE_PAGO;

  // ── Acción "Iniciar Revisión" — solo ASIGNADA + roles técnicos + habilitado ─
  // ORG_ADMIN y BRANCH_ADMIN pueden iniciar revisión aunque no sean el técnico asignado (superconjunto operativo)
  const esAdminOSupervisor = ['ORG_ADMIN', 'BRANCH_ADMIN', 'SUPER_ADMIN'].includes(effectiveRole);
  const esTecnicoAsignado  = effectiveRole === 'TECHNICIAN' && ot.tecnico_asignado_id === user?.id;
  const puedeIniciarRevision = ot.estado === 'ASIGNADA'
    && (esAdminOSupervisor || esTecnicoAsignado);

  const handleIniciarRevision = async () => {
    setIniciando(true);
    setErrorInicio(null);
    setBloqueoPendiente(null);
    try {
      const tecnicoIdParaActividad = esAdminOSupervisor
        ? (ot.tecnico_asignado_id || user.id)
        : user.id;

      const response = await base44.functions.invoke('initTechnicalActivity', {
        orden_trabajo_id: ot.id,
        tecnico_id: tecnicoIdParaActividad,
        tipo_actividad: 'diagnostico',
        subtipo: 'Inicio de revisión técnica',
      });

      if (!response?.data?.success) {
        const codigo = response?.data?.codigo;
        const errorMsg = response?.data?.error || 'Error al iniciar la revisión';

        if (codigo === 'DIAGNOSTICO_NO_HABILITADO') {
          setBloqueoPendiente({
            descripcion: response?.data?.descripcion_bloqueo || errorMsg,
            motivo: response?.data?.motivo_bloqueo || 'PENDIENTE_PAGO',
          });
        } else {
          setErrorInicio(errorMsg);
        }
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['expediente-ot', ot.id] });
      queryClient.invalidateQueries({ queryKey: ['actividades_tecnicas'] });
      queryClient.invalidateQueries({ queryKey: ['panel-diag-tecnico', ot.id] });
    } catch (err) {
      setErrorInicio(err.message || 'Error al iniciar revisión');
    } finally {
      setIniciando(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* ── Panel de Bloqueo Operativo (diagnóstico no habilitado) ──────────── */}
      {diagnosticoBloqueado && (
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <Lock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">
              Bloqueo Operativo: {motivoBloqueo.label}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">{motivoBloqueo.descripcion}</p>
            <p className="text-xs text-amber-600 mt-1 font-medium">
              Acción requerida ({motivoBloqueo.rol_responsable}): {motivoBloqueo.accion}
            </p>
          </div>
        </div>
      )}

      {/* ── Botón Iniciar Revisión (siempre visible — el backend valida bloqueos) ── */}
      {puedeIniciarRevision && (
        <div className={`flex items-center gap-3 p-3 border rounded-lg ${
          ot.diagnostico_habilitado
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          <div className="flex-1">
            {ot.diagnostico_habilitado ? (
              <>
                <p className="text-sm font-semibold text-emerald-900">Esta OT está lista para revisión</p>
                <p className="text-xs text-emerald-700">Inicia la revisión para registrar tu tiempo técnico y mover la OT a EN_REVISION.</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-amber-900">Revisión pendiente de habilitación</p>
                <p className="text-xs text-amber-700">
                  {motivoBloqueo.descripcion} · Acción: {motivoBloqueo.accion}
                </p>
              </>
            )}
            {errorInicio && <p className="text-xs text-red-600 mt-1">{errorInicio}</p>}
            {bloqueoPendiente && (
              <div className="mt-1.5 flex items-center gap-2">
                <p className="text-xs text-amber-800 font-medium flex-1">{bloqueoPendiente.descripcion}</p>
                {esAdminOSupervisor && (
                  <a
                    href={`${createPageUrl('PuntoVenta')}?ot_id=${ot.id}&concepto=revision_diagnostico`}
                    className="text-xs px-2 py-1 bg-amber-600 text-white rounded-md font-semibold whitespace-nowrap hover:bg-amber-700"
                  >
                    Ir a Punto de Venta
                  </a>
                )}
              </div>
            )}
          </div>
          <Button
            onClick={handleIniciarRevision}
            disabled={iniciando}
            className={
              ot.diagnostico_habilitado
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shrink-0'
                : 'bg-amber-600 hover:bg-amber-700 text-white shrink-0'
            }
            size="sm"
          >
            {iniciando ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Iniciando...</>
            ) : (
              <>{ot.diagnostico_habilitado
                ? <><Play className="w-4 h-4 mr-1.5" /> Iniciar Revisión</>
                : <><Lock className="w-4 h-4 mr-1.5" /> Iniciar Revisión</>
              }</>
            )}
          </Button>
        </div>
      )}

      {/* ── Estado Documental (separado del estado comercial) ─────────────── */}
      {['EN_REVISION', 'DIAGNOSTICADA', 'COTIZADA', 'APROBADA'].includes(ot.estado) && (() => {
        const DocIcon = docCfg.icon;
        return (
          <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-xs ${docCfg.color}`}>
            <DocIcon className="w-3.5 h-3.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-semibold">Documento diagnóstico: </span>
              <span>{docCfg.label}</span>
              {docActivo?.enviado_at && (
                <span className="text-[10px] opacity-70 ml-2">
                  · Enviado vía {CANAL_LABEL[docActivo.canal_envio] || docActivo.canal_envio || '—'}
                  {' '}el {new Date(docActivo.enviado_at).toLocaleDateString('es-CR', { day: '2-digit', month: 'short' })}
                </span>
              )}
            </div>
            {clienteAprobado && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold text-[10px] shrink-0">
                <CheckCircle2 className="w-3 h-3" /> Comercialmente aprobado
              </span>
            )}
          </div>
        );
      })()}

      {/* ── Bloque Estado Custodia (solo OT FINALIZADA) ───────────────────── */}
      {ot.estado === 'FINALIZADA' && (() => {
        const { estadoCustodia, diasCustodia, elegibleAbandono } = calcularCustodia(ot);
        const cfg = CUSTODIA_CONFIG[estadoCustodia] || CUSTODIA_CONFIG.NORMAL;
        return (
          <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${cfg.color}`}>
            <Archive className="w-3.5 h-3.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-xs">Estado Custodia: </span>
              <span className="text-xs">{cfg.label}</span>
              {diasCustodia !== null && (
                <span className="text-[10px] opacity-70 ml-2">· {diasCustodia} días desde cierre</span>
              )}
            </div>
            {elegibleAbandono && estadoCustodia !== 'ABANDONO_DECLARADO' && estadoCustodia !== 'DISPOSICION_FINAL' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold text-[10px] shrink-0">
                Elegible abandono
              </span>
            )}
          </div>
        );
      })()}

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
    </div>
  );
}