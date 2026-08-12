import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { listIdentityAccounts } from '@/api/identity';
import {
  getSmartIntakeByWorkOrder,
  invalidateSmartIntake,
  smartIntakeQueryKeys,
} from '@/api/smartIntake';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Search, FileText, AlertCircle, CheckCircle2, Loader2, User, ExternalLink, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUserAccount } from '@/components/hooks/useOrgData';

import WizardDiagnostico from '@/components/diagnostico/WizardDiagnostico';
import WizardPreDiagnostico from '@/components/prediagnostico/WizardPreDiagnostico';
import WizardDiagnosticoTecnico from '@/components/diagnostico-tecnico/WizardDiagnosticoTecnico';
import FormularioCotizacion from '@/components/cotizacion/FormularioCotizacion';
import { useNavigate, Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import PageGuard from '../components/guards/PageGuard';
import AgendarDesdeOT from '@/components/ot/AgendarDesdeOT';
import { useAuthContext } from '@/components/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import IniciarActividad from '@/components/actividades/IniciarActividad';
import ListaActividades from '@/components/actividades/ListaActividades';
import QuickCreateEquipo from '@/components/ot/QuickCreateEquipo';
import ClienteSearchInput from '@/components/ot/ClienteSearchInput';
import QuickCreateClienteModal from '@/components/ot/QuickCreateClienteModal';
import MotivoIngresoInput from '@/components/ot/MotivoIngresoInput';
import EntregarOT from '@/components/ot/EntregarOT';
import BadgeEstadoPago from '@/components/ot/BadgeEstadoPago';
import { crearOrdenTrabajo } from '@/components/ot/crearOrdenTrabajo';
import KanbanBoard from '@/components/kanban/KanbanBoard';
import OTOperationalLayer from '@/components/ot/OTOperationalLayer';
import DiagnosticoDocumentoA4 from '@/components/diagnostico/DiagnosticoDocumentoA4';

import { WORK_ORDER_STATUSES } from '@/config/workOrderStatus';
const estadoConfig = WORK_ORDER_STATUSES;

export default function OrdenesTrabajo() {
  return (
    <PageGuard allowedRoles={['SALES', 'ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN', 'AUDITOR']}>
      <OrdenesTrabajoContent />
    </PageGuard>
  );
}

function OrdenesTrabajoContent() {
  // TECHNICIAN accede en modo consulta — sin redirección

  const [showModal, setShowModal] = useState(false);
  const [editingOT, setEditingOT] = useState(null);
  const [selectedOT, setSelectedOT] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardOT, setWizardOT] = useState(null);
  const [showPreDiagnostico, setShowPreDiagnostico] = useState(false);
  const [preDiagnosticoOT, setPreDiagnosticoOT] = useState(null);
  const [showDiagnosticoTecnico, setShowDiagnosticoTecnico] = useState(false);
  const [diagnosticoTecnicoOT, setDiagnosticoTecnicoOT] = useState(null);
  const [smartIntakeData, setSmartIntakeData] = useState(null);
  const [showCotizacion, setShowCotizacion] = useState(false);
  const [cotizacionOT, setCotizacionOT] = useState(null);
  const [vistaActiva, setVistaActiva] = useState('lista');
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todas');
  const [motivoIngreso, setMotivoIngreso] = useState('');
  const [showQuickCreateCliente, setShowQuickCreateCliente] = useState(false);
  const [showQuickCreateEquipo, setShowQuickCreateEquipo] = useState(false);
  const [showInlineEquipo, setShowInlineEquipo] = useState(false);
  const [selectedClienteId, setSelectedClienteId] = useState('');
  const [selectedEquipoId, setSelectedEquipoId] = useState('');
  const [selectedPrioridad, setSelectedPrioridad] = useState('normal');
  const [terminosActivos, setTerminosActivos] = useState(null);
  const [receptionError, setReceptionError] = useState(null);
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
  const { toast } = useToast();
  const receptionCorrelationRef = useRef(null);
  const receptionSubmitInFlightRef = useRef(false);
  
  // P0.1: Cache de estados de pago
  const [estadosPago, setEstadosPago] = useState({});

  // Normalizadores SOT: mantienen la UI histórica intacta aunque el backend use nombres canónicos en inglés.
  const normalizarCliente = (cliente) => ({
    ...cliente,
    nombre_completo: cliente.nombre_completo || cliente.full_name || cliente.name || 'Cliente sin nombre',
    telefono: cliente.telefono || cliente.phone || '',
  });

  const normalizarEquipo = (equipo) => ({
    ...equipo,
    cliente_id: equipo.cliente_id || equipo.client_id,
    tipo: equipo.tipo || equipo.type || '',
    marca: equipo.marca || equipo.brand || '',
    modelo: equipo.modelo || equipo.model || '',
    serie_ingreso: equipo.serie_ingreso || equipo.serial_number || '',
  });

  const normalizarOrden = (orden) => ({
    ...orden,
    cliente_id: orden.cliente_id || orden.client_id,
    equipo_id: orden.equipo_id || orden.equipment_id,
    motivo_ingreso: orden.motivo_ingreso || orden.intake_notes || '',
    observaciones_ingreso: orden.observaciones_ingreso || orden.notes || '',
    estado: orden.estado || orden.status || 'EN_COLA_REVISION',
    prioridad: orden.prioridad || orden.priority || 'normal',
    fecha_ingreso: orden.fecha_ingreso || orden.created_at || orden.created_date,
    created_date: orden.created_date || orden.created_at,
  });

  const { data: ordenes = [], isLoading: isLoadingOrdenes } = useQuery({
    queryKey: ['ordenes', effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const response = await base44.functions.invoke('listWorkOrders', {});
      return (response.data || []).map(normalizarOrden);
    },
    enabled: !!effectiveOrgId,
    staleTime: 30 * 1000,
    refetchInterval: 10 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  // Mantener el modal abierto sincronizado con la fuente remota. Antes el
  // detalle conservaba una copia vieja de la OT después de asignar o cobrar.
  useEffect(() => {
    if (!selectedOT?.id) return;
    const ordenActualizada = ordenes.find(o => o.id === selectedOT.id);
    if (ordenActualizada) {
      setSelectedOT(ordenActualizada);
    }
  }, [ordenes, selectedOT?.id]);

  // P0.4: Se eliminó el loop de carga de estados de pago (N queries secuenciales).
  // Los badges de pago en vista lista son opcionales — se pueden recuperar bajo demanda desde el detalle.

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes', effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const data = await base44.entities.Cliente.filter({ organization_id: effectiveOrgId });
      return (data || []).map(normalizarCliente);
    },
    enabled: !!effectiveOrgId,
    staleTime: 2 * 60 * 1000, // P0.4: 2 min
  });

  const { data: equipos = [] } = useQuery({
    queryKey: ['equipos', effectiveOrgId],
    queryFn: async () => {
      if (!effectiveOrgId) return [];
      const data = await base44.entities.Equipo.filter({ organization_id: effectiveOrgId });
      return (data || []).map(normalizarEquipo);
    },
    enabled: !!effectiveOrgId,
    staleTime: 2 * 60 * 1000, // P0.4: 2 min
  });

  // branches y tecnicos aún desde base44 (no migrados)
  const { data: branches = [] } = useQuery({
    queryKey: ['branches', effectiveOrgId],
    queryFn: () => base44.entities.Branch.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
  });

  // P0.4: eliminadas queries de diagnosticos y ventas — no se usan en esta vista, causaban slowdown

  // P0.2-A: workforce técnico REAL — solo TECHNICIAN es asignable como técnico de OT
  const { data: tecnicos = [] } = useQuery({
    queryKey: ['tecnicos', effectiveOrgId],
    queryFn: async () => {
      const { accounts } = await listIdentityAccounts(effectiveOrgId);
      return accounts.filter(account => account.role === 'TECHNICIAN' && account.status === 'active');
    },
    enabled: !!effectiveOrgId,
  });

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

  // DCE-001A: única ruta canónica de lectura para Smart Intake.
  const { data: smartIntakeResult } = useQuery({
    queryKey: smartIntakeQueryKeys.byWorkOrder(selectedOT?.id),
    queryFn: () => getSmartIntakeByWorkOrder(selectedOT.id),
    enabled: !!selectedOT?.id && selectedOT?.estado === 'EN_COLA_REVISION',
    staleTime: 0,
  });
  const preDiagSelectedOT = smartIntakeResult?.intake || null;

  const [guardandoOT, setGuardandoOT] = useState(false);

  const createMutation = useMutation({
    mutationFn: async (data) => {
      return crearOrdenTrabajo(data);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['ordenes', effectiveOrgId] });
      queryClient.invalidateQueries({ queryKey: ['listWorkOrders'] });
      queryClient.invalidateQueries({ queryKey: ['equipos', effectiveOrgId] });
      setShowModal(false);
      resetForm();
      setGuardandoOT(false);
      receptionSubmitInFlightRef.current = false;
      toast({
        title: result?.idempotent ? 'Recepción recuperada' : 'Orden de trabajo creada',
        description: 'La recepción del equipo fue registrada correctamente.',
      });
      if (result?.navigate_to) navigate(result.navigate_to);
    },
    onError: (error) => {
      setGuardandoOT(false);
      receptionSubmitInFlightRef.current = false;
      const payload = error?.data || error?.response?.data || {};
      const msg = payload.message || error?.message || 'No se pudo registrar la recepción.';
      const structuredError = {
        message: msg,
        code: payload.code || error?.code || 'RECEPTION_UNKNOWN_ERROR',
        correlationId: payload.correlation_id || receptionCorrelationRef.current,
      };
      setReceptionError(structuredError);
      toast({ variant: 'destructive', title: 'Error al crear la orden', description: msg });
    },
  });

  const resetForm = () => {
    setSelectedClienteId('');
    setSelectedEquipoId('');
    setSelectedPrioridad('normal');
    setMotivoIngreso('');
    setShowInlineEquipo(false);
    setReceptionError(null);
    receptionCorrelationRef.current = null;
    receptionSubmitInFlightRef.current = false;
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

  // P0.2: Hidratar cliente, equipo y motivo al editar
  useEffect(() => {
    if (editingOT && showModal) {
      setSelectedClienteId(editingOT.cliente_id);
      setSelectedEquipoId(editingOT.equipo_id);
      setSelectedPrioridad(editingOT.prioridad || 'normal');
      setMotivoIngreso(editingOT.motivo_ingreso || '');
    }
  }, [editingOT, showModal]);

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      // Solo actualizar campos editables — estado y organization_id son inmutables desde aquí
      await base44.entities.OrdenTrabajo.update(id, {
        motivo_ingreso: data.motivo_ingreso,
        observaciones_ingreso: data.observaciones_ingreso,
        tipo_ingreso: data.tipo_ingreso,
        prioridad: data.prioridad,
      });
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes', effectiveOrgId] });
      setShowModal(false);
      setEditingOT(null);
      setSelectedOT(null);
      toast({ title: '✅ Orden de trabajo actualizada correctamente' });
    },
    onError: (error) => {
      console.error('Error actualizando OT:', error);
      toast({ variant: 'destructive', title: 'Error al actualizar la orden', description: error.message });
    },
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validar términos configurados
    if (!editingOT && !terminosActivos) {
      toast({ variant: 'destructive', title: 'No se pueden crear órdenes sin términos configurados' });
      return;
    }

    if (!editingOT && receptionSubmitInFlightRef.current) return;

    // Activar indicador de carga inmediatamente para el flujo de creación (Recepción)
    if (!editingOT) {
      receptionSubmitInFlightRef.current = true;
      setGuardandoOT(true);
      setReceptionError(null);
    }

    const formData = new FormData(e.target);
    const correlationId = receptionCorrelationRef.current || crypto.randomUUID();
    receptionCorrelationRef.current = correlationId;
    
    const data = {
      branch_id: formData.get('branch_id'),
      cliente_id: selectedClienteId,
      equipment_mode: selectedEquipoId ? 'existing' : 'create',
      equipo_id: selectedEquipoId || undefined,
      equipment: selectedEquipoId ? undefined : {
        tipo: newEquipoData.tipo,
        marca: newEquipoData.marca,
        modelo: newEquipoData.modelo || undefined,
        serie: newEquipoData.serie_ingreso || undefined,
        estado_fisico: newEquipoData.estado_fisico_ingreso || undefined,
      },
      correlation_id: correlationId,
      terms_id: terminosActivos?.id,
      motivo_ingreso: motivoIngreso || formData.get('motivo_ingreso'),
      observaciones_ingreso: formData.get('observaciones_ingreso'),
      tipo_ingreso: formData.get('tipo_ingreso') || 'presencial',
      tracking_code: formData.get('tracking_code') || undefined,
      responsable_recepcion: formData.get('responsable_recepcion') || user?.full_name,
      prioridad: selectedPrioridad,
      created_by_user_id: user?.id,
      // Datos contextuales del equipo
      serie_ingreso: newEquipoData.serie_ingreso || undefined,
      accesorios_ingreso: newEquipoData.accesorios_ingreso || undefined,
      estado_fisico_ingreso: newEquipoData.estado_fisico_ingreso || undefined,
      contrasena_ingreso: newEquipoData.contrasena_ingreso || undefined,
    };

    if (editingOT) {
      if (!motivoIngreso.trim()) {
        toast({ variant: 'destructive', title: 'El motivo de ingreso es obligatorio' });
        return;
      }
      data.motivo_ingreso = motivoIngreso.trim();
      updateMutation.mutate({ id: editingOT.id, data });
    } else {
      setGuardandoOT(true);
      createMutation.mutate(data);
    }
  };

  const handleCopiarLink = async (orden) => {
    const response = await base44.functions.invoke('issuePublicDocumentToken', {
      type: 'work_order',
      resource_id: orden.id,
      correlation_id: crypto.randomUUID(),
    });
    const token = response?.data?.token;
    if (!token) throw new Error(response?.data?.error || 'No se pudo emitir el enlace publico');
    const baseUrl = window.location.origin;
    const link = `${baseUrl}${createPageUrl('PortalCliente')}?token=${token}`;
    navigator.clipboard.writeText(link);
    toast({ title: 'Link copiado al portapapeles' });
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

  // P0.2-A: helper para mostrar nombre del técnico asignado desde workforce oficial
  const getTecnicoName = (tecnicoId) => {
    if (!tecnicoId) return 'Sin asignar';
    const tec = tecnicos.find(t => t.user_id === tecnicoId);
    return tec ? (tec.user_email?.split('@')[0] || tec.user_email) : 'Técnico no encontrado';
  };

  const getClienteName = (clienteId) => {
    const cliente = clientes.find(c => c.id === clienteId);
    return cliente?.nombre_completo || cliente?.full_name || cliente?.name || 'Cliente sin identificar';
  };

  const getEquipoInfo = (equipoId) => {
    const equipo = equipos.find(e => e.id === equipoId);
    if (!equipo) return 'Equipo desconocido';
    return `${equipo.marca || equipo.brand || ''} ${equipo.modelo || equipo.model || ''}`.trim() || 'Equipo sin identificar';
  };

  const [reasignando, setReasignando] = useState(false);

  // P0.2-E: Estado para visualización de diagnóstico
  const [showPreviewDiagnostico, setShowPreviewDiagnostico] = useState(false);
  const [diagnosticoPreviewData, setDiagnosticoPreviewData] = useState(null);
  const [loadingDiagnosticoPreview, setLoadingDiagnosticoPreview] = useState(false);

  const handleVerDiagnostico = async (ot) => {
    setLoadingDiagnosticoPreview(true);
    const [diagResults, clienteResults, equipoResults, tecnicoResults] = await Promise.all([
      base44.entities.DiagnosticoTecnico.filter({ organization_id: ot.organization_id, orden_trabajo_id: ot.id, bloqueado: false }),
      base44.entities.Cliente.filter({ id: ot.cliente_id }),
      base44.entities.Equipo.filter({ id: ot.equipo_id }),
      listIdentityAccounts(ot.organization_id).then(({ accounts }) =>
        accounts.filter(account => account.user_id === ot.tecnico_asignado_id)
      ),
    ]);
    setDiagnosticoPreviewData({
      diagnostico: diagResults[0] || null,
      cliente: clienteResults[0] || null,
      equipo: equipoResults[0] || null,
      tecnico: tecnicoResults[0] || null,
      ordenTrabajo: ot,
    });
    setLoadingDiagnosticoPreview(false);
    setShowPreviewDiagnostico(true);
  };

  const handleReasignar = async () => {
    if (!reasignarOT || !nuevoTecnicoId) {
      toast({ variant: 'destructive', title: 'Completa todos los campos requeridos' });
      return;
    }

    setReasignando(true);
    try {
      const tecnico = tecnicos.find(t => t.user_id === nuevoTecnicoId);
      const res = await base44.functions.invoke('reassignWorkOrderTechnician', {
        orden_trabajo_id: reasignarOT.id,
        tecnico_asignado_id: nuevoTecnicoId,
        tecnico_asignado_email: tecnico?.user_email || '',
        motivo: motivoReasignacion.trim() || null,
      });

      if (!res?.data?.success) {
        throw new Error(res?.data?.error || 'La reasignación no fue confirmada por el servidor');
      }

      const otActualizada = normalizarOrden({
        ...reasignarOT,
        ...(res.data.updated_ot || {}),
        tecnico_asignado_id: nuevoTecnicoId,
        tecnico_asignado_email: tecnico?.user_email || '',
        estado: res.data.estado_actual || reasignarOT.estado,
      });

      // Actualización optimista del modal + refresco de todas las bandejas que
      // consumen la OT. Así el usuario no tiene que cerrar y volver a entrar.
      setSelectedOT(current => current?.id === reasignarOT.id ? otActualizada : current);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ordenes', effectiveOrgId] }),
        queryClient.invalidateQueries({ queryKey: ['mis-ordenes'] }),
        queryClient.invalidateQueries({ queryKey: ['todas-ordenes', effectiveOrgId] }),
        queryClient.invalidateQueries({ queryKey: ['expediente-ot', reasignarOT.id] }),
      ]);

      setShowReasignar(false);
      setReasignarOT(null);
      setNuevoTecnicoId('');
      setMotivoReasignacion('');
      toast({ title: '✅ Técnico reasignado correctamente', duration: 3000 });
    } catch (error) {
      console.error('Error reasignando técnico:', error);
      const msg = error?.response?.data?.error || error?.backendMessage || error?.message || 'Error desconocido';
      toast({ variant: 'destructive', title: 'Error al reasignar técnico', description: msg, duration: 4000 });
    } finally {
      setReasignando(false);
    }
  };

  const handleCobrarTrabajo = async (orden) => {
    navigate(`${createPageUrl('PuntoVenta')}?ot_id=${orden.id}&concepto=reparacion`);
  };

  const handleCobrarDiagnostico = (orden) => {
    navigate(`${createPageUrl('PuntoVenta')}?ot_id=${orden.id}&concepto=revision_diagnostico`);
  };

  const handleIniciarRevision = async (orden) => {
    try {
      const response = await base44.functions.invoke('initTechnicalActivity', {
        orden_trabajo_id: orden.id,
        tecnico_id: orden.tecnico_asignado_id || user?.id,
        tipo_actividad: 'diagnostico',
        subtipo: 'Inicio de revisión técnica',
      });

      if (!response?.data?.success) {
        throw new Error(response?.data?.error || 'No se pudo iniciar la revisión');
      }

      setSelectedOT(current => current?.id === orden.id ? {
        ...current,
        estado: response.data.estado_ot || 'EN_REVISION',
        estado_atencion: response.data.estado_atencion || 'ACTIVO',
      } : current);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ordenes', effectiveOrgId] }),
        queryClient.invalidateQueries({ queryKey: ['mis-ordenes'] }),
        queryClient.invalidateQueries({ queryKey: ['todas-ordenes', effectiveOrgId] }),
        queryClient.invalidateQueries({ queryKey: ['expediente-ot', orden.id] }),
        queryClient.invalidateQueries({ queryKey: ['actividades_tecnicas'] }),
      ]);
      toast({ title: 'Revisión iniciada', description: 'La actividad técnica quedó registrada y la OT está en revisión.' });
    } catch (error) {
      const msg = error?.response?.data?.error || error?.backendMessage || error?.message || 'Error desconocido';
      toast({ variant: 'destructive', title: 'No se pudo iniciar la revisión', description: msg });
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
        <div className="flex gap-2">
          <Button
            variant={vistaActiva === 'lista' ? 'default' : 'outline'}
            onClick={() => setVistaActiva('lista')}
            size="sm"
          >
            Lista
          </Button>
          <Button
            variant={vistaActiva === 'kanban' ? 'default' : 'outline'}
            onClick={() => setVistaActiva('kanban')}
            size="sm"
          >
            Kanban
          </Button>
          {effectiveRole !== 'TECHNICIAN' && (
            <Button
              onClick={() => { setEditingOT(null); resetForm(); setShowModal(true); }}
              className="bg-gradient-to-r from-emerald-500 to-blue-500 hover:shadow-lg transition-all"
            >
              <Plus className="w-5 h-5 mr-2" />
              Nueva OT
            </Button>
          )}
        </div>
      </div>

      {/* Vista Kanban */}
      {vistaActiva === 'kanban' && (
        <KanbanBoard onCardClick={(ot) => setSelectedOT(ot)} />
      )}

      {/* Vista Lista */}
      {vistaActiva === 'lista' && <Tabs defaultValue="todas" className="w-full"><>

      {/* Tabs de navegación */}
      <TabsList className="mb-2">
        <TabsTrigger value="todas">Todas las OTs</TabsTrigger>
        <TabsTrigger value="pendiente-cliente">
          Pendiente Cliente
          {ordenes.filter(o => o.estado === 'DIAGNOSTICADA').length > 0 && (
            <span className="ml-2 bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
              {ordenes.filter(o => o.estado === 'DIAGNOSTICADA').length}
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="todas">

      {/* Loading spinner */}
      {isLoadingOrdenes && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mr-3" />
          <span className="text-slate-500">Cargando órdenes...</span>
        </div>
      )}

      {/* Filtros */}
      {!isLoadingOrdenes && <Card className="border-0 shadow-lg">
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
        </Card>}

        {/* Lista de Órdenes */}
        {!isLoadingOrdenes && <div className="space-y-4">
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

                    <div className="flex flex-wrap gap-2 items-center">
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
                      {estadosPago[orden.id] && (
                        <BadgeEstadoPago status={estadosPago[orden.id].status} />
                      )}
                      <span className="flex items-center gap-1 text-xs text-slate-500 ml-1">
                        <User className="w-3 h-3" />
                        {getTecnicoName(orden.tecnico_asignado_id)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                      onClick={(e) => { e.stopPropagation(); setSelectedOT(orden); }}
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      Ver detalle
                    </Button>
                    <Link
                      to={`/expediente/${orden.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Ir a expediente
                    </Link>
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
      </div>}

      </TabsContent>

      {/* ── TAB: PENDIENTE CLIENTE ── */}
      <TabsContent value="pendiente-cliente">
        {isLoadingOrdenes && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mr-3" />
            <span className="text-slate-500">Cargando órdenes...</span>
          </div>
        )}
        {!isLoadingOrdenes && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-2 text-amber-800 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                Estas órdenes tienen diagnóstico técnico completo y están esperando decisión del cliente (aprobación o rechazo).
              </span>
            </div>

            {ordenes.filter(o => o.estado === 'DIAGNOSTICADA').map((orden) => {
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
                            <p className="text-sm text-slate-600 font-medium">{orden.motivo_ingreso}</p>
                            <p className="text-xs text-slate-500">{getEquipoInfo(orden.equipo_id)}</p>
                            <p className="text-xs text-slate-400">
                              Ingreso: {format(new Date(orden.fecha_ingreso || orden.created_date), 'dd MMM yyyy HH:mm', { locale: es })}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                          <Badge className={`${config.color} border-0`}>{config.label}</Badge>
                          <Badge className={`${
                            orden.prioridad === 'urgente' ? 'bg-red-100 text-red-700' :
                            orden.prioridad === 'high' ? 'bg-orange-100 text-orange-700' :
                            'bg-slate-100 text-slate-700'
                          } border-0 capitalize`}>
                            {orden.prioridad}
                          </Badge>
                          <span className="flex items-center gap-1 text-xs text-slate-500 ml-1">
                            <User className="w-3 h-3" />
                            {getTecnicoName(orden.tecnico_asignado_id)}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2.5 text-xs"
                          onClick={(e) => { e.stopPropagation(); setSelectedOT(orden); }}
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          Ver detalle
                        </Button>
                        <Link
                          to={`/expediente/${orden.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Ir a expediente
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {ordenes.filter(o => o.estado === 'DIAGNOSTICADA').length === 0 && (
              <Card className="border-0 shadow-lg">
                <CardContent className="p-12 text-center">
                  <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-emerald-300" />
                  <p className="text-slate-400">No hay órdenes esperando decisión del cliente</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </TabsContent>

      </></Tabs>}{/* fin vistaActiva lista */}

      {/* Modal Crear OT */}
      <Dialog
        open={showModal && !selectedOT}
        onOpenChange={(open) => {
          if (!open && (guardandoOT || createMutation.isPending)) return;
          setShowModal(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              {editingOT ? 'Editar Orden de Trabajo' : 'Nueva Orden de Trabajo'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6 mt-4">
            {receptionError && !editingOT && (
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  <p className="font-medium">{receptionError.message}</p>
                  <p className="mt-1 text-xs">
                    Referencia: {receptionError.correlationId || receptionError.code}
                  </p>
                </AlertDescription>
              </Alert>
            )}
            {/* Mensaje informativo sobre recepción */}
            <Alert className="bg-blue-50 border-blue-200">
              <AlertCircle className="w-4 h-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                <strong>Recepción de Equipo:</strong> Esta orden registra la recepción del equipo para diagnóstico.
                La aprobación del trabajo se solicitará al cliente después del diagnóstico.
              </AlertDescription>
            </Alert>

            {/* Cliente con búsqueda + Quick Create */}
            <div className="space-y-2">
              <Label>Cliente *</Label>
              {!editingOT ? (
                <ClienteSearchInput
                  clientes={clientes}
                  selectedClienteId={selectedClienteId}
                  onSelectCliente={(id) => {
                    setSelectedClienteId(id);
                    setSelectedEquipoId('');
                    setShowInlineEquipo(false);
                  }}
                  onRequestCreate={() => setShowQuickCreateCliente(true)}
                />
              ) : (
                <>
                  <Input value={getClienteName(selectedClienteId)} disabled className="bg-slate-100" />
                  <p className="text-xs text-slate-500">Cliente no editable para mantener integridad de datos</p>
                </>
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
                        type="text"
                        value={newEquipoData.contrasena_ingreso}
                        onChange={(e) => setNewEquipoData({...newEquipoData, contrasena_ingreso: e.target.value})}
                        placeholder="Si aplica"
                      />
                      <p className="text-xs text-slate-500">
                        El PIN se muestra sin enmascarar para validación rápida
                      </p>
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
              <Label>Motivo de Ingreso *</Label>
              <MotivoIngresoInput
                value={motivoIngreso}
                onChange={setMotivoIngreso}
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
              <Button type="button" variant="outline" disabled={guardandoOT || createMutation.isPending} onClick={() => {
                setShowModal(false);
                resetForm();
              }}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                className="bg-gradient-to-r from-emerald-500 to-blue-500"
                disabled={guardandoOT || createMutation.isPending || (!editingOT && (!terminosActivos || !selectedClienteId || (!selectedEquipoId && !showInlineEquipo) || (showInlineEquipo && (!newEquipoData.tipo || !newEquipoData.marca)) || !motivoIngreso))}
              >
                {(guardandoOT || createMutation.isPending) ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Guardando...</>
                ) : (
                  editingOT ? 'Actualizar' : 'Registrar Recepción'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Detalle OT */}
      <Dialog open={!!selectedOT} onOpenChange={() => setSelectedOT(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3 pr-8">
              <DialogTitle className="text-2xl font-bold">Detalle de Orden de Trabajo</DialogTitle>
              {selectedOT && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-xs h-7 px-2.5"
                  onClick={() => { setSelectedOT(null); navigate(`/expediente/${selectedOT.id}`); }}
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Abrir Expediente
                </Button>
              )}
            </div>
          </DialogHeader>

          {selectedOT && selectedOT.organization_id !== effectiveOrgId ? (
            <div className="p-8 text-center">
              <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-500" />
              <h3 className="font-bold text-xl text-slate-900 mb-2">Acceso Denegado</h3>
              <p className="text-slate-600">No tienes permisos para ver esta orden de trabajo.</p>
              <Button onClick={() => setSelectedOT(null)} className="mt-4" variant="outline">
                Cerrar
              </Button>
            </div>
          ) : selectedOT && (
            <Tabs defaultValue="general" className="mt-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="actividades">Actividades</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-4">

                {/* ── BLOQUE 1: SIGUIENTE ACCIÓN (P0.2-B.1) ─────────────────── */}
                {(() => {
                  // Determinar la acción principal según estado y rol — sin lógica nueva
                  const s = selectedOT.estado;
                  const esTecnicoPropio = effectiveRole === 'TECHNICIAN' && selectedOT.tecnico_asignado_id === user?.id;
                  const esAdmin = ['ORG_ADMIN', 'BRANCH_ADMIN'].includes(effectiveRole);
                  const esAdminOVentas = ['ORG_ADMIN', 'SALES', 'BRANCH_ADMIN'].includes(effectiveRole);
                  const noTecnico = effectiveRole !== 'TECHNICIAN';

                  let accion = null;

                  if (s === 'ASIGNADA' && !selectedOT.diagnostico_habilitado && esAdminOVentas) {
                    accion = {
                      label: 'Cobrar Diagnóstico',
                      desc: 'El técnico ya está asignado. Registra el cobro de revisión para habilitar el trabajo técnico.',
                      color: 'from-amber-500 to-orange-500',
                      icon: '💳',
                      handler: () => handleCobrarDiagnostico(selectedOT)
                    };
                  } else if (s === 'ASIGNADA' && selectedOT.diagnostico_habilitado && (esTecnicoPropio || esAdmin)) {
                    accion = {
                      label: 'Iniciar Revisión',
                      desc: esAdmin
                        ? 'El diagnóstico está pagado. Inicia la revisión en nombre del técnico asignado.'
                        : 'El equipo está asignado y listo para comenzar la revisión técnica.',
                      color: 'from-blue-500 to-indigo-500',
                      icon: '▶',
                      handler: () => handleIniciarRevision(selectedOT)
                    };
                  } else if (
                    s === 'EN_REVISION'
                    && !selectedOT.estado_atencion
                    && selectedOT.diagnostico_habilitado === true
                    && !!selectedOT.revision_venta_id
                    && (esTecnicoPropio || esAdmin)
                  ) {
                    accion = {
                      label: 'Registrar Inicio Técnico',
                      desc: 'La OT está en revisión sin una actividad auditada. Registra el inicio antes de continuar.',
                      color: 'from-emerald-500 to-blue-500',
                      icon: '▶',
                      handler: () => handleIniciarRevision(selectedOT)
                    };
                  } else if (s === 'EN_REVISION' && (esTecnicoPropio || esAdmin)) {
                    accion = {
                      label: 'Iniciar Diagnóstico Técnico',
                      desc: 'La revisión está en curso. Iniciar el diagnóstico técnico detallado.',
                      color: 'from-purple-500 to-blue-500',
                      icon: '🔬',
                      handler: () => { setDiagnosticoTecnicoOT(selectedOT); setShowDiagnosticoTecnico(true); setSelectedOT(null); }
                    };
                  } else if (s === 'EN_COLA_REVISION' && esAdminOVentas) {
                    // RC2-GOLD-FIX-01: fuente única — useQuery preDiagSelectedOT
                    const preDiagObj = preDiagSelectedOT || null;
                    const tienePreDiag = !!preDiagSelectedOT;

                    let preDiagLabel, preDiagDesc, preDiagIcon;
                    if (!tienePreDiag) {
                      preDiagLabel = 'Completar Pre-Diagnóstico';
                      preDiagDesc = 'Registrar la información inicial del problema antes de asignar al técnico.';
                      preDiagIcon = '📋';
                    } else if (preDiagObj?.isDraft) {
                      preDiagLabel = 'Continuar Pre-Diagnóstico';
                      preDiagDesc = 'Pre-diagnóstico iniciado. Continuar completando la información.';
                      preDiagIcon = '📝';
                    } else {
                      preDiagLabel = 'Editar Pre-Diagnóstico';
                      preDiagDesc = 'Pre-diagnóstico registrado. Puedes editarlo o continuar con la asignación al técnico.';
                      preDiagIcon = '✏️';
                    }
                    accion = {
                      label: preDiagLabel,
                      desc: preDiagDesc,
                      color: 'from-blue-500 to-indigo-500',
                      icon: preDiagIcon,
                      handler: () => { setPreDiagnosticoOT(selectedOT); setShowPreDiagnostico(true); setSelectedOT(null); }
                    };
                  } else if ((s === 'DIAGNOSTICADA' || s === 'COTIZADA') && esAdminOVentas) {
                    accion = {
                      label: 'Gestionar Cotización',
                      desc: 'El diagnóstico está listo. Crear o revisar la cotización para el cliente.',
                      color: 'from-emerald-500 to-blue-500',
                      icon: '💰',
                      handler: () => { setCotizacionOT(selectedOT); setShowCotizacion(true); setSelectedOT(null); }
                    };
                  } else if ((s === 'DIAGNOSTICADA' || s === 'FINALIZADA') && noTecnico) {
                    accion = {
                      label: 'Cobrar Trabajo',
                      desc: 'La reparación está lista. Proceder al cobro en el punto de venta.',
                      color: 'from-green-500 to-emerald-500',
                      icon: '💳',
                      handler: () => handleCobrarTrabajo(selectedOT)
                    };
                  } else if (s === 'FINALIZADA') {
                    accion = {
                      label: 'Entregar Equipo',
                      desc: 'El trabajo está finalizado y pagado. Proceder a la entrega al cliente.',
                      color: 'from-emerald-500 to-teal-500',
                      icon: '📦',
                      isEntregarOT: true
                    };
                  } else if (['ENTREGADA', 'CANCELADA'].includes(s)) {
                    accion = null; // OT cerrada — no hay siguiente acción
                  }

                  if (!accion) return null;

                  return (
                    <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-xl p-4 text-white">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Siguiente Acción</p>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white text-sm leading-snug">{accion.desc}</p>
                        </div>
                        {accion.isEntregarOT ? (
                          <EntregarOT
                            ordenTrabajo={selectedOT}
                            effectiveOrgId={effectiveOrgId}
                            userId={user?.id}
                            userEmail={user?.email}
                            effectiveRole={effectiveRole}
                            onSuccess={() => {
                              queryClient.invalidateQueries({ queryKey: ['ordenes', effectiveOrgId] });
                              setSelectedOT(null);
                            }}
                          />
                        ) : (
                          <Button
                            onClick={accion.handler}
                            className={`bg-gradient-to-r ${accion.color} shrink-0 font-semibold shadow-lg`}
                          >
                            <span className="mr-2">{accion.icon}</span>
                            {accion.label}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* ── BLOQUE 2: DIAGNÓSTICO TÉCNICO COMPLETADO ──────────────── */}
                {selectedOT.estado === 'DIAGNOSTICADA' && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-emerald-900 mb-1 flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5" />
                          Diagnóstico Técnico Completo
                        </h4>
                        <p className="text-sm text-emerald-700">El diagnóstico técnico está listo para revisión</p>
                      </div>
                      <Button
                        onClick={() => handleVerDiagnostico(selectedOT)}
                        className="bg-gradient-to-r from-emerald-500 to-blue-500"
                        size="sm"
                        disabled={loadingDiagnosticoPreview}
                      >
                        {loadingDiagnosticoPreview ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <FileText className="w-4 h-4 mr-2" />
                        )}
                        Ver Diagnóstico
                      </Button>
                    </div>
                  </div>
                )}

                {/* ── BLOQUE 3: DATOS GENERALES ─────────────────────────────── */}
                <div className="grid grid-cols-2 gap-4 items-start p-4 bg-slate-50 rounded-xl">
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-500">Estado</Label>
                  <Badge className={`${estadoConfig[selectedOT.estado]?.color} border-0`}>
                    {estadoConfig[selectedOT.estado]?.label}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-500">Prioridad</Label>
                  <Badge className={`${
                    selectedOT.prioridad === 'urgente' ? 'bg-red-100 text-red-700' :
                    selectedOT.prioridad === 'high' ? 'bg-orange-100 text-orange-700' :
                    'bg-slate-100 text-slate-700'
                  } border-0 capitalize`}>
                    {selectedOT.prioridad}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-500">Cliente</Label>
                  <p className="text-sm font-medium text-slate-900">{getClienteName(selectedOT.cliente_id)}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-500">Equipo</Label>
                  <p className="text-sm font-medium text-slate-900">{getEquipoInfo(selectedOT.equipo_id)}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-500">Técnico Asignado</Label>
                  <p className="text-sm font-medium text-slate-900">{getTecnicoName(selectedOT.tecnico_asignado_id)}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-500">Fecha Ingreso</Label>
                  <p className="text-sm font-medium text-slate-900">
                    {format(new Date(selectedOT.fecha_ingreso || selectedOT.created_date), 'dd MMM yyyy HH:mm', { locale: es })}
                  </p>
                </div>
                {/* P0.3: PIN visible para técnicos y admins */}
                {selectedOT.contrasena_ingreso && ['TECHNICIAN', 'ORG_ADMIN', 'BRANCH_ADMIN'].includes(effectiveRole) && (
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs font-medium text-slate-500">🔒 Contraseña / PIN del Equipo</Label>
                    <p className="font-mono font-bold text-emerald-600 text-lg">{selectedOT.contrasena_ingreso}</p>
                    <p className="text-xs text-slate-400">Visible solo para personal autorizado</p>
                  </div>
                )}
                </div>

                {/* ── LB-006: CAPA OPERACIONAL (integrada desde pestaña Operacional) ── */}
                <div className="border-t border-slate-100 pt-3">
                <OTOperationalLayer ot={selectedOT} />
                </div>

                {/* ── BLOQUE 4: DETALLE INGRESO ─────────────────────────────── */}
                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium text-slate-500">Motivo de Ingreso</Label>
                    <p className="text-sm font-medium text-slate-900">{selectedOT.motivo_ingreso}</p>
                  </div>

                  {selectedOT.observaciones_ingreso && (
                    <div className="space-y-1">
                      <Label className="text-xs font-medium text-slate-500">Observaciones</Label>
                      <p className="text-sm text-slate-700">{selectedOT.observaciones_ingreso}</p>
                    </div>
                  )}

                  {selectedOT.diagnostico_resumido && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1">
                      <Label className="text-xs font-semibold text-blue-900">Pre-Diagnóstico de Recepción</Label>
                      <p className="text-sm text-blue-800 whitespace-pre-wrap">{selectedOT.diagnostico_resumido}</p>
                    </div>
                  )}

                  {/* P0.3: Información adicional del equipo en recepción */}
                  {(selectedOT.serie_ingreso || selectedOT.accesorios_ingreso || selectedOT.estado_fisico_ingreso) && (
                    <div className="border-t border-slate-200 pt-4 space-y-2">
                      <Label className="text-xs font-medium text-slate-500">Recepción del Equipo</Label>
                      <div className="grid grid-cols-2 gap-3 items-start">
                        {selectedOT.serie_ingreso && (
                          <div className="space-y-0.5">
                            <p className="text-xs text-slate-500">Serie/IMEI</p>
                            <p className="text-sm font-medium text-slate-900">{selectedOT.serie_ingreso}</p>
                          </div>
                        )}
                        {selectedOT.estado_fisico_ingreso && (
                          <div className="space-y-0.5">
                            <p className="text-xs text-slate-500">Estado físico</p>
                            <p className="text-sm font-medium text-slate-900 capitalize">{selectedOT.estado_fisico_ingreso}</p>
                          </div>
                        )}
                        {selectedOT.accesorios_ingreso && (
                          <div className="col-span-2 space-y-0.5">
                            <p className="text-xs text-slate-500">Accesorios</p>
                            <p className="text-sm font-medium text-slate-900">{selectedOT.accesorios_ingreso}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── BLOQUE 5: ACCIONES REORGANIZADAS ─────────────────────── */}
                <div className="border-t border-slate-200 pt-4 space-y-3">

                  {/* Grupo B — Gestión */}
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Gestión</p>
                    <div className="flex flex-wrap gap-2">
                      {effectiveRole !== 'TECHNICIAN' && selectedOT.estado !== 'ENTREGADA' && (
                        <Button variant="outline" onClick={() => { setEditingOT(selectedOT); setSelectedOT(null); setShowModal(true); }}>
                          ✏️ Editar
                        </Button>
                      )}
                      {/* LB-006: Botón Editar Pre-Diagnóstico — solo cuando existe y es editable */}
                      {['ORG_ADMIN', 'SALES', 'BRANCH_ADMIN'].includes(effectiveRole) &&
                        ['EN_COLA_REVISION', 'ASIGNADA'].includes(selectedOT.estado) &&
                        preDiagSelectedOT && (
                        <Button
                          variant="outline"
                          className="border-blue-300 text-blue-700 hover:bg-blue-50"
                          onClick={() => { setPreDiagnosticoOT(selectedOT); setShowPreDiagnostico(true); setSelectedOT(null); }}
                        >
                          ✏️ Editar Pre-Diagnóstico
                        </Button>
                      )}
                      {['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES'].includes(effectiveRole) && !['ENTREGADA', 'CANCELADA'].includes(selectedOT.estado) && (
                        <Button variant="outline" className="border-purple-500 text-purple-700 hover:bg-purple-50"
                          onClick={() => { setReasignarOT(selectedOT); setNuevoTecnicoId(''); setMotivoReasignacion(''); setShowReasignar(true); }}>
                          🔄 {selectedOT.tecnico_asignado_id ? 'Reasignar Técnico' : 'Asignar Técnico'}
                        </Button>
                      )}
                      {['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'].includes(effectiveRole) && (
                        <AgendarDesdeOT
                          ordenTrabajo={selectedOT}
                          effectiveOrgId={effectiveOrgId}
                          onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['citas'] }); }}
                        />
                      )}
                      {['DIAGNOSTICADA', 'COTIZADA', 'EN_REPARACION', 'FINALIZADA'].includes(selectedOT.estado) && (
                        <Button variant="outline" className="border-blue-500 text-blue-700 hover:bg-blue-50"
                          onClick={() => handleCopiarLink(selectedOT)}>
                          📋 Copiar Link Cliente
                        </Button>
                      )}
                      <Button variant="outline" onClick={() => setSelectedOT(null)}>
                        Cerrar
                      </Button>
                    </div>
                  </div>
                </div>

              </TabsContent>

              <TabsContent value="actividades" className="space-y-4">
                {['TECHNICIAN', 'ORG_ADMIN'].includes(effectiveRole) && selectedOT.estado !== 'ENTREGADA' && (
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
        <DialogContent
          className="max-w-3xl max-h-[90vh] overflow-y-auto"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
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
                queryClient.invalidateQueries({ queryKey: ['ordenes', effectiveOrgId] });
                invalidateSmartIntake(queryClient, preDiagnosticoOT?.id);
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
              smartIntake={smartIntakeData || null}
              effectiveOrgId={effectiveOrgId}
              tecnicoId={user?.id}
              onClose={() => {
                setShowDiagnosticoTecnico(false);
                setDiagnosticoTecnicoOT(null);
                setSmartIntakeData(null);
              }}
              onComplete={() => {
                setShowDiagnosticoTecnico(false);
                setDiagnosticoTecnicoOT(null);
                setSmartIntakeData(null);
                queryClient.invalidateQueries({ queryKey: ['ordenes', effectiveOrgId] });
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
                queryClient.invalidateQueries({ queryKey: ['ordenes', effectiveOrgId] });
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
              queryClient.invalidateQueries({ queryKey: ['ordenes', effectiveOrgId] });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Quick Create Cliente (inline desde OT) */}
      <QuickCreateClienteModal
        open={showQuickCreateCliente}
        onOpenChange={setShowQuickCreateCliente}
        onCreated={(newCliente) => {
          queryClient.invalidateQueries({ queryKey: ['clientes'] });
          setSelectedClienteId(newCliente.id);
        }}
      />

      {/* Quick Create Equipo (solo para seleccionar equipos ya existentes de otros clientes) */}
      <QuickCreateEquipo
        open={showQuickCreateEquipo}
        onOpenChange={setShowQuickCreateEquipo}
        clienteId={selectedClienteId}
        onCreated={(newEquipo) => {
          queryClient.invalidateQueries({ queryKey: ['equipos'] });
          setSelectedEquipoId(newEquipo.id);
          setShowInlineEquipo(false);
        }}
      />

      {/* P0.2-E: Dialog Visualización Diagnóstico */}
      <Dialog open={showPreviewDiagnostico} onOpenChange={(open) => { if (!open) { setShowPreviewDiagnostico(false); setDiagnosticoPreviewData(null); } }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Diagnóstico Técnico</DialogTitle>
          </DialogHeader>
          {loadingDiagnosticoPreview ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mr-3" />
              <span className="text-slate-500">Cargando diagnóstico...</span>
            </div>
          ) : diagnosticoPreviewData ? (
            <DiagnosticoDocumentoA4
              ordenTrabajo={diagnosticoPreviewData.ordenTrabajo}
              diagnostico={diagnosticoPreviewData.diagnostico}
              cliente={diagnosticoPreviewData.cliente}
              equipo={diagnosticoPreviewData.equipo}
              tecnico={diagnosticoPreviewData.tecnico}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Modal Reasignar Técnico */}
      <Dialog open={showReasignar} onOpenChange={setShowReasignar}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{reasignarOT?.tecnico_asignado_id ? 'Reasignar Técnico' : 'Asignar Técnico'}</DialogTitle>
          </DialogHeader>

          {reasignarOT && (
            <div className="space-y-4 mt-4">
              <Alert className="bg-orange-50 border-orange-200">
                <AlertCircle className="w-4 h-4 text-orange-600" />
                <AlertDescription className="text-orange-800 text-sm">
                  La asignación conserva el estado operativo y las actividades técnicas existentes.
                  Si hay una actividad en progreso, debe gestionarse por separado antes de que otro técnico continúe.
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
                 <Label>Motivo de Reasignación (opcional)</Label>
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
                  disabled={!nuevoTecnicoId || reasignando}
                >
                  {reasignando ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Confirmando...</>
                  ) : 'Confirmar'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
