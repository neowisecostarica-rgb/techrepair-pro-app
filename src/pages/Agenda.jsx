import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar, Plus, Clock, Video, MapPin, ExternalLink, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuthContext } from '@/components/contexts/AuthContext';
import { validarSolapamiento } from '@/components/calendario/validarSolapamiento';
import { createPageUrl } from '../utils';
import PageGuard from '@/components/guards/PageGuard';

// Componente inline para selector de OT (UX FIX)
function CitaSelectorOT({ tipo, defaultValue, effectiveOrgId }) {
  const requiereOT = ['diagnostico', 'reparacion', 'entrega'].includes(tipo);

  const { data: ordenesTrabajo = [] } = useQuery({
    queryKey: ['ordenes-trabajo', effectiveOrgId],
    queryFn: () => base44.entities.OrdenTrabajo.filter({
      organization_id: effectiveOrgId
    }),
    enabled: !!effectiveOrgId && requiereOT,
  });

  if (!requiereOT) return null;

  return (
    <div className="space-y-2 col-span-2">
      <Label htmlFor="orden_trabajo_id">Orden de Trabajo asociada *</Label>
      <Select name="orden_trabajo_id" defaultValue={defaultValue} required>
        <SelectTrigger>
          <SelectValue placeholder="Selecciona la OT correspondiente" />
        </SelectTrigger>
        <SelectContent>
          {ordenesTrabajo
            .filter(ot => !['ENTREGADA', 'CANCELADA'].includes(ot.estado))
            .map((ot) => (
              <SelectItem key={ot.id} value={ot.id}>
                {ot.codigo_ot} - {ot.motivo_ingreso}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-slate-500">
        Selecciona la OT correspondiente al diagnóstico o reparación.
      </p>
    </div>
  );
}

const estadoCitaConfig = {
  programada: { color: 'bg-blue-100 text-blue-700', label: 'Programada' },
  confirmada: { color: 'bg-green-100 text-green-700', label: 'Confirmada' },
  en_curso: { color: 'bg-yellow-100 text-yellow-700', label: 'En Curso' },
  completada: { color: 'bg-emerald-100 text-emerald-700', label: 'Completada' },
  cancelada: { color: 'bg-red-100 text-red-700', label: 'Cancelada' },
  no_asistio: { color: 'bg-slate-100 text-slate-700', label: 'No Asistió' },
};

export default function Agenda() {
  return (
    <PageGuard allowedRoles={['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN', 'SALES']}>
      <AgendaContent />
    </PageGuard>
  );
}

function AgendaContent() {
  const [showModal, setShowModal] = useState(false);
  const [editingCita, setEditingCita] = useState(null);
  const [fechaFiltro, setFechaFiltro] = useState(new Date().toISOString().split('T')[0]);
  const [validando, setValidando] = useState(false);
  const [tipoSeleccionado, setTipoSeleccionado] = useState('');
  const queryClient = useQueryClient();

  const { effectiveOrgId, effectiveRole, user, userAccount } = useAuthContext();

  // P0.3 RBAC: Filtrar según rol
  const { data: citas = [] } = useQuery({
    queryKey: ['citas', effectiveOrgId, userAccount?.user_id],
    queryFn: async () => {
      const todasCitas = await base44.entities.Cita.filter({
        organization_id: effectiveOrgId
      });

      // TECHNICIAN: solo su agenda
      if (effectiveRole === 'TECHNICIAN') {
        return todasCitas.filter(c => c.tecnico_asignado_id === userAccount?.user_id);
      }

      // SALES, ADMIN: todas
      return todasCitas;
    },
    enabled: !!effectiveOrgId,
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes', effectiveOrgId],
    queryFn: () => base44.entities.Cliente.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
  });

  // Obtener técnicos (UserAccount con role TECHNICIAN)
  const { data: tecnicos = [] } = useQuery({
    queryKey: ['tecnicos', effectiveOrgId],
    queryFn: async () => {
      const accounts = await base44.entities.UserAccount.filter({
        organization_id: effectiveOrgId,
        role: 'TECHNICIAN',
        active: true,
      });
      return accounts;
    },
    enabled: !!effectiveOrgId && ['ORG_ADMIN', 'BRANCH_ADMIN'].includes(effectiveRole),
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      // P0.1 TENANT ZERO: Inyectar organization_id
      const dataWithOrg = {
        ...data,
        organization_id: effectiveOrgId,
        created_by_user_id: user?.id,
        created_by_role: effectiveRole,
      };

      // P0.2: Validar solapamiento
      const validacion = await validarSolapamiento({
        tecnicoId: data.tecnico_asignado_id,
        organizationId: effectiveOrgId,
        fecha: data.fecha,
        horaInicio: data.hora_inicio,
        horaFin: data.hora_fin,
      });

      if (validacion.conflicto) {
        throw new Error(validacion.mensaje);
      }

      return await base44.entities.Cita.create(dataWithOrg);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['citas'] });
      setShowModal(false);
      setEditingCita(null);

      // Auditoría
      base44.entities.SuperAdminAudit.create({
        super_admin_id: user?.id || 'system',
        super_admin_email: user?.email || 'system',
        action: 'create_cita',
        target_organization_id: effectiveOrgId,
        context: `Cita creada por ${effectiveRole}`,
      });
    },
    onError: (error) => {
      alert('Error al crear cita: ' + error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      // P0.2: Validar solapamiento (excluyendo la cita actual)
      const validacion = await validarSolapamiento({
        tecnicoId: data.tecnico_asignado_id,
        organizationId: effectiveOrgId,
        fecha: data.fecha,
        horaInicio: data.hora_inicio,
        horaFin: data.hora_fin,
        citaIdExcluir: id,
      });

      if (validacion.conflicto) {
        throw new Error(validacion.mensaje);
      }

      return await base44.entities.Cita.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['citas'] });
      setShowModal(false);
      setEditingCita(null);

      // Auditoría
      base44.entities.SuperAdminAudit.create({
        super_admin_id: user?.id || 'system',
        super_admin_email: user?.email || 'system',
        action: 'update_cita',
        target_organization_id: effectiveOrgId,
        context: `Cita actualizada por ${effectiveRole}`,
      });
    },
    onError: (error) => {
      alert('Error al actualizar cita: ' + error.message);
    },
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidando(true);

    const formData = new FormData(e.target);
    
    // P0.3 RBAC: Técnico asignado
    let tecnicoAsignadoId;
    if (effectiveRole === 'TECHNICIAN') {
      // Técnico solo puede crear para sí mismo
      tecnicoAsignadoId = userAccount?.user_id;
    } else {
      // Admin/Sales pueden asignar
      tecnicoAsignadoId = formData.get('tecnico_asignado_id');
    }

    const data = {
      cliente_id: formData.get('cliente_id') || null,
      tipo: formData.get('tipo'),
      fecha: formData.get('fecha'),
      hora_inicio: formData.get('hora_inicio'),
      hora_fin: formData.get('hora_fin'),
      motivo: formData.get('motivo'),
      estado: formData.get('estado') || 'programada',
      notas: formData.get('notas'),
      tecnico_asignado_id: tecnicoAsignadoId,
      tecnico_asignado_email: tecnicos.find(t => t.user_id === tecnicoAsignadoId)?.user_email || user?.email,
      orden_trabajo_id: formData.get('orden_trabajo_id') || null,
    };

    // P0.4: Validar que si es diagnóstico/reparación, debe tener OT
    if (['diagnostico', 'reparacion'].includes(data.tipo) && !data.orden_trabajo_id) {
      alert('Los eventos de diagnóstico y reparación requieren una OT asociada');
      setValidando(false);
      return;
    }

    try {
      if (editingCita) {
        await updateMutation.mutateAsync({ id: editingCita.id, data });
      } else {
        await createMutation.mutateAsync(data);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setValidando(false);
    }
  };

  const handleVerOT = (otId) => {
    if (otId) {
      window.open(createPageUrl('OrdenesTrabajo') + '?id=' + otId, '_blank');
    }
  };

  const citasFiltradas = citas.filter(c => c.fecha === fechaFiltro);

  // Agrupar por hora
  const horas = Array.from({ length: 11 }, (_, i) => `${8 + i}:00`);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Agenda de Citas</h1>
          <p className="text-slate-500">Programación de diagnósticos y soportes</p>
        </div>
        {/* P0.3 RBAC: Solo ADMIN y TECHNICIAN pueden crear */}
        {['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN'].includes(effectiveRole) && (
          <Button
            onClick={() => { setEditingCita(null); setShowModal(true); }}
            className="bg-gradient-to-r from-emerald-500 to-blue-500 hover:shadow-lg transition-all"
          >
            <Plus className="w-5 h-5 mr-2" />
            Nuevo Evento
          </Button>
        )}
      </div>

      {/* Selector de Fecha */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <Label>Fecha:</Label>
            <Input
              type="date"
              value={fechaFiltro}
              onChange={(e) => setFechaFiltro(e.target.value)}
              className="w-64"
            />
            <Badge variant="outline" className="ml-auto">
              {citasFiltradas.length} citas programadas
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Calendario del Día */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-lg font-semibold">
            {format(new Date(fechaFiltro), "EEEE, dd 'de' MMMM yyyy", { locale: es })}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-3">
            {horas.map((hora) => {
              const citasHora = citasFiltradas.filter(c => c.hora_inicio?.startsWith(hora.split(':')[0]));

              return (
                <div key={hora} className="flex gap-4">
                  <div className="w-20 text-sm font-semibold text-slate-600 pt-2">
                    {hora}
                  </div>
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {citasHora.length > 0 ? (
                      citasHora.map((cita) => {
                        const config = estadoCitaConfig[cita.estado] || estadoCitaConfig.programada;
                        const cliente = clientes.find(c => c.id === cita.cliente_id);

                        return (
                          <Card
                            key={cita.id}
                            className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow"
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  {cita.tipo === 'soporte_remoto' ? (
                                    <Video className="w-4 h-4 text-blue-500" />
                                  ) : (
                                    <MapPin className="w-4 h-4 text-emerald-500" />
                                  )}
                                  <span className="text-xs font-semibold text-slate-600">
                                    {cita.hora_inicio} - {cita.hora_fin || 'Sin fin'}
                                  </span>
                                </div>
                                <Badge className={`${config.color} border-0 text-xs`}>
                                  {config.label}
                                </Badge>
                              </div>

                              {/* P0.3 RBAC: Vista según rol */}
                              {effectiveRole === 'SALES' ? (
                                // SALES: solo ve disponibilidad
                                <div>
                                  <p className="text-sm text-slate-600">Ocupado - {cita.tipo.replace('_', ' ')}</p>
                                </div>
                              ) : (
                                // ADMIN y TECHNICIAN: vista completa
                                <div>
                                  <p className="font-semibold text-slate-900 text-sm mb-1">{cita.motivo || 'Sin motivo'}</p>
                                  {cita.cliente_id && (
                                    <p className="text-xs text-slate-500">{cliente?.nombre_completo || 'Cliente'}</p>
                                  )}
                                  
                                  {/* P0.4: Link a OT */}
                                  {cita.orden_trabajo_id && (
                                    <button
                                      onClick={() => handleVerOT(cita.orden_trabajo_id)}
                                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-2"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                      Ver OT
                                    </button>
                                  )}

                                  {/* Botón editar solo para admin o dueño */}
                                  {(['ORG_ADMIN', 'BRANCH_ADMIN'].includes(effectiveRole) || 
                                    cita.tecnico_asignado_id === userAccount?.user_id) && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => { setEditingCita(cita); setShowModal(true); }}
                                      className="mt-2 text-xs"
                                    >
                                      Editar
                                    </Button>
                                  )}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })
                    ) : (
                      <div className="h-16 border-2 border-dashed border-slate-200 rounded-lg" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Modal Crear/Editar Cita */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              {editingCita ? 'Editar Evento' : 'Nuevo Evento'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              {/* P0.3 RBAC: Admin puede asignar técnico */}
              {['ORG_ADMIN', 'BRANCH_ADMIN'].includes(effectiveRole) && (
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="tecnico_asignado_id">Técnico Asignado *</Label>
                  <Select name="tecnico_asignado_id" defaultValue={editingCita?.tecnico_asignado_id} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar técnico" />
                    </SelectTrigger>
                    <SelectContent>
                      {tecnicos.map(t => (
                        <SelectItem key={t.user_id} value={t.user_id}>
                          {t.user_email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo de Evento *</Label>
                <Select 
                  name="tipo" 
                  defaultValue={editingCita?.tipo} 
                  onValueChange={setTipoSeleccionado}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="diagnostico">Diagnóstico (requiere OT)</SelectItem>
                    <SelectItem value="reparacion">Reparación (requiere OT)</SelectItem>
                    <SelectItem value="entrega">Entrega</SelectItem>
                    <SelectItem value="soporte_remoto">Soporte Remoto</SelectItem>
                    <SelectItem value="soporte_sitio">Soporte en Sitio</SelectItem>
                    <SelectItem value="consulta">Consulta</SelectItem>
                    <SelectItem value="reunion_interna">Reunión Interna</SelectItem>
                    <SelectItem value="bloqueo_personal">Bloqueo Personal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="cliente_id">Cliente (opcional)</Label>
                <Select name="cliente_id" defaultValue={editingCita?.cliente_id}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Sin cliente</SelectItem>
                    {clientes.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre_completo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* P0.4: Selector de OT (UX FIX APLICADO) */}
              <CitaSelectorOT
                tipo={tipoSeleccionado || editingCita?.tipo}
                defaultValue={editingCita?.orden_trabajo_id}
                effectiveOrgId={effectiveOrgId}
              />

              <div className="space-y-2">
                <Label htmlFor="estado">Estado</Label>
                <Select name="estado" defaultValue={editingCita?.estado || 'programada'}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(estadoCitaConfig).map(([key, value]) => (
                      <SelectItem key={key} value={key}>{value.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fecha">Fecha *</Label>
                <Input
                  type="date"
                  id="fecha"
                  name="fecha"
                  defaultValue={editingCita?.fecha || fechaFiltro}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hora_inicio">Hora Inicio *</Label>
                <Input
                  type="time"
                  id="hora_inicio"
                  name="hora_inicio"
                  defaultValue={editingCita?.hora_inicio}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hora_fin">Hora Fin *</Label>
                <Input
                  type="time"
                  id="hora_fin"
                  name="hora_fin"
                  defaultValue={editingCita?.hora_fin}
                  required
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="motivo">Motivo / Descripción</Label>
                <Textarea
                  id="motivo"
                  name="motivo"
                  defaultValue={editingCita?.motivo}
                  placeholder="Descripción del evento..."
                  rows={2}
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="notas">Notas</Label>
                <Textarea
                  id="notas"
                  name="notas"
                  defaultValue={editingCita?.notas}
                  placeholder="Notas adicionales..."
                  rows={2}
                />
              </div>

              {/* P0.2: Advertencia de validación */}
              <div className="col-span-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium">Validación automática de conflictos</p>
                    <p className="text-xs mt-1">
                      El sistema verificará que no haya solapamientos con otros eventos del técnico.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)} disabled={validando}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                className="bg-gradient-to-r from-emerald-500 to-blue-500"
                disabled={validando}
              >
                {validando ? 'Validando...' : (editingCita ? 'Actualizar' : 'Crear')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}