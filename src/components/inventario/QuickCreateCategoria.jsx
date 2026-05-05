import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function QuickCreateCategoria({ open, onOpenChange, organizationId, onCreated }) {
  const [nombre, setNombre] = useState('');
  const [permiteStock, setPermiteStock] = useState(true);
  const [permitePrecio, setPermitePrecio] = useState(true);
  const [esVendible, setEsVendible] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!nombre.trim()) {
      alert('El nombre es requerido');
      return;
    }

    if (!organizationId) {
      alert('Error: no se pudo determinar la organización. Intenta recargar la página.');
      return;
    }

    setSaving(true);

    try {
      // Validar si ya existe
      const existing = await base44.entities.CategoriaInventario.filter({
        organization_id: organizationId,
        nombre: nombre.trim()
      });

      if (existing.length > 0) {
        alert('Ya existe una categoría con ese nombre');
        setSaving(false);
        return;
      }

      // Crear categoría vía backend function (bypasea RLS restrictiva)
      const response = await base44.functions.invoke('createCategoriaInventario', {
        organization_id: organizationId,
        nombre: nombre.trim(),
        permite_stock: permiteStock,
        permite_precio: permitePrecio,
        es_vendible: esVendible,
        activo: true
      });
      const newCategoria = response.data;

      // Notificar y cerrar
      onCreated(newCategoria);
      setNombre('');
      setPermiteStock(true);
      setPermitePrecio(true);
      setEsVendible(true);
      onOpenChange(false);
    } catch (error) {
      console.error('Error creando categoría:', error);
      alert('Error al crear la categoría: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva Categoría</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre *</Label>
            <Input
              id="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Periféricos, Cables, Herramientas"
              disabled={saving}
              required
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="stock"
                checked={permiteStock}
                onCheckedChange={setPermiteStock}
                disabled={saving}
              />
              <Label htmlFor="stock" className="cursor-pointer">
                Permite manejar stock
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="precio"
                checked={permitePrecio}
                onCheckedChange={setPermitePrecio}
                disabled={saving}
              />
              <Label htmlFor="precio" className="cursor-pointer">
                Permite precio de venta
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="vendible"
                checked={esVendible}
                onCheckedChange={setEsVendible}
                disabled={saving}
              />
              <Label htmlFor="vendible" className="cursor-pointer">
                Es vendible (aparece en POS)
              </Label>
            </div>
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
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                'Crear Categoría'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}