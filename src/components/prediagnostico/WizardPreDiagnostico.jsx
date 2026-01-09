import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, AlertCircle, ChevronRight, ChevronLeft } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { generarResumenPreDiagnostico } from './generarResumen';

const PROBLEMAS = {
  no_enciende: 'No enciende',
  lento: 'Lento / Con lentitud',
  pantalla: 'Problema de pantalla',
  ruido_temperatura: 'Ruido o sobrecalentamiento',
  danio_fisico: 'Daño físico',
  limpieza_revision: 'Limpieza o revisión general',
  otro: 'Otro problema'
};

const PREGUNTAS_POR_PROBLEMA = {
  no_enciende: [
    { key: 'cuando_inicio', label: '¿Cuándo dejó de encender?', tipo: 'texto' },
    { key: 'golpes_liquidos', label: '¿Sufrió golpes o contacto con líquidos?', tipo: 'sino' },
    { key: 'intento_reparacion', label: '¿Se intentó reparar previamente?', tipo: 'sino' }
  ],
  lento: [
    { key: 'cuando_inicio', label: '¿Cuándo comenzó la lentitud?', tipo: 'texto' },
    { key: 'software_reciente', label: '¿Se instaló software recientemente?', tipo: 'sino' },
    { key: 'sobrecalentamiento', label: '¿El equipo se calienta en exceso?', tipo: 'sino' },
    { key: 'respaldo_datos', label: '¿Tiene respaldo de información importante?', tipo: 'sino' }
  ],
  pantalla: [
    { key: 'tipo_problema_pantalla', label: '¿Qué problema presenta la pantalla?', tipo: 'opciones', opciones: ['No se ve nada', 'Líneas o manchas', 'Pantalla rota', 'Parpadea'] },
    { key: 'golpes_liquidos', label: '¿Sufrió golpes o contacto con líquidos?', tipo: 'sino' }
  ],
  ruido_temperatura: [
    { key: 'cuando_inicio', label: '¿Cuándo comenzó el problema?', tipo: 'texto' },
    { key: 'tipo_ruido', label: '¿Qué tipo de ruido?', tipo: 'opciones', opciones: ['Ventilador fuerte', 'Pitidos', 'Clic repetitivo', 'Otro'] },
    { key: 'sobrecalentamiento', label: '¿El equipo se calienta en exceso?', tipo: 'sino' }
  ],
  danio_fisico: [
    { key: 'tipo_danio', label: '¿Qué tipo de daño?', tipo: 'opciones', opciones: ['Pantalla rota', 'Carcasa dañada', 'Puerto dañado', 'Otro'] },
    { key: 'como_ocurrio', label: '¿Cómo ocurrió?', tipo: 'texto' }
  ],
  limpieza_revision: [
    { key: 'ultima_limpieza', label: '¿Cuándo fue la última limpieza?', tipo: 'texto' },
    { key: 'problemas_actuales', label: '¿Presenta algún problema actualmente?', tipo: 'sino' }
  ],
  otro: [
    { key: 'descripcion_problema', label: 'Describe el problema', tipo: 'texto' },
    { key: 'cuando_inicio', label: '¿Cuándo inició?', tipo: 'texto' }
  ]
};

