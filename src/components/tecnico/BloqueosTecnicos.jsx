import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, Shield, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { withOrgId } from '@/components/hooks/useOrgData';

export default function BloqueosTecnicos({ ordenTrabajoId, tecnicoId, userAccount }) {
  const [showModal, setShowModal] = useState(false);
  const queryClient = useQueryClient();

  const { data: bloqueos = [] } = useQuery({
    queryKey: ['bloqueos-tecnicos', ordenTrabajoId],
    queryFn: () => base44.entities.BloqueoTecnico.filter({ orden_trabajo_id: ordenTrabajoId }),
    enabled: !!ordenTrabajoId,
  });

  const createBloqueoMutation = useMutation({
    mutationFn: (data) => base44.entities.BloqueoTecnico.create(withOrgId(data, userAccount)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bloqueos-tecnicos'] });
      setShowModal(false);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    createBloqueoMutation.mutate({
      orden_trabajo_id: ordenTrabajoId,
      tecnico_id: tecnicoId,
      tipo_bloqueo: formData.get('tipo_bloqueo'),
      descripcion: formData.get('descripcion'),
      estado: 'activo',
    });
  };

  const bloqueosActivos = bloqueos.filter(b => b.estado === 'activo');
  const bloqueosResueltos = bloqueos.filter(b => b.estado === 'resuelto');

  return (
    <>
      <Card className="border-0 shadow-md">
        <CardHeader className="border-b border-slate-100">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              Bloqueos Técnicos
            </CardTitle>
            <Button onClick={() => setShowModal(true)} size="sm" variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Reportar Bloqueo
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {/* Bloqueos Activos */}
          {bloqueosActivos.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm text-slate-700 mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-orange-600" />
                Activos ({bloqueosActivos.length})
              </h4>
              <div className="space-y-3">
                {bloqueosActivos.map((bloqueo) => (
                  <div key={bloqueo.id} className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <Badge className="bg-orange-100 text-orange-700 border-0 mb-2 capitalize">
                          {bloqueo.tipo_bloqueo.replace('_', ' ')}
                        </Badge>
                        <p className="text-sm text-slate-900 font-medium mb-1">{bloqueo.descripcion}</p>
                        <p className="text-xs text-slate-500">
                          Reportado {formatDistanceToNow(new Date(bloqueo.created_date), { addSuffix: true, locale: es })}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 p-3 bg-white rounded border border-orange-200">
                      <p className="text-xs text-orange-800">
                        🛡️ <strong>Protección activa:</strong> Este bloqueo quedará registrado. No se te atribuirá el retraso.
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bloqueos Resueltos */}
          {bloqueosResueltos.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm text-slate-500 mb-3">Resueltos</h4>
              <div className="space-y-2">
                {bloqueosResueltos.map((bloqueo) => (
                  <div key={bloqueo.id} className="p-3 bg-slate-50 rounded-lg opacity-60">
                    <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs mb-1 capitalize">
                      {bloqueo.tipo_bloqueo.replace('_', ' ')}
                    </Badge>
                    <p className="text-xs text-slate-600">{bloqueo.descripcion}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {bloqueos.length === 0 && (
            <div className="text-center py-8 text-slate-400">
              <Shield className="w-12 h-12 mx-auto mb-3" />
              <p>Sin bloqueos reportados</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reportar Bloqueo Técnico</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900">
                ℹ️ Reporta cualquier situación que impida continuar con el trabajo. Esto protege tu desempeño.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Tipo de Bloqueo *</Label>
              <Select name="tipo_bloqueo" required>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="falta_aprobacion">Falta de Aprobación</SelectItem>
                  <SelectItem value="falta_repuesto">Falta de Repuesto</SelectItem>
                  <SelectItem value="espera_cliente">Espera de Cliente</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descripción *</Label>
              <Textarea
                name="descripcion"
                placeholder="Describe el bloqueo..."
                required
                rows={3}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createBloqueoMutation.isPending}>
                Reportar Bloqueo
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}