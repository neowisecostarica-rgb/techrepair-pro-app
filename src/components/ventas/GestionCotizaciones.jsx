import React, { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, FileText, AlertCircle, Search, Trash2, Package } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const DESCUENTO_MAXIMO_SIN_APROBACION = 20;
import jsPDF from 'jspdf';
import { format } from 'date-fns';
import FormularioCotizacion from '@/components/cotizacion/FormularioCotizacion';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { transicionarEstadoOT } from '@/components/ot/transicionarEstadoOT';

export default function GestionCotizaciones({ clienteId, ordenTrabajoId, user, userAccount, clientes = [], openDirectly = false }) {
  const [showModal, setShowModal] = useState(openDirectly);
  const [editingCotizacion, setEditingCotizacion] = useState(null);
  const [items, setItems] = useState([{ tipo: 'servicio', descripcion: '', cantidad: 1, precio_unitario: 0, descuento_porcentaje: 0, subtotal: 0 }]);
  const [busquedaProductos, setBusquedaProductos] = useState({});
  const [productoSeleccionado, setProductoSeleccionado] = useState({});
  const [clienteSeleccionadoInterno, setClienteSeleccionadoInterno] = useState('');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const clienteActual = clienteId;

  const { data: cotizaciones = [] } = useQuery({
    queryKey: ['cotizaciones', clienteActual],
    queryFn: () => base44.entities.Cotizacion.filter({ cliente_id: clienteActual }),
    enabled: !!clienteActual,
  });

  const { data: inventario = [] } = useQuery({
    queryKey: ['inventario-disponible'],
    queryFn: () => base44.entities.Inventario.filter({ estado: 'activo' }),
  });

  const { data: servicios = [] } = useQuery({
    queryKey: ['servicios-disponibles'],
    queryFn: () => base44.entities.Servicio.filter({ activo: true }),
  });

  const handleGuardar = (nuevaCotizacion) => {
    setShowModal(false);
    queryClient.invalidateQueries({ queryKey: ['cotizaciones'] });
    queryClient.invalidateQueries({ queryKey: ['cotizaciones-ventas'] });
    if (openDirectly && nuevaCotizacion) {
      window.dispatchEvent(new CustomEvent('cotizacion-creada', { detail: nuevaCotizacion }));
    }
  };

  const withOrgId = (data) => ({ ...data, organization_id: userAccount?.organization_id });

  const createCotizacionMutation = useMutation({
    mutationFn: (data) => base44.entities.Cotizacion.create(withOrgId(data)),
    onSuccess: (nuevaCotizacion) => {
      handleGuardar(nuevaCotizacion);
    },
  });

  const updateCotizacionMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Cotizacion.update(id, data),
    onSuccess: () => {
      handleGuardar(null);
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] });
    },
  });

  const enviarSeguimientoMutation = useMutation({
    mutationFn: async ({ cotizacion, cliente }) => {
      const canal = cliente.telefono ? 'whatsapp' : 'email';
      const mensaje = `Hola ${cliente.nombre_completo}, te escribo para dar seguimiento a la cotización que te compartimos. Quedo atento(a) si tienes alguna duda. — ${user.full_name || 'El equipo'}`;
      
      return await base44.entities.MensajeCliente.create(withOrgId({
        cliente_id: clienteActual,
        orden_trabajo_id: ordenTrabajoId || null,
        remitente_id: user.id,
        remitente_nombre: user.full_name || user.email,
        tipo: 'seguimiento',
        plantilla_usada: 'Seguimiento de Cotización',
        asunto: 'Seguimiento de tu cotización',
        contenido: mensaje,
        canal: canal,
        enviado: true,
        enviado_at: new Date().toISOString(),
      }, userAccount));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mensajes-cliente'] });
      alert('Seguimiento enviado correctamente');
    },
  });

  const { data: cliente } = useQuery({
    queryKey: ['cliente', clienteActual],
    queryFn: () => base44.entities.Cliente.filter({ id: clienteActual }).then(res => res[0]),
    enabled: !!clienteActual,
  });

  const { data: organization } = useQuery({
    queryKey: ['organization', userAccount?.organization_id],
    queryFn: async () => {
      const orgs = await base44.entities.Organization.list();
      return orgs.find(o => o.id === userAccount.organization_id);
    },
    enabled: !!userAccount?.organization_id,
  });

  const resetForm = () => {
    setItems([{ tipo: 'servicio', descripcion: '', cantidad: 1, precio_unitario: 0, descuento_porcentaje: 0, subtotal: 0 }]);
    setEditingCotizacion(null);
    setBusquedaProductos({});
    setProductoSeleccionado({});
  };

  const buscarProducto = (texto, index) => {
    setBusquedaProductos(prev => ({ ...prev, [index]: texto }));
  };

  const seleccionarItem = (item, index) => {
    const newItems = [...items];
    newItems[index].descripcion = item.nombre;
    newItems[index].precio_unitario = item.precio_venta || 0;
    newItems[index].tipo = item.tipo_sugerido;
    newItems[index].item_id = item.id;
    newItems[index].origen = item.origen;
    
    // Recalcular subtotal
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
    
    // Buscar en inventario
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
    
    // Buscar en servicios
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
    const impuesto = subtotal * 0.13; // 13% IVA
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

    if (editingCotizacion) {
      updateCotizacionMutation.mutate({ id: editingCotizacion.id, data: cotizacionData });
    } else {
      createCotizacionMutation.mutate(cotizacionData);
    }
  };

  const generarToken = () => {
    return `cot_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  };

  const handleEnviar = async (cotizacion) => {
    if (!clienteActual) {
      alert('Por favor selecciona un cliente antes de enviar la cotización');
      return;
    }

    if (cotizacion.requiere_aprobacion && !cotizacion.aprobada_por) {
      alert('Esta cotización requiere aprobación por el descuento aplicado.');
      return;
    }

    const token = cotizacion.public_access_token || generarToken();
    
    try {
      if (ordenTrabajoId) {
        const ots = await base44.entities.OrdenTrabajo.filter({ id: ordenTrabajoId });
        if (ots[0]?.estado === 'DIAGNOSTICADA') {
          await transicionarEstadoOT(ordenTrabajoId, 'COTIZADA', {
            motivo: `Cotización ${cotizacion.id} enviada al cliente`,
          });
        }
      }
      await base44.entities.Cotizacion.update(cotizacion.id, {
        estado: 'enviada', 
        enviada_at: new Date().toISOString(),
        public_access_token: token
      });
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] });
      queryClient.invalidateQueries({ queryKey: ['cotizaciones-ventas'] });
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
    } catch (error) {
      alert(`No se pudo enviar la cotización: ${error.message}`);
    }
  };

  const copiarLink = (cotizacion, organization) => {
    if (!cotizacion.public_access_token) {
      alert('Primero debes enviar la cotización para generar el link');
      return;
    }

    const baseUrl = organization?.public_base_url || window.location.origin;
    const link = `${baseUrl}/PortalCotizacion?token=${cotizacion.public_access_token}`;
    navigator.clipboard.writeText(link);
    alert('Link copiado al portapapeles');
  };

  const descargarPDF = (cotizacion, cliente, organization) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    let y = 20;

    // Header
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('COTIZACIÓN COMERCIAL', pageWidth / 2, y, { align: 'center' });
    
    y += 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(200, 0, 0);
    doc.text('Este documento NO es una factura ni comprobante fiscal', pageWidth / 2, y, { align: 'center' });
    doc.setTextColor(0, 0, 0);

    y += 15;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`${organization?.name || 'Negocio'}`, 14, y);
    y += 6;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    if (organization?.telefono_negocio) {
      doc.text(`Tel: ${organization.telefono_negocio}`, 14, y);
      y += 6;
    }

    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Cliente:', 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(cliente?.nombre_completo || 'N/A', 40, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('Estado:', 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(estadoConfig[cotizacion.estado]?.label || cotizacion.estado, 40, y);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('Fecha:', 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(format(new Date(cotizacion.created_date), 'dd/MM/yyyy'), 40, y);
    
    if (cotizacion.valida_hasta) {
      y += 6;
      doc.setFont('helvetica', 'bold');
      doc.text('Válida hasta:', 14, y);
      doc.setFont('helvetica', 'normal');
      doc.text(format(new Date(cotizacion.valida_hasta), 'dd/MM/yyyy'), 40, y);
    }

    y += 15;
    doc.setFont('helvetica', 'bold');
    doc.text('ÍTEMS', 14, y);
    y += 8;

    // Items
    cotizacion.items?.forEach((item, idx) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.setFont('helvetica', 'normal');
      doc.text(`${idx + 1}. ${item.descripcion}`, 14, y);
      y += 5;
      doc.setFontSize(9);
      doc.text(`${item.cantidad} x ₡${item.precio_unitario?.toLocaleString()} ${item.descuento_porcentaje > 0 ? `(-${item.descuento_porcentaje}%)` : ''}`, 20, y);
      doc.text(`₡${item.subtotal?.toLocaleString()}`, pageWidth - 40, y, { align: 'right' });
      doc.setFontSize(10);
      y += 7;
    });

    y += 5;
    doc.line(14, y, pageWidth - 14, y);
    y += 7;

    // Totales
    doc.text('Subtotal:', 14, y);
    doc.text(`₡${cotizacion.subtotal?.toLocaleString()}`, pageWidth - 40, y, { align: 'right' });
    y += 6;
    if (cotizacion.descuento_total > 0) {
      doc.text('Descuento:', 14, y);
      doc.text(`-₡${cotizacion.descuento_total?.toLocaleString()}`, pageWidth - 40, y, { align: 'right' });
      y += 6;
    }
    doc.text('IVA (13%):', 14, y);
    doc.text(`₡${cotizacion.impuesto?.toLocaleString()}`, pageWidth - 40, y, { align: 'right' });
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('TOTAL:', 14, y);
    doc.text(`₡${cotizacion.total?.toLocaleString()}`, pageWidth - 40, y, { align: 'right' });

    if (cotizacion.notas) {
      y += 15;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Notas:', 14, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      const splitNotas = doc.splitTextToSize(cotizacion.notas, pageWidth - 28);
      doc.text(splitNotas, 14, y);
    }

    doc.save(`Cotizacion_${cotizacion.id}.pdf`);
  };

  const imprimirCotizacion = (cotizacion, organization) => {
    if (cotizacion.public_access_token) {
      const baseUrl = organization?.public_base_url || window.location.origin;
      const link = `${baseUrl}/PortalCotizacion?token=${cotizacion.public_access_token}`;
      window.open(link, '_blank');
    } else {
      alert('Primero debes enviar la cotización para poder imprimirla');
    }
  };

  const handleEditar = (cotizacion) => {
    if (cotizacion.estado !== 'borrador') {
      alert('Solo se pueden editar cotizaciones en estado borrador');
      return;
    }
    setEditingCotizacion(cotizacion);
    setItems(cotizacion.items);
    setShowModal(true);
  };

  const convertirEnFacturaMutation = useMutation({
    mutationFn: async (cotizacion) => {
      // Validación backend: verificar que no exista una venta activa con este cotizacion_id
      const ventasExistentes = await base44.entities.Venta.filter({
        organization_id: userAccount.organization_id,
        cotizacion_id: cotizacion.id
      });
      
      const ventaActiva = ventasExistentes.find(v => v.estado !== 'anulada');
      if (ventaActiva) {
        throw new Error('Ya existe una venta asociada a esta cotización. No se puede duplicar.');
      }

      // Crear Venta en estado BORRADOR con snapshots originales
      const venta = await base44.entities.Venta.create({
        organization_id: cotizacion.organization_id,
        branch_id: userAccount.branch_id,
        cliente_id: cotizacion.cliente_id,
        origen_venta: 'tienda',
        origen_detalle: 'DESDE_COTIZACION',
        tipo_concepto: 'otro',
        cotizacion_id: cotizacion.id,
        cotizacion_total_original: cotizacion.total,
        cotizacion_subtotal_original: cotizacion.subtotal,
        cotizacion_descuento_original: cotizacion.descuento_total || 0,
        total: cotizacion.total,
        subtotal: cotizacion.subtotal,
        impuesto: cotizacion.impuesto,
        descuento_total: cotizacion.descuento_total || 0,
        estado: 'borrador',
        created_by_user_id: user.id,
        notas: cotizacion.notas || ''
      });

      // Crear VentaItems desde cotización
      for (const item of cotizacion.items) {
        await base44.entities.VentaItem.create({
          organization_id: cotizacion.organization_id,
          venta_id: venta.id,
          tipo: item.tipo,
          referencia_id: item.referencia_id || null,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          subtotal: item.subtotal
        });
      }

      // Actualizar Cotización a EN_PROCESO_FACTURACION
      await base44.entities.Cotizacion.update(cotizacion.id, {
        estado_conversion: 'EN_PROCESO_FACTURACION',
        venta_id: venta.id
      });

      return { venta, cotizacion };
    },
    onSuccess: ({ venta, cotizacion }) => {
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] });
      queryClient.invalidateQueries({ queryKey: ['cotizaciones-ventas'] });
      
      // Redirigir a POS con precarga
      navigate(createPageUrl('PuntoVenta'), {
        state: {
          venta: venta,
          cotizacion_origen: cotizacion,
          carrito: cotizacion.items,
          cliente_id: cotizacion.cliente_id
        }
      });
    },
    onError: (error) => {
      alert(`Error al convertir cotización: ${error.message}`);
    }
  });

  const handleConvertirEnFactura = async (cotizacion) => {
    if (cotizacion.estado !== 'aprobada') {
      alert('Solo se pueden convertir cotizaciones en estado APROBADA');
      return;
    }

    if (cotizacion.estado_conversion === 'EN_PROCESO_FACTURACION') {
      alert('Esta cotización ya tiene una conversión en proceso');
      return;
    }

    if (cotizacion.estado_conversion === 'CONVERTIDA') {
      alert('Esta cotización ya fue convertida a venta');
      return;
    }

    if (!window.confirm('¿Deseas convertir esta cotización en una venta?\n\nSe abrirá el POS con los datos precargados.')) {
      return;
    }

    convertirEnFacturaMutation.mutate(cotizacion);
  };

  const estadoConfig = {
    borrador: { color: 'bg-slate-100 text-slate-700', label: 'Borrador' },
    enviada: { color: 'bg-blue-100 text-blue-700', label: 'Enviada' },
    aprobada: { color: 'bg-emerald-100 text-emerald-700', label: 'Aprobada' },
    rechazada: { color: 'bg-red-100 text-red-700', label: 'Rechazada' },
    vencida: { color: 'bg-orange-100 text-orange-700', label: 'Vencida' },
  };

  const estadoConversionConfig = {
    SIN_CONVERTIR: { color: 'bg-slate-100 text-slate-600', label: 'Sin convertir' },
    EN_PROCESO_FACTURACION: { color: 'bg-yellow-100 text-yellow-700', label: 'En proceso' },
    CONVERTIDA: { color: 'bg-purple-100 text-purple-700', label: 'Convertida' },
  };

  // Si openDirectly es true, solo renderizar el formulario sin wrapper dialog
  if (openDirectly) {
    return (
      <FormularioCotizacion
        clienteId={clienteId}
        ordenTrabajoId={ordenTrabajoId}
        user={user}
        userAccount={userAccount}
        clientes={clientes}
        cotizacionEditar={editingCotizacion}
        onGuardar={handleGuardar}
        onCancelar={() => {
          setShowModal(false);
          setEditingCotizacion(null);
        }}
      />
    );
  }

  return (
    <>
      {/* ── Shell visual homologado ── */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">

        {/* Header compacto unificado */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
          <FileText className="w-3.5 h-3.5 text-purple-600" />
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Cotizaciones</span>
          <span className="text-xs text-slate-400 tabular-nums">{cotizaciones.length}</span>
          <div className="ml-auto">
            <Button onClick={() => setShowModal(true)} size="sm" variant="outline"
              className="h-6 px-2 text-[11px] border-slate-200 text-slate-600 hover:text-slate-900">
              <Plus className="w-3 h-3 mr-1" />
              Nueva
            </Button>
          </div>
        </div>

        {/* Lista */}
        {cotizaciones.length === 0 ? (
          <div className="px-4 py-3 text-xs text-slate-400 italic">Sin cotizaciones registradas</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {cotizaciones.map((cot) => {
              const config = estadoConfig[cot.estado];
              const conversionConfig = estadoConversionConfig[cot.estado_conversion || 'SIN_CONVERTIR'];
              return (
                <div key={cot.id} className="px-4 py-2.5 hover:bg-slate-50/70 transition-colors">
                  {/* Fila principal */}
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-xs font-medium text-slate-800 truncate">
                      ₡{cot.total?.toLocaleString()} · {cot.items?.length} ítems
                    </span>
                    <Badge className={`${config?.color} border-0 text-[10px] px-1.5 py-0 leading-tight shrink-0`}>
                      {config?.label}
                    </Badge>
                    {cot.estado_conversion && cot.estado_conversion !== 'SIN_CONVERTIR' && (
                      <Badge className={`${conversionConfig?.color} border-0 text-[10px] px-1.5 py-0 leading-tight shrink-0`}>
                        {conversionConfig?.label}
                      </Badge>
                    )}
                    {cot.requiere_aprobacion && !cot.aprobada_por && (
                      <AlertCircle className="w-3 h-3 text-yellow-500 shrink-0" title="Requiere aprobación" />
                    )}
                    <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                      {format(new Date(cot.created_date), 'dd/MM/yy')}
                    </span>
                  </div>
                  {/* Metadatos secundarios */}
                  <div className="flex items-center gap-2 mt-1">
                    {cot.valida_hasta && (
                      <span className="text-[10px] text-slate-400">
                        Válida: {format(new Date(cot.valida_hasta), 'dd/MM/yy')}
                      </span>
                    )}
                    {cot.convertida_at && (
                      <span className="text-[10px] text-purple-500">
                        Convertida {format(new Date(cot.convertida_at), 'dd/MM/yy')}
                      </span>
                    )}
                    {/* Acciones compactas */}
                    <div className="ml-auto flex items-center gap-1">
                      {cot.estado === 'borrador' && (
                        <>
                          <button onClick={() => handleEditar(cot)}
                            className="text-[10px] text-slate-500 hover:text-slate-800 underline">Editar</button>
                          <span className="text-slate-300">·</span>
                          <button onClick={() => handleEnviar(cot)}
                            className="text-[10px] text-blue-600 hover:text-blue-800 underline">Enviar</button>
                        </>
                      )}
                      {cot.estado === 'aprobada' && cot.estado_conversion === 'SIN_CONVERTIR' && (
                        <button
                          onClick={() => handleConvertirEnFactura(cot)}
                          disabled={convertirEnFacturaMutation.isPending}
                          className="text-[10px] text-emerald-600 hover:text-emerald-800 underline disabled:opacity-50">
                          Convertir
                        </button>
                      )}
                      {(cot.estado === 'enviada' || cot.estado === 'aprobada') && (
                        <>
                          <button onClick={() => copiarLink(cot)}
                            className="text-[10px] text-slate-500 hover:text-slate-800 underline">Link</button>
                          <span className="text-slate-300">·</span>
                          <button onClick={() => descargarPDF(cot, cliente, organization)}
                            className="text-[10px] text-slate-500 hover:text-slate-800 underline">PDF</button>
                          <span className="text-slate-300">·</span>
                          <button onClick={() => imprimirCotizacion(cot)}
                            className="text-[10px] text-slate-500 hover:text-slate-800 underline">Imprimir</button>
                        </>
                      )}
                      {cot.estado === 'enviada' && cliente && (
                        <>
                          <span className="text-slate-300">·</span>
                          <button
                            onClick={() => enviarSeguimientoMutation.mutate({ cotizacion: cot, cliente })}
                            disabled={enviarSeguimientoMutation.isPending}
                            className="text-[10px] text-purple-600 hover:text-purple-800 underline disabled:opacity-50">
                            Seguimiento
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCotizacion ? 'Editar' : 'Nueva'} Cotización</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!clienteId && (
              <div className="space-y-2">
                <Label>Cliente *</Label>
                <Select 
                  value={clienteSeleccionadoInterno} 
                  onValueChange={setClienteSeleccionadoInterno}
                  disabled={!!editingCotizacion}
                >
                  <SelectTrigger>
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
                {!clienteSeleccionadoInterno && (
                  <Alert className="bg-amber-50 border-amber-200">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <AlertDescription className="text-amber-800 text-sm">
                      Selecciona un cliente antes de guardar o enviar la cotización
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
                          <Label className="text-xs">Buscar Producto / Descripción</Label>
                          <div className="relative">
                            <Search className="absolute left-2 top-2 w-4 h-4 text-slate-400" />
                            <Input
                              value={busquedaProductos[idx] || ''}
                              onChange={(e) => buscarProducto(e.target.value, idx)}
                              placeholder={item.tipo === 'producto' ? 'Buscar en inventario...' : 'Descripción del servicio...'}
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
                            placeholder="Descripción que aparecerá en la cotización"
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
                                📦 Stock disponible: {productoActual.cantidad_disponible} unidades
                              </span>
                            </div>
                            <p className="text-xs mt-1 text-blue-600">
                              ⚠️ Stock no reservado - Se valida al facturar
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
              {(() => {
                const totales = calcularTotales();
                return (
                  <>
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
                    Esta cotización requiere aprobación (descuento &gt; {DESCUENTO_MAXIMO_SIN_APROBACION}%)
                  </p>
                </div>
              )}
                  </>
                );
              })()}
            </div>

            <div className="space-y-2">
              <Label>Válida hasta</Label>
              <Input
                name="valida_hasta"
                type="date"
                defaultValue={editingCotizacion?.valida_hasta}
              />
            </div>

            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                name="notas"
                placeholder="Notas adicionales..."
                defaultValue={editingCotizacion?.notas}
                rows={2}
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={() => {
                setShowModal(false);
                resetForm();
              }}>
                Cancelar
              </Button>
              <Button type="submit">
                Guardar Cotización
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
