import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageGuard from '@/components/guards/PageGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, DollarSign, ShoppingCart, Receipt, CreditCard, Shield } from 'lucide-react';
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuthContext } from '@/components/contexts/AuthContext';
import FiltroMetricas from '@/components/ventas/FiltroMetricas';

export default function VentasMetricas() {
  return (
    <PageGuard allowedRoles={['SALES', 'ORG_ADMIN', 'BRANCH_ADMIN']}>
      <VentasMetricasContent />
    </PageGuard>
  );
}

function VentasMetricasContent() {
  const { effectiveOrgId, userAccount, user } = useAuthContext();
  const [rangoPreset, setRangoPreset] = useState('mes');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [alcance, setAlcance] = useState('yo');

  // Calcular fechas según preset
  useEffect(() => {
    const hoy = new Date();
    let desde, hasta;

    switch (rangoPreset) {
      case 'hoy':
        desde = startOfDay(hoy);
        hasta = endOfDay(hoy);
        break;
      case 'semana':
        desde = startOfWeek(hoy, { weekStartsOn: 1 });
        hasta = endOfWeek(hoy, { weekStartsOn: 1 });
        break;
      case 'mes':
        desde = startOfMonth(hoy);
        hasta = endOfMonth(hoy);
        break;
      case 'personalizado':
        return;
      default:
        desde = startOfMonth(hoy);
        hasta = endOfMonth(hoy);
    }

    setFechaDesde(desde.toISOString().split('T')[0]);
    setFechaHasta(hasta.toISOString().split('T')[0]);
  }, [rangoPreset]);

  const { data: ventas = [], isLoading } = useQuery({
    queryKey: ['ventas-metricas', effectiveOrgId, fechaDesde, fechaHasta, alcance, userAccount?.branch_id, user?.id],
    queryFn: async () => {
      let query = { organization_id: effectiveOrgId };

      // Filtrar por alcance
      if (alcance === 'yo') {
        query.created_by_user_id = user?.id;
      } else if (alcance === 'equipo' && userAccount?.branch_id) {
        query.branch_id = userAccount.branch_id;
      }

      const allVentas = await base44.entities.Venta.filter(query);

      // Filtrar por fecha
      return allVentas.filter(v => {
        if (v.estado === 'anulada') return false;
        const ventaFecha = new Date(v.created_date);
        const desde = new Date(fechaDesde);
        const hasta = new Date(fechaHasta);
        hasta.setHours(23, 59, 59);
        return ventaFecha >= desde && ventaFecha <= hasta;
      });
    },
    enabled: !!effectiveOrgId && !!fechaDesde && !!fechaHasta
  });

  const { data: cotizaciones = [] } = useQuery({
    queryKey: ['cotizaciones-metricas', effectiveOrgId, alcance, user?.id],
    queryFn: async () => {
      let query = { organization_id: effectiveOrgId };
      if (alcance === 'yo') {
        query.vendedor_id = user?.id;
      }
      return await base44.entities.Cotizacion.filter(query);
    },
    enabled: !!effectiveOrgId
  });

  const { data: garantias = [] } = useQuery({
    queryKey: ['garantias-metricas', effectiveOrgId],
    queryFn: () => base44.entities.Garantia.filter({
      organization_id: effectiveOrgId,
      estado: 'ACTIVA'
    }),
    enabled: !!effectiveOrgId
  });

  // Cálculos
  const totalVentas = ventas.reduce((sum, v) => sum + v.total, 0);
  const numeroVentas = ventas.length;
  const ticketPromedio = numeroVentas > 0 ? totalVentas / numeroVentas : 0;

  // Ventas por día (para gráfico de línea)
  const ventasPorDia = {};
  ventas.forEach(v => {
    const fecha = format(new Date(v.created_date), 'yyyy-MM-dd');
    if (!ventasPorDia[fecha]) {
      ventasPorDia[fecha] = 0;
    }
    ventasPorDia[fecha] += v.total;
  });

  const dataLinea = Object.keys(ventasPorDia)
    .sort()
    .map(fecha => ({
      fecha: format(new Date(fecha), 'dd MMM', { locale: es }),
      total: ventasPorDia[fecha]
    }));

  // Métodos de pago (para pie chart)
  const metodosPago = {};
  ventas.forEach(v => {
    const metodo = v.metodo_pago || 'sin especificar';
    if (!metodosPago[metodo]) {
      metodosPago[metodo] = 0;
    }
    metodosPago[metodo] += 1;
  });

  const dataPie = Object.keys(metodosPago).map(metodo => ({
    name: metodo.charAt(0).toUpperCase() + metodo.slice(1),
    value: metodosPago[metodo]
  }));

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6'];

  // Ratio cotizaciones
  const cotizacionesEnviadas = cotizaciones.filter(c => ['enviada', 'aprobada'].includes(c.estado)).length;
  const cotizacionesAprobadas = cotizaciones.filter(c => c.estado === 'aprobada').length;
  const ratioCotizaciones = cotizacionesEnviadas > 0 
    ? ((cotizacionesAprobadas / cotizacionesEnviadas) * 100).toFixed(0) 
    : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Cargando métricas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Métricas de Ventas</h1>
          <p className="text-slate-600">Indicadores operativos para seguimiento diario (solo lectura)</p>
        </div>
      </div>

      {/* Filtros */}
      <FiltroMetricas
        rangoPreset={rangoPreset}
        onRangoPresetChange={setRangoPreset}
        fechaDesde={fechaDesde}
        fechaHasta={fechaHasta}
        onFechaDesdeChange={setFechaDesde}
        onFechaHastaChange={setFechaHasta}
        alcance={alcance}
        onAlcanceChange={setAlcance}
      />

      {/* Cards Principales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-0 shadow-xl bg-gradient-to-br from-emerald-50 to-emerald-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Total Cobrado</p>
                <p className="text-2xl font-bold text-slate-900">₡{totalVentas.toLocaleString()}</p>
              </div>
            </div>
            <Badge variant="outline" className="capitalize text-xs">
              {alcance === 'yo' ? 'Mis ventas' : 'Equipo'}
            </Badge>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl bg-gradient-to-br from-blue-50 to-blue-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
                <ShoppingCart className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Número de Ventas</p>
                <p className="text-2xl font-bold text-slate-900">{numeroVentas}</p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs">
              {rangoPreset === 'hoy' ? 'Hoy' : rangoPreset === 'semana' ? 'Esta semana' : rangoPreset === 'mes' ? 'Este mes' : 'Período seleccionado'}
            </Badge>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl bg-gradient-to-br from-purple-50 to-purple-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center">
                <Receipt className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-slate-600">Ticket Promedio</p>
                <p className="text-2xl font-bold text-slate-900">₡{ticketPromedio.toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs">
              Por venta
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ventas en el Tiempo */}
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              Ventas en el Tiempo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dataLinea.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dataLinea}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="fecha" stroke="#64748b" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
                  <Tooltip 
                    formatter={(value) => `₡${value.toLocaleString()}`}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
                  />
                  <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-slate-400">
                <div className="text-center">
                  <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>Aún no hay ventas en este período</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Métodos de Pago */}
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-600" />
              Métodos de Pago
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dataPie.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={dataPie}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {dataPie.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-slate-400">
                <div className="text-center">
                  <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>Aún no hay ventas en este período</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Indicadores Secundarios */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Ratio Cotizaciones */}
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg">Conversión de Cotizaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-emerald-600">{ratioCotizaciones}%</p>
                <p className="text-sm text-slate-600">Aprobadas de {cotizacionesEnviadas} enviadas</p>
              </div>
              <div className="text-right text-sm text-slate-500">
                <p>{cotizacionesAprobadas} aprobadas</p>
                <p>{cotizacionesEnviadas - cotizacionesAprobadas} pendientes/rechazadas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Garantías Activas */}
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-600" />
              Garantías Activas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold text-indigo-600">{garantias.length}</p>
                <p className="text-sm text-slate-600">Vigentes actualmente</p>
              </div>
              <Shield className="w-16 h-16 text-indigo-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Empty State */}
      {numeroVentas === 0 && (
        <Card className="border-2 border-dashed border-slate-300">
          <CardContent className="p-12 text-center">
            <ShoppingCart className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">Aún no hay ventas en este período</h3>
            <p className="text-slate-500">Intenta ajustar los filtros o realizar tu primera venta</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}