import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Play, 
  Pause, 
  Clock, 
  AlertCircle, 
  CheckCircle,
  Zap,
  Package,
  FileText,
  MessageSquare,
  Shield,
  Wrench
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import WizardDiagnosticoTecnico from '@/components/diagnostico-tecnico/WizardDiagnosticoTecnico';
import NotificacionesPanel from '@/components/notificaciones/NotificacionesPanel';
import { useNotificacionesAutomaticas } from '@/components/notificaciones/useNotificacionesAutomaticas';
import SolicitudesTecnicas from '@/components/tecnico/SolicitudesTecnicas';
import BloqueosTecnicos from '@/components/tecnico/BloqueosTecnicos';
import PruebasTecnicas from '@/components/tecnico/PruebasTecnicas';
import NotasInternas from '@/components/tecnico/NotasInternas';
import MensajesMotivacion from '@/components/tecnico/MensajesMotivacion';
import ActividadActiva from '@/components/actividades/ActividadActiva';
import { createPageUrl } from '../../utils';
import { transicionarEstadoOT, cambiarEstadoAtencionOT } from '@/components/ot/transicionarEstadoOT';
import { obtenerEstadoPagoOT } from '@/components/ot/obtenerEstadoPagoOT';
import BadgeEstadoPago from '@/components/ot/BadgeEstadoPago';
import { retomarOrdenTrabajo } from '@/components/ot/retomarOrdenTrabajo';

