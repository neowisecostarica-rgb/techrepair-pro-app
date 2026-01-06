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
import { Calendar, Plus, Clock, Video, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const estadoCitaConfig = {
  programada: { color: 'bg-blue-100 text-blue-700', label: 'Programada' },
  confirmada: { color: 'bg-green-100 text-green-700', label: 'Confirmada' },
  en_curso: { color: 'bg-yellow-100 text-yellow-700', label: 'En Curso' },
  completada: { color: 'bg-emerald-100 text-emerald-700', label: 'Completada' },
  cancelada: { color: 'bg-red-100 text-red-700', label: 'Cancelada' },
  no_asistio: { color: 'bg-slate-100 text-slate-700', label: 'No Asistió' },
};

export default function Agenda() {
  const [showModal, setShowModal] = useState(false);
  const [editingCita, setEditingCita] = useState(null);
  const [fechaFiltro, setFechaFiltro] = useState(new Date().toISOString().split('T')[0]);
  const queryClient = useQueryClient();

  const { data: citas = [] } = useQuery({
    queryKey: ['citas'],
    queryFn: () => base44.entities.Cita.list('-fecha'),
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => base44.entities.Cliente.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Cita.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['citas'] });
      setShowModal(false);
      setEditingCita(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Cita.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['citas'] });
      setShowModal(false);
      setEditingCita(null);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      cliente_id: formData.get('cliente_id'),
      tipo: formData.get('tipo'),
      fecha: formData.get('fecha'),
      hora_inicio: formData.get('hora_inicio'),
      hora_fin: formData.get('hora_fin'),
      motivo: formData.get('motivo'),
      estado: formData.get('estado') || 'programada',
      notas: formData.get('notas'),
    };

    if (editingCita) {
      updateMutation.mutate({ id: editingCita.id, data });
    } else {
      createMutation.mutate(data);
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
        <Button
          onClick={() => { setEditingCita(null); setShowModal(true); }}
          className="bg-gradient-to-r from-emerald-500 to-blue-500 hover:shadow-lg transition-all"
        >
          <Plus className="w-5 h-5 mr-2" />
          Nueva Cita
        </Button>
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
                            className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow cursor-pointer"
                            onClick={() => { setEditingCita(cita); setShowModal(true); }}
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
                                    {cita.hora_inicio} - {cita.hora_fin}
                                  </span>
                                </div>
                                <Badge className={`${config.color} border-0 text-xs`}>
                                  {config.label}
                                </Badge>
                              </div>
                              <p className="font-semibold text-slate-900 text-sm mb-1">{cita.motivo}</p>
                              <p className="text-xs text-slate-500">{cliente?.nombre_completo || 'Cliente desconocido'}</p>
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
              {editingCita ? 'Editar Cita' : 'Nueva Cita'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="cliente_id">Cliente *</Label>
                <Select name="cliente_id" defaultValue={editingCita?.cliente_id} required>
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
                <Label htmlFor="tipo">Tipo de Cita *</Label>
                <Select name="tipo" defaultValue={editingCita?.tipo} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="diagnostico">Diagnóstico</SelectItem>
                    <SelectItem value="entrega">Entrega</SelectItem>
                    <SelectItem value="soporte_remoto">Soporte Remoto</SelectItem>
                    <SelectItem value="soporte_sitio">Soporte en Sitio</SelectItem>
                    <SelectItem value="consulta">Consulta</SelectItem>
                  </SelectContent>
                </Select>
              </div>

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
                <Label htmlFor="hora_fin">Hora Fin</Label>
                <Input
                  type="time"
                  id="hora_fin"
                  name="hora_fin"
                  defaultValue={editingCita?.hora_fin}
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="motivo">Motivo</Label>
                <Textarea
                  id="motivo"
                  name="motivo"
                  defaultValue={editingCita?.motivo}
                  placeholder="Motivo de la cita..."
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
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-gradient-to-r from-emerald-500 to-blue-500">
                {editingCita ? 'Actualizar' : 'Crear'} Cita
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}