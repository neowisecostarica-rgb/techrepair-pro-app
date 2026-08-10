import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { isCanonicalSuperAdmin } from '../_shared/userAuthorization.ts';

// ─────────────────────────────────────────────────────────────────────────────
// dmrUtils — Endpoint de utilidades de diagnóstico para el DMR
//
// Expone operaciones de soporte: verificar OT huérfana (sin DMR activo),
// listar DMRs por OT, verificar idempotencia de dmr_number.
// Usado por tareas de QA/auditoría y health checks.
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Solo admin o super_admin pueden usar utilidades DMR
    if (!isCanonicalSuperAdmin(user)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { operation, otId, orgId, dmrNumber } = body;

    // ── Operación: verificar si una OT tiene DMR activo ──────────────────────
    if (operation === 'checkOtHasDmr') {
      if (!otId) return Response.json({ error: 'otId requerido' }, { status: 400 });
      const dmrs = await base44.asServiceRole.entities.DiagnosticMasterRecord.filter({
        orden_trabajo_id: otId,
        document_status: 'ACTIVE'
      });
      return Response.json({
        hasActiveDmr: dmrs && dmrs.length > 0,
        dmrCount: dmrs ? dmrs.length : 0,
        dmrs: dmrs || []
      });
    }

    // ── Operación: listar todos los DMRs de una OT (historial de versiones) ──
    if (operation === 'listDmrsByOt') {
      if (!otId) return Response.json({ error: 'otId requerido' }, { status: 400 });
      const dmrs = await base44.asServiceRole.entities.DiagnosticMasterRecord.filter({
        orden_trabajo_id: otId
      });
      return Response.json({ dmrs: dmrs || [] });
    }

    // ── Operación: verificar si un dmr_number ya existe (idempotencia) ───────
    if (operation === 'checkDmrNumberExists') {
      if (!dmrNumber) return Response.json({ error: 'dmrNumber requerido' }, { status: 400 });
      const dmrs = await base44.asServiceRole.entities.DiagnosticMasterRecord.filter({
        dmr_number: dmrNumber
      });
      return Response.json({ exists: dmrs && dmrs.length > 0 });
    }

    // ── Operación: listar OTs de una org sin DMR activo (health check) ───────
    if (operation === 'listOrphanOTs') {
      if (!orgId) return Response.json({ error: 'orgId requerido' }, { status: 400 });
      // Obtener OTs activas
      const activeStates = ['EN_COLA_REVISION', 'ASIGNADA', 'EN_REVISION', 'DIAGNOSTICADA', 'COTIZADA', 'APROBADA', 'EN_REPARACION', 'PRUEBAS'];
      const allOTs = await base44.asServiceRole.entities.OrdenTrabajo.filter({ organization_id: orgId });
      const activeOTs = (allOTs || []).filter(ot => activeStates.includes(ot.estado));

      // Obtener todos los DMRs activos de la org
      const allDmrs = await base44.asServiceRole.entities.DiagnosticMasterRecord.filter({
        organization_id: orgId,
        document_status: 'ACTIVE'
      });
      const otIdsWithDmr = new Set((allDmrs || []).map(d => d.orden_trabajo_id));

      const orphanOTs = activeOTs.filter(ot => !otIdsWithDmr.has(ot.id));

      return Response.json({
        totalActiveOTs: activeOTs.length,
        orphanCount: orphanOTs.length,
        orphanOTs: orphanOTs.map(ot => ({ id: ot.id, codigo_ot: ot.codigo_ot, estado: ot.estado, fecha_ingreso: ot.fecha_ingreso }))
      });
    }

    return Response.json({ error: 'Operación no reconocida' }, { status: 400 });

  } catch (error) {
    console.error(`[dmrUtils] Error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
