import React, { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Printer, Mail, MessageSquare } from 'lucide-react';
import TiqueteVenta from './TiqueteVenta';
import { useAuthContext } from '@/components/contexts/AuthContext';
import { issuePublicLink } from '@/api/publicLinks';
import { useToast } from '@/components/ui/use-toast';

export default function AccionesPostVenta({ venta, variant = 'default' }) {
  const [showTiquete, setShowTiquete] = useState(false);
  const [showReenvio, setShowReenvio] = useState(false);
  const [canalReenvio, setCanalReenvio] = useState(null);
  const [destinatario, setDestinatario] = useState('');
  const { user, effectiveOrgId } = useAuthContext();
  const { toast } = useToast();
  const actionLock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [preparedLink, setPreparedLink] = useState(null);
  const logMutation = useMutation({
    mutationFn: async (/** @type {Record<string, any>} */ logData) => {
      return await base44.entities.ComprobanteVentaLog.create({
        organization_id: effectiveOrgId,
        venta_id: venta.id,
        user_id: user?.id || 'system',
        user_email: user?.email || 'system',
        ...logData
      });
    }
  });

  const runAction = async (action) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    try {
      if (!venta?.id || venta.estado !== 'pagada' || venta.organization_id !== effectiveOrgId || !user?.id) {
        throw new Error('No se confirmó una venta pagada de la organización activa.');
      }
      await action();
    } catch (error) {
      toast({ title: 'Acción no confirmada', description: error?.message || 'Actualiza la venta antes de repetir.', variant: 'destructive' });
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };

  const logConfirmed = async (data) => {
    const result = await logMutation.mutateAsync(data);
    if (!result?.id || result?.error) throw new Error(result?.error || 'No se confirmó el registro del comprobante.');
  };

  const handleReimprimir = () => runAction(async () => {
    await logConfirmed({
      accion: 'reimpresion',
      canal: 'impresion',
      formato: venta.tipo_concepto === 'revision_diagnostico' ? '80mm' : 'normal'
    });
    setShowTiquete(true);
  });

  const handleReenviar = (canal) => {
    if (actionLock.current) return;
    setCanalReenvio(canal);
    setDestinatario('');
    setPreparedLink(null);
    setShowReenvio(true);
  };

  const handleConfirmarReenvio = () => runAction(async () => {
    const target = destinatario.trim();
    const phone = target.replace(/\D/g, '');
    if (canalReenvio === 'whatsapp' ? !/^[1-9]\d{7,14}$/.test(phone) : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      throw new Error('Ingresa un destinatario válido, con código de país si corresponde.');
    }
    const receiptUrl = await issuePublicLink('receipt', venta.id);
    const mensaje = `Comprobante de venta: ${receiptUrl}`;
    const url = canalReenvio === 'whatsapp'
      ? `https://wa.me/${phone}?text=${encodeURIComponent(mensaje)}`
      : `mailto:${encodeURIComponent(target)}?subject=${encodeURIComponent('Comprobante de venta')}&body=${encodeURIComponent(mensaje)}`;
    await logConfirmed({
      accion: canalReenvio === 'whatsapp' ? 'reenvio_whatsapp' : 'reenvio_email',
      canal: canalReenvio,
      formato: venta.tipo_concepto === 'revision_diagnostico' ? 'a4' : 'normal',
      destinatario: target,
      notas: 'Comprobante preparado; envío externo no confirmado'
    });
    setPreparedLink(url);
    toast({ title: 'Comprobante preparado', description: 'Abre el canal externo y confirma el envío manualmente.' });
  });

  const closeShare = (open) => {
    if (actionLock.current) return;
    setShowReenvio(open);
    if (!open) setPreparedLink(null);
  };

  if (variant === 'compact') {
    return (
      <>
        <div className="flex gap-2">
          <Button
            disabled={busy} onClick={handleReimprimir}
            variant="outline"
            size="sm"
            className="text-emerald-600 border-emerald-300 hover:bg-emerald-50"
          >
            <Printer className="w-3 h-3 mr-1" />
            Reimprimir
          </Button>
          <Button
            onClick={() => handleReenviar('email')}
            variant="outline"
            size="sm"
            className="text-blue-600 border-blue-300 hover:bg-blue-50"
          >
            <Mail className="w-3 h-3 mr-1" />
            Email
          </Button>
          <Button
            onClick={() => handleReenviar('whatsapp')}
            variant="outline"
            size="sm"
            className="text-green-600 border-green-300 hover:bg-green-50"
          >
            <MessageSquare className="w-3 h-3 mr-1" />
            WhatsApp
          </Button>
        </div>

        <Dialog open={showTiquete} onOpenChange={setShowTiquete}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <TiqueteVenta venta={venta} onClose={() => setShowTiquete(false)} />
          </DialogContent>
        </Dialog>

        <Dialog open={showReenvio} onOpenChange={closeShare}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Reenviar Comprobante por {canalReenvio === 'whatsapp' ? 'WhatsApp' : 'Correo'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>
                  {canalReenvio === 'whatsapp' ? 'Número de teléfono' : 'Correo electrónico'}
                </Label>
                <Input
                  type={canalReenvio === 'whatsapp' ? 'tel' : 'email'}
                  disabled={busy || !!preparedLink} value={destinatario}
                  onChange={(e) => setDestinatario(e.target.value)}
                  placeholder={canalReenvio === 'whatsapp' ? '+506 1234 5678' : 'cliente@email.com'}
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" disabled={busy} onClick={() => closeShare(false)}>
                  Cancelar
                </Button>
                {preparedLink ? <Button asChild><a href={preparedLink} target="_blank" rel="noopener noreferrer">Abrir canal</a></Button> : <Button disabled={busy} onClick={handleConfirmarReenvio}>Preparar comprobante</Button>}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <div className="flex gap-3">
        <Button
          disabled={busy} onClick={handleReimprimir}
          variant="outline"
          className="flex-1 border-emerald-500 text-emerald-700 hover:bg-emerald-50"
        >
          <Printer className="w-4 h-4 mr-2" />
          Reimprimir Comprobante
        </Button>
        <Button
          onClick={() => handleReenviar('email')}
          variant="outline"
          className="flex-1 border-blue-500 text-blue-700 hover:bg-blue-50"
        >
          <Mail className="w-4 h-4 mr-2" />
          Reenviar por Email
        </Button>
        <Button
          onClick={() => handleReenviar('whatsapp')}
          variant="outline"
          className="flex-1 border-green-500 text-green-700 hover:bg-green-50"
        >
          <MessageSquare className="w-4 h-4 mr-2" />
          Reenviar por WhatsApp
        </Button>
      </div>

      <Dialog open={showTiquete} onOpenChange={setShowTiquete}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <TiqueteVenta venta={venta} onClose={() => setShowTiquete(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={showReenvio} onOpenChange={closeShare}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Reenviar Comprobante por {canalReenvio === 'whatsapp' ? 'WhatsApp' : 'Correo'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>
                {canalReenvio === 'whatsapp' ? 'Número de teléfono' : 'Correo electrónico'}
              </Label>
              <Input
                type={canalReenvio === 'whatsapp' ? 'tel' : 'email'}
                disabled={busy || !!preparedLink} value={destinatario}
                onChange={(e) => setDestinatario(e.target.value)}
                placeholder={canalReenvio === 'whatsapp' ? '+506 1234 5678' : 'cliente@email.com'}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" disabled={busy} onClick={() => closeShare(false)}>
                Cancelar
              </Button>
              {preparedLink ? <Button asChild><a href={preparedLink} target="_blank" rel="noopener noreferrer">Abrir canal</a></Button> : <Button disabled={busy} onClick={handleConfirmarReenvio}>Preparar comprobante</Button>}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
