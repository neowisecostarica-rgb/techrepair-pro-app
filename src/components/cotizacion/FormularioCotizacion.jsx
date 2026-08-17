import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Trash2, Search, Package, AlertCircle, UserPlus } from 'lucide-react';
import { withOrgId } from '@/components/hooks/useOrgData';
import CrearClienteRapido from './CrearClienteRapido';

const DESCUENTO_MAXIMO_SIN_APROBACION = 15;

export default function FormularioCotizacion({ 
  clienteId, 
  ordenTrabajoId, 
  user, 
  userAccount, 
  clientes = [],
  cotizacionEditar = null,
  onGuardar,
  onCancelar
}) {
  const [items, setItems] = useState(cotizacionEditar?.items || [{ 
    tipo: 'servicio', 
    descripcion: '', 
    cantidad: 1, 
    precio_unitario: 0, 
    descuento_porcentaje: 0, 
    subtotal: 0 
  }]);
  const [busquedaProductos, setBusquedaProductos] = useState({});
  const [productoSeleccionado, setProductoSeleccionado] = useState({});
  const [clienteSeleccionadoInterno, setClienteSeleccionadoInterno] = useState(clienteId || cotizacionEditar?.cliente_id || '');
  const [showCrearCliente, setShowCrearCliente] = useState(false);
  const queryClient = useQueryClient();

  const clienteActual = clienteId || clienteSeleccionadoInterno;

  const { data: inventario = [] } = useQuery({
    queryKey: ['inventario-disponible'],
    queryFn: () => base44.entities.Inventario.filter({ estado: 'activo' }),
  });

  const { data: servicios = [] } = useQuery({
    queryKey: ['servicios-disponibles'],
    queryFn: () => base44.entities.Servicio.filter({ activo: true }),
  });

  const createCotizacionMutation = useMutation({
    mutationFn: (data) => base44.entities.Cotizacion.create(withOrgId(data, userAccount)),
    onSuccess: (nuevaCotizacion) => {
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] });
      queryClient.invalidateQueries({ queryKey: ['cotizaciones-ventas'] });
      if (onGuardar) onGuardar(nuevaCotizacion);
    },
  });

  const updateCotizacionMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Cotizacion.update(id, data),
    onSuccess: (cotizacionActualizada) => {
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] });
      queryClient.invalidateQueries({ queryKey: ['cotizaciones-ventas'] });
      if (onGuardar) onGuardar(cotizacionActualizada);
    },
  });

  const buscarProducto = (texto, index) => {
    setBusquedaProductos(prev => ({ ...prev, [index]: texto }));
  };

  const seleccionarItem = (item, index) => {
    const newItems = [...items];
    newItems[index].descripcion = item.nombre;
    newItems[index].precio_unitario = item.precio_venta || 0;
    newItems[index].tipo = item.tipo_sugerido;
    newItems[index].referencia_id = item.id;
    delete newItems[index].item_id;
    newItems[index].origen = item.origen;
    
    const cantidad = parseFloat(newItems[index].cantidad) || 0;
    const precio = parseFloat(newItems[index].precio_unitario) || 0;
    const descuento = parseFloat(newItems[index].descuento_porcentaje) || 0;
    const subtotalSinDescuento = cantidad * precio;
    newItems[index].subtotal = subtotalSinDescuento - (subtotalSinDescuento * descuento / 100);
    
    setItems(newItems);
    setProductoSeleccionado(prev => ({ ...prev, [index]: item }));
    setBusquedaProductos(prev => ({ ...prev, [index]: '' }));
  };

  const getItemsDisponibles = (index) => {
    const busqueda = busquedaProductos[index] || '';
    if (!busqueda || busqueda.length < 2) return [];
    
    const textoLower = busqueda.toLowerCase();
    
    const productosInventario = inventario
      .filter(p => 
        p.nombre?.toLowerCase().includes(textoLower) ||
        p.codigo_interno?.toLowerCase().includes(textoLower) ||
        p.marca?.toLowerCase().includes(textoLower)
      )
      .map(p => ({ 
        ...p, 
        origen: 'inventario',
        tipo_sugerido: 'producto' 
      }));
    
    const serviciosDisponibles = servicios
      .filter(s => 
        s.nombre?.toLowerCase().includes(textoLower) ||
        s.descripcion?.toLowerCase().includes(textoLower)
      )
      .map(s => ({ 
        ...s, 
        nombre: s.nombre,
        precio_venta: s.precio || 0,
        cantidad_disponible: null,
        origen: 'servicio',
        tipo_sugerido: 'servicio'
      }));
    
    return [...productosInventario, ...serviciosDisponibles].slice(0, 8);
  };

  const addItem = () => {
    setItems([...items, { tipo: 'servicio', descripcion: '', cantidad: 1, precio_unitario: 0, descuento_porcentaje: 0, subtotal: 0 }]);
  };

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;

    if (field === 'cantidad' || field === 'precio_unitario' || field === 'descuento_porcentaje') {
      const cantidad = parseFloat(newItems[index].cantidad) || 0;
      const precio = parseFloat(newItems[index].precio_unitario) || 0;
      const descuento = parseFloat(newItems[index].descuento_porcentaje) || 0;
      const subtotalSinDescuento = cantidad * precio;
      newItems[index].subtotal = subtotalSinDescuento - (subtotalSinDescuento * descuento / 100);
    }

    setItems(newItems);
  };

  const calcularTotales = () => {
    const subtotal = items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    const descuentoTotal = items.reduce((sum, item) => {
      const cantidad = parseFloat(item.cantidad) || 0;
      const precio = parseFloat(item.precio_unitario) || 0;
      const descuento = parseFloat(item.descuento_porcentaje) || 0;
      return sum + (cantidad * precio * descuento / 100);
    }, 0);
    const impuesto = subtotal * 0.13;
    const total = subtotal + impuesto;

    const descuentoPromedio = subtotal > 0 ? (descuentoTotal / subtotal) * 100 : 0;
    const requiereAprobacion = descuentoPromedio > DESCUENTO_MAXIMO_SIN_APROBACION;

    return { subtotal, descuentoTotal, impuesto, total, requiereAprobacion };
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!clienteActual) {
      alert('Por favor selecciona un cliente antes de guardar la cotización');
      return;
    }

    const formData = new FormData(e.target);
    const totales = calcularTotales();

    const cotizacionData = {
      cliente_id: clienteActual,
      vendedor_id: user.id,
      vendedor_nombre: user.full_name || user.email,
      orden_trabajo_id: ordenTrabajoId || null,
      items: items,
      subtotal: totales.subtotal,
      descuento_total: totales.descuentoTotal,
      impuesto: totales.impuesto,
      total: totales.total,
      estado: 'borrador',
      requiere_aprobacion: totales.requiereAprobacion,
      valida_hasta: formData.get('valida_hasta'),
      notas: formData.get('notas'),
    };

    if (cotizacionEditar) {
      updateCotizacionMutation.mutate({ id: cotizacionEditar.id, data: cotizacionData });
    } else {
      createCotizacionMutation.mutate(cotizacionData);
    }
  };

  const totales = calcularTotales();

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        {!clienteId && (
          <div className="space-y-2">
            <Label>Cliente *</Label>
            <div className="flex gap-2">
              <Select 
                value={clienteSeleccionadoInterno} 
                onValueChange={setClienteSeleccionadoInterno}
                disabled={!!cotizacionEditar}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Selecciona un cliente..." />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre_completo} - {c.telefono}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!cotizacionEditar && (
                <Button
                  type="button"
                  onClick={() => setShowCrearCliente(true)}
                  variant="outline"
                  className="shrink-0 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Crear Cliente
                </Button>
              )}
            </div>
            {!clienteSeleccionadoInterno && (
              <Alert className="bg-amber-50 border-amber-200">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <AlertDescription className="text-amber-800 text-sm">
                  Selecciona un cliente o crea uno nuevo antes de guardar
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <Alert className="bg-blue-50 border-blue-200">
          <Package className="w-4 h-4 text-blue-600" />
          <AlertDescription className="text-blue-800 text-sm">
            💡 <strong>Inventario informativo:</strong> El stock mostrado es referencial. Al facturar se validará disponibilidad real.
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Items de la Cotización</Label>
            <Button type="button" size="sm" variant="outline" onClick={addItem}>
              <Plus className="w-4 h-4 mr-2" />
              Agregar Item
            </Button>
          </div>

          {items.map((item, idx) => {
            const productoActual = productoSeleccionado[idx];
            const resultados = getItemsDisponibles(idx);
            
            return (
            <Card key={idx} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="grid grid-cols-6 gap-3">
                    <div>
                      <Label className="text-xs">Tipo</Label>
                      <Select
                        value={item.tipo}
                        onValueChange={(value) => {
                          updateItem(idx, 'tipo', value);
                          if (value === 'servicio') {
                            setProductoSeleccionado(prev => ({ ...prev, [idx]: null }));
                          }
                        }}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="producto">Producto</SelectItem>
                          <SelectItem value="servicio">Servicio</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 relative">
                      <Label className="text-xs">Buscar / Descripción</Label>
                      <div className="relative">
                        <Search className="absolute left-2 top-2 w-4 h-4 text-slate-400" />
                        <Input
                          value={busquedaProductos[idx] || ''}
                          onChange={(e) => buscarProducto(e.target.value, idx)}
                          placeholder={item.tipo === 'producto' ? 'Buscar producto...' : 'Descripción...'}
                          className="h-9 pl-8"
                        />
                      </div>
                      {resultados.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {resultados.map(item => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => seleccionarItem(item, idx)}
                              className="w-full px-3 py-2 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className="text-sm font-medium text-slate-900">{item.nombre}</p>
                                    <Badge className={item.origen === 'inventario' ? 'bg-blue-100 text-blue-700 border-0' : 'bg-purple-100 text-purple-700 border-0'}>
                                      {item.origen === 'inventario' ? 'Producto' : 'Servicio'}
                                    </Badge>
                                  </div>
                                  {item.codigo_interno && (
                                    <p className="text-xs text-slate-500">{item.codigo_interno}</p>
                                  )}
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-medium text-emerald-600">₡{item.precio_venta?.toLocaleString()}</p>
                                  {item.cantidad_disponible !== null && (
                                    <p className="text-xs text-slate-500">Stock: {item.cantidad_disponible}</p>
                                  )}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="col-span-3">
                      <Label className="text-xs">Descripción Final</Label>
                      <Input
                        value={item.descripcion}
                        onChange={(e) => updateItem(idx, 'descripcion', e.target.value)}
                        placeholder="Lo que aparecerá en la cotización"
                        className="h-9"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-6 gap-3">
                    <div>
                      <Label className="text-xs">Cant.</Label>
                      <Input
                        type="number"
                        value={item.cantidad}
                        onChange={(e) => updateItem(idx, 'cantidad', e.target.value)}
                        min="1"
                        className="h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Precio</Label>
                      <Input
                        type="number"
                        value={item.precio_unitario}
                        onChange={(e) => updateItem(idx, 'precio_unitario', e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Desc. %</Label>
                      <Input
                        type="number"
                        value={item.descuento_porcentaje}
                        onChange={(e) => updateItem(idx, 'descuento_porcentaje', e.target.value)}
                        min="0"
                        max="100"
                        className="h-9"
                      />
                    </div>
                  </div>

                  {productoActual && (
                    <Alert className="bg-blue-50 border-blue-200">
                      <Package className="w-4 h-4 text-blue-600" />
                      <AlertDescription className="text-blue-800">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            📦 Stock: {productoActual.cantidad_disponible} unidades
                          </span>
                        </div>
                        <p className="text-xs mt-1 text-blue-600">
                          ⚠️ No reservado - Se valida al facturar
                        </p>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                <div className="flex items-center justify-between mt-2">
                  <p className="text-sm font-medium text-slate-700">
                    Subtotal: ₡{item.subtotal.toLocaleString()}
                  </p>
                  {items.length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => removeItem(idx)}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>

        <div className="bg-slate-50 p-4 rounded-lg space-y-2">
          <div className="flex justify-between text-sm">
            <span>Subtotal:</span>
            <span className="font-medium">₡{totales.subtotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Descuento:</span>
            <span className="font-medium text-emerald-600">-₡{totales.descuentoTotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>IVA (13%):</span>
            <span className="font-medium">₡{totales.impuesto.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-lg font-bold border-t pt-2">
            <span>Total:</span>
            <span className="text-emerald-600">₡{totales.total.toLocaleString()}</span>
          </div>
          {totales.requiereAprobacion && (
            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-xs text-yellow-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Requiere aprobación (descuento &gt; {DESCUENTO_MAXIMO_SIN_APROBACION}%)
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Válida hasta</Label>
          <Input
            name="valida_hasta"
            type="date"
            defaultValue={cotizacionEditar?.valida_hasta}
          />
        </div>

        <div className="space-y-2">
          <Label>Notas</Label>
          <Textarea
            name="notas"
            placeholder="Notas adicionales..."
            defaultValue={cotizacionEditar?.notas}
            rows={2}
          />
        </div>

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={createCotizacionMutation.isPending || updateCotizacionMutation.isPending}>
            {createCotizacionMutation.isPending || updateCotizacionMutation.isPending ? 'Guardando...' : 'Guardar Cotización'}
          </Button>
        </div>
      </form>

      <CrearClienteRapido
        open={showCrearCliente}
        onClose={() => setShowCrearCliente(false)}
        onClienteCreado={(cliente) => {
          setClienteSeleccionadoInterno(cliente.id);
          setShowCrearCliente(false);
        }}
        userAccount={userAccount}
        clientes={clientes}
      />
    </>
  );
}
