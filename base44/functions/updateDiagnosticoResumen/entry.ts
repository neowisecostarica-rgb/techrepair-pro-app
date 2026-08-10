import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { isCanonicalActiveUserAccount } from '../_shared/userAuthorization.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // 1. Autenticar usuario
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { ordenTrabajoId, diagnostico_resumido, audit_event, audit_only } = await req.json();

    if (!ordenTrabajoId || (!diagnostico_resumido && audit_only !== true)) {
      return Response.json({ error: 'ordenTrabajoId y diagnostico_resumido son requeridos' }, { status: 400 });
    }

    // 2. Obtener OT actual (service role para omitir RLS en lectura)
    const [ot] = await base44.asServiceRole.entities.OrdenTrabajo.filter({ id: ordenTrabajoId });

    if (!ot) {
      return Response.json({ error: 'Orden de Trabajo no encontrada' }, { status: 404 });
    }

    // 3. VALIDACIÓN MULTI-TENANT (asServiceRole omite RLS — validar manualmente)
    const orgId = user.organization_id || user.impersonating_org_id;
    if (ot.organization_id !== orgId) {
      return Response.json({ error: 'Forbidden: acceso denegado' }, { status: 403 });
    }
    if (user.is_super_admin !== true) {
      const accounts = await base44.asServiceRole.entities.UserAccount.filter({
        user_id: user.id,
        organization_id: orgId,
      }, 10);
      if (!(accounts || []).some(isCanonicalActiveUserAccount)) {
        return Response.json({ error: 'Cuenta no activa' }, { status: 403 });
      }
    }

    if (audit_event?.type === 'PRE_DIAGNOSTICO_EDITADO') {
      const changedFields = Array.isArray(audit_event.changed_fields)
        ? audit_event.changed_fields.filter(field => typeof field === 'string').slice(0, 20)
        : [];
      await base44.asServiceRole.entities.OTEvent.create({
        organization_id: orgId,
        orden_trabajo_id: ot.id,
        tipo: 'PRE_DIAGNOSTICO_EDITADO',
        created_by_user_id: user.id,
        created_at: new Date().toISOString(),
        processed: false,
        detalle: JSON.stringify({ campos_modificados: changedFields, usuario_ejecutor: user.id }),
      });
    }

    if (audit_only === true) {
      return Response.json({ success: true, audit_recorded: true });
    }

    // 4. UPDATE PARCIAL — incluir estado existente para satisfacer el campo required
    // Fallback defensivo: registros legacy pueden tener estado null
    if (!ot.estado) {
      console.warn(`[updateDiagnosticoResumen] OT ${ordenTrabajoId} tiene estado null/undefined — aplicando fallback EN_COLA_REVISION`);
    }
    const updatedOT = await base44.asServiceRole.entities.OrdenTrabajo.update(ordenTrabajoId, {
      diagnostico_resumido,
      estado: ot.estado || 'EN_COLA_REVISION'
    });

    return Response.json({ success: true, data: updatedOT });

  } catch (error) {
    console.error('updateDiagnosticoResumen error:', error);
    return Response.json({ error: error.message || 'Error actualizando diagnóstico' }, { status: 500 });
  }
});
