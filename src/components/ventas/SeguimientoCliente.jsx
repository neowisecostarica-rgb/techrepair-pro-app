import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wrench, ShoppingCart, FileText, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function SeguimientoCliente({ clienteId }) {
  const { data: ordenes = [] } = useQuery({
    queryKey: ['ordenes-cliente', clienteId],
    queryFn: () => base44.entities.OrdenTrabajo.filter({ cliente_id: clienteId }),
    enabled: !!clienteId,
  });

  const { data: ventas = [] } = useQuery({
    queryKey: ['ventas-cliente', clienteId],
    queryFn: () => base44.entities.Venta.filter({ cliente_id: clienteId }),
    enabled: !!clienteId,
  });

  const { data: cotizaciones = [] } = useQuery({
    queryKey: ['cotizaciones-cliente', clienteId],
    queryFn: () => base44.entities.Cotizacion.filter({ cliente_id: clienteId }),
    enabled: !!clienteId,
  });

  const { data: mensajes = [] } = useQuery({
    queryKey: ['mensajes-cliente-hist', clienteId],
    queryFn: () => base44.entities.MensajeCliente.filter({ cliente_id: clienteId }),
    enabled: !!clienteId,
  });

  const estadoOTConfig = {
    EN_COLA_REVISION: { color: 'bg-slate-100 text-slate-700', label: 'En Cola' },
    ASIGNADA: { color: 'bg-blue-100 text-blue-700', label: 'Asignada' },
    EN_REVISION: { color: 'bg-purple-100 text-purple-700', label: 'En Revisión' },
    DIAGNOSTICADA: { color: 'bg-yellow-100 text-yellow-700', label: 'Diagnosticada' },
    EN_REPARACION: { color: 'bg-indigo-100 text-indigo-700', label: 'En Reparación' },
    FINALIZADA: { color: 'bg-emerald-100 text-emerald-700', label: 'Finalizada' },
    ENTREGADA: { color: 'bg-green-100 text-green-700', label: 'Entregada' },
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Órdenes de Trabajo */}
      <Card className="border-0 shadow-md">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-lg flex items-center gap-2">
            <Wrench className="w-5 h-5 text-emerald-600" />
            Órdenes de Trabajo ({ordenes.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {ordenes.length === 0 ? (
            <p className="text-sm text-slate-400">Sin órdenes registradas</p>
          ) : (
            <div className="space-y-2">
              {ordenes.slice(0, 5).map((orden) => {
                const config = estadoOTConfig[orden.estado] || estadoOTConfig.EN_COLA_REVISION;
                return (
                  <div key={orden.id} className="p-3 bg-slate-50 rounded">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-slate-900">{orden.motivo_ingreso}</p>
                      <Badge className={`${config.color} border-0 text-xs`}>
                        {config.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500">
                      {format(new Date(orden.created_date), 'dd/MM/yyyy', { locale: es })}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ventas */}
      <Card className="border-0 shadow-md">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-lg flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-blue-600" />
            Ventas ({ventas.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {ventas.length === 0 ? (
            <p className="text-sm text-slate-400">Sin ventas registradas</p>
          ) : (
            <div className="space-y-2">
              {ventas.slice(0, 5).map((venta) => (
                <div key={venta.id} className="p-3 bg-slate-50 rounded">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-900">₡{venta.total.toLocaleString()}</p>
                    <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">
                      {venta.estado}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    {format(new Date(venta.created_date), 'dd/MM/yyyy', { locale: es })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cotizaciones */}
      <Card className="border-0 shadow-md">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-600" />
            Cotizaciones ({cotizaciones.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {cotizaciones.length === 0 ? (
            <p className="text-sm text-slate-400">Sin cotizaciones registradas</p>
          ) : (
            <div className="space-y-2">
              {cotizaciones.slice(0, 5).map((cot) => (
                <div key={cot.id} className="p-3 bg-slate-50 rounded">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-900">₡{cot.total.toLocaleString()}</p>
                    <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">
                      {cot.estado}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    {format(new Date(cot.created_date), 'dd/MM/yyyy', { locale: es })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mensajes */}
      <Card className="border-0 shadow-md">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-orange-600" />
            Mensajes ({mensajes.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {mensajes.length === 0 ? (
            <p className="text-sm text-slate-400">Sin mensajes registrados</p>
          ) : (
            <div className="space-y-2">
              {mensajes.slice(0, 5).map((mensaje) => (
                <div key={mensaje.id} className="p-3 bg-slate-50 rounded">
                  <p className="text-sm font-medium text-slate-900 mb-1">{mensaje.asunto}</p>
                  <p className="text-xs text-slate-500">
                    {format(new Date(mensaje.created_date), 'dd/MM/yyyy', { locale: es })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}