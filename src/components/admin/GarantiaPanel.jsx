import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getIdentityOrganization, updateIdentityOrganization } from '@/api/identity';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Shield, Save, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function GarantiaPanel({ organizationId }) {
  const [textoVentas, setTextoVentas] = useState('');
  const [textoReparaciones, setTextoReparaciones] = useState('');
  const [mesesVigenciaVentas, setMesesVigenciaVentas] = useState(12);
  const [mesesVigenciaReparaciones, setMesesVigenciaReparaciones] = useState(3);
  const [editando, setEditando] = useState(false);
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ['config-garantia', organizationId],
    queryFn: async () => {
      // Usar Organization para almacenar config de garantía
      const { organization: org } = await getIdentityOrganization(organizationId);
      return org?.garantia_config || null;
    },
    enabled: !!organizationId,
  });

  React.useEffect(() => {
    if (config) {
      setTextoVentas(config.texto_ventas || '');
      setTextoReparaciones(config.texto_reparaciones || '');
      setMesesVigenciaVentas(config.meses_vigencia_ventas || 12);
      setMesesVigenciaReparaciones(config.meses_vigencia_reparaciones || 3);
    }
  }, [config]);

  const guardarMutation = useMutation({
    mutationFn: async (configData) => {
      await updateIdentityOrganization(organizationId, {
        garantia_config: configData
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config-garantia'] });
      setEditando(false);
      alert('Configuración de garantía guardada');
    },
  });

  const handleGuardar = () => {
    if (!textoVentas.trim() || !textoReparaciones.trim()) {
      alert('Ambos textos de garantía son requeridos');
      return;
    }

    guardarMutation.mutate({
      texto_ventas: textoVentas,
      texto_reparaciones: textoReparaciones,
      meses_vigencia_ventas: mesesVigenciaVentas,
      meses_vigencia_reparaciones: mesesVigenciaReparaciones,
      actualizado_at: new Date().toISOString()
    });
  };

  if (isLoading) {
    return <div className="text-slate-500">Cargando configuración...</div>;
  }

  return (
    <Card className="border-0 shadow-md">
      <CardHeader className="border-b border-slate-100">
        <CardTitle className="text-lg flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-600" />
          Garantía del Taller
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        <Alert className="bg-blue-50 border-blue-200">
          <AlertCircle className="w-4 h-4 text-blue-600" />
          <AlertDescription className="text-sm text-blue-900">
            Los textos configurados aquí se usarán automáticamente al emitir garantías.
            Los cambios NO afectan garantías ya emitidas (inmutables).
          </AlertDescription>
        </Alert>

        {/* Garantía por Venta de Productos */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">Garantía por Venta de Productos</Label>
            {!editando && config && (
              <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
                Editar
              </Button>
            )}
          </div>
          
          <div className="space-y-2">
            <Label className="text-sm">Vigencia (meses)</Label>
            <Input
              type="number"
              value={mesesVigenciaVentas}
              onChange={(e) => setMesesVigenciaVentas(parseInt(e.target.value) || 1)}
              min="1"
              max="60"
              disabled={!editando && config}
              className="w-32"
            />
          </div>

          <Textarea
            value={textoVentas}
            onChange={(e) => setTextoVentas(e.target.value)}
            placeholder="Ej: Esta garantía cubre defectos de fabricación y materiales por un período de [X] meses..."
            rows={8}
            disabled={!editando && config}
            className="font-mono text-sm"
          />
          <p className="text-xs text-slate-500">
            Este texto aparecerá en la boleta de garantía de productos vendidos
          </p>
        </div>

        {/* Garantía por Reparación */}
        <div className="space-y-3 pt-4 border-t">
          <Label className="text-base font-semibold">Garantía por Reparación</Label>
          
          <div className="space-y-2">
            <Label className="text-sm">Vigencia (meses)</Label>
            <Input
              type="number"
              value={mesesVigenciaReparaciones}
              onChange={(e) => setMesesVigenciaReparaciones(parseInt(e.target.value) || 1)}
              min="1"
              max="60"
              disabled={!editando && config}
              className="w-32"
            />
          </div>

          <Textarea
            value={textoReparaciones}
            onChange={(e) => setTextoReparaciones(e.target.value)}
            placeholder="Ej: Esta garantía cubre el trabajo realizado y los repuestos instalados por un período de [X] meses..."
            rows={8}
            disabled={!editando && config}
            className="font-mono text-sm"
          />
          <p className="text-xs text-slate-500">
            Este texto aparecerá en la boleta de garantía de reparaciones (OT cerradas)
          </p>
        </div>

        {(!config || editando) && (
          <div className="flex gap-3 pt-4">
            {editando && (
              <Button
                variant="outline"
                onClick={() => {
                  setEditando(false);
                  if (config) {
                    setTextoVentas(config.texto_ventas || '');
                    setTextoReparaciones(config.texto_reparaciones || '');
                    setMesesVigenciaVentas(config.meses_vigencia_ventas || 12);
                    setMesesVigenciaReparaciones(config.meses_vigencia_reparaciones || 3);
                  }
                }}
              >
                Cancelar
              </Button>
            )}
            <Button
              onClick={handleGuardar}
              disabled={guardarMutation.isPending}
              className="bg-gradient-to-r from-indigo-500 to-blue-500"
            >
              <Save className="w-4 h-4 mr-2" />
              {guardarMutation.isPending ? 'Guardando...' : 'Guardar Configuración'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
