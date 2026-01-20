import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import PageGuard from '@/components/guards/PageGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Eye, FileText, CheckCircle2, XCircle, Clock, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuthContext } from '@/components/contexts/AuthContext';

export default function VentasCotizaciones() {
  return (
    <PageGuard allowedRoles={['SALES', 'ORG_ADMIN', 'BRANCH_ADMIN']}>
      <VentasCotizacionesContent />
    </PageGuard>
  );
}

function VentasCotizacionesContent() {
  const { effectiveOrgId } = useAuthContext();
  const [busqueda, setBusqueda] = useState('');
  const [cotizacionSeleccionada, setCotizacionSeleccionada] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState('todas');

  const { data: cotizaciones = [], isLoading } = useQuery({
    queryKey: ['cotizaciones-ventas', effectiveOrgId],
    queryFn: () => base44.entities.Cotizacion.filter({
      organization_id: effectiveOrgId
    }),
    select: (data) => data.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)),
    enabled: !!effectiveOrgId
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes-cot', effectiveOrgId],
    queryFn: () => base44.entities.Cliente.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId
  });

  const { data: ordenesTrabajo = [] } = useQuery({
    queryKey: ['ot-cot', effectiveOrgId],
    queryFn: () => base44.entities.OrdenTrabajo.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId
  });

  const getClienteName = (clienteId) => {
    const cliente = clientes.find(c => c.id === clienteId);
    return cliente?.nombre_completo || 'Sin cliente';
  };

  const getOT = (otId) => {
    if (!otId) return null;
    return ordenesTrabajo.find(o => o.id === otId);
  };

  const cotizacionesFiltradas = cotizaciones.filter(c => {
    if (busqueda) {
      const cliente = getClienteName(c.cliente_id).toLowerCase();
      const total = c.total.toString();
      const ot = getOT(c.orden_trabajo_id);
      const otCodigo = ot?.codigo_ot?.toLowerCase() || '';
      if (!cliente.includes(busqueda.toLowerCase()) && 
          !total.includes(busqueda) && 
          !otCodigo.includes(busqueda.toLowerCase())) {
        return false;
      }
    }

    if (filtroEstado !== 'todas' && c.estado !== filtroEstado) {
      return false;
    }

    return true;
  });

  const estadoConfig = {
    borrador: { color: 'bg-slate-100 text-slate-700', icon: FileText, label: 'Borrador' },
    enviada: { color: 'bg-blue-100 text-blue-700', icon: Clock, label: 'Enviada' },
    aprobada: { color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2, label: 'Aprobada' },
    rechazada: { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Rechazada' },
    vencida: { color: 'bg-orange-100 text-orange-700', icon: XCircle, label: 'Vencida' },
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Cargando cotizaciones...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Cotizaciones</h1>
          <p className="text-slate-600">Consulta de cotizaciones emitidas (solo lectura)</p>
        </div>
      </div>

      <Card className="border-0 shadow-xl">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Cotizaciones Registradas ({cotizacionesFiltradas.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {/* Filtros */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 flex-1">
              <Search className="w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por cliente, OT o monto..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="flex-1"
              />
            </div>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-md"
            >
              <option value="todas">Todos los estados</option>
              <option value="borrador">Borrador</option>
              <option value="enviada">Enviada</option>
              <option value="aprobada">Aprobada</option>
              <option value="rechazada">Rechazada</option>
              <option value="vencida">Vencida</option>
            </select>
          </div>

          {/* Lista */}
          <div className="space-y-3">
            {cotizacionesFiltradas.map((cot) => {
              const config = estadoConfig[cot.estado];
              const Icon = config.icon;
              const ot = getOT(cot.orden_trabajo_id);

              return (
                <div
                  key={cot.id}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={`${config.color} border-0`}>
                        <Icon className="w-3 h-3 mr-1" />
                        {config.label}
                      </Badge>
                      {cot.requiere_aprobacion && !cot.aprobada_por && (
                        <Badge className="bg-yellow-100 text-yellow-700 border-0 text-xs">
                          Requiere Aprobación
                        </Badge>
                      )}
                    </div>
                    <p className="font-semibold text-slate-900">
                      {getClienteName(cot.cliente_id)} - ₡{cot.total.toLocaleString()}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-1 flex-wrap">
                      <span>{cot.items?.length || 0} ítems</span>
                      {ot && (
                        <Badge variant="outline" className="text-xs">
                          {ot.codigo_ot}
                        </Badge>
                      )}
                      {cot.valida_hasta && (
                        <span>Válida hasta: {format(new Date(cot.valida_hasta), 'dd/MM/yyyy', { locale: es })}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => setCotizacionSeleccionada(cot)}
                      variant="outline"
                      size="sm"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      Ver
                    </Button>
                    {cot.orden_trabajo_id && (
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                      >
                        <Link to={createPageUrl('OrdenesTrabajo')}>
                          <ArrowRight className="w-3 h-3 mr-1" />
                          Ir a OT
                        </Link>
                      </Button>
                    )}
                    {cot.estado === 'aprobada' && (
                      <Button
                        asChild
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        <Link to={createPageUrl('PuntoVenta')}>
                          Cobrar
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}

            {cotizacionesFiltradas.length === 0 && (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No se encontraron cotizaciones</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modal Detalle */}
      <Dialog open={!!cotizacionSeleccionada} onOpenChange={() => setCotizacionSeleccionada(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de Cotización</DialogTitle>
          </DialogHeader>
          {cotizacionSeleccionada && (
            <div className="space-y-6 mt-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-800 font-medium">📋 Solo lectura - No puede editar cotizaciones desde esta vista</p>
              </div>

              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-xs text-slate-500">Cliente</p>
                  <p className="font-semibold text-slate-900">
                    {getClienteName(cotizacionSeleccionada.cliente_id)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Estado</p>
                  <Badge className={estadoConfig[cotizacionSeleccionada.estado].color}>
                    {estadoConfig[cotizacionSeleccionada.estado].label}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Vendedor</p>
                  <p className="text-slate-900">{cotizacionSeleccionada.vendedor_nombre}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Fecha</p>
                  <p className="text-slate-900">
                    {format(new Date(cotizacionSeleccionada.created_date), 'dd MMM yyyy', { locale: es })}
                  </p>
                </div>
              </div>

              {/* Items */}
              <div>
                <h4 className="font-semibold text-slate-900 mb-3">Ítems de la Cotización</h4>
                <div className="space-y-2">
                  {cotizacionSeleccionada.items?.map((item, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-slate-900">{item.descripcion}</p>
                          <p className="text-xs text-slate-500">
                            {item.cantidad} x ₡{item.precio_unitario?.toLocaleString()}
                            {item.descuento_porcentaje > 0 && ` (-${item.descuento_porcentaje}%)`}
                          </p>
                        </div>
                        <p className="font-semibold text-slate-900">₡{item.subtotal?.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totales */}
              <div className="border-t pt-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Subtotal:</span>
                    <span className="font-medium">₡{cotizacionSeleccionada.subtotal?.toLocaleString()}</span>
                  </div>
                  {cotizacionSeleccionada.descuento_total > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Descuento:</span>
                      <span className="font-medium text-emerald-600">-₡{cotizacionSeleccionada.descuento_total?.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">IVA (13%):</span>
                    <span className="font-medium">₡{cotizacionSeleccionada.impuesto?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Total:</span>
                    <span className="text-emerald-600">₡{cotizacionSeleccionada.total?.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {cotizacionSeleccionada.notas && (
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Notas</h4>
                  <p className="text-sm text-slate-600">{cotizacionSeleccionada.notas}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}