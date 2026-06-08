import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export default function AtencionRequerida({ clienteId }) {
  const { data: ordenes = [] } = useQuery({
    queryKey: ['ordenes-cliente', clienteId],
    queryFn: () => base44.entities.OrdenTrabajo.filter({ cliente_id: clienteId }),
    enabled: !!clienteId,
  });

  const { data: cotizaciones = [] } = useQuery({
    queryKey: ['cotizaciones-cliente', clienteId],
    queryFn: () => base44.entities.Cotizacion.filter({ cliente_id: clienteId }),
    enabled: !!clienteId,
  });

  // Derivar alertas desde estados existentes
  const alertas = [];

  // OTs activas (estados que requieren atención)
  const otsPendientesRevision = ordenes.filter(o =>
    o.estado === 'EN_COLA_REVISION' || o.estado === 'ASIGNADA'
  );
  const otsPendientesDiagnostico = ordenes.filter(o =>
    o.estado === 'EN_REVISION'
  );
  const otsEsperandoCotizacion = ordenes.filter(o =>
    o.estado === 'DIAGNOSTICADA'
  );
  const otsEsperandoCliente = ordenes.filter(o =>
    o.estado === 'COTIZADA' && o.cliente_aprobado !== true
  );

  if (otsPendientesRevision.length > 0) {
    const n = otsPendientesRevision.length;
    alertas.push(`${n > 1 ? `${n} OTs pendientes` : 'OT pendiente'} de asignación y revisión técnica.`);
  }

  if (otsPendientesDiagnostico.length > 0) {
    const n = otsPendientesDiagnostico.length;
    alertas.push(`${n > 1 ? `${n} OTs en revisión` : 'OT en revisión'} pendiente${n > 1 ? 's' : ''} de diagnóstico técnico.`);
  }

  if (otsEsperandoCotizacion.length > 0) {
    const n = otsEsperandoCotizacion.length;
    alertas.push(`El cliente espera propuesta técnica (${n > 1 ? `${n} OTs diagnosticadas` : '1 OT diagnosticada'}).`);
  }

  if (otsEsperandoCliente.length > 0) {
    const n = otsEsperandoCliente.length;
    alertas.push(`Pendiente de decisión del cliente sobre propuesta de reparación (${n > 1 ? `${n} OTs` : '1 OT'}).`);
  }

  // Cotizaciones pendientes
  const cotsBorrador = cotizaciones.filter(c => c.estado === 'borrador');
  const cotsPendientes = cotizaciones.filter(c =>
    c.estado === 'pendiente' || c.estado === 'enviada'
  );

  if (cotsBorrador.length > 0) {
    const n = cotsBorrador.length;
    alertas.push(`${n > 1 ? `${n} cotizaciones` : 'Cotización'} en borrador pendiente${n > 1 ? 's' : ''} de envío.`);
  }

  if (cotsPendientes.length > 0) {
    const n = cotsPendientes.length;
    alertas.push(`${n > 1 ? `${n} cotizaciones` : 'Cotización'} enviada${n > 1 ? 's' : ''} pendiente${n > 1 ? 's' : ''} de seguimiento.`);
  }

  if (alertas.length === 0) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
        <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
        <p className="text-sm font-medium text-emerald-700">Sin acciones pendientes</p>
      </div>
    );
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
        <p className="text-sm font-semibold text-amber-800">Atención Requerida</p>
      </div>
      <ul className="space-y-1.5 pl-1">
        {alertas.map((alerta, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-amber-800">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
            {alerta}
          </li>
        ))}
      </ul>
    </div>
  );
}