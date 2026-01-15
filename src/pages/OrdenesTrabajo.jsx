import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Search, FileText, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUserAccount, withOrgId } from '@/components/hooks/useOrgData';
import WizardDiagnostico from '@/components/diagnostico/WizardDiagnostico';
import WizardPreDiagnostico from '@/components/prediagnostico/WizardPreDiagnostico';
import WizardDiagnosticoTecnico from '@/components/diagnostico-tecnico/WizardDiagnosticoTecnico';
import FormularioCotizacion from '@/components/cotizacion/FormularioCotizacion';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import PageGuard from '../components/guards/PageGuard';
import AgendarDesdeOT from '@/components/ot/AgendarDesdeOT';
import { useAuthContext } from '@/components/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import IniciarActividad from '@/components/actividades/IniciarActividad';
import ActividadActiva from '@/components/actividades/ActividadActiva';
import ListaActividades from '@/components/actividades/ListaActividades';
import QuickCreateEquipo from '@/components/ot/QuickCreateEquipo';
import FormularioCliente from '@/components/clientes/FormularioCliente';
import { generarCodigoOT, calcularFechaEntregaEstimada } from '@/components/ot/utils/generarCodigoOT';
import { transicionarEstadoOT } from '@/components/ot/transicionarEstadoOT';
import { Play } from 'lucide-react';
import EntregarOT from '@/components/ot/EntregarOT';

const estadoConfig = {
  EN_COLA_REVISION: { color: 'bg-slate-100 text-slate-700', label: 'En Cola Revisión' },
  ASIGNADA: { color: 'bg-blue-100 text-blue-700', label: 'Asignada' },
  EN_REVISION: { color: 'bg-purple-100 text-purple-700', label: 'En Revisión' },
  DIAGNOSTICADA: { color: 'bg-yellow-100 text-yellow-700', label: 'Diagnosticada' },
  COTIZADA: { color: 'bg-orange-100 text-orange-700', label: 'Cotizada' },
  EN_REPARACION: { color: 'bg-indigo-100 text-indigo-700', label: 'En Reparación' },
  FINALIZADA: { color: 'bg-emerald-100 text-emerald-700', label: 'Finalizada' },
  ENTREGADA: { color: 'bg-green-100 text-green-700', label: 'Entregada' },
  CANCELADA: { color: 'bg-red-100 text-red-700', label: 'Cancelada' },
};

export default function OrdenesTrabajo() {
  return (
    <PageGuard allowedRoles={['SALES', 'ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN', 'AUDITOR']}>
      <OrdenesTrabajoContent />
    </PageGuard>
  );
}

