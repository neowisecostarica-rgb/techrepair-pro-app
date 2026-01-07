import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Package, Plus, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { withOrgId } from '@/components/hooks/useOrgData';

export default function SolicitudesTecnicas({ ordenTrabajoId, tecnicoId, userAccount }) {
  const [showModal, setShowModal] = useState(false);
  const queryClient = useQueryClient();

  const { data: solicitudes = [] } = useQuery({
    queryKey: ['solicitudes-tecnicas', ordenTrabajoId],
    queryFn: () => base44.entities.SolicitudTecnica.filter({ orden_trabajo_id: ordenTrabajoId }),
    enabled: !!ordenTrabajoId,
  });

  const createSolicitudMutation = useMutation({
    mutationFn: (data) => base44.entities.SolicitudTecnica.create(withOrgId(data, userAccount)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes-tecnicas'] });
      setShowModal(false);
    },
  });

  const updateSolicitudMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.SolicitudTecnica.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes-tecnicas'] });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    createSolicitudMutation.mutate({
      orden_trabajo_id: ordenTrabajoId,
      tecnico_id: tecnicoId,
      tipo: formData.get('tipo'),
      descripcion: formData.get('descripcion'),
      cantidad: parseFloat(formData.get('cantidad')),
      estado: 'draft',
    });
  };

  const handleSolicitar = (solicitud) => {
    updateSolicitudMutation.mutate({
      id: solicitud.id,
      data: { estado: 'requested' },
    });
  };

  const handleCancelar = (solicitud) => {
    if (confirm('¿Cancelar esta solicitud?')) {
      updateSolicitudMutation.mutate({
        id: solicitud.id,
        data: { estado: 'draft' },
      });
    }
  };

  const estadoConfig = {
    draft: { icon: Clock, color: 'bg-slate-100 text-slate-700', label: 'Borrador' },
    requested: { icon: Loader2, color: 'bg-blue-100 text-blue-700', label: 'Solicitado' },
    approved: { icon: CheckCircle, color: 'bg-emerald-100 text-emerald-700', label: 'Aprobado' },
    rejected: { icon: XCircle, color: 'bg-red-100 text-red-700', label: 'Rechazado' },
    fulfilled: { icon: CheckCircle, color: 'bg-green-100 text-green-700', label: 'Entregado' },
  };

  return (
    <>
      <Card className="border-0 shadow-md">
        <CardHeader className="border-b border-slate-100">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="w-5 h-5 text-emerald-600" />
              Solicitudes Técnicas
            </CardTitle>
            <Button onClick={() => setShowModal(true)} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Nueva Solicitud
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {solicitudes.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Package className="w-12 h-12 mx-auto mb-3" />
              <p>No hay solicitudes registradas</p>
            </div>
          ) : (
            <div className="space-y-3">
              {solicitudes.map((solicitud) => {
                const config = estadoConfig[solicitud.estado];
                const Icon = config.icon;
                
                return (
                  <div key={solicitud.id} className="p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className="capitalize bg-purple-100 text-purple-700 border-0 text-xs">
                            {solicitud.tipo}
                          </Badge>
                          <Badge className={`${config.color} border-0 text-xs flex items-center gap-1`}>
                            <Icon className="w-3 h-3" />
                            {config.label}
                          </Badge>
                        </div>
                        <p className="font-medium text-slate-900">{solicitud.descripcion}</p>
                        <p className="text-sm text-slate-500">Cantidad: {solicitud.cantidad}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {formatDistanceToNow(new Date(solicitud.created_date), { addSuffix: true, locale: es })}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {solicitud.estado === 'draft' && (
                          <>
                            <Button size="sm" onClick={() => handleSolicitar(solicitud)}>
                              Solicitar
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleCancelar(solicitud)}>
                              Cancelar
                            </Button>
                          </>
                        )}
                        {solicitud.estado === 'rejected' && solicitud.motivo_rechazo && (
                          <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">
                            {solicitud.motivo_rechazo}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Solicitud Técnica</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select name="tipo" required>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="repuesto">Repuesto</SelectItem>
                  <SelectItem value="suministro">Suministro</SelectItem>
                  <SelectItem value="herramienta">Herramienta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descripción *</Label>
              <Textarea
                name="descripcion"
                placeholder="Describe lo que necesitas..."
                required
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Cantidad *</Label>
              <Input
                name="cantidad"
                type="number"
                min="1"
                defaultValue="1"
                required
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createSolicitudMutation.isPending}>
                Guardar Borrador
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}