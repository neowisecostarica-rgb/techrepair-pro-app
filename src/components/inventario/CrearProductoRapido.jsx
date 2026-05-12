import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

  const { data: categorias = [], isLoading: loadingCategorias } = useQuery({
    queryKey: ['categorias', effectiveOrgId],
    queryFn: () => base44.entities.CategoriaInventario.filter({
      organization_id: effectiveOrgId,
      activo: true
    }),
    enabled: !!effectiveOrgId && open,
    staleTime: 5 * 60 * 1000,
  });
  
  const [formData, setFormData] = useState({
    codigo_barras: codigoBarras || '',
    nombre: '',
    categoria_id: '',
    precio_venta: '',
    cantidad_disponible: '0',
    costo_unitario: ''
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const res = await base44.functions.invoke('createInventoryItem', {
        itemData: { ...data, organization_id: effectiveOrgId },
      });
      return res.data?.data ?? res.data;
    },
    onSuccess: (producto) => {
      queryClient.invalidateQueries({ queryKey: ['inventario'] });
      onProductoCreado?.(producto);
      onClose();
      setFormData({
        codigo_barras: '',
        nombre: '',
        categoria_id: '',
        precio_venta: '',
        cantidad_disponible: '0',
        costo_unitario: ''
      });
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.codigo_barras || !formData.nombre || !formData.precio_venta || !formData.costo_unitario || !formData.categoria_id) {
      alert('Completar campos obligatorios (incluyendo categoría)');
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
            {loadingCategorias ? (
              <div className="flex items-center gap-2 h-10 px-3 border rounded-md text-sm text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando categorías...
              </div>
            ) : categorias.length === 0 ? (
              <div className="h-10 px-3 border border-orange-200 bg-orange-50 rounded-md flex items-center text-sm text-orange-700">
                No hay categorías. Crea una desde Inventario.
              </div>
            ) : (
              <Select value={formData.categoria_id} onValueChange={(val) => setFormData({ ...formData, categoria_id: val })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categorias.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
            <Button type="submit" disabled={createMutation.isPending || !formData.categoria_id || loadingCategorias} className="flex-1">
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