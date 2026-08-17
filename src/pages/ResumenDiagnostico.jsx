import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { listIdentityAccounts } from '@/api/identity';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Printer, FileText, ArrowLeft, AlertTriangle } from 'lucide-react';
import { createPageUrl } from '../utils';
import { useAuthContext } from '@/components/contexts/AuthContext';
import DiagnosticoTiquete80mm from '@/components/diagnostico/DiagnosticoTiquete80mm';
import DiagnosticoDocumentoA4 from '@/components/diagnostico/DiagnosticoDocumentoA4';

export default function ResumenDiagnostico() {
  const urlParams = new URLSearchParams(window.location.search);
  const otId = urlParams.get('ot_id');
  const diagnosticoId = urlParams.get('diagnostico_id');
  const { effectiveOrgId } = useAuthContext();
  const [vistaActiva, setVistaActiva] = useState('menu'); // 'menu' | '80mm' | 'a4'

  // Fetch OT
  const { data: ordenTrabajo, isLoading: loadingOT } = useQuery({
    queryKey: ['orden', otId],
    queryFn: async () => {
      const ots = await base44.entities.OrdenTrabajo.filter({ id: otId, organization_id: effectiveOrgId });
      return ots[0];
    },
    enabled: !!otId && !!effectiveOrgId,
  });

  // Fetch Diagnóstico Técnico
  const { data: diagnostico, isLoading: loadingDiag } = useQuery({
    queryKey: ['diagnostico-tecnico', diagnosticoId],
    queryFn: async () => {
      const diags = await base44.entities.DiagnosticoTecnico.filter({ id: diagnosticoId, organization_id: effectiveOrgId });
      return diags[0];
    },
    enabled: !!diagnosticoId && !!effectiveOrgId,
  });

  // Fetch Cliente
  const { data: cliente } = useQuery({
    queryKey: ['cliente', ordenTrabajo?.cliente_id],
    queryFn: async () => {
      const clientes = await base44.entities.Cliente.filter({ id: ordenTrabajo.cliente_id, organization_id: effectiveOrgId });
      return clientes[0];
    },
    enabled: !!ordenTrabajo?.cliente_id,
  });

  // Fetch Equipo
  const { data: equipo } = useQuery({
    queryKey: ['equipo', ordenTrabajo?.equipo_id],
    queryFn: async () => {
      const equipos = await base44.entities.Equipo.filter({ id: ordenTrabajo.equipo_id, organization_id: effectiveOrgId });
      return equipos[0];
    },
    enabled: !!ordenTrabajo?.equipo_id,
  });

  // Fetch Usuario técnico
  const { data: tecnico } = useQuery({
    queryKey: ['user-account-tecnico', diagnostico?.tecnico_id],
    queryFn: async () => {
      const { accounts } = await listIdentityAccounts(effectiveOrgId);
      return accounts.find(account => account.user_id === diagnostico.tecnico_id);
    },
    enabled: !!diagnostico?.tecnico_id,
  });

  const handleGenerarCotizacion = () => {
    window.location.href = createPageUrl('OrdenesTrabajo') + `?openCotizacion=${otId}`;
  };

  const handleVolverAOrden = () => {
    window.location.href = createPageUrl('OrdenesTrabajo') + `?openDetail=${otId}`;
  };

  const handleImprimir80mm = () => {
    setVistaActiva('80mm');
  };

  const handleExportarA4 = () => {
    setVistaActiva('a4');
  };

  const handleVolverMenu = () => {
    setVistaActiva('menu');
  };

  if (loadingOT || loadingDiag) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Cargando diagnóstico...</p>
        </div>
      </div>
    );
  }

  if (!ordenTrabajo || !diagnostico) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Alert className="max-w-md">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>
            <p className="font-semibold mb-2">Diagnóstico no disponible</p>
            <p className="text-sm">No se encontró el diagnóstico técnico solicitado.</p>
            <Button
              onClick={() => window.location.href = createPageUrl('OrdenesTrabajo')}
              className="mt-4"
              size="sm"
            >
              Volver a Órdenes
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Renderizar vista según selección
  if (vistaActiva === '80mm') {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mb-6">
          <Button onClick={handleVolverMenu} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver al Menú
          </Button>
        </div>
        <DiagnosticoTiquete80mm
          ordenTrabajo={ordenTrabajo}
          diagnostico={diagnostico}
          cliente={cliente}
          equipo={equipo}
          tecnico={tecnico}
        />
      </div>
    );
  }

  if (vistaActiva === 'a4') {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mb-6">
          <Button onClick={handleVolverMenu} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver al Menú
          </Button>
        </div>
        <DiagnosticoDocumentoA4
          ordenTrabajo={ordenTrabajo}
          diagnostico={diagnostico}
          cliente={cliente}
          equipo={equipo}
          tecnico={tecnico}
        />
      </div>
    );
  }

  // Vista Menu Principal
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Button
            onClick={handleVolverAOrden}
            variant="outline"
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver a Orden
          </Button>
          <h1 className="text-3xl font-bold text-slate-900">Resumen de Diagnóstico</h1>
          <p className="text-slate-600 mt-2">
            OT: <span className="font-mono font-bold text-emerald-600">{ordenTrabajo.codigo_ot || 'OT-LEGACY'}</span>
          </p>
        </div>

        {/* Info Rápida */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-slate-500">Cliente</p>
              <p className="font-semibold text-slate-900">{cliente?.nombre_completo || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Equipo</p>
              <p className="font-medium text-slate-900">
                {equipo ? `${equipo.marca} ${equipo.modelo}` : 'N/A'}
              </p>
            </div>
          </div>
        </div>

        {/* Opciones de Impresión */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-xl shadow-lg p-6 border-2 border-emerald-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
                <Printer className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-slate-900">Impresora Térmica</h3>
                <p className="text-sm text-slate-600">Formato 80mm</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Ideal para impresoras térmicas de recibos. Layout optimizado en ancho de 80mm.
            </p>
            <Button
              onClick={handleImprimir80mm}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              <Printer className="w-4 h-4 mr-2" />
              Imprimir 80mm
            </Button>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 border-2 border-purple-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-slate-900">Documento Formal</h3>
                <p className="text-sm text-slate-600">Formato A4</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              Documento completo en formato A4. Ideal para guardar PDF, enviar por email o WhatsApp.
            </p>
            <Button
              onClick={handleExportarA4}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              <FileText className="w-4 h-4 mr-2" />
              Ver formato A4
            </Button>
          </div>
        </div>

        {/* Acciones Adicionales */}
        <div className="flex gap-3">
          <Button
            onClick={handleGenerarCotizacion}
            className="w-full bg-gradient-to-r from-emerald-500 to-blue-500"
          >
            <FileText className="w-4 h-4 mr-2" />
            Generar Cotización
          </Button>
        </div>
      </div>
    </div>
  );
}
