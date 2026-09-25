import { useI18n } from '@/i18n';
import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MessageSquare, Send, Mail, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { customer360QueryKeys, recordCustomerMessage } from '@/api/customer360';
import { useToast } from '@/components/ui/use-toast';

export default function ComunicacionCliente({ clienteId, ordenTrabajoId, cliente, mensajes = [] }) {
  const { t } = useI18n();
  const getPlantillas = () => ({
    estado_ot: { nombre: t('comm.templates.statusUpdate.name','Actualización de Estado'), asunto: t('comm.templates.statusUpdate.subject','Actualización de su orden de trabajo'), contenido: t('comm.templates.statusUpdate.content','Estimado cliente,...') },
    cotizacion: { nombre: t('comm.templates.quote.name','Envío de Cotización'), asunto: t('comm.templates.quote.subject','Cotización para su servicio'), contenido: t('comm.templates.quote.content','Estimado cliente,...') },
    seguimiento: { nombre: t('comm.templates.followUp.name','Seguimiento'), asunto: t('comm.templates.followUp.subject','Seguimiento de su solicitud'), contenido: t('comm.templates.followUp.content','Estimado cliente,...') },
    recordatorio: { nombre: t('comm.templates.reminder.name','Recordatorio'), asunto: t('comm.templates.reminder.subject','Recordatorio importante'), contenido: t('comm.templates.reminder.content','Estimado cliente,...') },
  });
  const [showModal, setShowModal] = useState(false);
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState('');
  const [asunto, setAsunto] = useState('');
  const [contenido, setContenido] = useState('');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMensajeMutation = useMutation({
    mutationFn: (data) => recordCustomerMessage(clienteId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customer360QueryKeys.detail(clienteId) });
      setShowModal(false);
      resetForm();
    },
    onError: (error) => toast({ variant: 'destructive', title: t('comm.errorRegister','No se pudo registrar el mensaje'), description: error?.message || t('comm.errorRetry','Inténtalo nuevamente.') }),
  });

  const resetForm = () => {
    setPlantillaSeleccionada('');
    setAsunto('');
    setContenido('');
  };

  const handlePlantillaChange = (tipo) => {
    setPlantillaSeleccionada(tipo);
    const plantilla = getPlantillas()[tipo];
    if (plantilla) {
      setAsunto(plantilla.asunto);
      setContenido(plantilla.contenido);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const canal = formData.get('canal');
    const telefono = cliente?.telefono?.replace(/\D/g, '');

    if (canal === 'email') {
      if (!cliente?.email) {
        toast({ title: t('comm.noEmail','Correo no disponible'), description: t('comm.noEmailDesc','El cliente no tiene correo electrónico registrado.') });
        return;
      }
      window.open(`mailto:${encodeURIComponent(cliente.email)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(contenido)}`, '_blank');
    } else if (canal === 'whatsapp') {
      if (!telefono) {
        toast({ title: t('comm.noPhone','Teléfono no disponible'), description: t('comm.noPhoneDesc','El cliente no tiene teléfono registrado.') });
        return;
      }
      window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(contenido)}`, '_blank', 'noopener,noreferrer');
    } else if (canal === 'sms') {
      if (!telefono) {
        toast({ title: t('comm.noPhone','Teléfono no disponible'), description: t('comm.noPhoneDesc','El cliente no tiene teléfono registrado.') });
        return;
      }
      window.open(`sms:${telefono}?body=${encodeURIComponent(contenido)}`, '_blank');
    }

    createMensajeMutation.mutate({
      cliente_id: clienteId,
      orden_trabajo_id: ordenTrabajoId || null,
      tipo: plantillaSeleccionada || 'general',
      plantilla_usada: plantillaSeleccionada ? getPlantillas()[plantillaSeleccionada].nombre : null,
      asunto: asunto,
      contenido: contenido,
      canal,
      enviado: false,
    });
  };

  const tipoConfig = {
    estado_ot: { color: 'bg-blue-100 text-blue-700', label: t('comm.types.status','Estado OT') },
    cotizacion: { color: 'bg-green-100 text-green-700', label: t('comm.types.quote','Cotización') },
    seguimiento: { color: 'bg-purple-100 text-purple-700', label: t('comm.types.followUp','Seguimiento') },
    general: { color: 'bg-slate-100 text-slate-700', label: t('comm.types.general','General') },
    recordatorio: { color: 'bg-orange-100 text-orange-700', label: t('comm.types.reminder','Recordatorio') },
  };

  return (
    <>
      {/* ── Shell visual homologado ── */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">

        {/* Header compacto unificado */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
          <MessageSquare className="w-3.5 h-3.5 text-orange-500" />
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">{t('comm.communication','Comunicación')}</span>
          <span className="text-xs text-slate-400 tabular-nums">{mensajes.length}</span>
          <div className="ml-auto">
            <Button onClick={() => setShowModal(true)} size="sm" variant="outline"
              className="h-6 px-2 text-[11px] border-slate-200 text-slate-600 hover:text-slate-900">
              <Send className="w-3 h-3 mr-1" />
              {t('comm.new','Nuevo')}
            </Button>
          </div>
        </div>

        {/* Lista */}
        {mensajes.length === 0 ? (
          <div className="px-4 py-3 text-xs text-slate-400 italic">{t('comm.noMessages','Sin mensajes registrados')}</div>
        ) : (
          <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
            {mensajes.map((mensaje) => {
              const config = tipoConfig[mensaje.tipo] || tipoConfig.general;
              return (
                <div key={mensaje.id} className="px-4 py-2.5 hover:bg-slate-50/70 transition-colors">
                  {/* Fila principal */}
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-xs font-medium text-slate-800 truncate" title={mensaje.asunto}>
                      {mensaje.asunto || t('comm.noSubject','(sin asunto)')}
                    </span>
                    <Badge className={`${config.color} border-0 text-[10px] px-1.5 py-0 leading-tight shrink-0`}>
                      {config.label}
                    </Badge>
                    {mensaje.enviado && (
                      <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" title={t('comm.sent','Enviado')} />
                    )}
                    {mensaje.leido && (
                      <Mail className="w-3 h-3 text-blue-400 shrink-0" title={t('comm.read','Leído')} />
                    )}
                    <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                      {format(new Date(mensaje.created_date), 'dd/MM/yy', { locale: es })}
                    </span>
                  </div>
                  {/* Cuerpo truncado + metadatos */}
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="flex-1 text-[10px] text-slate-400 truncate" title={mensaje.contenido}>
                      {mensaje.contenido?.slice(0, 80)}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {mensaje.canal} · {mensaje.remitente_nombre?.split(' ')[0]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('closure.prepareCustomerMessage','Preparar Mensaje al Cliente')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900">
                {t('comm.infoBanner','ℹ️ El sistema abrirá el canal externo elegido y registrará el intento. Debes confirmar el envío en WhatsApp, correo o SMS.')}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{t('comm.templateOptional','Plantilla (Opcional)')}</Label>
              <Select value={plantillaSeleccionada} onValueChange={handlePlantillaChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t('comm.selectTemplate','Seleccionar plantilla o escribir mensaje personalizado')} />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(getPlantillas()).map(([key, plantilla]) => (
                    <SelectItem key={key} value={key}>{plantilla.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('comm.subject','Asunto *')}</Label>
              <Input
                value={asunto}
                onChange={(e) => setAsunto(e.target.value)}
                placeholder={t('comm.subjectPlaceholder','Asunto del mensaje')}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>{t('comm.content','Contenido *')}</Label>
              <Textarea
                value={contenido}
                onChange={(e) => setContenido(e.target.value)}
                placeholder={t('comm.contentPlaceholder','Escribe el mensaje...')}
                required
                rows={8}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('comm.externalChannel','Canal externo *')}</Label>
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
                {t('comm.cancel','Cancelar')}
              </Button>
              <Button type="submit" disabled={createMensajeMutation.isPending}>
                <Send className="w-4 h-4 mr-2" />
                {t('comm.openChannel','Abrir Canal y Registrar')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}