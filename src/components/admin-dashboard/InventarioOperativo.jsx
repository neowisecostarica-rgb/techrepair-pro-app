import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function InventarioOperativo({ metrics, inventarioRaw }) {
  const getNombreRepuesto = (id) => {
    const item = inventarioRaw?.find(i => i.id === id);
    return item ? `${item.nombre} (${item.sku})` : id;
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="border-b border-slate-100">
        <CardTitle className="flex items-center gap-2">
          <Package className="w-5 h-5 text-indigo-500" />
          Inventario Operativo
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-6">
          {/* Repuestos más usados */}
          <div>
            <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-500" />
              Top 10 Repuestos Más Usados
            </h4>
            <div className="space-y-2">
              {metrics.repuestosMasUsadosTop10?.slice(0, 5).map((item, idx) => (
                <div key={item.inventario_id} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>
                    <span className="text-sm text-slate-700">{getNombreRepuesto(item.inventario_id)}</span>
                  </div>
                  <Badge variant="outline">{item.count} usos</Badge>
                </div>
              ))}
              {metrics.repuestosMasUsadosTop10?.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">Sin datos de uso</p>
              )}
            </div>
          </div>

          {/* Repuestos asociados a bloqueos */}
          <div>
            <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              Repuestos con Bloqueos Asociados
            </h4>
            <div className="space-y-2">
              {metrics.repuestosAsociadosABloqueosTop10?.slice(0, 5).map((item, idx) => (
                <div key={item.inventario_id} className="flex items-center justify-between p-2 bg-orange-50 rounded">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-orange-400">#{idx + 1}</span>
                    <span className="text-sm text-slate-700">{getNombreRepuesto(item.inventario_id)}</span>
                  </div>
                  <Badge className="bg-orange-600 text-white">{item.count} bloqueos</Badge>
                </div>
              ))}
              {metrics.repuestosAsociadosABloqueosTop10?.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">Sin bloqueos asociados</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}