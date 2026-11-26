import { useI18n } from '@/i18n';
import React, { useState, useRef } from 'react';
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
  const submitLock = useRef(false);
  const [prepared, setPrepared] = useState(null);

  const createMensajeMutation = useMutation({
    mutationFn: async (/** @type {Record<string, any>} */ data) => {
      const result = await recordCustomerMessage(clienteId, data);
      if (!result?.mensaje?.id || result.mensaje.cliente_id !== clienteId || result.mensaje.enviado !== false) throw new Error('No se confirmó el registro del mensaje.');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: customer360QueryKeys.detail(clienteId) });
      toast({ title: "Mensaje preparado", description: "Abre el canal externo para enviarlo manualmente." });
    },
    onError: (error) => toast({ variant: 'destructive', title: t('comm.errorRegister','No se pudo registrar el mensaje'), description: error?.message || t('comm.errorRetry','Inténtalo nuevamente.') }),
  });

  const resetForm = () => {
    setPrepared(null);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitLock.current || prepared || !clienteId || !contenido.trim() || !asunto.trim()) return;
    const formData = new FormData(e.target);
    const canal = formData.get('canal');
    const telefono = cliente?.telefono?.replace(/\D/g, '');
    let url;
    if (canal === 'email' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliente?.email || '')) {
      url = `mailto:${encodeURIComponent(cliente.email)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(contenido)}`;
    } else if (['whatsapp', 'sms'].includes(String(canal)) && /^[1-9]\d{7,14}$/.test(telefono || '')) {
      url = canal === 'whatsapp' ? `https://wa.me/${telefono}?text=${encodeURIComponent(contenido)}` : `sms:${telefono}?body=${encodeURIComponent(contenido)}`;
    } else {
      toast({ title: 'Destinatario no válido', description: 'Revisa el correo o teléfono con código de país.', variant: 'destructive' });
      return;
    }
    submitLock.current = true;
    try {
      await createMensajeMutation.mutateAsync({
        cliente_id: clienteId,
        orden_trabajo_id: ordenTrabajoId || null,
        tipo: plantillaSeleccionada || 'general',
        plantilla_usada: plantillaSeleccionada ? getPlantillas()[plantillaSeleccionada].nombre : null,
        asunto: asunto.trim(),
        contenido: contenido.trim(),
        canal,
        enviado: false,
      });
      setPrepared(url);
    } catch {
      // onError presents the failure; never open an external channel.
    } finally { submitLock.current = false; }
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
                      <span title={t('comm.sent','Enviado')}><CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" /></span>
                    )}
                    {mensaje.leido && (
                      <span title={t('comm.read','Leído')}><Mail className="w-3 h-3 text-blue-400 shrink-0" /></span>
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

      <Dialog open={showModal} onOpenChange={value => { if (!submitLock.current) { setShowModal(value); if (!value) resetForm(); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('closure.prepareCustomerMessage','Preparar Mensaje al Cliente')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900">
                {t('comm.infoBanner','ℹ️ Primero registra el mensaje preparado. Después abre el canal externo y confirma el envío manualmente.')}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{t('comm.templateOptional','Plantilla (Opcional)')}</Label>
              <Select disabled={!!prepared || createMensajeMutation.isPending} value={plantillaSeleccionada} onValueChange={handlePlantillaChange}>
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
                disabled={!!prepared || createMensajeMutation.isPending} value={asunto}
                onChange={(e) => setAsunto(e.target.value)}
                placeholder={t('comm.subjectPlaceholder','Asunto del mensaje')}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>{t('comm.content','Contenido *')}</Label>
              <Textarea
                disabled={!!prepared || createMensajeMutation.isPending} value={contenido}
                onChange={(e) => setContenido(e.target.value)}
                placeholder={t('comm.contentPlaceholder','Escribe el mensaje...')}
                required
                rows={8}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('comm.externalChannel','Canal externo *')}</Label>
              <Select disabled={!!prepared || createMensajeMutation.isPending} name="canal" defaultValue="email" required>
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
              <Button type="button" disabled={createMensajeMutation.isPending} variant="outline" onClick={() => {
                setShowModal(false);
                resetForm();
              }}>
                {t('comm.cancel','Cancelar')}
              </Button>
              {prepared ? <Button asChild><a href={prepared} target="_blank" rel="noopener noreferrer">Abrir canal externo</a></Button> : <Button type="submit" disabled={createMensajeMutation.isPending}><Send className="w-4 h-4 mr-2" />Preparar y registrar</Button>}
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}