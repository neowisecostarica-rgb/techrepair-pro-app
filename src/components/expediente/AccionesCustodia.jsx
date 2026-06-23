/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AccionesCustodia — P1-A.3-I2
 * ═══════════════════════════════════════════════════════════════════════════
 * Botones operativos para Registrar Contacto, Declarar Abandono y
 * Marcar Disposición Final sobre una OT FINALIZADA.
 * Llama a updateCustodiaData (backend). Invalida queries al completar.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Phone, AlertTriangle, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';

export default function AccionesCustodia({ ot, onUpdated }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── Estados de carga por acción ────────────────────────────────────────
  const [loadingAction, setLoadingAction] = useState(null);

  // ── Dialog: Registrar Contacto ─────────────────────────────────────────
  const [showContacto, setShowContacto] = useState(false);
  const [obsContacto, setObsContacto] = useState('');

  // ── AlertDialog: Declarar Abandono ─────────────────────────────────────
  const [showAbandono, setShowAbandono] = useState(false);
  const [obsAbandono, setObsAbandono] = useState('');

  // ── AlertDialog: Disposición Final ─────────────────────────────────────
  const [showDisposicion, setShowDisposicion] = useState(false);
  const [obsDisposicion, setObsDisposicion] = useState('');

  // ── Guardrails de visibilidad ──────────────────────────────────────────
  // Solo actúa en FINALIZADA; no en ENTREGADA ni CANCELADA
  if (ot.estado !== 'FINALIZADA') return null;

  const estadoCustodia = ot.estado_custodia || 'NORMAL';
  const esAbandono     = estadoCustodia === 'ABANDONO_DECLARADO';
  const esDisposicion  = estadoCustodia === 'DISPOSICION_FINAL';

  // ── Llamada al backend ─────────────────────────────────────────────────
  async function ejecutarAccion(action, observaciones) {
    setLoadingAction(action);
    try {
      const res = await base44.functions.invoke('updateCustodiaData', {
        orden_trabajo_id: ot.id,
        action,
        observaciones: observaciones || undefined,
      });

      if (res.data?.success) {
        // Invalidar queries para refrescar OT y Timeline
        await queryClient.invalidateQueries({ queryKey: ['timeline-events', ot.id] });
        await queryClient.invalidateQueries({ queryKey: ['expediente-ot', ot.id] });
        // Notificar al padre para que recargue la OT si es necesario
        if (onUpdated) onUpdated();

        const labels = {
          REGISTRAR_CONTACTO: 'Contacto registrado',
          DECLARAR_ABANDONO:  'Abandono declarado',
          MARCAR_DISPOSICION: 'Disposición final marcada',
        };
        toast({ title: labels[action], description: 'Evento registrado en el expediente.' });
      } else {
        throw new Error(res.data?.error || 'Error desconocido');
      }
    } catch (err) {
      toast({
        title: 'Error al ejecutar acción',
        description: String(err?.message || err),
        variant: 'destructive',
      });
    } finally {
      setLoadingAction(null);
    }
  }

  // ── Handlers con cierre de modal ──────────────────────────────────────
  async function handleContacto() {
    setShowContacto(false);
    await ejecutarAccion('REGISTRAR_CONTACTO', obsContacto);
    setObsContacto('');
  }

  async function handleAbandono() {
    setShowAbandono(false);
    await ejecutarAccion('DECLARAR_ABANDONO', obsAbandono);
    setObsAbandono('');
  }

  async function handleDisposicion() {
    setShowDisposicion(false);
    await ejecutarAccion('MARCAR_DISPOSICION', obsDisposicion);
    setObsDisposicion('');
  }

  // Si ya está en DISPOSICION_FINAL no hay más acciones
  if (esDisposicion) {
    return (
      <div className="mt-3 px-3 py-2 bg-slate-100 rounded-lg text-xs text-slate-500 text-center">
        Equipo en disposición final. No hay acciones adicionales disponibles.
      </div>
    );
  }

  return (
    <>
      {/* ── Botones de acción ─────────────────────────────────────────── */}
      <div className="mt-3 flex flex-wrap gap-2">
        {/* Registrar Contacto — siempre disponible en FINALIZADA */}
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
          disabled={!!loadingAction}
          onClick={() => setShowContacto(true)}
        >
          {loadingAction === 'REGISTRAR_CONTACTO'
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Phone className="w-3.5 h-3.5" />}
          Registrar Contacto
        </Button>

        {/* Declarar Abandono — solo si no está ya en abandono */}
        {!esAbandono && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs border-orange-200 text-orange-700 hover:bg-orange-50"
            disabled={!!loadingAction}
            onClick={() => setShowAbandono(true)}
          >
            {loadingAction === 'DECLARAR_ABANDONO'
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <AlertTriangle className="w-3.5 h-3.5" />}
            Declarar Abandono
          </Button>
        )}

        {/* Marcar Disposición Final — solo si está en ABANDONO_DECLARADO */}
        {esAbandono && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs border-red-200 text-red-700 hover:bg-red-50"
            disabled={!!loadingAction}
            onClick={() => setShowDisposicion(true)}
          >
            {loadingAction === 'MARCAR_DISPOSICION'
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Trash2 className="w-3.5 h-3.5" />}
            Marcar Disposición Final
          </Button>
        )}
      </div>

      {/* ── Dialog: Registrar Contacto ────────────────────────────────── */}
      <Dialog open={showContacto} onOpenChange={setShowContacto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-700">
              <Phone className="w-4 h-4" />
              Registrar Contacto
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Registra un intento de contacto al cliente para retirar el equipo. Se actualizará la fecha de último contacto.
          </p>
          <Textarea
            placeholder="Observaciones del contacto (opcional)..."
            value={obsContacto}
            onChange={e => setObsContacto(e.target.value)}
            rows={3}
            className="text-sm"
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowContacto(false)}>
              Cancelar
            </Button>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleContacto}>
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── AlertDialog: Declarar Abandono ────────────────────────────── */}
      <AlertDialog open={showAbandono} onOpenChange={setShowAbandono}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-orange-700">
              <AlertTriangle className="w-4 h-4" />
              Declarar Abandono
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>Esta acción declara formalmente el abandono del equipo. El estado de custodia cambiará a <strong>Abandono Declarado</strong>.</span>
              <Textarea
                placeholder="Observaciones del abandono (opcional)..."
                value={obsAbandono}
                onChange={e => setObsAbandono(e.target.value)}
                rows={3}
                className="text-sm mt-2"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={handleAbandono}
            >
              Declarar Abandono
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── AlertDialog: Disposición Final ────────────────────────────── */}
      <AlertDialog open={showDisposicion} onOpenChange={setShowDisposicion}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="w-4 h-4" />
              Marcar Disposición Final
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>Esta acción indica que el equipo abandonado ha sido dado de baja o dispuesto. Esta acción es irreversible.</span>
              <Textarea
                placeholder="Observaciones de la disposición final (opcional)..."
                value={obsDisposicion}
                onChange={e => setObsDisposicion(e.target.value)}
                rows={3}
                className="text-sm mt-2"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDisposicion}
            >
              Confirmar Disposición
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}