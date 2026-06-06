import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import FormularioCliente from '@/components/clientes/FormularioCliente';

/**
 * Modal de creación rápida de cliente desde flujo OT.
 * Delega toda la lógica a FormularioCliente mode="quick".
 */
export default function QuickCreateClienteModal({ open, onOpenChange, onCreated }) {
  const handleGuardar = (clienteCreado) => {
    onCreated(clienteCreado);
    onOpenChange(false);
  };

  const handleCancelar = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Crear Cliente Rápido</DialogTitle>
        </DialogHeader>
        <div className="mt-2">
          <FormularioCliente
            mode="quick"
            onGuardar={handleGuardar}
            onCancelar={handleCancelar}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}