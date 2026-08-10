import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { listIdentityAccounts } from '@/api/identity';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { validarSolapamiento } from '@/components/calendario/validarSolapamiento';

/**
 * P0.4 TENANT ZERO: Componente para agendar desde OT
 * Permite crear eventos de calendario ligados a una orden de trabajo
 */
export default function AgendarDesdeOT({ ordenTrabajo, effectiveOrgId, onSuccess }) {
  const [showModal, setShowModal] = useState(false);
  const [creando, setCreando] = useState(false);
  const queryClient = useQueryClient();

  // Obtener técnicos disponibles
  const { data: tecnicos = [] } = useQuery({
    queryKey: ['tecnicos', effectiveOrgId],
    queryFn: async () => {
      const { accounts } = await listIdentityAccounts(effectiveOrgId);
      return accounts.filter(account => account.role === 'TECHNICIAN' && account.status === 'active');
    },
    enabled: !!effectiveOrgId && showModal,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setCreando(true);

    try {
      const formData = new FormData(e.target);
      const tecnicoId = formData.get('tecnico_id');
      const fecha = formData.get('fecha');
      const horaInicio = formData.get('hora_inicio');
      const horaFin = formData.get('hora_fin');
      const tipo = formData.get('tipo');

      // Validar solapamiento
      const validacion = await validarSolapamiento({
        tecnicoId,
        organizationId: effectiveOrgId,
        fecha,
        horaInicio,
        horaFin,
      });

      if (validacion.conflicto) {
        alert(validacion.mensaje);
        setCreando(false);
        return;
      }

      // Crear cita
      await base44.entities.Cita.create({
        organization_id: effectiveOrgId,
        orden_trabajo_id: ordenTrabajo.id,
        cliente_id: ordenTrabajo.cliente_id,
        tipo,
        fecha,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        tecnico_asignado_id: tecnicoId,
        tecnico_asignado_email: tecnicos.find(t => t.user_id === tecnicoId)?.user_email,
        motivo: `${tipo === 'diagnostico' ? 'Diagnóstico' : 'Reparación'} - OT ${ordenTrabajo.id.slice(-6)}`,
        estado: 'programada',
      });

      queryClient.invalidateQueries({ queryKey: ['citas'] });
      
      setShowModal(false);
      if (onSuccess) onSuccess();
      alert('✅ Evento agendado correctamente');
    } catch (error) {
      console.error('Error al agendar:', error);
      alert('Error al agendar: ' + error.message);
    } finally {
      setCreando(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setShowModal(true)}
        variant="outline"
        className="gap-2"
      >
        <Calendar className="w-4 h-4" />
        Agendar Diagnóstico/Reparación
      </Button>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Agendar desde OT</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="bg-slate-50 rounded-lg p-3 text-sm">
              <p className="font-medium text-slate-900">OT: {ordenTrabajo.id.slice(-8)}</p>
              <p className="text-slate-600">Estado: {ordenTrabajo.estado}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo de Evento *</Label>
              <Select name="tipo" required defaultValue="diagnostico">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="diagnostico">Diagnóstico</SelectItem>
                  <SelectItem value="reparacion">Reparación</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tecnico_id">Técnico Asignado *</Label>
              <Select name="tecnico_id" required>
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

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fecha">Fecha *</Label>
                <Input
                  type="date"
                  id="fecha"
                  name="fecha"
                  required
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hora_inicio">Hora Inicio *</Label>
                <Input
                  type="time"
                  id="hora_inicio"
                  name="hora_inicio"
                  required
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="hora_fin">Hora Fin *</Label>
                <Input
                  type="time"
                  id="hora_fin"
                  name="hora_fin"
                  required
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)} disabled={creando}>
                Cancelar
              </Button>
              <Button type="submit" disabled={creando}>
                {creando ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Agendando...
                  </>
                ) : (
                  'Agendar Evento'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
