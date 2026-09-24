import { useI18n } from '@/i18n';
import { formatDateTime } from '@/i18n/format';
import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { listIdentityAccounts } from '@/api/identity';


import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Search, FileText, AlertCircle, CheckCircle2, Loader2, User, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUserAccount } from '@/components/hooks/useOrgData';

import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import PageGuard from '../components/guards/PageGuard';
import { useAuthContext } from '@/components/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import QuickCreateEquipo from '@/components/ot/QuickCreateEquipo';
import ClienteSearchInput from '@/components/ot/ClienteSearchInput';
import QuickCreateClienteModal from '@/components/ot/QuickCreateClienteModal';
import MotivoIngresoInput from '@/components/ot/MotivoIngresoInput';
import BadgeEstadoPago from '@/components/ot/BadgeEstadoPago';
import { crearOrdenTrabajo } from '@/components/ot/crearOrdenTrabajo';
import KanbanBoard from '@/components/kanban/KanbanBoard';

import { WORK_ORDER_STATUSES } from '@/config/workOrderStatus';
const estadoConfig = WORK_ORDER_STATUSES;

export default function OrdenesTrabajo() {
  return (
    <PageGuard allowedRoles={['SALES', 'ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN', 'CUSTOMER_SERVICE']}>
      <OrdenesTrabajoContent />
    </PageGuard>
  );
}

