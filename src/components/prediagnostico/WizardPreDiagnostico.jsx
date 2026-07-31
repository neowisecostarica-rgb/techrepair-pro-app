import React, { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Loader2, CheckCircle2, AlertCircle, Save, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { invalidateSmartIntake } from '@/api/smartIntake';
import { generarResumenPreDiagnostico } from './generarResumen';

// ─── Constantes ──────────────────────────────────────────────────────────────

const USOS = [
  { key: 'hogar',   label: '🏠 Hogar' },
  { key: 'trabajo', label: '💼 Trabajo' },
  { key: 'empresa', label: '🏢 Empresa' },
];

const PROBLEMAS = [
  { key: 'no_enciende',        label: '⚡ No enciende',           color: 'bg-red-100 border-red-400 text-red-800' },
  { key: 'lento',              label: '🐢 Lento',                 color: 'bg-orange-100 border-orange-400 text-orange-800' },
  { key: 'pantalla',           label: '🖥️ Pantalla',              color: 'bg-yellow-100 border-yellow-400 text-yellow-800' },
  { key: 'ruido_temperatura',  label: '🌡️ Ruido / Temperatura',   color: 'bg-amber-100 border-amber-400 text-amber-800' },
  { key: 'danio_fisico',       label: '💥 Daño físico',           color: 'bg-pink-100 border-pink-400 text-pink-800' },
  { key: 'limpieza_revision',  label: '🧹 Limpieza / Revisión',   color: 'bg-blue-100 border-blue-400 text-blue-800' },
  { key: 'otro',               label: '❓ Otro',                  color: 'bg-slate-100 border-slate-400 text-slate-800' },
];

const PREGUNTAS_POR_PROBLEMA = {
  no_enciende: [
    { key: 'cuando_inicio',      label: '¿Cuándo dejó de encender?',         tipo: 'chips', opciones: ['Hoy', 'Esta semana', 'Hace días', 'Gradual'] },
    { key: 'golpes_liquidos',    label: '¿Golpes o contacto con líquidos?',  tipo: 'sino' },
    { key: 'intento_reparacion', label: '¿Se intentó reparar antes?',        tipo: 'sino' },
  ],
  lento: [
    { key: 'cuando_inicio',     label: '¿Cuándo comenzó la lentitud?',         tipo: 'chips', opciones: ['Hoy', 'Esta semana', 'Hace tiempo', 'Siempre ha sido lento'] },
    { key: 'software_reciente', label: '¿Se instaló software recientemente?',  tipo: 'sino' },
    { key: 'sobrecalentamiento', label: '¿Se calienta en exceso?',             tipo: 'sino' },
    { key: 'respaldo_datos',    label: '¿Tiene respaldo de datos?',            tipo: 'sino' },
  ],
  pantalla: [
    { key: 'tipo_problema_pantalla', label: '¿Qué problema presenta?', tipo: 'chips', opciones: ['No se ve nada', 'Líneas o manchas', 'Pantalla rota', 'Parpadea'] },
    { key: 'golpes_liquidos',        label: '¿Golpes o contacto con líquidos?', tipo: 'sino' },
  ],
  ruido_temperatura: [
    { key: 'cuando_inicio', label: '¿Cuándo comenzó?',    tipo: 'chips', opciones: ['Hoy', 'Esta semana', 'Hace tiempo'] },
    { key: 'tipo_ruido',    label: '¿Qué tipo de ruido?', tipo: 'chips', opciones: ['Ventilador fuerte', 'Pitidos', 'Clic repetitivo', 'Otro'] },
    { key: 'sobrecalentamiento', label: '¿Se calienta en exceso?', tipo: 'sino' },
  ],
  danio_fisico: [
    { key: 'tipo_danio',   label: '¿Tipo de daño?', tipo: 'chips', opciones: ['Pantalla rota', 'Carcasa dañada', 'Puerto dañado', 'Otro'] },
    { key: 'como_ocurrio', label: '¿Cómo ocurrió?', tipo: 'chips', opciones: ['Caída', 'Líquido', 'Golpe', 'Desconocido'] },
  ],
  limpieza_revision: [
    { key: 'ultima_limpieza',    label: '¿Cuándo fue la última limpieza?', tipo: 'chips', opciones: ['Nunca', 'Hace 6 meses', 'Hace 1 año', 'Hace más de 1 año'] },
    { key: 'problemas_actuales', label: '¿Presenta algún problema?',       tipo: 'sino' },
  ],
  otro: [
    { key: 'descripcion_problema', label: 'Describe el problema', tipo: 'texto' },
    { key: 'cuando_inicio',        label: '¿Cuándo inició?',      tipo: 'chips', opciones: ['Hoy', 'Esta semana', 'Hace tiempo'] },
  ],
};

const RIESGOS = ['ninguno', 'bajo', 'medio', 'alto'];

const RIESGO_CONFIG = {
  ninguno: { label: 'Ninguno', color: 'bg-slate-100 border-slate-300 text-slate-700' },
  bajo:    { label: 'Bajo',    color: 'bg-green-100 border-green-400 text-green-800' },
  medio:   { label: 'Medio',   color: 'bg-yellow-100 border-yellow-400 text-yellow-800' },
  alto:    { label: 'Alto',    color: 'bg-red-100 border-red-400 text-red-800' },
};

// ─── Sub-componentes UI rápidos ───────────────────────────────────────────────

function ChipGroup({ options, value, onChange, multi = false }) {
  const selected = multi
    ? (Array.isArray(value) ? value : [])
    : value;

  const toggle = (key) => {
    if (multi) {
      const arr = Array.isArray(selected) ? selected : [];
      onChange(arr.includes(key) ? arr.filter(k => k !== key) : [...arr, key]);
    } else {
      onChange(selected === key ? '' : key);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const key = opt.key ?? opt;
        const label = opt.label ?? opt;
        const customColor = opt.color;
        const isSelected = multi ? selected.includes(key) : selected === key;

        return (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            className={`
              px-3 py-2 rounded-xl border-2 text-sm font-medium
              transition-all duration-150 active:scale-95
              min-h-[44px] min-w-[44px]
              ${isSelected
                ? customColor
                  ? customColor + ' border-current ring-2 ring-offset-1 ring-current'
                  : 'bg-emerald-100 border-emerald-500 text-emerald-800 ring-2 ring-offset-1 ring-emerald-400'
                : 'bg-white border-slate-200 text-slate-700 hover:border-slate-400'
              }
            `}
          >
            {isSelected && !multi && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

function SiNoToggle({ value, onChange }) {
  return (
    <div className="flex gap-3">
      {[
        { key: 'si', label: '✅ Sí', active: 'bg-emerald-100 border-emerald-500 text-emerald-800' },
        { key: 'no', label: '❌ No', active: 'bg-slate-100 border-slate-500 text-slate-800' },
      ].map(opt => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className={`
            flex-1 py-3 rounded-xl border-2 text-sm font-semibold
            transition-all duration-150 active:scale-95 min-h-[48px]
            ${value === opt.key
              ? opt.active
              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
            }
          `}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="bg-slate-50 border-b border-slate-200 px-5 py-3">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{title}</h3>
      </div>
      <div className="p-5 space-y-5">{children}</div>
    </div>
  );
}

function FieldLabel({ children, optional }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-sm font-medium text-slate-800">{children}</span>
      {optional && <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">opcional</span>}
    </div>
  );
}

// ─── Wizard Principal ─────────────────────────────────────────────────────────

export default function WizardPreDiagnostico({ ordenTrabajo, effectiveOrgId, userId, onClose, onComplete }) {
  const queryClient = useQueryClient();
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
  const [savedDraft, setSavedDraft] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Snapshot del estado inicial cargado para detectar cambios (isDirty)
  const initialSnapshot = useRef(null);

  // Detectar cambios respecto al snapshot inicial
  useEffect(() => {
    if (initialSnapshot.current === null) return; // aún no cargado
    setIsDirty(JSON.stringify(formData) !== initialSnapshot.current);
  }, [formData]);

  useEffect(() => {
    cargarPreDiagnostico();
  }, []);

  // Reset feedback de guardado
  useEffect(() => {
    if (savedDraft) {
      const t = setTimeout(() => setSavedDraft(false), 2500);
      return () => clearTimeout(t);
    }
  }, [savedDraft]);

  const cargarPreDiagnostico = async () => {
    try {
      const existing = await base44.entities.PreDiagnostico.filter({
        organization_id: effectiveOrgId,
        orden_trabajo_id: ordenTrabajo.id
      });
      let baseData = {
        uso_principal: '',
        equipo_critico: false,
        problema_principal: '',
        respuestas: {},
        riesgo_datos: 'ninguno',
        riesgo_fisico: 'ninguno',
        observaciones_riesgo: ''
      };
      if (existing.length > 0) {
        const pd = existing[0];
        setPreDiagnostico(pd);
        baseData = {
          uso_principal: pd.uso_principal || '',
          equipo_critico: pd.equipo_critico || false,
          problema_principal: pd.problema_principal || '',
          respuestas: pd.respuestas || {},
          riesgo_datos: pd.riesgo_datos || 'ninguno',
          riesgo_fisico: pd.riesgo_fisico || 'ninguno',
          observaciones_riesgo: pd.observaciones_riesgo || ''
        };
      }
      setFormData(baseData);
      initialSnapshot.current = JSON.stringify(baseData);
    } catch (error) {
      console.error('Error cargando pre-diagnóstico:', error);
    }
  };

  const buildPayload = (estado) => ({
    organization_id: effectiveOrgId,
    orden_trabajo_id: ordenTrabajo.id,
    estado,
    ...(estado === 'completado' ? {
      completado_por_user_id: userId,
      completado_at: new Date().toISOString(),
    } : {}),
    ...formData
  });

  // Invalida únicamente las queries autorizadas para el flujo de Pre-Diagnóstico
  const invalidarQueriesPreDiagnostico = () => {
    invalidateSmartIntake(queryClient, ordenTrabajo.id);
    queryClient.invalidateQueries({ queryKey: ['expediente-ot', ordenTrabajo.id] });
  };

  const guardarBorrador = async () => {
    setSaving(true);
    try {
      const data = buildPayload('borrador');
      if (preDiagnostico) {
        await base44.entities.PreDiagnostico.update(preDiagnostico.id, data);
      } else {
        const created = await base44.entities.PreDiagnostico.create(data);
        setPreDiagnostico(created);
      }
      setSavedDraft(true);
      initialSnapshot.current = JSON.stringify(formData);
      setIsDirty(false);
      invalidarQueriesPreDiagnostico();
    } catch (error) {
      console.error('Error guardando borrador:', error);
      alert('Error al guardar: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Detecta qué campos cambiaron respecto al estado original cargado
  const detectarCamposModificados = (original, nuevo) => {
    const camposAuditar = ['uso_principal', 'equipo_critico', 'problema_principal', 'riesgo_datos', 'riesgo_fisico', 'observaciones_riesgo'];
    const modificados = camposAuditar.filter(campo => {
      const valorOriginal = original?.[campo];
      const valorNuevo = nuevo[campo];
      return JSON.stringify(valorOriginal) !== JSON.stringify(valorNuevo);
    });
    // También comparar respuestas
    if (JSON.stringify(original?.respuestas) !== JSON.stringify(nuevo.respuestas)) {
      modificados.push('respuestas');
    }
    return modificados;
  };

  const registrarEventoEdicion = async (camposModificados) => {
    try {
      await base44.entities.OTEvent.create({
        organization_id: effectiveOrgId,
        orden_trabajo_id: ordenTrabajo.id,
        tipo: 'PRE_DIAGNOSTICO_EDITADO',
        created_by_user_id: userId,
        created_at: new Date().toISOString(),
        detalle: JSON.stringify({
          campos_modificados: camposModificados,
          usuario_ejecutor: userId,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (error) {
      // Non-blocking: la auditoría no debe impedir la operación
      console.warn('No se pudo registrar evento PRE_DIAGNOSTICO_EDITADO:', error);
    }
  };

  const completarWizard = async () => {
    if (!formData.problema_principal) {
      alert('Selecciona el problema principal antes de completar.');
      return;
    }
    setSaving(true);
    try {
      const data = buildPayload('completado');
      const esEdicion = !!preDiagnostico;
      const camposModificados = esEdicion ? detectarCamposModificados(preDiagnostico, formData) : [];

      if (preDiagnostico) {
        await base44.entities.PreDiagnostico.update(preDiagnostico.id, data);
      } else {
        await base44.entities.PreDiagnostico.create(data);
      }

      const resumen = generarResumenPreDiagnostico(data);
      await base44.functions.invoke('updateDiagnosticoResumen', {
        ordenTrabajoId: ordenTrabajo.id,
        diagnostico_resumido: resumen
      });

      // Registrar evento de auditoría solo si es una edición (prediagnóstico ya existía)
      if (esEdicion) {
        await registrarEventoEdicion(camposModificados);
      }

      // Sincronización: invalidar queries autorizadas antes de cerrar
      setIsDirty(false);
      invalidarQueriesPreDiagnostico();

      onComplete();
    } catch (error) {
      console.error('Error completando wizard:', error);
      alert('Error al completar: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const setRespuesta = (key, value) => {
    setFormData(prev => ({
      ...prev,
      respuestas: { ...prev.respuestas, [key]: value }
    }));
  };

  // Cierre protegido: si hay cambios sin guardar, pedir confirmación
  const handleCerrar = () => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  const confirmarDescarte = () => {
    setShowDiscardConfirm(false);
    setIsDirty(false);
    onClose();
  };

  const preguntasActuales = formData.problema_principal
    ? PREGUNTAS_POR_PROBLEMA[formData.problema_principal] || []
    : [];

  const isComplete = !!formData.uso_principal && !!formData.problema_principal;

  return (
    <div className="flex flex-col h-full max-h-[85vh]">

      {/* Header fijo */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Pre-Diagnóstico</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {ordenTrabajo.codigo_ot} · captura lo que reporta el cliente
          </p>
        </div>
        <button
          onClick={handleCerrar}
          className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Contenido scrollable */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

        <Alert className="bg-blue-50 border-blue-200 py-2">
          <AlertCircle className="w-4 h-4 text-blue-600" />
          <AlertDescription className="text-blue-800 text-xs">
            Este pre-diagnóstico NO es técnico — captura síntomas del cliente.
          </AlertDescription>
        </Alert>

        {/* SECCIÓN 1: CONTEXTO */}
        <Section title="1 · Contexto del cliente">
          <div>
            <FieldLabel>¿Para qué usa el equipo?</FieldLabel>
            <ChipGroup
              options={USOS}
              value={formData.uso_principal}
              onChange={(v) => setFormData(prev => ({ ...prev, uso_principal: v }))}
            />
          </div>

          <div>
            <FieldLabel>¿Equipo crítico para el cliente?</FieldLabel>
            <p className="text-xs text-slate-500 mb-2">Lo necesita urgentemente para trabajar o estudiar</p>
            <SiNoToggle
              value={formData.equipo_critico ? 'si' : 'no'}
              onChange={(v) => setFormData(prev => ({ ...prev, equipo_critico: v === 'si' }))}
            />
          </div>
        </Section>

        {/* SECCIÓN 2: PROBLEMA PRINCIPAL */}
        <Section title="2 · Problema que reporta *">
          <ChipGroup
            options={PROBLEMAS}
            value={formData.problema_principal}
            onChange={(v) => setFormData(prev => ({ ...prev, problema_principal: v, respuestas: {} }))}
          />
          {!formData.problema_principal && (
            <p className="text-xs text-amber-600 mt-1">⚠️ Requerido para completar</p>
          )}
        </Section>

        {/* SECCIÓN 3: PREGUNTAS GUIADAS (dinámicas) */}
        {preguntasActuales.length > 0 && (
          <Section title="3 · Detalles del problema">
            {preguntasActuales.map((pregunta) => (
              <div key={pregunta.key}>
                <FieldLabel optional={pregunta.tipo !== 'sino'}>{pregunta.label}</FieldLabel>

                {pregunta.tipo === 'sino' && (
                  <SiNoToggle
                    value={formData.respuestas[pregunta.key] || 'no'}
                    onChange={(v) => setRespuesta(pregunta.key, v)}
                  />
                )}

                {pregunta.tipo === 'chips' && (
                  <ChipGroup
                    options={pregunta.opciones}
                    value={formData.respuestas[pregunta.key] || ''}
                    onChange={(v) => setRespuesta(pregunta.key, v)}
                  />
                )}

                {pregunta.tipo === 'texto' && (
                  <Textarea
                    value={formData.respuestas[pregunta.key] || ''}
                    onChange={(e) => setRespuesta(pregunta.key, e.target.value)}
                    placeholder="Describe brevemente..."
                    rows={2}
                    className="text-sm"
                  />
                )}
              </div>
            ))}
          </Section>
        )}

        {/* SECCIÓN 4: RIESGOS */}
        <Section title="4 · Evaluación de riesgos">
          <div>
            <FieldLabel optional>Riesgo de pérdida de datos</FieldLabel>
            <ChipGroup
              options={RIESGOS.map(r => ({ key: r, label: RIESGO_CONFIG[r].label, color: RIESGO_CONFIG[r].color }))}
              value={formData.riesgo_datos}
              onChange={(v) => setFormData(prev => ({ ...prev, riesgo_datos: v || 'ninguno' }))}
            />
          </div>

          <div>
            <FieldLabel optional>Riesgo físico del equipo</FieldLabel>
            <ChipGroup
              options={RIESGOS.map(r => ({ key: r, label: RIESGO_CONFIG[r].label, color: RIESGO_CONFIG[r].color }))}
              value={formData.riesgo_fisico}
              onChange={(v) => setFormData(prev => ({ ...prev, riesgo_fisico: v || 'ninguno' }))}
            />
          </div>

          <div>
            <FieldLabel optional>Observaciones adicionales</FieldLabel>
            <Textarea
              value={formData.observaciones_riesgo}
              onChange={(e) => setFormData(prev => ({ ...prev, observaciones_riesgo: e.target.value }))}
              placeholder="Observaciones sobre riesgos o custodia..."
              rows={2}
              className="text-sm"
            />
          </div>
        </Section>

      </div>

      {/* Footer fijo: actions */}
      <div className="border-t border-slate-200 bg-white px-5 py-4 shrink-0">
        {savedDraft && (
          <div className="flex items-center gap-2 text-emerald-700 text-xs mb-3 bg-emerald-50 px-3 py-2 rounded-lg">
            <CheckCircle2 className="w-4 h-4" />
            Borrador guardado
          </div>
        )}

        <div className="flex gap-3">
          {/* Guardar borrador */}
          <Button
            type="button"
            variant="outline"
            onClick={guardarBorrador}
            disabled={saving}
            className="flex-1 gap-2 min-h-[48px]"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Guardar borrador
          </Button>

          {/* Completar */}
          <Button
            type="button"
            onClick={completarWizard}
            disabled={saving || !isComplete}
            className="flex-1 gap-2 min-h-[48px] bg-gradient-to-r from-emerald-500 to-blue-500 text-white disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            Completar
          </Button>
        </div>
      </div>

      {/* Confirmación de descarte de cambios sin guardar */}
      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar cambios?</AlertDialogTitle>
            <AlertDialogDescription>
              Tienes cambios sin guardar en el pre-diagnóstico. Si cierras ahora,
              esos cambios se perderán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarDescarte}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Descartar y cerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
