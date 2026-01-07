import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { 
  CheckCircle, 
  Circle, 
  XCircle, 
  Camera, 
  FileText, 
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Upload
} from 'lucide-react';
import { useUserAccount, withOrgId } from '@/components/hooks/useOrgData';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const CHECKLIST_CATEGORIAS = {
  hardware: {
    label: 'Hardware',
    items: [
      'Estado de la pantalla',
      'Teclado funcional',
      'Touchpad / Mouse',
      'Puertos USB',
      'Puerto de carga',
      'Botones físicos',
      'Carcasa / Chasis'
    ]
  },
  software: {
    label: 'Software',
    items: [
      'Sistema operativo',
      'Actualizaciones pendientes',
      'Antivirus / Seguridad',
      'Aplicaciones instaladas',
      'Rendimiento general'
    ]
  },
  bateria: {
    label: 'Batería',
    items: [
      'Nivel de carga',
      'Tiempo de autonomía',
      'Ciclos de carga',
      'Estado de salud'
    ]
  },
  red: {
    label: 'Red y Conectividad',
    items: [
      'WiFi funcional',
      'Bluetooth',
      'Ethernet',
      'Conectividad móvil'
    ]
  }
};

export default function WizardDiagnostico({ ordenTrabajo, onClose, onComplete }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [diagnostico, setDiagnostico] = useState(null);
  const [tipoDiagnostico, setTipoDiagnostico] = useState('completo');
  const [checklistResults, setChecklistResults] = useState({});
  const [evidencias, setEvidencias] = useState([]);
  const [conclusionData, setConclusionData] = useState({
    conclusion_tecnica: '',
    resumen_cliente: '',
    nivel_riesgo: 'medio'
  });
  const [precioData, setPrecioData] = useState({
    tipo: 'unico', // unico | detallado
    precio_total: '',
    items: []
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();
  const { user, userAccount } = useUserAccount();

  const totalSteps = 6;
  const progress = (currentStep / totalSteps) * 100;

  // Crear diagnóstico al iniciar
  const createDiagnosticoMutation = useMutation({
    mutationFn: (data) => base44.entities.Diagnostico.create(withOrgId(data, userAccount)),
    onSuccess: (data) => {
      setDiagnostico(data);
    },
  });

  // Actualizar diagnóstico
  const updateDiagnosticoMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Diagnostico.update(id, data),
  });

  // Guardar resultados de checklist
  const saveResultadoMutation = useMutation({
    mutationFn: (data) => base44.entities.DiagnosticoResultado.create(withOrgId(data, userAccount)),
  });

  // Guardar evidencias
  const saveEvidenciaMutation = useMutation({
    mutationFn: (data) => base44.entities.DiagnosticoEvidencia.create(withOrgId(data, userAccount)),
  });

  // Completar diagnóstico
  const completeDiagnosticoMutation = useMutation({
    mutationFn: async (diagnosticoId) => {
      // 1. Actualizar diagnóstico
      await base44.entities.Diagnostico.update(diagnosticoId, {
        estado_diagnostico: 'completado',
        completed_at: new Date().toISOString()
      });

      // 2. Actualizar OrdenTrabajo
      await base44.entities.OrdenTrabajo.update(ordenTrabajo.id, {
        estado: 'DIAGNOSTICADA',
        fecha_diagnostico: new Date().toISOString()
      });

      // 3. Crear documento placeholder
      await base44.entities.DiagnosticoDocumento.create(withOrgId({
        diagnostico_id: diagnosticoId,
        version: 'v1',
        formato: 'pdf',
        url_documento: 'pending-generation' // Placeholder
      }, userAccount));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ordenes'] });
      onComplete?.();
    },
  });

  useEffect(() => {
    if (userAccount && !diagnostico) {
      createDiagnosticoMutation.mutate({
        orden_trabajo_id: ordenTrabajo.id,
        cliente_id: ordenTrabajo.cliente_id,
        equipo_id: ordenTrabajo.equipo_id,
        tecnico_id: user.id,
        tipo_diagnostico: tipoDiagnostico,
        estado_diagnostico: 'iniciado'
      });
    }
  }, [userAccount]);

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleChecklistChange = (categoria, item, resultado, observaciones = '') => {
    const key = `${categoria}-${item}`;
    setChecklistResults(prev => ({
      ...prev,
      [key]: { categoria, item, resultado, observaciones }
    }));

    // Guardado automático
    if (diagnostico) {
      setSaving(true);
      saveResultadoMutation.mutate({
        diagnostico_id: diagnostico.id,
        categoria,
        descripcion_item: item,
        resultado,
        observaciones
      }, {
        onSettled: () => setSaving(false)
      });
    }
  };

  const handleUploadFoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      const evidencia = {
        diagnostico_id: diagnostico.id,
        tipo: 'foto',
        url: file_url,
        descripcion: ''
      };

      await saveEvidenciaMutation.mutateAsync(evidencia);
      setEvidencias(prev => [...prev, { ...evidencia, id: Date.now() }]);
    } catch (error) {
      console.error('Error uploading file:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleAddNota = () => {
    const nota = prompt('Ingrese la nota:');
    if (!nota) return;

    const evidencia = {
      diagnostico_id: diagnostico.id,
      tipo: 'nota',
      contenido_texto: nota,
      descripcion: ''
    };

    saveEvidenciaMutation.mutate(evidencia);
    setEvidencias(prev => [...prev, { ...evidencia, id: Date.now() }]);
  };

  const handleSaveConclusionStep = () => {
    if (diagnostico) {
      updateDiagnosticoMutation.mutate({
        id: diagnostico.id,
        data: {
          conclusion_tecnica: conclusionData.conclusion_tecnica,
          resumen_cliente: conclusionData.resumen_cliente,
          nivel_riesgo: conclusionData.nivel_riesgo,
          estado_diagnostico: 'en_proceso'
        }
      });
    }
  };

  const handleSavePrecioStep = () => {
    if (diagnostico) {
      const total = precioData.tipo === 'unico' 
        ? parseFloat(precioData.precio_total) || 0
        : precioData.items.reduce((sum, item) => sum + (item.subtotal || 0), 0);

      updateDiagnosticoMutation.mutate({
        id: diagnostico.id,
        data: {
          propuesta_precio_total: total,
          propuesta_precio_detalle: precioData.tipo === 'detallado' ? precioData.items : null
        }
      });
    }
  };

  const handleComplete = () => {
    if (diagnostico) {
      completeDiagnosticoMutation.mutate(diagnostico.id);
    }
  };

  const addPrecioItem = () => {
    setPrecioData(prev => ({
      ...prev,
      items: [...prev.items, { descripcion: '', cantidad: 1, precio_unitario: 0, subtotal: 0 }]
    }));
  };

  const updatePrecioItem = (index, field, value) => {
    setPrecioData(prev => {
      const newItems = [...prev.items];
      newItems[index][field] = value;
      
      if (field === 'cantidad' || field === 'precio_unitario') {
        newItems[index].subtotal = newItems[index].cantidad * newItems[index].precio_unitario;
      }
      
      return { ...prev, items: newItems };
    });
  };

  if (!diagnostico) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header con progreso */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">
            Diagnóstico Técnico
          </h2>
          <Badge variant="outline">
            Paso {currentStep} de {totalSteps}
          </Badge>
        </div>
        <Progress value={progress} className="h-2" />
        {saving && (
          <p className="text-xs text-slate-500 flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            Guardando...
          </p>
        )}
      </div>

      {/* Contenido por paso */}
      <div className="min-h-[400px]">
        {/* PASO 1: Tipo de diagnóstico */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Tipo de Diagnóstico</h3>
              <p className="text-slate-500">Selecciona el tipo de diagnóstico a realizar</p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {['rapido', 'completo', 'especifico'].map(tipo => (
                <Card
                  key={tipo}
                  className={`cursor-pointer transition-all ${
                    tipoDiagnostico === tipo
                      ? 'ring-2 ring-emerald-500 bg-emerald-50'
                      : 'hover:shadow-lg'
                  }`}
                  onClick={() => {
                    setTipoDiagnostico(tipo);
                    updateDiagnosticoMutation.mutate({
                      id: diagnostico.id,
                      data: { tipo_diagnostico: tipo }
                    });
                  }}
                >
                  <CardContent className="p-6 text-center">
                    <h4 className="font-bold text-lg mb-2 capitalize">{tipo}</h4>
                    <p className="text-sm text-slate-600">
                      {tipo === 'rapido' && 'Revisión rápida básica (15-30 min)'}
                      {tipo === 'completo' && 'Diagnóstico completo (1-2 hrs)'}
                      {tipo === 'especifico' && 'Problema específico enfocado'}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* PASO 2: Checklist técnico */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Checklist Técnico</h3>
              <p className="text-slate-500">Revisa cada componente y marca el resultado</p>
            </div>

            {Object.entries(CHECKLIST_CATEGORIAS).map(([key, cat]) => (
              <Card key={key} className="border-0 shadow-md">
                <CardContent className="p-6">
                  <h4 className="font-bold text-lg mb-4 flex items-center gap-2">
                    {cat.label}
                  </h4>
                  <div className="space-y-3">
                    {cat.items.map((item) => {
                      const itemKey = `${key}-${item}`;
                      const current = checklistResults[itemKey];
                      
                      return (
                        <div key={item} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                          <div className="flex-1">
                            <p className="font-medium text-slate-900">{item}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant={current?.resultado === 'OK' ? 'default' : 'outline'}
                              onClick={() => handleChecklistChange(cat.label, item, 'OK')}
                              className={current?.resultado === 'OK' ? 'bg-green-500' : ''}
                            >
                              <CheckCircle className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant={current?.resultado === 'Fallo' ? 'default' : 'outline'}
                              onClick={() => handleChecklistChange(cat.label, item, 'Fallo')}
                              className={current?.resultado === 'Fallo' ? 'bg-red-500' : ''}
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant={current?.resultado === 'N_A' ? 'default' : 'outline'}
                              onClick={() => handleChecklistChange(cat.label, item, 'N_A')}
                              className={current?.resultado === 'N_A' ? 'bg-slate-500' : ''}
                            >
                              <Circle className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* PASO 3: Evidencias */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Evidencias</h3>
              <p className="text-slate-500">Agrega fotos y notas técnicas</p>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => document.getElementById('foto-upload').click()}
                disabled={uploading}
                className="bg-emerald-500"
              >
                {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Camera className="w-4 h-4 mr-2" />}
                Subir Foto
              </Button>
              <input
                id="foto-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUploadFoto}
              />
              <Button onClick={handleAddNota} variant="outline">
                <FileText className="w-4 h-4 mr-2" />
                Agregar Nota
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {evidencias.map((ev, idx) => (
                <Card key={idx} className="border-0 shadow-md">
                  <CardContent className="p-4">
                    {ev.tipo === 'foto' ? (
                      <div>
                        <img src={ev.url} alt="Evidencia" className="w-full h-40 object-cover rounded-lg mb-2" />
                        <Badge className="bg-blue-100 text-blue-700 border-0">Foto</Badge>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm text-slate-700 mb-2">{ev.contenido_texto}</p>
                        <Badge className="bg-purple-100 text-purple-700 border-0">Nota</Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {evidencias.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <Upload className="w-12 h-12 mx-auto mb-3" />
                <p>No hay evidencias agregadas</p>
              </div>
            )}
          </div>
        )}

        {/* PASO 4: Conclusión técnica */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Conclusión Técnica</h3>
              <p className="text-slate-500">Resume los hallazgos y define el nivel de riesgo</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Conclusión Técnica *</Label>
                <Textarea
                  value={conclusionData.conclusion_tecnica}
                  onChange={(e) => setConclusionData(prev => ({ ...prev, conclusion_tecnica: e.target.value }))}
                  placeholder="Detalla los hallazgos técnicos..."
                  rows={4}
                  className="resize-none"
                />
              </div>

              <div className="space-y-2">
                <Label>Resumen para el Cliente *</Label>
                <Textarea
                  value={conclusionData.resumen_cliente}
                  onChange={(e) => setConclusionData(prev => ({ ...prev, resumen_cliente: e.target.value }))}
                  placeholder="Explica en lenguaje no técnico..."
                  rows={3}
                  className="resize-none"
                />
              </div>

              <div className="space-y-2">
                <Label>Nivel de Riesgo *</Label>
                <Select
                  value={conclusionData.nivel_riesgo}
                  onValueChange={(value) => setConclusionData(prev => ({ ...prev, nivel_riesgo: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bajo">Bajo - Problema menor</SelectItem>
                    <SelectItem value="medio">Medio - Requiere atención</SelectItem>
                    <SelectItem value="alto">Alto - Prioridad alta</SelectItem>
                    <SelectItem value="critico">Crítico - Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* PASO 5: Propuesta económica */}
        {currentStep === 5 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Propuesta Económica</h3>
              <p className="text-slate-500">Define el costo estimado de la reparación</p>
            </div>

            <div className="flex gap-3 mb-4">
              <Button
                variant={precioData.tipo === 'unico' ? 'default' : 'outline'}
                onClick={() => setPrecioData(prev => ({ ...prev, tipo: 'unico' }))}
              >
                Precio Único
              </Button>
              <Button
                variant={precioData.tipo === 'detallado' ? 'default' : 'outline'}
                onClick={() => setPrecioData(prev => ({ ...prev, tipo: 'detallado' }))}
              >
                Precio Detallado
              </Button>
            </div>

            {precioData.tipo === 'unico' ? (
              <div className="space-y-2">
                <Label>Precio Total (₡) *</Label>
                <Input
                  type="number"
                  value={precioData.precio_total}
                  onChange={(e) => setPrecioData(prev => ({ ...prev, precio_total: e.target.value }))}
                  placeholder="0"
                  className="text-lg font-bold"
                />
              </div>
            ) : (
              <div className="space-y-4">
                {precioData.items.map((item, idx) => (
                  <Card key={idx} className="border-0 shadow-md">
                    <CardContent className="p-4">
                      <div className="grid grid-cols-4 gap-3">
                        <div className="col-span-2">
                          <Label>Descripción</Label>
                          <Input
                            value={item.descripcion}
                            onChange={(e) => updatePrecioItem(idx, 'descripcion', e.target.value)}
                            placeholder="Ej: Cambio de pantalla"
                          />
                        </div>
                        <div>
                          <Label>Cant.</Label>
                          <Input
                            type="number"
                            value={item.cantidad}
                            onChange={(e) => updatePrecioItem(idx, 'cantidad', parseFloat(e.target.value))}
                            min="1"
                          />
                        </div>
                        <div>
                          <Label>Precio Unit.</Label>
                          <Input
                            type="number"
                            value={item.precio_unitario}
                            onChange={(e) => updatePrecioItem(idx, 'precio_unitario', parseFloat(e.target.value))}
                          />
                        </div>
                      </div>
                      <div className="mt-2 text-right">
                        <span className="text-lg font-bold text-emerald-600">
                          Subtotal: ₡{item.subtotal.toLocaleString()}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                <Button onClick={addPrecioItem} variant="outline" className="w-full">
                  + Agregar Item
                </Button>
                <div className="text-right text-xl font-bold text-slate-900">
                  Total: ₡{precioData.items.reduce((sum, item) => sum + item.subtotal, 0).toLocaleString()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* PASO 6: Resumen final */}
        {currentStep === 6 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Resumen Final</h3>
              <p className="text-slate-500">Revisa la información antes de completar</p>
            </div>

            <div className="space-y-4">
              <Card className="border-0 shadow-md">
                <CardContent className="p-6">
                  <h4 className="font-bold mb-3">Tipo de Diagnóstico</h4>
                  <Badge className="capitalize">{tipoDiagnostico}</Badge>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-md">
                <CardContent className="p-6">
                  <h4 className="font-bold mb-3">Checklist</h4>
                  <p className="text-slate-600">{Object.keys(checklistResults).length} items revisados</p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-md">
                <CardContent className="p-6">
                  <h4 className="font-bold mb-3">Evidencias</h4>
                  <p className="text-slate-600">{evidencias.length} evidencias agregadas</p>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-md">
                <CardContent className="p-6">
                  <h4 className="font-bold mb-3">Conclusión</h4>
                  <p className="text-sm text-slate-700 mb-2">{conclusionData.conclusion_tecnica}</p>
                  <Badge className={`${
                    conclusionData.nivel_riesgo === 'critico' ? 'bg-red-100 text-red-700' :
                    conclusionData.nivel_riesgo === 'alto' ? 'bg-orange-100 text-orange-700' :
                    conclusionData.nivel_riesgo === 'medio' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-green-100 text-green-700'
                  } border-0 capitalize`}>
                    Riesgo: {conclusionData.nivel_riesgo}
                  </Badge>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-md bg-emerald-50">
                <CardContent className="p-6">
                  <h4 className="font-bold mb-3">Propuesta Económica</h4>
                  <p className="text-3xl font-bold text-emerald-600">
                    ₡{(precioData.tipo === 'unico' 
                      ? parseFloat(precioData.precio_total) || 0
                      : precioData.items.reduce((sum, item) => sum + item.subtotal, 0)
                    ).toLocaleString()}
                  </p>
                </CardContent>
              </Card>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="font-semibold text-yellow-900">Confirmación final</p>
                  <p className="text-sm text-yellow-700">
                    Al completar, el diagnóstico será inmutable y la orden pasará a estado DIAGNOSTICADA.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navegación */}
      <div className="flex items-center justify-between pt-6 border-t border-slate-200">
        <Button
          variant="outline"
          onClick={currentStep === 1 ? onClose : handleBack}
          disabled={completeDiagnosticoMutation.isPending}
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          {currentStep === 1 ? 'Cancelar' : 'Anterior'}
        </Button>

        {currentStep < totalSteps ? (
          <Button
            onClick={() => {
              // Guardar antes de avanzar
              if (currentStep === 4) handleSaveConclusionStep();
              if (currentStep === 5) handleSavePrecioStep();
              handleNext();
            }}
            className="bg-gradient-to-r from-emerald-500 to-blue-500"
          >
            Siguiente
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button
            onClick={handleComplete}
            disabled={completeDiagnosticoMutation.isPending}
            className="bg-gradient-to-r from-emerald-500 to-blue-500"
          >
            {completeDiagnosticoMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Completando...
              </>
            ) : (
              'Completar Diagnóstico'
            )}
          </Button>
        )}
      </div>
    </div>
  );
}