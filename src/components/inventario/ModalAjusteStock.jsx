import React, { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';

/**
 * ModalAjusteStock — UX mínima para ajuste manual de stock
 * ORT-v1.1A — Inventario Operacional Real
 * 
 * Solo: tipo (entrada/salida) + cantidad + motivo
 * Llama a adjustInventoryStock backend function
 */
export default function ModalAjusteStock({ open, onOpenChange, item, onSuccess }) {
  const [tipo, setTipo] = useState('entrada');
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState('');
  const [loading, setLoading] = useState(false);
  const operationKey = useRef(crypto.randomUUID());
  const { toast } = useToast();

  const handleClose = () => {
    setCantidad('');
    setMotivo('');
    setTipo('entrada');
    operationKey.current = crypto.randomUUID();
    onOpenChange(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const delta = parseFloat(cantidad);
    if (!delta || delta <= 0 || isNaN(delta)) {
      toast({ title: 'Cantidad inválida', description: 'Ingresa una cantidad mayor a 0.', variant: 'destructive' });
      return;
    }
    if (!motivo.trim()) {
      toast({ title: 'Motivo requerido', description: 'Debes ingresar un motivo para el ajuste.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const response = await base44.functions.invoke('adjustInventoryStock', {
        inventario_id: item.id,
        delta,
        tipo,
        motivo: motivo.trim(),
        operation_key: operationKey.current,
      });

      toast({
        title: '✅ Ajuste registrado',
        description: `Stock actualizado: ${response.data.stock_anterior} → ${response.data.stock_nuevo} unidades.`,
      });

      handleClose();
      onSuccess();
    } catch (error) {
      toast({
        title: 'Error al ajustar stock',
        description: error?.response?.data?.error || error.message || 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!item) return null;

  const stockResultado = () => {
    const delta = parseFloat(cantidad);
    if (!delta || isNaN(delta) || delta <= 0) return null;
    const resultado = tipo === 'entrada'
      ? (item.cantidad_disponible ?? 0) + delta
      : (item.cantidad_disponible ?? 0) - delta;
    return resultado;
  };

  const resultado = stockResultado();
  const stockNegativo = resultado !== null && resultado < 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Ajustar Stock</DialogTitle>
        </DialogHeader>

        {/* Info producto */}
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <p className="font-semibold text-slate-900 text-sm">{item.nombre}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-slate-500">Stock actual:</span>
            <Badge variant="outline" className="font-bold text-base px-3">
              {item.cantidad_disponible ?? 0}
            </Badge>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 mt-2">
          {/* Tipo de ajuste */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Tipo de Ajuste *</Label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setTipo('entrada')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 transition-all font-medium text-sm ${
                  tipo === 'entrada'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                <ArrowUp className="w-4 h-4" />
                Entrada
              </button>
              <button
                type="button"
                onClick={() => setTipo('salida')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg border-2 transition-all font-medium text-sm ${
                  tipo === 'salida'
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                <ArrowDown className="w-4 h-4" />
                Salida
              </button>
            </div>
          </div>

          {/* Cantidad */}
          <div className="space-y-2">
            <Label htmlFor="cantidad" className="text-sm font-semibold">Cantidad *</Label>
            <Input
              id="cantidad"
              type="number"
              min="1"
              step="1"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder="Ej: 5"
              required
            />
            {/* Preview resultado */}
            {resultado !== null && (
              <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
                stockNegativo
                  ? 'bg-red-50 border border-red-200 text-red-700'
                  : 'bg-slate-50 border border-slate-200 text-slate-600'
              }`}>
                {stockNegativo ? (
                  <span>⚠️ Stock insuficiente para esta salida</span>
                ) : (
                  <span>
                    Resultado: <strong>{resultado}</strong> unidades
                    {tipo === 'entrada'
                      ? <span className="text-emerald-600 ml-1">(+{parseFloat(cantidad)})</span>
                      : <span className="text-red-600 ml-1">(-{parseFloat(cantidad)})</span>
                    }
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Motivo */}
          <div className="space-y-2">
            <Label htmlFor="motivo" className="text-sm font-semibold">Motivo *</Label>
            <Textarea
              id="motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Corrección inventario físico, Devolución proveedor, Merma..."
              rows={3}
              required
            />
            <p className="text-xs text-slate-400">Este motivo quedará registrado en el historial de movimientos.</p>
          </div>

          {/* Acciones */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1"
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className={`flex-1 ${tipo === 'entrada'
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-red-600 hover:bg-red-700'
              }`}
              disabled={loading || stockNegativo}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Aplicando...
                </>
              ) : (
                `Confirmar ${tipo === 'entrada' ? 'Entrada' : 'Salida'}`
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
