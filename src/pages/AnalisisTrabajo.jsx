import React, { useState, useMemo } from 'react';
import PageGuard from '@/components/guards/PageGuard';
import { useOrgAdminMetrics } from '@/components/hooks/useOrgAdminMetrics';
import FiltroFechas from '@/components/admin-dashboard/FiltroFechas';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, BarChart2, AlertTriangle, Package } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function AnalisisTrabajo() {
  return (
    <PageGuard allowedRoles={['ORG_ADMIN']}>
      <AnalisisTrabajoContent />
    </PageGuard>
  );
}

function AnalisisTrabajoContent() {
  const [days, setDays] = useState(30);
  const { metrics, raw, isLoading } = useOrgAdminMetrics({ days });

  const analisisPorTipo = useMemo(() => {
    if (!raw.actividadesFiltradas) return {};
    
    const tipos = {};
    raw.actividadesFiltradas.forEach(a => {
      if (!tipos[a.tipo_actividad]) {
        tipos[a.tipo_actividad] = { count: 0, duraciones: [], subtipos: {} };
      }
      tipos[a.tipo_actividad].count++;
      if (a.duracion_minutos != null && a.estado === 'finalizada') {
        tipos[a.tipo_actividad].duraciones.push(a.duracion_minutos);
      }
      if (a.subtipo) {
        const sub = a.subtipo;
        if (!tipos[a.tipo_actividad].subtipos[sub]) {
          tipos[a.tipo_actividad].subtipos[sub] = { count: 0, duraciones: [] };
        }
        tipos[a.tipo_actividad].subtipos[sub].count++;
        if (a.duracion_minutos != null && a.estado === 'finalizada') {
          tipos[a.tipo_actividad].subtipos[sub].duraciones.push(a.duracion_minutos);
        }
      }
    });

    // Calcular promedios
    Object.values(tipos).forEach(tipo => {
      tipo.promedio = tipo.duraciones.length > 0
        ? tipo.duraciones.reduce((s, d) => s + d, 0) / tipo.duraciones.length
        : 0;
      
      Object.values(tipo.subtipos).forEach(sub => {
        sub.promedio = sub.duraciones.length > 0
          ? sub.duraciones.reduce((s, d) => s + d, 0) / sub.duraciones.length
          : 0;
      });
    });

    return tipos;
  }, [raw.actividadesFiltradas]);

  const analisisBloqueos = useMemo(() => {
    if (!raw.actividadesFiltradas) return {};
    
    const bloqueos = raw.actividadesFiltradas.filter(a => a.estado === 'bloqueada');
    const total = bloqueos.length;
    const porCausa = {};
    
    bloqueos.forEach(b => {
      const causa = b.causa_bloqueo || 'Sin especificar';
      porCausa[causa] = (porCausa[causa] || 0) + 1;
    });

    return { total, porCausa, porcentaje: raw.actividadesFiltradas.length > 0 ? (total / raw.actividadesFiltradas.length) * 100 : 0 };
  }, [raw.actividadesFiltradas]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-emerald-600" />
          <p className="text-slate-600">Cargando análisis...</p>
        </div>
      </div>
    );
  }

  const tipoLabels = {
    diagnostico: 'Diagnóstico',
    reparacion: 'Reparación',
    instalacion: 'Instalación',
    prueba: 'Prueba',
    limpieza: 'Limpieza',
    entrega: 'Entrega',
    otro: 'Otro'
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 mb-2 flex items-center gap-3">
            <BarChart2 className="w-10 h-10 text-indigo-500" />
            Análisis de Trabajo
          </h1>
          <p className="text-slate-500">Detección de cuellos de botella</p>
        </div>
        <FiltroFechas days={days} onChange={setDays} />
      </div>

      <Tabs defaultValue="tipo" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="tipo">Por Tipo</TabsTrigger>
          <TabsTrigger value="bloqueos">Bloqueos</TabsTrigger>
          <TabsTrigger value="inventario">Inventario</TabsTrigger>
        </TabsList>

        <TabsContent value="tipo" className="space-y-4">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Actividades por Tipo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(analisisPorTipo).map(([tipo, data]) => (
                <div key={tipo} className="p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-slate-900">{tipoLabels[tipo] || tipo}</h4>
                    <Badge variant="outline">{data.count} actividades</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-slate-500">Promedio de duración</p>
                      <p className="font-bold text-slate-900">{Math.round(data.promedio)} min</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Subtipos registrados</p>
                      <p className="font-bold text-slate-900">{Object.keys(data.subtipos).length}</p>
                    </div>
                  </div>
                  
                  {Object.keys(data.subtipos).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <p className="text-xs font-semibold text-slate-500 mb-2">Top 5 subtipos más lentos:</p>
                      {Object.entries(data.subtipos)
                        .sort((a, b) => b[1].promedio - a[1].promedio)
                        .slice(0, 5)
                        .map(([sub, subData]) => (
                          <div key={sub} className="flex items-center justify-between text-xs py-1">
                            <span className="text-slate-600">{sub}</span>
                            <span className="font-medium text-slate-900">{Math.round(subData.promedio)} min</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              ))}
              {Object.keys(analisisPorTipo).length === 0 && (
                <Alert>
                  <AlertDescription>No hay actividades para analizar en este periodo.</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bloqueos" className="space-y-4">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                Análisis de Bloqueos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-6 p-4 bg-orange-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600">Total de bloqueos</p>
                    <p className="text-3xl font-bold text-orange-600">{analisisBloqueos.total}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-600">% sobre total</p>
                    <p className="text-3xl font-bold text-orange-600">{analisisBloqueos.porcentaje.toFixed(1)}%</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900 mb-3">Bloqueos por causa:</p>
                {Object.entries(analisisBloqueos.porCausa || {})
                  .sort((a, b) => b[1] - a[1])
                  .map(([causa, count]) => {
                    const pct = analisisBloqueos.total > 0 ? (count / analisisBloqueos.total) * 100 : 0;
                    return (
                      <div key={causa} className="flex items-center justify-between p-3 bg-slate-50 rounded">
                        <span className="text-sm text-slate-700">{causa}</span>
                        <div className="flex items-center gap-3">
                          <Badge variant="outline">{count} casos</Badge>
                          <span className="text-sm font-bold text-slate-900">{pct.toFixed(0)}%</span>
                        </div>
                      </div>
                    );
                  })}
                {Object.keys(analisisBloqueos.porCausa || {}).length === 0 && (
                  <Alert>
                    <AlertDescription>No hay bloqueos registrados en este periodo.</AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventario" className="space-y-4">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-500" />
                Análisis de Inventario
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-3">Top 10 Repuestos Más Usados</h4>
                <div className="space-y-2">
                  {metrics.repuestosMasUsadosTop10?.map((item, idx) => {
                    const repuesto = raw.inventarioRaw?.find(i => i.id === item.inventario_id);
                    return (
                      <div key={item.inventario_id} className="flex items-center justify-between p-3 bg-slate-50 rounded">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>
                          <span className="text-sm text-slate-700">
                            {repuesto ? `${repuesto.nombre} (${repuesto.sku})` : item.inventario_id}
                          </span>
                        </div>
                        <Badge variant="outline">{item.count} usos</Badge>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-500" />
                  Repuestos Asociados a Bloqueos
                </h4>
                <div className="space-y-2">
                  {metrics.repuestosAsociadosABloqueosTop10?.map((item, idx) => {
                    const repuesto = raw.inventarioRaw?.find(i => i.id === item.inventario_id);
                    return (
                      <div key={item.inventario_id} className="flex items-center justify-between p-3 bg-orange-50 rounded">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-orange-400">#{idx + 1}</span>
                          <span className="text-sm text-slate-700">
                            {repuesto ? `${repuesto.nombre} (${repuesto.sku})` : item.inventario_id}
                          </span>
                        </div>
                        <Badge className="bg-orange-600 text-white">{item.count} bloqueos</Badge>
                      </div>
                    );
                  })}
                  {metrics.repuestosAsociadosABloqueosTop10?.length === 0 && (
                    <Alert>
                      <AlertDescription>No hay repuestos asociados a bloqueos.</AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}