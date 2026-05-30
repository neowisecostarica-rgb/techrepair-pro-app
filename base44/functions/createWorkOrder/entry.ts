import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // ── PATRÓN OFICIAL: RESOLUCIÓN CONSOLIDADA DE organization_id ──────────────
    let orgId = user.impersonating_org_id || user.organization_id;
    if (!orgId && user.id) {
      const accounts = await base44.asServiceRole.entities.UserAccount.filter({ user_id: user.id }, 1);
      if (accounts && accounts.length > 0) orgId = accounts[0].organization_id || null;
    }
    if (!orgId) return Response.json({ error: 'organization_id no resuelto para este usuario' }, { status: 403 });
    // ── FIN PATRÓN OFICIAL ─────────────────────────────────────────────────────

    const body = await req.json();
    const {
      cliente_id, equipo_id, motivo_ingreso,
      branch_id, tipo_ingreso, prioridad,
      observaciones_ingreso, serie_ingreso,
      accesorios_ingreso, estado_fisico_ingreso,
      contrasena_ingreso, responsable_recepcion,
      tracking_code, public_access_token
    } = body;

    if (!cliente_id || !equipo_id || !motivo_ingreso) {
      return Response.json({ error: 'cliente_id, equipo_id y motivo_ingreso son obligatorios' }, { status: 400 });
    }

    // Validar que cliente y equipo pertenezcan a la misma organización
    const [clientes, equipos] = await Promise.all([
      base44.entities.Cliente.filter({ id: cliente_id, organization_id: orgId }),
      base44.entities.Equipo.filter({ id: equipo_id, organization_id: orgId }),
    ]);

    if (!clientes || clientes.length === 0) {
      return Response.json({ error: 'cliente_id no encontrado en esta organización' }, { status: 404 });
    }
    if (!equipos || equipos.length === 0) {
      return Response.json({ error: 'equipo_id no encontrado en esta organización' }, { status: 404 });
    }

    // Generar codigo_ot único
    const year = new Date().getFullYear();
    const timestamp = Date.now().toString().slice(-6);
    const codigo_ot = `OT-${year}-${timestamp}`;

    const orden = await base44.entities.OrdenTrabajo.create({
      organization_id: orgId,
      codigo_ot,
      branch_id: branch_id || null,
      cliente_id,
      equipo_id,
      motivo_ingreso: motivo_ingreso.trim(),
      estado: 'EN_COLA_REVISION',
      tipo_ingreso: tipo_ingreso || 'presencial',
      prioridad: prioridad || 'normal',
      observaciones_ingreso: observaciones_ingreso?.trim() || undefined,
      serie_ingreso: serie_ingreso?.trim() || undefined,
      accesorios_ingreso: accesorios_ingreso?.trim() || undefined,
      estado_fisico_ingreso: estado_fisico_ingreso || undefined,
      contrasena_ingreso: contrasena_ingreso?.trim() || undefined,
      responsable_recepcion: responsable_recepcion?.trim() || undefined,
      tracking_code: tracking_code?.trim() || undefined,
      public_access_token: public_access_token || `ot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      created_by_user_id: user.id,
      fecha_ingreso: new Date().toISOString(),
    });

    // ── OTEvent CREATED — ownership exclusivo de createWorkOrder (Bloque 0B.1a) ──
    // Idempotencia: verificar antes de crear para soportar reintentos seguros.
    // Si falla: NO rollbackear la OT — loggear y permitir continuidad operacional.
    try {
      const existingCreated = await base44.asServiceRole.entities.OTEvent.filter({
        orden_trabajo_id: orden.id,
        tipo: 'CREATED',
      }, 1);

      if (!existingCreated || existingCreated.length === 0) {
        await base44.asServiceRole.entities.OTEvent.create({
          organization_id: orgId,
          orden_trabajo_id: orden.id,
          tipo: 'CREATED',
          created_by_user_id: user.id,
          processed: false,
          created_at: new Date().toISOString(),
        });
        console.log(`[createWorkOrder] OTEvent CREATED generado — OT: ${orden.id}, codigo: ${orden.codigo_ot}`);
      } else {
        console.log(`[createWorkOrder] OTEvent CREATED ya existe (idempotencia) — OT: ${orden.id}`);
      }
    } catch (eventError) {
      // El fallo del evento NO debe bloquear la creación de la OT
      console.error(`[createWorkOrder] OTEvent CREATED falló (OT existe y es válida) — OT: ${orden.id}, error: ${eventError.message}`);
    }

    return Response.json(orden);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});