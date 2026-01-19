import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Eye, FileText, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuthContext } from '@/components/contexts/AuthContext';
import AccionesPostVenta from './AccionesPostVenta';

export default function HistorialVentas() {
  const { effectiveOrgId } = useAuthContext();
  const [busqueda, setBusqueda] = useState('');
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);

  const { data: ventas = [], isLoading } = useQuery({
    queryKey: ['historial-ventas', effectiveOrgId],
    queryFn: () => base44.entities.Venta.filter({
      organization_id: effectiveOrgId
    }),
    select: (data) => data.sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes-hist', effectiveOrgId],
    queryFn: () => base44.entities.Cliente.filter({ organization_id: effectiveOrgId })
  });

  const getClienteName = (clienteId) => {
    const cliente = clientes.find(c => c.id === clienteId);
    return cliente?.nombre_completo || 'Sin cliente';
  };

  const ventasFiltradas = ventas.filter(v => {
    if (!busqueda) return true;
    const cliente = getClienteName(v.cliente_id).toLowerCase();
    const total = v.total.toString();
    return cliente.includes(busqueda.toLowerCase()) || total.includes(busqueda);
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Historial de Ventas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar por cliente o monto..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="flex-1"
            />
          </div>

          <div className="space-y-3">
            {ventasFiltradas.map((venta) => (
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
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>{format(new Date(venta.created_date), "dd MMM yyyy 'a las' HH:mm", { locale: es })}</span>
                    <Badge variant={venta.estado === 'pagada' ? 'default' : 'outline'}>
                      {venta.estado}
                    </Badge>
                    {venta.tipo_concepto && (
                      <Badge variant="outline" className="capitalize">
                        {venta.tipo_concepto.replace(/_/g, ' ')}
                      </Badge>
                    )}
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
            ))}

            {ventasFiltradas.length === 0 && (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No se encontraron ventas</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!ventaSeleccionada} onOpenChange={() => setVentaSeleccionada(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalle de Venta</DialogTitle>
          </DialogHeader>
          {ventaSeleccionada && (
            <div className="space-y-6 mt-4">
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
              </div>

              <div className="border-t pt-4">
                <h4 className="font-semibold text-slate-900 mb-3">Acciones Post-Venta</h4>
                <AccionesPostVenta venta={ventaSeleccionada} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}