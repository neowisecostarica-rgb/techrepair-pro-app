import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { getIdentityOrganization } from '@/api/identity';
import PageGuard from '@/components/guards/PageGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DollarSign, Package, AlertTriangle, TrendingUp } from 'lucide-react';
import { useAuthContext } from '@/components/contexts/AuthContext';

export default function InventarioInvertido() {
  return (
    <PageGuard allowedRoles={['ORG_ADMIN', 'BRANCH_ADMIN']}>
      <InventarioInvertidoContent />
    </PageGuard>
  );
}

function InventarioInvertidoContent() {
  const { effectiveOrgId, effectiveRole, userAccount } = useAuthContext();

  const isBranchRestricted = effectiveRole === 'BRANCH_ADMIN';
  const branchIdFijo = isBranchRestricted ? userAccount?.branch_id : null;

  // Query inventario
  const { data: inventario = [], isLoading } = useQuery({
    queryKey: ['inventario-financiero', effectiveOrgId, branchIdFijo],
    queryFn: async () => {
      let query = { organization_id: effectiveOrgId };
      if (branchIdFijo) query.branch_id = branchIdFijo;

      return base44.entities.Inventario.filter(query);
    },
    enabled: !!effectiveOrgId,
    staleTime: 300000
  });

  // Query organization (config dinero dormido)
  const { data: organization } = useQuery({
    queryKey: ['org-config', effectiveOrgId],
    queryFn: async () => {
      const result = await getIdentityOrganization(effectiveOrgId);
      return result.organization;
    },
    enabled: !!effectiveOrgId,
    staleTime: 600000
  });

  // Query categorías
  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias-inventario', effectiveOrgId],
    queryFn: () => base44.entities.CategoriaInventario.filter({ organization_id: effectiveOrgId }),
    enabled: !!effectiveOrgId,
    staleTime: 600000
  });

  // Cálculos
  const metricas = useMemo(() => {
    const diasDormido = organization?.inventario_config?.dias_dinero_dormido || 90;
    const hoy = new Date();

    let totalInvertido = 0;
    let dineroDormido = 0;
    let sinCosto = [];
    let stockNegativo = [];
    let itemsDormidos = [];

    inventario.forEach(item => {
      const costo = item.costo_unitario || 0;
      const stock = item.cantidad_disponible || 0;
      const valor = stock * costo;

      // Total invertido
      if (costo > 0 && stock > 0) {
        totalInvertido += valor;
      }

      // Sin costo
      if (!costo || costo === 0) {
        sinCosto.push(item);
      }

      // Stock negativo
      if (stock < 0) {
        stockNegativo.push(item);
      }

      // Dinero dormido
      if (item.fecha_ultimo_movimiento && costo > 0 && stock > 0) {
        const diasSinMovimiento = (hoy - new Date(item.fecha_ultimo_movimiento)) / (1000 * 60 * 60 * 24);
        if (diasSinMovimiento > diasDormido) {
          dineroDormido += valor;
          itemsDormidos.push({ ...item, valor, diasSinMovimiento });
        }
      }
    });

    // Agrupar por categoría
    const porCategoria = {};
    inventario.forEach(item => {
      const cat = categorias.find(c => c.id === item.categoria_id);
      const catNombre = cat?.nombre || 'Sin categoría';
      const valor = (item.cantidad_disponible || 0) * (item.costo_unitario || 0);

      if (!porCategoria[catNombre]) {
        porCategoria[catNombre] = 0;
      }
      if (item.costo_unitario > 0 && item.cantidad_disponible > 0) {
        porCategoria[catNombre] += valor;
      }
    });

    // Top 10 productos con más inversión
    const top10 = inventario
      .map(item => ({
        ...item,
        valor: (item.cantidad_disponible || 0) * (item.costo_unitario || 0)
      }))
      .filter(item => item.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);

    const porcentajeDormido = totalInvertido > 0 ? (dineroDormido / totalInvertido) * 100 : 0;

    return {
      totalInvertido,
      dineroDormido,
      porcentajeDormido,
      sinCosto,
      stockNegativo,
      itemsDormidos,
      porCategoria,
      top10,
      diasDormido
    };
  }, [inventario, categorias, organization]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Cargando inventario invertido...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Inventario Invertido</h1>
        <p className="text-slate-600">Capital inmovilizado en stock y análisis de rotación</p>
      </div>

      {/* Alertas */}
      {(metricas.sinCosto.length > 0 || metricas.stockNegativo.length > 0 || metricas.porcentajeDormido > 30) && (
        <div className="space-y-3">
          {metricas.sinCosto.length > 0 && (
            <Alert className="bg-amber-50 border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                <strong>⚠️ {metricas.sinCosto.length} productos sin costo definido</strong>
                <p className="text-sm mt-1">Estos productos no se incluyen en el cálculo de inversión</p>
              </AlertDescription>
            </Alert>
          )}

          {metricas.stockNegativo.length > 0 && (
            <Alert className="bg-red-50 border-red-200">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <AlertDescription className="text-red-800">
                <strong>🔴 {metricas.stockNegativo.length} productos con stock negativo</strong>
                <p className="text-sm mt-1">Requiere auditoría de inventario</p>
              </AlertDescription>
            </Alert>
          )}

          {metricas.porcentajeDormido > 30 && (
            <Alert className="bg-orange-50 border-orange-200">
              <AlertTriangle className="w-4 h-4 text-orange-600" />
              <AlertDescription className="text-orange-800">
                <strong>📦 Alto nivel de inventario dormido ({metricas.porcentajeDormido.toFixed(1)}%)</strong>
                <p className="text-sm mt-1">Considera promociones o liquidación de stock lento</p>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-0 shadow-xl bg-gradient-to-br from-emerald-50 to-emerald-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-600 mb-1">Total Invertido</p>
                <p className="text-2xl font-bold text-slate-900">₡{metricas.totalInvertido.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl bg-gradient-to-br from-orange-50 to-orange-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-orange-600 rounded-xl flex items-center justify-center">
                <Package className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-600 mb-1">Dinero Dormido (&gt;{metricas.diasDormido}d)</p>
                <p className="text-2xl font-bold text-slate-900">₡{metricas.dineroDormido.toLocaleString()}</p>
                <Badge className={`mt-1 ${metricas.porcentajeDormido > 30 ? 'bg-red-200 text-red-800' : 'bg-slate-100 text-slate-700'} border-0 text-xs`}>
                  {metricas.porcentajeDormido.toFixed(1)}% del total
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-xl bg-gradient-to-br from-blue-50 to-blue-100">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-600 mb-1">Productos en Stock</p>
                <p className="text-2xl font-bold text-slate-900">{inventario.length}</p>
                <Badge className="bg-blue-200 text-blue-800 border-0 text-xs mt-1">
                  {metricas.itemsDormidos.length} dormidos
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Por categoría */}
      <Card className="border-0 shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            📊 Inversión por Categoría
          </CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(metricas.porCategoria).length === 0 ? (
            <p className="text-center text-slate-500 py-8">No hay datos por categoría</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(metricas.porCategoria)
                .sort((a, b) => b[1] - a[1])
                .map(([categoria, valor]) => {
                  const porcentaje = (valor / metricas.totalInvertido) * 100;
                  return (
                    <div key={categoria} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg">
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900">{categoria}</p>
                        <div className="w-full bg-slate-200 rounded-full h-2 mt-2">
                          <div
                            className="bg-emerald-600 h-2 rounded-full"
                            style={{ width: `${porcentaje}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-lg font-bold text-slate-900">₡{valor.toLocaleString()}</p>
                        <p className="text-xs text-slate-500">{porcentaje.toFixed(1)}%</p>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top 10 */}
      <Card className="border-0 shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🏆 Top 10 Productos con Más Inversión
          </CardTitle>
        </CardHeader>
        <CardContent>
          {metricas.top10.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No hay productos con inversión</p>
          ) : (
            <div className="space-y-2">
              {metricas.top10.map((item, idx) => (
                <div key={item.id} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <Badge className="bg-slate-100 text-slate-700 border-0">#{idx + 1}</Badge>
                    <div>
                      <p className="font-semibold text-slate-900">{item.nombre}</p>
                      <p className="text-sm text-slate-500">
                        {item.cantidad_disponible} unidades × ₡{item.costo_unitario.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <p className="text-lg font-bold text-emerald-600">
                    ₡{item.valor.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Items dormidos */}
      {metricas.itemsDormidos.length > 0 && (
        <Card className="border-0 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              😴 Productos Dormidos (&gt;{metricas.diasDormido} días sin movimiento)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {metricas.itemsDormidos
                .sort((a, b) => b.diasSinMovimiento - a.diasSinMovimiento)
                .map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 border border-orange-200 rounded-lg bg-orange-50">
                    <div>
                      <p className="font-semibold text-slate-900">{item.nombre}</p>
                      <p className="text-sm text-slate-600">
                        {Math.floor(item.diasSinMovimiento)} días sin movimiento · ₡{item.valor.toLocaleString()} invertido
                      </p>
                    </div>
                    <Badge className="bg-orange-200 text-orange-800 border-0">
                      Dormido
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
