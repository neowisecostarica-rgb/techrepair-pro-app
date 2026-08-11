import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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
  const [inventarioCantidad, setInventarioCantidad] = useState('1');
  const [confirmarConsumo, setConfirmarConsumo] = useState(false);
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
      // SSOT: tecnico_id debe ser el User.id (mismo valor que OrdenTrabajo.tecnico_asignado_id)
      const tecnicoId = user?.id;
      if (!tecnicoId) {
        throw new Error('No se pudo identificar al técnico. Por favor recarga la página e intenta nuevamente.');
      }

      // Delegar al orquestador backend — contiene toda la lógica de validación,
      // transición de OT, creación de actividad y actualización de estado_atencion.
      const response = await base44.functions.invoke('initTechnicalActivity', {
        orden_trabajo_id: ordenTrabajoId,
        tecnico_id: tecnicoId,
        tipo_actividad: tipoActividad,
        subtipo: subtipo || '',
        inventario_id: inventarioId || null,
        inventario_cantidad: inventarioId ? Number(inventarioCantidad) : null,
        confirmar_consumo_repuesto: Boolean(inventarioId && confirmarConsumo),
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
      setInventarioCantidad('1');
      setConfirmarConsumo(false);
      if (onSuccess) onSuccess();
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!tipoActividad) return;
    if (!user?.id) return;
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

            {inventarioId && (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="space-y-2">
                  <Label htmlFor="inventario_cantidad">Cantidad del repuesto</Label>
                  <Input
                    id="inventario_cantidad"
                    type="number"
                    min="1"
                    step="1"
                    value={inventarioCantidad}
                    onChange={(event) => setInventarioCantidad(event.target.value)}
                  />
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="confirmar_consumo_repuesto"
                    checked={confirmarConsumo}
                    onCheckedChange={(checked) => setConfirmarConsumo(checked === true)}
                  />
                  <Label htmlFor="confirmar_consumo_repuesto" className="text-sm leading-5">
                    Confirmo que este repuesto se consumira ahora. Iniciar la actividad por si solo no descuenta inventario.
                  </Label>
                </div>
              </div>
            )}

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

            {iniciarMutation.isError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {iniciarMutation.error?.message || 'Error al iniciar la actividad'}
              </div>
            )}

            <div className="flex gap-3 justify-end pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-gradient-to-r from-emerald-500 to-blue-500"
                disabled={iniciarMutation.isPending || !tipoActividad || !user?.id}
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
