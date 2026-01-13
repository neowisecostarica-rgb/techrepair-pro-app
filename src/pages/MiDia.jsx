import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  ArrowRight,
  Zap,
  Package,
  FileText,
  MessageSquare,
  Shield,
  TrendingUp,
  DollarSign,
  Calendar,
  Phone,
  Users,
  Wrench
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import WizardDiagnosticoTecnico from '@/components/diagnostico-tecnico/WizardDiagnosticoTecnico';
import NotificacionesPanel from '@/components/notificaciones/NotificacionesPanel';
import { useNotificacionesAutomaticas } from '@/components/notificaciones/useNotificacionesAutomaticas';
import { useUserAccount } from '@/components/hooks/useOrgData';
import PageGuard from '@/components/guards/PageGuard';
import SolicitudesTecnicas from '@/components/tecnico/SolicitudesTecnicas';
import BloqueosTecnicos from '@/components/tecnico/BloqueosTecnicos';
import PruebasTecnicas from '@/components/tecnico/PruebasTecnicas';
import NotasInternas from '@/components/tecnico/NotasInternas';
import MensajesMotivacion from '@/components/tecnico/MensajesMotivacion';
import ActividadActiva from '@/components/actividades/ActividadActiva';
import { useAuthContext } from '@/components/contexts/AuthContext';
import { createPageUrl } from '../utils';
import { Link } from 'react-router-dom';

export default function MiDia() {
  return (
    <PageGuard allowedRoles={['ORG_ADMIN', 'TECHNICIAN', 'SALES', 'BRANCH_ADMIN']}>
      <MiDiaContent />
    </PageGuard>
  );
}

