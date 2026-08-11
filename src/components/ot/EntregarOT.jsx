import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, Loader2, Package, ShieldCheck } from 'lucide-react';

const TEXTO_LEGAL_CHECKBOX = 'Confirmo que he recibido el equipo y el servicio descrito en esta orden de trabajo, y que el equipo ha sido entregado en las condiciones acordadas.';
const newOperationKey = () => `delivery_${crypto.randomUUID()}`;

export default function EntregarOT({ ordenTrabajo, effectiveRole, onSuccess }) {
  const [showModal, setShowModal] = useState(false);
  const [acceptance, setAcceptance] = useState(false);
  const [note, setNote] = useState('');
  const [operationKey, setOperationKey] = useState(newOperationKey);
  const queryClient = useQueryClient();

  useEffect(() => {
    setOperationKey(newOperationKey());
    setAcceptance(false);
    setNote('');
    setShowModal(false);
  }, [ordenTrabajo?.id]);

  const delivery = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('deliverWorkOrder', {
        work_order_id: ordenTrabajo.id,
        acceptance,
        nota_entrega: note || null,
        operation_key: operationKey,
      });
      const result = response?.data ?? response;
      if (!result?.success) {
        const code = result?.code ? ` (${result.code})` : '';
        throw new Error(`${result?.error || 'No se pudo completar la entrega'}${code}`);
      }
      return result;
    },
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      queryClient.invalidateQueries({ queryKey: ['expediente-ot'] });
      queryClient.invalidateQueries({ queryKey: ['garantias'] });
      setShowModal(false);
      setAcceptance(false);
      setNote('');
      setOperationKey(newOperationKey());
      onSuccess?.(result);
    },
    onError: error => {
      alert(`Error al entregar: ${error.message}`);
    },
  });

  if (ordenTrabajo?.estado !== 'FINALIZADA') return null;
  if (!['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES'].includes(effectiveRole)) return null;

  return (
    <>
      <Button onClick={() => setShowModal(true)} className="bg-gradient-to-r from-purple-500 to-indigo-500">
        <Package className="w-4 h-4 mr-2" />
        Entregar al Cliente
      </Button>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Package className="w-6 h-6 text-purple-600" />
              Confirmar Entrega de Orden de Trabajo
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            <div className="bg-slate-50 p-4 rounded-lg grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-slate-500">Codigo OT:</p>
                <p className="font-semibold">{ordenTrabajo.codigo_ot}</p>
              </div>
              <div>
                <p className="text-slate-500">Motivo:</p>
                <p className="font-semibold">{ordenTrabajo.motivo_ingreso}</p>
              </div>
            </div>

            <Alert className="bg-blue-50 border-blue-200">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <AlertDescription className="text-blue-900">
                El servidor validara estado tecnico, obligacion comercial, sucursal y garantia antes de confirmar la entrega.
              </AlertDescription>
            </Alert>

            <div className="border border-slate-200 rounded-lg p-4 bg-white">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="checkbox-entrega"
                  checked={acceptance}
                  onCheckedChange={value => setAcceptance(value === true)}
                  className="mt-1"
                />
                <Label htmlFor="checkbox-entrega" className="text-sm font-medium cursor-pointer">
                  {TEXTO_LEGAL_CHECKBOX}
                </Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Nota de Entrega (opcional)</Label>
              <Textarea
                value={note}
                onChange={event => setNote(event.target.value)}
                placeholder="Observaciones sobre la entrega..."
                rows={3}
                maxLength={2000}
              />
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowModal(false)}
                disabled={delivery.isPending}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => delivery.mutate()}
                disabled={!acceptance || delivery.isPending}
                className="bg-gradient-to-r from-purple-500 to-indigo-500"
              >
                {delivery.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Procesando Entrega...</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4 mr-2" />Confirmar Entrega</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
