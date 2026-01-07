import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MessageSquare, Send, Mail, CheckCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { withOrgId } from '@/components/hooks/useOrgData';

const PLANTILLAS = {
  estado_ot: {
    nombre: 'Actualización de Estado',
    asunto: 'Actualización de su orden de trabajo',
    contenido: 'Estimado cliente,\n\nQueremos informarle sobre el estado actual de su equipo:\n\n[ESTADO_ACTUAL]\n\nEstamos trabajando para completar el servicio lo antes posible.\n\nSaludos cordiales.'
  },
  cotizacion: {
    nombre: 'Envío de Cotización',
    asunto: 'Cotización para su servicio',
    contenido: 'Estimado cliente,\n\nAdjuntamos la cotización solicitada para su revisión.\n\nQuedamos atentos a sus comentarios.\n\nSaludos cordiales.'
  },
  seguimiento: {
    nombre: 'Seguimiento',
    asunto: 'Seguimiento de su solicitud',
    contenido: 'Estimado cliente,\n\nNos comunicamos para darle seguimiento a su solicitud y verificar si requiere información adicional.\n\nSaludos cordiales.'
  },
  recordatorio: {
    nombre: 'Recordatorio',
    asunto: 'Recordatorio importante',
    contenido: 'Estimado cliente,\n\nLe recordamos que su equipo está listo para ser retirado.\n\nHorario de atención: [HORARIO]\n\nSaludos cordiales.'
  }
};

export default function ComunicacionCliente({ clienteId, ordenTrabajoId, user, userAccount }) {
  const [showModal, setShowModal] = useState(false);
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState('');
  const [asunto, setAsunto] = useState('');
  const [contenido, setContenido] = useState('');
  const queryClient = useQueryClient();

  const { data: mensajes = [] } = useQuery({
    queryKey: ['mensajes-cliente', clienteId],
    queryFn: () => base44.entities.MensajeCliente.filter({ cliente_id: clienteId }),
    enabled: !!clienteId,
  });

  const createMensajeMutation = useMutation({
    mutationFn: (data) => base44.entities.MensajeCliente.create(withOrgId(data, userAccount)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mensajes-cliente'] });
      setShowModal(false);
      resetForm();
    },
  });

  const resetForm = () => {
    setPlantillaSeleccionada('');
    setAsunto('');
    setContenido('');
  };

  const handlePlantillaChange = (tipo) => {
    setPlantillaSeleccionada(tipo);
    const plantilla = PLANTILLAS[tipo];
    if (plantilla) {
      setAsunto(plantilla.asunto);
      setContenido(plantilla.contenido);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    createMensajeMutation.mutate({
      cliente_id: clienteId,
      orden_trabajo_id: ordenTrabajoId || null,
      remitente_id: user.id,
      remitente_nombre: user.full_name || user.email,
      tipo: plantillaSeleccionada || 'general',
      plantilla_usada: plantillaSeleccionada ? PLANTILLAS[plantillaSeleccionada].nombre : null,
      asunto: asunto,
      contenido: contenido,
      canal: formData.get('canal'),
      enviado: true,
      enviado_at: new Date().toISOString(),
    });
  };

  const tipoConfig = {
    estado_ot: { color: 'bg-blue-100 text-blue-700', label: 'Estado OT' },
    cotizacion: { color: 'bg-green-100 text-green-700', label: 'Cotización' },
    seguimiento: { color: 'bg-purple-100 text-purple-700', label: 'Seguimiento' },
    general: { color: 'bg-slate-100 text-slate-700', label: 'General' },
    recordatorio: { color: 'bg-orange-100 text-orange-700', label: 'Recordatorio' },
  };

  return (
    <>
      <Card className="border-0 shadow-md">
        <CardHeader className="border-b border-slate-100">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-600" />
              Comunicación con Cliente
            </CardTitle>
            <Button onClick={() => setShowModal(true)} size="sm">
              <Send className="w-4 h-4 mr-2" />
              Nuevo Mensaje
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {mensajes.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <MessageSquare className="w-12 h-12 mx-auto mb-3" />
              <p>No hay mensajes registrados</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {mensajes.map((mensaje) => {
                const config = tipoConfig[mensaje.tipo] || tipoConfig.general;
                
                return (
                  <div key={mensaje.id} className="p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge className={`${config.color} border-0 text-xs`}>
                          {config.label}
                        </Badge>
                        {mensaje.enviado && (
                          <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Enviado
                          </Badge>
                        )}
                        {mensaje.leido && (
                          <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">
                            Leído
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">
                        {formatDistanceToNow(new Date(mensaje.created_date), { addSuffix: true, locale: es })}
                      </p>
                    </div>
                    <p className="font-medium text-sm text-slate-900 mb-1">{mensaje.asunto}</p>
                    <p className="text-sm text-slate-600 mb-2 whitespace-pre-line">{mensaje.contenido}</p>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-slate-400" />
                      <p className="text-xs text-slate-500">
                        Por {mensaje.remitente_nombre} • {mensaje.canal}
                      </p>
                    </div>
                    {mensaje.plantilla_usada && (
                      <p className="text-xs text-slate-400 mt-1">
                        Plantilla: {mensaje.plantilla_usada}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Enviar Mensaje al Cliente</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900">
                ℹ️ Utiliza las plantillas oficiales para mantener la comunicación profesional y consistente.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Plantilla (Opcional)</Label>
              <Select value={plantillaSeleccionada} onValueChange={handlePlantillaChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar plantilla o escribir mensaje personalizado" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PLANTILLAS).map(([key, plantilla]) => (
                    <SelectItem key={key} value={key}>{plantilla.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Asunto *</Label>
              <Input
                value={asunto}
                onChange={(e) => setAsunto(e.target.value)}
                placeholder="Asunto del mensaje"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Contenido *</Label>
              <Textarea
                value={contenido}
                onChange={(e) => setContenido(e.target.value)}
                placeholder="Escribe el mensaje..."
                required
                rows={8}
              />
            </div>

            <div className="space-y-2">
              <Label>Canal de Envío *</Label>
              <Select name="canal" defaultValue="email" required>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={() => {
                setShowModal(false);
                resetForm();
              }}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMensajeMutation.isPending}>
                <Send className="w-4 h-4 mr-2" />
                Enviar Mensaje
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}