export default function MiDiaTech({ user, userAccount, effectiveOrgId, effectiveRole }) {
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showDetalleOT, setShowDetalleOT] = useState(false);
  const [selectedOT, setSelectedOT] = useState(null);
  const [preDiagnosticoData, setPreDiagnosticoData] = useState(null);
  const [motivoPausa, setMotivoPausa] = useState('interrupcion');
  const [observacionesPausa, setObservacionesPausa] = useState('');
  const [mensajeMotivacion, setMensajeMotivacion] = useState(null);
  const queryClient = useQueryClient();
  
  const [botonesDeshabilitados, setBotonesDeshabilitados] = useState({});
  const [transicionEnCurso, setTransicionEnCurso] = useState(false);
  const [estadosPago, setEstadosPago] = useState({});

  // SOT v1: Mi Día es bandeja de ejecución técnica pura.
  // Estados válidos: ASIGNADA, EN_REVISION, EN_REPARACION, PRUEBAS.
  // DIAGNOSTICADA, APROBADA, FINALIZADA, ENTREGADA, CANCELADA → fuera de Mi Día.
  const { data: ordenes = [] } = useQuery({
    queryKey: ['mis-ordenes', user?.id, effectiveOrgId],
    queryFn: () => base44.entities.OrdenTrabajo.filter({
      organization_id: effectiveOrgId,
      tecnico_asignado_id: user.id,
      estado: { $in: ['ASIGNADA', 'EN_REVISION', 'EN_REPARACION', 'PRUEBAS'] }
    }),
    enabled: !!user?.id && !!effectiveOrgId,
    refetchInterval: 10 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (ordenes.length > 0 && effectiveOrgId) {
      const cargarEstados = async () => {
        const nuevosEstados = {};
        const otsLimitadas = ordenes.slice(0, 10);
        for (const ot of otsLimitadas) {
          try {
            const estado = await obtenerEstadoPagoOT(ot.id, effectiveOrgId);
            nuevosEstados[ot.id] = estado;
          } catch (error) {
            console.error(`Error cargando estado pago OT ${ot.id}:`, error);
          }
        }
        setEstadosPago(nuevosEstados);
      };
      
      const timer = setTimeout(cargarEstados, 300);
      return () => clearTimeout(timer);
    }
  }, [ordenes, effectiveOrgId]);

  const { data: diagnosticos = [] } = useQuery({
    queryKey: ['diagnosticos', effectiveOrgId],
    queryFn: () => base44.entities.DiagnosticoTecnico.filter({
      organization_id: effectiveOrgId
    }),
    enabled: !!effectiveOrgId,
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes', effectiveOrgId],
    queryFn: () => base44.entities.Cliente.filter({
      organization_id: effectiveOrgId
    }),
    enabled: !!effectiveOrgId,
  });

  const { data: equipos = [] } = useQuery({
    queryKey: ['equipos', effectiveOrgId],
    queryFn: () => base44.entities.Equipo.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
  });

  const { data: actividadActiva } = useQuery({
    queryKey: ['actividad_activa', user?.id, effectiveOrgId],
    queryFn: () => base44.entities.ActividadTecnica.filter({
      organization_id: effectiveOrgId,
      tecnico_id: user.id,
      estado: 'en_progreso',
      soft_deleted: false
    }),
    enabled: !!user?.id && !!effectiveOrgId,
    select: (data) => data[0] || null
  });

  const ordenActiva = ordenes.find(o => o.estado_atencion === 'ACTIVO');
  const ordenesPausadas = ordenes
    .filter(o => o.estado_atencion === 'PAUSADO')
    .sort((a, b) => {
      const prioridadOrden = { urgente: 4, high: 3, normal: 2, low: 1 };
      const prioA = prioridadOrden[a.prioridad] || 0;
      const prioB = prioridadOrden[b.prioridad] || 0;
      
      if (prioA !== prioB) return prioB - prioA;
      
      return new Date(a.ultima_actividad_at || a.created_date) - new Date(b.ultima_actividad_at || b.created_date);
    });
  
  const ordenesEsperando = ordenes.filter(o => o.estado_atencion === 'ESPERANDO');

  // OTs ejecutables por el técnico que aún no han sido iniciadas.
  // ASIGNADA sin estado_atencion = pendientes de iniciar revisión.
  // EN_REVISION sin estado_atencion = recuperación del flujo legacy de pago.
  // EN_REPARACION / PRUEBAS sin estado_atencion = regresaron de pausa administrativa.
  const ordenesPorIniciar = ordenes.filter(o => {
    if (o.estado_atencion) return false;
    if (o.estado === 'EN_REVISION') {
      return o.diagnostico_habilitado === true && !!o.revision_venta_id;
    }
    return ['ASIGNADA', 'EN_REPARACION', 'PRUEBAS'].includes(o.estado);
  });

  const tieneDiagnostico = (otId) => {
    return diagnosticos.some(d => d.orden_trabajo_id === otId);
  };

  const diagnosticoListo = (otId) => {
    const diag = diagnosticos.find(d => d.orden_trabajo_id === otId);
    return diag?.estado === 'listo_aprobacion';
  };

  const getClienteName = (clienteId) => {
    const cliente = clientes.find(c => c.id === clienteId);
    return cliente?.nombre_completo || 'Cliente sin identificar';
  };

  const getEquipoInfo = (equipoId) => {
    const equipo = equipos.find(e => e.id === equipoId);
    return equipo ? `${equipo.marca} ${equipo.modelo}` : 'Equipo desconocido';
  };

  const handlePausar = () => {
    if (!ordenActiva) return;
    setShowPauseModal(true);
  };

  const confirmPausar = async () => {
    if (!ordenActiva) return;
    
    try {
      if (actividadActiva) {
        await base44.entities.ActividadTecnica.update(actividadActiva.id, {
          estado: 'finalizada',
          ended_at: new Date().toISOString(),
          duracion_minutos: Math.round(
            (new Date() - new Date(actividadActiva.started_at)) / 60000
          ),
          resultado: 'incompleto',
          notas: `Actividad cerrada por pausa. Motivo: ${motivoPausa}`
        });
      }

      await cambiarEstadoAtencionOT({
        ordenTrabajoId: ordenActiva.id,
        nuevoEstadoAtencion: 'PAUSADO',
        motivoPausa: motivoPausa,
        observaciones: observacionesPausa || 'Trabajo pausado',
        effectiveOrgId: effectiveOrgId,
        userId: user?.id,
        userEmail: user?.email
      });

      queryClient.invalidateQueries({ queryKey: ['mis-ordenes'] });
      queryClient.invalidateQueries({ queryKey: ['actividad_activa'] });
      setShowPauseModal(false);
      setObservacionesPausa('');
    } catch (error) {
      alert('Error al pausar: ' + error.message);
    }
  };

  const handleRetomar = async (orden) => {
    if (botonesDeshabilitados[`retomar_${orden.id}`] || transicionEnCurso) return;
    
    setBotonesDeshabilitados(prev => ({ ...prev, [`retomar_${orden.id}`]: true }));
    setTransicionEnCurso(true);
    
    try {
      if (ordenActiva && ordenActiva.id !== orden.id) {
        if (!confirm('Ya tienes un trabajo activo. ¿Pausar el actual y retomar este?')) {
          setBotonesDeshabilitados(prev => ({ ...prev, [`retomar_${orden.id}`]: false }));
          setTransicionEnCurso(false);
          return;
        }

        if (actividadActiva) {
          await base44.entities.ActividadTecnica.update(actividadActiva.id, {
            estado: 'finalizada',
            ended_at: new Date().toISOString(),
            duracion_minutos: Math.round(
              (new Date() - new Date(actividadActiva.started_at)) / 60000
            ),
            resultado: 'incompleto',
            notas: 'Actividad cerrada por cambio de trabajo'
          });
        }

        await cambiarEstadoAtencionOT({
          ordenTrabajoId: ordenActiva.id,
          nuevoEstadoAtencion: 'PAUSADO',
          motivoPausa: 'interrupcion',
          observaciones: 'Trabajo pausado automáticamente',
          effectiveOrgId: effectiveOrgId,
          userId: user?.id,
          userEmail: user?.email
        });
      }

      await retomarOrdenTrabajo({
        ordenTrabajoId: orden.id,
        organizationId: effectiveOrgId,
        tecnicoId: user.id,
        tecnicoEmail: user.email
      });

      await queryClient.invalidateQueries({ queryKey: ['mis-ordenes'] });
      await queryClient.invalidateQueries({ queryKey: ['actividad_activa'] });
      await queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      await queryClient.invalidateQueries({ queryKey: ['expediente-ot', orden.id] });
      
      setBotonesDeshabilitados(prev => ({ ...prev, [`retomar_${orden.id}`]: false }));
      setTransicionEnCurso(false);
    } catch (error) {
      alert('Error al retomar trabajo: ' + error.message);
      setBotonesDeshabilitados(prev => ({ ...prev, [`retomar_${orden.id}`]: false }));
      setTransicionEnCurso(false);
    }
  };

  const handleIniciarDiagnostico = async (orden) => {
    if (orden.tecnico_asignado_id !== user?.id) {
      alert('No estás asignado a esta orden de trabajo');
      return;
    }

    if (orden.estado !== 'EN_REVISION') {
      alert('Esta orden debe estar en estado EN_REVISION para realizar el diagnóstico');
      return;
    }

    if (!orden.diagnostico_habilitado) {
      if (effectiveRole === 'TECHNICIAN') {
        alert('⏸️ Esta orden requiere pago de diagnóstico.\n\nPor favor, contacta a administración o ventas para procesar el pago.');
        return;
      } else {
        const confirmar = window.confirm(
          '🔒 El diagnóstico debe cobrarse antes de iniciar.\n\n¿Deseas ir al Punto de Venta para cobrar ahora?'
        );
        if (confirmar) {
          window.location.href = createPageUrl('PuntoVenta') + `?ot_id=${orden.id}&concepto=revision_diagnostico`;
        }
        return;
      }
    }
    
    try {
      const preDiag = await base44.entities.PreDiagnostico.filter({
        organization_id: effectiveOrgId,
        orden_trabajo_id: orden.id
      });
      setPreDiagnosticoData(preDiag[0] || null);
    } catch (error) {
      console.error('Error cargando pre-diagnóstico:', error);
      setPreDiagnosticoData(null);
    }
    
    setSelectedOT(orden);
    setShowWizard(true);
  };

  const handleIniciarRevision = async (orden) => {
    if (botonesDeshabilitados[`iniciar_revision_${orden.id}`] || transicionEnCurso) return;
    
    if (!['ASIGNADA', 'EN_REVISION'].includes(orden.estado)) {
      alert('Solo se puede iniciar revisión desde estado ASIGNADA o reconciliar una OT EN_REVISION sin actividad');
      return;
    }

    setBotonesDeshabilitados(prev => ({ ...prev, [`iniciar_revision_${orden.id}`]: true }));
    setTransicionEnCurso(true);

    try {
      const response = await base44.functions.invoke('initTechnicalActivity', {
        orden_trabajo_id: orden.id,
        tecnico_id: user.id,
        tipo_actividad: 'diagnostico',
        subtipo: 'Inicio de revisión técnica',
      });

      if (!response?.data?.success) {
        const codigo = response?.data?.codigo;
        const errorMsg = response?.data?.error || 'Error al iniciar la revisión';

        if (codigo === 'DIAGNOSTICO_NO_HABILITADO') {
          if (effectiveRole === 'TECHNICIAN') {
            alert(`⏸️ ${response?.data?.descripcion_bloqueo || 'Diagnóstico bloqueado'}\n\nContacta a administración o ventas para procesar el pago.`);
          } else {
            const confirmar = window.confirm(
              `🔒 ${response?.data?.descripcion_bloqueo || 'Diagnóstico bloqueado'}\n\n¿Deseas ir al Punto de Venta para procesar el pago?`
            );
            if (confirmar) {
              window.location.href = createPageUrl('PuntoVenta') + `?ot_id=${orden.id}&concepto=revision_diagnostico`;
            }
          }
        } else {
          alert('Error al iniciar revisión: ' + errorMsg);
        }
        setBotonesDeshabilitados(prev => ({ ...prev, [`iniciar_revision_${orden.id}`]: false }));
        setTransicionEnCurso(false);
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ['mis-ordenes'] });
      await queryClient.invalidateQueries({ queryKey: ['actividad_activa'] });
      await queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      await queryClient.invalidateQueries({ queryKey: ['expediente-ot', orden.id] });
      
      setTransicionEnCurso(false);
    } catch (error) {
      alert('Error al iniciar revisión: ' + error.message);
      setBotonesDeshabilitados(prev => ({ ...prev, [`iniciar_revision_${orden.id}`]: false }));
      setTransicionEnCurso(false);
    }
  };

  // Transición genérica para EN_REPARACION → PRUEBAS y PRUEBAS → FINALIZADA
  const handleTransicion = async (orden, nuevoEstado, btnKey) => {
    const key = `${btnKey}_${orden.id}`;
    if (botonesDeshabilitados[key] || transicionEnCurso) return;

    setBotonesDeshabilitados(prev => ({ ...prev, [key]: true }));
    setTransicionEnCurso(true);

    try {
      await transicionarEstadoOT({
        ordenTrabajoId: orden.id,
        nuevoEstado,
        effectiveOrgId,
        userId: user?.id,
        userEmail: user?.email
      });
      await queryClient.invalidateQueries({ queryKey: ['mis-ordenes'] });
      setTransicionEnCurso(false);
    } catch (error) {
      alert('Error al cambiar estado: ' + error.message);
      setBotonesDeshabilitados(prev => ({ ...prev, [key]: false }));
      setTransicionEnCurso(false);
    }
  };

  const handleVerDetalle = (orden) => {
    setSelectedOT(orden);
    setShowDetalleOT(true);
  };

  const mostrarMensajeAgradecimiento = (contexto) => {
    setMensajeMotivacion({ tipo: 'agradecimiento', contexto });
    setTimeout(() => setMensajeMotivacion(null), 8000);
  };

  const motivoPausaLabels = {
    esperando_repuesto: 'Esperando Repuesto',
    esperando_cliente: 'Esperando Cliente',
    interrupcion: 'Interrupción',
    otro: 'Otro'
  };

  useNotificacionesAutomaticas(transicionEnCurso ? null : userAccount);

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-xl flex items-center justify-center">
            <Wrench className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-slate-900">Mi Día</h1>
            <p className="text-slate-600">Gestión de trabajos asignados</p>
          </div>
        </div>
      </div>

      <MensajesMotivacion tipo="diaria" role="TECHNICIAN" />

      {mensajeMotivacion && (
        <MensajesMotivacion tipo={mensajeMotivacion.tipo} contexto={mensajeMotivacion.contexto} />
      )}

      <NotificacionesPanel userAccount={userAccount} />

      {actividadActiva && (
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-purple-200">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Actividad en Curso</h2>
          </div>
          <ActividadActiva 
            actividad={actividadActiva} 
            onUpdated={() => queryClient.invalidateQueries({ queryKey: ['actividad_activa'] })}
          />
        </div>
      )}

      {/* Sección ACTIVO */}
      <div className="mt-8">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-red-200">
          <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-orange-500 rounded-lg flex items-center justify-center relative">
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
            <Play className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Trabajo Activo</h2>
          <Badge variant="outline" className="ml-auto border-red-300 text-red-700">1 máximo</Badge>
        </div>

        {ordenActiva ? (
          <Card className="border-2 border-red-500 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-orange-500 rounded-xl flex items-center justify-center text-white font-bold">
                      <Zap className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-lg">
                        {getClienteName(ordenActiva.cliente_id)} — {getEquipoInfo(ordenActiva.equipo_id)}
                      </h3>
                      <p className="text-sm text-slate-500">
                        {ordenActiva.codigo_ot} • {ordenActiva.motivo_ingreso}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-4">
                    <Badge className="bg-red-100 text-red-700 border-0">
                      {ordenActiva.estado}
                    </Badge>
                    {estadosPago[ordenActiva.id] && (
                      <BadgeEstadoPago status={estadosPago[ordenActiva.id].status} />
                    )}
                    <Badge className={`${
                      ordenActiva.prioridad === 'urgente' ? 'bg-red-100 text-red-700' :
                      ordenActiva.prioridad === 'high' ? 'bg-orange-100 text-orange-700' :
                      'bg-slate-100 text-slate-700'
                    } border-0 capitalize`}>
                      {ordenActiva.prioridad}
                    </Badge>
                  </div>

                  {ordenActiva.ultima_actividad && (
                    <div className="text-sm text-slate-600 mb-4">
                      <p className="font-medium">Última actividad:</p>
                      <p>{ordenActiva.ultima_actividad}</p>
                      <p className="text-xs text-slate-400">
                        {formatDistanceToNow(new Date(ordenActiva.ultima_actividad_at), { addSuffix: true, locale: es })}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  {/* ASIGNADA → Iniciar Revisión (siempre visible — el backend valida bloqueos) */}
                  {ordenActiva.estado === 'ASIGNADA' && (
                    <Button
                      onClick={() => handleIniciarRevision(ordenActiva)}
                      disabled={botonesDeshabilitados[`iniciar_revision_${ordenActiva.id}`] || transicionEnCurso}
                      className="bg-gradient-to-r from-emerald-500 to-blue-500"
                    >
                      {botonesDeshabilitados[`iniciar_revision_${ordenActiva.id}`] ? (
                        <><Clock className="w-4 h-4 mr-2 animate-spin" />Iniciando...</>
                      ) : (
                        <><Play className="w-4 h-4 mr-2" />Iniciar Revisión</>
                      )}
                    </Button>
                  )}

                  {/* Acciones posteriores — requieren pago confirmado */}
                  {estadosPago[ordenActiva.id]?.status === 'PENDIENTE' && effectiveRole === 'TECHNICIAN' ? (
                    ordenActiva.estado !== 'ASIGNADA' && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                        ⏸️ Pendiente de pago — Contacta a administración
                      </div>
                    )
                  ) : (
                    <>
                      {/* EN_REVISION → Registrar Diagnóstico */}
                      {ordenActiva.estado === 'EN_REVISION' && (
                        <Button
                          onClick={() => handleIniciarDiagnostico(ordenActiva)}
                          className="bg-gradient-to-r from-emerald-500 to-blue-500"
                        >
                          <Wrench className="w-4 h-4 mr-2" />
                          {tieneDiagnostico(ordenActiva.id) && !diagnosticoListo(ordenActiva.id)
                            ? 'Continuar Diagnóstico'
                            : diagnosticoListo(ordenActiva.id)
                            ? 'Ver Diagnóstico'
                            : 'Registrar Diagnóstico'}
                        </Button>
                      )}

                      {/* EN_REPARACION → Finalizar Reparación */}
                      {ordenActiva.estado === 'EN_REPARACION' && (
                        <Button
                          onClick={() => handleTransicion(ordenActiva, 'PRUEBAS', 'finalizar_reparacion')}
                          disabled={botonesDeshabilitados[`finalizar_reparacion_${ordenActiva.id}`] || transicionEnCurso}
                          className="bg-gradient-to-r from-blue-500 to-indigo-500"
                        >
                          {botonesDeshabilitados[`finalizar_reparacion_${ordenActiva.id}`] ? (
                            <><Clock className="w-4 h-4 mr-2 animate-spin" />Finalizando...</>
                          ) : (
                            <><CheckCircle className="w-4 h-4 mr-2" />Finalizar Reparación</>
                          )}
                        </Button>
                      )}

                      {/* PRUEBAS → Validar Calidad */}
                      {/* P1: Pendiente implementar Checklist QA antes de habilitar esta transición */}
                      {ordenActiva.estado === 'PRUEBAS' && (
                        <Button
                          onClick={() => handleTransicion(ordenActiva, 'FINALIZADA', 'validar_calidad')}
                          disabled={botonesDeshabilitados[`validar_calidad_${ordenActiva.id}`] || transicionEnCurso}
                          className="bg-gradient-to-r from-purple-500 to-pink-500"
                        >
                          {botonesDeshabilitados[`validar_calidad_${ordenActiva.id}`] ? (
                            <><Clock className="w-4 h-4 mr-2 animate-spin" />Validando...</>
                          ) : (
                            <><CheckCircle className="w-4 h-4 mr-2" />Validar Calidad</>
                          )}
                        </Button>
                      )}
                    </>
                  )}
                  
                  <Button
                    onClick={handlePausar}
                    variant="outline"
                    className="border-orange-500 text-orange-700 hover:bg-orange-50"
                  >
                    <Pause className="w-4 h-4 mr-2" />
                    Pausar
                  </Button>
                  
                  <Button
                    onClick={() => handleVerDetalle(ordenActiva)}
                    variant="ghost"
                    size="sm"
                    className="text-slate-600"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Ver Detalle
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-2 border-dashed border-slate-300">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-slate-500 mb-2">No hay trabajo activo</p>
              <p className="text-sm text-slate-400">Retoma un trabajo pausado para comenzar</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Sección POR INICIAR */}
      <div className="mt-8">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-emerald-200">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center">
            <Play className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Por Iniciar</h2>
          <Badge variant="outline" className="ml-auto border-emerald-300 text-emerald-700 font-semibold">
            {ordenesPorIniciar.length}
          </Badge>
        </div>

        <div className="grid gap-4">
          {ordenesPorIniciar.map((orden) => (
            <Card key={orden.id} className="border-0 shadow-md hover:shadow-xl transition-all ring-1 ring-emerald-200">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center text-white font-bold">
                        <Play className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-lg">
                          {getClienteName(orden.cliente_id)} — {getEquipoInfo(orden.equipo_id)}
                        </h3>
                        <p className="text-sm text-slate-500">
                          {orden.codigo_ot} • {orden.motivo_ingreso}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-3">
                      <Badge className="bg-emerald-100 text-emerald-700 border-0">
                        {orden.estado}
                      </Badge>
                      {estadosPago[orden.id] && (
                        <BadgeEstadoPago status={estadosPago[orden.id].status} />
                      )}
                      <Badge className={`${
                        orden.prioridad === 'urgente' ? 'bg-red-100 text-red-700' :
                        orden.prioridad === 'high' ? 'bg-orange-100 text-orange-700' :
                        'bg-slate-100 text-slate-700'
                      } border-0 capitalize`}>
                        {orden.prioridad}
                      </Badge>
                    </div>

                    {orden.fecha_entrega_estimada && (
                      <p className="text-sm text-slate-500">
                        Entrega estimada: {orden.fecha_entrega_estimada}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    {['ASIGNADA', 'EN_REVISION'].includes(orden.estado) && (
                      <Button
                        onClick={() => handleIniciarRevision(orden)}
                        disabled={botonesDeshabilitados[`iniciar_revision_${orden.id}`] || transicionEnCurso}
                        className="bg-gradient-to-r from-emerald-500 to-teal-500"
                      >
                        {botonesDeshabilitados[`iniciar_revision_${orden.id}`] ? (
                          <><Clock className="w-4 h-4 mr-2 animate-spin" />Iniciando...</>
                        ) : (
                          <><Play className="w-4 h-4 mr-2" />{orden.estado === 'EN_REVISION' ? 'Registrar Inicio' : 'Iniciar Revisión'}</>
                        )}
                      </Button>
                    )}
                    {orden.estado === 'EN_REPARACION' && (
                      <Button
                        onClick={() => handleTransicion(orden, 'PRUEBAS', 'finalizar_reparacion')}
                        disabled={botonesDeshabilitados[`finalizar_reparacion_${orden.id}`] || transicionEnCurso}
                        className="bg-gradient-to-r from-blue-500 to-indigo-500"
                      >
                        {botonesDeshabilitados[`finalizar_reparacion_${orden.id}`] ? (
                          <><Clock className="w-4 h-4 mr-2 animate-spin" />Finalizando...</>
                        ) : (
                          <><CheckCircle className="w-4 h-4 mr-2" />Finalizar Reparación</>
                        )}
                      </Button>
                    )}
                    {orden.estado === 'PRUEBAS' && (
                      <Button
                        onClick={() => handleTransicion(orden, 'FINALIZADA', 'validar_calidad')}
                        disabled={botonesDeshabilitados[`validar_calidad_${orden.id}`] || transicionEnCurso}
                        className="bg-gradient-to-r from-purple-500 to-pink-500"
                      >
                        {botonesDeshabilitados[`validar_calidad_${orden.id}`] ? (
                          <><Clock className="w-4 h-4 mr-2 animate-spin" />Validando...</>
                        ) : (
                          <><CheckCircle className="w-4 h-4 mr-2" />Validar Calidad</>
                        )}
                      </Button>
                    )}
                    <Button
                      onClick={() => handleVerDetalle(orden)}
                      variant="ghost"
                      size="sm"
                      className="text-slate-600"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Ver Detalle
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {ordenesPorIniciar.length === 0 && (
            <Card className="border-0 shadow-md">
              <CardContent className="p-8 text-center">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-400" />
                <p className="text-slate-500">No hay órdenes pendientes de iniciar</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Sección PAUSADOS */}
      <div className="mt-8">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-yellow-200">
          <div className="w-10 h-10 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-lg flex items-center justify-center">
            <Pause className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Trabajos Pausados</h2>
          <Badge variant="outline" className="ml-auto border-yellow-300 text-yellow-700 font-semibold">
            {ordenesPausadas.length}
          </Badge>
        </div>

        <div className="grid gap-4">
          {ordenesPausadas.map((orden, index) => (
            <Card 
              key={orden.id} 
              className={`border-0 shadow-md hover:shadow-xl transition-all ${
                index === 0 ? 'ring-2 ring-yellow-400' : ''
              }`}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {index === 0 && (
                      <Badge className="bg-yellow-100 text-yellow-700 border-0 mb-3">
                        ⭐ Sugerido para retomar
                      </Badge>
                    )}
                    
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-xl flex items-center justify-center text-white font-bold">
                        <Pause className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-lg">
                          {getClienteName(orden.cliente_id)} — {getEquipoInfo(orden.equipo_id)}
                        </h3>
                        <p className="text-sm text-slate-500">
                          {orden.codigo_ot} • {orden.motivo_ingreso}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-3">
                      <Badge className="bg-slate-100 text-slate-700 border-0">
                        {orden.estado}
                      </Badge>
                      {estadosPago[orden.id] && (
                        <BadgeEstadoPago status={estadosPago[orden.id].status} />
                      )}
                      <Badge className={`${
                        orden.prioridad === 'urgente' ? 'bg-red-100 text-red-700' :
                        orden.prioridad === 'high' ? 'bg-orange-100 text-orange-700' :
                        'bg-slate-100 text-slate-700'
                      } border-0 capitalize`}>
                        {orden.prioridad}
                      </Badge>
                      {orden.motivo_pausa && (
                        <Badge variant="outline">
                          {motivoPausaLabels[orden.motivo_pausa]}
                        </Badge>
                      )}
                    </div>

                    {orden.ultima_actividad && (
                      <div className="text-sm text-slate-600">
                        <p className="font-medium">Última actividad:</p>
                        <p>{orden.ultima_actividad}</p>
                        <p className="text-xs text-slate-400">
                          Pausado hace {formatDistanceToNow(new Date(orden.ultima_actividad_at), { locale: es })}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    {estadosPago[orden.id]?.status === 'sin_pago' && effectiveRole === 'TECHNICIAN' ? (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                        ⏸️ Pendiente de pago — Contacta a administración
                      </div>
                    ) : (
                      <>
                        <Button
                          onClick={() => handleRetomar(orden)}
                          disabled={botonesDeshabilitados[`retomar_${orden.id}`] || transicionEnCurso}
                          className="bg-gradient-to-r from-emerald-500 to-blue-500"
                        >
                          {botonesDeshabilitados[`retomar_${orden.id}`] ? (
                            <>
                              <Clock className="w-4 h-4 mr-2 animate-spin" />
                              Retomando...
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4 mr-2" />
                              Retomar
                            </>
                          )}
                        </Button>
                      </>
                    )}
                    
                    <Button
                      onClick={() => handleVerDetalle(orden)}
                      variant="ghost"
                      size="sm"
                      className="text-slate-600"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Ver Detalle
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {ordenesPausadas.length === 0 && (
            <Card className="border-0 shadow-md">
              <CardContent className="p-8 text-center">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-500" />
                <p className="text-slate-500">No hay trabajos pausados</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Sección ESPERANDO */}
      <div className="mt-8">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-blue-200">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
            <Clock className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">En Espera</h2>
          <Badge variant="outline" className="ml-auto border-blue-300 text-blue-700 font-semibold">
            {ordenesEsperando.length}
          </Badge>
        </div>

        <div className="grid gap-4">
          {ordenesEsperando.map((orden) => (
            <Card key={orden.id} className="border-0 shadow-md opacity-75">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center text-white font-bold">
                        <AlertCircle className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-lg">
                          {getClienteName(orden.cliente_id)} — {getEquipoInfo(orden.equipo_id)}
                        </h3>
                        <p className="text-sm text-slate-500">
                          {orden.codigo_ot} • {orden.motivo_ingreso}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-3">
                      <Badge className="bg-blue-100 text-blue-700 border-0">
                        Bloqueado
                      </Badge>
                      {orden.motivo_pausa && (
                        <Badge variant="outline">
                          {motivoPausaLabels[orden.motivo_pausa]}
                        </Badge>
                      )}
                    </div>

                    {orden.ultima_actividad && (
                      <p className="text-sm text-slate-600">{orden.ultima_actividad}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {ordenesEsperando.length === 0 && (
            <Card className="border-0 shadow-md">
              <CardContent className="p-8 text-center">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 text-blue-500" />
                <p className="text-slate-500">No hay trabajos en espera</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Modal Pausar */}
      <Dialog open={showPauseModal} onOpenChange={setShowPauseModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pausar Trabajo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Motivo de la pausa</Label>
              <Select value={motivoPausa} onValueChange={setMotivoPausa}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="esperando_repuesto">Esperando Repuesto</SelectItem>
                  <SelectItem value="esperando_cliente">Esperando Cliente</SelectItem>
                  <SelectItem value="interrupcion">Interrupción</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Observaciones (opcional)</Label>
              <Textarea
                value={observacionesPausa}
                onChange={(e) => setObservacionesPausa(e.target.value)}
                placeholder="Describe el estado actual del trabajo..."
                rows={3}
              />
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button variant="outline" onClick={() => setShowPauseModal(false)}>
                Cancelar
              </Button>
              <Button onClick={confirmPausar} className="bg-orange-500 hover:bg-orange-600">
                Pausar Trabajo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Wizard Diagnóstico Técnico */}
      <Dialog open={showWizard} onOpenChange={setShowWizard}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedOT && (
            <WizardDiagnosticoTecnico
              ordenTrabajo={selectedOT}
              preDiagnostico={preDiagnosticoData}
              effectiveOrgId={effectiveOrgId}
              tecnicoId={user?.id}
              onClose={() => {
                setShowWizard(false);
                setSelectedOT(null);
                setPreDiagnosticoData(null);
              }}
              onComplete={() => {
                setShowWizard(false);
                setSelectedOT(null);
                setPreDiagnosticoData(null);
                queryClient.invalidateQueries({ queryKey: ['mis-ordenes'] });
                mostrarMensajeAgradecimiento('diagnostico');
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Detalle de OT */}
      <Dialog open={showDetalleOT} onOpenChange={setShowDetalleOT}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de Orden de Trabajo</DialogTitle>
          </DialogHeader>
          {selectedOT && (
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="solicitudes">
                  <Package className="w-4 h-4 mr-2" />
                  Solicitudes
                </TabsTrigger>
                <TabsTrigger value="bloqueos">
                  <Shield className="w-4 h-4 mr-2" />
                  Bloqueos
                </TabsTrigger>
                <TabsTrigger value="pruebas">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Pruebas
                </TabsTrigger>
                <TabsTrigger value="notas">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Notas
                </TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-4">
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-6">
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm text-slate-500">Cliente</p>
                        <p className="font-medium text-slate-900">{getClienteName(selectedOT.cliente_id)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Equipo</p>
                        <p className="font-medium text-slate-900">{getEquipoInfo(selectedOT.equipo_id)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Motivo de Ingreso</p>
                        <p className="font-medium text-slate-900">{selectedOT.motivo_ingreso}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Estado</p>
                        <Badge className="bg-blue-100 text-blue-700 border-0">{selectedOT.estado}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="solicitudes">
                <SolicitudesTecnicas
                  ordenTrabajoId={selectedOT.id}
                  tecnicoId={user.id}
                  userAccount={userAccount}
                />
              </TabsContent>

              <TabsContent value="bloqueos">
                <BloqueosTecnicos
                  ordenTrabajoId={selectedOT.id}
                  tecnicoId={user.id}
                  userAccount={userAccount}
                />
              </TabsContent>

              <TabsContent value="pruebas">
                <PruebasTecnicas
                  ordenTrabajoId={selectedOT.id}
                  tecnicoId={user.id}
                  userAccount={userAccount}
                />
              </TabsContent>

              <TabsContent value="notas">
                <NotasInternas
                  ordenTrabajoId={selectedOT.id}
                  user={user}
                  userAccount={userAccount}
                />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