function OrdenesTrabajoContent() {
  const [showModal, setShowModal] = useState(false);
  const [editingOT, setEditingOT] = useState(null);
  const [selectedOT, setSelectedOT] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardOT, setWizardOT] = useState(null);
  const [showPreDiagnostico, setShowPreDiagnostico] = useState(false);
  const [preDiagnosticoOT, setPreDiagnosticoOT] = useState(null);
  const [showDiagnosticoTecnico, setShowDiagnosticoTecnico] = useState(false);
  const [diagnosticoTecnicoOT, setDiagnosticoTecnicoOT] = useState(null);
  const [preDiagnosticoData, setPreDiagnosticoData] = useState(null);
  const [showCotizacion, setShowCotizacion] = useState(false);
  const [cotizacionOT, setCotizacionOT] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todas');
  const [showQuickCreateCliente, setShowQuickCreateCliente] = useState(false);
  const [showQuickCreateEquipo, setShowQuickCreateEquipo] = useState(false);
  const [showInlineEquipo, setShowInlineEquipo] = useState(false);
  const [selectedClienteId, setSelectedClienteId] = useState('');
  const [selectedEquipoId, setSelectedEquipoId] = useState('');
  const [selectedPrioridad, setSelectedPrioridad] = useState('normal');
  const [terminosActivos, setTerminosActivos] = useState(null);
  const [showReasignar, setShowReasignar] = useState(false);
  const [reasignarOT, setReasignarOT] = useState(null);
  const [nuevoTecnicoId, setNuevoTecnicoId] = useState('');
  const [motivoReasignacion, setMotivoReasignacion] = useState('');
  const [newEquipoData, setNewEquipoData] = useState({
    tipo: '',
    marca: '',
    modelo: '',
    serie_ingreso: '',
    accesorios_ingreso: '',
    estado_fisico_ingreso: 'bueno',
    contrasena_ingreso: ''
  });
  const queryClient = useQueryClient();
  const { user, userAccount } = useUserAccount();
  const { effectiveOrgId, effectiveRole } = useAuthContext();
  const navigate = useNavigate();

  const { data: ordenes = [] } = useQuery({
    queryKey: ['ordenes', userAccount?.organization_id],
    queryFn: () => base44.entities.OrdenTrabajo.filter({
      organization_id: userAccount.organization_id
    }),
    enabled: !!userAccount?.organization_id,
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes', userAccount?.organization_id],
    queryFn: () => base44.entities.Cliente.filter({
      organization_id: userAccount.organization_id
    }),
    enabled: !!userAccount?.organization_id,
  });

  const { data: equipos = [] } = useQuery({
    queryKey: ['equipos', userAccount?.organization_id],
    queryFn: () => base44.entities.Equipo.filter({
      organization_id: userAccount.organization_id
    }),
    enabled: !!userAccount?.organization_id,
  });

  const { data: branches = [] } = useQuery({
    queryKey: ['branches', userAccount?.organization_id],
    queryFn: () => base44.entities.Branch.filter({
      organization_id: userAccount.organization_id
    }),
    enabled: !!userAccount?.organization_id,
  });

  const { data: diagnosticos = [] } = useQuery({
    queryKey: ['diagnosticos', userAccount?.organization_id],
    queryFn: () => base44.entities.Diagnostico.filter({
      organization_id: userAccount.organization_id
    }),
    enabled: !!userAccount?.organization_id,
  });

  const { data: ventas = [] } = useQuery({
    queryKey: ['ventas', userAccount?.organization_id],
    queryFn: () => base44.entities.Venta.filter({
      organization_id: userAccount.organization_id
    }),
    enabled: !!userAccount?.organization_id,
  });

  // Query para técnicos (usuarios con rol TECHNICIAN)
  const { data: tecnicos = [] } = useQuery({
    queryKey: ['tecnicos', effectiveOrgId],
    queryFn: async () => {
      const accounts = await base44.entities.UserAccount.filter({
        organization_id: effectiveOrgId,
        active: true
      });
      return accounts.filter(acc => 
        acc.role === 'TECHNICIAN' || acc.role === 'ORG_ADMIN' || acc.role === 'BRANCH_ADMIN'
      );
    },
    enabled: !!effectiveOrgId,
  });

  // Cargar términos activos
  const { data: terminos = [] } = useQuery({
    queryKey: ['terminos', effectiveOrgId],
    queryFn: () => base44.entities.TerminosYCondiciones.filter({
      organization_id: effectiveOrgId,
      activo: true
    }),
    enabled: !!effectiveOrgId,
  });

  useEffect(() => {
    if (terminos.length > 0) {
      setTerminosActivos(terminos[0]);
    }
  }, [terminos]);

  const createMutation = useMutation({
    mutationFn: async (data) => {
      // Generar código OT
      const codigoOT = await generarCodigoOT(base44, effectiveOrgId);
      
      // Calcular fecha entrega estimada
      const fechaEstimada = calcularFechaEntregaEstimada(data.prioridad);
      
      // FASE 1: Auto-asignación en Starter
      const organization = await base44.entities.Organization.get(effectiveOrgId);
      let tecnicoAsignadoId = data.tecnico_asignado_id;
      
      if (organization?.plan === 'Starter' && effectiveRole === 'ORG_ADMIN' && !tecnicoAsignadoId) {
        tecnicoAsignadoId = userAccount.user_id;
      }
      
      return base44.entities.OrdenTrabajo.create(withOrgId({
        ...data,
        codigo_ot: codigoOT,
        fecha_entrega_estimada: fechaEstimada,
        fecha_ingreso: new Date().toISOString(),
        tecnico_asignado_id: tecnicoAsignadoId
      }, userAccount));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      setShowModal(false);
      setEditingOT(null);
      resetForm();
    },
  });

  const resetForm = () => {
    setSelectedClienteId('');
    setSelectedEquipoId('');
    setSelectedPrioridad('normal');
    setShowInlineEquipo(false);
    setNewEquipoData({
      tipo: '',
      marca: '',
      modelo: '',
      serie_ingreso: '',
      accesorios_ingreso: '',
      estado_fisico_ingreso: 'bueno',
      contrasena_ingreso: ''
    });
  };

  // P0.2: Hidratar cliente y equipo al editar
  useEffect(() => {
    if (editingOT && showModal) {
      setSelectedClienteId(editingOT.cliente_id);
      setSelectedEquipoId(editingOT.equipo_id);
      setSelectedPrioridad(editingOT.prioridad || 'normal');
    }
  }, [editingOT, showModal]);

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const ordenAnterior = ordenes.find(o => o.id === id);
      
      // P0.3: Filtrar campo 'estado' si viene en data - debe usar transicionarEstadoOT
      if ('estado' in data) {
        console.warn('P0.3: Intento de cambio directo de estado bloqueado. Use transicionarEstadoOT.');
        delete data.estado;
      }

      // P0.3: Filtrar campo 'estado_atencion' si viene en data - debe usar cambiarEstadoAtencionOT
      if ('estado_atencion' in data) {
        console.warn('P0.3: Intento de cambio directo de estado_atencion bloqueado. Use cambiarEstadoAtencionOT.');
        delete data.estado_atencion;
      }
      
      // P0: Si se cierra/finaliza/entrega, validar actividades abiertas
      const estadosCierre = ['CERRADA', 'FINALIZADA', 'ENTREGADA'];
      const vaCerrar = !estadosCierre.includes(ordenAnterior?.estado) && estadosCierre.includes(data.estado);
      
      if (vaCerrar) {
        // Pre-check actividades
        const actividadesAbiertas = await base44.entities.ActividadTecnica.filter({
          organization_id: effectiveOrgId,
          orden_trabajo_id: id,
          estado: 'en_progreso',
          soft_deleted: false
        });
        
        if (actividadesAbiertas.length > 0) {
          throw new Error(`No se puede cerrar OT: hay ${actividadesAbiertas.length} actividad(es) en progreso`);
        }
      }
      
      // P0.4: Si se cancela, liberar agenda
      const cambioACancelada = ordenAnterior?.estado !== 'CANCELADA' && data.estado === 'CANCELADA';
      
      const result = await base44.entities.OrdenTrabajo.update(id, data);
      
      if (cambioACancelada) {
        // Liberar agenda: cancelar todas las citas futuras de esta OT
        const citasFuturas = await base44.entities.Cita.filter({
          organization_id: effectiveOrgId,
          orden_trabajo_id: id,
        });
        
        const ahora = new Date();
        for (const cita of citasFuturas) {
          if (cita.estado !== 'cancelada' && cita.estado !== 'no_asistio') {
            const fechaCita = new Date(`${cita.fecha}T${cita.hora_inicio || '00:00'}`);
            if (fechaCita > ahora) {
              await base44.entities.Cita.update(cita.id, { estado: 'cancelada' });
            }
          }
        }
        
        // Auditoría
        await base44.entities.SuperAdminAudit.create({
          super_admin_id: user?.id || 'system',
          super_admin_email: user?.email || 'system',
          action: 'ot_cancel_release_calendar',
          target_organization_id: effectiveOrgId,
          context: `OT ${id} cancelada, agenda liberada`,
        });
      }
      
      // Post-check si cerró
      if (vaCerrar) {
        const checkPost = await base44.entities.ActividadTecnica.filter({
          organization_id: effectiveOrgId,
          orden_trabajo_id: id,
          estado: 'en_progreso',
          soft_deleted: false
        });
        
        if (checkPost.length > 0) {
          // Rollback (intentar volver al estado anterior)
          await base44.entities.OrdenTrabajo.update(id, { estado: ordenAnterior?.estado || 'EN_REPARACION' });
          throw new Error('Conflicto detectado: actividad iniciada durante cierre');
        }
      }
      
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      queryClient.invalidateQueries({ queryKey: ['citas'] });
      setShowModal(false);
      setEditingOT(null);
      setSelectedOT(null);
    },
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validar términos configurados
    if (!editingOT && !terminosActivos) {
      alert('No se pueden crear órdenes sin términos configurados');
      return;
    }
    
    const formData = new FormData(e.target);
    let equipoIdFinal = selectedEquipoId;

    // Si se está creando equipo inline, crearlo primero
    if (showInlineEquipo && !selectedEquipoId) {
      try {
        const newEquipo = await base44.entities.Equipo.create({
          organization_id: effectiveOrgId,
          cliente_id: selectedClienteId,
          tipo: newEquipoData.tipo,
          marca: newEquipoData.marca,
          modelo: newEquipoData.modelo || undefined,
          estado_fisico: 'bueno'
        });
        equipoIdFinal = newEquipo.id;
        queryClient.invalidateQueries({ queryKey: ['equipos'] });
      } catch (error) {
        alert('Error al crear el equipo: ' + error.message);
        return;
      }
    }
    
    const data = {
      branch_id: formData.get('branch_id'),
      cliente_id: selectedClienteId,
      equipo_id: equipoIdFinal,
      motivo_ingreso: formData.get('motivo_ingreso'),
      observaciones_ingreso: formData.get('observaciones_ingreso'),
      tipo_ingreso: formData.get('tipo_ingreso') || 'presencial',
      tracking_code: formData.get('tracking_code') || undefined,
      responsable_recepcion: formData.get('responsable_recepcion') || user?.full_name,
      prioridad: selectedPrioridad,
      estado: editingOT ? formData.get('estado') : 'EN_COLA_REVISION',
      created_by_user_id: user?.id,
      // Datos contextuales del equipo
      serie_ingreso: newEquipoData.serie_ingreso || undefined,
      accesorios_ingreso: newEquipoData.accesorios_ingreso || undefined,
      estado_fisico_ingreso: newEquipoData.estado_fisico_ingreso || undefined,
      contrasena_ingreso: newEquipoData.contrasena_ingreso || undefined,
    };

    // Generar token único para nuevas OTs
    if (!editingOT) {
      data.public_access_token = `ot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    if (editingOT) {
      updateMutation.mutate({ id: editingOT.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleCopiarLink = (orden) => {
    const link = `${window.location.origin}${createPageUrl('PortalCliente')}?token=${orden.public_access_token}`;
    navigator.clipboard.writeText(link);
    alert('Link copiado al portapapeles');
  };

  const ordenesFiltradas = ordenes.filter(o => {
    const matchSearch = !searchTerm || 
      o.codigo_ot?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.motivo_ingreso?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.observaciones_ingreso?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchEstado = filtroEstado === 'todas' || o.estado === filtroEstado;
    return matchSearch && matchEstado;
  });

  // Filtrar equipos por cliente seleccionado
  const equiposDelCliente = selectedClienteId 
    ? equipos.filter(e => e.cliente_id === selectedClienteId)
    : [];

  const getClienteName = (clienteId) => {
    const cliente = clientes.find(c => c.id === clienteId);
    return cliente?.nombre_completo || 'Cliente sin identificar';
  };

  const getEquipoInfo = (equipoId) => {
    const equipo = equipos.find(e => e.id === equipoId);
    return equipo ? `${equipo.marca} ${equipo.modelo}` : 'Equipo desconocido';
  };

  const handleReasignar = async () => {
    if (!reasignarOT || !nuevoTecnicoId || !motivoReasignacion.trim()) {
      alert('Debes seleccionar un técnico y especificar el motivo');
      return;
    }

    if (reasignarOT.tecnico_asignado_id === nuevoTecnicoId) {
      alert('El técnico seleccionado ya está asignado a esta OT');
      return;
    }

    try {
      const tecnicoAnteriorId = reasignarOT.tecnico_asignado_id;

      // 1. Cerrar/pausar actividad técnica actual si existe
      if (tecnicoAnteriorId) {
        const actividadesActivas = await base44.entities.ActividadTecnica.filter({
          organization_id: effectiveOrgId,
          orden_trabajo_id: reasignarOT.id,
          tecnico_id: tecnicoAnteriorId,
          estado: 'en_progreso',
          soft_deleted: false
        });

        for (const actividad of actividadesActivas) {
          await base44.entities.ActividadTecnica.update(actividad.id, {
            estado: 'finalizada',
            ended_at: new Date().toISOString(),
            duracion_minutos: Math.round(
              (new Date() - new Date(actividad.started_at)) / 60000
            ),
            resultado: 'incompleto',
            notas: `Actividad cerrada por reasignación administrativa. Motivo: ${motivoReasignacion}`
          });
        }
      }

      // 2. Actualizar OT con nuevo técnico
      await base44.entities.OrdenTrabajo.update(reasignarOT.id, {
        tecnico_asignado_id: nuevoTecnicoId,
        ultima_actividad: `Reasignada administrativamente. Motivo: ${motivoReasignacion}`,
        ultima_actividad_at: new Date().toISOString()
      });

      // 3. Auditoría
      await base44.entities.SuperAdminAudit.create({
        super_admin_id: user?.id || 'system',
        super_admin_email: user?.email || 'system',
        action: 'ot_reasignacion',
        target_organization_id: effectiveOrgId,
        context: `OT ${reasignarOT.codigo_ot} reasignada de técnico ${tecnicoAnteriorId || 'sin asignar'} a ${nuevoTecnicoId}. Motivo: ${motivoReasignacion}`
      });

      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      queryClient.invalidateQueries({ queryKey: ['actividades_tecnicas'] });
      setShowReasignar(false);
      setReasignarOT(null);
      setNuevoTecnicoId('');
      setMotivoReasignacion('');
      alert('OT reasignada correctamente');
    } catch (error) {
      alert('Error al reasignar: ' + error.message);
    }
  };

  const handleCobrarTrabajo = async (orden) => {
    // Verificar que exista diagnóstico completado
    const diagnostico = diagnosticos.find(d => 
      d.orden_trabajo_id === orden.id && 
      d.estado_diagnostico === 'completado'
    );

    if (!diagnostico) {
      alert('No hay diagnóstico completado para esta orden');
      return;
    }

    // Verificar que no exista venta ya
    const ventaExistente = ventas.find(v => v.referencia_ot_id === orden.id);
    if (ventaExistente && ventaExistente.estado === 'pagada') {
      alert('Esta orden ya fue cobrada');
      return;
    }

    // Crear venta en borrador con items del diagnóstico
    const ventaData = withOrgId({
      branch_id: orden.branch_id,
      cliente_id: orden.cliente_id,
      origen_venta: 'taller',
      referencia_ot_id: orden.id,
      referencia_diagnostico_id: diagnostico.id,
      total: diagnostico.propuesta_precio_total || 0,
      subtotal: (diagnostico.propuesta_precio_total || 0) / 1.13,
      impuesto: (diagnostico.propuesta_precio_total || 0) * 0.13 / 1.13,
      estado: 'borrador',
      created_by_user_id: user?.id,
    }, userAccount);

    try {
      const venta = await base44.entities.Venta.create(ventaData);
      
      // Crear items desde propuesta_precio_detalle si existe
      if (diagnostico.propuesta_precio_detalle && Array.isArray(diagnostico.propuesta_precio_detalle)) {
        for (const item of diagnostico.propuesta_precio_detalle) {
          await base44.entities.VentaItem.create(withOrgId({
            venta_id: venta.id,
            tipo: 'servicio', // Asumir servicio por defecto
            referencia_id: null,
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            subtotal: item.subtotal
          }, userAccount));
        }
      }

      // Redirigir al POS con la venta precargada
      navigate(createPageUrl('PuntoVenta'), { 
        state: { 
          venta: {
            ...venta,
            items: diagnostico.propuesta_precio_detalle || []
          }
        } 
      });
    } catch (error) {
      alert('Error al crear venta: ' + error.message);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Órdenes de Trabajo</h1>
          <p className="text-slate-500">Gestión completa de reparaciones</p>
        </div>
        <Button
          onClick={() => { setEditingOT(null); setShowModal(true); }}
          className="bg-gradient-to-r from-emerald-500 to-blue-500 hover:shadow-lg transition-all"
        >
          <Plus className="w-5 h-5 mr-2" />
          Nueva OT
        </Button>
      </div>

      {/* Filtros */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                placeholder="Buscar por código OT, motivo u observaciones..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filtroEstado} onValueChange={setFiltroEstado}>
              <SelectTrigger className="w-full md:w-64">
                <SelectValue placeholder="Filtrar por estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todos los estados</SelectItem>
                {Object.entries(estadoConfig).map(([key, value]) => (
                  <SelectItem key={key} value={key}>{value.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Órdenes */}
      <div className="grid gap-4">
        {ordenesFiltradas.map((orden) => {
          const config = estadoConfig[orden.estado] || estadoConfig.EN_COLA_REVISION;
          
          return (
            <Card 
              key={orden.id} 
              className="border-0 shadow-md hover:shadow-xl transition-all cursor-pointer"
              onClick={() => setSelectedOT(orden)}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-xl flex items-center justify-center text-white font-bold text-xs">
                        OT
                      </div>
                      <div>
                        <p className="text-xs font-mono text-emerald-600 font-bold mb-1">
                          {orden.codigo_ot || 'OT-LEGACY'}
                        </p>
                        <h3 className="font-bold text-slate-900 text-lg">{getClienteName(orden.cliente_id)}</h3>
                        <p className="text-sm text-slate-600 font-medium">
                          {orden.motivo_ingreso}
                        </p>
                        <p className="text-xs text-slate-500">
                          {getEquipoInfo(orden.equipo_id)}
                        </p>
                        <p className="text-xs text-slate-400">
                          Ingreso: {format(new Date(orden.fecha_ingreso || orden.created_date), 'dd MMM yyyy HH:mm', { locale: es })}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge className={`${config.color} border-0`}>
                        {config.label}
                      </Badge>
                      <Badge className={`${
                        orden.prioridad === 'urgente' ? 'bg-red-100 text-red-700' :
                        orden.prioridad === 'high' ? 'bg-orange-100 text-orange-700' :
                        'bg-slate-100 text-slate-700'
                      } border-0 capitalize`}>
                        {orden.prioridad}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {ordenesFiltradas.length === 0 && (
          <Card className="border-0 shadow-lg">
            <CardContent className="p-12 text-center">
              <FileText className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="text-slate-400">No se encontraron órdenes</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Modal Crear OT */}
      <Dialog open={showModal && !selectedOT} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              {editingOT ? 'Editar Orden de Trabajo' : 'Nueva Orden de Trabajo'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6 mt-4">
            {/* Mensaje informativo sobre recepción */}
            <Alert className="bg-blue-50 border-blue-200">
              <AlertCircle className="w-4 h-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                <strong>Recepción de Equipo:</strong> Esta orden registra la recepción del equipo para diagnóstico.
                La aprobación del trabajo se solicitará al cliente después del diagnóstico.
              </AlertDescription>
            </Alert>

            {/* Cliente con Quick Create */}
            <div className="space-y-2">
              <Label htmlFor="cliente_id">Cliente *</Label>
              <div className="flex gap-2">
                <Select 
                  value={selectedClienteId} 
                  onValueChange={(value) => {
                    setSelectedClienteId(value);
                    setSelectedEquipoId('');
                    setShowInlineEquipo(false);
                  }}
                  disabled={!!editingOT}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Seleccionar cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.length === 0 && (
                      <div className="p-2 text-sm text-slate-500">
                        No hay clientes. Crea uno nuevo.
                      </div>
                    )}
                    {clientes.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre_completo} - {c.telefono}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!editingOT && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowQuickCreateCliente(true)}
                    className="shrink-0"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Nuevo
                  </Button>
                )}
              </div>
              {editingOT && (
                <p className="text-xs text-slate-500">
                  Cliente no editable para mantener integridad de datos
                </p>
              )}
            </div>

            {/* Equipo con Inline Create */}
            <div className="space-y-3">
              <Label>Equipo *</Label>
              
              {!showInlineEquipo ? (
                <div className="flex gap-2">
                  <Select 
                    value={selectedEquipoId} 
                    onValueChange={setSelectedEquipoId}
                    disabled={!selectedClienteId || !!editingOT}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={selectedClienteId ? "Seleccionar equipo existente" : "Primero selecciona un cliente"} />
                    </SelectTrigger>
                    <SelectContent>
                      {equiposDelCliente.map(e => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.tipo} - {e.marca} {e.modelo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!editingOT && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowInlineEquipo(true);
                        setSelectedEquipoId('');
                      }}
                      disabled={!selectedClienteId}
                      className="shrink-0"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Nuevo Equipo
                    </Button>
                  )}
                </div>
              ) : (
                <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-emerald-900">Registrar Nuevo Equipo</h4>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowInlineEquipo(false);
                        setNewEquipoData({
                          tipo: '',
                          marca: '',
                          modelo: '',
                          serie_ingreso: '',
                          accesorios_ingreso: '',
                          estado_fisico_ingreso: 'bueno',
                          contrasena_ingreso: ''
                        });
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-sm">Tipo *</Label>
                      <Select 
                        value={newEquipoData.tipo} 
                        onValueChange={(value) => setNewEquipoData({...newEquipoData, tipo: value})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="laptop">Laptop</SelectItem>
                          <SelectItem value="desktop">Desktop</SelectItem>
                          <SelectItem value="tablet">Tablet</SelectItem>
                          <SelectItem value="smartphone">Smartphone</SelectItem>
                          <SelectItem value="impresora">Impresora</SelectItem>
                          <SelectItem value="otro">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm">Marca *</Label>
                      <Input
                        value={newEquipoData.marca}
                        onChange={(e) => setNewEquipoData({...newEquipoData, marca: e.target.value})}
                        placeholder="Ej: Dell, HP"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm">Modelo</Label>
                      <Input
                        value={newEquipoData.modelo}
                        onChange={(e) => setNewEquipoData({...newEquipoData, modelo: e.target.value})}
                        placeholder="Opcional"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm">Serie / IMEI</Label>
                      <Input
                        value={newEquipoData.serie_ingreso}
                        onChange={(e) => setNewEquipoData({...newEquipoData, serie_ingreso: e.target.value})}
                        placeholder="Número de serie"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm">Estado Físico</Label>
                      <Select 
                        value={newEquipoData.estado_fisico_ingreso} 
                        onValueChange={(value) => setNewEquipoData({...newEquipoData, estado_fisico_ingreso: value})}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="excelente">Excelente</SelectItem>
                          <SelectItem value="bueno">Bueno</SelectItem>
                          <SelectItem value="regular">Regular</SelectItem>
                          <SelectItem value="malo">Malo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm">Contraseña / PIN</Label>
                      <Input
                        type="password"
                        value={newEquipoData.contrasena_ingreso}
                        onChange={(e) => setNewEquipoData({...newEquipoData, contrasena_ingreso: e.target.value})}
                        placeholder="Si aplica"
                      />
                    </div>

                    <div className="col-span-2 space-y-2">
                      <Label className="text-sm">Accesorios Entregados</Label>
                      <Textarea
                        value={newEquipoData.accesorios_ingreso}
                        onChange={(e) => setNewEquipoData({...newEquipoData, accesorios_ingreso: e.target.value})}
                        placeholder="Ej: Cargador, funda, audífonos"
                        rows={2}
                      />
                    </div>
                  </div>
                </div>
              )}
              
              {!selectedClienteId && (
                <p className="text-xs text-slate-500">
                  Debes seleccionar un cliente primero
                </p>
              )}
              {editingOT && (
                <p className="text-xs text-slate-500">
                  Equipo no editable para mantener integridad de datos
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="branch_id">Sucursal *</Label>
                <Select name="branch_id" defaultValue={editingOT?.branch_id || userAccount?.branch_id} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar sucursal" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="prioridad">Prioridad *</Label>
                <Select value={selectedPrioridad} onValueChange={setSelectedPrioridad}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baja (+7 días)</SelectItem>
                    <SelectItem value="normal">Normal (+3 días)</SelectItem>
                    <SelectItem value="high">Alta (+1 día)</SelectItem>
                    <SelectItem value="urgente">Urgente (hoy)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipo_ingreso">Tipo de Ingreso *</Label>
                <Select name="tipo_ingreso" defaultValue={editingOT?.tipo_ingreso || 'presencial'}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="presencial">Presencial</SelectItem>
                    <SelectItem value="mensajeria">Mensajería</SelectItem>
                    <SelectItem value="retiro">Retiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tracking_code">Código de Seguimiento</Label>
                <Input
                  id="tracking_code"
                  name="tracking_code"
                  defaultValue={editingOT?.tracking_code}
                  placeholder="Opcional (para mensajería)"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="motivo_ingreso">Motivo de Ingreso *</Label>
              <Textarea
                id="motivo_ingreso"
                name="motivo_ingreso"
                defaultValue={editingOT?.motivo_ingreso}
                placeholder="Describe el motivo principal del ingreso..."
                rows={2}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="observaciones_ingreso">Observaciones Adicionales</Label>
              <Textarea
                id="observaciones_ingreso"
                name="observaciones_ingreso"
                defaultValue={editingOT?.observaciones_ingreso}
                placeholder="Observaciones adicionales, estado del equipo, etc..."
                rows={3}
              />
            </div>

            {editingOT && (
              <div className="space-y-2">
                <Label htmlFor="estado">Estado (solo lectura)</Label>
                <Input 
                  value={estadoConfig[editingOT?.estado]?.label || editingOT?.estado}
                  disabled
                  className="bg-slate-100 cursor-not-allowed"
                />
                <p className="text-xs text-slate-500">
                  Los cambios de estado se gestionan automáticamente según el flujo de trabajo
                </p>
              </div>
            )}

            {/* Términos y Condiciones (solo informativo) */}
            {!editingOT && (
              <div className="space-y-3 border-t border-slate-200 pt-6">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <p className="text-sm text-slate-700 mb-2">
                    Los Términos y Condiciones de la empresa están disponibles para consulta del cliente.
                  </p>
                  {terminosActivos ? (
                    <a 
                      href="#" 
                      onClick={(e) => {
                        e.preventDefault();
                        window.open('about:blank').document.write(
                          `<html><head><title>Términos y Condiciones</title></head><body style="font-family: sans-serif; padding: 20px;"><h1>Términos y Condiciones</h1><p style="white-space: pre-wrap;">${terminosActivos.texto}</p></body></html>`
                        );
                      }}
                      className="text-sm text-blue-600 hover:text-blue-800 underline"
                    >
                      📄 Ver Términos y Condiciones
                    </a>
                  ) : (
                    <Alert className="mt-3">
                      <AlertCircle className="w-4 h-4" />
                      <AlertDescription>
                        {effectiveRole === 'ORG_ADMIN' ? (
                          <div className="space-y-3">
                            <p className="text-sm">
                              Antes de recibir equipos, debes configurar los Términos y Condiciones de tu taller.
                            </p>
                            <Button
                              type="button"
                              onClick={() => {
                                window.location.href = createPageUrl('Settings');
                              }}
                              className="bg-gradient-to-r from-emerald-500 to-blue-500"
                              size="sm"
                            >
                              Configurar Términos y Condiciones
                            </Button>
                          </div>
                        ) : (
                          <p className="text-sm">
                            El sistema aún no tiene Términos y Condiciones configurados.
                            Un administrador debe completar esta configuración para continuar.
                          </p>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-4">
              <Button type="button" variant="outline" onClick={() => {
                setShowModal(false);
                resetForm();
              }}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                className="bg-gradient-to-r from-emerald-500 to-blue-500"
                disabled={!editingOT && (!terminosActivos || !selectedClienteId || (!selectedEquipoId && !showInlineEquipo) || (showInlineEquipo && (!newEquipoData.tipo || !newEquipoData.marca)))}
              >
                {editingOT ? 'Actualizar' : 'Registrar Recepción'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Detalle OT */}
      <Dialog open={!!selectedOT} onOpenChange={() => setSelectedOT(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Detalle de Orden de Trabajo</DialogTitle>
          </DialogHeader>

          {selectedOT && (
            <Tabs defaultValue="general" className="mt-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="actividades">Actividades</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-6">
                {/* Diagnóstico Técnico Listo */}
                {selectedOT.estado === 'DIAGNOSTICADA' && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-emerald-900 mb-1 flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5" />
                          Diagnóstico Técnico Completo
                        </h4>
                        <p className="text-sm text-emerald-700">
                          El diagnóstico técnico está listo para revisión
                        </p>
                      </div>
                      <Button
                        onClick={() => {
                          window.location.href = `/resumen-diagnostico?ot_id=${selectedOT.id}&diagnostico_id=${selectedOT.diagnostico_tecnico_id || 'N/A'}`;
                        }}
                        className="bg-gradient-to-r from-emerald-500 to-blue-500"
                        size="sm"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Ver Diagnóstico Técnico
                      </Button>
                    </div>
                  </div>
                )}

                {/* Pre-Diagnóstico Resumen */}
                {selectedOT.diagnostico_resumido && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-semibold text-blue-900 mb-2">Pre-Diagnóstico de Recepción</h4>
                    <p className="text-sm text-blue-800 whitespace-pre-wrap">
                      {selectedOT.diagnostico_resumido}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl">
                <div>
                  <p className="text-xs text-slate-500">Estado</p>
                  <Badge className={`${estadoConfig[selectedOT.estado]?.color} border-0 mt-1`}>
                    {estadoConfig[selectedOT.estado]?.label}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Prioridad</p>
                  <Badge className={`${
                    selectedOT.prioridad === 'urgente' ? 'bg-red-100 text-red-700' :
                    selectedOT.prioridad === 'high' ? 'bg-orange-100 text-orange-700' :
                    'bg-slate-100 text-slate-700'
                  } border-0 capitalize mt-1`}>
                    {selectedOT.prioridad}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Cliente</p>
                  <p className="font-medium">{getClienteName(selectedOT.cliente_id)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Equipo</p>
                  <p className="font-medium">{getEquipoInfo(selectedOT.equipo_id)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Fecha Ingreso</p>
                  <p className="font-medium">
                    {format(new Date(selectedOT.fecha_ingreso || selectedOT.created_date), 'dd MMM yyyy HH:mm', { locale: es })}
                  </p>
                </div>
                {/* P0.3: PIN visible para técnicos y admins */}
                {selectedOT.contrasena_ingreso && ['TECHNICIAN', 'ORG_ADMIN', 'BRANCH_ADMIN'].includes(effectiveRole) && (
                  <div className="col-span-2">
                    <p className="text-xs text-slate-500">🔒 Contraseña / PIN del Equipo</p>
                    <p className="font-mono font-bold text-emerald-600 text-lg">{selectedOT.contrasena_ingreso}</p>
                    <p className="text-xs text-slate-400 mt-1">Visible solo para personal autorizado</p>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-slate-500">Motivo de Ingreso</Label>
                  <p className="font-medium text-slate-900 mt-1">{selectedOT.motivo_ingreso}</p>
                </div>

                {selectedOT.observaciones_ingreso && (
                  <div>
                    <Label className="text-slate-500">Observaciones</Label>
                    <p className="text-slate-700 mt-1">{selectedOT.observaciones_ingreso}</p>
                  </div>
                )}

                {/* P0.3: Información adicional del equipo en recepción */}
                {(selectedOT.serie_ingreso || selectedOT.accesorios_ingreso || selectedOT.estado_fisico_ingreso) && (
                  <div className="border-t border-slate-200 pt-4">
                    <Label className="text-slate-500 mb-3 block">Información de Recepción</Label>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {selectedOT.serie_ingreso && (
                        <div>
                          <span className="text-slate-500">Serie/IMEI:</span>
                          <p className="font-medium">{selectedOT.serie_ingreso}</p>
                        </div>
                      )}
                      {selectedOT.estado_fisico_ingreso && (
                        <div>
                          <span className="text-slate-500">Estado físico:</span>
                          <p className="font-medium capitalize">{selectedOT.estado_fisico_ingreso}</p>
                        </div>
                      )}
                      {selectedOT.accesorios_ingreso && (
                        <div className="col-span-2">
                          <span className="text-slate-500">Accesorios:</span>
                          <p className="font-medium">{selectedOT.accesorios_ingreso}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-200 flex-wrap">
                <Button variant="outline" onClick={() => setSelectedOT(null)}>
                  Cerrar
                </Button>
                {selectedOT.public_access_token && (
                  <Button 
                    onClick={() => handleCopiarLink(selectedOT)}
                    variant="outline"
                    className="border-blue-500 text-blue-700 hover:bg-blue-50"
                  >
                    📋 Copiar Link Cliente
                  </Button>
                )}

                {/* Reasignar Técnico */}
                {['ORG_ADMIN', 'BRANCH_ADMIN'].includes(effectiveRole) &&
                  ['EN_REVISION', 'DIAGNOSTICADA', 'PAUSADO', 'ESPERANDO'].includes(selectedOT.estado) && (
                  <Button 
                    onClick={() => {
                      setReasignarOT(selectedOT);
                      setNuevoTecnicoId(selectedOT.tecnico_asignado_id || '');
                      setShowReasignar(true);
                    }}
                    variant="outline"
                    className="border-purple-500 text-purple-700 hover:bg-purple-50"
                  >
                    🔄 Reasignar Técnico
                  </Button>
                )}
                
                {/* P0.1: Botón "Iniciar Revisión" para técnicos cuando OT está ASIGNADA */}
                {effectiveRole === 'TECHNICIAN' && 
                  selectedOT.estado === 'ASIGNADA' && 
                  selectedOT.tecnico_asignado_id === user?.id && (
                  <Button 
                    onClick={async () => {
                      try {
                        await transicionarEstadoOT({
                          ordenTrabajoId: selectedOT.id,
                          nuevoEstado: 'EN_REVISION',
                          effectiveOrgId: effectiveOrgId,
                          userId: user?.id,
                          userEmail: user?.email
                        });
                        queryClient.invalidateQueries({ queryKey: ['ordenes'] });
                        setSelectedOT(null);
                        alert('✅ Revisión iniciada correctamente');
                      } catch (error) {
                        alert('Error al iniciar revisión: ' + error.message);
                      }
                    }}
                    className="bg-gradient-to-r from-blue-500 to-indigo-500"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Iniciar Revisión
                  </Button>
                )}

                {/* Pre-Diagnóstico - Solo editable en EN_COLA_REVISION */}
                {['ORG_ADMIN', 'SALES', 'BRANCH_ADMIN'].includes(effectiveRole) && 
                  selectedOT.estado === 'EN_COLA_REVISION' && (
                  <Button 
                    onClick={() => {
                      setPreDiagnosticoOT(selectedOT);
                      setShowPreDiagnostico(true);
                      setSelectedOT(null);
                    }}
                    className="bg-gradient-to-r from-blue-500 to-indigo-500"
                  >
                    📋 Completar Pre-Diagnóstico
                  </Button>
                )}

                {/* Gestionar Cotización */}
                {['ORG_ADMIN', 'SALES', 'BRANCH_ADMIN'].includes(effectiveRole) && 
                  ['DIAGNOSTICADA', 'COTIZADA'].includes(selectedOT.estado) && (
                  <Button 
                    onClick={() => {
                      setCotizacionOT(selectedOT);
                      setShowCotizacion(true);
                      setSelectedOT(null);
                    }}
                    className="bg-gradient-to-r from-emerald-500 to-blue-500"
                  >
                    💰 Gestionar Cotización
                  </Button>
                )}
                
                {/* P0.3: Integrar AgendarDesdeOT */}
                {['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'].includes(effectiveRole) && (
                  <AgendarDesdeOT 
                    ordenTrabajo={selectedOT} 
                    effectiveOrgId={effectiveOrgId}
                    onSuccess={() => {
                      queryClient.invalidateQueries({ queryKey: ['citas'] });
                    }}
                  />
                )}


                {(selectedOT.estado === 'DIAGNOSTICADA' || selectedOT.estado === 'FINALIZADA') && (
                  <Button 
                    onClick={() => handleCobrarTrabajo(selectedOT)}
                    className="bg-gradient-to-r from-green-500 to-emerald-500"
                  >
                    💳 Cobrar Trabajo
                  </Button>
                )}
                
                {/* FASE 4: Entregar OT */}
                {selectedOT.estado === 'FINALIZADA' && (
                  <EntregarOT
                    ordenTrabajo={selectedOT}
                    effectiveOrgId={effectiveOrgId}
                    userId={user?.id}
                    userEmail={user?.email}
                    effectiveRole={effectiveRole}
                    onSuccess={() => {
                      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
                      setSelectedOT(null);
                    }}
                  />
                )}
                
                {selectedOT.estado !== 'ENTREGADA' && (
                  <Button 
                    onClick={() => {
                      setEditingOT(selectedOT);
                      setSelectedOT(null);
                      setShowModal(true);
                    }}
                    className="bg-gradient-to-r from-emerald-500 to-blue-500"
                  >
                    Editar
                  </Button>
                )}
              </div>
              </TabsContent>

              <TabsContent value="actividades" className="space-y-4">
                {effectiveRole === 'TECHNICIAN' && selectedOT.estado !== 'ENTREGADA' && (
                  <div className="mb-4">
                    <IniciarActividad 
                      ordenTrabajoId={selectedOT.id}
                      onSuccess={() => queryClient.invalidateQueries({ queryKey: ['actividades_tecnicas'] })}
                    />
                  </div>
                )}

                <ListaActividades ordenTrabajoId={selectedOT.id} />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Wizard Pre-Diagnóstico */}
      <Dialog open={showPreDiagnostico} onOpenChange={setShowPreDiagnostico}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {preDiagnosticoOT && (
            <WizardPreDiagnostico
              ordenTrabajo={preDiagnosticoOT}
              effectiveOrgId={effectiveOrgId}
              userId={user?.id}
              onClose={() => {
                setShowPreDiagnostico(false);
                setPreDiagnosticoOT(null);
              }}
              onComplete={() => {
                setShowPreDiagnostico(false);
                setPreDiagnosticoOT(null);
                queryClient.invalidateQueries({ queryKey: ['ordenes'] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Wizard Diagnóstico Técnico */}
      <Dialog open={showDiagnosticoTecnico} onOpenChange={setShowDiagnosticoTecnico}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {diagnosticoTecnicoOT && (
            <WizardDiagnosticoTecnico
              ordenTrabajo={diagnosticoTecnicoOT}
              preDiagnostico={preDiagnosticoData}
              effectiveOrgId={effectiveOrgId}
              tecnicoId={user?.id}
              onClose={() => {
                setShowDiagnosticoTecnico(false);
                setDiagnosticoTecnicoOT(null);
                setPreDiagnosticoData(null);
              }}
              onComplete={() => {
                setShowDiagnosticoTecnico(false);
                setDiagnosticoTecnicoOT(null);
                setPreDiagnosticoData(null);
                queryClient.invalidateQueries({ queryKey: ['ordenes'] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Formulario de Cotización */}
      <Dialog open={showCotizacion} onOpenChange={setShowCotizacion}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {cotizacionOT && (
            <FormularioCotizacion
              ordenTrabajo={cotizacionOT}
              efectiveOrgId={effectiveOrgId}
              userId={user?.id}
              userRole={effectiveRole}
              onClose={() => {
                setShowCotizacion(false);
                setCotizacionOT(null);
              }}
              onComplete={() => {
                setShowCotizacion(false);
                setCotizacionOT(null);
                queryClient.invalidateQueries({ queryKey: ['ordenes'] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Wizard Diagnóstico */}
      <Dialog open={showWizard} onOpenChange={setShowWizard}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <WizardDiagnostico
            ordenTrabajo={wizardOT}
            onClose={() => {
              setShowWizard(false);
              setWizardOT(null);
            }}
            onComplete={() => {
              setShowWizard(false);
              setWizardOT(null);
              queryClient.invalidateQueries({ queryKey: ['ordenes'] });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Formulario Canónico de Cliente */}
      <Dialog open={showQuickCreateCliente} onOpenChange={setShowQuickCreateCliente}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Crear Nuevo Cliente</DialogTitle>
          </DialogHeader>
          <FormularioCliente
            efectiveOrgId={effectiveOrgId}
            onGuardar={(newCliente) => {
              // P0.1: Cierre automático y feedback
              setShowQuickCreateCliente(false);
              queryClient.invalidateQueries({ queryKey: ['clientes'] });
              setSelectedClienteId(newCliente.id);
              alert('✅ Cliente creado exitosamente');
            }}
            onCancelar={() => setShowQuickCreateCliente(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Quick Create Equipo (solo para seleccionar equipos ya existentes de otros clientes) */}
      <QuickCreateEquipo
        open={showQuickCreateEquipo}
        onOpenChange={setShowQuickCreateEquipo}
        organizationId={effectiveOrgId}
        clienteId={selectedClienteId}
        onCreated={(newEquipo) => {
          queryClient.invalidateQueries({ queryKey: ['equipos'] });
          setSelectedEquipoId(newEquipo.id);
          setShowInlineEquipo(false);
        }}
      />

      {/* Modal Reasignar Técnico */}
      <Dialog open={showReasignar} onOpenChange={setShowReasignar}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reasignar Técnico</DialogTitle>
          </DialogHeader>

          {reasignarOT && (
            <div className="space-y-4 mt-4">
              <Alert className="bg-orange-50 border-orange-200">
                <AlertCircle className="w-4 h-4 text-orange-600" />
                <AlertDescription className="text-orange-800 text-sm">
                  Esta acción cerrará cualquier actividad técnica en progreso del técnico actual.
                  El nuevo técnico verá la OT en su "Mi Día" y podrá continuar el diagnóstico.
                </AlertDescription>
              </Alert>

              <div className="bg-slate-50 p-3 rounded-lg">
                <p className="text-sm text-slate-600">OT a reasignar:</p>
                <p className="font-bold text-slate-900">{reasignarOT.codigo_ot}</p>
                <p className="text-sm text-slate-700">{reasignarOT.motivo_ingreso}</p>
              </div>

              <div className="space-y-2">
                <Label>Técnico Actual</Label>
                <Input 
                  value={
                    reasignarOT.tecnico_asignado_id 
                      ? tecnicos.find(t => t.user_id === reasignarOT.tecnico_asignado_id)?.user_email || 'No encontrado'
                      : 'Sin asignar'
                  }
                  disabled
                  className="bg-slate-100"
                />
              </div>

              <div className="space-y-2">
                <Label>Nuevo Técnico *</Label>
                <Select value={nuevoTecnicoId} onValueChange={setNuevoTecnicoId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar técnico" />
                  </SelectTrigger>
                  <SelectContent>
                    {tecnicos.map(tec => (
                      <SelectItem key={tec.user_id} value={tec.user_id}>
                        {tec.user_email} ({tec.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Motivo de Reasignación *</Label>
                <Textarea
                  value={motivoReasignacion}
                  onChange={(e) => setMotivoReasignacion(e.target.value)}
                  placeholder="Ej: Carga de trabajo, ausencia, urgencia, especialización..."
                  rows={3}
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setShowReasignar(false);
                    setReasignarOT(null);
                    setNuevoTecnicoId('');
                    setMotivoReasignacion('');
                  }}
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={handleReasignar}
                  className="bg-gradient-to-r from-purple-500 to-blue-500"
                  disabled={!nuevoTecnicoId || !motivoReasignacion.trim()}
                >
                  Confirmar Reasignación
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}