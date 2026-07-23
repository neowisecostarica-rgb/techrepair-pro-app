/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SFHS: PanelOperativoDiagnostico — P0.2-C
 * ═══════════════════════════════════════════════════════════════════════════
 * STATUS: ACTIVE
 * USED_BY: components/expediente/ExpedienteTecnico
 * DESCRIPTION:
 *   Panel operativo de diagnóstico con máquina de estados documental:
 *   NO_EXISTE → BORRADOR → EMITIDO → ENVIADO → ANULADO
 *
 *   Dimensión Aprobación (independiente del documento):
 *   PENDIENTE → APROBADA / RECHAZADA / EXPIRADA
 *
 *   Botones dinámicos según estado actual.
 *   El documento NO transiciona a APROBADO/RECHAZADO — ese estado
 *   vive en aprobacion_status como campo separado.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  FileText, Play, PenLine, Send, Eye, RotateCcw, Ban,
  CheckCircle2, XCircle, Clock, MessageSquare, Mail,
  Loader2, AlertCircle, ChevronRight
} from 'lucide-react';
import { useAuthContext } from '@/components/contexts/AuthContext';
import WizardDiagnosticoTecnico from '@/components/diagnostico-tecnico/WizardDiagnosticoTecnico';
import DiagnosticoDocumentoA4 from '@/components/diagnostico/DiagnosticoDocumentoA4';

// ── Mapas visuales ────────────────────────────────────────────────────────────
const DOC_ESTADO_CONFIG = {
  NO_EXISTE:  { label: 'Sin Diagnóstico',    color: 'bg-slate-100 text-slate-500',   icon: FileText },
  BORRADOR:   { label: 'Borrador',           color: 'bg-blue-100 text-blue-700',     icon: PenLine  },
  EMITIDO:    { label: 'Emitido',            color: 'bg-amber-100 text-amber-700',   icon: FileText },
  ENVIADO:    { label: 'Enviado al Cliente', color: 'bg-purple-100 text-purple-700', icon: Send     },
  ANULADO:    { label: 'Anulado',            color: 'bg-red-100 text-red-600',       icon: Ban      },
};

