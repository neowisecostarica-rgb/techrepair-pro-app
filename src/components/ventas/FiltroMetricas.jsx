import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calendar } from 'lucide-react';

export default function FiltroMetricas({ 
  rangoPreset, 
  onRangoPresetChange,
  fechaDesde,
  fechaHasta,
  onFechaDesdeChange,
  onFechaHastaChange,
  alcance,
  onAlcanceChange,
  mostrarAlcance = true
}) {
  const presetsRango = [
    { value: 'hoy', label: 'Hoy' },
    { value: 'semana', label: 'Esta Semana' },
    { value: 'mes', label: 'Este Mes' },
    { value: 'personalizado', label: 'Personalizado' },
  ];

  return (
    <Card className="border-0 shadow-lg">
      <CardContent className="p-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Rango de Fechas */}
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <Label className="font-semibold">Período</Label>
            </div>
            <div className="flex gap-2 flex-wrap">
              {presetsRango.map((preset) => (
                <Button
                  key={preset.value}
                  size="sm"
                  variant={rangoPreset === preset.value ? 'default' : 'outline'}
                  onClick={() => onRangoPresetChange(preset.value)}
                  className={rangoPreset === preset.value ? 'bg-emerald-600' : ''}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            {rangoPreset === 'personalizado' && (
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

          {/* Alcance (Yo / Equipo) */}
          {mostrarAlcance && (
            <div className="lg:border-l lg:pl-6 space-y-3">
              <Label className="font-semibold">Alcance</Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={alcance === 'yo' ? 'default' : 'outline'}
                  onClick={() => onAlcanceChange('yo')}
                  className={alcance === 'yo' ? 'bg-blue-600' : ''}
                >
                  Yo
                </Button>
                <Button
                  size="sm"
                  variant={alcance === 'equipo' ? 'default' : 'outline'}
                  onClick={() => onAlcanceChange('equipo')}
                  className={alcance === 'equipo' ? 'bg-blue-600' : ''}
                >
                  Equipo (Sucursal)
                </Button>
              </div>
              {alcance === 'equipo' && (
                <p className="text-xs text-slate-500 pt-1">
                  Mostrando ventas de todos los usuarios de tu sucursal
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}