import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Settings, Percent, FileText, CheckSquare } from 'lucide-react';

export default function ConfiguracionPanel() {
  const [rangoDescuento, setRangoDescuento] = useState(15);
  const [modulosActivos, setModulosActivos] = useState({
    reciclaje: true,
    calidad: true,
    agenda: true,
  });

  const handleGuardarConfig = () => {
    // En una implementación real, esto guardaría en una entidad de Configuración
    alert('Configuración guardada (en demo)');
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-900">Configuración del Negocio</h2>

      {/* Políticas Comerciales */}
      <Card className="border-0 shadow-md">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-lg flex items-center gap-2">
            <Percent className="w-5 h-5 text-emerald-600" />
            Políticas Comerciales
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label>Descuento máximo sin aprobación (%)</Label>
            <Input
              type="number"
              value={rangoDescuento}
              onChange={(e) => setRangoDescuento(e.target.value)}
              min="0"
              max="100"
            />
            <p className="text-xs text-slate-500">
              Descuentos superiores requerirán aprobación de Admin
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Módulos del Sistema */}
      <Card className="border-0 shadow-md">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-600" />
            Módulos del Sistema
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <div>
              <p className="font-medium text-slate-900">Reciclaje</p>
              <p className="text-xs text-slate-500">Gestión de equipos reciclados</p>
            </div>
            <Switch
              checked={modulosActivos.reciclaje}
              onCheckedChange={(checked) => setModulosActivos({ ...modulosActivos, reciclaje: checked })}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <div>
              <p className="font-medium text-slate-900">Calidad</p>
              <p className="text-xs text-slate-500">No conformidades y mejora continua</p>
            </div>
            <Switch
              checked={modulosActivos.calidad}
              onCheckedChange={(checked) => setModulosActivos({ ...modulosActivos, calidad: checked })}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <div>
              <p className="font-medium text-slate-900">Agenda</p>
              <p className="text-xs text-slate-500">Citas y programación</p>
            </div>
            <Switch
              checked={modulosActivos.agenda}
              onCheckedChange={(checked) => setModulosActivos({ ...modulosActivos, agenda: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Plantillas */}
      <Card className="border-0 shadow-md">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-600" />
            Plantillas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <p className="text-sm text-slate-600 mb-4">
            Configura plantillas para mensajes, documentos y comunicaciones
          </p>
          <Button variant="outline">
            <FileText className="w-4 h-4 mr-2" />
            Gestionar Plantillas
          </Button>
        </CardContent>
      </Card>

      {/* Checklists */}
      <Card className="border-0 shadow-md">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-orange-600" />
            Checklists Técnicos
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <p className="text-sm text-slate-600 mb-4">
            Configura checklists personalizados para diagnósticos
          </p>
          <Button variant="outline">
            <CheckSquare className="w-4 h-4 mr-2" />
            Gestionar Checklists
          </Button>
        </CardContent>
      </Card>

      <Button onClick={handleGuardarConfig} className="w-full bg-gradient-to-r from-emerald-500 to-blue-500">
        Guardar Configuración
      </Button>
    </div>
  );
}