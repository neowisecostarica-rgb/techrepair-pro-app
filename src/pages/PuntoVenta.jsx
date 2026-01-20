import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ShoppingCart, Plus, Trash2, Search, DollarSign, Package, Wrench, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useUserAccount, withOrgId } from '@/components/hooks/useOrgData';
import { useLocation } from 'react-router-dom';
import PageGuard from '../components/guards/PageGuard';
import CrearProductoRapido from '../components/inventario/CrearProductoRapido';
import TiqueteVenta from '../components/ventas/TiqueteVenta';
import PanelContextoVenta from '../components/ventas/PanelContextoVenta';
import EnviarWhatsApp from '../components/ventas/EnviarWhatsApp';
import { useAuthContext } from '../components/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { validarVentaPOS, habilitarDiagnosticoTrasPago } from '@/components/pos/validacionesPOS';

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
  const [tipoConcepto, setTipoConcepto] = useState('venta_producto');
  const [otSeleccionada, setOtSeleccionada] = useState('');
  const [validacionesPendientes, setValidacionesPendientes] = useState([]);
  const [ordenTrabajoObj, setOrdenTrabajoObj] = useState(null);
  const queryClient = useQueryClient();
  const { user, userAccount } = useUserAccount();
  const { effectiveRole, effectiveOrgId } = useAuthContext();

  // Verificar/crear producto diagnóstico al montar
  useEffect(() => {
    if (effectiveOrgId) {
      import('@/components/inventario/setupProductoDiagnostico').then(module => {
        module.verificarOCrearProductoDiagnostico(effectiveOrgId);
      });
    }
  }, [effectiveOrgId]);

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

  const { data: ordenesTrabajo = [] } = useQuery({
    queryKey: ['ordenes-trabajo', userAccount?.organization_id],
    queryFn: () => base44.entities.OrdenTrabajo.filter({
      organization_id: userAccount.organization_id
    }),
    enabled: !!userAccount?.organization_id,
  });

  // Validar contexto OT cuando se selecciona
  useEffect(() => {
    if (otSeleccionada && effectiveOrgId) {
      validarContextoOT();
    } else {
      setValidacionesPendientes([]);
      setOrdenTrabajoObj(null);
    }
  }, [otSeleccionada, effectiveOrgId]);

  const validarContextoOT = async () => {
    const validaciones = [];
    
    try {
      const ot = ordenesTrabajo.find(o => o.id === otSeleccionada);
      if (!ot) return;

      setOrdenTrabajoObj(ot);

      // Validar OT no cancelada
      if (ot.estado === 'CANCELADA') {
        validaciones.push('❌ La orden de trabajo está CANCELADA');
      }

      // Validar OT no entregada
      if (ot.estado === 'ENTREGADA') {
        validaciones.push('❌ La orden de trabajo ya fue ENTREGADA');
      }

      // Validar cotización aprobada si es reparación
      if (tipoConcepto === 'reparacion') {
        const cotizaciones = await base44.entities.Cotizacion.filter({
          organization_id: effectiveOrgId,
          orden_trabajo_id: ot.id
        });

        const aprobada = cotizaciones.find(c => c.estado === 'aprobada');
        
        if (!aprobada) {
          validaciones.push('❌ Requiere cotización APROBADA para cobrar reparación');
        }
      }

      setValidacionesPendientes(validaciones);
    } catch (error) {
      console.error('Error validando contexto OT:', error);
    }
  };

  const createVentaMutation = useMutation({
    mutationFn: async (ventaData) => {
      // P0: Validar campos requeridos mínimos
      if (!ventaData.total || ventaData.total <= 0) {
        throw new Error('El total de la venta debe ser mayor a cero');
      }
      if (!ventaData.metodo_pago) {
        throw new Error('Debe seleccionar un método de pago');
      }
      if (!ventaData.organization_id || !ventaData.branch_id || !ventaData.created_by_user_id) {
        throw new Error('Tu sesión ha expirado o hay un problema con tu cuenta. Cierra sesión y vuelve a iniciar.');
      }

      // VALIDACIONES CANÓNICAS POS
      const validacion = await validarVentaPOS({
        clienteId: ventaData.cliente_id,
        otId: ventaData.referencia_ot_id,
        tipoConcepto: ventaData.tipo_concepto,
        organizationId: effectiveOrgId
      });

      if (!validacion.valido) {
        throw new Error(validacion.mensaje);
      }

      // Generar public_access_token único
      const publicToken = `vta_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Si ya existe venta (cobro de taller), solo actualizar
      if (ventaId) {
        return await base44.entities.Venta.update(ventaId, {
          estado: 'pagada',
          metodo_pago: ventaData.metodo_pago,
          public_access_token: publicToken
        });
      }
      
      // Crear nueva venta con token
      const venta = await base44.entities.Venta.create({
        ...ventaData,
        public_access_token: publicToken
      });

      // HABILITAR DIAGNÓSTICO si es revisión pagada
      if (ventaData.tipo_concepto === 'revision_diagnostico' && ventaData.referencia_ot_id) {
        await habilitarDiagnosticoTrasPago(ventaData.referencia_ot_id, venta.id);
      }

      // Si es reparación, cambiar estado OT a FINALIZADA
      if (ventaData.tipo_concepto === 'reparacion' && ventaData.referencia_ot_id) {
        await base44.entities.OrdenTrabajo.update(ventaData.referencia_ot_id, {
          estado: 'FINALIZADA',
          fecha_cierre: new Date().toISOString()
        });
      }

      return venta;
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

        // P0: Decrementar stock SOLO para productos físicos
        for (const item of carrito) {
          if (item.tipo === 'producto') {
            const producto = inventario.find(p => p.id === item.referencia_id);
            if (producto) {
              const categorias = await base44.entities.CategoriaInventario.filter({ id: producto.categoria_id });
              const categoria = categorias[0];
              
              // Solo decrementar si permite_stock = true
              if (categoria?.permite_stock !== false) {
                await base44.entities.Inventario.update(producto.id, {
                  cantidad_disponible: producto.cantidad_disponible - item.cantidad,
                  fecha_ultimo_movimiento: new Date().toISOString().split('T')[0]
                });
              }
            }
          }
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
      setOtSeleccionada('');
      setOrdenTrabajoObj(null);
    },
    onError: (error) => {
      // P0: Mostrar error claro al usuario
      alert(`No se pudo completar la venta: ${error.message || 'Error desconocido'}`);
    }
  });

  const emitirGarantiaAutomatica = async (venta) => {
    try {
      if (!venta.cliente_id) return;

      const orgs = await base44.entities.Organization.list();
      const org = orgs.find(o => o.id === venta.organization_id);
      const config = org?.garantia_config;

      if (!config) return;

      const esReparacion = venta.tipo_concepto === 'reparacion';
      const textoGarantia = esReparacion ? config.texto_reparaciones : config.texto_ventas;
      const mesesVigencia = esReparacion ? config.meses_vigencia_reparaciones : config.meses_vigencia_ventas;

      if (!textoGarantia || !mesesVigencia) return;

      // Verificar si ya existe garantía
      const garantiasExistentes = await base44.entities.Garantia.filter({
        organization_id: venta.organization_id,
        origen_tipo: esReparacion ? 'OT' : 'VENTA',
        origen_id: esReparacion ? venta.referencia_ot_id : venta.id
      });

      if (garantiasExistentes.length > 0) return;

      const token = `gar_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const fechaEmision = new Date();
      const fechaInicio = new Date();
      const fechaFin = new Date();
      fechaFin.setMonth(fechaFin.getMonth() + mesesVigencia);

      await base44.entities.Garantia.create({
        organization_id: venta.organization_id,
        cliente_id: venta.cliente_id,
        origen_tipo: esReparacion ? 'OT' : 'VENTA',
        origen_id: esReparacion ? venta.referencia_ot_id : venta.id,
        public_access_token: token,
        fecha_emision: fechaEmision.toISOString().split('T')[0],
        fecha_inicio: fechaInicio.toISOString().split('T')[0],
        fecha_fin: fechaFin.toISOString().split('T')[0],
        estado: 'ACTIVA',
        texto_snapshot: textoGarantia,
        creado_por: user?.id
      });
    } catch (error) {
      console.error('Error emitiendo garantía:', error);
    }
  };

  const agregarAlCarrito = async (item, tipo) => {
    // P0: Validar stock SOLO para productos físicos (no servicios)
    if (tipo === 'producto') {
      // Cargar categoría para verificar si permite stock
      const categorias = await base44.entities.CategoriaInventario.filter({ id: item.categoria_id });
      const categoria = categorias[0];
      
      // Solo validar stock si permite_stock = true
      if (categoria?.permite_stock !== false) {
        const yaExiste = carrito.find(c => c.referencia_id === item.id);
        const cantidadActualCarrito = yaExiste ? yaExiste.cantidad : 0;
        const nuevaCantidad = cantidadActualCarrito + 1;

        if (nuevaCantidad > item.cantidad_disponible) {
          alert(`Stock insuficiente para ${item.nombre}. Disponible: ${item.cantidad_disponible}`);
          return;
        }
      }
    }

    // INFERENCIA AUTOMÁTICA DE TIPO DE CONCEPTO
    if (tipo === 'producto' && item.tipo_item === 'servicio_diagnostico') {
      setTipoConcepto('revision_diagnostico');
    }

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

  const actualizarCantidad = async (referenciaId, cantidad) => {
    // P0: Validar stock SOLO para productos físicos (no servicios)
    const itemCarrito = carrito.find(c => c.referencia_id === referenciaId);
    if (itemCarrito?.tipo === 'producto') {
      const producto = inventario.find(p => p.id === referenciaId);
      if (producto) {
        // Cargar categoría para verificar si permite stock
        const categorias = await base44.entities.CategoriaInventario.filter({ id: producto.categoria_id });
        const categoria = categorias[0];
        
        // Solo validar stock si permite_stock = true
        if (categoria?.permite_stock !== false && cantidad > producto.cantidad_disponible) {
          alert(`Stock insuficiente para ${producto.nombre}. Disponible: ${producto.cantidad_disponible}`);
          return;
        }
      }
    }

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

  const procesarVenta = async () => {
    if (carrito.length === 0) {
      alert('El carrito está vacío');
      return;
    }

    // Validaciones P0
    if (validacionesPendientes.length > 0) {
      alert('No se puede procesar la venta:\n\n' + validacionesPendientes.join('\n'));
      return;
    }

    // P0.2: Resolver branch_id automáticamente si falta y hay una sola sucursal
    let branchIdFinal = userAccount?.branch_id;

    if (!branchIdFinal && effectiveOrgId) {
      try {
        const branches = await base44.entities.Branch.filter({
          organization_id: effectiveOrgId
        });

        if (branches.length === 1) {
          branchIdFinal = branches[0].id;
        } else if (branches.length > 1) {
          alert('Tu cuenta no tiene una sucursal asignada. Por favor, contacta a tu administrador para que te asigne una sucursal específica.');
          return;
        }
      } catch (error) {
        console.error('Error consultando sucursales:', error);
      }
    }

    // P0: Validar campos requeridos
    if (!effectiveOrgId || !branchIdFinal || !user?.id) {
      alert('Tu sesión ha expirado o hay un problema con tu contexto de organización. Por favor, cierra sesión y vuelve a iniciar para continuar.');
      return;
    }

    // Validación previa de Cliente ↔ OT si aplica
    if (otSeleccionada) {
      const validacionPrevia = await validarVentaPOS({
        clienteId: clienteSeleccionado,
        otId: otSeleccionada,
        tipoConcepto: tipoConcepto,
        organizationId: effectiveOrgId
      });

      if (!validacionPrevia.valido) {
        alert(validacionPrevia.mensaje);
        return;
      }
    }

    // P0: Validar stock disponible para productos físicos antes de procesar
    for (const item of carrito) {
      if (item.tipo === 'producto') {
        const producto = inventario.find(p => p.id === item.referencia_id);
        if (producto) {
          const categorias = await base44.entities.CategoriaInventario.filter({ id: producto.categoria_id });
          const categoria = categorias[0];
          
          // Solo validar stock si permite_stock = true
          if (categoria?.permite_stock !== false && item.cantidad > producto.cantidad_disponible) {
            alert(`Stock insuficiente para ${producto.nombre}. Disponible: ${producto.cantidad_disponible}, Solicitado: ${item.cantidad}`);
            return;
          }
        }
      }
    }

    const totales = calcularTotales();

    const ventaData = {
      organization_id: effectiveOrgId,
      branch_id: branchIdFinal,
      cliente_id: clienteSeleccionado || null,
      origen_venta: origenVenta,
      tipo_concepto: tipoConcepto,
      referencia_ot_id: otSeleccionada || null,
      total: totales.total,
      subtotal: totales.subtotal,
      impuesto: totales.impuesto,
      metodo_pago: metodoPago,
      estado: 'pagada',
      created_by_user_id: user?.id,
    };

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

      {/* Panel de Contexto OT */}
      {ordenTrabajoObj && (
        <PanelContextoVenta 
          ordenTrabajo={ordenTrabajoObj} 
          effectiveOrgId={effectiveOrgId}
        />
      )}

      {/* Validaciones Pendientes */}
      {validacionesPendientes.length > 0 && (
        <Alert className="bg-red-50 border-red-200">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <AlertDescription className="text-red-800">
            <div className="font-semibold mb-2">No se puede procesar la venta:</div>
            <ul className="list-disc list-inside space-y-1">
              {validacionesPendientes.map((val, idx) => (
                <li key={idx}>{val}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

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
                <Label>Tipo de Concepto *</Label>
                <Select value={tipoConcepto} onValueChange={setTipoConcepto}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="revision_diagnostico">Revisión / Diagnóstico</SelectItem>
                    <SelectItem value="reparacion">Reparación</SelectItem>
                    <SelectItem value="venta_producto">Venta de Producto</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
                {tipoConcepto === 'revision_diagnostico' && (
                  <p className="text-xs text-blue-600 mt-1">
                    ⚡ Este pago habilitará el diagnóstico técnico
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  💡 Se infiere automáticamente al agregar items de diagnóstico al carrito
                </p>
              </div>

              <div className="space-y-2">
                <Label>Cliente {!ventaId && '(opcional)'}</Label>
                <Select 
                  value={clienteSeleccionado} 
                  onValueChange={(value) => {
                    setClienteSeleccionado(value);
                    // Limpiar OT al cambiar cliente
                    setOtSeleccionada('');
                  }}
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
                <Label>Orden de Trabajo (Opcional)</Label>
                <Select 
                  value={otSeleccionada} 
                  onValueChange={setOtSeleccionada}
                  disabled={!clienteSeleccionado}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={clienteSeleccionado ? "Selecciona OT del cliente" : "Primero selecciona un cliente"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Sin OT</SelectItem>
                    {ordenesTrabajo
                      .filter(ot => {
                        // Filtrar por cliente si está seleccionado
                        if (clienteSeleccionado && ot.cliente_id !== clienteSeleccionado) return false;
                        // Excluir OTs finalizadas
                        if (['ENTREGADA', 'CANCELADA'].includes(ot.estado)) return false;
                        return true;
                      })
                      .map(ot => (
                        <SelectItem key={ot.id} value={ot.id}>
                          {ot.codigo_ot} - {ot.motivo_ingreso}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {clienteSeleccionado && (
                  <p className="text-xs text-slate-500">
                    Mostrando solo OTs activas del cliente seleccionado
                  </p>
                )}
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
                disabled={
                  carrito.length === 0 || 
                  createVentaMutation.isPending || 
                  validacionesPendientes.length > 0
                }
                className="w-full bg-gradient-to-r from-emerald-500 to-blue-500 hover:shadow-lg transition-all h-14 text-lg disabled:opacity-50"
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
          
          {ventaCompletada && (
            <div className="space-y-6">
              <TiqueteVenta 
                venta={ventaCompletada} 
                onClose={() => setVentaCompletada(null)}
              />
              
              <div className="pt-4 border-t">
                <EnviarWhatsApp
                  venta={ventaCompletada}
                  cliente={clientes.find(c => c.id === ventaCompletada.cliente_id)}
                  equipo={null}
                  ordenTrabajo={ordenTrabajoObj}
                  diagnostico={null}
                  cotizacion={null}
                  garantia={null}
                  organization={null}
                  onSent={async () => {
                    try {
                      await base44.entities.ComprobanteVentaLog.create({
                        organization_id: effectiveOrgId,
                        venta_id: ventaCompletada.id,
                        accion: 'envio_original',
                        canal: 'whatsapp',
                        formato: 'normal',
                        user_id: user?.id,
                        user_email: user?.email,
                        destinatario: clientes.find(c => c.id === ventaCompletada.cliente_id)?.telefono
                      });
                    } catch (e) {
                      console.warn('Error logging WhatsApp:', e);
                    }
                  }}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}