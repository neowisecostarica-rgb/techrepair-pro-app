import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle, XCircle, AlertCircle, Plus, Upload, Loader2 } from 'lucide-react';
import { withOrgId } from '@/components/hooks/useOrgData';

export default function PruebasTecnicas({ ordenTrabajoId, tecnicoId, userAccount }) {
  const [showModal, setShowModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [evidenciaURLs, setEvidenciaURLs] = useState([]);
  const queryClient = useQueryClient();

  const { data: pruebas = [] } = useQuery({
    queryKey: ['pruebas-tecnicas', ordenTrabajoId],
    queryFn: () => base44.entities.PruebaTecnica.filter({ orden_trabajo_id: ordenTrabajoId }),
    enabled: !!ordenTrabajoId,
  });

  const createPruebaMutation = useMutation({
    mutationFn: (data) => base44.entities.PruebaTecnica.create(withOrgId(data, userAccount)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pruebas-tecnicas'] });
      setShowModal(false);
      setEvidenciaURLs([]);
    },
  });

  const handleUploadEvidencia = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setEvidenciaURLs(prev => [...prev, file_url]);
    } catch (error) {
      console.error('Error uploading file:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    createPruebaMutation.mutate({
      orden_trabajo_id: ordenTrabajoId,
      tecnico_id: tecnicoId,
      tipo_prueba: formData.get('tipo_prueba'),
      descripcion: formData.get('descripcion'),
      resultado: formData.get('resultado'),
      observaciones: formData.get('observaciones'),
      evidencia_urls: evidenciaURLs,
    });
  };

  const resultadoConfig = {
    exitoso: { icon: CheckCircle, color: 'bg-emerald-100 text-emerald-700', label: 'Exitoso' },
    fallido: { icon: XCircle, color: 'bg-red-100 text-red-700', label: 'Fallido' },
    parcial: { icon: AlertCircle, color: 'bg-yellow-100 text-yellow-700', label: 'Parcial' },
  };

  return (
    <>
      <Card className="border-0 shadow-md">
        <CardHeader className="border-b border-slate-100">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              Pruebas y Control de Calidad
            </CardTitle>
            <Button onClick={() => setShowModal(true)} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Registrar Prueba
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {pruebas.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <CheckCircle className="w-12 h-12 mx-auto mb-3" />
              <p>No hay pruebas registradas</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pruebas.map((prueba) => {
                const config = resultadoConfig[prueba.resultado];
                const Icon = config.icon;
                
                return (
                  <div key={prueba.id} className="p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className="capitalize bg-blue-100 text-blue-700 border-0 text-xs">
                            {prueba.tipo_prueba}
                          </Badge>
                          <Badge className={`${config.color} border-0 text-xs flex items-center gap-1`}>
                            <Icon className="w-3 h-3" />
                            {config.label}
                          </Badge>
                        </div>
                        <p className="font-medium text-slate-900 mb-1">{prueba.descripcion}</p>
                        {prueba.observaciones && (
                          <p className="text-sm text-slate-600 mb-2">{prueba.observaciones}</p>
                        )}
                        {prueba.evidencia_urls && prueba.evidencia_urls.length > 0 && (
                          <div className="flex gap-2 mt-2">
                            {prueba.evidencia_urls.map((url, idx) => (
                              <img
                                key={idx}
                                src={url}
                                alt="Evidencia"
                                className="w-20 h-20 object-cover rounded border border-slate-200"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Prueba Técnica</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de Prueba *</Label>
              <Select name="tipo_prueba" required>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="funcional">Funcional</SelectItem>
                  <SelectItem value="stress">Stress</SelectItem>
                  <SelectItem value="rendimiento">Rendimiento</SelectItem>
                  <SelectItem value="calidad">Calidad</SelectItem>
                  <SelectItem value="visual">Visual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descripción *</Label>
              <Textarea
                name="descripcion"
                placeholder="¿Qué se probó?"
                required
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Resultado *</Label>
              <Select name="resultado" required>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar resultado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exitoso">Exitoso</SelectItem>
                  <SelectItem value="parcial">Parcial</SelectItem>
                  <SelectItem value="fallido">Fallido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observaciones</Label>
              <Textarea
                name="observaciones"
                placeholder="Detalles adicionales..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Evidencias (Opcional)</Label>
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById('evidencia-upload').click()}
                disabled={uploading}
                className="w-full"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Subiendo...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Subir Evidencia
                  </>
                )}
              </Button>
              <input
                id="evidencia-upload"
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={handleUploadEvidencia}
              />
              {evidenciaURLs.length > 0 && (
                <div className="flex gap-2 mt-2">
                  {evidenciaURLs.map((url, idx) => (
                    <img
                      key={idx}
                      src={url}
                      alt="Preview"
                      className="w-16 h-16 object-cover rounded border"
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-3 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createPruebaMutation.isPending}>
                Registrar Prueba
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}