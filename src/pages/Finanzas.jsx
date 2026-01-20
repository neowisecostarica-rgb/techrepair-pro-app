import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageGuard from '@/components/guards/PageGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, DollarSign, ShoppingCart, Receipt, XCircle, CreditCard } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuthContext } from '@/components/contexts/AuthContext';
import FiltrosFinanzas from '@/components/finanzas/FiltrosFinanzas';

export default function Finanzas() {
  return (
    <PageGuard allowedRoles={['ORG_ADMIN', 'BRANCH_ADMIN']}>
      <FinanzasContent />
    </PageGuard>
  );
}

function FinanzasContent() {
  const { effectiveOrgId, userAccount, effectiveRole } = useAuthContext();
  const [periodoPreset, setPeriodoPreset] = useState('mes');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [sucursalId, setSucursalId] = useState(null);

  const isBranchAdmin = effectiveRole === 'BRANCH_ADMIN';
  const branchIdFijo = isBranchAdmin ? userAccount?.branch_id : null;

  // Calcular fechas según preset
  useEffect(() => {
    const hoy = new Date();
    let desde, hasta;

    switch (periodoPreset) {
      case 'mes':
        desde = startOfMonth(hoy);
        hasta = endOfMonth(hoy);
        break;
      case 'mes_anterior':
        const mesAnterior = subMonths(hoy, 1);
        desde = startOfMonth(mesAnterior);
        hasta = endOfMonth(mesAnterior);
        break;
      case 'trimestre':
        desde = startOfQuarter(hoy);
        hasta = endOfQuarter(hoy);
        break;
      case 'año':
        desde = startOfYear(hoy);
        hasta = endOfYear(hoy);
        break;
      case 'personalizado':
        return;
      default:
        desde = startOfMonth(hoy);
        hasta = endOfMonth(hoy);
    }

    setFechaDesde(desde.toISOString().split('T')[0]);
    setFechaHasta(hasta.toISOString().split('T')[0]);
  }, [periodoPreset]);

  // Ventas pagadas (facturación)
  const { data: ventasPagadas = [], isLoading } = useQuery({
    queryKey: ['finanzas-pagadas', effectiveOrgId, fechaDesde, fechaHasta, sucursalId, branchIdFijo],
    queryFn: async () => {
      let query = { organization_id: effectiveOrgId, estado: 'pagada' };
      
      if (branchIdFijo) {
        query.branch_id = branchIdFijo;
      } else if (sucursalId) {
        query.branch_id = sucursalId;
      }

      const allVentas = await base44.entities.Venta.filter(query);

      return allVentas.filter(v => {
        const ventaFecha = new Date(v.created_date);
        const desde = new Date(fechaDesde);
        const hasta = new Date(fechaHasta);
        hasta.setHours(23, 59, 59);
        return ventaFecha >= desde && ventaFecha <= hasta;
      });
    },
    enabled: !!effectiveOrgId && !!fechaDesde && !!fechaHasta
  });

  // Ventas anuladas
  const { data: ventasAnuladas = [] } = useQuery({
    queryKey: ['finanzas-anuladas', effectiveOrgId, fechaDesde, fechaHasta, sucursalId, branchIdFijo],
    queryFn: async () => {
      let query = { organization_id: effectiveOrgId, estado: 'anulada' };
      
      if (branchIdFijo) {
        query.branch_id = branchIdFijo;
      } else if (sucursalId) {
        query.branch_id = sucursalId;
      }

      const allVentas = await base44.entities.Venta.filter(query);

      return allVentas.filter(v => {
        const ventaFecha = new Date(v.created_date);
        const desde = new Date(fechaDesde);
        const hasta = new Date(fechaHasta);
        hasta.setHours(23, 59, 59);
        return ventaFecha >= desde && ventaFecha <= hasta;
      });
    },
    enabled: !!effectiveOrgId && !!fechaDesde && !!fechaHasta
  });

  // Mes anterior para comparativo
  const { data: ventasMesAnterior = [] } = useQuery({
    queryKey: ['finanzas-mes-anterior', effectiveOrgId, branchIdFijo, sucursalId],
    queryFn: async () => {
      const mesAnterior = subMonths(new Date(), 1);
      const desdeMA = startOfMonth(mesAnterior);
      const hastaMA = endOfMonth(mesAnterior);

      let query = { organization_id: effectiveOrgId, estado: 'pagada' };
      
      if (branchIdFijo) {
        query.branch_id = branchIdFijo;
      } else if (sucursalId) {
        query.branch_id = sucursalId;
      }

      const allVentas = await base44.entities.Venta.filter(query);

      return allVentas.filter(v => {
        const ventaFecha = new Date(v.created_date);
        return ventaFecha >= desdeMA && ventaFecha <= hastaMA;
      });
    },
    enabled: !!effectiveOrgId && periodoPreset === 'mes'
  });

  // Sucursales (para filtro y gráfico)
  const { data: sucursales = [] } = useQuery({
    queryKey: ['branches-finanzas', effectiveOrgId],
    queryFn: () => base44.entities.Branch.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId && !isBranchAdmin
  });

  // Cálculos KPIs
  const facturacionTotal = ventasPagadas.reduce((sum, v) => sum + v.total, 0);
  const numeroVentas = ventasPagadas.length;
  const ticketPromedio = numeroVentas > 0 ? facturacionTotal / numeroVentas : 0;
  const totalAnulado = ventasAnuladas.reduce((sum, v) => sum + v.total, 0);
  const porcentajeAnulado = facturacionTotal > 0 ? (totalAnulado / facturacionTotal * 100) : 0;

  // Crecimiento mes a mes
  const facturacionMesAnterior = ventasMesAnterior.reduce((sum, v) => sum + v.total, 0);
  const crecimiento = facturacionMesAnterior > 0 
    ? ((facturacionTotal - facturacionMesAnterior) / facturacionMesAnterior * 100) 
    : 0;

  // Ventas por día (gráfico línea)
  const ventasPorDia = {};
  ventasPagadas.forEach(v => {
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

  // Ventas por sucursal (gráfico barra)
  const ventasPorSucursal = {};
  if (!isBranchAdmin) {
    ventasPagadas.forEach(v => {
      const sucursal = sucursales.find(s => s.id === v.branch_id);
      const nombre = sucursal?.name || 'Sin sucursal';
      if (!ventasPorSucursal[nombre]) {
        ventasPorSucursal[nombre] = 0;
      }
      ventasPorSucursal[nombre] += v.total;
    });
  }

  const dataBarra = Object.keys(ventasPorSucursal)
    .map(nombre => ({
      nombre,
      total: ventasPorSucursal[nombre]
    }))
    .sort((a, b) => b.total - a.total);

  // Métodos de pago (gráfico pie)
  const metodosPago = {};
  ventasPagadas.forEach(v => {
    const metodo = v.metodo_pago || 'sin especificar';
    if (!metodosPago[metodo]) {
      metodosPago[metodo] = 0;
    }
    metodosPago[metodo] += v.total;
  });

  const dataPie = Object.keys(metodosPago).map(metodo => ({
    name: metodo.charAt(0).toUpperCase() + metodo.slice(1),
    value: metodosPago[metodo]
  }));

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6'];

  // Nombre sucursal fija (para BRANCH_ADMIN)
  const sucursalFijaNombre = isBranchAdmin && branchIdFijo
    ? (sucursales.find(s => s.id === branchIdFijo)?.name || 'Tu Sucursal')
    : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Cargando métricas financieras...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Finanzas — Dashboard Ejecutivo</h1>
          <p className="text-slate-600">Indicadores financieros estratégicos (solo lectura)</p>
        </div>
        {isBranchAdmin ? (
          <Badge className="bg-blue-100 text-blue-700 border-0">Tu Sucursal</Badge>
        ) : (
          <Badge className="bg-emerald-100 text-emerald-700 border-0">Organización Completa</Badge>
        )}
      </div>

      {/* Filtros */}
      <FiltrosFinanzas
        periodoPreset={periodoPreset}
        onPeriodoPresetChange={setPeriodoPreset}
        fechaDesde={fechaDesde}
        fechaHasta={fechaHasta}
        onFechaDesdeChange={setFechaDesde}
        onFechaHastaChange={setFechaHasta}
        sucursalId={sucursalId}
        onSucursalChange={setSucursalId}
        sucursales={sucursales}
        mostrarSelectorSucursal={!isBranchAdmin}
        sucursalFija={sucursalFijaNombre}
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {/* Facturación Total */}
        <Card className="border-0 shadow-xl bg-gradient-to-br from-emerald-50 to-emerald-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-600 mb-1">Facturación Total</p>
                <p className="text-2xl font-bold text-slate-900">₡{facturacionTotal.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Crecimiento */}
        {periodoPreset === 'mes' && (
          <Card className="border-0 shadow-xl bg-gradient-to-br from-blue-50 to-blue-100">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-xs text-slate-600 mb-1">Crecimiento</p>
                  <p className="text-2xl font-bold text-slate-900">{crecimiento.toFixed(1)}%</p>
                  <Badge className={`mt-1 ${crecimiento >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'} border-0 text-xs`}>
                    vs mes anterior
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Ventas Realizadas */}
        <Card className="border-0 shadow-xl bg-gradient-to-br from-purple-50 to-purple-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center">
                <ShoppingCart className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-600 mb-1">Ventas Realizadas</p>
                <p className="text-2xl font-bold text-slate-900">{numeroVentas}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ticket Promedio */}
        <Card className="border-0 shadow-xl bg-gradient-to-br from-indigo-50 to-indigo-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center">
                <Receipt className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-600 mb-1">Ticket Promedio</p>
                <p className="text-2xl font-bold text-slate-900">₡{ticketPromedio.toLocaleString(undefined, {maximumFractionDigits: 0})}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ventas Anuladas */}
        <Card className="border-0 shadow-xl bg-gradient-to-br from-red-50 to-red-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-red-600 rounded-xl flex items-center justify-center">
                <XCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-600 mb-1">Ventas Anuladas</p>
                <p className="text-2xl font-bold text-slate-900">₡{totalAnulado.toLocaleString()}</p>
                <Badge className={`mt-1 ${porcentajeAnulado > 5 ? 'bg-red-200 text-red-800' : 'bg-slate-100 text-slate-700'} border-0 text-xs`}>
                  {porcentajeAnulado.toFixed(1)}% del total
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Facturación en el Tiempo */}
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
              Facturación en el Tiempo
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
                  <p>No hay ventas en el período seleccionado</p>
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
              Distribución por Método de Pago
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
                  <Tooltip formatter={(value) => `₡${value.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-slate-400">
                <div className="text-center">
                  <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>No hay ventas en el período seleccionado</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ventas por Sucursal - Solo ORG_ADMIN */}
      {!isBranchAdmin && dataBarra.length > 0 && (
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-indigo-600" />
              Ventas por Sucursal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dataBarra} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" stroke="#64748b" style={{ fontSize: '12px' }} />
                <YAxis dataKey="nombre" type="category" stroke="#64748b" style={{ fontSize: '12px' }} width={100} />
                <Tooltip 
                  formatter={(value) => `₡${value.toLocaleString()}`}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
                />
                <Bar dataKey="total" fill="#10b981" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {numeroVentas === 0 && (
        <Card className="border-2 border-dashed border-slate-300">
          <CardContent className="p-12 text-center">
            <ShoppingCart className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">No hay ventas en el período seleccionado</h3>
            <p className="text-slate-500">Intenta ajustar los filtros de fecha o sucursal</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}