import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShoppingCart, Plus, Trash2, Search, DollarSign } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function PuntoVenta() {
  const [user, setUser] = useState(null);
  const [carrito, setCarrito] = useState([]);
  const [searchSKU, setSearchSKU] = useState('');
  const [clienteSeleccionado, setClienteSeleccionado] = useState('');
  const [departamento, setDepartamento] = useState('retail');
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: inventario = [] } = useQuery({
    queryKey: ['inventario'],
    queryFn: () => base44.entities.Inventario.list(),
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => base44.entities.Cliente.list(),
  });

  const createVentaMutation = useMutation({
    mutationFn: (data) => base44.entities.Venta.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ventas'] });
      queryClient.invalidateQueries({ queryKey: ['inventario'] });
      setCarrito([]);
      setClienteSeleccionado('');
      alert('Venta registrada exitosamente');
    },
  });

  const agregarAlCarrito = (item) => {
    const yaExiste = carrito.find(c => c.sku === item.sku);
    if (yaExiste) {
      setCarrito(carrito.map(c =>
        c.sku === item.sku
          ? { ...c, cantidad: c.cantidad + 1 }
          : c
      ));
    } else {
      setCarrito([...carrito, {
        sku: item.sku,
        descripcion: item.nombre,
        cantidad: 1,
        precio_unitario: item.precio_venta,
        costo_unitario: item.costo_unitario,
        descuento_porcentaje: 0,
        subtotal: item.precio_venta,
      }]);
    }
    setSearchSKU('');
  };

  const actualizarCantidad = (sku, cantidad) => {
    setCarrito(carrito.map(c =>
      c.sku === sku
        ? { ...c, cantidad, subtotal: cantidad * c.precio_unitario * (1 - c.descuento_porcentaje / 100) }
        : c
    ));
  };

  const actualizarDescuento = (sku, descuento) => {
    setCarrito(carrito.map(c =>
      c.sku === sku
        ? { ...c, descuento_porcentaje: descuento, subtotal: c.cantidad * c.precio_unitario * (1 - descuento / 100) }
        : c
    ));
  };

  const eliminarDelCarrito = (sku) => {
    setCarrito(carrito.filter(c => c.sku !== sku));
  };

  const calcularTotales = () => {
    const subtotal = carrito.reduce((sum, item) => sum + item.subtotal, 0);
    const impuesto = subtotal * 0.13;
    const total = subtotal + impuesto;
    const descuentoTotal = carrito.reduce((sum, item) => 
      sum + (item.cantidad * item.precio_unitario * item.descuento_porcentaje / 100), 0
    );
    const costoTotal = carrito.reduce((sum, item) => sum + (item.cantidad * item.costo_unitario), 0);
    const margenBruto = total - costoTotal;

    return { subtotal, impuesto, total, descuentoTotal, margenBruto };
  };

  const procesarVenta = () => {
    if (!clienteSeleccionado) {
      alert('Debe seleccionar un cliente');
      return;
    }
    if (carrito.length === 0) {
      alert('El carrito está vacío');
      return;
    }

    const totales = calcularTotales();

    const ventaData = {
      numero_factura: `F-${Date.now()}`,
      cliente_id: clienteSeleccionado,
      vendedor: user?.email || 'sistema',
      departamento,
      items: carrito,
      subtotal: totales.subtotal,
      impuesto: totales.impuesto,
      descuento_total: totales.descuentoTotal,
      total: totales.total,
      metodo_pago: metodoPago,
      estado_pago: 'pagado',
      margen_bruto: totales.margenBruto,
    };

    createVentaMutation.mutate(ventaData);
  };

  const itemsBusqueda = inventario.filter(i =>
    i.sku?.toLowerCase().includes(searchSKU.toLowerCase()) ||
    i.nombre?.toLowerCase().includes(searchSKU.toLowerCase())
  ).slice(0, 5);

  const totales = calcularTotales();

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">Punto de Venta</h1>
        <p className="text-slate-500">Registro de ventas por departamento</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel Izquierdo - Búsqueda y Productos */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-lg font-semibold">Buscar Productos</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  placeholder="Buscar por SKU o nombre..."
                  value={searchSKU}
                  onChange={(e) => setSearchSKU(e.target.value)}
                  className="pl-10"
                />
              </div>

              {searchSKU && itemsBusqueda.length > 0 && (
                <div className="mt-4 space-y-2">
                  {itemsBusqueda.map(item => (
                    <div
                      key={item.id}
                      onClick={() => agregarAlCarrito(item)}
                      className="p-4 border border-slate-200 rounded-lg hover:border-emerald-500 hover:bg-emerald-50 cursor-pointer transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">{item.nombre}</p>
                          <p className="text-sm text-slate-500">{item.sku} • Stock: {item.cantidad_disponible}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-emerald-600">₡{item.precio_venta?.toLocaleString()}</p>
                          <Button size="sm" className="mt-1">
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Carrito */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                Carrito ({carrito.length} items)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {carrito.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <ShoppingCart className="w-16 h-16 mx-auto mb-3 opacity-20" />
                  <p>El carrito está vacío</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {carrito.map((item) => (
                    <div key={item.sku} className="p-4 bg-slate-50 rounded-xl">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <p className="font-semibold text-slate-900">{item.descripcion}</p>
                          <p className="text-sm text-slate-500">{item.sku}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => eliminarDelCarrito(item.sku)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs">Cantidad</Label>
                          <Input
                            type="number"
                            value={item.cantidad}
                            onChange={(e) => actualizarCantidad(item.sku, parseInt(e.target.value) || 1)}
                            min="1"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Desc. %</Label>
                          <Input
                            type="number"
                            value={item.descuento_porcentaje}
                            onChange={(e) => actualizarDescuento(item.sku, parseFloat(e.target.value) || 0)}
                            min="0"
                            max="100"
                            step="0.1"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Subtotal</Label>
                          <p className="font-bold text-emerald-600 mt-2">
                            ₡{item.subtotal.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Panel Derecho - Resumen y Pago */}
        <div className="space-y-6">
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-lg font-semibold">Detalles de Venta</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Select value={clienteSeleccionado} onValueChange={setClienteSeleccionado}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre_completo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Departamento</Label>
                <Select value={departamento} onValueChange={setDepartamento}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="taller">Taller</SelectItem>
                    <SelectItem value="retail">Retail</SelectItem>
                    <SelectItem value="suministros">Suministros</SelectItem>
                    <SelectItem value="servicios">Servicios</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Método de Pago</Label>
                <Select value={metodoPago} onValueChange={setMetodoPago}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="tarjeta">Tarjeta</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="credito">Crédito</SelectItem>
                    <SelectItem value="mixto">Mixto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-slate-50 to-emerald-50">
            <CardHeader className="border-b border-slate-200">
              <CardTitle className="text-lg font-semibold">Resumen de Pago</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Subtotal:</span>
                <span className="font-semibold">₡{totales.subtotal.toLocaleString()}</span>
              </div>

              {totales.descuentoTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-orange-600">Descuento:</span>
                  <span className="font-semibold text-orange-600">-₡{totales.descuentoTotal.toLocaleString()}</span>
                </div>
              )}

              <div className="flex justify-between text-sm">
                <span className="text-slate-600">IVA (13%):</span>
                <span className="font-semibold">₡{totales.impuesto.toLocaleString()}</span>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold text-slate-900">Total:</span>
                  <span className="text-2xl font-bold text-emerald-600">
                    ₡{totales.total.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex justify-between text-xs pt-2 border-t border-slate-200">
                <span className="text-slate-500">Margen bruto:</span>
                <span className="font-semibold text-green-600">
                  ₡{totales.margenBruto.toLocaleString()}
                </span>
              </div>

              <Button
                onClick={procesarVenta}
                disabled={carrito.length === 0 || !clienteSeleccionado || createVentaMutation.isPending}
                className="w-full bg-gradient-to-r from-emerald-500 to-blue-500 hover:shadow-lg transition-all h-14 text-lg"
              >
                <DollarSign className="w-5 h-5 mr-2" />
                {createVentaMutation.isPending ? 'Procesando...' : 'Procesar Venta'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}