import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, DollarSign, ShoppingCart, BarChart2 } from 'lucide-react';

export default function GlobalSalesMetrics({ organizations }) {
  const { data: allVentas = [], isLoading } = useQuery({
    queryKey: ['super-admin-ventas'],
    queryFn: () => base44.entities.Venta.filter({ estado: 'pagada' }),
    enabled: organizations?.length > 0,
    staleTime: 60000,
  });

  const today = new Date().toISOString().split('T')[0];
  const ventasHoy = allVentas.filter(v => v.created_date?.startsWith(today));
  const ingresoHoy = ventasHoy.reduce((s, v) => s + (v.total || 0), 0);
  const ingresoTotal = allVentas.reduce((s, v) => s + (v.total || 0), 0);

  // Agrupar por organización
  const ingresoPorOrg = organizations.map(org => ({
    name: org.name,
    total: allVentas
      .filter(v => v.organization_id === org.id)
      .reduce((s, v) => s + (v.total || 0), 0),
  })).sort((a, b) => b.total - a.total).slice(0, 5);

  const formatMoney = (val) =>
    val >= 1000000
      ? `${(val / 1000000).toFixed(1)}M`
      : val >= 1000
      ? `${(val / 1000).toFixed(1)}K`
      : val.toFixed(0);

  if (isLoading) {
    return (
      <Card className="border-0 shadow-xl">
        <CardContent className="p-6">
          <div className="h-6 bg-slate-100 rounded animate-pulse w-48 mb-4" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-xl">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-emerald-600" />
          Global Sales Metrics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-emerald-50 rounded-xl">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingCart className="w-4 h-4 text-emerald-600" />
              <p className="text-xs font-semibold text-slate-600">Ventas Hoy (Global)</p>
            </div>
            <p className="text-2xl font-bold text-slate-900">{ventasHoy.length}</p>
            <p className="text-xs text-emerald-700 mt-1">{formatMoney(ingresoHoy)} en ingresos</p>
          </div>

          <div className="p-4 bg-blue-50 rounded-xl">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-blue-600" />
              <p className="text-xs font-semibold text-slate-600">Ingresos Totales (Global)</p>
            </div>
            <p className="text-2xl font-bold text-slate-900">{formatMoney(ingresoTotal)}</p>
            <p className="text-xs text-slate-500 mt-1">{allVentas.length} ventas en total</p>
          </div>

          <div className="p-4 bg-purple-50 rounded-xl">
            <div className="flex items-center gap-2 mb-1">
              <BarChart2 className="w-4 h-4 text-purple-600" />
              <p className="text-xs font-semibold text-slate-600">Ticket Promedio (Global)</p>
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {allVentas.length > 0 ? formatMoney(ingresoTotal / allVentas.length) : '—'}
            </p>
          </div>
        </div>

        {ingresoPorOrg.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Top Orgs por Ingresos</p>
            <div className="space-y-2">
              {ingresoPorOrg.map((org, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                  <span className="text-sm text-slate-700">{org.name}</span>
                  <span className="text-sm font-semibold text-slate-900">{formatMoney(org.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}