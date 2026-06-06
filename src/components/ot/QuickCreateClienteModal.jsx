import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import FormularioCliente from '@/components/clientes/FormularioCliente';

/**
 * Sheet de creación rápida de cliente desde flujo OT.
 * Reemplaza el Dialog anidado por un Sheet lateral/fullscreen.
 * El modal de Nueva OT permanece montado debajo — no se pierde ningún dato.
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* sm:max-w-md → desktop lateral; max-w-full w-full → móvil fullscreen */}
      <SheetContent
        side="right"
        className="w-full sm:max-w-md flex flex-col p-0 overflow-y-auto"
      >
        <SheetHeader className="px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCancelar}
              className="text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <SheetTitle className="text-lg font-semibold">Crear Cliente</SheetTitle>
          </div>
        </SheetHeader>

        <div className="flex-1 px-6 py-6">
          <FormularioCliente
            mode="quick"
            onGuardar={handleGuardar}
            onCancelar={handleCancelar}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}