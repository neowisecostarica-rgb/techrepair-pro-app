/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SFHS: ExpedienteOT — Página Principal
 * ═══════════════════════════════════════════════════════════════════════════
 * STATUS: ACTIVE
 * ROUTE: /expediente/:id
 * DESCRIPTION: Expediente OT Unificado V1. Centro de mando completo por OT.
 * PHASES: F1 (Estructura) + F2 (Header) + F3 (Centro Mando) + F4 (Timeline)
 *         + F5 (Técnica) + F6 (Comercial)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuthContext } from '@/components/contexts/AuthContext';
import { Loader2, ArrowLeft, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import ExpedienteHeader from '@/components/expediente/ExpedienteHeader';
import CentroMando from '@/components/expediente/CentroMando';
import TimelineViewer from '@/components/expediente/TimelineViewer';
import ExpedienteTecnico from '@/components/expediente/ExpedienteTecnico';
import ExpedienteComercial from '@/components/expediente/ExpedienteComercial';
import PageGuard from '@/components/guards/PageGuard';

export default function ExpedienteOT() {
  return (
    <PageGuard allowedRoles={['SALES', 'ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN', 'AUDITOR']}>
      <ExpedienteOTContent />
    </PageGuard>
  );
}

function ExpedienteOTContent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { effectiveOrgId, effectiveRole, user } = useAuthContext();

  // ── Carga de OT principal ─────────────────────────────────────────────────
  const { data: ot, isLoading: loadingOT, isError } = useQuery({
    queryKey: ['expediente-ot', id],
    queryFn: async () => {
      const results = await base44.entities.OrdenTrabajo.filter({ id });
      return results[0] || null;
    },
    enabled: !!id,
    staleTime: 30 * 1000,
  });

  // ── Carga paralela de datos relacionados ─────────────────────────────────
  const { data: cliente } = useQuery({
    queryKey: ['expediente-cliente', ot?.cliente_id],
    queryFn: () => base44.entities.Cliente.filter({ id: ot.cliente_id }).then(r => r[0]),
    enabled: !!ot?.cliente_id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: equipo } = useQuery({
    queryKey: ['expediente-equipo', ot?.equipo_id],
    queryFn: () => base44.entities.Equipo.filter({ id: ot.equipo_id }).then(r => r[0]),
    enabled: !!ot?.equipo_id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: tecnico } = useQuery({
    queryKey: ['expediente-tecnico', ot?.tecnico_asignado_id],
    queryFn: () => base44.entities.UserAccount.filter({
      user_id: ot.tecnico_asignado_id,
      organization_id: effectiveOrgId,
    }).then(r => r[0]),
    enabled: !!ot?.tecnico_asignado_id,
    staleTime: 5 * 60 * 1000,
  });

  // ── Carga de ventas relacionadas (para indicadores del header) ────────────
  const { data: ventas = [] } = useQuery({
    queryKey: ['expediente-ventas', id],
    queryFn: () => base44.entities.Venta.filter({ referencia_ot_id: id }),
    enabled: !!id,
    staleTime: 60 * 1000,
  });

  // ── Carga de cotizaciones ─────────────────────────────────────────────────
  const { data: cotizaciones = [] } = useQuery({
    queryKey: ['expediente-cotizaciones', id],
    queryFn: () => base44.entities.Cotizacion.filter({ referencia_ot_id: id }),
    enabled: !!id,
    staleTime: 60 * 1000,
  });

  // ── Estados de pago derivados ────────────────────────────────────────────
  const ventaPagada = ventas.find(v => v.estado === 'pagada' && v.tipo_concepto !== 'revision_diagnostico');
  const revisionPagada = ot?.diagnostico_habilitado;
  const cotizacionAprobada = cotizaciones.find(c => c.estado === 'aprobada');

  // ── Loading / Error states ────────────────────────────────────────────────
  if (loadingOT) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mr-3" />
        <span className="text-slate-500">Cargando expediente...</span>
      </div>
    );
  }

  if (isError || !ot) {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center">
        <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">Expediente no encontrado</h2>
        <p className="text-slate-500 mb-6">La orden de trabajo solicitada no existe o no tienes acceso.</p>
        <Button variant="outline" onClick={() => navigate('/OrdenesTrabajo')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver a Órdenes
        </Button>
      </div>
    );
  }

  // Guard multitenant
  if (ot.organization_id !== effectiveOrgId) {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center">
        <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">Acceso denegado</h2>
        <Button variant="outline" onClick={() => navigate('/OrdenesTrabajo')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4">

      {/* ── Navegación de regreso ──────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/OrdenesTrabajo')}
          className="text-slate-500 hover:text-slate-900 -ml-2"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Órdenes de Trabajo
        </Button>
        <span className="text-slate-300">/</span>
        <span className="text-sm text-slate-600 font-mono">{ot.codigo_ot}</span>
      </div>

      {/* ── FASE 2: Header Ejecutivo ───────────────────────────────────────── */}
      <ExpedienteHeader
        ot={ot}
        cliente={cliente}
        equipo={equipo}
        tecnico={tecnico}
        revisionPagada={revisionPagada}
        cotizacionAprobada={!!cotizacionAprobada}
        ventaPagada={!!ventaPagada}
      />

      {/* ── FASE 3: Centro de Mando ────────────────────────────────────────── */}
      <CentroMando ot={ot} effectiveRole={effectiveRole} />

      {/* ── Cuerpo principal en tabs ───────────────────────────────────────── */}
      <Tabs defaultValue="timeline" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="timeline">📋 Bitácora</TabsTrigger>
          <TabsTrigger value="tecnico">🔬 Técnico</TabsTrigger>
          <TabsTrigger value="comercial">💰 Comercial</TabsTrigger>
        </TabsList>

        {/* ── FASE 4: Timeline ──────────────────────────────────────────────── */}
        <TabsContent value="timeline" className="mt-4">
          <TimelineViewer
            ordenTrabajoId={id}
            organizationId={effectiveOrgId}
          />
        </TabsContent>

        {/* ── FASE 5: Integración Técnica ───────────────────────────────────── */}
        <TabsContent value="tecnico" className="mt-4">
          <ExpedienteTecnico
            ot={ot}
            organizationId={effectiveOrgId}
            effectiveRole={effectiveRole}
          />
        </TabsContent>

        {/* ── FASE 6: Integración Comercial ─────────────────────────────────── */}
        <TabsContent value="comercial" className="mt-4">
          <ExpedienteComercial
            ot={ot}
            ventas={ventas}
            cotizaciones={cotizaciones}
            effectiveRole={effectiveRole}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}