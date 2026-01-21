import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import StatsCard from './StatsCard';
import { DollarSign, TrendingUp, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { Button } from '@/components/ui/button';

export default function DashboardSales({ effectiveOrgId }) {
  const { data: ventas = [], isLoading: loadingVentas } = useQuery({
    queryKey: ['ventas', effectiveOrgId],
    queryFn: () => base44.entities.Venta.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
  });

  const { data: clientes = [], isLoading: loadingClientes } = useQuery({
    queryKey: ['clientes', effectiveOrgId],
    queryFn: () => base44.entities.Cliente.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
  });

  const { data: garantias = [] } = useQuery({
    queryKey: ['garantias', effectiveOrgId],
    queryFn: () => base44.entities.Garantia.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
  });

  if (loadingVentas || loadingClientes) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center">
        <p className="text-slate-500">Cargando métricas de ventas...</p>
      </div>
    );
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Sales today
  const ventasHoy = ventas.filter(v => {
    const createdDate = new Date(v.created_date);
    return createdDate >= today && v.estado === 'pagada';
  });
  const totalHoy = ventasHoy.reduce((sum, v) => sum + (v.total || 0), 0);

  // Sales this month
  const ventasMes = ventas.filter(v => {
    const createdDate = new Date(v.created_date);
    return createdDate >= firstDayOfMonth && v.estado === 'pagada';
  });
  const totalMes = ventasMes.reduce((sum, v) => sum + (v.total || 0), 0);

  // Avg ticket
  const avgTicket = ventasMes.length > 0
    ? totalMes / ventasMes.length
    : 0;

  // Active clients
  const clientesActivos = clientes.length;

  // Garantías por vencer (≤15 días)
  const garantiasPorVencer = garantias.filter(g => {
    if (g.estado !== 'ACTIVA') return false;
    const hoy = new Date();
    const fin = new Date(g.fecha_fin);
    const diffDays = Math.ceil((fin - hoy) / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 15;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">Dashboard de Ventas</h1>
        <p className="text-slate-500">Tus métricas de ventas y clientes</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatsCard
          title="Ventas Hoy"
          value={`₡${totalHoy.toLocaleString()}`}
          icon={DollarSign}
          bgColor="bg-emerald-500"
          subtitle={`${ventasHoy.length} transacciones`}
        />
        <StatsCard
          title="Ventas del Mes"
          value={`₡${totalMes.toLocaleString()}`}
          icon={TrendingUp}
          bgColor="bg-blue-500"
          subtitle={`${ventasMes.length} transacciones`}
        />
        <StatsCard
          title="Ticket Promedio"
          value={`₡${avgTicket.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          icon={DollarSign}
          bgColor="bg-purple-500"
        />
      </div>

      {/* KPI Garantías por Vencer */}
      {garantiasPorVencer.length > 0 && (
        <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-50 to-orange-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-1">⚠️ Oportunidad de Postventa</h3>
                <p className="text-3xl font-bold text-amber-600 mb-2">{garantiasPorVencer.length}</p>
                <p className="text-sm text-slate-600">Garantía{garantiasPorVencer.length !== 1 ? 's' : ''} por vencer en ≤15 días</p>
              </div>
              <Link to={createPageUrl('VentasGarantias') + '?porVencer=true'}>
                <Button className="bg-amber-600 hover:bg-amber-700">
                  Ver Garantías
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Clients */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Clientes Activos</h3>
              <p className="text-sm text-slate-500">{clientesActivos} clientes registrados</p>
            </div>
            <Link to={createPageUrl('Clientes')}>
              <Button size="sm">Ver Clientes</Button>
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div className="p-4 bg-emerald-50 rounded-lg">
              <Users className="w-8 h-8 text-emerald-600 mb-2" />
              <p className="text-2xl font-bold text-slate-900">{clientesActivos}</p>
              <p className="text-sm text-slate-600">Base de clientes</p>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg">
              <TrendingUp className="w-8 h-8 text-blue-600 mb-2" />
              <p className="text-2xl font-bold text-slate-900">{ventasMes.length}</p>
              <p className="text-sm text-slate-600">Ventas este mes</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}