const APRO_ESTADO_CONFIG = {
  PENDIENTE:  { label: 'Aprobación pendiente', color: 'bg-amber-100 text-amber-700',   icon: Clock       },
  APROBADA:   { label: 'Aprobada',             color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  RECHAZADA:  { label: 'Rechazada',            color: 'bg-red-100 text-red-600',       icon: XCircle     },
  EXPIRADA:   { label: 'Expirada',             color: 'bg-slate-100 text-slate-500',   icon: Clock       },
};

// ── Sub-componente: badge de estado ──────────────────────────────────────────
function EstadoBadge({ config }) {
  if (!config) return null;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${config.color}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

// ── Helper: construir snapshot documental completo ───────────────────────────
function buildSnapshot({ ot, diag, evidencias, cliente, equipo }) {
  return {
    cliente: cliente ? {
      id: cliente.id,
      nombre_completo: cliente.nombre_completo,
      identificacion: cliente.identificacion,
      telefono: cliente.telefono,
      email: cliente.email,
    } : null,
    equipo: equipo ? {
      id: equipo.id,
      tipo: equipo.tipo,
      marca: equipo.marca,
      modelo: equipo.modelo,
      serie: ot.serie_ingreso || equipo.numero_serie,
      estado_fisico: ot.estado_fisico_ingreso,
    } : null,
    diagnostico: diag ? {
      id: diag.id,
      tipo_intervencion: diag.tipo_intervencion,
      causa_probable: diag.causa_probable,
      trabajo_recomendado: diag.trabajo_recomendado,
      riesgos_no_reparar: diag.riesgos_no_reparar,
      tiempo_estimado_horas: diag.tiempo_estimado_horas,
      hallazgos: diag.hallazgos,
      pruebas_realizadas: diag.pruebas_realizadas,
      componentes_revisar: diag.componentes_revisar,
      fecha_inicio: diag.fecha_inicio,
      fecha_completado: diag.fecha_completado,
    } : null,
    repuestos: diag?.repuestos_requeridos || [],
    evidencias: evidencias.map(e => ({
      tipo: e.tipo,
      url: e.url,
      descripcion: e.descripcion,
      contenido_texto: e.contenido_texto,
    })),
    ot_codigo: ot.codigo_ot,
    ot_id: ot.id,
    fecha_emision: new Date().toISOString(),
  };
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function PanelOperativoDiagnostico({
  ot,
  organizationId,
  effectiveRole,
  cliente,
  equipo,
  tecnico,
  prediag,
}) {
  const queryClient = useQueryClient();
  const [wizardOpen, setWizardOpen]       = useState(false);
  const [documentoOpen, setDocumentoOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError]     = useState(null);
  const { user } = useAuthContext();

  // RC2-GOLD-05: Para ORG_ADMIN/BRANCH_ADMIN, el tecnicoId del wizard es el técnico asignado a la OT.
  // Si no hay técnico asignado, usa el propio user.id como fallback.
  const esAdminOperativo = ['ORG_ADMIN', 'BRANCH_ADMIN', 'SUPER_ADMIN'].includes(effectiveRole);
  const tecnicoIdEfectivo = esAdminOperativo
    ? (tecnico?.user_id || tecnico?.id || user?.id)
    : (user?.id);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: diagList = [], isLoading: loadingDiag } = useQuery({
    queryKey: ['panel-diag-tecnico', ot.id],
    queryFn: () => base44.entities.DiagnosticoTecnico.filter({
      orden_trabajo_id: ot.id,
      organization_id: organizationId,
    }, '-created_date', 20),
    enabled: !!ot.id,
    staleTime: 30_000,
  });
  const diag = diagList[0] || null;

  const { data: docList = [], isLoading: loadingDoc } = useQuery({
    queryKey: ['panel-diag-doc', ot.id],
    queryFn: () => base44.entities.DiagnosticoDocumento.filter({
      diagnostico_id: diag?.id,
      organization_id: organizationId,
    }),
    enabled: !!diag?.id,
    staleTime: 30_000,
  });
  // Documento activo (no anulado) más reciente
  const docActivo = docList.find(d => d.estado !== 'ANULADO') || null;

  const { data: evidencias = [] } = useQuery({
    queryKey: ['panel-evidencias', diag?.id],
    queryFn: () => base44.entities.DiagnosticoEvidencia.filter({ diagnostico_id: diag.id }),
    enabled: !!diag?.id,
    staleTime: 60_000,
  });

  const invalidarPanel = () => {
    queryClient.invalidateQueries({ queryKey: ['panel-diag-tecnico', ot.id] });
    queryClient.invalidateQueries({ queryKey: ['panel-diag-doc', ot.id] });
    queryClient.invalidateQueries({ queryKey: ['expediente-diag-tecnico', ot.id] });
    // RC2-GOLD-02: invalidar OT raíz para sincronizar CentroMando sin F5
    queryClient.invalidateQueries({ queryKey: ['expediente-ot', ot.id] });
  };

  // ── Calcular estado documental ─────────────────────────────────────────────
  let docEstado = 'NO_EXISTE';
  if (docActivo) {
    docEstado = docActivo.estado || 'EMITIDO';
  } else if (diag && !docActivo) {
    // Hay diagnóstico técnico pero aún no se emitió el documento
    docEstado = diag.estado === 'listo_aprobacion' ? 'BORRADOR' : 'BORRADOR';
  } else if (!diag) {
    docEstado = 'NO_EXISTE';
  }

  // Aprobación (vive en el documento como campo separado)
  const aprobacionEstado = docActivo?.aprobacion_status || null;

  // ── Roles con acceso operativo ─────────────────────────────────────────────
  const esTecnico     = ['TECHNICIAN', 'ORG_ADMIN', 'BRANCH_ADMIN', 'SUPER_ADMIN'].includes(effectiveRole);
  const esAdminOVenta = ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES', 'SUPER_ADMIN'].includes(effectiveRole);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const finalizarDiagnostico = async () => {
    if (!diag) throw new Error('No existe un diagnostico preparado para finalizar');

    const response = await base44.functions.invoke('transitionWorkOrderStatus', {
      orden_trabajo_id: ot.id,
      newStatus: 'DIAGNOSTICADA',
      diagnostico_id: diag.id,
      observacion: 'Diagnostico tecnico completado despues de emitir el documento',
    });
    const completion = response?.data ?? response;
    if (!completion?.success) {
      const error = new Error(completion?.error || 'No se pudo completar el diagnostico');
      error.code = completion?.code;
      throw error;
    }
    return completion;
  };

  // Emitir el snapshot y, con el documento ya confirmado, completar el lifecycle.
  const handleEmitir = async () => {
    if (!diag) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const snapshot = buildSnapshot({ ot, diag, evidencias, cliente, equipo });
      let documentoConfirmado = docActivo;

      if (!documentoConfirmado || !['EMITIDO', 'ENVIADO'].includes(documentoConfirmado.estado)) {
        try {
          documentoConfirmado = await base44.entities.DiagnosticoDocumento.create({
            diagnostico_id: diag.id,
            organization_id: organizationId,
            version: `v${(docList.length) + 1}`,
            formato: 'pdf',
            estado: 'EMITIDO',
            aprobacion_status: 'PENDIENTE',
            snapshot_data: snapshot,
            emitido_at: new Date().toISOString(),
            url_documento: '',  // Se actualiza al generar PDF
          });
        } catch (createError) {
          // Una respuesta perdida puede ocultar una creacion exitosa. Releer antes
          // de permitir otro intento evita duplicar el documento emitido.
          const documentosActuales = await base44.entities.DiagnosticoDocumento.filter({
            diagnostico_id: diag.id,
            organization_id: organizationId,
          }, '-created_date', 20);
          documentoConfirmado = documentosActuales.find(d => ['EMITIDO', 'ENVIADO'].includes(d.estado));
          if (!documentoConfirmado) throw createError;
        }
      }

      await finalizarDiagnostico();
      invalidarPanel();
    } catch (e) {
      setActionError(e.message);
      invalidarPanel();
    } finally {
      setActionLoading(false);
    }
  };

  const handleReintentarFinalizacion = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      await finalizarDiagnostico();
      invalidarPanel();
    } catch (e) {
      setActionError(e.message);
      invalidarPanel();
    } finally {
      setActionLoading(false);
    }
  };

  // Marcar como enviado — registra trazabilidad completa
  const handleMarcarEnviado = async (canal) => {
    if (!docActivo) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await base44.entities.DiagnosticoDocumento.update(docActivo.id, {
        estado: 'ENVIADO',
        canal_envio: canal,
        enviado_at: new Date().toISOString(),
        enviado_por: user?.id || null,
      });
      invalidarPanel();
    } catch (e) {
      setActionError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Reenviar: mantiene estado ENVIADO, actualiza trazabilidad de reenvío
  const handleReenviar = async (canal) => {
    if (!docActivo) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await base44.entities.DiagnosticoDocumento.update(docActivo.id, {
        canal_envio: canal,
        enviado_at: new Date().toISOString(),
        enviado_por: user?.id || null,
      });
      invalidarPanel();
    } catch (e) {
      setActionError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Anular documento
  const handleAnular = async () => {
    if (!docActivo) return;
    if (!window.confirm('¿Anular este documento? Esta acción es irreversible. Podrás crear un reemplazo después.')) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await base44.entities.DiagnosticoDocumento.update(docActivo.id, {
        estado: 'ANULADO',
        anulado_at: new Date().toISOString(),
      });
      invalidarPanel();
    } catch (e) {
      setActionError(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  // WhatsApp — abre wa.me con mensaje de diagnóstico
  const handleWhatsApp = async () => {
    const tel = cliente?.telefono?.replace(/\D/g, '');
    if (!tel) {
      setActionError('El cliente no tiene teléfono registrado.');
      return;
    }
    const msg = `Hola ${cliente.nombre_completo || ''} 👋\n\nTe compartimos el diagnóstico técnico de tu equipo:\n\n📱 ${equipo ? `${equipo.marca} ${equipo.modelo}` : 'Equipo'}\n🔧 OT: ${ot.codigo_ot}\n\n${diag?.trabajo_recomendado ? `🔍 *Trabajo recomendado:*\n${diag.trabajo_recomendado}` : ''}\n\nPor favor, confirma si deseas continuar con la reparación. ¡Gracias!`;
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank');
    await handleMarcarEnviado('WHATSAPP');
  };

  // Correo
  const handleCorreo = async () => {
    const email = cliente?.email;
    if (!email) {
      setActionError('El cliente no tiene correo registrado.');
      return;
    }
    const subject = encodeURIComponent(`Diagnóstico Técnico — OT ${ot.codigo_ot}`);
    const body = encodeURIComponent(
      `Estimado/a ${cliente.nombre_completo || ''},\n\nAdjuntamos el diagnóstico técnico de su equipo.\n\nCódigo OT: ${ot.codigo_ot}\n\nQuedo atento/a para confirmar si desea continuar con la reparación.\n\nSaludos.`
    );
    window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
    await handleMarcarEnviado('EMAIL');
  };

  // ── Wizard onComplete ──────────────────────────────────────────────────────
  const handleWizardComplete = () => {
    setWizardOpen(false);
    invalidarPanel();
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  const cargando = loadingDiag || loadingDoc;

  const docConfig  = DOC_ESTADO_CONFIG[docEstado]  || DOC_ESTADO_CONFIG.NO_EXISTE;
  const aproConfig = aprobacionEstado ? APRO_ESTADO_CONFIG[aprobacionEstado] : null;

  return (
    <>
      {/* ── Panel ─────────────────────────────────────────────────────────── */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 bg-purple-50 text-purple-700">
          <FileText className="w-4 h-4 shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wide flex-1">
            Panel Operativo — Documento Diagnóstico
          </span>
          {cargando
            ? <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
            : <EstadoBadge config={docConfig} />
          }
        </div>

        <div className="px-4 py-4 bg-white space-y-4">

          {/* Estado dual: Documento + Aprobación */}
          {docActivo && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-slate-400">Documento:</span>
              <EstadoBadge config={docConfig} />
              {aproConfig && (
                <>
                  <span className="text-xs text-slate-300">|</span>
                  <span className="text-xs text-slate-400">Aprobación:</span>
                  <EstadoBadge config={aproConfig} />
                </>
              )}
            </div>
          )}

          {/* Error */}
          {actionError && (
            <Alert className="bg-red-50 border-red-200 py-2">
              <AlertCircle className="w-3.5 h-3.5 text-red-600" />
              <AlertDescription className="text-red-800 text-xs">{actionError}</AlertDescription>
            </Alert>
          )}

          {/* ── BOTONES SEGÚN ESTADO ──────────────────────────────────────── */}

          {/* NO_EXISTE */}
          {docEstado === 'NO_EXISTE' && esTecnico && (
            <Button
              onClick={() => setWizardOpen(true)}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2"
              disabled={!ot.diagnostico_habilitado}
            >
              <Play className="w-4 h-4" />
              Iniciar Diagnóstico
              {!ot.diagnostico_habilitado && (
                <span className="ml-1 text-xs opacity-70">(Requiere autorización)</span>
              )}
            </Button>
          )}

          {/* BORRADOR: Diagnóstico técnico existe pero no emitido */}
          {docEstado === 'BORRADOR' && (
            <div className="space-y-2">
              {esTecnico && (
                <Button
                  onClick={() => setWizardOpen(true)}
                  variant="outline"
                  className="w-full gap-2"
                >
                  <PenLine className="w-4 h-4" />
                  Continuar Diagnóstico
                </Button>
              )}
              {esTecnico && diag?.estado === 'listo_aprobacion' && (
                <Button
                  onClick={handleEmitir}
                  disabled={actionLoading}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white gap-2"
                >
                  {actionLoading
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <FileText className="w-4 h-4" />
                  }
                  Emitir Documento
                </Button>
              )}
              {diag?.estado !== 'listo_aprobacion' && (
                <p className="text-xs text-slate-400 text-center">
                  Completa el diagnóstico técnico para habilitar la emisión.
                </p>
              )}
            </div>
          )}

          {/* EMITIDO */}
          {docEstado === 'EMITIDO' && (
            <div className="space-y-2">
              {ot.estado === 'EN_REVISION' && esTecnico && (
                <Button
                  onClick={handleReintentarFinalizacion}
                  disabled={actionLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Completar Diagnostico
                </Button>
              )}
              <Button
                onClick={() => setDocumentoOpen(true)}
                variant="outline"
                className="w-full gap-2"
              >
                <Eye className="w-4 h-4" />
                Ver Documento
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={handleWhatsApp}
                  disabled={actionLoading}
                  className="bg-green-600 hover:bg-green-700 text-white gap-2 text-sm"
                >
                  <MessageSquare className="w-4 h-4" />
                  WhatsApp
                </Button>
                <Button
                  onClick={handleCorreo}
                  disabled={actionLoading}
                  variant="outline"
                  className="gap-2 text-sm"
                >
                  <Mail className="w-4 h-4" />
                  Correo
                </Button>
              </div>
              {esAdminOVenta && (
                <Button
                  onClick={handleAnular}
                  disabled={actionLoading}
                  variant="ghost"
                  className="w-full text-red-500 hover:text-red-700 hover:bg-red-50 text-xs gap-1"
                >
                  <Ban className="w-3.5 h-3.5" />
                  Anular Documento
                </Button>
              )}
            </div>
          )}

          {/* ENVIADO */}
          {docEstado === 'ENVIADO' && (
            <div className="space-y-2">
              {ot.estado === 'EN_REVISION' && esTecnico && (
                <Button
                  onClick={handleReintentarFinalizacion}
                  disabled={actionLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Completar Diagnostico
                </Button>
              )}
              <Button
                onClick={() => setDocumentoOpen(true)}
                variant="outline"
                className="w-full gap-2"
              >
                <Eye className="w-4 h-4" />
                Ver Documento
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={handleWhatsApp}
                  disabled={actionLoading}
                  className="bg-green-600 hover:bg-green-700 text-white gap-2 text-sm"
                >
                  <MessageSquare className="w-4 h-4" />
                  Reenviar WhatsApp
                </Button>
                <Button
                  onClick={handleCorreo}
                  disabled={actionLoading}
                  variant="outline"
                  className="gap-2 text-sm"
                >
                  <Mail className="w-4 h-4" />
                  Reenviar Correo
                </Button>
              </div>

              {/* Estado de aprobación para contexto de espera */}
              {aprobacionEstado === 'PENDIENTE' && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  Esperando respuesta del cliente
                </div>
              )}
              {aprobacionEstado === 'APROBADA' && (
                <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  Cliente aprobó — OT puede avanzar a reparación
                </div>
              )}
              {aprobacionEstado === 'RECHAZADA' && (
                <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <XCircle className="w-3.5 h-3.5 shrink-0" />
                  Cliente rechazó — Revisar diagnóstico
                </div>
              )}

              {/* Registrar respuesta manual */}
              {esAdminOVenta && aprobacionEstado === 'PENDIENTE' && (
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={async () => {
                      setActionLoading(true);
                      try {
                        await base44.entities.DiagnosticoDocumento.update(docActivo.id, {
                          aprobacion_status: 'APROBADA',
                          aprobacion_at: new Date().toISOString(),
                          metodo_aprobacion: 'VERBAL',
                        });
                        invalidarPanel();
                      } catch (e) { setActionError(e.message); }
                      finally { setActionLoading(false); }
                    }}
                    disabled={actionLoading}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    Registrar Aprobación
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      setActionLoading(true);
                      try {
                        await base44.entities.DiagnosticoDocumento.update(docActivo.id, {
                          aprobacion_status: 'RECHAZADA',
                          aprobacion_at: new Date().toISOString(),
                          metodo_aprobacion: 'VERBAL',
                        });
                        invalidarPanel();
                      } catch (e) { setActionError(e.message); }
                      finally { setActionLoading(false); }
                    }}
                    disabled={actionLoading}
                    variant="outline"
                    className="flex-1 text-red-600 border-red-200 hover:bg-red-50 text-xs"
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    Registrar Rechazo
                  </Button>
                </div>
              )}

              {esAdminOVenta && (
                <Button
                  onClick={handleAnular}
                  disabled={actionLoading}
                  variant="ghost"
                  className="w-full text-red-500 hover:text-red-700 hover:bg-red-50 text-xs gap-1"
                >
                  <Ban className="w-3.5 h-3.5" />
                  Anular Documento
                </Button>
              )}
            </div>
          )}

          {/* ANULADO */}
          {docEstado === 'ANULADO' && (
            <div className="space-y-2">
              <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-center gap-2">
                <Ban className="w-3.5 h-3.5 shrink-0" />
                Documento anulado. Crea un documento de reemplazo.
              </div>
              {esTecnico && (
                <Button
                  onClick={handleEmitir}
                  disabled={actionLoading}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white gap-2"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  Crear Reemplazo
                </Button>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── Modal: Wizard Diagnóstico ────────────────────────────────────────── */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-700">
              <FileText className="w-5 h-5" />
              Diagnóstico Técnico — {ot.codigo_ot}
            </DialogTitle>
          </DialogHeader>
          <WizardDiagnosticoTecnico
            ordenTrabajo={ot}
            preDiagnostico={prediag}
            effectiveOrgId={organizationId}
            tecnicoId={tecnicoIdEfectivo}
            onClose={() => setWizardOpen(false)}
            onComplete={handleWizardComplete}
          />
        </DialogContent>
      </Dialog>

      {/* ── Modal: Documento A4 ──────────────────────────────────────────────── */}
      <Dialog open={documentoOpen} onOpenChange={setDocumentoOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-700">
              <Eye className="w-5 h-5" />
              Documento de Diagnóstico
            </DialogTitle>
          </DialogHeader>
          {diag && (
            <DiagnosticoDocumentoA4
              ordenTrabajo={ot}
              diagnostico={diag}
              cliente={cliente}
              equipo={equipo}
              tecnico={tecnico}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
