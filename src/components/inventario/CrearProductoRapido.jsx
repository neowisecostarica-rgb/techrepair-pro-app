import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useAuthContext } from '../contexts/AuthContext';

export default function CrearProductoRapido({ open, onClose, codigoBarras, onProductoCreado }) {
  const { effectiveOrgId } = useAuthContext();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    codigo_barras: codigoBarras || '',
    nombre: '',
    categoria: 'repuesto',
    precio_venta: '',
    cantidad_disponible: '0',
    costo_unitario: ''
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      // Validar código único
      const existentes = await base44.entities.Inventario.filter({
        organization_id: effectiveOrgId
      });
      
      const duplicado = existentes.find(i => i.codigo_barras === data.codigo_barras);
      if (duplicado) {
        throw new Error(`Código ya existe: ${duplicado.nombre}`);
      }

      return await base44.entities.Inventario.create({
        ...data,
        organization_id: effectiveOrgId
      });
    },
    onSuccess: (producto) => {
      queryClient.invalidateQueries({ queryKey: ['inventario'] });
      onProductoCreado?.(producto);
      onClose();
      setFormData({
        codigo_barras: '',
        nombre: '',
        categoria: 'repuesto',
        precio_venta: '',
        cantidad_disponible: '0',
        costo_unitario: ''
      });
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.codigo_barras || !formData.nombre || !formData.precio_venta || !formData.costo_unitario) {
      alert('Completar campos obligatorios');
      return;
    }

    createMutation.mutate({
      ...formData,
      precio_venta: parseFloat(formData.precio_venta),
      costo_unitario: parseFloat(formData.costo_unitario),
      cantidad_disponible: parseInt(formData.cantidad_disponible) || 0
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Crear Producto Rápido</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Código de Barras *</Label>
            <Input
              value={formData.codigo_barras}
              onChange={(e) => setFormData({ ...formData, codigo_barras: e.target.value })}
              placeholder="Escanear o ingresar"
              required
            />
          </div>

          <div>
            <Label>Nombre del Producto *</Label>
            <Input
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              placeholder="Ej: Pantalla LCD iPhone 11"
              required
            />
          </div>

          <div>
            <Label>Categoría *</Label>
            <Select value={formData.categoria} onValueChange={(val) => setFormData({ ...formData, categoria: val })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="repuesto">Repuesto</SelectItem>
                <SelectItem value="equipo_nuevo">Equipo Nuevo</SelectItem>
                <SelectItem value="accesorio">Accesorio</SelectItem>
                <SelectItem value="consumible">Consumible</SelectItem>
                <SelectItem value="suministro">Suministro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Costo Unitario *</Label>
              <Input
                type="number"
                value={formData.costo_unitario}
                onChange={(e) => setFormData({ ...formData, costo_unitario: e.target.value })}
                placeholder="0.00"
                step="0.01"
                required
              />
            </div>
            <div>
              <Label>Precio Venta *</Label>
              <Input
                type="number"
                value={formData.precio_venta}
                onChange={(e) => setFormData({ ...formData, precio_venta: e.target.value })}
                placeholder="0.00"
                step="0.01"
                required
              />
            </div>
          </div>

          <div>
            <Label>Stock Inicial</Label>
            <Input
              type="number"
              value={formData.cantidad_disponible}
              onChange={(e) => setFormData({ ...formData, cantidad_disponible: e.target.value })}
              placeholder="0"
            />
          </div>

          {createMutation.isError && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
              {createMutation.error.message}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" disabled={createMutation.isPending} className="flex-1">
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                'Crear Producto'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}