export default function WizardPreDiagnostico({ ordenTrabajo, effectiveOrgId, userId, onClose, onComplete }) {
  const [paso, setPaso] = useState(1);
  const [saving, setSaving] = useState(false);
  const [preDiagnostico, setPreDiagnostico] = useState(null);
  const [formData, setFormData] = useState({
    uso_principal: '',
    equipo_critico: false,
    problema_principal: '',
    respuestas: {},
    riesgo_datos: 'ninguno',
    riesgo_fisico: 'ninguno',
    observaciones_riesgo: ''
  });

  // Cargar pre-diagnóstico existente si hay
  useEffect(() => {
    cargarPreDiagnostico();
  }, []);

  const cargarPreDiagnostico = async () => {
    try {
      const existing = await base44.entities.PreDiagnostico.filter({
        organization_id: effectiveOrgId,
        orden_trabajo_id: ordenTrabajo.id
      });

      if (existing.length > 0) {
        const pd = existing[0];
        setPreDiagnostico(pd);
        setFormData({
          uso_principal: pd.uso_principal || '',
          equipo_critico: pd.equipo_critico || false,
          problema_principal: pd.problema_principal || '',
          respuestas: pd.respuestas || {},
          riesgo_datos: pd.riesgo_datos || 'ninguno',
          riesgo_fisico: pd.riesgo_fisico || 'ninguno',
          observaciones_riesgo: pd.observaciones_riesgo || ''
        });
      }
    } catch (error) {
      console.error('Error cargando pre-diagnóstico:', error);
    }
  };

  const guardarProgreso = async () => {
    setSaving(true);
    try {
      const data = {
        organization_id: effectiveOrgId,
        orden_trabajo_id: ordenTrabajo.id,
        estado_wizard: 'borrador',
        ...formData
      };

      if (preDiagnostico) {
        await base44.entities.PreDiagnostico.update(preDiagnostico.id, data);
      } else {
        const created = await base44.entities.PreDiagnostico.create(data);
        setPreDiagnostico(created);
      }
    } catch (error) {
      console.error('Error guardando progreso:', error);
      alert('Error al guardar: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const completarWizard = async () => {
    setSaving(true);
    try {
      const dataCompleta = {
        organization_id: effectiveOrgId,
        orden_trabajo_id: ordenTrabajo.id,
        estado_wizard: 'completado',
        completado_por_user_id: userId,
        completado_at: new Date().toISOString(),
        ...formData
      };

      let preDiagnosticoFinal;
      if (preDiagnostico) {
        preDiagnosticoFinal = await base44.entities.PreDiagnostico.update(preDiagnostico.id, dataCompleta);
      } else {
        preDiagnosticoFinal = await base44.entities.PreDiagnostico.create(dataCompleta);
      }

      // Generar resumen y actualizar OT
      const resumen = generarResumenPreDiagnostico(dataCompleta);
      await base44.entities.OrdenTrabajo.update(ordenTrabajo.id, {
        diagnostico_resumido: resumen
      });

      onComplete();
    } catch (error) {
      console.error('Error completando wizard:', error);
      alert('Error al completar: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSiguiente = async () => {
    await guardarProgreso();
    setPaso(paso + 1);
  };

  const handleAnterior = () => {
    setPaso(paso - 1);
  };

  const preguntasActuales = formData.problema_principal 
    ? PREGUNTAS_POR_PROBLEMA[formData.problema_principal] || []
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Pre-Diagnóstico de Recepción</h2>
          <p className="text-sm text-slate-500">
            Captura lo que reporta el cliente para guiar al técnico
          </p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          Paso {paso} de 4
        </Badge>
      </div>

      <Alert className="bg-blue-50 border-blue-200">
        <AlertCircle className="w-4 h-4 text-blue-600" />
        <AlertDescription className="text-blue-800 text-sm">
          Este wizard NO es técnico. Solo captura los síntomas que reporta el cliente.
        </AlertDescription>
      </Alert>

      {/* PASO 1: CONTEXTO */}
      {paso === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Contexto del Equipo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>¿Para qué usa principalmente este equipo? *</Label>
              <Select 
                value={formData.uso_principal} 
                onValueChange={(value) => setFormData({...formData, uso_principal: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar uso" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hogar">Uso personal / Hogar</SelectItem>
                  <SelectItem value="trabajo">Trabajo (empleado)</SelectItem>
                  <SelectItem value="empresa">Empresa (dueño/negocio)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>¿Es un equipo crítico para el cliente?</Label>
              <p className="text-xs text-slate-500">
                (Lo necesita urgentemente para trabajar o estudiar)
              </p>
              <Select 
                value={formData.equipo_critico ? 'si' : 'no'} 
                onValueChange={(value) => setFormData({...formData, equipo_critico: value === 'si'})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="si">Sí, es crítico</SelectItem>
                  <SelectItem value="no">No es crítico</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* PASO 2: PROBLEMA PRINCIPAL */}
      {paso === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>¿Qué problema reporta el cliente?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(PROBLEMAS).map(([key, label]) => (
                <Button
                  key={key}
                  type="button"
                  variant={formData.problema_principal === key ? 'default' : 'outline'}
                  className={`justify-start text-left h-auto py-4 ${
                    formData.problema_principal === key 
                      ? 'bg-gradient-to-r from-emerald-500 to-blue-500' 
                      : ''
                  }`}
                  onClick={() => setFormData({...formData, problema_principal: key, respuestas: {}})}
                >
                  {formData.problema_principal === key && <CheckCircle2 className="w-5 h-5 mr-2" />}
                  {label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* PASO 3: PREGUNTAS GUIADAS */}
      {paso === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Preguntas Guiadas</CardTitle>
            <p className="text-sm text-slate-500">
              Basadas en el problema: <strong>{PROBLEMAS[formData.problema_principal]}</strong>
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {preguntasActuales.map((pregunta) => (
              <div key={pregunta.key} className="space-y-2">
                <Label>{pregunta.label}</Label>
                
                {pregunta.tipo === 'sino' && (
                  <Select 
                    value={formData.respuestas[pregunta.key] || 'no'} 
                    onValueChange={(value) => setFormData({
                      ...formData, 
                      respuestas: {...formData.respuestas, [pregunta.key]: value}
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="si">Sí</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                )}

                {pregunta.tipo === 'texto' && (
                  <Textarea
                    value={formData.respuestas[pregunta.key] || ''}
                    onChange={(e) => setFormData({
                      ...formData, 
                      respuestas: {...formData.respuestas, [pregunta.key]: e.target.value}
                    })}
                    placeholder="Escribe aquí..."
                    rows={2}
                  />
                )}

                {pregunta.tipo === 'opciones' && (
                  <Select 
                    value={formData.respuestas[pregunta.key] || ''} 
                    onValueChange={(value) => setFormData({
                      ...formData, 
                      respuestas: {...formData.respuestas, [pregunta.key]: value}
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {pregunta.opciones.map(opcion => (
                        <SelectItem key={opcion} value={opcion}>{opcion}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* PASO 4: RIESGOS */}
      {paso === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Evaluación de Riesgos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Riesgo de pérdida de datos</Label>
              <p className="text-xs text-slate-500">
                ¿Qué tan probable es que se pierdan datos durante la reparación?
              </p>
              <Select 
                value={formData.riesgo_datos} 
                onValueChange={(value) => setFormData({...formData, riesgo_datos: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguno">Ninguno</SelectItem>
                  <SelectItem value="bajo">Bajo</SelectItem>
                  <SelectItem value="medio">Medio</SelectItem>
                  <SelectItem value="alto">Alto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Riesgo físico del equipo</Label>
              <p className="text-xs text-slate-500">
                ¿El equipo tiene daños que podrían empeorar durante la manipulación?
              </p>
              <Select 
                value={formData.riesgo_fisico} 
                onValueChange={(value) => setFormData({...formData, riesgo_fisico: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguno">Ninguno</SelectItem>
                  <SelectItem value="bajo">Bajo</SelectItem>
                  <SelectItem value="medio">Medio</SelectItem>
                  <SelectItem value="alto">Alto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Observaciones adicionales sobre riesgos</Label>
              <Textarea
                value={formData.observaciones_riesgo}
                onChange={(e) => setFormData({...formData, observaciones_riesgo: e.target.value})}
                placeholder="Cualquier observación importante sobre riesgos..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navegación */}
      <div className="flex justify-between pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={paso === 1 ? onClose : handleAnterior}
          disabled={saving}
        >
          {paso === 1 ? 'Cancelar' : (
            <>
              <ChevronLeft className="w-4 h-4 mr-2" />
              Anterior
            </>
          )}
        </Button>

        {paso < 4 ? (
          <Button
            onClick={handleSiguiente}
            disabled={saving || (paso === 1 && !formData.uso_principal) || (paso === 2 && !formData.problema_principal)}
            className="bg-gradient-to-r from-emerald-500 to-blue-500"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                Siguiente
                <ChevronRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        ) : (
          <Button
            onClick={completarWizard}
            disabled={saving}
            className="bg-gradient-to-r from-emerald-500 to-blue-500"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Completando...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Completar Pre-Diagnóstico
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}