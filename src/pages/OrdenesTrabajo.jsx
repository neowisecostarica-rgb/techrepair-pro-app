import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Plus, Search, FileText, Clock, CheckCircle, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const estadoConfig = {
  recibido: { color: 'bg-slate-100 text-slate-700', label: 'Recibido' },
  diagnostico: { color: 'bg-blue-100 text-blue-700', label: 'Diagnóstico' },
  aprobacion_pendiente: { color: 'bg-yellow-100 text-yellow-700', label: 'Aprobación Pendiente' },
  en_reparacion: { color: 'bg-orange-100 text-orange-700', label: 'En Reparación' },
  pruebas: { color: 'bg-purple-100 text-purple-700', label: 'Pruebas' },
  listo: { color: 'bg-emerald-100 text-emerald-700', label: 'Listo' },
  entregado: { color: 'bg-green-100 text-green-700', label: 'Entregado' },
  cancelado: { color: 'bg-red-100 text-red-700', label: 'Cancelado' },
};

export default function OrdenesTrabajo() {
  const [showModal, setShowModal] = useState(false);
  const [editingOT, setEditingOT] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todas');
  const queryClient = useQueryClient();

  const { data: ordenes = [], isLoading } = useQuery({
    queryKey: ['ordenes'],
    queryFn: () => base44.entities.OrdenTrabajo.list('-created_date'),
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => base44.entities.Cliente.list(),
  });

  const { data: equipos = [] } = useQuery({
    queryKey: ['equipos'],
    queryFn: () => base44.entities.Equipo.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.OrdenTrabajo.create(data),
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
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      numero_ot: formData.get('numero_ot'),
      cliente_id: formData.get('cliente_id'),
      equipo_id: formData.get('equipo_id'),
      falla_reportada: formData.get('falla_reportada'),
      estado: formData.get('estado') || 'recibido',
      prioridad: formData.get('prioridad') || 'media',
      fecha_estimada_entrega: formData.get('fecha_estimada_entrega'),
    };

    if (editingOT) {
      updateMutation.mutate({ id: editingOT.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const ordenesFiltradas = ordenes.filter(o => {
    const matchSearch = !searchTerm || 
      o.numero_ot?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.falla_reportada?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchEstado = filtroEstado === 'todas' || o.estado === filtroEstado;
    return matchSearch && matchEstado;
  });

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
                placeholder="Buscar por número de OT o falla..."
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
          const config = estadoConfig[orden.estado] || estadoConfig.recibido;
          
          return (
            <Card 
              key={orden.id} 
              className="border-0 shadow-md hover:shadow-xl transition-all cursor-pointer"
              onClick={() => { setEditingOT(orden); setShowModal(true); }}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-xl flex items-center justify-center text-white font-bold">
                        {orden.numero_ot || 'OT'}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-lg">{orden.falla_reportada}</h3>
                        <p className="text-sm text-slate-500">
                          Cliente: #{orden.cliente_id?.slice(0, 8)} • Creada: {format(new Date(orden.created_date), 'dd MMM yyyy', { locale: es })}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge className={`${config.color} border-0`}>
                        {config.label}
                      </Badge>
                      {orden.prioridad && (
                        <Badge className={`${
                          orden.prioridad === 'urgente' ? 'bg-red-100 text-red-700' :
                          orden.prioridad === 'alta' ? 'bg-orange-100 text-orange-700' :
                          'bg-slate-100 text-slate-700'
                        } border-0`}>
                          {orden.prioridad}
                        </Badge>
                      )}
                      {orden.fecha_estimada_entrega && (
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(new Date(orden.fecha_estimada_entrega), 'dd MMM', { locale: es })}
                        </Badge>
                      )}
                    </div>

                    {orden.costo_estimado && (
                      <div className="mt-3 text-lg font-bold text-emerald-600">
                        ₡{orden.costo_estimado.toLocaleString()}
                      </div>
                    )}
                  </div>

                  {orden.tecnico_asignado && (
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Técnico</p>
                      <p className="text-sm font-medium text-slate-700">{orden.tecnico_asignado}</p>
                    </div>
                  )}
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

      {/* Modal Crear/Editar OT */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              {editingOT ? 'Editar Orden de Trabajo' : 'Nueva Orden de Trabajo'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="numero_ot">Número de OT</Label>
                <Input
                  id="numero_ot"
                  name="numero_ot"
                  defaultValue={editingOT?.numero_ot || `OT-${Date.now()}`}
                  placeholder="OT-12345"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="prioridad">Prioridad</Label>
                <Select name="prioridad" defaultValue={editingOT?.prioridad || 'media'}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baja">Baja</SelectItem>
                    <SelectItem value="media">Media</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cliente_id">Cliente</Label>
                <Select name="cliente_id" defaultValue={editingOT?.cliente_id}>
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
                <Label htmlFor="equipo_id">Equipo</Label>
                <Select name="equipo_id" defaultValue={editingOT?.equipo_id}>
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
              <Label htmlFor="falla_reportada">Falla Reportada</Label>
              <Textarea
                id="falla_reportada"
                name="falla_reportada"
                defaultValue={editingOT?.falla_reportada}
                placeholder="Describa la falla reportada por el cliente..."
                rows={3}
                required
              />
            </div>

            {editingOT && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="diagnostico">Diagnóstico Técnico</Label>
                  <Textarea
                    id="diagnostico"
                    name="diagnostico"
                    defaultValue={editingOT?.diagnostico}
                    placeholder="Diagnóstico detallado..."
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="costo_estimado">Costo Estimado (₡)</Label>
                    <Input
                      type="number"
                      id="costo_estimado"
                      name="costo_estimado"
                      defaultValue={editingOT?.costo_estimado}
                      placeholder="0"
                    />
                  </div>

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
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="fecha_estimada_entrega">Fecha Estimada de Entrega</Label>
              <Input
                type="date"
                id="fecha_estimada_entrega"
                name="fecha_estimada_entrega"
                defaultValue={editingOT?.fecha_estimada_entrega}
              />
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowModal(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-gradient-to-r from-emerald-500 to-blue-500"
              >
                {editingOT ? 'Actualizar' : 'Crear'} Orden
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}