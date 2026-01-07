import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, FileText, Wrench, TrendingDown, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { createPageUrl } from '../../utils';
import { Link } from 'react-router-dom';

export default function SenalesNegocio({ userAccount }) {
  const { data: ordenes = [] } = useQuery({
    queryKey: ['ordenes-todas', userAccount?.organization_id],
    queryFn: () => base44.entities.OrdenTrabajo.filter({
      organization_id: userAccount.organization_id
    }),
    enabled: !!userAccount?.organization_id,
  });

  const { data: cotizaciones = [] } = useQuery({
    queryKey: ['cotizaciones-todas', userAccount?.organization_id],
    queryFn: () => base44.entities.Cotizacion.filter({
      organization_id: userAccount.organization_id
    }),
    enabled: !!userAccount?.organization_id,
  });

  const { data: solicitudes = [] } = useQuery({
    queryKey: ['solicitudes-pendientes', userAccount?.organization_id],
    queryFn: () => base44.entities.SolicitudTecnica.filter({
      organization_id: userAccount.organization_id,
      estado: 'requested'
    }),
    enabled: !!userAccount?.organization_id,
  });

  // Calcular señales
  const otPendientes = ordenes.filter(o => 
    ['EN_COLA_REVISION', 'ASIGNADA'].includes(o.estado)
  );

  const otSinMovimiento = ordenes.filter(o => {
    const lastActivity = new Date(o.ultima_actividad_at || o.created_date);
    const hoursInactive = (Date.now() - lastActivity) / (1000 * 60 * 60);
    return hoursInactive > 4 && !['FINALIZADA', 'ENTREGADA', 'CANCELADA'].includes(o.estado);
  });

  const cotizacionesSinCierre = cotizaciones.filter(c => {
    const daysSent = c.enviada_at ? (Date.now() - new Date(c.enviada_at)) / (1000 * 60 * 60 * 24) : 0;
    return c.estado === 'enviada' && daysSent > 3;
  });

  const trabajoSinIngresos = ordenes.filter(o => 
    o.estado === 'FINALIZADA' && !o.venta_id
  );

  const solicitudesPendientes = solicitudes.length;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-slate-900">Señales de Negocio</h2>
      <p className="text-sm text-slate-600">Alertas operativas que requieren tu atención</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* OT Pendientes */}
        <Card className={`border-0 shadow-md ${otPendientes.length > 0 ? 'bg-yellow-50 border-l-4 border-yellow-500' : ''}`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <Wrench className="w-8 h-8 text-yellow-600" />
              <Badge className="bg-yellow-100 text-yellow-700 text-lg font-bold border-0">
                {otPendientes.length}
              </Badge>
            </div>
            <h3 className="font-semibold text-slate-900 mb-1">OT en Cola</h3>
            <p className="text-sm text-slate-600">Órdenes sin asignar o iniciar</p>
            {otPendientes.length > 0 && (
              <Link to={createPageUrl('OrdenesTrabajo')}>
                <Button size="sm" variant="outline" className="mt-3 w-full">
                  Ver Órdenes
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>

        {/* OT Sin Movimiento */}
        <Card className={`border-0 shadow-md ${otSinMovimiento.length > 0 ? 'bg-red-50 border-l-4 border-red-500' : ''}`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <Clock className="w-8 h-8 text-red-600" />
              <Badge className="bg-red-100 text-red-700 text-lg font-bold border-0">
                {otSinMovimiento.length}
              </Badge>
            </div>
            <h3 className="font-semibold text-slate-900 mb-1">Sin Movimiento (+4h)</h3>
            <p className="text-sm text-slate-600">Órdenes estancadas</p>
            {otSinMovimiento.length > 0 && (
              <Link to={createPageUrl('OrdenesTrabajo')}>
                <Button size="sm" variant="outline" className="mt-3 w-full">
                  Revisar
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Cotizaciones Sin Cierre */}
        <Card className={`border-0 shadow-md ${cotizacionesSinCierre.length > 0 ? 'bg-orange-50 border-l-4 border-orange-500' : ''}`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <FileText className="w-8 h-8 text-orange-600" />
              <Badge className="bg-orange-100 text-orange-700 text-lg font-bold border-0">
                {cotizacionesSinCierre.length}
              </Badge>
            </div>
            <h3 className="font-semibold text-slate-900 mb-1">Cotizaciones Sin Cierre</h3>
            <p className="text-sm text-slate-600">Enviadas hace +3 días</p>
            {cotizacionesSinCierre.length > 0 && (
              <Link to={createPageUrl('Clientes')}>
                <Button size="sm" variant="outline" className="mt-3 w-full">
                  Ver Clientes
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Trabajo Sin Ingresos */}
        <Card className={`border-0 shadow-md ${trabajoSinIngresos.length > 0 ? 'bg-purple-50 border-l-4 border-purple-500' : ''}`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <TrendingDown className="w-8 h-8 text-purple-600" />
              <Badge className="bg-purple-100 text-purple-700 text-lg font-bold border-0">
                {trabajoSinIngresos.length}
              </Badge>
            </div>
            <h3 className="font-semibold text-slate-900 mb-1">Trabajo Sin Cobrar</h3>
            <p className="text-sm text-slate-600">OT finalizadas sin venta</p>
            {trabajoSinIngresos.length > 0 && (
              <Link to={createPageUrl('OrdenesTrabajo')}>
                <Button size="sm" variant="outline" className="mt-3 w-full">
                  Cobrar
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>

        {/* Solicitudes Pendientes */}
        <Card className={`border-0 shadow-md ${solicitudesPendientes > 0 ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <AlertCircle className="w-8 h-8 text-blue-600" />
              <Badge className="bg-blue-100 text-blue-700 text-lg font-bold border-0">
                {solicitudesPendientes}
              </Badge>
            </div>
            <h3 className="font-semibold text-slate-900 mb-1">Solicitudes Técnicas</h3>
            <p className="text-sm text-slate-600">Pendientes de aprobación</p>
            {solicitudesPendientes > 0 && (
              <Link to={createPageUrl('OrdenesTrabajo')}>
                <Button size="sm" variant="outline" className="mt-3 w-full">
                  Aprobar
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>

      {otPendientes.length === 0 && otSinMovimiento.length === 0 && cotizacionesSinCierre.length === 0 && trabajoSinIngresos.length === 0 && solicitudesPendientes === 0 && (
        <Card className="border-0 shadow-md bg-emerald-50">
          <CardContent className="p-6 text-center">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6 text-emerald-600" />
            </div>
            <h3 className="font-semibold text-emerald-900 mb-1">Todo en orden</h3>
            <p className="text-sm text-emerald-700">No hay alertas operativas en este momento</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}