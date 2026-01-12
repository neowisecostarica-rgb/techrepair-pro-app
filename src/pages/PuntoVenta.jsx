import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShoppingCart, Plus, Trash2, Search, DollarSign, Package, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useUserAccount, withOrgId } from '@/components/hooks/useOrgData';
import { useLocation } from 'react-router-dom';
import PageGuard from '../components/guards/PageGuard';
import CrearProductoRapido from '../components/inventario/CrearProductoRapido';
import TiqueteVenta from '../components/ventas/TiqueteVenta';
import { useAuthContext } from '../components/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function PuntoVenta() {
  return (
    <PageGuard allowedRoles={['SALES', 'ORG_ADMIN', 'BRANCH_ADMIN']}>
      <PuntoVentaContent />
    </PageGuard>
  );
}

function PuntoVentaContent() {
  const location = useLocation();
  const preloadedVenta = location.state?.venta;
  
  const [carrito, setCarrito] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [clienteSeleccionado, setClienteSeleccionado] = useState('');
  const [origenVenta, setOrigenVenta] = useState('tienda');
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [ventaId, setVentaId] = useState(null);
  const [showCrearRapido, setShowCrearRapido] = useState(false);
  const [codigoNoEncontrado, setCodigoNoEncontrado] = useState('');
  const [ventaCompletada, setVentaCompletada] = useState(null);
  const queryClient = useQueryClient();
  const { user, userAccount } = useUserAccount();
  const { effectiveRole } = useAuthContext();

  // Precargar venta si viene de taller
  useEffect(() => {
    if (preloadedVenta) {
      setVentaId(preloadedVenta.id);
      setOrigenVenta(preloadedVenta.origen_venta);
      setClienteSeleccionado(preloadedVenta.cliente_id);
      // Cargar items de la venta
      if (preloadedVenta.items) {
        setCarrito(preloadedVenta.items);
      }
    }
  }, [preloadedVenta]);

  const { data: inventario = [] } = useQuery({
    queryKey: ['inventario', userAccount?.organization_id],
    queryFn: () => base44.entities.Inventario.filter({
      organization_id: userAccount.organization_id
    }),
    enabled: !!userAccount?.organization_id,
  });

  const { data: servicios = [] } = useQuery({
    queryKey: ['servicios', userAccount?.organization_id],
    queryFn: () => base44.entities.Servicio.filter({
      organization_id: userAccount.organization_id,
      activo: true
    }),
    enabled: !!userAccount?.organization_id,
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes', userAccount?.organization_id],
    queryFn: () => base44.entities.Cliente.filter({
      organization_id: userAccount.organization_id
    }),
    enabled: !!userAccount?.organization_id,
  });

  const createVentaMutation = useMutation({
    mutationFn: async (ventaData) => {
      // Si ya existe venta (cobro de taller), solo actualizar
      if (ventaId) {
        return await base44.entities.Venta.update(ventaId, {
          estado: 'pagada',
          metodo_pago: ventaData.metodo_pago
        });
      }
      // Crear nueva venta
      return await base44.entities.Venta.create(ventaData);
    },
    onSuccess: async (venta) => {
      // Crear items si es venta nueva
      if (!ventaId) {
        for (const item of carrito) {
          await base44.entities.VentaItem.create(withOrgId({
            venta_id: venta.id,
            tipo: item.tipo,
            referencia_id: item.referencia_id,
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            subtotal: item.subtotal
          }, userAccount));
        }
      }

      // ✅ EMISIÓN AUTOMÁTICA DE GARANTÍA
      await emitirGarantiaAutomatica(venta);

      queryClient.invalidateQueries({ queryKey: ['ventas'] });
      queryClient.invalidateQueries({ queryKey: ['inventario'] });
      
      // Mostrar tiquete con garantía
      setVentaCompletada(venta);
      
      setCarrito([]);
      setClienteSeleccionado('');
      setVentaId(null);
    },
  });

  const emitirGarantiaAutomatica = async (venta) => {
    try {
      // Solo emitir si hay cliente
      if (!venta.cliente_id) return;

      // Cargar config de garantía
      const orgs = await base44.entities.Organization.list();
      const org = orgs.find(o => o.id === venta.organization_id);
      const config = org?.garantia_config;

      if (!config || !config.texto_ventas) return;

      // Generar token único
      const token = `GRTV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Calcular fechas
      const fechaEmision = new Date();
      const fechaInicio = new Date();
      const fechaFin = new Date();
      fechaFin.setMonth(fechaFin.getMonth() + (config.meses_vigencia_ventas || 12));

      // Crear garantía
      await base44.entities.Garantia.create({
        organization_id: venta.organization_id,
        cliente_id: venta.cliente_id,
        origen_tipo: 'VENTA',
        origen_id: venta.id,
        public_access_token: token,
        fecha_emision: fechaEmision.toISOString().split('T')[0],
        fecha_inicio: fechaInicio.toISOString().split('T')[0],
        fecha_fin: fechaFin.toISOString().split('T')[0],
        estado: 'ACTIVA',
        texto_snapshot: config.texto_ventas,
        creado_por: user?.id
      });
    } catch (error) {
      console.error('Error emitiendo garantía:', error);
      // No bloquear la venta si falla la garantía
    }
  };

  const agregarAlCarrito = (item, tipo) => {
    const yaExiste = carrito.find(c => c.referencia_id === item.id);
    if (yaExiste) {
      setCarrito(carrito.map(c =>
        c.referencia_id === item.id
          ? { ...c, cantidad: c.cantidad + 1, subtotal: (c.cantidad + 1) * c.precio_unitario }
          : c
      ));
    } else {
      setCarrito([...carrito, {
        tipo,
        referencia_id: item.id,
        descripcion: tipo === 'producto' ? item.nombre : item.nombre,
        cantidad: 1,
        precio_unitario: tipo === 'producto' ? item.precio_venta : item.precio,
        subtotal: tipo === 'producto' ? item.precio_venta : item.precio,
      }]);
    }
    setSearchTerm('');
  };

  const actualizarCantidad = (referenciaId, cantidad) => {
    setCarrito(carrito.map(c =>
      c.referencia_id === referenciaId
        ? { ...c, cantidad, subtotal: cantidad * c.precio_unitario }
        : c
    ));
  };

  const eliminarDelCarrito = (referenciaId) => {
    setCarrito(carrito.filter(c => c.referencia_id !== referenciaId));
  };

  const calcularTotales = () => {
    const subtotal = carrito.reduce((sum, item) => sum + item.subtotal, 0);
    const impuesto = subtotal * 0.13;
    const total = subtotal + impuesto;
    return { subtotal, impuesto, total };
  };

  const procesarVenta = () => {
    if (carrito.length === 0) {
      alert('El carrito está vacío');
      return;
    }

    const totales = calcularTotales();

    const ventaData = withOrgId({
      branch_id: userAccount.branch_id,
      cliente_id: clienteSeleccionado || null,
      origen_venta: origenVenta,
      total: totales.total,
      subtotal: totales.subtotal,
      impuesto: totales.impuesto,
      metodo_pago: metodoPago,
      estado: 'pagada',
      created_by_user_id: user?.id,
    }, userAccount);

    createVentaMutation.mutate(ventaData);
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && searchTerm && !ventaId) {
      // Buscar exacto por código de barras
      const exacto = inventario.find(i => i.codigo_barras === searchTerm);
      if (exacto) {
        agregarAlCarrito(exacto, 'producto');
        setSearchTerm('');
      } else {
        setCodigoNoEncontrado(searchTerm);
      }
    }
  };

  const itemsBusqueda = [
    ...inventario.filter(i =>
      i.codigo_barras?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.sku?.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 3).map(i => ({ ...i, tipo: 'producto' })),
    ...servicios.filter(s =>
      s.nombre?.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 3).map(s => ({ ...s, tipo: 'servicio' }))
  ];

  const totales = calcularTotales();

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">Punto de Venta</h1>
        <p className="text-slate-500">
          {ventaId ? '💳 Cobrar trabajo de taller' : 'Venta directa de productos y servicios'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel Izquierdo - Búsqueda */}
        <div className="lg:col-span-2 space-y-6">
          {!ventaId && (
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="text-lg font-semibold">Buscar Productos y Servicios</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <Input
                      placeholder="Escanear código o buscar... (Enter para agregar)"
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCodigoNoEncontrado('');
                      }}
                      onKeyDown={handleSearchKeyDown}
                      className="pl-10"
                      autoFocus
                    />
                  </div>
                  
                  {codigoNoEncontrado && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
                      <span className="text-sm text-red-700">
                        ❌ Producto no encontrado: <strong>{codigoNoEncontrado}</strong>
                      </span>
                      {(effectiveRole === 'ORG_ADMIN' || effectiveRole === 'BRANCH_ADMIN') && (
                        <Button
                          size="sm"
                          onClick={() => {
                            setShowCrearRapido(true);
                          }}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Crear Producto
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {searchTerm && itemsBusqueda.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {itemsBusqueda.map((item) => (
                      <div
                        key={`${item.tipo}-${item.id}`}
                        onClick={() => agregarAlCarrito(item, item.tipo)}
                        className="p-4 border border-slate-200 rounded-lg hover:border-emerald-500 hover:bg-emerald-50 cursor-pointer transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {item.tipo === 'producto' ? (
                              <Package className="w-8 h-8 text-blue-500" />
                            ) : (
                              <Wrench className="w-8 h-8 text-purple-500" />
                            )}
                            <div>
                              <p className="font-semibold text-slate-900">{item.nombre}</p>
                              <div className="flex gap-2 items-center">
                                <Badge variant="outline" className="capitalize">
                                  {item.tipo}
                                </Badge>
                                {item.tipo === 'producto' && (
                                  <p className="text-xs text-slate-500">SKU: {item.sku} • Stock: {item.cantidad_disponible}</p>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-emerald-600">
                              ₡{(item.tipo === 'producto' ? item.precio_venta : item.precio)?.toLocaleString()}
                            </p>
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
          )}

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
                    <div key={item.referencia_id} className="p-4 bg-slate-50 rounded-xl">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {item.tipo === 'producto' ? (
                              <Package className="w-4 h-4 text-blue-500" />
                            ) : (
                              <Wrench className="w-4 h-4 text-purple-500" />
                            )}
                            <p className="font-semibold text-slate-900">{item.descripcion}</p>
                          </div>
                          <Badge variant="outline" className="capitalize text-xs">
                            {item.tipo}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => eliminarDelCarrito(item.referencia_id)}
                          className="text-red-600 hover:text-red-700"
                          disabled={!!ventaId}
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
                            onChange={(e) => actualizarCantidad(item.referencia_id, parseInt(e.target.value) || 1)}
                            min="1"
                            className="mt-1"
                            disabled={!!ventaId}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Precio Unit.</Label>
                          <p className="font-semibold text-slate-900 mt-2">
                            ₡{item.precio_unitario.toLocaleString()}
                          </p>
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

        {/* Panel Derecho - Resumen */}
        <div className="space-y-6">
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-lg font-semibold">Detalles de Venta</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {!ventaId && (
                <div className="space-y-2">
                  <Label>Origen de Venta</Label>
                  <Select value={origenVenta} onValueChange={setOrigenVenta}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tienda">Tienda</SelectItem>
                      <SelectItem value="taller">Taller</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Cliente {!ventaId && '(opcional)'}</Label>
                <Select 
                  value={clienteSeleccionado} 
                  onValueChange={setClienteSeleccionado}
                  disabled={!!ventaId}
                >
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
                <Label>Método de Pago</Label>
                <Select value={metodoPago} onValueChange={setMetodoPago}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="tarjeta">Tarjeta</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
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

              <Button
                onClick={procesarVenta}
                disabled={carrito.length === 0 || createVentaMutation.isPending}
                className="w-full bg-gradient-to-r from-emerald-500 to-blue-500 hover:shadow-lg transition-all h-14 text-lg"
              >
                <DollarSign className="w-5 h-5 mr-2" />
                {createVentaMutation.isPending ? 'Procesando...' : ventaId ? 'Confirmar Cobro' : 'Procesar Venta'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <CrearProductoRapido
        open={showCrearRapido}
        onClose={() => {
          setShowCrearRapido(false);
          setCodigoNoEncontrado('');
        }}
        codigoBarras={codigoNoEncontrado}
        onProductoCreado={(producto) => {
          agregarAlCarrito(producto, 'producto');
          setCodigoNoEncontrado('');
        }}
      />

      <Dialog open={!!ventaCompletada} onOpenChange={() => setVentaCompletada(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Comprobante de Venta</DialogTitle>
          </DialogHeader>
          <TiqueteVenta 
            venta={ventaCompletada} 
            onClose={() => setVentaCompletada(null)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}