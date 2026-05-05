import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // 1. Autenticar usuario
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { ordenTrabajoId, diagnostico_resumido } = await req.json();

    if (!ordenTrabajoId || !diagnostico_resumido) {
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

    // 4. UPDATE PARCIAL — incluir estado existente para satisfacer el campo required
    const updatedOT = await base44.asServiceRole.entities.OrdenTrabajo.update(ordenTrabajoId, {
      diagnostico_resumido,
      estado: ot.estado
    });

    return Response.json({ success: true, data: updatedOT });

  } catch (error) {
    console.error('updateDiagnosticoResumen error:', error);
    return Response.json({ error: error.message || 'Error actualizando diagnóstico' }, { status: 500 });
  }
});