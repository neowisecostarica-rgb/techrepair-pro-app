import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/*
  reassignWorkOrderTechnician — Experimento controlado P1.2
  Responsabilidad MÍNIMA:
    - Autenticar y validar org
    - Actualizar SOLO tecnico_asignado_id (y email opcional)
  
  NO actualiza: ultima_actividad, ultima_actividad_at, estado,
  lifecycle, OTEvent, analytics ni logs complejos.
*/

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // 1. Auth
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgId = user.organization_id || user.impersonating_org_id;
    if (!orgId) {
      return Response.json({ error: 'organization_id no resuelto' }, { status: 403 });
    }

    // 2. Payload
    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Body inválido' }, { status: 400 });
    }

    const { orden_trabajo_id, tecnico_asignado_id, tecnico_asignado_email } = body;

    if (!orden_trabajo_id || !tecnico_asignado_id) {
      return Response.json({ error: 'orden_trabajo_id y tecnico_asignado_id son obligatorios' }, { status: 400 });
    }

    // 3. Validar ownership
    const ordenes = await base44.asServiceRole.entities.OrdenTrabajo.filter({
      id: orden_trabajo_id,
      organization_id: orgId,
    }, 1);

    if (!ordenes || ordenes.length === 0) {
      return Response.json({ error: 'OrdenTrabajo no encontrada en esta organización' }, { status: 404 });
    }

    // 4. Update MÍNIMO — solo tecnico_asignado_id
    const updatePayload = { tecnico_asignado_id };
    if (tecnico_asignado_email) {
      updatePayload.tecnico_asignado_email = tecnico_asignado_email;
    }

    const updatedOT = await base44.asServiceRole.entities.OrdenTrabajo.update(orden_trabajo_id, updatePayload);

    return Response.json({
      success: true,
      orden_trabajo_id,
      tecnico_asignado_id,
      updated_ot: updatedOT,
    });

  } catch (error) {
    console.error(`[reassignWorkOrderTechnician] Error: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});