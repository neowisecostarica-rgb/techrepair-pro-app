import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Wrench, Calendar, CheckCircle2, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const TIPOS_INTERVENCION_LABELS = {
  diagnostico_tecnico: 'Diagnóstico técnico completo',
  mantenimiento_preventivo: 'Mantenimiento preventivo',
  mantenimiento_correctivo: 'Mantenimiento correctivo',
  limpieza: 'Limpieza y mantenimiento',
  reparacion_puntual: 'Reparación puntual',
  revision_general: 'Revisión general',
  otro: 'Otro'
};

export default function DiagnosticoDocumentoA4({ 
  ordenTrabajo, 
  diagnostico, 
  cliente, 
  equipo, 
  tecnico 
}) {
  if (!ordenTrabajo || !diagnostico) return null;

  const handleGenerarPDF = () => {
    window.print();
  };

  return (
    <>
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-content-a4, .print-content-a4 * {
            visibility: visible;
          }
          .print-content-a4 {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print-a4 {
            display: none !important;
          }
          .seccion-tecnica-interna {
            display: none !important;
          }
          .print-footer {
            display: block !important;
            page-break-before: avoid;
            margin-top: 40px;
          }
        }
        @page {
          size: A4;
          margin: 20mm;
        }
        .print-footer {
          display: none;
        }
      `}</style>

      <div className="max-w-5xl mx-auto bg-white p-8 shadow-lg rounded-xl">
        <div className="print-content-a4">
          {/* Header */}
          <div className="border-b border-slate-200 pb-6 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 mb-2">Diagnóstico Técnico</h1>
                <p className="text-slate-600">Evaluación profesional del equipo</p>
              </div>
              <div className="text-right">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-xl flex items-center justify-center text-white font-bold mb-2">
                  <Wrench className="w-8 h-8" />
                </div>
                <p className="text-xs font-mono text-emerald-600 font-bold">
                  {ordenTrabajo.codigo_ot || 'OT-LEGACY'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6 p-4 bg-slate-50 rounded-lg">
              <div>
                <p className="text-xs text-slate-500">Cliente</p>
                <p className="font-semibold text-slate-900">{cliente?.nombre_completo || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Teléfono</p>
                <p className="font-medium text-slate-900">{cliente?.telefono || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Equipo</p>
                <p className="font-medium text-slate-900">
                  {equipo ? `${equipo.marca} ${equipo.modelo} (${equipo.tipo})` : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Fecha de Diagnóstico</p>
                <p className="font-medium text-slate-900">
                  {diagnostico.fecha_completado 
                    ? format(new Date(diagnostico.fecha_completado), 'dd MMM yyyy HH:mm', { locale: es })
                    : 'En progreso'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Estado de OT</p>
                <Badge className="bg-yellow-100 text-yellow-700 border-0 mt-1">
                  {ordenTrabajo.estado}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-slate-500">Técnico Responsable</p>
                <p className="font-medium text-slate-900">{tecnico?.user_email || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* SECCIÓN TÉCNICA INTERNA (NO IMPRIME) */}
          <div className="seccion-tecnica-interna no-print-a4 mb-8">
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader className="border-b border-blue-200">
                <CardTitle className="text-blue-900 flex items-center gap-2">
                  <Wrench className="w-5 h-5" />
                  Información Técnica Interna
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">Tipo de Intervención</h4>
                  <p className="text-slate-700">
                    {TIPOS_INTERVENCION_LABELS[diagnostico.tipo_intervencion] || diagnostico.tipo_intervencion}
                  </p>
                </div>

                {diagnostico.componentes_revisar && diagnostico.componentes_revisar.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-2">Componentes Revisados</h4>
                    <div className="flex flex-wrap gap-2">
                      {diagnostico.componentes_revisar.map((comp, idx) => (
                        <Badge key={idx} variant="outline" className="capitalize">
                          {comp}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {diagnostico.pruebas_realizadas && Object.keys(diagnostico.pruebas_realizadas).length > 0 && (
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-3">Pruebas Técnicas Realizadas</h4>
                    <div className="space-y-2 text-sm">
                      {Object.entries(diagnostico.pruebas_realizadas).map(([key, prueba]) => (
                        <div key={key} className="flex items-center justify-between p-2 bg-white rounded border">
                          <span className="text-slate-700">{key.replace(/_/g, ' ')}</span>
                          <Badge className={`${
                            prueba.resultado === 'ok' ? 'bg-green-100 text-green-700' :
                            prueba.resultado === 'falla' ? 'bg-red-100 text-red-700' :
                            'bg-slate-100 text-slate-700'
                          } border-0`}>
                            {prueba.resultado === 'ok' ? '✓ OK' : 
                             prueba.resultado === 'falla' ? '✗ Falla' : 'N/A'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {diagnostico.hallazgos?.problemas && (
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-2">Hallazgos Técnicos Detallados</h4>
                    <p className="text-slate-700 whitespace-pre-wrap bg-white p-3 rounded border">
                      {diagnostico.hallazgos.problemas}
                    </p>
                  </div>
                )}

                {diagnostico.causa_probable && (
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-2">Causa Técnica Probable</h4>
                    <p className="text-slate-700 whitespace-pre-wrap bg-white p-3 rounded border">
                      {diagnostico.causa_probable}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* SECCIÓN CLIENTE (SE IMPRIME) */}
          <div className="seccion-cliente space-y-6">
            <div className="border-l-4 border-emerald-500 pl-4">
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Diagnóstico y Recomendación</h2>
            </div>

            {diagnostico.trabajo_recomendado && (
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  Trabajo Recomendado
                </h3>
                <p className="text-slate-700 leading-relaxed whitespace-pre-wrap bg-emerald-50 p-4 rounded-lg border border-emerald-200">
                  {diagnostico.trabajo_recomendado}
                </p>
              </div>
            )}

            {diagnostico.riesgos_no_reparar && (
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  Riesgos si NO se Repara
                </h3>
                <p className="text-slate-700 leading-relaxed whitespace-pre-wrap bg-amber-50 p-4 rounded-lg border border-amber-200">
                  {diagnostico.riesgos_no_reparar}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              {diagnostico.tiempo_estimado_horas > 0 && (
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs text-blue-700 font-semibold mb-1 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Tiempo Estimado
                  </p>
                  <p className="text-2xl font-bold text-blue-900">
                    {diagnostico.tiempo_estimado_horas} {diagnostico.tiempo_estimado_horas === 1 ? 'hora' : 'horas'}
                  </p>
                </div>
              )}

              {diagnostico.repuestos_requeridos && diagnostico.repuestos_requeridos.length > 0 && (
                <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <p className="text-xs text-purple-700 font-semibold mb-1">Repuestos Necesarios</p>
                  <p className="text-2xl font-bold text-purple-900">
                    {diagnostico.repuestos_requeridos.length} {diagnostico.repuestos_requeridos.length === 1 ? 'item' : 'items'}
                  </p>
                </div>
              )}
            </div>

            {diagnostico.repuestos_requeridos && diagnostico.repuestos_requeridos.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-3">Lista de Repuestos Requeridos</h3>
                <div className="space-y-2">
                  {diagnostico.repuestos_requeridos.map((repuesto, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border">
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{repuesto.descripcion}</p>
                      </div>
                      <Badge variant="outline" className="ml-4">
                        Cantidad: {repuesto.cantidad}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Alert className="bg-blue-50 border-blue-200">
              <AlertDescription className="text-blue-800 text-sm">
                <strong>Nota importante:</strong> Este diagnóstico es una evaluación técnica profesional.
                Los costos finales y disponibilidad de repuestos serán confirmados en la cotización formal.
              </AlertDescription>
            </Alert>
          </div>

          {/* Footer de Impresión */}
          <div className="print-footer mt-12 pt-6 border-t border-slate-200">
            <div className="grid grid-cols-3 gap-8 mb-8">
              <div>
                <p className="text-xs text-slate-500 mb-2">Fecha de Emisión</p>
                <p className="font-medium text-slate-900">
                  {format(new Date(), 'dd/MM/yyyy', { locale: es })}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-2">Técnico Responsable</p>
                <p className="font-medium text-slate-900">{tecnico?.user_email || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-2">Código de Diagnóstico</p>
                <p className="font-mono text-xs text-slate-700">{diagnostico.id}</p>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-6 space-y-4">
              <div>
                <p className="text-xs text-slate-500 mb-3">Firma del Técnico</p>
                <div className="border-b border-slate-300 w-64 h-16" />
              </div>
            </div>

            <p className="text-xs text-slate-400 text-center mt-6">
              Este documento es confidencial y de uso exclusivo para el cliente y el taller
            </p>
          </div>
        </div>

        {/* Botones (no imprimir) */}
        <div className="no-print-a4 flex gap-3 mt-6">
          <button
            onClick={handleGenerarPDF}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
          >
            Guardar / Exportar PDF
          </button>
        </div>
      </div>
    </>
  );
}