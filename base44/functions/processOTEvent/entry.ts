import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/*
=====================================
processOTEvent — ONF TechRepairPro v1 — Bloque 0B.2B
=====================================
Responsabilidad:
  Gateway centralizado de consumo de OTEvent.
  Recibe el payload de la automation (entity create sobre OTEvent)
  y marca el evento como processed=true.

  En este bloque SOLO se marca processed — cero side-effects externos.
  Los módulos de email/notificaciones/CRM se integrarán en fases posteriores.

INVARIANTES (no romper nunca):
  - NUNCA crea OTEvent (para evitar loop de auto-trigger)
  - NUNCA cambia estado de OrdenTrabajo
  - NUNCA dispara emails, WhatsApp ni notificaciones externas
  - Idempotente: si processed===true, retorna skipped sin tocar nada
  - Si falta organization_id, retorna error controlado sin marcar processed

Payload esperado (automation entity):
  {
    event: { type: "create", entity_name: "OTEvent", entity_id: "..." },
    data: { ...campos del OTEvent ... },
    payload_too_large: false
  }

También acepta llamada directa con:
  { ot_event_id: "..." }
=====================================
*/

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const now = new Date().toISOString();

  try {
    // ── 1. Auth de servicio (automation llama sin sesión de usuario) ────────────
    // Para automations: base44.auth.me() devuelve null — se usa asServiceRole directamente.
    // Para llamadas manuales de QA: el usuario sí está autenticado.
    let callerUser = null;
    try {
      callerUser = await base44.auth.me();
    } catch {
      // Automation call — sin sesión de usuario. OK.
    }

    // ── 2. Parsear payload ──────────────────────────────────────────────────────
    let body;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Body inválido o vacío' }, { status: 400 });
    }

    // Soporta payload de automation (event + data) o llamada directa (ot_event_id)
    const automationEventId = body?.event?.entity_id;
    const directEventId     = body?.ot_event_id;
    const eventId           = automationEventId || directEventId;

    if (!eventId) {
      console.error('[processOTEvent] Payload inválido: falta event.entity_id u ot_event_id');
      return Response.json({
        error: 'Payload inválido: falta event.entity_id u ot_event_id',
        received_keys: Object.keys(body || {}),
      }, { status: 400 });
    }

    console.log(`[processOTEvent] Iniciando — event_id: ${eventId}, caller: ${callerUser?.email || 'automation'}`);

    // ── 3. Leer OTEvent desde la entidad (source of truth) ─────────────────────
    // Usamos data del payload si está disponible (automation lo inyecta),
    // pero re-leemos siempre para garantizar consistencia y evitar datos stale.
    let evento;
    try {
      const eventos = await base44.asServiceRole.entities.OTEvent.filter({ id: eventId }, 1);
      if (!eventos || eventos.length === 0) {
        console.error(`[processOTEvent] OTEvent no encontrado — event_id: ${eventId}`);
        return Response.json({
          error: `OTEvent no encontrado: ${eventId}`,
          event_id: eventId,
        }, { status: 404 });
      }
      evento = eventos[0];
    } catch (readError) {
      console.error(`[processOTEvent] Error al leer OTEvent: ${readError.message}`);
      return Response.json({ error: `Error al leer OTEvent: ${readError.message}` }, { status: 500 });
    }

    const { organization_id, orden_trabajo_id, tipo, processed } = evento;

    // ── 4. Guard: organization_id obligatorio ───────────────────────────────────
    // Eventos sin organization_id son pre-0B.2A y no deben procesarse automáticamente.
    // Se retorna error controlado SIN marcar processed para permitir investigación.
    if (!organization_id) {
      console.warn(`[processOTEvent] Evento sin organization_id — event_id: ${eventId}, tipo: ${tipo}, OT: ${orden_trabajo_id}`);
      return Response.json({
        success: false,
        skipped: true,
        reason: 'missing_organization_id',
        event_id: eventId,
        tipo,
        orden_trabajo_id: orden_trabajo_id || null,
        note: 'Evento pre-0B.2A sin organization_id. No se marca processed para auditoría.',
      }, { status: 200 });
    }

    // ── 5. Guard de idempotencia ────────────────────────────────────────────────
    if (processed === true) {
      console.log(`[processOTEvent] Evento ya procesado (idempotencia) — event_id: ${eventId}, tipo: ${tipo}, org: ${organization_id}`);
      return Response.json({
        success: true,
        skipped: true,
        reason: 'already_processed',
        event_id: eventId,
        tipo,
        organization_id,
        orden_trabajo_id: orden_trabajo_id || null,
      });
    }

    // ── 6. Log de inicio de procesamiento ──────────────────────────────────────
    console.log(`[processOTEvent] Procesando — event_id: ${eventId}, tipo: ${tipo}, org: ${organization_id}, OT: ${orden_trabajo_id}`);

    // ── 7. Switch por tipo — hook points para fases futuras ────────────────────
    // En 0B.2B: SOLO logging. Emails/notificaciones se migran en 0B.2C+.
    // Cada case es un hook point documentado para la siguiente fase.
    let tipoReconocido = true;
    switch (tipo) {
      case 'CREATED':
        // Hook: 0B.2C → migrar email de bienvenida desde handleOTLifecycleEvent
        console.log(`[processOTEvent] [CREATED] OT: ${orden_trabajo_id} — hook point 0B.2C (email)`);
        break;

      case 'FINALIZADA':
        // Hook: 0B.2C → migrar email de finalización desde handleOTLifecycleEvent
        console.log(`[processOTEvent] [FINALIZADA] OT: ${orden_trabajo_id} — hook point 0B.2C (email)`);
        break;

      case 'ENTREGADA':
        // Hook: 0B.2C → migrar email de entrega desde handleOTLifecycleEvent
        console.log(`[processOTEvent] [ENTREGADA] OT: ${orden_trabajo_id} — hook point 0B.2C (email)`);
        break;

      case 'CANCELADA':
        // Hook: 0B.2D → notificación al técnico asignado
        console.log(`[processOTEvent] [CANCELADA] OT: ${orden_trabajo_id} — hook point 0B.2D`);
        break;

      case 'SALE_COMPLETED':
        // Hook: 0B.2E → trazabilidad CRM y métricas de venta
        console.log(`[processOTEvent] [SALE_COMPLETED] OT: ${orden_trabajo_id} — hook point 0B.2E`);
        break;

      case 'TRANSITION_ASIGNADA':
      case 'TRANSITION_EN_REVISION':
      case 'TRANSITION_DIAGNOSTICADA':
      case 'TRANSITION_COTIZADA':
      case 'TRANSITION_APROBADA':
      case 'TRANSITION_EN_REPARACION':
      case 'TRANSITION_PRUEBAS':
        // Hook: 0B.2D → actualizaciones de SLA y dashboard en tiempo real
        console.log(`[processOTEvent] [${tipo}] OT: ${orden_trabajo_id} — hook point 0B.2D (SLA)`);
        break;

      default:
        tipoReconocido = false;
        console.warn(`[processOTEvent] Tipo de evento no reconocido: "${tipo}" — event_id: ${eventId}`);
    }

    // ── 8. Marcar processed=true ────────────────────────────────────────────────
    // Se hace al FINAL del procesamiento (optimista):
    // Si un side-effect futuro falla antes de llegar aquí, el evento quedará
    // unprocessed y podrá ser reintentado (crash-safe).
    try {
      await base44.asServiceRole.entities.OTEvent.update(eventId, {
        processed: true,
      });
      console.log(`[processOTEvent] processed=true marcado — event_id: ${eventId}, tipo: ${tipo}, org: ${organization_id}`);
    } catch (updateError) {
      // Fallo al marcar processed: loggear pero retornar error para que
      // la automation pueda reintentar si el motor lo soporta.
      console.error(`[processOTEvent] Error al marcar processed=true — event_id: ${eventId}: ${updateError.message}`);
      return Response.json({
        success: false,
        error: `No se pudo marcar processed=true: ${updateError.message}`,
        event_id: eventId,
        tipo,
        organization_id,
      }, { status: 500 });
    }

    // ── 9. Respuesta de éxito ───────────────────────────────────────────────────
    const resumen = {
      success: true,
      skipped: false,
      event_id: eventId,
      tipo,
      tipo_reconocido: tipoReconocido,
      organization_id,
      orden_trabajo_id: orden_trabajo_id || null,
      processed_at: now,
      caller: callerUser?.email || 'automation',
    };

    console.log(`[processOTEvent] Completado — ${JSON.stringify(resumen)}`);
    return Response.json(resumen);

  } catch (error) {
    console.error(`[processOTEvent] Error no controlado: ${error.message}`);
    return Response.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
});