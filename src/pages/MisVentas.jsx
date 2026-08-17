import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuthContext } from '@/components/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, DollarSign, ShoppingCart, Calendar } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function MisVentas() {
  const { user, effectiveOrgId } = useAuthContext();

  const { data: ventas = [], isLoading } = useQuery({
    queryKey: ['mis-ventas', effectiveOrgId, user?.id],
    queryFn: async () => {
      if (!effectiveOrgId || !user?.id) return [];
      const allVentas = await base44.entities.Venta.filter({
        organization_id: effectiveOrgId,
        created_by_user_id: user.id
      }, '-created_date', 200);
      return allVentas;
    },
    enabled: !!effectiveOrgId && !!user?.id,
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes', effectiveOrgId],
    queryFn: () => base44.entities.Cliente.filter({
      organization_id: effectiveOrgId
    }),
    enabled: !!effectiveOrgId,
  });

  const getClienteName = (clienteId) => {
    const cliente = clientes.find(c => c.id === clienteId);
    return cliente?.nombre_completo || 'Cliente sin identificar';
  };

  // Calcular métricas personales
  const hoy = startOfDay(new Date());
  const inicioMes = startOfMonth(new Date());
  const finMes = endOfMonth(new Date());

  const ventasHoy = ventas.filter(v => {
    const fechaVenta = startOfDay(new Date(v.created_date));
    return fechaVenta.getTime() === hoy.getTime() && v.estado === 'pagada';
  });

  const ventasMes = ventas.filter(v => {
    const fechaVenta = new Date(v.created_date);
    return fechaVenta >= inicioMes && fechaVenta <= finMes && v.estado === 'pagada';
  });

  const totalHoy = ventasHoy.reduce((sum, v) => sum + (v.total || 0), 0);
  const totalMes = ventasMes.reduce((sum, v) => sum + (v.total || 0), 0);
  const ticketPromedio = ventasMes.length > 0 ? totalMes / ventasMes.length : 0;

  // Preparar datos para el gráfico (últimos 30 días)
  const ultimos30Dias = Array.from({ length: 30 }, (_, i) => {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - (29 - i));
    return startOfDay(fecha);
  });

  const datosGrafico = ultimos30Dias.map(fecha => {
    const ventasDia = ventas.filter(v => {
      const fechaVenta = startOfDay(new Date(v.created_date));
      return fechaVenta.getTime() === fecha.getTime() && v.estado === 'pagada';
    });
    const totalDia = ventasDia.reduce((sum, v) => sum + (v.total || 0), 0);
    return {
      fecha: format(fecha, 'dd MMM', { locale: es }),
      total: totalDia
    };
  });

  // Últimas 10 ventas
  const ultimasVentas = ventas
    .filter(v => v.estado === 'pagada')
    .slice(0, 10);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Cargando tus ventas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-xl flex items-center justify-center">
          <TrendingUp className="w-8 h-8 text-white" />
        </div>
        <div>
          <h1 className="text-4xl font-bold text-slate-900">Mis Ventas</h1>
          <p className="text-slate-600">Rendimiento personal como vendedor</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Ventas Hoy</p>
                <p className="text-3xl font-bold text-emerald-600">₡{totalHoy.toLocaleString()}</p>
                <p className="text-xs text-slate-500 mt-1">{ventasHoy.length} transacciones</p>
              </div>
              <DollarSign className="w-10 h-10 text-emerald-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Ventas del Mes</p>
                <p className="text-3xl font-bold text-blue-600">₡{totalMes.toLocaleString()}</p>
                <p className="text-xs text-slate-500 mt-1">{ventasMes.length} transacciones</p>
              </div>
              <ShoppingCart className="w-10 h-10 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 mb-1">Ticket Promedio</p>
                <p className="text-3xl font-bold text-purple-600">₡{ticketPromedio.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                <p className="text-xs text-slate-500 mt-1">Promedio del mes</p>
              </div>
              <TrendingUp className="w-10 h-10 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de ventas */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-500" />
            Mis Ventas en el Tiempo (últimos 30 días)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={datosGrafico}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="fecha" />
              <YAxis />
              <Tooltip
                formatter={(value) => `₡${value.toLocaleString()}`}
                labelStyle={{ color: '#64748b' }}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ fill: '#10b981' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Últimas ventas */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Mis Últimas Ventas</CardTitle>
        </CardHeader>
        <CardContent>
          {ultimasVentas.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No tienes ventas registradas todavía</p>
          ) : (
            <div className="space-y-3">
              {ultimasVentas.map((venta) => (
                <div
                  key={venta.id}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      ₡{venta.total?.toLocaleString()}
                    </p>
                    <p className="text-sm text-slate-500">
                      {venta.cliente_id ? getClienteName(venta.cliente_id) : 'Sin cliente'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-700">
                      {format(new Date(venta.created_date), "dd MMM yyyy", { locale: es })}
                    </p>
                    <p className="text-xs text-slate-500">
                      {format(new Date(venta.created_date), "HH:mm")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Microcopy informativo */}
      <Card className="border-0 shadow-lg bg-blue-50">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <TrendingUp className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900 mb-1">
                📊 Vista Personal de Rendimiento
              </p>
              <p className="text-xs text-blue-700">
                Estas métricas muestran únicamente tus ventas personales. Para reportes globales del negocio, consulta con tu administrador.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}