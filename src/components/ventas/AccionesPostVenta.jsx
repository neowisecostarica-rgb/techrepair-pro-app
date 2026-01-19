import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Printer, Mail, MessageSquare, FileText } from 'lucide-react';
import TiqueteVenta from './TiqueteVenta';
import { useAuthContext } from '@/components/contexts/AuthContext';

export default function AccionesPostVenta({ venta, variant = 'default' }) {
  const [showTiquete, setShowTiquete] = useState(false);
  const [showReenvio, setShowReenvio] = useState(false);
  const [canalReenvio, setCanalReenvio] = useState(null);
  const [destinatario, setDestinatario] = useState('');
  const { user, effectiveOrgId } = useAuthContext();
  const queryClient = useQueryClient();

  const logMutation = useMutation({
    mutationFn: async (logData) => {
      return await base44.entities.ComprobanteVentaLog.create({
        organization_id: effectiveOrgId,
        venta_id: venta.id,
        user_id: user?.id || 'system',
        user_email: user?.email || 'system',
        ...logData
      });
    }
  });

  const handleReimprimir = async () => {
    await logMutation.mutateAsync({
      accion: 'reimpresion',
      canal: 'impresion',
      formato: venta.tipo_concepto === 'revision_diagnostico' ? '80mm' : 'normal'
    });
    setShowTiquete(true);
  };

  const handleReenviar = (canal) => {
    setCanalReenvio(canal);
    setShowReenvio(true);
  };

  const handleConfirmarReenvio = async () => {
    if (!destinatario.trim()) {
      alert('Ingrese el destinatario');
      return;
    }

    await logMutation.mutateAsync({
      accion: canalReenvio === 'whatsapp' ? 'reenvio_whatsapp' : 'reenvio_email',
      canal: canalReenvio,
      formato: venta.tipo_concepto === 'revision_diagnostico' ? 'a4' : 'normal',
      destinatario: destinatario
    });

    alert(`📨 Comprobante enviado por ${canalReenvio === 'whatsapp' ? 'WhatsApp' : 'correo'}`);
    setShowReenvio(false);
    setDestinatario('');
  };

  if (variant === 'compact') {
    return (
      <>
        <div className="flex gap-2">
          <Button
            onClick={handleReimprimir}
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

        <Dialog open={showReenvio} onOpenChange={setShowReenvio}>
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
                  value={destinatario}
                  onChange={(e) => setDestinatario(e.target.value)}
                  placeholder={canalReenvio === 'whatsapp' ? '+506 1234 5678' : 'cliente@email.com'}
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setShowReenvio(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleConfirmarReenvio}>
                  Enviar
                </Button>
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
          onClick={handleReimprimir}
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

      <Dialog open={showReenvio} onOpenChange={setShowReenvio}>
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
                value={destinatario}
                onChange={(e) => setDestinatario(e.target.value)}
                placeholder={canalReenvio === 'whatsapp' ? '+506 1234 5678' : 'cliente@email.com'}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowReenvio(false)}>
                Cancelar
              </Button>
              <Button onClick={handleConfirmarReenvio}>
                Enviar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}