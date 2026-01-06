import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Clock, CheckCircle, AlertTriangle, Circle } from 'lucide-react';

const estadoConfig = {
  recibido: { color: 'bg-slate-100 text-slate-700', icon: Circle },
  diagnostico: { color: 'bg-blue-100 text-blue-700', icon: Clock },
  en_reparacion: { color: 'bg-yellow-100 text-yellow-700', icon: AlertTriangle },
  listo: { color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  entregado: { color: 'bg-green-100 text-green-700', icon: CheckCircle },
};

export default function RecentOrders({ orders, onSelectOrder }) {
  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="border-b border-slate-100">
        <CardTitle className="text-lg font-semibold">Órdenes Recientes</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-slate-100">
          {orders?.slice(0, 5).map((order) => {
            const config = estadoConfig[order.estado] || estadoConfig.recibido;
            const Icon = config.icon;
            
            return (
              <div
                key={order.id}
                onClick={() => onSelectOrder?.(order)}
                className="p-4 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                      {order.numero_ot || 'OT'}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{order.falla_reportada}</p>
                      <p className="text-sm text-slate-500">Cliente #{order.cliente_id?.slice(0, 8)}</p>
                    </div>
                  </div>
                  <Badge className={`${config.color} border-0 flex items-center gap-1`}>
                    <Icon className="w-3 h-3" />
                    {order.estado?.replace('_', ' ')}
                  </Badge>
                </div>
                {order.fecha_estimada_entrega && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
                    <Clock className="w-3 h-3" />
                    Entrega: {format(new Date(order.fecha_estimada_entrega), 'dd MMM yyyy', { locale: es })}
                  </div>
                )}
              </div>
            );
          })}
          {(!orders || orders.length === 0) && (
            <div className="p-8 text-center text-slate-400">
              <Wrench className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No hay órdenes recientes</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}