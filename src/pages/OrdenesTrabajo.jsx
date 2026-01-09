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
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import PageGuard from '../components/guards/PageGuard';
import AgendarDesdeOT from '@/components/ot/AgendarDesdeOT';
import { useAuthContext } from '@/components/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import IniciarActividad from '@/components/actividades/IniciarActividad';
import ActividadActiva from '@/components/actividades/ActividadActiva';
import ListaActividades from '@/components/actividades/ListaActividades';
import QuickCreateCliente from '@/components/ot/QuickCreateCliente';
import QuickCreateEquipo from '@/components/ot/QuickCreateEquipo';
import { generarCodigoOT, calcularFechaEntregaEstimada } from '@/components/ot/utils/generarCodigoOT';

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
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todas');
  const [showQuickCreateCliente, setShowQuickCreateCliente] = useState(false);
  const [showQuickCreateEquipo, setShowQuickCreateEquipo] = useState(false);
  const [selectedClienteId, setSelectedClienteId] = useState('');
  const [selectedEquipoId, setSelectedEquipoId] = useState('');
  const [selectedPrioridad, setSelectedPrioridad] = useState('normal');
  const [terminosAceptados, setTerminosAceptados] = useState(false);
  const [terminosActivos, setTerminosActivos] = useState(null);
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
      
      return base44.entities.OrdenTrabajo.create(withOrgId({
        ...data,
        codigo_ot: codigoOT,
        fecha_entrega_estimada: fechaEstimada,
        fecha_ingreso: new Date().toISOString()
      }, userAccount));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      setShowModal(false);
      setEditingOT(null);
      setSelectedClienteId('');
      setSelectedEquipoId('');
      setSelectedPrioridad('normal');
      setTerminosAceptados(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const ordenAnterior = ordenes.find(o => o.id === id);
      
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

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validar términos solo en creación
    if (!editingOT && !terminosAceptados) {
      alert('Debe aceptar los términos y condiciones para continuar');
      return;
    }
    
    const formData = new FormData(e.target);
    
    const data = {
      branch_id: formData.get('branch_id'),
      cliente_id: selectedClienteId,
      equipo_id: selectedEquipoId,
      motivo_ingreso: formData.get('motivo_ingreso'),
      observaciones_ingreso: formData.get('observaciones_ingreso'),
      tipo_ingreso: formData.get('tipo_ingreso') || 'presencial',
      tracking_code: formData.get('tracking_code') || undefined,
      responsable_recepcion: formData.get('responsable_recepcion') || user?.full_name,
      prioridad: selectedPrioridad,
      estado: editingOT ? formData.get('estado') : 'EN_COLA_REVISION',
      created_by_user_id: user?.id,
    };

    // Agregar términos en creación
    if (!editingOT && terminosActivos) {
      data.terminos_aceptados = true;
      data.terminos_aceptados_at = new Date().toISOString();
      data.terminos_version = terminosActivos.version;
      data.terminos_texto_snapshot = terminosActivos.texto;
    }

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
    return cliente?.nombre_completo || 'Cliente desconocido';
  };

  const getEquipoInfo = (equipoId) => {
    const equipo = equipos.find(e => e.id === equipoId);
    return equipo ? `${equipo.marca} ${equipo.modelo}` : 'Equipo desconocido';
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
                        <h3 className="font-bold text-slate-900 text-lg">{orden.motivo_ingreso}</h3>
                        <p className="text-sm text-slate-500">
                          {getClienteName(orden.cliente_id)} • {getEquipoInfo(orden.equipo_id)}
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
            {/* Cliente con Quick Create */}
            <div className="space-y-2">
              <Label htmlFor="cliente_id">Cliente *</Label>
              <div className="flex gap-2">
                <Select 
                  value={selectedClienteId} 
                  onValueChange={setSelectedClienteId}
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowQuickCreateCliente(true)}
                  className="shrink-0"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Nuevo
                </Button>
              </div>
            </div>

            {/* Equipo con Quick Create */}
            <div className="space-y-2">
              <Label htmlFor="equipo_id">Equipo *</Label>
              <div className="flex gap-2">
                <Select 
                  value={selectedEquipoId} 
                  onValueChange={setSelectedEquipoId}
                  disabled={!selectedClienteId}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={selectedClienteId ? "Seleccionar equipo" : "Primero selecciona un cliente"} />
                  </SelectTrigger>
                  <SelectContent>
                    {equiposDelCliente.length === 0 && selectedClienteId && (
                      <div className="p-2 text-sm text-slate-500">
                        Este cliente no tiene equipos. Crea uno nuevo.
                      </div>
                    )}
                    {equiposDelCliente.map(e => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.tipo} - {e.marca} {e.modelo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowQuickCreateEquipo(true)}
                  disabled={!selectedClienteId}
                  className="shrink-0"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Nuevo
                </Button>
              </div>
              {!selectedClienteId && (
                <p className="text-xs text-slate-500">
                  Debes seleccionar un cliente primero
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
                <Label htmlFor="estado">Estado</Label>
                <Select name="estado" defaultValue={editingOT?.estado}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(estadoConfig).map(([key, value]) => (
                      <SelectItem key={key} value={key}>{value.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Términos y Condiciones (solo en creación) */}
            {!editingOT && (
              <div className="space-y-4 border-t border-slate-200 pt-6">
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Términos y Condiciones *</Label>
                  
                  {terminosActivos ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 max-h-40 overflow-y-auto">
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">
                        {terminosActivos.texto}
                      </p>
                    </div>
                  ) : (
                    <Alert>
                      <AlertCircle className="w-4 h-4" />
                      <AlertDescription>
                        No hay términos y condiciones configurados. Contacta al administrador.
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {terminosActivos && (
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="terminos"
                        checked={terminosAceptados}
                        onCheckedChange={setTerminosAceptados}
                      />
                      <Label 
                        htmlFor="terminos" 
                        className="text-sm font-normal cursor-pointer"
                      >
                        Acepto los términos y condiciones (obligatorio)
                      </Label>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-4">
              <Button type="button" variant="outline" onClick={() => {
                setShowModal(false);
                setSelectedClienteId('');
                setSelectedEquipoId('');
                setSelectedPrioridad('normal');
                setTerminosAceptados(false);
              }}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                className="bg-gradient-to-r from-emerald-500 to-blue-500"
                disabled={!editingOT && (!selectedClienteId || !selectedEquipoId || !terminosAceptados)}
              >
                {editingOT ? 'Actualizar' : 'Crear'} Orden
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
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-200">
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

                {selectedOT.estado === 'EN_REVISION' && (
                  <Button 
                    onClick={() => {
                      setWizardOT(selectedOT);
                      setShowWizard(true);
                      setSelectedOT(null);
                    }}
                    className="bg-gradient-to-r from-purple-500 to-blue-500"
                  >
                    🧪 Iniciar Diagnóstico
                  </Button>
                )}
                {(selectedOT.estado === 'DIAGNOSTICADA' || selectedOT.estado === 'FINALIZADA') && (
                  <Button 
                    onClick={() => handleCobrarTrabajo(selectedOT)}
                    className="bg-gradient-to-r from-green-500 to-emerald-500"
                  >
                    💳 Cobrar Trabajo
                  </Button>
                )}
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
              </div>
              </TabsContent>

              <TabsContent value="actividades" className="space-y-4">
                {effectiveRole === 'TECHNICIAN' && (
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

      {/* Quick Create Cliente */}
      <QuickCreateCliente
        open={showQuickCreateCliente}
        onOpenChange={setShowQuickCreateCliente}
        organizationId={effectiveOrgId}
        onCreated={(newCliente) => {
          queryClient.invalidateQueries({ queryKey: ['clientes'] });
          setSelectedClienteId(newCliente.id);
        }}
      />

      {/* Quick Create Equipo */}
      <QuickCreateEquipo
        open={showQuickCreateEquipo}
        onOpenChange={setShowQuickCreateEquipo}
        organizationId={effectiveOrgId}
        clienteId={selectedClienteId}
        onCreated={(newEquipo) => {
          queryClient.invalidateQueries({ queryKey: ['equipos'] });
          setSelectedEquipoId(newEquipo.id);
        }}
      />
    </div>
  );
}