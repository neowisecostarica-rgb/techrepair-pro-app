import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

/**
 * Modal minimalista para crear cliente rápido desde el flujo de OT.
 * Solo campos obligatorios: nombre_completo, identificacion, telefono.
 * Invoca createClient (function existente).
 */
export default function QuickCreateClienteModal({ open, onOpenChange, onCreated }) {
  const [nombre, setNombre] = useState('');
  const [identificacion, setIdentificacion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setNombre('');
    setIdentificacion('');
    setTelefono('');
    setError('');
    setSaving(false);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!nombre.trim() || !identificacion.trim() || !telefono.trim()) {
      setError('Nombre, identificación y teléfono son obligatorios.');
      return;
    }

    setSaving(true);
    try {
      const response = await base44.functions.invoke('createClient', {
        nombre_completo: nombre.trim(),
        identificacion: identificacion.trim(),
        tipo_cliente: 'individual',
        telefono: telefono.trim(),
      });
      onCreated(response.data);
      reset();
      onOpenChange(false);
    } catch (err) {
      // Detectar duplicado (409)
      const msg = err?.response?.data?.message || err?.message || '';
      if (msg.toLowerCase().includes('duplicado') || msg.toLowerCase().includes('duplicate') || msg.includes('409')) {
        setError('Ya existe un cliente con esa identificación o teléfono. Búscalo en el campo de búsqueda.');
      } else {
        setError('Error al crear cliente: ' + msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Crear Cliente Rápido</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {error && (
            <Alert className="bg-red-50 border-red-200">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <AlertDescription className="text-red-800 text-sm">{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>Nombre Completo *</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre del cliente"
              disabled={saving}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Identificación (Cédula / Pasaporte) *</Label>
            <Input
              value={identificacion}
              onChange={(e) => setIdentificacion(e.target.value)}
              placeholder="ID único del cliente"
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label>Teléfono *</Label>
            <Input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="+506 8888-8888"
              disabled={saving}
            />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creando...</>
              ) : (
                'Crear Cliente'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}