function OrdenesTrabajoContent() {
  const { locale, t } = useI18n();
  // TECHNICIAN accede en modo consulta — sin redirección

  const [showModal, setShowModal] = useState(false);
  const [editingOT, setEditingOT] = useState(null);
  const [vistaActiva, setVistaActiva] = useState('lista');
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todas');
  const [motivoIngreso, setMotivoIngreso] = useState('');
  const [showQuickCreateCliente, setShowQuickCreateCliente] = useState(false);
  const [showQuickCreateEquipo, setShowQuickCreateEquipo] = useState(false);
  const [showInlineEquipo, setShowInlineEquipo] = useState(false);
  const [showPinField, setShowPinField] = useState(false);
  const [selectedClienteId, setSelectedClienteId] = useState('');
  const [selectedEquipoId, setSelectedEquipoId] = useState('');
  const [selectedPrioridad, setSelectedPrioridad] = useState('normal');
  const [terminosActivos, setTerminosActivos] = useState(null);
  const [receptionError, setReceptionError] = useState(null);
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
      let cursor = null;
      const all = [];
      do {
        const response = await base44.functions.invoke('listWorkOrders', { limit: 200, ...(cursor ? { cursor } : {}) });
        const page = response.data || {};
        all.push(...(page.records || []));
        cursor = page.has_more ? page.next_cursor : null;
      } while (cursor);
      return all.map(normalizarOrden);
    },
    enabled: !!effectiveOrgId,
    staleTime: 30 * 1000,
    refetchInterval: 10 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

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

  // Activation path: el onboarding termina en una acción real, no en otra pantalla de configuración.
  // Abrimos la recepción automáticamente una sola vez cuando viene del flujo first_work_order.
  const activationOpenedRef = React.useRef(false);
  useEffect(() => {
    if (activationOpenedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('activation') !== 'first_work_order') return;
    activationOpenedRef.current = true;
    resetForm();
    setEditingOT(null);
    setShowModal(true);
  }, []);

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
      // Time-to-Value: después de la primera recepción, llevar al usuario al
      // expediente recién creado para que vea inmediatamente el valor de TRP.
      const params = new URLSearchParams(window.location.search);
      const isFirstWorkOrderActivation = params.get('activation') === 'first_work_order';
      if (isFirstWorkOrderActivation && result?.work_order_id) {
        navigate(`/expediente/${result.work_order_id}`, { replace: true });
      } else if (isFirstWorkOrderActivation && result?.id) {
        navigate(`/expediente/${result.id}`, { replace: true });
      } else if (result?.navigate_to) {
        navigate(result.navigate_to);
      }
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

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 mb-2">{t('workOrders.title','Órdenes')}</h1>
          <p className="text-slate-500">{t('workOrders.subtitle','Recibe, encuentra y abre el expediente de cada trabajo.')}</p>
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
              className="bg-teal-700 hover:bg-teal-800 hover:shadow-lg transition-all"
            >
              <Plus className="w-5 h-5 mr-2" />
              Nueva OT
            </Button>
          )}
        </div>
      </div>

      {/* Vista Kanban */}
      {vistaActiva === 'kanban' && (
        <KanbanBoard onCardClick={(ot) => navigate(`/expediente/${ot.id}`)} />
      )}

      {/* Vista Lista */}
      {vistaActiva === 'lista' && <Tabs defaultValue="todas" className="w-full"><>

      {/* Tabs de navegación */}
      <TabsList className="mb-2">
        <TabsTrigger value="todas">{t('workOrders.all','Todas las OTs')}</TabsTrigger>
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
          <Loader2 className="w-8 h-8 animate-spin text-teal-700 mr-3" />
          <span className="text-slate-500">{t('workOrders.loading','Cargando órdenes...')}</span>
        </div>
      )}

      {/* Filtros */}
      {!isLoadingOrdenes && <Card className="border border-slate-200 shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                placeholder={t('workOrders.search','Buscar por código OT, motivo u observaciones...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filtroEstado} onValueChange={setFiltroEstado}>
              <SelectTrigger className="w-full md:w-64">
                <SelectValue placeholder={t('workOrders.filter','Filtrar por estado')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">{t('workOrders.allStates','Todos los estados')}</SelectItem>
                {Object.entries(estadoConfig).map(([key, value]) => (
                  <SelectItem key={key} value={key}>{t(value.i18nKey, value.label)}</SelectItem>
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
              className="border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer"
              onClick={() => navigate(`/expediente/${orden.id}`)}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center text-white font-bold text-xs">
                        OT
                      </div>
                      <div>
                        <p className="text-xs font-mono text-teal-700 font-bold mb-1">
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
                          Ingreso: {formatDateTime(orden.fecha_ingreso || orden.created_date, locale)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 items-center">
                      <Badge className={`${config.color} border-0`}>
                        {t(config.i18nKey, config.label)}
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
                      onClick={(e) => { e.stopPropagation(); navigate(`/expediente/${orden.id}`); }}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Abrir expediente
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {ordenesFiltradas.length === 0 && (
          <Card className="border border-slate-200 shadow-sm">
            <CardContent className="p-12 text-center">
              <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-4"><FileText className="w-6 h-6 text-slate-400" /></div>
              <p className="font-semibold text-slate-800">{t('workOrders.empty','No hay órdenes para esta vista')}</p>
              <p className="text-sm text-slate-500 mt-1">{t('workOrders.emptyHelp','Ajusta los filtros o registra una nueva recepción.')}</p>
              <Button size="sm" className="mt-5" onClick={() => { setEditingOT(null); resetForm(); setShowModal(true); }}>{t('workOrders.new','Nueva OT')}</Button>
            </CardContent>
          </Card>
        )}
      </div>}

      </TabsContent>

      {/* ── TAB: PENDIENTE CLIENTE ── */}
      <TabsContent value="pendiente-cliente">
        {isLoadingOrdenes && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-teal-700 mr-3" />
            <span className="text-slate-500">{t('workOrders.loading','Cargando órdenes...')}</span>
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
                  className="border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer"
                  onClick={() => navigate(`/expediente/${orden.id}`)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center text-white font-bold text-xs">
                            OT
                          </div>
                          <div>
                            <p className="text-xs font-mono text-teal-700 font-bold mb-1">
                              {orden.codigo_ot || 'OT-LEGACY'}
                            </p>
                            <h3 className="font-bold text-slate-900 text-lg">{getClienteName(orden.cliente_id)}</h3>
                            <p className="text-sm text-slate-600 font-medium">{orden.motivo_ingreso}</p>
                            <p className="text-xs text-slate-500">{getEquipoInfo(orden.equipo_id)}</p>
                            <p className="text-xs text-slate-400">
                              Ingreso: {formatDateTime(orden.fecha_ingreso || orden.created_date, locale)}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                          <Badge className={`${config.color} border-0`}>{t(config.i18nKey, config.label)}</Badge>
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
                      <div className="mt-3 flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2.5 text-xs"
                          onClick={(e) => { e.stopPropagation(); navigate(`/expediente/${orden.id}`); }}
                        >
                          <ExternalLink className="w-3 h-3 mr-1" />
                          Abrir expediente
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {ordenes.filter(o => o.estado === 'DIAGNOSTICADA').length === 0 && (
              <Card className="border border-slate-200 shadow-sm">
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
        open={showModal}
        onOpenChange={(open) => {
          if (!open && (guardandoOT || createMutation.isPending)) return;
          setShowModal(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              {editingOT ? 'Editar recepción' : 'Nueva recepción'}
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
                <strong>{t('tail.equipmentIntake','Recepción de Equipo')}:</strong> {t('tail.intakeHelp','Esta orden registra la recepción del equipo para diagnóstico.') }
                La aprobación del trabajo se solicitará al cliente después del diagnóstico.
              </AlertDescription>
            </Alert>

            {/* Cliente con búsqueda + Quick Create */}
            <div className="space-y-2">
              <Label>{t('workOrders.customer','Cliente *')}</Label>
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
                  <p className="text-xs text-slate-500">{t('tail.customerLocked','Cliente no editable para mantener integridad de datos')}</p>
                </>
              )}
            </div>

            {/* Equipo con Inline Create */}
            <div className="space-y-3">
              <Label>{t('workOrders.equipment','Equipo *')}</Label>
              
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
                    <h4 className="font-semibold text-emerald-900">{t('tail.registerEquipment','Registrar Nuevo Equipo')}</h4>
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
                      <div className="flex gap-2">
                        <Input
                          type={showPinField ? "text" : "password"}
                          value={newEquipoData.contrasena_ingreso}
                          onChange={(e) => setNewEquipoData({...newEquipoData, contrasena_ingreso: e.target.value})}
                          placeholder="Si aplica"
                          autoComplete="off"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowPinField(s => !s)}
                          className="shrink-0 px-2"
                        >
                          {showPinField ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                      </div>
                      <p className="text-xs text-slate-500">
                        Dato sensible: solo visible para validación en recepción. Queda protegido y se revela al técnico mediante autorización auditada.
                      </p>
                    </div>

                    <div className="col-span-2 space-y-2">
                      <Label className="text-sm">{t('tail.accessories','Accesorios Entregados')}</Label>
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
                <Label htmlFor="branch_id">{t('workOrders.branch','Sucursal *')}</Label>
                <Select name="branch_id" defaultValue={editingOT?.branch_id || userAccount?.branch_id} required>
                  <SelectTrigger>
                    <SelectValue placeholder={t('tail.selectBranch','Seleccionar sucursal')} />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="prioridad">{t('workOrders.priority','Prioridad *')}</Label>
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
                <Label htmlFor="tipo_ingreso">{t('workOrders.entryType','Tipo de Ingreso *')}</Label>
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
              <Label>{t('workOrders.reason','Motivo de Ingreso *')}</Label>
              <MotivoIngresoInput
                value={motivoIngreso}
                onChange={setMotivoIngreso}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="observaciones_ingreso">{t('workOrders.notes','Observaciones Adicionales')}</Label>
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
                  value={t(estadoConfig[editingOT?.estado]?.i18nKey, estadoConfig[editingOT?.estado]?.label || editingOT?.estado)}
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
                              className="bg-teal-700 hover:bg-teal-800"
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
                className="bg-teal-700 hover:bg-teal-800"
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

    </div>
  );
}