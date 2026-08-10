import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { isCanonicalSuperAdmin } from '../_shared/userAuthorization.ts';

// ─────────────────────────────────────────────────────────────────────────────
// dmrAuditor — Endpoint dedicado de observabilidad del DMR
//
// Responsabilidad exclusiva: exponer consultas de auditoría sobre eventos
// de ciclo de vida del DMR registrados en SuperAdminAudit.
// Separado del orquestador para:
//   1. Evolucionar políticas de log sin riesgo transaccional.
//   2. Reutilización desde otros módulos de integridad.
//   3. Reemplazo futuro por servicio externo sin tocar el orquestador.
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    if (!isCanonicalSuperAdmin(user)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { operation, orgId, otId, limit } = body;

    // ── Operación: consultar eventos DMR por organización ────────────────────
    if (operation === 'getDmrAuditByOrg') {
      if (!orgId) return Response.json({ error: 'orgId requerido' }, { status: 400 });
      const events = await base44.asServiceRole.entities.SuperAdminAudit.filter({
        target_organization_id: orgId
      }, '-created_date', limit || 50);

      const dmrEvents = (events || []).filter(e =>
        e.action && e.action.startsWith('DMR_')
      );

      return Response.json({ events: dmrEvents, count: dmrEvents.length });
    }

    // ── Operación: consultar fallos de rollback (OTs huérfanas detectadas) ───
    if (operation === 'getRollbackFailures') {
      const events = await base44.asServiceRole.entities.SuperAdminAudit.filter(
        { action: 'DMR_ROLLBACK_FAILED_OT_ORPHAN' },
        '-created_date',
        limit || 20
      );
      return Response.json({ failures: events || [], count: events ? events.length : 0 });
    }

    // ── Operación: contar DMRs creados por org en período ────────────────────
    if (operation === 'countDmrCreated') {
      if (!orgId) return Response.json({ error: 'orgId requerido' }, { status: 400 });
      const events = await base44.asServiceRole.entities.SuperAdminAudit.filter({
        target_organization_id: orgId,
        action: 'DMR_CREATED'
      });
      return Response.json({ count: events ? events.length : 0 });
    }

    return Response.json({ error: 'Operación no reconocida' }, { status: 400 });

  } catch (error) {
    console.error(`[dmrAuditor] Error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
