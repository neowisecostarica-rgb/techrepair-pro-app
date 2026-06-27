import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, AlertCircle, ChevronRight, ChevronLeft, FileText } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { COMPONENTES_DISPONIBLES, PRUEBAS_POR_COMPONENTE } from './pruebasPorComponente';
import { generarResumenTecnico } from './generarResumenTecnico';
import { transicionarEstadoOT } from '@/components/ot/transicionarEstadoOT';

const TIPOS_INTERVENCION = {
  diagnostico_tecnico: 'Diagnóstico técnico completo',
  mantenimiento_preventivo: 'Mantenimiento preventivo',
  mantenimiento_correctivo: 'Mantenimiento correctivo',
  limpieza: 'Limpieza y mantenimiento',
  reparacion_puntual: 'Reparación puntual',
  revision_general: 'Revisión general',
  otro: 'Otro'
};

export default function WizardDiagnosticoTecnico({ 
  ordenTrabajo, 
  preDiagnostico,
  effectiveOrgId, 
  tecnicoId, 
  onClose, 
  onComplete 
}) {
  const [paso, setPaso] = useState(0); // 0 = contexto, 1-4 = wizard
  const [saving, setSaving] = useState(false);
  const [diagnostico, setDiagnostico] = useState(null);
  const [formData, setFormData] = useState({
    tipo_intervencion: '',
    componentes_revisar: [],
    pruebas_realizadas: {},
    hallazgos: {},
    causa_probable: '',
    trabajo_recomendado: '',
    riesgos_no_reparar: '',
    tiempo_estimado_horas: 0,
    repuestos_requeridos: []
  });

  // Cargar diagnóstico existente si hay
  useEffect(() => {
    cargarDiagnostico();
  }, []);

  const cargarDiagnostico = async () => {
    try {
      // FASE 1: Inactivar diagnósticos previos activos (unicidad)
      const diagnosticosActivos = await base44.entities.DiagnosticoTecnico.filter({
        organization_id: effectiveOrgId,
        orden_trabajo_id: ordenTrabajo.id,
        bloqueado: false
      });

      // Si hay múltiples activos, bloquear todos excepto el más reciente
      if (diagnosticosActivos.length > 1) {
        const ordenadosPorFecha = diagnosticosActivos.sort((a, b) => 
          new Date(b.created_date || 0) - new Date(a.created_date || 0)
        );
        
        // Bloquear todos excepto el primero (más reciente)
        for (let i = 1; i < ordenadosPorFecha.length; i++) {
          await base44.entities.DiagnosticoTecnico.update(ordenadosPorFecha[i].id, {
            bloqueado: true
          });
        }
      }

      // Cargar el diagnóstico activo (solo debe haber uno ahora)
      const diagnosticosActivosActualizados = await base44.entities.DiagnosticoTecnico.filter({
        organization_id: effectiveOrgId,
        orden_trabajo_id: ordenTrabajo.id,
        bloqueado: false
      });

      if (diagnosticosActivosActualizados.length > 0) {
        const diag = diagnosticosActivosActualizados[0];
        setDiagnostico(diag);
        setFormData({
          tipo_intervencion: diag.tipo_intervencion || '',
          componentes_revisar: diag.componentes_revisar || [],
          pruebas_realizadas: diag.pruebas_realizadas || {},
          hallazgos: diag.hallazgos || {},
          causa_probable: diag.causa_probable || '',
          trabajo_recomendado: diag.trabajo_recomendado || '',
          riesgos_no_reparar: diag.riesgos_no_reparar || '',
          tiempo_estimado_horas: diag.tiempo_estimado_horas || 0,
          repuestos_requeridos: diag.repuestos_requeridos || []
        });
      }
    } catch (error) {
      console.error('Error cargando diagnóstico técnico:', error);
    }
  };

  const guardarProgreso = async () => {
    setSaving(true);
    try {
      const data = {
        organization_id: effectiveOrgId,
        orden_trabajo_id: ordenTrabajo.id,
        tecnico_id: tecnicoId,
        estado: 'borrador',
        fecha_inicio: diagnostico?.fecha_inicio || new Date().toISOString(),
        bloqueado: false,
        ...formData
      };

      if (diagnostico) {
        await base44.entities.DiagnosticoTecnico.update(diagnostico.id, data);
      } else {
        const created = await base44.entities.DiagnosticoTecnico.create(data);
        setDiagnostico(created);
      }
    } catch (error) {
      console.error('Error guardando progreso:', error);
      alert('Error al guardar: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const completarDiagnostico = async () => {
    // P0 IDEMPOTENCIA: Guard - si ya se consumió crédito, no reejecutar
    if (diagnostico?.credito_consumido_finalizacion === true) {
      console.warn('FINALIZAR_DIAG_SKIP', { 
        otId: ordenTrabajo.id, 
        diagnosticoId: diagnostico.id, 
        motivo: 'credito_ya_consumido',
        ts: new Date().toISOString() 
      });
      alert('Este diagnóstico ya fue finalizado previamente');
      return;
    }

    console.log('FINALIZAR_DIAG_CLICK', { 
      otId: ordenTrabajo.id, 
      diagnosticoId: diagnostico?.id, 
      ts: new Date().toISOString() 
    });

    setSaving(true);
    try {
      const dataCompleta = {
        organization_id: effectiveOrgId,
        orden_trabajo_id: ordenTrabajo.id,
        tecnico_id: tecnicoId,
        estado: 'listo_aprobacion',
        fecha_inicio: diagnostico?.fecha_inicio || new Date().toISOString(),
        fecha_completado: new Date().toISOString(),
        bloqueado: true,
        credito_consumido_finalizacion: true,
        ...formData
      };

      let diagnosticoFinal;
      if (diagnostico) {
        diagnosticoFinal = await base44.entities.DiagnosticoTecnico.update(diagnostico.id, dataCompleta);
      } else {
        diagnosticoFinal = await base44.entities.DiagnosticoTecnico.create(dataCompleta);
      }

      // Generar resumen técnico
      const resumenTecnico = generarResumenTecnico(dataCompleta);

      // Actualizar OT con resumen (sin mutar estado directamente)
      await base44.entities.OrdenTrabajo.update(ordenTrabajo.id, {
        diagnostico_resumido: resumenTecnico
      });

      // GAP-001 FIX: Cerrar actividad técnica activa antes de transicionar la OT.
      // Behavioral Contract: Si no existe actividad activa, la operación es silenciosa (no falla).
      try {
        const actividadesAbiertas = await base44.entities.ActividadTecnica.filter({
          orden_trabajo_id: ordenTrabajo.id,
          tecnico_id: tecnicoId,
          estado: 'activa',
        });
        if (actividadesAbiertas.length > 0) {
          const actividadActiva = actividadesAbiertas[0];
          const ahora = new Date().toISOString();
          const duracion = actividadActiva.started_at
            ? Math.round((new Date(ahora) - new Date(actividadActiva.started_at)) / 60000)
            : null;
          await base44.entities.ActividadTecnica.update(actividadActiva.id, {
            estado: 'finalizada',
            ended_at: ahora,
            ...(duracion !== null ? { duracion_minutos: duracion } : {}),
          });
        }
      } catch (actError) {
        // Fallo no-bloqueante: loguear pero no interrumpir la transición de OT
        console.warn('GAP-001: Error al cerrar ActividadTecnica (no bloqueante):', actError);
      }

      // FASE 1: Transición centralizada de estado
      await transicionarEstadoOT(ordenTrabajo.id, 'DIAGNOSTICADA', {
        userId: tecnicoId,
        userEmail: 'tecnico',
        organizationId: effectiveOrgId,
        motivo: 'Diagnóstico técnico completado'
      });

      // Crear cotización automática en borrador
      const itemsCotizacion = [];

      // Agregar repuestos
      if (dataCompleta.repuestos_requeridos && dataCompleta.repuestos_requeridos.length > 0) {
        dataCompleta.repuestos_requeridos.forEach(rep => {
          itemsCotizacion.push({
            tipo: 'repuesto',
            descripcion: rep.descripcion,
            cantidad: rep.cantidad,
            precio_unitario: 0, // Por definir por ORG_ADMIN/SALES
            subtotal: 0
          });
        });
      }

      // Agregar mano de obra (si hay tiempo estimado)
      if (dataCompleta.tiempo_estimado_horas > 0) {
        itemsCotizacion.push({
          tipo: 'mano_obra',
          descripcion: 'Mano de obra técnica',
          cantidad: dataCompleta.tiempo_estimado_horas,
          precio_unitario: 0, // Por definir por ORG_ADMIN/SALES
          subtotal: 0
        });
      }

      // Calcular versión (contar cotizaciones anteriores)
      const cotizacionesAnteriores = await base44.entities.Cotizacion.filter({
        organization_id: effectiveOrgId,
        orden_trabajo_id: ordenTrabajo.id
      });
      const version = `v1.${cotizacionesAnteriores.length}`;

      // Crear cotización borrador
      await base44.entities.Cotizacion.create({
        organization_id: effectiveOrgId,
        orden_trabajo_id: ordenTrabajo.id,
        diagnostico_tecnico_id: diagnosticoFinal.id || diagnostico?.id,
        cliente_id: ordenTrabajo.cliente_id,
        vendedor_id: tecnicoId,
        vendedor_nombre: 'Sistema',
        version: version,
        items: itemsCotizacion,
        subtotal: 0,
        descuento_total: 0,
        impuesto: 0,
        total: 0,
        estado: 'borrador'
      });

      console.log('FINALIZAR_DIAG_DONE', { 
        otId: ordenTrabajo.id, 
        diagnosticoId: diagnosticoFinal.id || diagnostico?.id,
        ts: new Date().toISOString() 
      });

      // Notificar al componente padre (Expediente) para controlar el flujo
      if (onComplete) {
        onComplete(diagnosticoFinal || diagnostico);
      }
    } catch (error) {
      console.error('Error completando diagnóstico:', error);
      alert('Error al completar: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSiguiente = async () => {
    if (paso > 0) {
      await guardarProgreso();
    }
    setPaso(paso + 1);
  };

  const handleAnterior = () => {
    setPaso(paso - 1);
  };

  const toggleComponente = (componenteId) => {
    const nuevos = formData.componentes_revisar.includes(componenteId)
      ? formData.componentes_revisar.filter(c => c !== componenteId)
      : [...formData.componentes_revisar, componenteId];
    setFormData({...formData, componentes_revisar: nuevos});
  };

  const agregarRepuesto = () => {
    setFormData({
      ...formData,
      repuestos_requeridos: [
        ...formData.repuestos_requeridos,
        { inventario_id: '', descripcion: '', cantidad: 1 }
      ]
    });
  };

  const actualizarRepuesto = (index, campo, valor) => {
    const nuevos = [...formData.repuestos_requeridos];
    nuevos[index][campo] = valor;
    setFormData({...formData, repuestos_requeridos: nuevos});
  };

  const eliminarRepuesto = (index) => {
    const nuevos = formData.repuestos_requeridos.filter((_, i) => i !== index);
    setFormData({...formData, repuestos_requeridos: nuevos});
  };

  // GATE OBLIGATORIO: Verificar pago de revisión (DECISIÓN CANÓNICA)
  const diagnosticoHabilitado = ordenTrabajo?.diagnostico_habilitado === true;

  if (!diagnosticoHabilitado) {
    return (
      <div className="space-y-6">
        <Alert className="bg-orange-50 border-orange-300">
          <AlertCircle className="w-5 h-5 text-orange-600" />
          <AlertDescription className="text-orange-900">
            <p className="font-semibold mb-2">🔒 Diagnóstico Bloqueado</p>
            <p className="text-sm mb-3">
              El diagnóstico debe cobrarse antes de iniciar la revisión técnica.
            </p>
            <p className="text-sm font-medium">
              Próximo paso: Ir al Punto de Venta para cobrar el diagnóstico.
            </p>
          </AlertDescription>
        </Alert>
        <div className="flex justify-end gap-3 pt-4">
          <Button onClick={onClose} variant="outline">
            Cerrar
          </Button>
          <Button 
            onClick={() => {
              window.location.href = createPageUrl('PuntoVenta') + `?ot_id=${ordenTrabajo.id}&concepto=revision_diagnostico`;
            }}
            className="bg-gradient-to-r from-green-500 to-emerald-500"
          >
            💳 Ir a Cobrar Diagnóstico
          </Button>
        </div>
      </div>
    );
  }

  // Guard: validar que el trabajo esté ACTIVO
  if (ordenTrabajo.estado_atencion !== 'ACTIVO') {
    return (
      <div className="space-y-6">
        <Alert className="bg-red-50 border-red-200">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <AlertDescription className="text-red-800">
            <strong>Trabajo NO activo:</strong> No puedes diagnosticar un trabajo pausado o en espera. 
            Por favor, retoma el trabajo desde "Mi Día" antes de continuar.
          </AlertDescription>
        </Alert>
        <div className="flex justify-end pt-4">
          <Button onClick={onClose} variant="outline">
            Cerrar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Diagnóstico Técnico</h2>
          <p className="text-sm text-slate-500">
            Evaluación profesional y recomendaciones técnicas
          </p>
        </div>
        {paso > 0 && (
          <Badge variant="outline" className="text-lg px-4 py-2">
            Paso {paso} de 4
          </Badge>
        )}
      </div>

      {/* PASO 0: CONTEXTO (Pre-Diagnóstico) */}
      {paso === 0 && (
        <div className="space-y-4">
          <Alert className="bg-emerald-50 border-emerald-200">
            <FileText className="w-4 h-4 text-emerald-600" />
            <AlertDescription className="text-emerald-800">
              <strong>Contexto del cliente:</strong> Revisa lo que reportó el cliente antes de iniciar el diagnóstico técnico.
            </AlertDescription>
          </Alert>

          {preDiagnostico ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Pre-Diagnóstico de Recepción</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500">Uso principal:</p>
                    <p className="font-medium">{preDiagnostico.uso_principal || 'No especificado'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Equipo crítico:</p>
                    <p className="font-medium">{preDiagnostico.equipo_critico ? 'Sí' : 'No'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Problema reportado:</p>
                    <p className="font-medium">{preDiagnostico.problema_principal || 'No especificado'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Riesgo de datos:</p>
                    <Badge className={
                      preDiagnostico.riesgo_datos === 'alto' ? 'bg-red-100 text-red-800' :
                      preDiagnostico.riesgo_datos === 'medio' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-slate-100 text-slate-800'
                    }>
                      {preDiagnostico.riesgo_datos || 'ninguno'}
                    </Badge>
                  </div>
                </div>

                {ordenTrabajo.diagnostico_resumido && (
                  <div className="border-t pt-4 mt-4">
                    <p className="text-sm text-slate-500 mb-2">Resumen:</p>
                    <p className="text-sm whitespace-pre-wrap">{ordenTrabajo.diagnostico_resumido}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Alert>
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>
                No hay pre-diagnóstico disponible. El equipo fue recibido sin información previa del cliente.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end pt-4">
            <Button
              onClick={() => setPaso(1)}
              className="bg-gradient-to-r from-purple-500 to-blue-500"
            >
              Iniciar Diagnóstico Técnico
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* PASO 1: ALCANCE TÉCNICO */}
      {paso === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Alcance Técnico</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Tipo de Intervención *</Label>
              <Select 
                value={formData.tipo_intervencion} 
                onValueChange={(value) => setFormData({...formData, tipo_intervencion: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPOS_INTERVENCION).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Componentes a Revisar</Label>
              <div className="grid grid-cols-2 gap-3">
                {COMPONENTES_DISPONIBLES.map(componente => (
                  <div key={componente.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={componente.id}
                      checked={formData.componentes_revisar.includes(componente.id)}
                      onCheckedChange={() => toggleComponente(componente.id)}
                    />
                    <Label htmlFor={componente.id} className="cursor-pointer">
                      {componente.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* PASO 2: PRUEBAS REALIZADAS */}
      {paso === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Pruebas Técnicas Realizadas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {formData.componentes_revisar.length === 0 ? (
              <Alert>
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>
                  Selecciona componentes en el paso anterior para ver las pruebas disponibles.
                </AlertDescription>
              </Alert>
            ) : (
              formData.componentes_revisar.map(componenteId => {
                const pruebas = PRUEBAS_POR_COMPONENTE[componenteId] || [];
                const componenteLabel = COMPONENTES_DISPONIBLES.find(c => c.id === componenteId)?.label;

                return (
                  <div key={componenteId} className="border rounded-lg p-4 space-y-4">
                    <h4 className="font-semibold text-slate-900">{componenteLabel}</h4>
                    {pruebas.map(prueba => {
                      const pruebaKey = `${componenteId}_${prueba.id}`;
                      const resultado = formData.pruebas_realizadas[pruebaKey];

                      return (
                        <div key={prueba.id} className="space-y-2 pl-4 border-l-2 border-slate-200">
                          <Label className="text-sm">{prueba.nombre}</Label>
                          <div className="flex gap-2">
                            <Select 
                              value={resultado?.resultado || 'na'} 
                              onValueChange={(value) => setFormData({
                                ...formData,
                                pruebas_realizadas: {
                                  ...formData.pruebas_realizadas,
                                  [pruebaKey]: {
                                    ...resultado,
                                    resultado: value
                                  }
                                }
                              })}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ok">✓ OK</SelectItem>
                                <SelectItem value="falla">✗ Falla</SelectItem>
                                <SelectItem value="na">N/A</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              placeholder="Observación breve"
                              value={resultado?.observacion || ''}
                              onChange={(e) => setFormData({
                                ...formData,
                                pruebas_realizadas: {
                                  ...formData.pruebas_realizadas,
                                  [pruebaKey]: {
                                    ...resultado,
                                    resultado: resultado?.resultado || 'na',
                                    observacion: e.target.value
                                  }
                                }
                              })}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      )}

      {/* PASO 3: HALLAZGOS */}
      {paso === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Hallazgos Técnicos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Problemas Detectados</Label>
              <Textarea
                value={formData.hallazgos.problemas || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  hallazgos: {...formData.hallazgos, problemas: e.target.value}
                })}
                placeholder="Lista los problemas técnicos detectados..."
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>Causa Probable</Label>
              <Textarea
                value={formData.causa_probable}
                onChange={(e) => setFormData({...formData, causa_probable: e.target.value})}
                placeholder="¿Cuál es la causa técnica más probable?"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* PASO 4: RECOMENDACIÓN */}
      {paso === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Recomendación Técnica</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Trabajo Recomendado *</Label>
              <Textarea
                value={formData.trabajo_recomendado}
                onChange={(e) => setFormData({...formData, trabajo_recomendado: e.target.value})}
                placeholder="Describe el trabajo técnico necesario..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Riesgos si NO se Repara</Label>
              <Textarea
                value={formData.riesgos_no_reparar}
                onChange={(e) => setFormData({...formData, riesgos_no_reparar: e.target.value})}
                placeholder="¿Qué puede pasar si el cliente no aprueba la reparación?"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Tiempo Estimado (horas) *</Label>
              <Input
                type="number"
                value={formData.tiempo_estimado_horas}
                onChange={(e) => setFormData({...formData, tiempo_estimado_horas: parseFloat(e.target.value) || 0})}
                placeholder="0"
                step="0.5"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Repuestos Requeridos</Label>
                <Button type="button" variant="outline" size="sm" onClick={agregarRepuesto}>
                  + Agregar Repuesto
                </Button>
              </div>

              {formData.repuestos_requeridos.map((repuesto, index) => (
                <div key={index} className="flex gap-2 items-start border p-3 rounded-lg">
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="Descripción del repuesto"
                      value={repuesto.descripcion}
                      onChange={(e) => actualizarRepuesto(index, 'descripcion', e.target.value)}
                    />
                    <Input
                      type="number"
                      placeholder="Cantidad"
                      value={repuesto.cantidad}
                      onChange={(e) => actualizarRepuesto(index, 'cantidad', parseInt(e.target.value) || 1)}
                      className="w-24"
                    />
                  </div>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm"
                    onClick={() => eliminarRepuesto(index)}
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navegación */}
      {paso > 0 && (
        <div className="flex justify-between pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={paso === 1 ? () => setPaso(0) : handleAnterior}
            disabled={saving}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            {paso === 1 ? 'Ver Contexto' : 'Anterior'}
          </Button>

          {paso < 4 ? (
            <Button
              onClick={handleSiguiente}
              disabled={saving || (paso === 1 && !formData.tipo_intervencion)}
              className="bg-gradient-to-r from-purple-500 to-blue-500"
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
              onClick={completarDiagnostico}
              disabled={
                saving || 
                diagnostico?.credito_consumido_finalizacion === true || 
                !formData.trabajo_recomendado || 
                !formData.tiempo_estimado_horas
              }
              className="bg-gradient-to-r from-purple-500 to-blue-500"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Completando...
                </>
              ) : diagnostico?.credito_consumido_finalizacion === true ? (
                '✓ Diagnóstico ya completado'
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Listo para Aprobación
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}