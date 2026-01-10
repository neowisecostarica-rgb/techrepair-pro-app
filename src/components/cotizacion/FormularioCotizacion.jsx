import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2, Send, AlertCircle, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export default function FormularioCotizacion({ 
  ordenTrabajo, 
  efectiveOrgId, 
  userId, 
  userRole,
  onClose, 
  onComplete 
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [cotizacion, setCotizacion] = useState(null);
  const [formData, setFormData] = useState({
    items: [],
    subtotal: 0,
    descuento_total: 0,
    impuesto: 0,
    total: 0,
    notas: '',
    valida_hasta: ''
  });

  // Cargar cotización borrador o enviada existente
  useEffect(() => {
    cargarCotizacion();
  }, []);

  const cargarCotizacion = async () => {
    try {
      const existentes = await base44.entities.Cotizacion.filter({
        organization_id: efectiveOrgId,
        orden_trabajo_id: ordenTrabajo.id,
        estado: ['borrador', 'enviada']
      });

      if (existentes.length > 0) {
        const cot = existentes[0];
        setCotizacion(cot);
        setFormData({
          items: cot.items || [],
          subtotal: cot.subtotal || 0,
          descuento_total: cot.descuento_total || 0,
          impuesto: cot.impuesto || 0,
          total: cot.total || 0,
          notas: cot.notas || '',
          valida_hasta: cot.valida_hasta || ''
        });
      }
    } catch (error) {
      console.error('Error cargando cotización:', error);
    }
  };

  const calcularTotales = (items, descuento) => {
    const subtotal = items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    const descuentoAplicado = descuento || 0;
    const baseImponible = subtotal - descuentoAplicado;
    const impuesto = baseImponible * 0.19; // IVA 19% (configurable por org)
    const total = baseImponible + impuesto;

    return { subtotal, descuento: descuentoAplicado, impuesto, total };
  };

  const agregarItem = () => {
    setFormData({
      ...formData,
      items: [
        ...formData.items,
        {
          tipo: 'servicio',
          descripcion: '',
          cantidad: 1,
          precio_unitario: 0,
          subtotal: 0
        }
      ]
    });
  };

  const actualizarItem = (index, campo, valor) => {
    const nuevosItems = [...formData.items];
    nuevosItems[index][campo] = valor;

    // Recalcular subtotal del item
    if (campo === 'cantidad' || campo === 'precio_unitario') {
      nuevosItems[index].subtotal = 
        (nuevosItems[index].cantidad || 0) * (nuevosItems[index].precio_unitario || 0);
    }

    const totales = calcularTotales(nuevosItems, formData.descuento_total);
    setFormData({
      ...formData,
      items: nuevosItems,
      ...totales
    });
  };

  const eliminarItem = (index) => {
    const nuevosItems = formData.items.filter((_, i) => i !== index);
    const totales = calcularTotales(nuevosItems, formData.descuento_total);
    setFormData({
      ...formData,
      items: nuevosItems,
      ...totales
    });
  };

  const aplicarDescuento = (valor) => {
    const totales = calcularTotales(formData.items, valor);
    setFormData({
      ...formData,
      descuento_total: valor,
      ...totales
    });
  };

  const guardarBorrador = async () => {
    setSaving(true);
    try {
      const data = {
        organization_id: efectiveOrgId,
        orden_trabajo_id: ordenTrabajo.id,
        cliente_id: ordenTrabajo.cliente_id,
        vendedor_id: userId,
        vendedor_nombre: 'Usuario', // TODO: obtener nombre real
        estado: 'borrador',
        ...formData
      };

      if (cotizacion) {
        await base44.entities.Cotizacion.update(cotizacion.id, data);
      } else {
        const nueva = await base44.entities.Cotizacion.create(data);
        setCotizacion(nueva);
      }

      alert('Cotización guardada como borrador');
    } catch (error) {
      console.error('Error guardando cotización:', error);
      alert('Error al guardar: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const enviarCotizacion = async () => {
    if (formData.items.length === 0) {
      alert('Agrega al menos un item a la cotización');
      return;
    }

    if (!formData.valida_hasta) {
      alert('Define la fecha de validez de la cotización');
      return;
    }

    setSaving(true);
    try {
      // Validar descuentos altos
      const porcentajeDescuento = (formData.descuento_total / formData.subtotal) * 100;
      const requiereAprobacion = porcentajeDescuento > 15;

      const data = {
        organization_id: efectiveOrgId,
        orden_trabajo_id: ordenTrabajo.id,
        cliente_id: ordenTrabajo.cliente_id,
        vendedor_id: userId,
        vendedor_nombre: 'Usuario',
        estado: 'enviada',
        enviada_at: new Date().toISOString(),
        requiere_aprobacion: requiereAprobacion,
        ...formData
      };

      if (cotizacion) {
        await base44.entities.Cotizacion.update(cotizacion.id, data);
      } else {
        await base44.entities.Cotizacion.create(data);
      }

      // Cambiar estado de OT
      await base44.entities.OrdenTrabajo.update(ordenTrabajo.id, {
        estado: 'COTIZADA'
      });

      onComplete();
    } catch (error) {
      console.error('Error enviando cotización:', error);
      alert('Error al enviar: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Cotización</h2>
          <p className="text-sm text-slate-500">
            {ordenTrabajo.codigo_ot}
          </p>
        </div>
        {cotizacion && (
          <Badge variant={cotizacion.estado === 'enviada' ? 'default' : 'secondary'}>
            {cotizacion.estado}
          </Badge>
        )}
      </div>

      <Tabs defaultValue="items" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="items">Servicios y Repuestos</TabsTrigger>
          <TabsTrigger value="resumen">Resumen y Envío</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Items de la Cotización</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={agregarItem}
                  disabled={cotizacion?.estado === 'enviada'}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Agregar Item
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {formData.items.length === 0 ? (
                <Alert>
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription>
                    No hay items. Agrega servicios, repuestos o mano de obra.
                  </AlertDescription>
                </Alert>
              ) : (
                formData.items.map((item, index) => (
                  <div key={index} className="border rounded-lg p-4 space-y-3">
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <Label className="text-xs">Tipo</Label>
                        <select
                          className="w-full border rounded px-3 py-2 text-sm"
                          value={item.tipo}
                          onChange={(e) => actualizarItem(index, 'tipo', e.target.value)}
                          disabled={cotizacion?.estado === 'enviada'}
                        >
                          <option value="servicio">Servicio</option>
                          <option value="repuesto">Repuesto</option>
                          <option value="mano_obra">Mano de Obra</option>
                          <option value="otro">Otro</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Descripción</Label>
                        <Input
                          value={item.descripcion}
                          onChange={(e) => actualizarItem(index, 'descripcion', e.target.value)}
                          placeholder="Describe el item"
                          disabled={cotizacion?.estado === 'enviada'}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Cantidad</Label>
                        <Input
                          type="number"
                          value={item.cantidad}
                          onChange={(e) => actualizarItem(index, 'cantidad', parseFloat(e.target.value) || 0)}
                          disabled={cotizacion?.estado === 'enviada'}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 items-end">
                      <div>
                        <Label className="text-xs">Precio Unitario</Label>
                        <Input
                          type="number"
                          value={item.precio_unitario}
                          onChange={(e) => actualizarItem(index, 'precio_unitario', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          disabled={cotizacion?.estado === 'enviada'}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Subtotal</Label>
                        <Input
                          type="number"
                          value={item.subtotal}
                          disabled
                          className="bg-slate-50"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => eliminarItem(index)}
                        disabled={cotizacion?.estado === 'enviada'}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button 
              onClick={guardarBorrador} 
              disabled={saving || cotizacion?.estado === 'enviada'}
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Guardar Borrador
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="resumen" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Resumen de Cotización</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Subtotal:</span>
                  <span className="font-medium">${formData.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm items-center gap-2">
                  <span className="text-slate-600">Descuento:</span>
                  <Input
                    type="number"
                    value={formData.descuento_total}
                    onChange={(e) => aplicarDescuento(parseFloat(e.target.value) || 0)}
                    className="w-32 text-right"
                    disabled={cotizacion?.estado === 'enviada'}
                  />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Impuestos (19%):</span>
                  <span className="font-medium">${formData.impuesto.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Total:</span>
                  <span className="text-emerald-600">${formData.total.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Válida hasta</Label>
                <Input
                  type="date"
                  value={formData.valida_hasta}
                  onChange={(e) => setFormData({...formData, valida_hasta: e.target.value})}
                  disabled={cotizacion?.estado === 'enviada'}
                />
              </div>

              <div className="space-y-2">
                <Label>Notas adicionales</Label>
                <Textarea
                  value={formData.notas}
                  onChange={(e) => setFormData({...formData, notas: e.target.value})}
                  placeholder="Condiciones, garantías, etc."
                  rows={3}
                  disabled={cotizacion?.estado === 'enviada'}
                />
              </div>

              {cotizacion?.estado === 'enviada' && (
                <Alert className="bg-emerald-50 border-emerald-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <AlertDescription className="text-emerald-800">
                    Esta cotización ya fue enviada al cliente y está esperando aprobación.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            {cotizacion?.estado !== 'enviada' && (
              <Button 
                onClick={enviarCotizacion} 
                disabled={saving}
                className="bg-gradient-to-r from-emerald-500 to-blue-500"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Enviar Cotización
              </Button>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}