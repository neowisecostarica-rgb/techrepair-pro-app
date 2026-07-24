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
import { useUserAccount } from '@/components/hooks/useOrgData';
import { useLocation, useSearchParams } from 'react-router-dom';
import PageGuard from '../components/guards/PageGuard';
import CrearProductoRapido from '../components/inventario/CrearProductoRapido';
import TiqueteVenta from '../components/ventas/TiqueteVenta';
import PanelContextoVenta from '../components/ventas/PanelContextoVenta';
import EnviarWhatsApp from '../components/ventas/EnviarWhatsApp';
import { useAuthContext } from '../components/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { validarVentaPOS, habilitarDiagnosticoTrasPago } from '@/components/pos/validacionesPOS';
import { transicionarEstadoOT } from '@/components/ot/transicionarEstadoOT';
import ClienteSearchInput from '@/components/ot/ClienteSearchInput';
import QuickCreateClienteModal from '@/components/ot/QuickCreateClienteModal';

export default function PuntoVenta() {
  return (
    <PageGuard allowedRoles={['SALES', 'ORG_ADMIN', 'BRANCH_ADMIN']}>
      <PuntoVentaContent />
    </PageGuard>
  );
}

function PuntoVentaContent() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const preloadedVenta = location.state?.venta;
  const cotizacionOrigen = location.state?.cotizacion_origen;
  const carritoPreload = location.state?.carrito;

  // Parámetros de navegación OT → Cobrar Diagnóstico (vía query params de URL)
  const otIdFromUrl = searchParams.get('ot_id') || '';
  const conceptoFromUrl = searchParams.get('concepto') || '';
  const otIdInicial = location.state?.orden_trabajo_id || otIdFromUrl || '';
  const tipoConceptoInicial = location.state?.tipo_concepto || conceptoFromUrl || 'venta_producto';
  const origenVentaInicial = location.state?.origen_venta || (otIdFromUrl ? 'taller' : 'tienda');

  const [carrito, setCarrito] = useState(carritoPreload || []);
  const [searchTerm, setSearchTerm] = useState('');
  const [clienteSeleccionado, setClienteSeleccionado] = useState(location.state?.cliente_id || '');
  const [origenVenta, setOrigenVenta] = useState(origenVentaInicial);
  const [metodoPago, setMetodoPago] = useState('efectivo');
  const [ventaId, setVentaId] = useState(null);
  const [showCrearRapido, setShowCrearRapido] = useState(false);
  const [showCrearCliente, setShowCrearCliente] = useState(false);
  const [codigoNoEncontrado, setCodigoNoEncontrado] = useState('');
  const [ventaCompletada, setVentaCompletada] = useState(null);
  const [tipoConcepto, setTipoConcepto] = useState(tipoConceptoInicial);
  const [otSeleccionada, setOtSeleccionada] = useState(otIdInicial);
  const [validacionesPendientes, setValidacionesPendientes] = useState([]);
  const [ordenTrabajoObj, setOrdenTrabajoObj] = useState(null);
  const [showConfirmacionVenta, setShowConfirmacionVenta] = useState(false);
  // Idempotency key: generada una vez por sesión de compra, se resetea tras venta exitosa
  const [idempotencyKey] = useState(() => `ik_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

  const queryClient = useQueryClient();
  const { user, userAccount } = useUserAccount();
  const { effectiveRole, effectiveOrgId } = useAuthContext();

  // Verificar/crear producto diagnóstico al montar
  useEffect(() => {
    if (effectiveOrgId) {
      import('@/components/inventario/setupProductoDiagnostico').then(module => {
        module.verificarOCrearProductoDiagnostico(effectiveOrgId).then(() => {
          queryClient.invalidateQueries({ queryKey: ['inventario', userAccount?.organization_id] });
        });
      });
    }
  }, [effectiveOrgId, queryClient, userAccount?.organization_id]);

  // Precargar venta si viene de taller o cotización
  useEffect(() => {
    if (preloadedVenta) {
      setVentaId(preloadedVenta.id);
      setOrigenVenta(preloadedVenta.origen_venta);
      setClienteSeleccionado(preloadedVenta.cliente_id);
      
      // Si viene de cotización, detectar timeout
      if (cotizacionOrigen && preloadedVenta.estado === 'borrador') {
        const createdDate = new Date(preloadedVenta.created_date);
        const ahora = new Date();
        const horasTranscurridas = (ahora - createdDate) / (1000 * 60 * 60);
        
        if (horasTranscurridas > 2) {
          const confirmar = window.confirm(
            '⚠️ Esta venta borrador tiene más de 2 horas de antigüedad.\n\n' +
            '¿Deseas continuar con esta conversión o cancelarla?'
          );
          
          if (!confirmar) {
            // Revertir cotización y eliminar venta
            (async () => {
              try {
                await base44.entities.Cotizacion.update(cotizacionOrigen.id, {
                  estado_conversion: 'SIN_CONVERTIR',
                  venta_id: null
                });
                await base44.entities.Venta.delete({ id: preloadedVenta.id });
                alert('Conversión cancelada. Redirigiendo...');
                window.history.back();
              } catch (error) {
                console.error('Error al cancelar conversión:', error);
              }
            })();
            return;
          }
        }
      }
      
      // Cargar items de la venta
      if (preloadedVenta.items) {
        setCarrito(preloadedVenta.items);
      }
    }
  }, [preloadedVenta, cotizacionOrigen]);

  const { data: inventario = [] } = useQuery({
    queryKey: ['inventario', userAccount?.organization_id],
    queryFn: () => base44.entities.Inventario.filter({
      organization_id: userAccount.organization_id
    }),
    enabled: !!userAccount?.organization_id,
  });

  // Entrada desde "Cobrar diagnóstico": precargar el servicio estándar para
  // que el administrador llegue a un cobro listo, no a un carrito vacío.
  useEffect(() => {
    if (tipoConcepto !== 'revision_diagnostico' || carrito.length > 0) return;
    const servicioDiagnostico = inventario.find(item =>
      item.tipo_item === 'servicio_diagnostico' || item.sku === 'SERV-DIAG-001'
    );
    if (!servicioDiagnostico) return;

    const precio = servicioDiagnostico.precio_venta ?? servicioDiagnostico.precio ?? 0;
    setCarrito([{
      tipo: 'producto',
      referencia_id: servicioDiagnostico.id,
      descripcion: servicioDiagnostico.nombre,
      cantidad: 1,
      precio_unitario: precio,
      subtotal: precio,
    }]);
  }, [tipoConcepto, inventario, carrito.length]);



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

  const { data: equipos = [] } = useQuery({
    queryKey: ['equipos-venta', userAccount?.organization_id],
    queryFn: () => base44.entities.Equipo.filter({
      organization_id: userAccount.organization_id
    }),
    enabled: !!userAccount?.organization_id,
  });

  const { data: diagnosticos = [] } = useQuery({
    queryKey: ['diagnosticos-venta', effectiveOrgId],
    queryFn: () => base44.entities.DiagnosticoTecnico.filter({
      organization_id: effectiveOrgId
    }),
    enabled: !!effectiveOrgId,
  });

  const { data: cotizaciones = [] } = useQuery({
    queryKey: ['cotizaciones-venta', effectiveOrgId],
    queryFn: () => base44.entities.Cotizacion.filter({
      organization_id: effectiveOrgId
    }),
    enabled: !!effectiveOrgId,
  });

  const { data: garantias = [] } = useQuery({
    queryKey: ['garantias-venta', effectiveOrgId],
    queryFn: () => base44.entities.Garantia.filter({
      organization_id: effectiveOrgId
    }),
    enabled: !!effectiveOrgId,
  });

  const { data: organizations = [] } = useQuery({
    queryKey: ['organizations-venta'],
    queryFn: () => base44.entities.Organization.list(),
  });

  // Validar contexto OT cuando se selecciona (o se precarga vía URL).
  // Incluye `ordenesTrabajo` en las dependencias para evitar la condición de carrera
  // donde el efecto se ejecuta antes de que el listado de OTs haya cargado.
  useEffect(() => {
    if (otSeleccionada && effectiveOrgId) {
      validarContextoOT();
    } else {
      setValidacionesPendientes([]);
      setOrdenTrabajoObj(null);
    }
  }, [otSeleccionada, effectiveOrgId, ordenesTrabajo]);

  const validarContextoOT = async () => {
    const validaciones = [];
    
    try {
      // Esperar a que el listado de OTs esté cargado antes de validar.
      // Si aún no carga, salir sin mutar estado; el efecto se re-ejecutará al cargar.
      const ot = ordenesTrabajo.find(o => o.id === otSeleccionada);
      if (!ot) return;

      setOrdenTrabajoObj(ot);

      // Precargar cliente automáticamente si no estaba seleccionado (flujo OT → POS)
      if (ot.cliente_id && !clienteSeleccionado) {
        setClienteSeleccionado(ot.cliente_id);
      }

      // Validar OT no cancelada
      if (ot.estado === 'CANCELADA') {
        validaciones.push('❌ La orden de trabajo está CANCELADA');
      }

      // Validar OT no entregada
      if (ot.estado === 'ENTREGADA') {
        validaciones.push('❌ La orden de trabajo ya fue ENTREGADA');
      }

      // Validación de duplicidad: si el diagnóstico ya fue cobrado, mostrar mensaje descriptivo
      if (tipoConcepto === 'revision_diagnostico' && ot.diagnostico_habilitado && ot.revision_venta_id) {
        validaciones.push('⚠️ Esta OT ya tiene un cobro de revisión/diagnóstico registrado. No es necesario volver a cobrarlo.');
      }

      // Validar cotización aprobada si es reparación
      if (tipoConcepto === 'reparacion') {
        const cots = await base44.entities.Cotizacion.filter({
          organization_id: effectiveOrgId,
          orden_trabajo_id: ot.id
        });

        const aprobada = cots.find(c => c.estado === 'aprobada');
        
        if (!aprobada) {
          validaciones.push('❌ Requiere cotización APROBADA para cobrar reparación');
        } else {
          // RIESGO-001: Validar total venta >= total cotización
          const totales = calcularTotales();
          if (totales.total < aprobada.total) {
            validaciones.push('❌ El total de venta debe ser igual o mayor al total aprobado en cotización');
          }
        }
      }

      setValidacionesPendientes(validaciones);
    } catch (error) {
      console.error('Error validando contexto OT:', error);
    }
  };

  const createVentaMutation = useMutation({
    mutationFn: async (ventaData) => {
      // Validaciones UX previas (frontend)
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

      // Invocar createSale — lógica crítica en backend
      const response = await base44.functions.invoke('createSale', {
        ventaData: {
          cliente_id: ventaData.cliente_id || null,
          origen_venta: ventaData.origen_venta,
          tipo_concepto: ventaData.tipo_concepto,
          referencia_ot_id: ventaData.referencia_ot_id || null,
          cotizacion_id: cotizacionOrigen?.id || null,
          metodo_pago: ventaData.metodo_pago,
          total: ventaData.total,
          subtotal: ventaData.subtotal,
          impuesto: ventaData.impuesto,
          descuento_total: ventaData.descuento_total || 0,
          branch_id: ventaData.branch_id,
        },
        itemsCarrito: carrito,
        cotizacionOrigenId: cotizacionOrigen?.id || null,
        ventaPreloadId: ventaId || null,
        idempotency_key: idempotencyKey,
      });

      if (!response?.data?.success) {
        throw new Error(response?.data?.error || 'Error al procesar la venta en el servidor');
      }

      const venta = response.data.data;

      // Lógica post-venta que queda en frontend por ahora (fuera del scope createSale v1)
      if (ventaData.tipo_concepto === 'revision_diagnostico' && ventaData.referencia_ot_id) {
        await habilitarDiagnosticoTrasPago(ventaData.referencia_ot_id, venta.id);
      }

      if (ventaData.tipo_concepto === 'reparacion' && ventaData.referencia_ot_id) {
        await transicionarEstadoOT(ventaData.referencia_ot_id, 'FINALIZADA', {
          userId: user?.id,
          userEmail: user?.email,
          organizationId: effectiveOrgId,
          motivo: 'Reparación cobrada y finalizada desde POS'
        });
        await base44.entities.OrdenTrabajo.update(ventaData.referencia_ot_id, {
          fecha_cierre: new Date().toISOString()
        });
      }

      return venta;
    },
    onSuccess: async (venta) => {
      // Emisión de garantía (fuera del scope createSale v1)
      await emitirGarantiaAutomatica(venta);

      queryClient.invalidateQueries({ queryKey: ['ventas'] });
      queryClient.invalidateQueries({ queryKey: ['inventario'] });
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] });
      queryClient.invalidateQueries({ queryKey: ['cotizaciones-ventas'] });
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      queryClient.invalidateQueries({ queryKey: ['mis-ordenes'] });
      queryClient.invalidateQueries({ queryKey: ['todas-ordenes'] });
      queryClient.invalidateQueries({ queryKey: ['expediente-ot'] });
      queryClient.invalidateQueries({ queryKey: ['expediente-ventas'] });

      setVentaCompletada(venta);
      setCarrito([]);
      setClienteSeleccionado('');
      setVentaId(null);
      setOtSeleccionada('');
      setOrdenTrabajoObj(null);
    },
    onError: (error) => {
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
        precio_unitario: item.precio_venta ?? item.precio ?? 0,
        subtotal: item.precio_venta ?? item.precio ?? 0,
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
    const subtotal = carrito.reduce((sum, item) => sum + (item.subtotal ?? 0), 0);
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

    // Mostrar confirmación explícita
    setShowConfirmacionVenta(true);
  };

  const confirmarYProcesarVenta = async () => {
    setShowConfirmacionVenta(false);

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
        <h1 className="text-4xl font-bold text-slate-900 mb-2">
          Punto de Venta - Caja Directa
        </h1>
        <p className="text-slate-600 mb-4">
          {cotizacionOrigen 
            ? `💼 Facturando cotización aprobada`
            : ventaId 
            ? '💳 Cobrar trabajo de taller' 
            : 'Registra ventas que impactan caja e inventario inmediatamente'
          }
        </p>
        {cotizacionOrigen && (
          <Alert className="bg-emerald-50 border-emerald-200">
            <AlertCircle className="w-4 h-4 text-emerald-600" />
            <AlertDescription className="text-emerald-800">
              📋 <strong>Conversión desde Cotización</strong> - Los datos están precargados. Puedes modificar ítems, cantidades o precios antes de facturar.
              <br />
              <span className="text-xs text-emerald-600 mt-1 block">
               Total Original: ₡{(preloadedVenta?.cotizacion_total_original || 0).toLocaleString()} | Actual: ₡{(calcularTotales().total || 0).toLocaleString()}
              </span>
            </AlertDescription>
          </Alert>
        )}
        {!ventaId && !cotizacionOrigen && (
          <Alert className="bg-blue-50 border-blue-200">
            <AlertCircle className="w-4 h-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              💡 <strong>¿Necesitas cotizar primero?</strong> Usa el módulo "Cotizaciones" en el menú lateral para crear propuestas sin impactar inventario.
            </AlertDescription>
          </Alert>
        )}
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
                              ₡{((item.precio_venta ?? item.precio) || 0).toLocaleString()}
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
                            ₡{(item.precio_unitario || 0).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <Label className="text-xs">Subtotal</Label>
                          <p className="font-bold text-emerald-600 mt-2">
                            ₡{(item.subtotal ?? 0).toLocaleString()}
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
                <ClienteSearchInput
                  clientes={clientes}
                  selectedClienteId={clienteSeleccionado}
                  onSelectCliente={(value) => {
                    setClienteSeleccionado(value);
                    // Limpiar OT al cambiar cliente
                    setOtSeleccionada('');
                  }}
                  onRequestCreate={() => setShowCrearCliente(true)}
                  disabled={!!ventaId}
                />
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
                <span className="font-semibold">₡{(totales.subtotal || 0).toLocaleString()}</span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-slate-600">IVA (13%):</span>
                <span className="font-semibold">₡{(totales.impuesto || 0).toLocaleString()}</span>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold text-slate-900">Total:</span>
                  <span className="text-2xl font-bold text-emerald-600">
                    ₡{(totales.total || 0).toLocaleString()}
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
                {createVentaMutation.isPending ? 'Procesando...' : ventaId ? 'Confirmar Cobro' : 'Registrar Venta'}
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
          
          {ventaCompletada && (() => {
            // P0-001: Cargar datos relacionados para EnviarWhatsApp
            const equipo = ordenTrabajoObj ? equipos.find(e => e.id === ordenTrabajoObj.equipo_id) : null;
            const diagnostico = ordenTrabajoObj ? diagnosticos.find(d => d.orden_trabajo_id === ordenTrabajoObj.id) : null;
            const cotizacion = ordenTrabajoObj ? cotizaciones.find(c => c.orden_trabajo_id === ordenTrabajoObj.id && c.estado === 'aprobada') : null;
            
            // Buscar garantía (OT o Venta)
            const garantia = ventaCompletada.referencia_ot_id
              ? garantias.find(g => g.origen_tipo === 'OT' && g.origen_id === ventaCompletada.referencia_ot_id)
              : garantias.find(g => g.origen_tipo === 'VENTA' && g.origen_id === ventaCompletada.id);
            
            const organization = organizations.find(o => o.id === ventaCompletada.organization_id);

            return (
              <div className="space-y-6">
                <TiqueteVenta 
                  venta={ventaCompletada} 
                  onClose={() => setVentaCompletada(null)}
                />
                
                <div className="pt-4 border-t">
                  <EnviarWhatsApp
                    venta={ventaCompletada}
                    cliente={clientes.find(c => c.id === ventaCompletada.cliente_id)}
                    equipo={equipo}
                    ordenTrabajo={ordenTrabajoObj}
                    diagnostico={diagnostico}
                    cotizacion={cotizacion}
                    garantia={garantia}
                    organization={organization}
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
            );
          })()}
        </DialogContent>
      </Dialog>

      <QuickCreateClienteModal
        open={showCrearCliente}
        onOpenChange={setShowCrearCliente}
        onCreated={(cliente) => {
          setClienteSeleccionado(cliente.id);
          queryClient.invalidateQueries({ queryKey: ['clientes', userAccount?.organization_id] });
        }}
      />

      {/* Modal de Confirmación de Venta */}
      <Dialog open={showConfirmacionVenta} onOpenChange={setShowConfirmacionVenta}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertCircle className="w-6 h-6" />
              ⚠️ Confirmar Venta
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-slate-700">
              Estás a punto de <strong>REGISTRAR UNA VENTA</strong> por un total de:
            </p>
            <p className="text-4xl font-bold text-emerald-600 text-center py-4">
              ₡{(totales.total || 0).toLocaleString()}
            </p>
            <Alert className="bg-amber-50 border-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                <strong>Esta acción:</strong>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Impactará la caja y reportes financieros</li>
                  <li>Descontará inventario de stock</li>
                  <li>Generará comprobante fiscal</li>
                  <li><strong>NO puede deshacerse</strong></li>
                </ul>
              </AlertDescription>
            </Alert>
            <p className="text-sm text-slate-600 text-center">
              ¿Deseas continuar con la venta?
            </p>
          </div>
          <div className="flex gap-3 justify-end pt-4">
            <Button 
              variant="outline" 
              onClick={() => setShowConfirmacionVenta(false)}
            >
              Cancelar
            </Button>
            <Button 
              onClick={confirmarYProcesarVenta}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Sí, Procesar Venta
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
