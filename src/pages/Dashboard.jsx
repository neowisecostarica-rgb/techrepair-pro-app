import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import StatsCard from '../components/dashboard/StatsCard';
import QuickActions from '../components/dashboard/QuickActions';
import RecentOrders from '../components/dashboard/RecentOrders';
import NotificacionesPanel from '../components/notificaciones/NotificacionesPanel';
import { useNotificacionesAutomaticas } from '../components/notificaciones/useNotificacionesAutomaticas';
import { useUserAccount } from '../components/hooks/useOrgData';
import { 
  Wrench, 
  DollarSign, 
  Package, 
  Users,
  TrendingUp,
  AlertCircle,
  Recycle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

export default function Dashboard() {
  const { userAccount } = useUserAccount();
  
  const { data: ordenes = [] } = useQuery({
    queryKey: ['ordenes'],
    queryFn: () => base44.entities.OrdenTrabajo.list('-created_date', 100),
  });

  // Generar notificaciones automáticas
  useNotificacionesAutomaticas(userAccount);

  const { data: ventas = [] } = useQuery({
    queryKey: ['ventas'],
    queryFn: () => base44.entities.Venta.list('-created_date', 100),
  });

  const { data: inventario = [] } = useQuery({
    queryKey: ['inventario'],
    queryFn: () => base44.entities.Inventario.list(),
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => base44.entities.Cliente.list(),
  });

  const { data: reciclaje = [] } = useQuery({
    queryKey: ['reciclaje'],
    queryFn: () => base44.entities.Reciclaje.list('-created_date', 50),
  });

  // Calcular KPIs
  const ordenesAbiertas = ordenes.filter(o => !['entregado', 'cancelado'].includes(o.estado)).length;
  const ventasMes = ventas.filter(v => {
    const fecha = new Date(v.created_date);
    const hoy = new Date();
    return fecha.getMonth() === hoy.getMonth() && fecha.getFullYear() === hoy.getFullYear();
  });
  const ingresosMes = ventasMes.reduce((sum, v) => sum + (v.total || 0), 0);
  const itemsBajoStock = inventario.filter(i => i.cantidad_disponible <= i.punto_reorden).length;
  const carbonoEvitado = reciclaje.reduce((sum, r) => sum + (r.huella_carbono_evitada_kg || 0), 0);

  // Datos para gráficos
  const ventasPorDepartamento = [
    { name: 'Taller', value: ventas.filter(v => v.departamento === 'taller').length },
    { name: 'Retail', value: ventas.filter(v => v.departamento === 'retail').length },
    { name: 'Suministros', value: ventas.filter(v => v.departamento === 'suministros').length },
    { name: 'Servicios', value: ventas.filter(v => v.departamento === 'servicios').length },
  ];

  const COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b'];

  const ordenesUltimos7Dias = Array.from({ length: 7 }, (_, i) => {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - (6 - i));
    const ordenesDelDia = ordenes.filter(o => {
      const ordenFecha = new Date(o.created_date);
      return ordenFecha.toDateString() === fecha.toDateString();
    });
    return {
      fecha: fecha.toLocaleDateString('es', { weekday: 'short' }),
      cantidad: ordenesDelDia.length
    };
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">Dashboard Ejecutivo</h1>
        <p className="text-slate-500">Vista general de operaciones y métricas clave</p>
      </div>

      {/* Notificaciones */}
      <NotificacionesPanel userAccount={userAccount} />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Órdenes Activas"
          value={ordenesAbiertas}
          icon={Wrench}
          bgColor="bg-emerald-500"
          trend="up"
          trendValue="+12%"
        />
        <StatsCard
          title="Ingresos del Mes"
          value={`₡${ingresosMes.toLocaleString()}`}
          icon={DollarSign}
          bgColor="bg-blue-500"
          trend="up"
          trendValue="+8%"
        />
        <StatsCard
          title="Items Bajo Stock"
          value={itemsBajoStock}
          icon={Package}
          bgColor="bg-orange-500"
          trend={itemsBajoStock > 5 ? 'down' : 'up'}
        />
        <StatsCard
          title="CO₂ Evitado (kg)"
          value={carbonoEvitado.toFixed(1)}
          icon={Recycle}
          bgColor="bg-green-600"
          trend="up"
          trendValue="+15%"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-0 shadow-lg">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-lg font-semibold">Órdenes por Día (7 días)</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={ordenesUltimos7Dias}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="fecha" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                  }}
                />
                <Bar dataKey="cantidad" fill="url(#colorGradient)" radius={[8, 8, 0, 0]} />
                <defs>
                  <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#3b82f6" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-lg font-semibold">Ventas por Departamento</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={ventasPorDepartamento}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {ventasPorDepartamento.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentOrders orders={ordenes} />
        </div>
        <QuickActions />
      </div>
    </div>
  );
}