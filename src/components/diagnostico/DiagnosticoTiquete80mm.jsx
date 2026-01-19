import React from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function DiagnosticoTiquete80mm({ 
  ordenTrabajo, 
  diagnostico, 
  cliente, 
  equipo, 
  tecnico 
}) {
  if (!ordenTrabajo || !diagnostico) return null;

  const handleImprimir = () => {
    window.print();
  };

  return (
    <>
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-content-80mm, .print-content-80mm * {
            visibility: visible;
          }
          .print-content-80mm {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm;
            margin: 0;
            padding: 0;
          }
          .no-print-80mm {
            display: none !important;
          }
        }
        @page {
          size: 80mm auto;
          margin: 0;
        }
      `}</style>

      <div className="max-w-md mx-auto p-6 bg-white">
        <div className="print-content-80mm" style={{ width: '80mm', padding: '10mm', fontSize: '12px' }}>
          {/* Header */}
          <div className="text-center border-b-2 border-slate-900 pb-3 mb-3">
            <h1 className="text-lg font-bold">DIAGNÓSTICO TÉCNICO</h1>
            <p className="text-xs text-slate-600 mt-1">Evaluación Profesional</p>
            <p className="text-xs font-mono font-bold mt-2">
              {ordenTrabajo.codigo_ot || 'OT-LEGACY'}
            </p>
          </div>

          {/* Info Cliente */}
          <div className="mb-3 text-xs">
            <div className="mb-1">
              <span className="font-semibold">Cliente:</span>
              <br />
              <span>{cliente?.nombre_completo || 'N/A'}</span>
            </div>
            <div className="mb-1">
              <span className="font-semibold">Teléfono:</span> {cliente?.telefono || 'N/A'}
            </div>
            <div className="mb-1">
              <span className="font-semibold">Equipo:</span>
              <br />
              <span>{equipo ? `${equipo.marca} ${equipo.modelo} (${equipo.tipo})` : 'N/A'}</span>
            </div>
            <div>
              <span className="font-semibold">Fecha:</span> {diagnostico.fecha_completado 
                ? format(new Date(diagnostico.fecha_completado), 'dd/MM/yyyy HH:mm', { locale: es })
                : 'En progreso'}
            </div>
          </div>

          {/* Diagnóstico */}
          <div className="border-t-2 border-slate-900 pt-3 mb-3">
            {diagnostico.trabajo_recomendado && (
              <div className="mb-3">
                <p className="font-semibold text-xs mb-1">TRABAJO RECOMENDADO:</p>
                <p className="text-xs whitespace-pre-wrap">{diagnostico.trabajo_recomendado}</p>
              </div>
            )}

            {diagnostico.riesgos_no_reparar && (
              <div className="mb-3">
                <p className="font-semibold text-xs mb-1">RIESGOS SI NO SE REPARA:</p>
                <p className="text-xs whitespace-pre-wrap">{diagnostico.riesgos_no_reparar}</p>
              </div>
            )}

            {diagnostico.tiempo_estimado_horas > 0 && (
              <div className="mb-2">
                <p className="font-semibold text-xs">
                  Tiempo estimado: {diagnostico.tiempo_estimado_horas} {diagnostico.tiempo_estimado_horas === 1 ? 'hora' : 'horas'}
                </p>
              </div>
            )}

            {diagnostico.repuestos_requeridos && diagnostico.repuestos_requeridos.length > 0 && (
              <div className="mb-3">
                <p className="font-semibold text-xs mb-1">REPUESTOS NECESARIOS:</p>
                {diagnostico.repuestos_requeridos.map((repuesto, idx) => (
                  <div key={idx} className="text-xs mb-1 pl-2">
                    • {repuesto.descripcion} (Cant: {repuesto.cantidad})
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t-2 border-slate-900 pt-3 text-xs">
            <div className="mb-2">
              <span className="font-semibold">Técnico:</span> {tecnico?.user_email || 'N/A'}
            </div>
            <div className="mb-3">
              <span className="font-semibold">Emisión:</span> {format(new Date(), 'dd/MM/yyyy', { locale: es })}
            </div>
            <p className="text-center text-xs text-slate-500 border-t pt-2">
              Los costos finales serán confirmados en cotización formal
            </p>
          </div>
        </div>

        {/* Botones (no imprimir) */}
        <div className="no-print-80mm flex gap-3 mt-6">
          <button
            onClick={handleImprimir}
            className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
          >
            Imprimir 80mm
          </button>
        </div>
      </div>
    </>
  );
}