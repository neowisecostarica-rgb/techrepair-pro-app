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

    const VALID_ESTADOS_ATENCION = ['ACTIVO', 'PAUSADO', 'ESPERANDO'];
    const VALID_MOTIVOS_PAUSA = ['esperando_repuesto', 'esperando_cliente', 'interrupcion', 'otro'];

    const body = await req.json();
    const { orden_trabajo_id, newStatus, estado_atencion, motivo_pausa, ultima_actividad_at } = body;

    if (!orden_trabajo_id) {
      return Response.json({ error: 'orden_trabajo_id es obligatorio' }, { status: 400 });
    }

    // Evitar updates vacíos
    if (!newStatus && estado_atencion === undefined && motivo_pausa === undefined && !ultima_actividad_at) {
      return Response.json({ error: 'Debe informar al menos un campo para actualizar (newStatus, estado_atencion, motivo_pausa o ultima_actividad_at)' }, { status: 400 });
    }

    if (newStatus && !VALID_STATUSES.includes(newStatus)) {
      return Response.json({ error: `newStatus inválido. Valores permitidos: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
    }

    if (estado_atencion !== undefined && !VALID_ESTADOS_ATENCION.includes(estado_atencion)) {
      return Response.json({ error: `estado_atencion inválido. Valores permitidos: ${VALID_ESTADOS_ATENCION.join(', ')}` }, { status: 400 });
    }

    if (motivo_pausa !== undefined && motivo_pausa !== null && !VALID_MOTIVOS_PAUSA.includes(motivo_pausa)) {
      return Response.json({ error: `motivo_pausa inválido. Valores permitidos: ${VALID_MOTIVOS_PAUSA.join(', ')}` }, { status: 400 });
    }

    // Validar que la OT pertenezca a la organización del usuario
    const ordenes = await base44.entities.OrdenTrabajo.filter({ id: orden_trabajo_id, organization_id: orgId });
    if (!ordenes || ordenes.length === 0) {
      return Response.json({ error: 'Orden de trabajo no encontrada en esta organización' }, { status: 404 });
    }

    const updatePayload = {
      ultima_actividad_at: ultima_actividad_at || new Date().toISOString(),
    };
    if (newStatus) {
      updatePayload.estado = newStatus;
      updatePayload.ultima_actividad = `Estado cambiado a ${newStatus}`;
    }
    if (estado_atencion !== undefined) updatePayload.estado_atencion = estado_atencion;
    if (motivo_pausa !== undefined) updatePayload.motivo_pausa = motivo_pausa || null;

    const orden = await base44.asServiceRole.entities.OrdenTrabajo.update(orden_trabajo_id, updatePayload);

    return Response.json(orden);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});