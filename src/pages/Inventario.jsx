import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Package, AlertTriangle, TrendingUp, DollarSign } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUserAccount, withOrgId } from '@/components/hooks/useOrgData';

export default function Inventario() {
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const queryClient = useQueryClient();
  const { userAccount } = useUserAccount();

  const { data: items = [] } = useQuery({
    queryKey: ['inventario', userAccount?.organization_id],
    queryFn: () => base44.entities.Inventario.filter({
      organization_id: userAccount.organization_id
    }),
    enabled: !!userAccount?.organization_id,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Inventario.create(withOrgId(data, userAccount)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventario'] });
      setShowModal(false);
      setEditingItem(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Inventario.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventario'] });
      setShowModal(false);
      setEditingItem(null);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      sku: formData.get('sku'),
      nombre: formData.get('nombre'),
      descripcion: formData.get('descripcion'),
      categoria: formData.get('categoria'),
      marca: formData.get('marca'),
      modelo: formData.get('modelo'),
      cantidad_disponible: parseFloat(formData.get('cantidad_disponible')) || 0,
      ubicacion: formData.get('ubicacion'),
      costo_unitario: parseFloat(formData.get('costo_unitario')) || 0,
      precio_venta: parseFloat(formData.get('precio_venta')) || 0,
      punto_reorden: parseFloat(formData.get('punto_reorden')) || 5,
      proveedor: formData.get('proveedor'),
      estado: formData.get('estado') || 'activo',
    };

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const itemsFiltrados = items.filter(i => {
    const matchSearch = !searchTerm ||
      i.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.nombre?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategoria = filtroCategoria === 'todas' || i.categoria === filtroCategoria;
    return matchSearch && matchCategoria;
  });

  const valorTotal = items.reduce((sum, i) => sum + (i.cantidad_disponible * i.costo_unitario || 0), 0);
  const itemsBajoStock = items.filter(i => i.cantidad_disponible <= i.punto_reorden).length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Inventario</h1>
          <p className="text-slate-500">Control de repuestos y productos</p>
        </div>
        <Button
          onClick={() => { setEditingItem(null); setShowModal(true); }}
          className="bg-gradient-to-r from-emerald-500 to-blue-500 hover:shadow-lg transition-all"
        >
          <Plus className="w-5 h-5 mr-2" />
          Nuevo Item
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Items</p>
                <p className="text-3xl font-bold text-slate-900">{items.length}</p>
              </div>
              <Package className="w-10 h-10 text-emerald-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Valor en Stock</p>
                <p className="text-3xl font-bold text-slate-900">₡{valorTotal.toLocaleString()}</p>
              </div>
              <DollarSign className="w-10 h-10 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Bajo Stock</p>
                <p className="text-3xl font-bold text-orange-600">{itemsBajoStock}</p>
              </div>
              <AlertTriangle className="w-10 h-10 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                placeholder="Buscar por SKU o nombre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
              <SelectTrigger className="w-full md:w-64">
                <SelectValue placeholder="Filtrar por categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las categorías</SelectItem>
                <SelectItem value="repuesto">Repuestos</SelectItem>
                <SelectItem value="equipo_nuevo">Equipos Nuevos</SelectItem>
                <SelectItem value="accesorio">Accesorios</SelectItem>
                <SelectItem value="consumible">Consumibles</SelectItem>
                <SelectItem value="suministro">Suministros</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabla de Inventario */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-lg font-semibold">Items en Stock</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">SKU</th>
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">Producto</th>
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">Categoría</th>
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">Stock</th>
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">Ubicación</th>
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">Precio</th>
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">Margen</th>
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itemsFiltrados.map((item) => {
                  const margen = ((item.precio_venta - item.costo_unitario) / item.precio_venta * 100) || 0;
                  const bajoStock = item.cantidad_disponible <= item.punto_reorden;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <span className="font-mono text-sm font-medium">{item.sku}</span>
                      </td>
                      <td className="p-4">
                        <div>
                          <p className="font-medium text-slate-900">{item.nombre}</p>
                          <p className="text-xs text-slate-500">{item.marca} {item.modelo}</p>
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline" className="capitalize">
                          {item.categoria?.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${bajoStock ? 'text-orange-600' : 'text-slate-900'}`}>
                            {item.cantidad_disponible}
                          </span>
                          {bajoStock && <AlertTriangle className="w-4 h-4 text-orange-500" />}
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge className={`${
                          item.ubicacion === 'vitrina' ? 'bg-blue-100 text-blue-700' :
                          item.ubicacion === 'taller' ? 'bg-purple-100 text-purple-700' :
                          'bg-slate-100 text-slate-700'
                        } border-0 capitalize`}>
                          {item.ubicacion}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <p className="font-bold text-emerald-600">₡{item.precio_venta?.toLocaleString()}</p>
                        <p className="text-xs text-slate-500">Costo: ₡{item.costo_unitario?.toLocaleString()}</p>
                      </td>
                      <td className="p-4">
                        <span className={`font-semibold ${margen > 30 ? 'text-green-600' : 'text-slate-600'}`}>
                          {margen.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setEditingItem(item); setShowModal(true); }}
                        >
                          Editar
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {itemsFiltrados.length === 0 && (
              <div className="p-12 text-center">
                <Package className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                <p className="text-slate-400">No se encontraron items</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modal Crear/Editar */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              {editingItem ? 'Editar Item' : 'Nuevo Item de Inventario'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sku">SKU *</Label>
                <Input
                  id="sku"
                  name="sku"
                  defaultValue={editingItem?.sku}
                  placeholder="SKU-12345"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="categoria">Categoría *</Label>
                <Select name="categoria" defaultValue={editingItem?.categoria}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
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

              <div className="space-y-2 col-span-2">
                <Label htmlFor="nombre">Nombre del Producto *</Label>
                <Input
                  id="nombre"
                  name="nombre"
                  defaultValue={editingItem?.nombre}
                  required
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="descripcion">Descripción</Label>
                <Input
                  id="descripcion"
                  name="descripcion"
                  defaultValue={editingItem?.descripcion}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="marca">Marca</Label>
                <Input
                  id="marca"
                  name="marca"
                  defaultValue={editingItem?.marca}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="modelo">Modelo</Label>
                <Input
                  id="modelo"
                  name="modelo"
                  defaultValue={editingItem?.modelo}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cantidad_disponible">Cantidad Disponible</Label>
                <Input
                  type="number"
                  id="cantidad_disponible"
                  name="cantidad_disponible"
                  defaultValue={editingItem?.cantidad_disponible || 0}
                  min="0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ubicacion">Ubicación</Label>
                <Select name="ubicacion" defaultValue={editingItem?.ubicacion || 'bodega'}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bodega">Bodega</SelectItem>
                    <SelectItem value="vitrina">Vitrina</SelectItem>
                    <SelectItem value="taller">Taller</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="costo_unitario">Costo Unitario (₡) *</Label>
                <Input
                  type="number"
                  id="costo_unitario"
                  name="costo_unitario"
                  defaultValue={editingItem?.costo_unitario}
                  step="0.01"
                  min="0"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="precio_venta">Precio de Venta (₡) *</Label>
                <Input
                  type="number"
                  id="precio_venta"
                  name="precio_venta"
                  defaultValue={editingItem?.precio_venta}
                  step="0.01"
                  min="0"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="punto_reorden">Punto de Reorden</Label>
                <Input
                  type="number"
                  id="punto_reorden"
                  name="punto_reorden"
                  defaultValue={editingItem?.punto_reorden || 5}
                  min="0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="proveedor">Proveedor</Label>
                <Input
                  id="proveedor"
                  name="proveedor"
                  defaultValue={editingItem?.proveedor}
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-6">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-gradient-to-r from-emerald-500 to-blue-500">
                {editingItem ? 'Actualizar' : 'Crear'} Item
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}