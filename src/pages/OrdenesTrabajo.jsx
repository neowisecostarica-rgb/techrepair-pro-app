import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Plus, Search, FileText, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUserAccount, withOrgId } from '@/components/hooks/useOrgData';

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
  const [showModal, setShowModal] = useState(false);
  const [editingOT, setEditingOT] = useState(null);
  const [selectedOT, setSelectedOT] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todas');
  const queryClient = useQueryClient();
  const { user, userAccount } = useUserAccount();

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

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.OrdenTrabajo.create(withOrgId(data, userAccount)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      setShowModal(false);
      setEditingOT(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.OrdenTrabajo.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      setShowModal(false);
      setEditingOT(null);
      setSelectedOT(null);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    const data = {
      branch_id: formData.get('branch_id'),
      cliente_id: formData.get('cliente_id'),
      equipo_id: formData.get('equipo_id'),
      motivo_ingreso: formData.get('motivo_ingreso'),
      observaciones_ingreso: formData.get('observaciones_ingreso'),
      prioridad: formData.get('prioridad') || 'normal',
      estado: editingOT ? formData.get('estado') : 'EN_COLA_REVISION',
      fecha_ingreso: editingOT?.fecha_ingreso || new Date().toISOString(),
      created_by_user_id: user?.id,
    };

    if (editingOT) {
      updateMutation.mutate({ id: editingOT.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const ordenesFiltradas = ordenes.filter(o => {
    const matchSearch = !searchTerm || 
      o.motivo_ingreso?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.observaciones_ingreso?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchEstado = filtroEstado === 'todas' || o.estado === filtroEstado;
    return matchSearch && matchEstado;
  });

  const getClienteName = (clienteId) => {
    const cliente = clientes.find(c => c.id === clienteId);
    return cliente?.nombre_completo || 'Cliente desconocido';
  };

  const getEquipoInfo = (equipoId) => {
    const equipo = equipos.find(e => e.id === equipoId);
    return equipo ? `${equipo.marca} ${equipo.modelo}` : 'Equipo desconocido';
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
                placeholder="Buscar por motivo u observaciones..."
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
                <Label htmlFor="prioridad">Prioridad</Label>
                <Select name="prioridad" defaultValue={editingOT?.prioridad || 'normal'}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baja</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cliente_id">Cliente *</Label>
                <Select name="cliente_id" defaultValue={editingOT?.cliente_id} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre_completo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="equipo_id">Equipo *</Label>
                <Select name="equipo_id" defaultValue={editingOT?.equipo_id} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar equipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {equipos.map(e => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.marca} {e.modelo} - {e.serie}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

            <div className="flex gap-3 justify-end pt-4">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-gradient-to-r from-emerald-500 to-blue-500">
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
            <div className="space-y-6 mt-4">
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}