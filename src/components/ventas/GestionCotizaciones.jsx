import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Send, FileText, AlertCircle, MessageSquare, Link as LinkIcon, Download, Printer } from 'lucide-react';
import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import FormularioCotizacion from '@/components/cotizacion/FormularioCotizacion';

export default function GestionCotizaciones({ clienteId, ordenTrabajoId, user, userAccount, clientes = [], openDirectly = false }) {
  const [showModal, setShowModal] = useState(openDirectly);
  const [editingCotizacion, setEditingCotizacion] = useState(null);
  const queryClient = useQueryClient();

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

  const handleEnviar = (cotizacion) => {
    if (!clienteActual) {
      alert('Por favor selecciona un cliente antes de enviar la cotización');
      return;
    }

    if (cotizacion.requiere_aprobacion && !cotizacion.aprobada_por) {
      alert('Esta cotización requiere aprobación por el descuento aplicado.');
      return;
    }

    const token = cotizacion.public_access_token || generarToken();
    
    updateCotizacionMutation.mutate({
      id: cotizacion.id,
      data: { 
        estado: 'enviada', 
        enviada_at: new Date().toISOString(),
        public_access_token: token
      }
    });
  };

  const copiarLink = (cotizacion, organization) => {
    if (!cotizacion.public_access_token) {
      alert('Primero debes enviar la cotización para generar el link');
      return;
    }

    const baseUrl = organization?.public_base_url || window.location.origin;
    const link = `${baseUrl}/cotizacion?token=${cotizacion.public_access_token}`;
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
      const link = `${baseUrl}/cotizacion?token=${cotizacion.public_access_token}`;
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

  const estadoConfig = {
    borrador: { color: 'bg-slate-100 text-slate-700', label: 'Borrador' },
    enviada: { color: 'bg-blue-100 text-blue-700', label: 'Enviada' },
    aprobada: { color: 'bg-emerald-100 text-emerald-700', label: 'Aprobada' },
    rechazada: { color: 'bg-red-100 text-red-700', label: 'Rechazada' },
    vencida: { color: 'bg-orange-100 text-orange-700', label: 'Vencida' },
  };

  const totales = calcularTotales();

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

  // Si openDirectly es false, mostrar wrapper dialog completo (nunca debería llegar aquí en flujo normal)
  if (false) {
    return (
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
    );
  }

  return (
    <>
      <Card className="border-0 shadow-md">
        <CardHeader className="border-b border-slate-100">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              Cotizaciones
            </CardTitle>
            <Button onClick={() => setShowModal(true)} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Nueva Cotización
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {cotizaciones.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <FileText className="w-12 h-12 mx-auto mb-3" />
              <p>No hay cotizaciones registradas</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cotizaciones.map((cot) => {
                const config = estadoConfig[cot.estado];
                
                return (
                  <div key={cot.id} className="p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={`${config.color} border-0 text-xs`}>
                            {config.label}
                          </Badge>
                          {cot.requiere_aprobacion && !cot.aprobada_por && (
                            <Badge className="bg-yellow-100 text-yellow-700 border-0 text-xs flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              Requiere Aprobación
                            </Badge>
                          )}
                        </div>
                        <p className="font-medium text-slate-900">Total: ₡{cot.total.toLocaleString()}</p>
                        <p className="text-sm text-slate-600">{cot.items.length} items</p>
                        {cot.valida_hasta && (
                          <p className="text-xs text-slate-500">
                            Válida hasta: {format(new Date(cot.valida_hasta), 'dd/MM/yyyy')}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {cot.estado === 'borrador' && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => handleEditar(cot)}>
                              Editar
                            </Button>
                            <Button size="sm" onClick={() => handleEnviar(cot)}>
                              <Send className="w-4 h-4 mr-2" />
                              Enviar
                            </Button>
                          </>
                        )}
                        {(cot.estado === 'enviada' || cot.estado === 'aprobada') && (
                          <>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => copiarLink(cot)}
                              className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                            >
                              <LinkIcon className="w-4 h-4 mr-2" />
                              Copiar Link
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => descargarPDF(cot, cliente, organization)}
                            >
                              <Download className="w-4 h-4 mr-2" />
                              PDF
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => imprimirCotizacion(cot)}
                            >
                              <Printer className="w-4 h-4 mr-2" />
                              Imprimir
                            </Button>
                          </>
                        )}
                        {cot.estado === 'enviada' && cliente && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => enviarSeguimientoMutation.mutate({ cotizacion: cot, cliente })}
                            disabled={enviarSeguimientoMutation.isPending}
                            className="bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100"
                          >
                            <MessageSquare className="w-4 h-4 mr-2" />
                            Seguimiento
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

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