import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle, XCircle, FileText, Package, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export default function AprobacionesPanel({ userAccount, user }) {
  const [showRechazoModal, setShowRechazoModal] = useState(false);
  const [itemActual, setItemActual] = useState(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const queryClient = useQueryClient();

  // Cotizaciones pendientes de aprobación
  const { data: cotizacionesPendientes = [] } = useQuery({
    queryKey: ['cotizaciones-aprobacion', userAccount?.organization_id],
    queryFn: () => base44.entities.Cotizacion.filter({
      organization_id: userAccount.organization_id,
      requiere_aprobacion: true,
      estado: 'borrador'
    }),
    enabled: !!userAccount?.organization_id,
  });

  // Solicitudes técnicas pendientes
  const { data: solicitudesPendientes = [] } = useQuery({
    queryKey: ['solicitudes-aprobacion', userAccount?.organization_id],
    queryFn: () => base44.entities.SolicitudTecnica.filter({
      organization_id: userAccount.organization_id,
      estado: 'requested'
    }),
    enabled: !!userAccount?.organization_id,
  });

  // Aprobar cotización
  const aprobarCotizacionMutation = useMutation({
    mutationFn: (cotizacionId) => base44.entities.Cotizacion.update(cotizacionId, {
      aprobada_por: user.id,
      aprobada_at: new Date().toISOString()
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cotizaciones-aprobacion'] });
    },
  });

  // Rechazar cotización
  const rechazarCotizacionMutation = useMutation({
    mutationFn: ({ id, motivo }) => base44.entities.Cotizacion.update(id, {
      estado: 'rechazada',
      notas: `Rechazada por admin: ${motivo}`
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cotizaciones-aprobacion'] });
      setShowRechazoModal(false);
      setItemActual(null);
      setMotivoRechazo('');
    },
  });

  // Aprobar solicitud técnica
  const aprobarSolicitudMutation = useMutation({
    mutationFn: (solicitudId) => base44.entities.SolicitudTecnica.update(solicitudId, {
      estado: 'approved',
      aprobado_por: user.id,
      aprobado_at: new Date().toISOString()
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes-aprobacion'] });
    },
  });

  // Rechazar solicitud técnica
  const rechazarSolicitudMutation = useMutation({
    mutationFn: ({ id, motivo }) => base44.entities.SolicitudTecnica.update(id, {
      estado: 'rejected',
      motivo_rechazo: motivo
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes-aprobacion'] });
      setShowRechazoModal(false);
      setItemActual(null);
      setMotivoRechazo('');
    },
  });

  const handleRechazar = (item, tipo) => {
    setItemActual({ ...item, tipo });
    setShowRechazoModal(true);
  };

  const handleConfirmarRechazo = () => {
    if (!motivoRechazo.trim()) {
      alert('Debes indicar el motivo del rechazo');
      return;
    }

    if (itemActual.tipo === 'cotizacion') {
      rechazarCotizacionMutation.mutate({ id: itemActual.id, motivo: motivoRechazo });
    } else if (itemActual.tipo === 'solicitud') {
      rechazarSolicitudMutation.mutate({ id: itemActual.id, motivo: motivoRechazo });
    }
  };

  return (
    <>
      <Card className="border-0 shadow-lg">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <AlertCircle className="w-6 h-6 text-orange-600" />
            Aprobaciones Pendientes
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <Tabs defaultValue="cotizaciones">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="cotizaciones">
                <FileText className="w-4 h-4 mr-2" />
                Cotizaciones ({cotizacionesPendientes.length})
              </TabsTrigger>
              <TabsTrigger value="solicitudes">
                <Package className="w-4 h-4 mr-2" />
                Solicitudes ({solicitudesPendientes.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="cotizaciones" className="space-y-3">
              {cotizacionesPendientes.length === 0 ? (
                <p className="text-center py-8 text-slate-400">No hay cotizaciones pendientes de aprobación</p>
              ) : (
                cotizacionesPendientes.map((cot) => (
                  <div key={cot.id} className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <Badge className="bg-yellow-100 text-yellow-700 border-0 mb-2">
                          Descuento alto
                        </Badge>
                        <p className="font-semibold text-slate-900">Total: ₡{cot.total.toLocaleString()}</p>
                        <p className="text-sm text-slate-600">Descuento: ₡{cot.descuento_total.toLocaleString()}</p>
                        <p className="text-xs text-slate-500">
                          Creada {formatDistanceToNow(new Date(cot.created_date), { addSuffix: true, locale: es })}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => aprobarCotizacionMutation.mutate(cot.id)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Aprobar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRechazar(cot, 'cotizacion')}
                          className="text-red-600 border-red-200 hover:bg-red-50"
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Rechazar
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="solicitudes" className="space-y-3">
              {solicitudesPendientes.length === 0 ? (
                <p className="text-center py-8 text-slate-400">No hay solicitudes pendientes de aprobación</p>
              ) : (
                solicitudesPendientes.map((sol) => (
                  <div key={sol.id} className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <Badge className="bg-blue-100 text-blue-700 border-0 mb-2 capitalize">
                          {sol.tipo}
                        </Badge>
                        <p className="font-semibold text-slate-900">{sol.descripcion}</p>
                        <p className="text-sm text-slate-600">Cantidad: {sol.cantidad}</p>
                        <p className="text-xs text-slate-500">
                          Solicitada {formatDistanceToNow(new Date(sol.created_date), { addSuffix: true, locale: es })}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => aprobarSolicitudMutation.mutate(sol.id)}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Aprobar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRechazar(sol, 'solicitud')}
                          className="text-red-600 border-red-200 hover:bg-red-50"
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Rechazar
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

          </Tabs>
        </CardContent>
      </Card>

      {/* Modal de Rechazo */}
      <Dialog open={showRechazoModal} onOpenChange={setShowRechazoModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar {itemActual?.tipo === 'cotizacion' ? 'Cotización' : 'Solicitud'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-slate-600 mb-2">Motivo del rechazo:</p>
              <Textarea
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
                placeholder="Explica el motivo..."
                rows={4}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowRechazoModal(false)}>
                Cancelar
              </Button>
              <Button onClick={handleConfirmarRechazo} className="bg-red-600 hover:bg-red-700">
                Confirmar Rechazo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
