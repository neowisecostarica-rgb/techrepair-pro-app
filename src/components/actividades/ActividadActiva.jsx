import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuthContext } from '../contexts/AuthContext';
import { Clock, CheckCircle, AlertCircle } from 'lucide-react';

export default function ActividadActiva({ actividad, onUpdated }) {
  const [duracionVista, setDuracionVista] = useState(0);
  const [showBloqueoModal, setShowBloqueoModal] = useState(false);
  const [causaBloqueo, setCausaBloqueo] = useState('');
  const queryClient = useQueryClient();
  const { user, effectiveOrgId } = useAuthContext();

  // Actualizar duración visual cada minuto
  useEffect(() => {
    const calcularDuracion = () => {
      if (actividad?.started_at) {
        const inicio = new Date(actividad.started_at);
        const ahora = new Date();
        const minutos = Math.floor((ahora - inicio) / 60000);
        setDuracionVista(minutos);
      }
    };

    calcularDuracion();
    const interval = setInterval(calcularDuracion, 60000);
    return () => clearInterval(interval);
  }, [actividad?.started_at]);

  const finalizarMutation = useMutation({
    mutationFn: async () => {
      // 1) now ISO
      const now = new Date().toISOString();

      // 2) Update #1
      await base44.entities.ActividadTecnica.update(actividad.id, {
        ended_at: now,
        estado: 'finalizada'
      });

      // 3) Re-fetch
      const actualizada = await base44.entities.ActividadTecnica.filter({ id: actividad.id });
      if (actualizada.length === 0) {
        throw new Error('Actividad no encontrada');
      }
      const a = actualizada[0];

      // 4) Calcular duracion_minutos
      const duracion = Math.floor((new Date(now) - new Date(a.started_at)) / 60000);
      if (duracion < 0) {
        throw new Error('Duración inválida');
      }

      // 5) Update #2
      await base44.entities.ActividadTecnica.update(actividad.id, {
        duracion_minutos: duracion
      });

    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actividades_tecnicas'] });
      if (onUpdated) onUpdated();
    }
  });

  const bloquearMutation = useMutation({
    mutationFn: async () => {
      if (!causaBloqueo.trim()) {
        throw new Error('La causa del bloqueo es obligatoria');
      }

      // 1) now ISO
      const now = new Date().toISOString();

      // 2) Update #1
      await base44.entities.ActividadTecnica.update(actividad.id, {
        ended_at: now,
        estado: 'bloqueada',
        causa_bloqueo: causaBloqueo
      });

      // 3) Re-fetch
      const actualizada = await base44.entities.ActividadTecnica.filter({ id: actividad.id });
      if (actualizada.length === 0) {
        throw new Error('Actividad no encontrada');
      }
      const a = actualizada[0];

      // 4) Calcular duracion_minutos
      const duracion = Math.floor((new Date(now) - new Date(a.started_at)) / 60000);
      if (duracion < 0) {
        throw new Error('Duración inválida');
      }

      // 5) Update #2
      await base44.entities.ActividadTecnica.update(actividad.id, {
        duracion_minutos: duracion
      });

    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actividades_tecnicas'] });
      setShowBloqueoModal(false);
      setCausaBloqueo('');
      if (onUpdated) onUpdated();
    }
  });

  if (!actividad) return null;

  const tipoLabels = {
    diagnostico: 'Diagnóstico',
    reparacion: 'Reparación',
    instalacion: 'Instalación',
    prueba: 'Prueba',
    limpieza: 'Limpieza',
    entrega: 'Entrega',
    otro: 'Otro'
  };

  return (
    <>
      <Card className="border-2 border-emerald-500 bg-emerald-50">
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-xl flex items-center justify-center">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <div>
                <Badge className="bg-emerald-600 text-white mb-1">Actividad en Progreso</Badge>
                <h3 className="text-lg font-bold text-slate-900">
                  {tipoLabels[actividad.tipo_actividad] || actividad.tipo_actividad}
                </h3>
                {actividad.subtipo && (
                  <p className="text-sm text-slate-600">{actividad.subtipo}</p>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Inicio</p>
                <p className="font-medium">
                  {new Date(actividad.started_at).toLocaleTimeString('es', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Duración</p>
                <p className="text-2xl font-bold text-emerald-600">
                  {duracionVista} min
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => finalizarMutation.mutate()}
              disabled={finalizarMutation.isPending}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-blue-500"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {finalizarMutation.isPending ? 'Finalizando...' : 'Finalizar'}
            </Button>
            <Button
              onClick={() => setShowBloqueoModal(true)}
              variant="outline"
              className="flex-1 border-orange-500 text-orange-700 hover:bg-orange-50"
            >
              <AlertCircle className="w-4 h-4 mr-2" />
              Bloquear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Modal Bloqueo */}
      <Dialog open={showBloqueoModal} onOpenChange={setShowBloqueoModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar Actividad como Bloqueada</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="causa_bloqueo">Causa del Bloqueo *</Label>
              <Textarea
                id="causa_bloqueo"
                value={causaBloqueo}
                onChange={(e) => setCausaBloqueo(e.target.value)}
                placeholder="Ej: Falta repuesto en stock, esperando aprobación del cliente..."
                rows={3}
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowBloqueoModal(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => bloquearMutation.mutate()}
                disabled={bloquearMutation.isPending || !causaBloqueo.trim()}
                className="bg-orange-500 hover:bg-orange-600"
              >
                {bloquearMutation.isPending ? 'Bloqueando...' : 'Confirmar Bloqueo'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
