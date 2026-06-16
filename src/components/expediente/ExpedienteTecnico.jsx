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
  CheckCircle2, Circle, Camera, ClipboardList, Shield
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import ListaActividades from '@/components/actividades/ListaActividades';
import PanelOperativoDiagnostico from '@/components/expediente/PanelOperativoDiagnostico';

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

export default function ExpedienteTecnico({ ot, organizationId, effectiveRole, cliente, equipo, tecnico }) {
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