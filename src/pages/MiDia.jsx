import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, CheckCircle, AlertCircle, Calendar, User } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function MiDia() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: misOrdenes = [] } = useQuery({
    queryKey: ['mis-ordenes', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      return base44.entities.OrdenTrabajo.filter({ tecnico_asignado: user.email }, '-created_date');
    },
    enabled: !!user?.email,
  });

  const { data: misCitas = [] } = useQuery({
    queryKey: ['mis-citas', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      const hoy = new Date().toISOString().split('T')[0];
      return base44.entities.Cita.filter({ 
        tecnico_asignado: user.email,
        fecha: hoy 
      });
    },
    enabled: !!user?.email,
  });

  const columnas = [
    { 
      titulo: 'Pendientes', 
      estados: ['recibido', 'diagnostico'],
      color: 'border-slate-300 bg-slate-50'
    },
    { 
      titulo: 'En Curso', 
      estados: ['aprobacion_pendiente', 'en_reparacion'],
      color: 'border-blue-300 bg-blue-50'
    },
    { 
      titulo: 'Pruebas', 
      estados: ['pruebas'],
      color: 'border-yellow-300 bg-yellow-50'
    },
    { 
      titulo: 'Listo para Cierre', 
      estados: ['listo'],
      color: 'border-emerald-300 bg-emerald-50'
    },
  ];

  const ordenesVencenHoy = misOrdenes.filter(o => {
    if (!o.fecha_estimada_entrega) return false;
    const hoy = new Date().toISOString().split('T')[0];
    return o.fecha_estimada_entrega === hoy && !['entregado', 'cancelado'].includes(o.estado);
  }).length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header con KPIs del día */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">Mi Día</h1>
        <p className="text-slate-500">Panel de trabajo para técnicos</p>
      </div>

      {/* KPIs Diarios */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-0 shadow-md bg-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Mis Órdenes</p>
                <p className="text-2xl font-bold text-slate-900">{misOrdenes.length}</p>
              </div>
              <Wrench className="w-8 h-8 text-emerald-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md bg-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Vencen Hoy</p>
                <p className="text-2xl font-bold text-orange-600">{ordenesVencenHoy}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md bg-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Citas Hoy</p>
                <p className="text-2xl font-bold text-blue-600">{misCitas.length}</p>
              </div>
              <Calendar className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md bg-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Completadas</p>
                <p className="text-2xl font-bold text-green-600">
                  {misOrdenes.filter(o => o.estado === 'entregado').length}
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tablero Kanban */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {columnas.map((columna) => {
          const ordenesColumna = misOrdenes.filter(o => columna.estados.includes(o.estado));
          
          return (
            <Card key={columna.titulo} className={`border-2 ${columna.color} shadow-md`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  {columna.titulo}
                  <Badge variant="secondary" className="ml-2">{ordenesColumna.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {ordenesColumna.map((orden) => (
                  <Card key={orden.id} className="border border-slate-200 hover:shadow-lg transition-shadow cursor-pointer bg-white">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="font-semibold text-sm text-slate-900 mb-1">
                            {orden.numero_ot || `OT-${orden.id.slice(0, 6)}`}
                          </p>
                          <p className="text-xs text-slate-600 line-clamp-2">
                            {orden.falla_reportada}
                          </p>
                        </div>
                      </div>
                      
                      {orden.fecha_estimada_entrega && (
                        <div className="flex items-center gap-1 text-xs text-slate-500 mt-3">
                          <Clock className="w-3 h-3" />
                          {format(new Date(orden.fecha_estimada_entrega), 'dd MMM', { locale: es })}
                        </div>
                      )}

                      {orden.prioridad === 'urgente' && (
                        <Badge className="mt-2 bg-red-100 text-red-700 border-0 text-xs">
                          Urgente
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                ))}

                {ordenesColumna.length === 0 && (
                  <div className="text-center py-8 text-slate-400">
                    <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">Sin órdenes</p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Citas de hoy */}
      {misCitas.length > 0 && (
        <Card className="border-0 shadow-lg">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-lg font-semibold">Mis Citas de Hoy</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-3">
              {misCitas.map((cita) => (
                <div key={cita.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
                  <div className="w-16 text-center">
                    <p className="text-lg font-bold text-slate-900">{cita.hora_inicio}</p>
                    <p className="text-xs text-slate-500">{cita.hora_fin}</p>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">{cita.motivo}</p>
                    <p className="text-sm text-slate-500">
                      {cita.tipo?.replace('_', ' ')} - Cliente #{cita.cliente_id?.slice(0, 8)}
                    </p>
                  </div>
                  <Badge className={`${
                    cita.estado === 'confirmada' ? 'bg-green-100 text-green-700' :
                    cita.estado === 'programada' ? 'bg-blue-100 text-blue-700' :
                    'bg-slate-100 text-slate-700'
                  } border-0`}>
                    {cita.estado}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}