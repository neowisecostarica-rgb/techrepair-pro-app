import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { getIdentityOrganization } from '@/api/identity';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Search, Package, AlertTriangle, DollarSign, Leaf, Shield, CheckCircle2, XCircle, SlidersHorizontal } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUserAccount } from '@/components/hooks/useOrgData';
import { useAuthContext } from '@/components/contexts/AuthContext';
import ExportarInventario from '@/components/inventario/ExportarInventario';
import QuickCreateCategoria from '@/components/inventario/QuickCreateCategoria';
import { generarCodigoInterno } from '@/components/inventario/utils/generarCodigoInterno';
import ModalAjusteStock from '@/components/inventario/ModalAjusteStock';
import PageGuard from '@/components/guards/PageGuard';

export default function Inventario() {
  return (
    <PageGuard allowedRoles={['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN', 'INVENTORY']}>
      <InventarioContent />
    </PageGuard>
  );
}

function InventarioContent() {
  const [showModal, setShowModal] = useState(false);
  const [showQuickCreateCategoria, setShowQuickCreateCategoria] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [ajusteItem, setAjusteItem] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [selectedCategoriaId, setSelectedCategoriaId] = useState('');
  const [codigoInternoPreview, setCodigoInternoPreview] = useState('');
  const queryClient = useQueryClient();
  const { userAccount } = useUserAccount();
  const { effectiveRole, effectiveOrgId } = useAuthContext();
  const [organization, setOrganization] = useState(null);

  // Obtener nombre de organización para export
  React.useEffect(() => {
    if (effectiveOrgId) {
      getIdentityOrganization(effectiveOrgId).then(result => setOrganization(result.organization));
    }
  }, [effectiveOrgId]);

  const { data: items = [] } = useQuery({
    queryKey: ['inventario', userAccount?.organization_id],
    queryFn: () => base44.entities.Inventario.filter({
      organization_id: userAccount.organization_id
    }),
    enabled: !!userAccount?.organization_id,
  });

  // CARGAR CATEGORÍAS DINÁMICAS
  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias', effectiveOrgId],
    queryFn: () => base44.entities.CategoriaInventario.filter({
      organization_id: effectiveOrgId,
      activo: true
    }),
    enabled: !!effectiveOrgId,
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const res = await base44.functions.invoke('createInventoryItem', {
        itemData: { ...data, organization_id: effectiveOrgId },
      });
      return res.data?.data ?? res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventario'] });
      setShowModal(false);
      setEditingItem(null);
      setSelectedCategoriaId('');
      setCodigoInternoPreview('');
    },
    onError: (error) => {
      alert('Error: ' + error.message);
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const res = await base44.functions.invoke('updateInventoryItem', {
        id,
        updateData: data,
      });
      return res.data?.data ?? res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventario'] });
      setShowModal(false);
      setEditingItem(null);
      setSelectedCategoriaId('');
    },
    onError: (error) => {
      alert('Error: ' + error.message);
    }
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const codigoBarras = formData.get('codigo_barras');
    
    // Validar código único (opcional)
    if (codigoBarras) {
      const duplicado = items.find(i => 
        i.codigo_barras === codigoBarras && 
        i.id !== editingItem?.id
      );
      if (duplicado) {
        alert(`Código de barras ya existe: ${duplicado.nombre}`);
        return;
      }
    }

    const categoriaSeleccionada = categorias.find(c => c.id === selectedCategoriaId);
    
    const data = {
      codigo_barras: codigoBarras || undefined,
      sku: formData.get('sku') || undefined,
      nombre: formData.get('nombre'),
      descripcion: formData.get('descripcion'),
      categoria_id: selectedCategoriaId,
      tipo_item: formData.get('tipo_item') || 'producto',
      marca: formData.get('marca'),
      modelo: formData.get('modelo'),
      cantidad_disponible: categoriaSeleccionada?.permite_stock ? (parseFloat(formData.get('cantidad_disponible')) || 0) : 0,
      ubicacion: formData.get('ubicacion'),
      costo_unitario: parseFloat(formData.get('costo_unitario')) || 0,
      precio_venta: categoriaSeleccionada?.es_vendible ? (parseFloat(formData.get('precio_venta')) || 0) : 0,
      punto_reorden: parseFloat(formData.get('punto_reorden')) || 5,
      proveedor: formData.get('proveedor'),
      fecha_compra: formData.get('fecha_compra') || undefined,
      documento_compra: formData.get('documento_compra') || undefined,
      garantia_proveedor_meses: parseFloat(formData.get('garantia_proveedor_meses')) || undefined,
      estado: formData.get('estado') || 'activo',
      // Campos de reciclaje (opcionales)
      co2_evitado: parseFloat(formData.get('co2_evitado')) || 0,
      valor_recuperado: parseFloat(formData.get('valor_recuperado')) || 0,
      notas_reciclaje: formData.get('notas_reciclaje') || undefined
    };

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  // Generar código interno al abrir modal para crear
  React.useEffect(() => {
    if (showModal && !editingItem && effectiveOrgId) {
      const preview = generarCodigoInterno(effectiveOrgId);
      setCodigoInternoPreview(preview);
    }
  }, [showModal, editingItem, effectiveOrgId]);

  // Auto-seleccionar categoría al editar
  React.useEffect(() => {
    if (editingItem) {
      setSelectedCategoriaId(editingItem.categoria_id || '');
    } else {
      setSelectedCategoriaId('');
    }
  }, [editingItem]);

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && searchTerm) {
      // Buscar exacto por código de barras
      const exacto = items.find(i => i.codigo_barras === searchTerm);
      if (exacto) {
        setEditingItem(exacto);
        setShowModal(true);
        setSearchTerm('');
      }
    }
  };

  const itemsFiltrados = items.filter(i => {
    const matchSearch = !searchTerm ||
      i.codigo_interno?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.codigo_barras?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.nombre?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategoria = filtroCategoria === 'todas' || i.categoria_id === filtroCategoria;
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
        <div className="flex gap-3">
          {effectiveRole === 'ORG_ADMIN' && (
            <>
              <ExportarInventario 
                items={itemsFiltrados} 
                organizationName={organization?.name}
              />
              
              <Button
                onClick={() => { setEditingItem(null); setShowModal(true); }}
                className="bg-gradient-to-r from-emerald-500 to-blue-500 hover:shadow-lg transition-all"
              >
                <Plus className="w-5 h-5 mr-2" />
                Nuevo Item
              </Button>
            </>
          )}
          
          {effectiveRole !== 'ORG_ADMIN' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
              <p className="text-sm text-blue-800">
                👀 Vista de solo lectura - la gestión de inventario requiere ORG_ADMIN
              </p>
            </div>
          )}
        </div>
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
                placeholder="Buscar por código, SKU o nombre... (Enter para buscar exacto)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="pl-10"
              />
            </div>
            <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
              <SelectTrigger className="w-full md:w-64">
                <SelectValue placeholder="Filtrar por categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las categorías</SelectItem>
                {categorias.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.nombre}
                  </SelectItem>
                ))}
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
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">Código Interno</th>
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">Código/SKU</th>
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">Producto</th>
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">Categoría</th>
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">Stock</th>
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">Ubicación</th>
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">Precio</th>
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">Margen</th>
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">Garantía Prov.</th>
                  <th className="text-left p-4 text-sm font-semibold text-slate-700">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itemsFiltrados.map((item) => {
                  const margen = ((item.precio_venta - item.costo_unitario) / item.precio_venta * 100) || 0;
                  const bajoStock = item.cantidad_disponible <= item.punto_reorden;
                  const categoria = categorias.find(c => c.id === item.categoria_id);

                  // Calcular estado de garantía del proveedor
                  let estadoGarantiaProveedor = null;
                  if (item.garantia_proveedor_vence) {
                    const hoy = new Date();
                    const vence = new Date(item.garantia_proveedor_vence);
                    estadoGarantiaProveedor = vence >= hoy ? 'ACTIVA' : 'VENCIDA';
                  }

                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <span className="font-mono text-sm font-bold text-emerald-600">{item.codigo_interno}</span>
                      </td>
                      <td className="p-4">
                        <div>
                          {item.codigo_barras && (
                            <span className="font-mono text-xs text-blue-600 block">{item.codigo_barras}</span>
                          )}
                          {item.sku && (
                            <span className="font-mono text-xs text-slate-500 block">{item.sku}</span>
                          )}
                          {!item.codigo_barras && !item.sku && (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div>
                          <p className="font-medium text-slate-900">{item.nombre}</p>
                          <p className="text-xs text-slate-500">{item.marca} {item.modelo}</p>
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline" className="capitalize">
                          {categoria?.nombre || 'Sin categoría'}
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
                        {estadoGarantiaProveedor ? (
                          <Badge className={`${
                            estadoGarantiaProveedor === 'ACTIVA'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          } border-0 flex items-center gap-1 w-fit`}>
                            {estadoGarantiaProveedor === 'ACTIVA' ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <XCircle className="w-3 h-3" />
                            )}
                            {estadoGarantiaProveedor === 'ACTIVA' ? 'Activa' : 'Vencida'}
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                      <td className="p-4">
                        {effectiveRole === 'ORG_ADMIN' ? (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => { setEditingItem(item); setShowModal(true); }}
                            >
                              Editar
                            </Button>
                            {categoria?.permite_stock && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setAjusteItem(item)}
                                className="gap-1 text-slate-600 hover:text-emerald-700 hover:border-emerald-400"
                              >
                                <SlidersHorizontal className="w-3 h-3" />
                                Ajustar
                              </Button>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-slate-400">
                            Solo lectura
                          </Badge>
                        )}
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
              {/* CÓDIGO INTERNO - AUTO GENERADO */}
              {!editingItem && (
                <div className="space-y-2 col-span-2">
                  <Label>Código Interno del Sistema</Label>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                    <span className="font-mono text-sm font-bold text-emerald-600">
                      {codigoInternoPreview}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Este código se generará automáticamente al crear el producto
                  </p>
                </div>
              )}

              {editingItem && (
                <div className="space-y-2 col-span-2">
                  <Label>Código Interno</Label>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                    <span className="font-mono text-sm font-bold text-emerald-600">
                      {editingItem.codigo_interno}
                    </span>
                  </div>
                </div>
              )}

              {/* CATEGORÍA CON QUICK CREATE */}
              <div className="space-y-2 col-span-2">
                <Label htmlFor="categoria">Categoría *</Label>
                <div className="flex gap-2">
                  <Select 
                    value={selectedCategoriaId} 
                    onValueChange={setSelectedCategoriaId}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Seleccionar categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      {categorias.length === 0 && (
                        <div className="p-2 text-sm text-slate-500">
                          No hay categorías. Crea una nueva.
                        </div>
                      )}
                      {categorias.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowQuickCreateCategoria(true)}
                    className="shrink-0"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Nueva
                  </Button>
                </div>
                {!selectedCategoriaId && (
                  <p className="text-xs text-slate-500">
                    Ej: Repuestos, Servicios, Reciclaje
                  </p>
                )}
              </div>

              {/* TIPO DE ITEM */}
              <div className="space-y-2 col-span-2">
                <Label htmlFor="tipo_item">Tipo de Item *</Label>
                <Select name="tipo_item" defaultValue={editingItem?.tipo_item || 'producto'} disabled={effectiveRole !== 'ORG_ADMIN'}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="producto">Producto</SelectItem>
                    <SelectItem value="servicio_diagnostico">Servicio / Diagnóstico</SelectItem>
                    <SelectItem value="servicio_estandar">Servicio Estándar</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  {effectiveRole === 'ORG_ADMIN' 
                    ? 'Define el tipo de ítem (POS usará esto para inferir el concepto de venta)' 
                    : '⚠️ Solo ORG_ADMIN puede modificar este campo'}
                </p>
              </div>

              {/* CÓDIGO DE BARRAS Y SKU */}
              <div className="space-y-2">
                <Label htmlFor="codigo_barras">Código de Barras</Label>
                <Input
                  id="codigo_barras"
                  name="codigo_barras"
                  defaultValue={editingItem?.codigo_barras}
                  placeholder="Ej: 7501234567890"
                />
                <p className="text-xs text-slate-500">Opcional - Escanear o ingresar</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sku">SKU</Label>
                <Input
                  id="sku"
                  name="sku"
                  defaultValue={editingItem?.sku}
                  placeholder="Ej: SKU-DELL-65W"
                />
                <p className="text-xs text-slate-500">Opcional</p>
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="nombre">Nombre del Producto *</Label>
                <Input
                  id="nombre"
                  name="nombre"
                  defaultValue={editingItem?.nombre}
                  placeholder="Ej: Cargador Dell 65W, SSD Kingston 500GB"
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

              {/* CAMPOS DINÁMICOS SEGÚN CATEGORÍA */}
              {selectedCategoriaId && categorias.find(c => c.id === selectedCategoriaId)?.permite_stock && (
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
              )}

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

              {selectedCategoriaId && categorias.find(c => c.id === selectedCategoriaId)?.es_vendible && (
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
              )}

              {/* CAMPOS DE RECICLAJE */}
              {selectedCategoriaId && categorias.find(c => c.id === selectedCategoriaId)?.nombre === 'Reciclaje' && (
                <>
                  <div className="space-y-2 col-span-2">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                      <Leaf className="w-5 h-5 text-green-600 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-green-900 mb-1">
                          Información de Reciclaje
                        </p>
                        <p className="text-xs text-green-700">
                          Los siguientes campos son opcionales y sirven para tracking interno de impacto ambiental.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="co2_evitado">CO₂ Evitado (kg)</Label>
                    <Input
                      type="number"
                      id="co2_evitado"
                      name="co2_evitado"
                      defaultValue={editingItem?.co2_evitado || 0}
                      step="0.01"
                      min="0"
                      placeholder="0"
                    />
                    <p className="text-xs text-slate-500">
                      Estimación opcional del CO₂ evitado al reutilizar o reciclar este componente. Puede dejarse en 0.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="valor_recuperado">Valor Recuperado (₡)</Label>
                    <Input
                      type="number"
                      id="valor_recuperado"
                      name="valor_recuperado"
                      defaultValue={editingItem?.valor_recuperado || 0}
                      step="0.01"
                      min="0"
                      placeholder="0"
                    />
                    <p className="text-xs text-slate-500">
                      Valor económico estimado recuperado. Opcional.
                    </p>
                  </div>

                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="notas_reciclaje">Notas de Reciclaje</Label>
                    <Textarea
                      id="notas_reciclaje"
                      name="notas_reciclaje"
                      defaultValue={editingItem?.notas_reciclaje}
                      placeholder="Observaciones internas sobre el destino del material..."
                      rows={3}
                    />
                    <p className="text-xs text-slate-500">
                      Observaciones internas sobre el destino del material.
                    </p>
                  </div>
                </>
              )}

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

              {/* SECCIÓN COMPRA Y GARANTÍA DEL PROVEEDOR */}
              <div className="col-span-2 space-y-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-5 h-5 text-blue-600" />
                  <h4 className="font-semibold text-slate-900">
                    Información de Compra y Garantía del Proveedor
                  </h4>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fecha_compra">Fecha de Compra</Label>
                    <Input
                      type="date"
                      id="fecha_compra"
                      name="fecha_compra"
                      defaultValue={editingItem?.fecha_compra}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="documento_compra">Documento de Compra (opcional)</Label>
                    <Input
                      id="documento_compra"
                      name="documento_compra"
                      defaultValue={editingItem?.documento_compra}
                      placeholder="Ej: FAC-12345"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="garantia_proveedor_meses">Garantía del Proveedor (meses)</Label>
                    <Input
                      type="number"
                      id="garantia_proveedor_meses"
                      name="garantia_proveedor_meses"
                      defaultValue={editingItem?.garantia_proveedor_meses}
                      min="0"
                      placeholder="Ej: 12"
                    />
                    <p className="text-xs text-slate-500">
                      Duración en meses de la garantía del proveedor
                    </p>
                  </div>

                  {editingItem?.garantia_proveedor_vence && (
                    <div className="space-y-2">
                      <Label>Estado de Garantía</Label>
                      <div className="flex items-center gap-2 p-3 bg-white rounded-lg border border-slate-200">
                        <Badge className={`${
                          new Date(editingItem.garantia_proveedor_vence) >= new Date()
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        } border-0`}>
                          {new Date(editingItem.garantia_proveedor_vence) >= new Date() ? '✅ ACTIVA' : '❌ VENCIDA'}
                        </Badge>
                        <span className="text-sm text-slate-600">
                          Vence: {new Date(editingItem.garantia_proveedor_vence).toLocaleDateString('es-ES')}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="bg-white rounded-lg p-3 border border-blue-100">
                  <p className="text-xs text-slate-600">
                    ⚠️ <strong>Importante:</strong> Esta garantía es del proveedor hacia tu negocio, <strong>NO</strong> la garantía al cliente final.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-6">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setShowModal(false);
                  setSelectedCategoriaId('');
                  setCodigoInternoPreview('');
                }}
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                className="bg-gradient-to-r from-emerald-500 to-blue-500"
                disabled={!selectedCategoriaId}
              >
                {editingItem ? 'Actualizar' : 'Crear'} Item
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL AJUSTE STOCK */}
      <ModalAjusteStock
        open={!!ajusteItem}
        onOpenChange={(open) => { if (!open) setAjusteItem(null); }}
        item={ajusteItem}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['inventario'] });
          setAjusteItem(null);
        }}
      />

      {/* QUICK CREATE CATEGORÍA */}
      <QuickCreateCategoria
        open={showQuickCreateCategoria}
        onOpenChange={setShowQuickCreateCategoria}
        organizationId={effectiveOrgId}
        onCreated={(newCategoria) => {
          queryClient.invalidateQueries({ queryKey: ['categorias'] });
          setSelectedCategoriaId(newCategoria.id);
        }}
      />
    </div>
  );
}
