import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { sotFetch } from '@/lib/sotFetch';

export default function QuickCreateEquipo({ open, onOpenChange, organizationId, clienteId, onCreated }) {
  const [tipo, setTipo] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [serie, setSerie] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!tipo || !marca.trim()) {
      alert('Tipo y marca son requeridos');
      return;
    }

    if (!organizationId) {
      alert('Organization no definida');
      return;
    }

    setSaving(true);
    try {
      const newEquipo = await sotFetch('/v1/equipment', organizationId, {
        method: 'POST',
        body: JSON.stringify({
          client_id: clienteId,
          type: tipo,
          brand: marca.trim(),
          model: modelo.trim() || undefined,
          serial_number: serie.trim() || undefined,
        })
      });
      onCreated(newEquipo);
      setTipo('');
      setMarca('');
      setModelo('');
      setSerie('');
      onOpenChange(false);
    } catch (error) {
      console.error('Error creando equipo:', error);
      alert('Error al crear el equipo: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo Equipo</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tipo">Tipo de Equipo *</Label>
            <Select value={tipo} onValueChange={setTipo} disabled={saving}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="laptop">Laptop</SelectItem>
                <SelectItem value="desktop">Desktop</SelectItem>
                <SelectItem value="tablet">Tablet</SelectItem>
                <SelectItem value="smartphone">Smartphone</SelectItem>
                <SelectItem value="impresora">Impresora</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="marca">Marca *</Label>
            <Input
              id="marca"
              value={marca}
              onChange={(e) => setMarca(e.target.value)}
              placeholder="Ej: Dell, HP, Apple"
              disabled={saving}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="modelo">Modelo</Label>
            <Input
              id="modelo"
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              placeholder="Ej: Inspiron 15 (opcional)"
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="serie">Número de Serie / IMEI</Label>
            <Input
              id="serie"
              value={serie}
              onChange={(e) => setSerie(e.target.value)}
              placeholder="Opcional"
              disabled={saving}
            />
          </div>

          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !tipo}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                'Crear Equipo'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}