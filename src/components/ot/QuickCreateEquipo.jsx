import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';

export default function QuickCreateEquipo({ open, onOpenChange, clienteId, onCreated }) {
  const { toast } = useToast();
  const [tipo, setTipo] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [serie, setSerie] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!tipo || !marca.trim()) {
      setError('Tipo y marca son requeridos.');
      return;
    }

    setError('');
    setSaving(true);
    try {
      const response = await base44.functions.invoke('createEquipment', {
        cliente_id: clienteId,
        tipo,
        marca: marca.trim(),
        modelo: modelo.trim() || undefined,
        serie: serie.trim() || undefined,
      });
      toast({ title: 'Equipo creado', description: `${marca.trim()} ${modelo.trim() || ''}`.trim() + ' fue registrado correctamente.' });
      onCreated(response.data);
      setTipo('');
      setMarca('');
      setModelo('');
      setSerie('');
      onOpenChange(false);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || '';
      if (msg.toLowerCase().includes('duplicado') || msg.toLowerCase().includes('duplicate') || msg.includes('409')) {
        setError('Ya existe un equipo con ese número de serie. Verifica o deja el campo vacío.');
      } else {
        setError('Error al crear equipo: ' + msg);
      }
      toast({ title: 'Error al crear equipo', description: msg || 'Ocurrió un error inesperado.', variant: 'destructive' });
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
          {error && (
            <Alert className="bg-red-50 border-red-200">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <AlertDescription className="text-red-800 text-sm">{error}</AlertDescription>
            </Alert>
          )}
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