function MiDiaContent() {
  const [user, setUser] = useState(null);
  const { userAccount } = useUserAccount();
  const { effectiveRole, effectiveOrgId } = useAuthContext();
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showDetalleOT, setShowDetalleOT] = useState(false);
  const [selectedOT, setSelectedOT] = useState(null);
  const [preDiagnosticoData, setPreDiagnosticoData] = useState(null);
  const [motivoPausa, setMotivoPausa] = useState('interrupcion');
  const [observacionesPausa, setObservacionesPausa] = useState('');
  const [mensajeMotivacion, setMensajeMotivacion] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: ordenes = [] } = useQuery({
    queryKey: ['mis-ordenes', user?.id],
    queryFn: () => base44.entities.OrdenTrabajo.filter({
      tecnico_asignado_id: user.id
    }),
    enabled: !!user?.id,
  });

  // Query para diagnósticos técnicos
  const { data: diagnosticos = [] } = useQuery({
    queryKey: ['diagnosticos', effectiveOrgId],
    queryFn: () => base44.entities.DiagnosticoTecnico.filter({
      organization_id: effectiveOrgId
    }),
    enabled: !!effectiveOrgId,
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => base44.entities.Cliente.list(),
  });

  const { data: equipos = [] } = useQuery({
    queryKey: ['equipos', effectiveOrgId],
    queryFn: () => base44.entities.Equipo.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
  });

  // Queries adicionales para ORG_ADMIN y SALES
  const { data: todasOrdenes = [] } = useQuery({
    queryKey: ['todas-ordenes', effectiveOrgId],
    queryFn: () => base44.entities.OrdenTrabajo.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId && (effectiveRole === 'ORG_ADMIN' || effectiveRole === 'BRANCH_ADMIN'),
  });

  const { data: ventas = [] } = useQuery({
    queryKey: ['ventas', effectiveOrgId],
    queryFn: () => base44.entities.Venta.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId && (effectiveRole === 'ORG_ADMIN' || effectiveRole === 'SALES' || effectiveRole === 'BRANCH_ADMIN'),
  });

  const { data: cotizaciones = [] } = useQuery({
    queryKey: ['cotizaciones', effectiveOrgId],
    queryFn: () => base44.entities.Cotizacion.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId && (effectiveRole === 'ORG_ADMIN' || effectiveRole === 'SALES' || effectiveRole === 'BRANCH_ADMIN'),
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['leads', effectiveOrgId],
    queryFn: () => base44.entities.Lead.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId && (effectiveRole === 'SALES' || effectiveRole === 'ORG_ADMIN' || effectiveRole === 'BRANCH_ADMIN'),
  });

  const { data: citas = [] } = useQuery({
    queryKey: ['citas-hoy', effectiveOrgId],
    queryFn: () => base44.entities.Cita.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
  });

  // Query para actividad en progreso del técnico
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

  const updateOTMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.OrdenTrabajo.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mis-ordenes'] });
      setShowPauseModal(false);
      setObservacionesPausa('');
    },
  });

  const ordenActiva = ordenes.find(o => o.estado_atencion === 'ACTIVO');
  const ordenesPausadas = ordenes
    .filter(o => o.estado_atencion === 'PAUSADO')
    .sort((a, b) => {
      // Ordenar por prioridad DESC, luego por tiempo pausado DESC
      const prioridadOrden = { urgente: 4, high: 3, normal: 2, low: 1 };
      const prioA = prioridadOrden[a.prioridad] || 0;
      const prioB = prioridadOrden[b.prioridad] || 0;
      
      if (prioA !== prioB) return prioB - prioA;
      
      return new Date(a.ultima_actividad_at || a.created_date) - new Date(b.ultima_actividad_at || b.created_date);
    });
  
  const ordenesEsperando = ordenes.filter(o => o.estado_atencion === 'ESPERANDO');

  // Helper: verificar si OT tiene diagnóstico
  const tieneDiagnostico = (otId) => {
    return diagnosticos.some(d => d.orden_trabajo_id === otId);
  };

  // Helper: verificar si diagnóstico está listo
  const diagnosticoListo = (otId) => {
    const diag = diagnosticos.find(d => d.orden_trabajo_id === otId);
    return diag?.estado === 'listo_aprobacion';
  };

  const getClienteName = (clienteId) => {
    const cliente = clientes.find(c => c.id === clienteId);
    return cliente?.nombre_completo || 'Cliente desconocido';
  };

  const getEquipoInfo = (equipoId) => {
    const equipo = equipos.find(e => e.id === equipoId);
    return equipo ? `${equipo.marca} ${equipo.modelo}` : 'Equipo desconocido';
  };

  const handlePausar = () => {
    if (!ordenActiva) return;
    setShowPauseModal(true);
  };

  const confirmPausar = () => {
    if (!ordenActiva) return;
    
    updateOTMutation.mutate({
      id: ordenActiva.id,
      data: {
        estado_atencion: 'PAUSADO',
        motivo_pausa: motivoPausa,
        ultima_actividad: observacionesPausa || 'Trabajo pausado',
        ultima_actividad_at: new Date().toISOString()
      }
    });
  };

  const handleRetomar = (orden) => {
    if (ordenActiva && ordenActiva.id !== orden.id) {
      if (confirm('Ya tienes un trabajo activo. ¿Pausar el actual y retomar este?')) {
        // Pausar actual primero
        updateOTMutation.mutate({
          id: ordenActiva.id,
          data: {
            estado_atencion: 'PAUSADO',
            motivo_pausa: 'interrupcion',
            ultima_actividad: 'Trabajo pausado automáticamente',
            ultima_actividad_at: new Date().toISOString()
          }
        }, {
          onSuccess: () => {
            // Luego activar nuevo
            activarOrden(orden);
          }
        });
      }
    } else {
      activarOrden(orden);
    }
  };

  const activarOrden = (orden) => {
    updateOTMutation.mutate({
      id: orden.id,
      data: {
        estado_atencion: 'ACTIVO',
        ultima_actividad: 'Trabajo retomado',
        ultima_actividad_at: new Date().toISOString()
      }
    });
  };

  const handleIniciarDiagnostico = async (orden) => {
    // Verificar que el usuario está asignado
    if (orden.tecnico_asignado_id !== user?.id) {
      alert('No estás asignado a esta orden de trabajo');
      return;
    }

    // Verificar estado válido
    if (!['EN_REVISION', 'DIAGNOSTICADA'].includes(orden.estado)) {
      alert('Esta orden debe estar en estado EN_REVISION o DIAGNOSTICADA para el diagnóstico');
      return;
    }
    
    // Cargar pre-diagnóstico como contexto (opcional)
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

  const handleVerDetalle = (orden) => {
    setSelectedOT(orden);
    setShowDetalleOT(true);
  };

  const mostrarMensajeAgradecimiento = (contexto) => {
    setMensajeMotivacion({ tipo: 'agradecimiento', contexto });
    setTimeout(() => setMensajeMotivacion(null), 8000);
  };

  const mostrarMensajeProteccion = (contexto) => {
    setMensajeMotivacion({ tipo: 'proteccion', contexto });
    setTimeout(() => setMensajeMotivacion(null), 8000);
  };

  const motivoPausaLabels = {
    esperando_repuesto: 'Esperando Repuesto',
    esperando_cliente: 'Esperando Cliente',
    interrupcion: 'Interrupción',
    otro: 'Otro'
  };

  // Generar notificaciones automáticas
  useNotificacionesAutomaticas(userAccount);

  // Calcular fecha de hoy
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const manana = new Date(hoy);
  manana.setDate(manana.getDate() + 1);

  // Filtros de datos por rol
  const ventasHoy = ventas.filter(v => {
    const fechaVenta = new Date(v.created_date);
    fechaVenta.setHours(0, 0, 0, 0);
    return fechaVenta.getTime() === hoy.getTime();
  });

  const ventasPropias = effectiveRole === 'SALES' 
    ? ventasHoy.filter(v => v.created_by === user?.email)
    : ventasHoy;

  const citasHoy = citas.filter(c => {
    const fechaCita = new Date(c.fecha);
    fechaCita.setHours(0, 0, 0, 0);
    return fechaCita.getTime() === hoy.getTime();
  });

  const citasPropias = citasHoy.filter(c => c.tecnico_asignado_id === user?.id);

  // Prioridades para ORG_ADMIN
  const otsVencidas = todasOrdenes.filter(o => {
    if (!o.fecha_entrega_estimada) return false;
    const fechaEntrega = new Date(o.fecha_entrega_estimada);
    return fechaEntrega < hoy && !['ENTREGADA', 'CANCELADA'].includes(o.estado);
  });

  const cotizacionesPorVencer = cotizaciones
    .filter(c => c.estado === 'enviada' && c.valida_hasta)
    .sort((a, b) => new Date(a.valida_hasta) - new Date(b.valida_hasta))
    .slice(0, 5);

  const ventasSinCobrar = ventas.filter(v => 
    v.estado_pago !== 'pagada' && v.estado_pago !== 'anulada'
  ).slice(0, 5);

  // OTs sin asignar para ORG_ADMIN
  const otsColaRevision = todasOrdenes.filter(o => 
    o.estado === 'EN_COLA_REVISION'
  );

  const otsCriticas = todasOrdenes.filter(o =>
    ['PAUSADO', 'ESPERANDO'].includes(o.estado_atencion) && 
    !['ENTREGADA', 'CANCELADA'].includes(o.estado)
  );

  const otsPropias = todasOrdenes.filter(o => o.tecnico_asignado_id === user?.id);

  // Leads para SALES
  const leadsSeguimiento = leads.filter(l => 
    l.assigned_to === user?.id && 
    ['new', 'contacted', 'qualified'].includes(l.status)
  );

  const cotizacionesPendientesSales = cotizaciones
    .filter(c => c.estado === 'enviada' && c.vendedor_id === user?.id)
    .sort((a, b) => new Date(a.valida_hasta) - new Date(b.valida_hasta));

  // Renderizar según rol
  if (effectiveRole === 'ORG_ADMIN' || effectiveRole === 'BRANCH_ADMIN') {
    return <MiDiaOrgAdmin 
      user={user}
      otsVencidas={otsVencidas}
      cotizacionesPorVencer={cotizacionesPorVencer}
      ventasSinCobrar={ventasSinCobrar}
      otsColaRevision={otsColaRevision}
      otsCriticas={otsCriticas}
      otsPropias={otsPropias}
      ventasHoy={ventasHoy}
      citasHoy={citasHoy}
      clientes={clientes}
      equipos={equipos}
      effectiveRole={effectiveRole}
    />;
  }

  if (effectiveRole === 'SALES') {
    return <MiDiaSales
      user={user}
      leadsSeguimiento={leadsSeguimiento}
      cotizacionesPendientes={cotizacionesPendientesSales}
      ventasPropias={ventasPropias}
      citasPropias={citasPropias}
    />;
  }

  // TECHNICIAN - Vista actual
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

      {/* Mensaje de Motivación Diario */}
      <MensajesMotivacion tipo="diaria" role="TECHNICIAN" />

      {/* Mensajes contextuales (agradecimiento/protección) */}
      {mensajeMotivacion && (
        <MensajesMotivacion tipo={mensajeMotivacion.tipo} contexto={mensajeMotivacion.contexto} />
      )}

      {/* Notificaciones */}
      <NotificacionesPanel userAccount={userAccount} />

      {/* Actividad Actual */}
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
                      <h3 className="font-bold text-slate-900 text-lg">{ordenActiva.motivo_ingreso}</h3>
                      <p className="text-sm text-slate-500">
                        {getClienteName(ordenActiva.cliente_id)} • {getEquipoInfo(ordenActiva.equipo_id)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-4">
                    <Badge className="bg-red-100 text-red-700 border-0">
                      {ordenActiva.estado}
                    </Badge>
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
                  <Button
                    onClick={() => handleVerDetalle(ordenActiva)}
                    className="bg-gradient-to-r from-emerald-500 to-blue-500"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Ver Detalle
                  </Button>
                  {(ordenActiva.estado === 'EN_REVISION' || ordenActiva.estado === 'DIAGNOSTICADA') && (
                    <Button
                      onClick={() => handleIniciarDiagnostico(ordenActiva)}
                      className="bg-gradient-to-r from-purple-500 to-blue-500"
                    >
                      <Wrench className="w-4 h-4 mr-2" />
                      {tieneDiagnostico(ordenActiva.id) && !diagnosticoListo(ordenActiva.id)
                        ? 'Continuar Diagnóstico'
                        : diagnosticoListo(ordenActiva.id)
                        ? 'Ver Diagnóstico'
                        : 'Realizar Diagnóstico'}
                    </Button>
                  )}
                  <Button
                    onClick={handlePausar}
                    variant="outline"
                    className="border-orange-500 text-orange-700 hover:bg-orange-50"
                  >
                    <Pause className="w-4 h-4 mr-2" />
                    Pausar
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
                        <h3 className="font-bold text-slate-900 text-lg">{orden.motivo_ingreso}</h3>
                        <p className="text-sm text-slate-500">
                          {getClienteName(orden.cliente_id)} • {getEquipoInfo(orden.equipo_id)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-3">
                      <Badge className="bg-slate-100 text-slate-700 border-0">
                        {orden.estado}
                      </Badge>
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
                    <Button
                      onClick={() => handleVerDetalle(orden)}
                      variant="outline"
                      size="sm"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Ver Detalle
                    </Button>
                    {(orden.estado === 'EN_REVISION' || orden.estado === 'DIAGNOSTICADA') && (
                      <Button
                        onClick={() => handleIniciarDiagnostico(orden)}
                        variant="outline"
                        size="sm"
                        className="border-purple-500 text-purple-700 hover:bg-purple-50"
                      >
                        <Wrench className="w-4 h-4 mr-2" />
                        {tieneDiagnostico(orden.id) && !diagnosticoListo(orden.id)
                          ? 'Continuar Diagnóstico'
                          : diagnosticoListo(orden.id)
                          ? 'Ver Diagnóstico'
                          : 'Realizar Diagnóstico'}
                      </Button>
                    )}
                    <Button
                      onClick={() => handleRetomar(orden)}
                      className="bg-gradient-to-r from-emerald-500 to-blue-500"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Retomar
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
                        <h3 className="font-bold text-slate-900 text-lg">{orden.motivo_ingreso}</h3>
                        <p className="text-sm text-slate-500">
                          {getClienteName(orden.cliente_id)} • {getEquipoInfo(orden.equipo_id)}
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

// =====================================================
// COMPONENTE: Mi Día ORG_ADMIN
// =====================================================
function MiDiaOrgAdmin({ 
  user, 
  otsVencidas, 
  cotizacionesPorVencer, 
  ventasSinCobrar,
  otsColaRevision,
  otsCriticas,
  otsPropias,
  ventasHoy,
  citasHoy,
  clientes,
  equipos,
  effectiveRole
}) {
  const getClienteName = (clienteId) => {
    const cliente = clientes.find(c => c.id === clienteId);
    return cliente?.nombre_completo || 'Cliente desconocido';
  };

  const getEquipoInfo = (equipoId) => {
    const equipo = equipos.find(e => e.id === equipoId);
    return equipo ? `${equipo.marca} ${equipo.modelo}` : 'Equipo desconocido';
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-slate-900">Mi Día</h1>
            <p className="text-slate-600">Vista operativa del día</p>
          </div>
        </div>
      </div>

      {/* Mensaje de Motivación Diario */}
      <MensajesMotivacion tipo="diaria" role={effectiveRole} />

      {/* 🚨 Prioridades del Día */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-red-200">
          <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-pink-500 rounded-lg flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Prioridades del Día</h2>
        </div>
      <Card className="border-2 border-red-200 bg-red-50/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-red-800">
            Atención Urgente Requerida
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {otsVencidas.length === 0 && cotizacionesPorVencer.length === 0 && ventasSinCobrar.length === 0 ? (
            <p className="text-sm text-slate-500">✅ No hay prioridades urgentes</p>
          ) : (
            <>
              {otsVencidas.slice(0, 3).map(ot => (
                <Link key={ot.id} to={createPageUrl('OrdenesTrabajo')}>
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 text-red-500" />
                      <div>
                        <p className="font-medium text-slate-900">{ot.codigo_ot}</p>
                        <p className="text-sm text-slate-500">{getClienteName(ot.cliente_id)} - Vencida</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline">Ver OT</Button>
                  </div>
                </Link>
              ))}

              {cotizacionesPorVencer.slice(0, 2).map(cot => (
                <Link key={cot.id} to={createPageUrl('OrdenesTrabajo')}>
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-orange-500" />
                      <div>
                        <p className="font-medium text-slate-900">Cotización pendiente</p>
                        <p className="text-sm text-slate-500">
                          Vence: {cot.valida_hasta ? format(new Date(cot.valida_hasta), 'dd/MM/yyyy') : 'N/A'}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline">Seguimiento</Button>
                  </div>
                </Link>
              ))}
            </>
          )}
        </CardContent>
      </Card>
      </div>

      {/* 🛠 Taller Hoy */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-emerald-200">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-lg flex items-center justify-center">
            <Wrench className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Taller Hoy</h2>
        </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-slate-800">
            Operaciones Activas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {otsColaRevision.length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Cola de Revisión ({otsColaRevision.length})</p>
              <div className="space-y-2">
                {otsColaRevision.slice(0, 3).map(ot => (
                  <Link key={ot.id} to={createPageUrl('ColaRevision')}>
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
                      <div>
                        <p className="font-medium text-slate-900">{ot.codigo_ot}</p>
                        <p className="text-sm text-slate-500">{getClienteName(ot.cliente_id)}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {otsCriticas.length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">OTs Críticas ({otsCriticas.length})</p>
              <div className="space-y-2">
                {otsCriticas.slice(0, 3).map(ot => (
                  <Link key={ot.id} to={createPageUrl('OrdenesTrabajo')}>
                    <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg hover:bg-yellow-100 transition-colors cursor-pointer">
                      <div>
                        <p className="font-medium text-slate-900">{ot.codigo_ot}</p>
                        <p className="text-sm text-slate-500">{ot.estado_atencion}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {otsPropias.length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Mis OTs ({otsPropias.length})</p>
              <div className="space-y-2">
                {otsPropias.slice(0, 3).map(ot => (
                  <Link key={ot.id} to={createPageUrl('OrdenesTrabajo')}>
                    <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer">
                      <div>
                        <p className="font-medium text-slate-900">{ot.codigo_ot}</p>
                        <p className="text-sm text-slate-500">{getClienteName(ot.cliente_id)}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {otsColaRevision.length === 0 && otsCriticas.length === 0 && otsPropias.length === 0 && (
            <p className="text-sm text-slate-500">No hay OTs pendientes</p>
          )}
        </CardContent>
      </Card>
      </div>

      {/* 💰 Ventas Hoy */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-green-200">
          <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-500 rounded-lg flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Ventas Hoy</h2>
        </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-slate-800">
            Registro de Ventas del Día
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ventasHoy.length > 0 ? (
            <div className="space-y-2">
              {ventasHoy.slice(0, 5).map(venta => (
                <Link key={venta.id} to={createPageUrl('PuntoVenta')}>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
                    <div>
                      <p className="font-medium text-slate-900">
                        ${venta.total?.toFixed(2) || '0.00'}
                      </p>
                      <p className="text-sm text-slate-500">
                        {format(new Date(venta.created_date), 'HH:mm')}
                      </p>
                    </div>
                    <Badge variant={venta.estado_pago === 'pagada' ? 'default' : 'outline'}>
                      {venta.estado_pago}
                    </Badge>
                  </div>
                </Link>
              ))}
              <Link to={createPageUrl('PuntoVenta')}>
                <Button variant="outline" className="w-full mt-2">
                  Ir a Punto de Venta
                </Button>
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No hay ventas registradas hoy</p>
          )}
        </CardContent>
      </Card>
      </div>

      {/* 📅 Agenda Hoy */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-blue-200">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
            <Calendar className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Agenda Hoy</h2>
        </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-slate-800">
            Citas y Eventos Programados
          </CardTitle>
        </CardHeader>
        <CardContent>
          {citasHoy.length > 0 ? (
            <div className="space-y-2">
              {citasHoy.slice(0, 5).map(cita => (
                <div key={cita.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-900">{cita.motivo || cita.tipo}</p>
                    <p className="text-sm text-slate-500">
                      {cita.hora_inicio} - {cita.hora_fin}
                    </p>
                  </div>
                  <Badge>{cita.estado}</Badge>
                </div>
              ))}
              <Link to={createPageUrl('Agenda')}>
                <Button variant="outline" className="w-full mt-2">
                  Ver Agenda Completa
                </Button>
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No hay citas programadas hoy</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================
// COMPONENTE: Mi Día SALES
// =====================================================
function MiDiaSales({ user, leadsSeguimiento, cotizacionesPendientes, ventasPropias, citasPropias }) {
  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-slate-900">Mi Día</h1>
            <p className="text-slate-600">Seguimiento y cierres</p>
          </div>
        </div>
      </div>

      {/* Mensaje de Motivación Diario */}
      <MensajesMotivacion tipo="diaria" role="SALES" />

      {/* 📞 Seguimientos CRM */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-blue-200">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
            <Phone className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Seguimientos CRM</h2>
        </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-slate-800">
            Leads Pendientes de Contacto
          </CardTitle>
        </CardHeader>
        <CardContent>
          {leadsSeguimiento.length > 0 ? (
            <div className="space-y-2">
              {leadsSeguimiento.slice(0, 5).map(lead => (
                <Link key={lead.id} to={createPageUrl('CRM')}>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
                    <div>
                      <p className="font-medium text-slate-900">{lead.name}</p>
                      <p className="text-sm text-slate-500">{lead.phone}</p>
                    </div>
                    <Badge>{lead.status}</Badge>
                  </div>
                </Link>
              ))}
              <Link to={createPageUrl('CRM')}>
                <Button variant="outline" className="w-full mt-2">
                  Abrir CRM
                </Button>
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No hay leads pendientes de seguimiento</p>
          )}
        </CardContent>
      </Card>
      </div>

      {/* 🧾 Cotizaciones Pendientes */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-orange-200">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg flex items-center justify-center">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Cotizaciones Pendientes</h2>
        </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-slate-800">
            Propuestas en Espera de Respuesta
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cotizacionesPendientes.length > 0 ? (
            <div className="space-y-2">
              {cotizacionesPendientes.slice(0, 5).map(cot => (
                <Link key={cot.id} to={createPageUrl('OrdenesTrabajo')}>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">
                    <div>
                      <p className="font-medium text-slate-900">
                        ${cot.total?.toFixed(2) || '0.00'}
                      </p>
                      <p className="text-sm text-slate-500">
                        Vence: {cot.valida_hasta ? format(new Date(cot.valida_hasta), 'dd/MM/yyyy') : 'N/A'}
                      </p>
                    </div>
                    <Button size="sm" variant="outline">Dar Seguimiento</Button>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No hay cotizaciones pendientes</p>
          )}
        </CardContent>
      </Card>
      </div>

      {/* 💵 Ventas del Día */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-emerald-200">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-green-500 rounded-lg flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Mis Ventas del Día</h2>
        </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-slate-800">
            Registro de Ventas Personales
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ventasPropias.length > 0 ? (
            <div className="space-y-2">
              {ventasPropias.map(venta => (
                <div key={venta.id} className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-900">
                      ${venta.total?.toFixed(2) || '0.00'}
                    </p>
                    <p className="text-sm text-slate-500">
                      {format(new Date(venta.created_date), 'HH:mm')}
                    </p>
                  </div>
                  <Badge variant={venta.estado_pago === 'pagada' ? 'default' : 'outline'}>
                    {venta.estado_pago}
                  </Badge>
                </div>
              ))}
              <Link to={createPageUrl('PuntoVenta')}>
                <Button variant="outline" className="w-full mt-2">
                  Ir a Punto de Venta
                </Button>
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No hay ventas registradas hoy</p>
          )}
        </CardContent>
      </Card>
      </div>

      {/* 📅 Agenda Comercial */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b-2 border-purple-200">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
            <Calendar className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Mi Agenda Hoy</h2>
        </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-slate-800">
            Reuniones y Visitas Programadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {citasPropias.length > 0 ? (
            <div className="space-y-2">
              {citasPropias.map(cita => (
                <div key={cita.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-900">{cita.motivo || cita.tipo}</p>
                    <p className="text-sm text-slate-500">
                      {cita.hora_inicio} - {cita.hora_fin}
                    </p>
                  </div>
                  <Badge>{cita.estado}</Badge>
                </div>
              ))}
              <Link to={createPageUrl('Agenda')}>
                <Button variant="outline" className="w-full mt-2">
                  Ver Agenda Completa
                </Button>
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No hay citas programadas hoy</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}