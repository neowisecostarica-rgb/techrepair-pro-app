import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Send, FileText, Trash2, AlertCircle, MessageSquare, Search, Package } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { withOrgId } from '@/components/hooks/useOrgData';
import { Alert, AlertDescription } from '@/components/ui/alert';

const DESCUENTO_MAXIMO_SIN_APROBACION = 15; // 15%

export default function GestionCotizaciones({ clienteId, ordenTrabajoId, user, userAccount }) {
  const [showModal, setShowModal] = useState(false);
  const [editingCotizacion, setEditingCotizacion] = useState(null);
  const [items, setItems] = useState([{ tipo: 'servicio', descripcion: '', cantidad: 1, precio_unitario: 0, descuento_porcentaje: 0, subtotal: 0 }]);
  const [busquedaProductos, setBusquedaProductos] = useState({});
  const [productoSeleccionado, setProductoSeleccionado] = useState({});
  const queryClient = useQueryClient();

  const { data: cotizaciones = [] } = useQuery({
    queryKey: ['cotizaciones', clienteId],
    queryFn: () => base44.entities.Cotizacion.filter({ cliente_id: clienteId }),
    enabled: !!clienteId,
  });

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] });
      setShowModal(false);
      resetForm();
    },
  });

  const updateCotizacionMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Cotizacion.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] });
      setShowModal(false);
      resetForm();
    },
  });

  const enviarSeguimientoMutation = useMutation({
    mutationFn: async ({ cotizacion, cliente }) => {
      const canal = cliente.telefono ? 'whatsapp' : 'email';
      const mensaje = `Hola ${cliente.nombre_completo}, te escribo para dar seguimiento a la cotización que te compartimos. Quedo atento(a) si tienes alguna duda. — ${user.full_name || 'El equipo'}`;
      
      return await base44.entities.MensajeCliente.create(withOrgId({
        cliente_id: clienteId,
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
    queryKey: ['cliente', clienteId],
    queryFn: () => base44.entities.Cliente.filter({ id: clienteId }).then(res => res[0]),
    enabled: !!clienteId,
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
    const formData = new FormData(e.target);
    const totales = calcularTotales();

    const cotizacionData = {
      cliente_id: clienteId,
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

  const handleEnviar = (cotizacion) => {
    if (cotizacion.requiere_aprobacion && !cotizacion.aprobada_por) {
      alert('Esta cotización requiere aprobación por el descuento aplicado.');
      return;
    }

    updateCotizacionMutation.mutate({
      id: cotizacion.id,
      data: { estado: 'enviada', enviada_at: new Date().toISOString() }
    });
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
                      <div className="flex gap-2">
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
                        {cot.estado === 'enviada' && cliente && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => enviarSeguimientoMutation.mutate({ cotizacion: cot, cliente })}
                            disabled={enviarSeguimientoMutation.isPending}
                            className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                          >
                            <MessageSquare className="w-4 h-4 mr-2" />
                            Dar seguimiento
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