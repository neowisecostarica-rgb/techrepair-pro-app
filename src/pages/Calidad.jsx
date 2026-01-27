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
import { AlertCircle, Plus, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuthContext } from '@/components/contexts/AuthContext';
import PageGuard from '@/components/guards/PageGuard';

const estadoConfig = {
  abierta: { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Abierta' },
  en_analisis: { color: 'bg-yellow-100 text-yellow-700', icon: Clock, label: 'En Análisis' },
  en_correccion: { color: 'bg-blue-100 text-blue-700', icon: Clock, label: 'En Corrección' },
  cerrada: { color: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Cerrada' },
  rechazada: { color: 'bg-slate-100 text-slate-700', icon: XCircle, label: 'Rechazada' },
};

const severidadConfig = {
  baja: 'bg-blue-100 text-blue-700',
  media: 'bg-yellow-100 text-yellow-700',
  alta: 'bg-orange-100 text-orange-700',
  critica: 'bg-red-100 text-red-700',
};

export default function Calidad() {
  return (
    <PageGuard allowedRoles={['ORG_ADMIN', 'BRANCH_ADMIN']}>
      <CalidadContent />
    </PageGuard>
  );
}

function CalidadContent() {
  const [showModal, setShowModal] = useState(false);
  const [editingNC, setEditingNC] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState('todas');
  const queryClient = useQueryClient();
  const { effectiveOrgId } = useAuthContext();

  const { data: noConformidades = [] } = useQuery({
    queryKey: ['no-conformidades', effectiveOrgId],
    queryFn: () => base44.entities.NoConformidad.filter({
      organization_id: effectiveOrgId
    }),
    select: (data) => data.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)),
    enabled: !!effectiveOrgId,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.NoConformidad.create({
      ...data,
      organization_id: effectiveOrgId
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['no-conformidades'] });
      setShowModal(false);
      setEditingNC(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.NoConformidad.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['no-conformidades'] });
      setShowModal(false);
      setEditingNC(null);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      titulo: formData.get('titulo'),
      tipo: formData.get('tipo'),
      descripcion: formData.get('descripcion'),
      severidad: formData.get('severidad'),
      estado: formData.get('estado') || 'abierta',
      causa_raiz: formData.get('causa_raiz'),
      accion_correctiva: formData.get('accion_correctiva'),
      fecha_limite: formData.get('fecha_limite'),
      reportado_por: formData.get('reportado_por'),
    };

    if (editingNC) {
      updateMutation.mutate({ id: editingNC.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const ncFiltradas = noConformidades.filter(nc =>
    filtroEstado === 'todas' || nc.estado === filtroEstado
  );

  const abiertas = noConformidades.filter(nc => nc.estado === 'abierta').length;
  const criticas = noConformidades.filter(nc => nc.severidad === 'critica' && nc.estado !== 'cerrada').length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Gestión de Calidad</h1>
          <p className="text-slate-500">Control de no conformidades y mejora continua</p>
        </div>
        <Button
          onClick={() => { setEditingNC(null); setShowModal(true); }}
          className="bg-gradient-to-r from-red-500 to-orange-500 hover:shadow-lg transition-all"
        >
          <Plus className="w-5 h-5 mr-2" />
          Nueva NC
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Registros</p>
                <p className="text-3xl font-bold text-slate-900">{noConformidades.length}</p>
              </div>
              <AlertCircle className="w-10 h-10 text-slate-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Abiertas</p>
                <p className="text-3xl font-bold text-orange-600">{abiertas}</p>
              </div>
              <XCircle className="w-10 h-10 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Críticas</p>
                <p className="text-3xl font-bold text-red-600">{criticas}</p>
              </div>
              <AlertCircle className="w-10 h-10 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-6">
          <Select value={filtroEstado} onValueChange={setFiltroEstado}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Filtrar por estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todos los estados</SelectItem>
              {Object.entries(estadoConfig).map(([key, value]) => (
                <SelectItem key={key} value={key}>{value.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Lista de NC */}
      <div className="grid gap-4">
        {ncFiltradas.map((nc) => {
          const estadoInfo = estadoConfig[nc.estado] || estadoConfig.abierta;
          const IconEstado = estadoInfo.icon;

          return (
            <Card
              key={nc.id}
              className="border-0 shadow-md hover:shadow-xl transition-all cursor-pointer"
              onClick={() => { setEditingNC(nc); setShowModal(true); }}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`p-3 ${estadoInfo.color.split(' ')[0]} bg-opacity-20 rounded-xl`}>
                        <IconEstado className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-lg">{nc.titulo}</h3>
                        <p className="text-sm text-slate-500">
                          Reportado: {format(new Date(nc.created_date), 'dd MMM yyyy', { locale: es })}
                        </p>
                      </div>
                    </div>

                    <p className="text-slate-600 mb-3">{nc.descripcion}</p>

                    <div className="flex flex-wrap gap-2">
                      <Badge className={`${estadoInfo.color} border-0`}>
                        {estadoInfo.label}
                      </Badge>
                      <Badge className={`${severidadConfig[nc.severidad]} border-0 capitalize`}>
                        {nc.severidad}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {nc.tipo?.replace('_', ' ')}
                      </Badge>
                    </div>

                    {nc.accion_correctiva && (
                      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                        <p className="text-xs text-slate-600 mb-1">Acción Correctiva:</p>
                        <p className="text-sm font-medium text-slate-900">{nc.accion_correctiva}</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {ncFiltradas.length === 0 && (
          <Card className="border-0 shadow-lg">
            <CardContent className="p-12 text-center">
              <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-300" />
              <p className="text-slate-400">No hay no conformidades registradas</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Modal Crear/Editar */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              {editingNC ? 'Editar No Conformidad' : 'Nueva No Conformidad'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="titulo">Título *</Label>
                <Input
                  id="titulo"
                  name="titulo"
                  defaultValue={editingNC?.titulo}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo *</Label>
                <Select name="tipo" defaultValue={editingNC?.tipo} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="queja_cliente">Queja Cliente</SelectItem>
                    <SelectItem value="retrabajo">Retrabajo</SelectItem>
                    <SelectItem value="error_proceso">Error de Proceso</SelectItem>
                    <SelectItem value="falla_calidad">Falla de Calidad</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="severidad">Severidad *</Label>
                <Select name="severidad" defaultValue={editingNC?.severidad || 'media'} required>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baja">Baja</SelectItem>
                    <SelectItem value="media">Media</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="critica">Crítica</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="descripcion">Descripción *</Label>
                <Textarea
                  id="descripcion"
                  name="descripcion"
                  defaultValue={editingNC?.descripcion}
                  rows={3}
                  required
                />
              </div>

              {editingNC && (
                <>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="causa_raiz">Causa Raíz</Label>
                    <Textarea
                      id="causa_raiz"
                      name="causa_raiz"
                      defaultValue={editingNC?.causa_raiz}
                      placeholder="Análisis de causa raíz (5 porqués, Ishikawa)..."
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="accion_correctiva">Acción Correctiva</Label>
                    <Textarea
                      id="accion_correctiva"
                      name="accion_correctiva"
                      defaultValue={editingNC?.accion_correctiva}
                      placeholder="Acción correctiva propuesta..."
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fecha_limite">Fecha Límite</Label>
                    <Input
                      type="date"
                      id="fecha_limite"
                      name="fecha_limite"
                      defaultValue={editingNC?.fecha_limite}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="estado">Estado</Label>
                    <Select name="estado" defaultValue={editingNC?.estado}>
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
                </>
              )}

              <div className="space-y-2 col-span-2">
                <Label htmlFor="reportado_por">Reportado Por</Label>
                <Input
                  id="reportado_por"
                  name="reportado_por"
                  defaultValue={editingNC?.reportado_por}
                  placeholder="Email del reportador"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-gradient-to-r from-red-500 to-orange-500">
                {editingNC ? 'Actualizar' : 'Crear'} NC
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}