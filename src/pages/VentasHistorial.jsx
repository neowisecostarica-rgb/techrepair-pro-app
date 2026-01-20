import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageGuard from '@/components/guards/PageGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Eye, FileText, DollarSign, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuthContext } from '@/components/contexts/AuthContext';
import AccionesPostVenta from '@/components/ventas/AccionesPostVenta';

export default function VentasHistorial() {
  return (
    <PageGuard allowedRoles={['SALES', 'ORG_ADMIN', 'BRANCH_ADMIN']}>
      <VentasHistorialContent />
    </PageGuard>
  );
}

function VentasHistorialContent() {
  const { effectiveOrgId, userAccount } = useAuthContext();
  const [busqueda, setBusqueda] = useState('');
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState('todas');
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  // Default: último mes
  const fechaDesdeDefault = new Date();
  fechaDesdeDefault.setMonth(fechaDesdeDefault.getMonth() - 1);
  const [fechaDesde, setFechaDesde] = useState(fechaDesdeDefault.toISOString().split('T')[0]);
  const [fechaHasta, setFechaHasta] = useState(new Date().toISOString().split('T')[0]);

  const { data: ventas = [], isLoading } = useQuery({
    queryKey: ['ventas-historial', effectiveOrgId, fechaDesde, fechaHasta],
    queryFn: async () => {
      const allVentas = await base44.entities.Venta.filter({
        organization_id: effectiveOrgId
      });
      
      // Filtrar por fecha
      return allVentas.filter(v => {
        const ventaFecha = new Date(v.created_date);
        const desde = new Date(fechaDesde);
        const hasta = new Date(fechaHasta);
        hasta.setHours(23, 59, 59);
        return ventaFecha >= desde && ventaFecha <= hasta;
      });
    },
    select: (data) => data.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)),
    enabled: !!effectiveOrgId
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes-hist', effectiveOrgId],
    queryFn: () => base44.entities.Cliente.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId
  });

  const { data: ordenesTrabajo = [] } = useQuery({
    queryKey: ['ot-hist', effectiveOrgId],
    queryFn: () => base44.entities.OrdenTrabajo.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId
  });

  const getClienteName = (clienteId) => {
    if (!clienteId) return 'Sin cliente';
    const cliente = clientes.find(c => c.id === clienteId);
    return cliente?.nombre_completo || 'Sin cliente';
  };

  const getOTCodigo = (otId) => {
    if (!otId) return null;
    const ot = ordenesTrabajo.find(o => o.id === otId);
    return ot?.codigo_ot;
  };

  const ventasFiltradas = ventas.filter(v => {
    // Filtro por búsqueda
    if (busqueda) {
      const cliente = getClienteName(v.cliente_id).toLowerCase();
      const total = v.total.toString();
      const otCodigo = getOTCodigo(v.referencia_ot_id)?.toLowerCase() || '';
      if (!cliente.includes(busqueda.toLowerCase()) && 
          !total.includes(busqueda) && 
          !otCodigo.includes(busqueda.toLowerCase())) {
        return false;
      }
    }

    // Filtro por estado
    if (filtroEstado !== 'todas' && v.estado !== filtroEstado) {
      return false;
    }

    return true;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Cargando historial...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Historial de Ventas</h1>
          <p className="text-slate-600">Consulta de ventas realizadas</p>
        </div>
      </div>

      <Card className="border-0 shadow-xl">
        <CardHeader className="border-b border-slate-100">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Ventas Registradas ({ventasFiltradas.length})
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMostrarFiltros(!mostrarFiltros)}
            >
              <Filter className="w-4 h-4 mr-2" />
              {mostrarFiltros ? 'Ocultar' : 'Mostrar'} Filtros
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {/* Filtros */}
          {mostrarFiltros && (
            <div className="p-4 bg-slate-50 rounded-lg space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm">Desde</Label>
                  <Input
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => setFechaDesde(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm">Hasta</Label>
                  <Input
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => setFechaHasta(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm">Estado</Label>
                  <select
                    value={filtroEstado}
                    onChange={(e) => setFiltroEstado(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-md"
                  >
                    <option value="todas">Todas</option>
                    <option value="pagada">Pagadas</option>
                    <option value="anulada">Anuladas</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Búsqueda */}
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar por cliente, OT o monto..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="flex-1"
            />
          </div>

          {/* Lista de ventas */}
          <div className="space-y-3">
            {ventasFiltradas.map((venta) => {
              const otCodigo = getOTCodigo(venta.referencia_ot_id);
              
              return (
                <div
                  key={venta.id}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <DollarSign className="w-5 h-5 text-emerald-600" />
                      <div>
                        <p className="font-semibold text-slate-900">
                          ₡{venta.total.toLocaleString()}
                        </p>
                        <p className="text-sm text-slate-600">
                          {getClienteName(venta.cliente_id)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                      <span>{format(new Date(venta.created_date), "dd MMM yyyy 'a las' HH:mm", { locale: es })}</span>
                      <Badge variant={venta.estado === 'pagada' ? 'default' : 'outline'} className="capitalize">
                        {venta.estado}
                      </Badge>
                      {venta.tipo_concepto && (
                        <Badge variant="outline" className="capitalize">
                          {venta.tipo_concepto.replace(/_/g, ' ')}
                        </Badge>
                      )}
                      {venta.metodo_pago && (
                        <Badge variant="outline" className="capitalize">
                          {venta.metodo_pago}
                        </Badge>
                      )}
                      {otCodigo && (
                        <Badge variant="outline">
                          {otCodigo}
                        </Badge>
                      )}
                      <Badge variant="outline" className="capitalize">
                        {venta.origen_venta}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => setVentaSeleccionada(venta)}
                      variant="outline"
                      size="sm"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      Ver
                    </Button>
                  </div>
                </div>
              );
            })}

            {ventasFiltradas.length === 0 && (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No se encontraron ventas</p>
                <p className="text-xs text-slate-400 mt-1">Intenta ajustar los filtros</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modal Detalle */}
      <Dialog open={!!ventaSeleccionada} onOpenChange={() => setVentaSeleccionada(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalle de Venta</DialogTitle>
          </DialogHeader>
          {ventaSeleccionada && (
            <div className="space-y-6 mt-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-800 font-medium">📋 Solo lectura</p>
              </div>

              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-xs text-slate-500">Total</p>
                  <p className="text-2xl font-bold text-emerald-600">
                    ₡{ventaSeleccionada.total.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Cliente</p>
                  <p className="font-semibold text-slate-900">
                    {getClienteName(ventaSeleccionada.cliente_id)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Fecha</p>
                  <p className="text-slate-900">
                    {format(new Date(ventaSeleccionada.created_date), "dd MMM yyyy HH:mm", { locale: es })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Estado</p>
                  <Badge variant={ventaSeleccionada.estado === 'pagada' ? 'default' : 'outline'}>
                    {ventaSeleccionada.estado}
                  </Badge>
                </div>
                {ventaSeleccionada.referencia_ot_id && (
                  <div>
                    <p className="text-xs text-slate-500">Orden de Trabajo</p>
                    <p className="text-slate-900">{getOTCodigo(ventaSeleccionada.referencia_ot_id)}</p>
                  </div>
                )}
              </div>

              <div className="border-t pt-4">
                <h4 className="font-semibold text-slate-900 mb-3">Acciones Disponibles</h4>
                <AccionesPostVenta venta={ventaSeleccionada} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}