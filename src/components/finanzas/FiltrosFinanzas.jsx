import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calendar, Building2 } from 'lucide-react';

export default function FiltrosFinanzas({ 
  periodoPreset, 
  onPeriodoPresetChange,
  fechaDesde,
  fechaHasta,
  onFechaDesdeChange,
  onFechaHastaChange,
  sucursalId,
  onSucursalChange,
  sucursales = [],
  mostrarSelectorSucursal = true,
  sucursalFija = null
}) {
  const presetsPeriodo = [
    { value: 'mes', label: 'Este Mes' },
    { value: 'mes_anterior', label: 'Mes Anterior' },
    { value: 'trimestre', label: 'Trimestre Actual' },
    { value: 'año', label: 'Año Actual' },
    { value: 'personalizado', label: 'Personalizado' },
  ];

  return (
    <Card className="border-0 shadow-lg">
      <CardContent className="p-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Período */}
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <Label className="font-semibold">Período</Label>
            </div>
            <div className="flex gap-2 flex-wrap">
              {presetsPeriodo.map((preset) => (
                <Button
                  key={preset.value}
                  size="sm"
                  variant={periodoPreset === preset.value ? 'default' : 'outline'}
                  onClick={() => onPeriodoPresetChange(preset.value)}
                  className={periodoPreset === preset.value ? 'bg-emerald-600' : ''}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            {periodoPreset === 'personalizado' && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <Label className="text-xs">Desde</Label>
                  <Input
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => onFechaDesdeChange(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Hasta</Label>
                  <Input
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => onFechaHastaChange(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Sucursal */}
          {(mostrarSelectorSucursal || sucursalFija) && (
            <div className="lg:border-l lg:pl-6 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-4 h-4 text-slate-500" />
                <Label className="font-semibold">Sucursal</Label>
              </div>

              {sucursalFija ? (
                <Badge className="bg-blue-100 text-blue-700 border-0">
                  {sucursalFija}
                </Badge>
              ) : (
                <select
                  value={sucursalId || 'todas'}
                  onChange={(e) => onSucursalChange(e.target.value === 'todas' ? null : e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md"
                >
                  <option value="todas">Todas las Sucursales</option>
                  {sucursales.map((suc) => (
                    <option key={suc.id} value={suc.id}>
                      {suc.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}