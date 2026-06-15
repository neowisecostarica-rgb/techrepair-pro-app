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

/**
 * IniciarActividad — P0.2-C
 * Toda creación de actividad técnica pasa por initTechnicalActivity (orquestador backend).
 * El orquestador garantiza:
 *   - Idempotencia por OT (máx 1 actividad no finalizada)
 *   - Restricción de técnico con estado_atencion ACTIVO en otra OT
 *   - Orden correcto: transitionOT → crear actividad → setear ACTIVO
 */
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
      // Delegar al orquestador backend — contiene toda la lógica de validación,
      // transición de OT, creación de actividad y actualización de estado_atencion.
      const response = await base44.functions.invoke('initTechnicalActivity', {
        orden_trabajo_id: ordenTrabajoId,
        tecnico_id: user.id,
        tipo_actividad: tipoActividad,
        subtipo: subtipo || '',
        inventario_id: inventarioId || null,
      });

      if (!response?.data?.success) {
        throw new Error(response?.data?.error || 'Error al iniciar la actividad técnica');
      }

      return response.data.actividad;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actividades_tecnicas'] });
      queryClient.invalidateQueries({ queryKey: ['expediente-ot'] });
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
                  {/* diagnostico está excluido — solo el Centro de Mando puede iniciarlo */}
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