import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileText, Plus, CheckCircle2, AlertCircle, History } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function TerminosYCondicionesPanel({ organizationId }) {
  const [showEditor, setShowEditor] = useState(false);
  const [textoNuevo, setTextoNuevo] = useState('');
  const [activarVersion, setActivarVersion] = useState(true);
  const queryClient = useQueryClient();

  const { data: terminos = [], isLoading } = useQuery({
    queryKey: ['terminos', organizationId],
    queryFn: () => base44.entities.TerminosYCondiciones.filter({
      organization_id: organizationId
    }),
    enabled: !!organizationId,
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      // Si se va a activar esta versión, desactivar todas las demás
      if (data.activo) {
        const terminosActivos = terminos.filter(t => t.activo);
        for (const t of terminosActivos) {
          await base44.entities.TerminosYCondiciones.update(t.id, { activo: false });
        }
      }
      
      return base44.entities.TerminosYCondiciones.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terminos'] });
      setShowEditor(false);
      setTextoNuevo('');
    },
  });

  const activarMutation = useMutation({
    mutationFn: async (terminoId) => {
      // Desactivar todos
      const terminosActivos = terminos.filter(t => t.activo);
      for (const t of terminosActivos) {
        await base44.entities.TerminosYCondiciones.update(t.id, { activo: false });
      }
      
      // Activar el seleccionado
      return base44.entities.TerminosYCondiciones.update(terminoId, { activo: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terminos'] });
    },
  });

  const handleGuardar = () => {
    if (!textoNuevo.trim()) {
      alert('El texto de términos no puede estar vacío');
      return;
    }

    // Generar versión incremental
    const versionesExistentes = terminos.map(t => {
      const match = t.version.match(/v(\d+)\.(\d+)/);
      if (match) {
        return parseFloat(`${match[1]}.${match[2]}`);
      }
      return 0;
    });

    const maxVersion = versionesExistentes.length > 0 
      ? Math.max(...versionesExistentes) 
      : 0;
    
    const nuevaVersion = Math.floor(maxVersion) === maxVersion 
      ? `v${maxVersion + 1}.0` 
      : `v${Math.floor(maxVersion)}.${Math.floor((maxVersion % 1) * 10) + 1}`;

    createMutation.mutate({
      organization_id: organizationId,
      version: nuevaVersion,
      texto: textoNuevo.trim(),
      activo: activarVersion,
    });
  };

  const terminosOrdenados = [...terminos].sort((a, b) => 
    new Date(b.created_date) - new Date(a.created_date)
  );

  const versionActiva = terminos.find(t => t.activo);
  const hayTerminos = terminos.length > 0;

  if (isLoading) {
    return <div className="p-4 text-center text-slate-500">Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header con estado */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Términos y Condiciones
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Gestión de términos legales para recepción de equipos
          </p>
        </div>
        <Button 
          onClick={() => setShowEditor(true)}
          className="bg-gradient-to-r from-emerald-500 to-blue-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          {hayTerminos ? 'Nueva Versión' : 'Configurar Términos'}
        </Button>
      </div>

      {/* Estado actual */}
      {!hayTerminos ? (
        <Alert className="bg-amber-50 border-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            <strong>⚠️ Acción requerida:</strong> No hay términos configurados. 
            La creación de Órdenes de Trabajo está bloqueada hasta que se definan los términos legales.
          </AlertDescription>
        </Alert>
      ) : !versionActiva ? (
        <Alert className="bg-red-50 border-red-200">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <AlertDescription className="text-red-800">
            <strong>⚠️ Sin versión activa:</strong> Debes activar una versión de términos para permitir la creación de OT.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="bg-emerald-50 border-emerald-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <AlertDescription className="text-emerald-800">
            <strong>✓ Términos activos:</strong> Versión {versionActiva.version} activada. 
            Las nuevas Órdenes de Trabajo usarán estos términos.
          </AlertDescription>
        </Alert>
      )}

      {/* Listado de versiones */}
      {hayTerminos && (
        <Card className="border-0 shadow-md">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4 text-slate-600" />
              Historial de Versiones
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-3">
            {terminosOrdenados.map((termino) => (
              <div 
                key={termino.id}
                className={`p-4 border rounded-lg transition-all ${
                  termino.activo 
                    ? 'border-emerald-300 bg-emerald-50' 
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-bold text-slate-900">{termino.version}</span>
                      {termino.activo && (
                        <Badge className="bg-emerald-600 text-white border-0">
                          Activa
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      Creada: {format(new Date(termino.created_date), "dd MMM yyyy HH:mm", { locale: es })}
                    </p>
                    <div className="mt-3">
                      <details className="text-sm">
                        <summary className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium">
                          Ver contenido
                        </summary>
                        <div className="mt-2 p-3 bg-slate-50 rounded border border-slate-200 text-slate-700 whitespace-pre-wrap max-h-48 overflow-y-auto">
                          {termino.texto}
                        </div>
                      </details>
                    </div>
                  </div>
                  <div>
                    {!termino.activo && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => activarMutation.mutate(termino.id)}
                        disabled={activarMutation.isPending}
                      >
                        Activar
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Editor */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {hayTerminos ? 'Nueva Versión de Términos' : 'Configurar Términos y Condiciones'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            <Alert className="bg-blue-50 border-blue-200">
              <AlertCircle className="w-4 h-4 text-blue-600" />
              <AlertDescription className="text-blue-800 text-sm">
                <strong>Importante:</strong> Los términos serán aceptados por el cliente al momento de crear 
                una Orden de Trabajo. El sistema guardará un snapshot legal inmutable de la versión aceptada.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <Label htmlFor="texto">Texto de Términos y Condiciones *</Label>
              <Textarea
                id="texto"
                value={textoNuevo}
                onChange={(e) => setTextoNuevo(e.target.value)}
                placeholder="Escribe aquí los términos y condiciones completos de tu taller...&#10;&#10;Ejemplo:&#10;- Política de garantía&#10;- Responsabilidad por datos&#10;- Condiciones de pago&#10;- Plazos de entrega&#10;etc."
                rows={15}
                className="font-mono text-sm"
              />
              <p className="text-xs text-slate-500">
                {textoNuevo.length} caracteres
              </p>
            </div>

            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg">
              <input
                type="checkbox"
                id="activar"
                checked={activarVersion}
                onChange={(e) => setActivarVersion(e.target.checked)}
                className="w-4 h-4 text-emerald-600"
              />
              <Label htmlFor="activar" className="cursor-pointer flex-1">
                <span className="font-medium text-slate-900">Activar esta versión inmediatamente</span>
                <p className="text-xs text-slate-500 mt-1">
                  {hayTerminos 
                    ? 'Desactivará automáticamente la versión actual y habilitará esta nueva versión para nuevas OT.'
                    : 'Esta será la primera versión activa y habilitará la creación de Órdenes de Trabajo.'}
                </p>
              </Label>
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t border-slate-200">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowEditor(false);
                  setTextoNuevo('');
                }}
              >
                Cancelar
              </Button>
              <Button 
                onClick={handleGuardar}
                disabled={!textoNuevo.trim() || createMutation.isPending}
                className="bg-gradient-to-r from-emerald-500 to-blue-500"
              >
                {createMutation.isPending ? 'Guardando...' : 'Guardar Versión'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}