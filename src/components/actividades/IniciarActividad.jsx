import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuthContext } from '../contexts/AuthContext';
import { Play } from 'lucide-react';

export default function IniciarActividad({ ordenTrabajoId, onSuccess }) {
  const [open, setOpen] = useState(false);
  const [tipoActividad, setTipoActividad] = useState('');
  const [subtipo, setSubtipo] = useState('');
  const [inventarioId, setInventarioId] = useState('');
  const queryClient = useQueryClient();
  const { user, effectiveOrgId } = useAuthContext();

  const { data: inventario = [] } = useQuery({
    queryKey: ['inventario', effectiveOrgId],
    queryFn: () => base44.entities.Inventario.filter({
      organization_id: effectiveOrgId,
      estado: 'activo'
    }),
    enabled: !!effectiveOrgId && open
  });

  const iniciarMutation = useMutation({
    mutationFn: async () => {
      // A) Validar OT aún abierta
      const ots = await base44.entities.OrdenTrabajo.filter({ id: ordenTrabajoId });
      if (ots.length === 0) {
        throw new Error('Orden de trabajo no encontrada');
      }
      const ot = ots[0];
      if (['CERRADA', 'CANCELADA', 'FINALIZADA', 'ENTREGADA'].includes(ot.estado)) {
        throw new Error('No se puede iniciar actividad en OT cerrada o cancelada');
      }

      // B) Validar "solo una actividad en progreso por técnico"
      const actividadesActivas = await base44.entities.ActividadTecnica.filter({
        organization_id: effectiveOrgId,
        tecnico_id: user.id,
        estado: 'en_progreso',
        soft_deleted: false
      });
      if (actividadesActivas.length > 0) {
        throw new Error('Ya tienes una actividad en progreso. Finalízala primero.');
      }

      // C) Crear ActividadTecnica
      const nuevaActividad = await base44.entities.ActividadTecnica.create({
        organization_id: effectiveOrgId,
        orden_trabajo_id: ordenTrabajoId,
        tecnico_id: user.id,
        tecnico_email: user.email,
        tipo_actividad: tipoActividad,
        subtipo: subtipo || '',
        inventario_id: inventarioId || null,
        estado: 'en_progreso',
        started_at: new Date().toISOString(),
        ended_at: null,
        duracion_minutos: null,
        causa_bloqueo: '',
        resultado: null,
        notas: '',
        soft_deleted: false
      });

      // D) Auditoría
      await base44.entities.SuperAdminAudit.create({
        super_admin_id: user.id,
        super_admin_email: user.email,
        action: 'actividad_started',
        target_organization_id: effectiveOrgId,
        context: JSON.stringify({
          actividad_id: nuevaActividad.id,
          orden_trabajo_id: ordenTrabajoId,
          tipo_actividad: tipoActividad
        })
      });

      return nuevaActividad;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actividades_tecnicas'] });
      setOpen(false);
      setTipoActividad('');
      setSubtipo('');
      setInventarioId('');
      if (onSuccess) onSuccess();
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!tipoActividad) {
      alert('Selecciona un tipo de actividad');
      return;
    }
    iniciarMutation.mutate();
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="bg-gradient-to-r from-emerald-500 to-blue-500"
      >
        <Play className="w-4 h-4 mr-2" />
        Iniciar Actividad
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Iniciar Actividad</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="tipo_actividad">Tipo de Actividad *</Label>
              <Select value={tipoActividad} onValueChange={setTipoActividad}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="diagnostico">Diagnóstico</SelectItem>
                  <SelectItem value="reparacion">Reparación</SelectItem>
                  <SelectItem value="instalacion">Instalación</SelectItem>
                  <SelectItem value="prueba">Prueba</SelectItem>
                  <SelectItem value="limpieza">Limpieza</SelectItem>
                  <SelectItem value="entrega">Entrega</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subtipo">Detalle (opcional)</Label>
              <Input
                id="subtipo"
                value={subtipo}
                onChange={(e) => setSubtipo(e.target.value)}
                placeholder="Ej: Cambio pantalla iPhone 11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="inventario_id">Repuesto Principal (opcional)</Label>
              <Select value={inventarioId} onValueChange={setInventarioId}>
                <SelectTrigger>
                  <SelectValue placeholder="Ninguno" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Ninguno</SelectItem>
                  {inventario.map(item => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.nombre} - {item.sku}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-gradient-to-r from-emerald-500 to-blue-500"
                disabled={iniciarMutation.isPending}
              >
                {iniciarMutation.isPending ? 'Iniciando...' : 'Iniciar Actividad'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}