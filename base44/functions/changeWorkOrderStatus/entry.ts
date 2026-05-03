import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const VALID_STATUSES = [
  'EN_COLA_REVISION', 'ASIGNADA', 'EN_REVISION', 'DIAGNOSTICADA',
  'COTIZADA', 'EN_REPARACION', 'FINALIZADA', 'ENTREGADA', 'CANCELADA'
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const orgId = user.organization_id || user.impersonating_org_id;
    if (!orgId) return Response.json({ error: 'organization_id no resuelto para este usuario' }, { status: 403 });

    const body = await req.json();
    const { orden_trabajo_id, newStatus } = body;

    if (!orden_trabajo_id || !newStatus) {
      return Response.json({ error: 'orden_trabajo_id y newStatus son obligatorios' }, { status: 400 });
    }

    if (!VALID_STATUSES.includes(newStatus)) {
      return Response.json({ error: `newStatus inválido. Valores permitidos: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
    }

    // Validar que la OT pertenezca a la organización del usuario
    const ordenes = await base44.entities.OrdenTrabajo.filter({ id: orden_trabajo_id, organization_id: orgId });
    if (!ordenes || ordenes.length === 0) {
      return Response.json({ error: 'Orden de trabajo no encontrada en esta organización' }, { status: 404 });
    }

    const orden = await base44.entities.OrdenTrabajo.update(orden_trabajo_id, {
      estado: newStatus,
      ultima_actividad: `Estado cambiado a ${newStatus}`,
      ultima_actividad_at: new Date().toISOString(),
    });

    return Response.json(orden);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});