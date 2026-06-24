/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SFHS: ExpedienteTecnico — FASE 5
 * ═══════════════════════════════════════════════════════════════════════════
 * STATUS: ACTIVE
 * USED_BY: pages/ExpedienteOT
 * DESCRIPTION: Integración técnica: DMR (solo lectura), Prediagnóstico,
 *   Diagnóstico Técnico, Evidencias, Actividades.
 *   Reutiliza: ListaActividades (componente existente).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Loader2, ChevronDown, ChevronUp, FileText,
  CheckCircle2, Circle, Camera, ClipboardList, Shield,
  Send, MessageSquare, Mail, Ban, Clock, XCircle, Archive
} from 'lucide-react';
import { calcularCustodia, CUSTODIA_CONFIG } from '@/lib/custodiaEngine';
import { Badge } from '@/components/ui/badge';
import ListaActividades from '@/components/actividades/ListaActividades';
import PanelOperativoDiagnostico from '@/components/expediente/PanelOperativoDiagnostico';
import AccionesCustodia from '@/components/expediente/AccionesCustodia';

// ── Bloque colapsable reutilizable ─────────────────────────────────────────
function Bloque({ label, icon: Icon, accentClass = 'bg-slate-50 text-slate-600', defaultOpen = true, badge, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center gap-2 px-4 py-3 text-left ${accentClass} hover:brightness-95 transition`}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wide flex-1">{label}</span>
        {badge && <span className="ml-auto mr-2">{badge}</span>}
        {open ? <ChevronUp className="w-4 h-4 opacity-50" /> : <ChevronDown className="w-4 h-4 opacity-50" />}
      </button>
      {open && <div className="px-4 py-3 bg-white">{children}</div>}
    </div>
  );
}

// ── Fila de dato ──────────────────────────────────────────────────────────
function Dato({ label, children }) {
  return (
    <div className="flex gap-2 py-1 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-400 w-32 shrink-0">{label}</span>
      <span className="text-xs text-slate-800 font-medium">{children}</span>
    </div>
  );
}

export default function ExpedienteTecnico({ ot, organizationId, effectiveRole, cliente, equipo, tecnico, onOTUpdated }) {
  // ── DMR activo ────────────────────────────────────────────────────────────
  const { data: dmrList = [], isLoading: loadingDMR } = useQuery({
    queryKey: ['expediente-dmr', ot.id],
    queryFn: () => base44.entities.DiagnosticMasterRecord.filter({
      orden_trabajo_id: ot.id,
      document_status: 'ACTIVE',
    }),
    enabled: !!ot.id,
    staleTime: 5 * 60 * 1000,
  });
  const dmr = dmrList[0] || null;

  // ── Panel Operativo necesita prediag ──────────────────────────────────────
  const { data: prediagList = [] } = useQuery({
    queryKey: ['expediente-prediag', ot.id],
    queryFn: () => base44.entities.PreDiagnostico.filter({ orden_trabajo_id: ot.id }),
    enabled: !!ot.id,
    staleTime: 2 * 60 * 1000,
  });
  const prediag = prediagList[0] || null;

  // ── Diagnóstico Técnico ───────────────────────────────────────────────────
  const { data: diagList = [] } = useQuery({
    queryKey: ['expediente-diag-tecnico', ot.id],
    queryFn: () => base44.entities.DiagnosticoTecnico.filter({ orden_trabajo_id: ot.id }),
    enabled: !!ot.id,
    staleTime: 2 * 60 * 1000,
  });
  const diag = diagList[0] || null;

  // ── DiagnosticoDocumento activo ───────────────────────────────────────────
  const { data: docList = [] } = useQuery({
    queryKey: ['expediente-diag-doc', diag?.id],
    queryFn: () => base44.entities.DiagnosticoDocumento.filter({ diagnostico_id: diag.id }),
    enabled: !!diag?.id,
    staleTime: 2 * 60 * 1000,
  });
  const docActivo = docList.find(d => d.estado !== 'ANULADO') || null;

  // ── Evidencias ────────────────────────────────────────────────────────────
  const { data: evidencias = [] } = useQuery({
    queryKey: ['expediente-evidencias', diag?.id],
    queryFn: () => base44.entities.DiagnosticoEvidencia.filter({ diagnostico_id: diag.id }),
    enabled: !!diag?.id,
    staleTime: 5 * 60 * 1000,
  });
  const fotos = evidencias.filter(e => e.tipo === 'foto');
  const notas = evidencias.filter(e => e.tipo === 'nota');

  if (!ot) return null;

  return (
    <div className="space-y-3">

      {/* ── Panel Operativo de Diagnóstico — P0.2-C ───────────────────────── */}
      <PanelOperativoDiagnostico
        ot={ot}
        organizationId={organizationId}
        effectiveRole={effectiveRole}
        cliente={cliente}
        equipo={equipo}
        tecnico={tecnico}
        prediag={prediag}
      />

      {/* ── Estado Documental — Trazabilidad de Envío ────────────────────── */}
      {docActivo && (
        <Bloque
          label="Estado del Documento Diagnóstico"
          icon={Send}
          accentClass="bg-purple-50 text-purple-700"
          defaultOpen={true}
          badge={
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              docActivo.estado === 'ENVIADO'  ? 'bg-purple-100 text-purple-700' :
              docActivo.estado === 'EMITIDO'  ? 'bg-amber-100 text-amber-700'  :
              docActivo.estado === 'ANULADO'  ? 'bg-red-100 text-red-600'      :
              'bg-slate-100 text-slate-500'
            }`}>
              {docActivo.estado === 'ENVIADO' ? 'Enviado' :
               docActivo.estado === 'EMITIDO' ? 'Emitido' :
               docActivo.estado === 'ANULADO' ? 'Anulado' : docActivo.estado}
            </span>
          }
        >
          <div className="space-y-1">
            <Dato label="Estado">{docActivo.estado}</Dato>
            <Dato label="Versión">{docActivo.version || '—'}</Dato>
            {docActivo.emitido_at && (
              <Dato label="Emitido">
                {format(new Date(docActivo.emitido_at), "dd MMM yyyy HH:mm", { locale: es })}
              </Dato>
            )}
            {docActivo.canal_envio && (
              <Dato label="Canal de envío">
                <span className="inline-flex items-center gap-1">
                  {docActivo.canal_envio === 'WHATSAPP' && <MessageSquare className="w-3 h-3 text-green-600" />}
                  {docActivo.canal_envio === 'EMAIL'    && <Mail className="w-3 h-3 text-blue-600" />}
                  {docActivo.canal_envio === 'MANUAL'   && <FileText className="w-3 h-3 text-slate-500" />}
                  {docActivo.canal_envio === 'WHATSAPP' ? 'WhatsApp' : docActivo.canal_envio === 'EMAIL' ? 'Correo' : 'Manual'}
                </span>
              </Dato>
            )}
            {docActivo.enviado_at && (
              <Dato label="Enviado el">
                {format(new Date(docActivo.enviado_at), "dd MMM yyyy HH:mm", { locale: es })}
              </Dato>
            )}
            {docActivo.metodo_aprobacion && (
              <Dato label="Método aprobación">
                {{ VERBAL: 'Verbal', WHATSAPP_CONFIRM: 'Confirmación WhatsApp', FIRMA_FISICA: 'Firma física', PORTAL_DIGITAL: 'Portal digital' }[docActivo.metodo_aprobacion] || docActivo.metodo_aprobacion}
              </Dato>
            )}
            {docActivo.aprobacion_status && docActivo.aprobacion_status !== 'PENDIENTE' && (
              <Dato label="Aprobación doc.">
                <span className={`inline-flex items-center gap-1 ${
                  docActivo.aprobacion_status === 'APROBADA'  ? 'text-emerald-700' :
                  docActivo.aprobacion_status === 'RECHAZADA' ? 'text-red-600' : 'text-slate-500'
                }`}>
                  {docActivo.aprobacion_status === 'APROBADA'  && <CheckCircle2 className="w-3 h-3" />}
                  {docActivo.aprobacion_status === 'RECHAZADA' && <XCircle className="w-3 h-3" />}
                  {docActivo.aprobacion_status === 'EXPIRADA'  && <Clock className="w-3 h-3" />}
                  {docActivo.aprobacion_status}
                </span>
              </Dato>
            )}
          </div>
        </Bloque>
      )}

      {/* ── DMR — Solo lectura ────────────────────────────────────────────── */}
      <Bloque
        label="Documento Maestro de Recepción (DMR)"
        icon={Shield}
        accentClass="bg-indigo-50 text-indigo-700"
        defaultOpen={false}
        badge={
          loadingDMR ? <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" /> :
          dmr ? <Badge className="bg-indigo-100 text-indigo-700 border-0 text-[10px]">#{dmr.dmr_number}</Badge> :
          <Badge className="bg-slate-100 text-slate-500 border-0 text-[10px]">Sin DMR</Badge>
        }
      >
        {!dmr ? (
          <p className="text-xs text-slate-400 italic py-2">No existe DMR activo para esta OT.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-x-6">
              <Dato label="Número">{dmr.dmr_number}</Dato>
              <Dato label="Versión">v{dmr.version}</Dato>
              <Dato label="Creado">
                {format(new Date(dmr.created_at), "dd MMM yyyy HH:mm", { locale: es })}
              </Dato>
              <Dato label="Estado">
                <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">{dmr.document_status}</Badge>
              </Dato>
            </div>

            {dmr.cliente_snapshot && (
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Snapshot Cliente</p>
                <div className="bg-slate-50 rounded-lg p-2 space-y-0.5">
                  <Dato label="Nombre">{dmr.cliente_snapshot.nombre_completo}</Dato>
                  {dmr.cliente_snapshot.telefono && <Dato label="Teléfono">{dmr.cliente_snapshot.telefono}</Dato>}
                </div>
              </div>
            )}

            {dmr.activo_snapshot && (
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Snapshot Equipo</p>
                <div className="bg-slate-50 rounded-lg p-2 space-y-0.5">
                  <Dato label="Tipo">{dmr.activo_snapshot.tipo}</Dato>
                  <Dato label="Marca/Modelo">{`${dmr.activo_snapshot.marca || ''} ${dmr.activo_snapshot.modelo || ''}`.trim()}</Dato>
                  {dmr.activo_snapshot.serie && <Dato label="Serie">{dmr.activo_snapshot.serie}</Dato>}
                  {dmr.activo_snapshot.estado_fisico && <Dato label="Estado físico" className="capitalize">{dmr.activo_snapshot.estado_fisico}</Dato>}
                </div>
              </div>
            )}

            {dmr.contexto_recepcion && (
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Contexto Recepción</p>
                <div className="bg-slate-50 rounded-lg p-2 space-y-0.5">
                  {dmr.contexto_recepcion.motivo_ingreso && <Dato label="Motivo">{dmr.contexto_recepcion.motivo_ingreso}</Dato>}
                  {dmr.contexto_recepcion.tipo_ingreso && <Dato label="Tipo ingreso" className="capitalize">{dmr.contexto_recepcion.tipo_ingreso}</Dato>}
                  {dmr.contexto_recepcion.accesorios_ingreso && <Dato label="Accesorios">{dmr.contexto_recepcion.accesorios_ingreso}</Dato>}
                  {dmr.contexto_recepcion.prioridad && <Dato label="Prioridad" className="capitalize">{dmr.contexto_recepcion.prioridad}</Dato>}
                </div>
              </div>
            )}

            {/* ── Pre-Diagnóstico de Recepción (desde diagnostico_snapshot del DMR) ── */}
            {dmr.diagnostico_snapshot && Object.keys(dmr.diagnostico_snapshot).length > 0 && (
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Pre-Diagnóstico de Recepción</p>
                <div className="bg-blue-50 rounded-lg p-2 space-y-0.5">
                  {dmr.diagnostico_snapshot.accesorios_ingreso && (
                    <Dato label="Accesorios">{dmr.diagnostico_snapshot.accesorios_ingreso}</Dato>
                  )}
                  {dmr.diagnostico_snapshot.estado_fisico_ingreso && (
                    <Dato label="Estado físico" className="capitalize">{dmr.diagnostico_snapshot.estado_fisico_ingreso}</Dato>
                  )}
                  {dmr.diagnostico_snapshot.danos_visibles && (
                    <Dato label="Daños visibles">{dmr.diagnostico_snapshot.danos_visibles}</Dato>
                  )}
                  {dmr.diagnostico_snapshot.observaciones_recepcion && (
                    <Dato label="Observaciones">{dmr.diagnostico_snapshot.observaciones_recepcion}</Dato>
                  )}
                  {dmr.diagnostico_snapshot.riesgos_recepcion && (
                    <Dato label="Riesgos">{dmr.diagnostico_snapshot.riesgos_recepcion}</Dato>
                  )}
                  {dmr.diagnostico_snapshot.checklist_recepcion && (
                    <Dato label="Checklist">{
                      Array.isArray(dmr.diagnostico_snapshot.checklist_recepcion)
                        ? dmr.diagnostico_snapshot.checklist_recepcion.join(', ')
                        : String(dmr.diagnostico_snapshot.checklist_recepcion)
                    }</Dato>
                  )}
                  {/* Campos adicionales no mapeados explícitamente */}
                  {Object.entries(dmr.diagnostico_snapshot)
                    .filter(([k]) => !['accesorios_ingreso','estado_fisico_ingreso','danos_visibles','observaciones_recepcion','riesgos_recepcion','checklist_recepcion'].includes(k))
                    .map(([k, v]) => (
                      <Dato key={k} label={k.replace(/_/g, ' ')}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</Dato>
                    ))
                  }
                </div>
              </div>
            )}

            {dmr.legal_snapshot?.terminos_aceptados && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Términos y condiciones aceptados — v{dmr.legal_snapshot.terminos_version || '1.0'}
              </div>
            )}
          </div>
        )}
      </Bloque>

      {/* ── Prediagnóstico ────────────────────────────────────────────────── */}
      <Bloque
        label="Pre-Diagnóstico de Recepción"
        icon={ClipboardList}
        accentClass="bg-blue-50 text-blue-700"
        defaultOpen={false}
        badge={
          prediag
            ? <Badge className={`border-0 text-[10px] ${prediag.estado === 'completado' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {prediag.estado === 'completado' ? 'Completado' : 'Borrador'}
              </Badge>
            : <Badge className="bg-slate-100 text-slate-400 border-0 text-[10px]">Sin datos</Badge>
        }
      >
        {!prediag ? (
          <p className="text-xs text-slate-400 italic py-2">Sin prediagnóstico registrado.</p>
        ) : (
          <div>
            {ot.diagnostico_resumido && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800 leading-relaxed">
                {ot.diagnostico_resumido}
              </div>
            )}
            {prediag.respuestas && Object.keys(prediag.respuestas).length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Respuestas del Wizard</p>
                {Object.entries(prediag.respuestas).map(([k, v]) => (
                  <Dato key={k} label={k}>{String(v)}</Dato>
                ))}
              </div>
            )}
          </div>
        )}
      </Bloque>

      {/* ── Diagnóstico Técnico ───────────────────────────────────────────── */}
      <Bloque
        label="Diagnóstico Técnico"
        icon={FileText}
        accentClass="bg-purple-50 text-purple-700"
        defaultOpen={false}
        badge={
          diag
            ? <Badge className={`border-0 text-[10px] ${diag.estado === 'listo_aprobacion' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                {diag.estado === 'listo_aprobacion' ? 'Listo' : 'Borrador'}
              </Badge>
            : <Badge className="bg-slate-100 text-slate-400 border-0 text-[10px]">Sin diagnóstico</Badge>
        }
      >
        {!diag ? (
          <p className="text-xs text-slate-400 italic py-2">Sin diagnóstico técnico registrado aún.</p>
        ) : (
          <div className="space-y-2">
            {diag.tipo_intervencion && <Dato label="Tipo intervención" className="capitalize">{diag.tipo_intervencion.replace(/_/g, ' ')}</Dato>}
            {diag.causa_probable && <Dato label="Causa probable">{diag.causa_probable}</Dato>}
            {diag.trabajo_recomendado && <Dato label="Trabajo recomendado">{diag.trabajo_recomendado}</Dato>}
            {diag.tiempo_estimado_horas && <Dato label="Tiempo estimado">{diag.tiempo_estimado_horas}h</Dato>}
            {diag.riesgos_no_reparar && (
              <div className="mt-2 bg-orange-50 border border-orange-100 rounded-lg p-2 text-xs text-orange-800">
                <strong>Riesgo si no se repara:</strong> {diag.riesgos_no_reparar}
              </div>
            )}
            {diag.repuestos_requeridos?.length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Repuestos Requeridos</p>
                {diag.repuestos_requeridos.map((r, i) => (
                  <div key={i} className="flex gap-2 text-xs text-slate-700 py-0.5">
                    <span>• {r.descripcion}</span>
                    <span className="text-slate-400">x{r.cantidad}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Bloque>

      {/* ── Evidencias Fotográficas ───────────────────────────────────────── */}
      {fotos.length > 0 && (
        <Bloque
          label={`Evidencias Fotográficas (${fotos.length})`}
          icon={Camera}
          accentClass="bg-slate-50 text-slate-600"
          defaultOpen={false}
        >
          <div className="grid grid-cols-3 gap-2">
            {fotos.map((foto, i) => (
              <a key={i} href={foto.url} target="_blank" rel="noopener noreferrer">
                <img
                  src={foto.url}
                  alt={foto.descripcion || `Evidencia ${i + 1}`}
                  className="w-full h-24 object-cover rounded-lg border border-slate-100 hover:opacity-90 transition"
                />
                {foto.descripcion && (
                  <p className="text-[10px] text-slate-500 mt-0.5 truncate">{foto.descripcion}</p>
                )}
              </a>
            ))}
          </div>
        </Bloque>
      )}

      {/* ── Notas técnicas ───────────────────────────────────────────────── */}
      {notas.length > 0 && (
        <Bloque
          label={`Notas Técnicas (${notas.length})`}
          icon={ClipboardList}
          accentClass="bg-slate-50 text-slate-600"
          defaultOpen={false}
        >
          <div className="space-y-2">
            {notas.map((nota, i) => (
              <div key={i} className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-xs text-slate-700 leading-relaxed">
                {nota.contenido_texto}
                {nota.descripcion && <p className="text-slate-400 mt-1 text-[10px]">{nota.descripcion}</p>}
              </div>
            ))}
          </div>
        </Bloque>
      )}

      {/* ── Custodia y Abandono (solo OT FINALIZADA) ─────────────────────── */}
      {ot.estado === 'FINALIZADA' && (() => {
        const { estadoCustodia, diasCustodia, elegibleAbandono } = calcularCustodia(ot);
        const cfg = CUSTODIA_CONFIG[estadoCustodia] || CUSTODIA_CONFIG.NORMAL;
        return (
          <Bloque
            label="Custodia y Abandono"
            icon={Archive}
            accentClass="bg-amber-50 text-amber-800"
            defaultOpen={true}
            badge={
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.badgeClass}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                {cfg.label}
              </span>
            }
          >
            <div className="space-y-1">
              <Dato label="Estado Custodia">
                <span className={`inline-flex items-center gap-1 font-semibold ${cfg.color.split(' ').find(c => c.startsWith('text-'))}`}>
                  {cfg.label}
                </span>
              </Dato>
              {diasCustodia !== null && (
                <Dato label="Días en custodia">{diasCustodia} días</Dato>
              )}
              {ot.fecha_inicio_custodia && (
                <Dato label="Inicio custodia">
                  {format(new Date(ot.fecha_inicio_custodia), "dd MMM yyyy HH:mm", { locale: es })}
                </Dato>
              )}
              {ot.fecha_ultimo_contacto && (
                <Dato label="Último contacto">
                  {format(new Date(ot.fecha_ultimo_contacto), "dd MMM yyyy HH:mm", { locale: es })}
                </Dato>
              )}
              {ot.fecha_abandono && (
                <Dato label="Fecha abandono">
                  {format(new Date(ot.fecha_abandono), "dd MMM yyyy HH:mm", { locale: es })}
                </Dato>
              )}
              {ot.abandono_observaciones && (
                <Dato label="Observaciones">{ot.abandono_observaciones}</Dato>
              )}
              {elegibleAbandono && !ot.fecha_abandono && (
                <div className="mt-2 flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <Clock className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <p className="text-xs text-red-700">
                    Este equipo lleva más de 30 días finalizado. Elegible para declarar abandono.
                  </p>
                </div>
              )}
            </div>

            {/* ── Acciones operativas de Custodia ──────────────────────── */}
            <AccionesCustodia ot={ot} onUpdated={onOTUpdated} />
          </Bloque>
        );
      })()}

      {/* ── Actividades (componente existente reutilizado) ────────────────── */}
      <Bloque
        label="Actividades Técnicas"
        icon={CheckCircle2}
        accentClass="bg-green-50 text-green-700"
        defaultOpen={false}
      >
        <ListaActividades ordenTrabajoId={ot.id} />
      </Bloque>

    </div>
  );
}