import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/*
=====================================
processOTEvent — ONF TechRepairPro v1 — Bloque 0B.2C
=====================================
Responsabilidad:
  Gateway centralizado de consumo de OTEvent.
  Ejecuta side-effects por tipo y marca el evento como processed=true.

  0B.2C: Email CREATED migrado desde handleOTLifecycleEvent.
  Coexistencia segura: email_created_sent en OrdenTrabajo actúa como
  idempotencia del email. Si handleOTLifecycleEvent llega primero,
  el flag ya estará en true y processOTEvent salteará el envío.
  Si processOTEvent llega primero, pondrá el flag en true y
  handleOTLifecycleEvent salteará su propio envío.

INVARIANTES (no romper nunca):
  - NUNCA crea OTEvent (para evitar loop de auto-trigger)
  - NUNCA cambia estado de OrdenTrabajo (salvo flags email_*_sent)
  - Idempotente: si processed===true, retorna skipped sin tocar nada
  - Si falta organization_id, retorna error controlado sin marcar processed
  - Si SendEmail falla, NO marca email_*_sent=true pero SÍ completa processed=true

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

// ── Helpers de email (migrados desde handleOTLifecycleEvent) ──────────────────

function resolveEmailAddress(ot, cliente) {
  return (
    ot?.cliente_email ||
    ot?.email_cliente ||
    ot?.email ||
    cliente?.email ||
    cliente?.correo ||
    null
  );
}

async function getClienteForOT(base44, ot) {
  if (!ot?.cliente_id) return null;
  try {
    const clientes = await base44.asServiceRole.entities.Cliente.filter({ id: ot.cliente_id }, 1);
    return Array.isArray(clientes) && clientes.length > 0 ? clientes[0] : null;
  } catch (err) {
    console.warn(`[processOTEvent] cliente_lookup_failed: ${err.message}`);
    return null;
  }
}

async function safeTrack(base44, eventName, properties = {}) {
  try {
    if (base44.analytics?.track) {
      await base44.analytics.track({ eventName, properties });
    }
  } catch (err) {
    console.warn(`[processOTEvent] analytics_track_failed: ${err.message}`);
  }
}

const EMAIL_TEMPLATES = {
  CREATED: {
    flag: 'email_created_sent',
    subject: (ot) => `Orden de trabajo creada: ${ot.codigo_ot || ot.id}`,
    body: (ot, cliente) => `Hola ${cliente?.full_name || cliente?.nombre_completo || cliente?.nombre || 'cliente'},

Hemos recibido su equipo y creamos la orden de trabajo ${ot.codigo_ot || ot.id}.

Le estaremos notificando cualquier avance importante.

Gracias por confiar en nosotros.`.trim(),
  },
  FINALIZADA: {
    flag: 'email_finalizada_sent',
    subject: (ot) => `Orden de trabajo finalizada: ${ot.codigo_ot || ot.id}`,
    body: (ot, cliente) => `Hola ${cliente?.full_name || cliente?.nombre_completo || cliente?.nombre || 'cliente'},

Su orden de trabajo ${ot.codigo_ot || ot.id} ha sido finalizada.

Ya puede coordinar la entrega o retiro del equipo.

Gracias por confiar en nosotros.`.trim(),
  },
  ENTREGADA: {
    flag: 'email_entregada_sent',
    subject: (ot) => `Orden de trabajo entregada: ${ot.codigo_ot || ot.id}`,
    body: (ot, cliente) => `Hola ${cliente?.full_name || cliente?.nombre_completo || cliente?.nombre || 'cliente'},

Confirmamos que la orden de trabajo ${ot.codigo_ot || ot.id} fue entregada.

Gracias por confiar en nosotros.`.trim(),
  },
};

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

    // [Bloque A] Log de inicio eliminado (ruido operacional)

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

    // ── 6. Switch por tipo — hook points para fases futuras ────────────────────
    // En 0B.2B: SOLO logging. Emails/notificaciones se migran en 0B.2C+.
    // Cada case es un hook point documentado para la siguiente fase.
    let tipoReconocido = true;
    switch (tipo) {
      case 'CREATED': {
        // ── 0B.2C: Email de bienvenida ─────────────────────────────────────────

        const tmpl = EMAIL_TEMPLATES.CREATED;

        // a. Cargar OrdenTrabajo
        let ot = null;
        try {
          const ots = await base44.asServiceRole.entities.OrdenTrabajo.filter({ id: orden_trabajo_id }, 1);
          ot = Array.isArray(ots) && ots.length > 0 ? ots[0] : null;
        } catch (otErr) {
          console.warn(`[processOTEvent] [CREATED] Error cargando OT ${orden_trabajo_id}: ${otErr.message}`);
        }

        if (!ot) {
          console.warn(`[processOTEvent] [CREATED] OT no encontrada: ${orden_trabajo_id} — skipping email`);
          break;
        }

        // b. Validar organization_id (tenant shield)
        if (ot.organization_id !== organization_id) {
          console.warn(`[processOTEvent] [CREATED] Mismatch org — OT: ${ot.organization_id}, event: ${organization_id} — skipping`);
          break;
        }

        // c. Verificar flag email_created_sent (idempotencia del email)
        if (ot[tmpl.flag] === true) {
          break;
        }

        // d. Cargar Cliente y resolver email
        const cliente = await getClienteForOT(base44, ot);
        const toEmail = resolveEmailAddress(ot, cliente);

        if (!toEmail) {
          break;
        }

        // e. Enviar email
        let emailSent = false;
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: toEmail,
            subject: tmpl.subject(ot),
            body: tmpl.body(ot, cliente),
          });
          emailSent = true;
          console.log(`[processOTEvent] [CREATED] Email enviado — OT: ${ot.id}, to: ${toEmail}`);
        } catch (emailErr) {
          // Error de email: NO detener el flujo — processed=true se marcará igual
          console.error(`[processOTEvent] [CREATED] SendEmail falló — OT: ${ot.id}: ${emailErr.message}`);
          await safeTrack(base44, 'ot_email_failed', { tipo: 'CREATED', ot_id: ot.id, error: emailErr.message, org: organization_id });
          break; // Sale del case, continúa hacia processed=true
        }

        // f. Actualizar flag SOLO si el email se envió correctamente
        if (emailSent) {
          try {
            await base44.asServiceRole.entities.OrdenTrabajo.update(ot.id, { [tmpl.flag]: true });
            console.log(`[processOTEvent] [CREATED] ${tmpl.flag}=true actualizado — OT: ${ot.id}`);
          } catch (flagErr) {
            // Flag no se actualizó pero email ya salió — riesgo de reenvío en retry.
            // Loggear con suficiente contexto para investigación.
            console.error(`[processOTEvent] [CREATED] Error actualizando ${tmpl.flag} — OT: ${ot.id}: ${flagErr.message}`);
          }

          // g. Analytics de éxito
          await safeTrack(base44, 'ot_email_sent', { tipo: 'CREATED', ot_id: ot.id, to: toEmail, org: organization_id });
        }
        break;
      }

      case 'FINALIZADA': {
        // ── 0B.2C.2: Email de finalización ────────────────────────────────────

        const tmplF = EMAIL_TEMPLATES.FINALIZADA;

        // a. Cargar OrdenTrabajo
        let otF = null;
        try {
          const otsF = await base44.asServiceRole.entities.OrdenTrabajo.filter({ id: orden_trabajo_id }, 1);
          otF = Array.isArray(otsF) && otsF.length > 0 ? otsF[0] : null;
        } catch (otErrF) {
          console.warn(`[processOTEvent] [FINALIZADA] Error cargando OT ${orden_trabajo_id}: ${otErrF.message}`);
        }

        if (!otF) {
          console.warn(`[processOTEvent] [FINALIZADA] OT no encontrada: ${orden_trabajo_id} — skipping email`);
          break;
        }

        // b. Validar organization_id (tenant shield)
        if (otF.organization_id !== organization_id) {
          console.warn(`[processOTEvent] [FINALIZADA] Mismatch org — OT: ${otF.organization_id}, event: ${organization_id} — skipping`);
          break;
        }

        // c. Verificar flag email_finalizada_sent (idempotencia del email)
        if (otF[tmplF.flag] === true) {
          break;
        }

        // d. Cargar Cliente y resolver email
        const clienteF = await getClienteForOT(base44, otF);
        const toEmailF = resolveEmailAddress(otF, clienteF);

        if (!toEmailF) {
          break;
        }

        // e. Enviar email
        let emailSentF = false;
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: toEmailF,
            subject: tmplF.subject(otF),
            body: tmplF.body(otF, clienteF),
          });
          emailSentF = true;
          console.log(`[processOTEvent] [FINALIZADA] Email enviado — OT: ${otF.id}, to: ${toEmailF}`);
        } catch (emailErrF) {
          // Error de email: NO detener el flujo — processed=true se marcará igual
          console.error(`[processOTEvent] [FINALIZADA] SendEmail falló — OT: ${otF.id}: ${emailErrF.message}`);
          await safeTrack(base44, 'ot_email_failed', { tipo: 'FINALIZADA', ot_id: otF.id, error: emailErrF.message, org: organization_id });
          break; // Sale del case, continúa hacia processed=true
        }

        // f. Actualizar flag SOLO si el email se envió correctamente
        if (emailSentF) {
          try {
            await base44.asServiceRole.entities.OrdenTrabajo.update(otF.id, { [tmplF.flag]: true });
            console.log(`[processOTEvent] [FINALIZADA] ${tmplF.flag}=true actualizado — OT: ${otF.id}`);
          } catch (flagErrF) {
            console.error(`[processOTEvent] [FINALIZADA] Error actualizando ${tmplF.flag} — OT: ${otF.id}: ${flagErrF.message}`);
          }

          // g. Analytics de éxito
          await safeTrack(base44, 'ot_email_sent', { tipo: 'FINALIZADA', ot_id: otF.id, to: toEmailF, org: organization_id });
        }
        break;
      }

      case 'ENTREGADA': {
        // ── 0B.2C.3: Email de entrega ──────────────────────────────────────────

        const tmplE = EMAIL_TEMPLATES.ENTREGADA;

        // a. Cargar OrdenTrabajo
        let otE = null;
        try {
          const otsE = await base44.asServiceRole.entities.OrdenTrabajo.filter({ id: orden_trabajo_id }, 1);
          otE = Array.isArray(otsE) && otsE.length > 0 ? otsE[0] : null;
        } catch (otErrE) {
          console.warn(`[processOTEvent] [ENTREGADA] Error cargando OT ${orden_trabajo_id}: ${otErrE.message}`);
        }

        if (!otE) {
          console.warn(`[processOTEvent] [ENTREGADA] OT no encontrada: ${orden_trabajo_id} — skipping email`);
          break;
        }

        // b. Validar organization_id (tenant shield)
        if (otE.organization_id !== organization_id) {
          console.warn(`[processOTEvent] [ENTREGADA] Mismatch org — OT: ${otE.organization_id}, event: ${organization_id} — skipping`);
          break;
        }

        // c. Verificar flag email_entregada_sent (idempotencia del email)
        if (otE[tmplE.flag] === true) {
          break;
        }

        // d. Cargar Cliente y resolver email
        const clienteE = await getClienteForOT(base44, otE);
        const toEmailE = resolveEmailAddress(otE, clienteE);

        if (!toEmailE) {
          break;
        }

        // e. Enviar email
        let emailSentE = false;
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: toEmailE,
            subject: tmplE.subject(otE),
            body: tmplE.body(otE, clienteE),
          });
          emailSentE = true;
          console.log(`[processOTEvent] [ENTREGADA] Email enviado — OT: ${otE.id}, to: ${toEmailE}`);
        } catch (emailErrE) {
          // Error de email: NO detener el flujo — processed=true se marcará igual
          console.error(`[processOTEvent] [ENTREGADA] SendEmail falló — OT: ${otE.id}: ${emailErrE.message}`);
          await safeTrack(base44, 'ot_email_failed', { tipo: 'ENTREGADA', ot_id: otE.id, error: emailErrE.message, org: organization_id });
          break; // Sale del case, continúa hacia processed=true
        }

        // f. Actualizar flag SOLO si el email se envió correctamente
        if (emailSentE) {
          try {
            await base44.asServiceRole.entities.OrdenTrabajo.update(otE.id, { [tmplE.flag]: true });
            console.log(`[processOTEvent] [ENTREGADA] ${tmplE.flag}=true actualizado — OT: ${otE.id}`);
          } catch (flagErrE) {
            console.error(`[processOTEvent] [ENTREGADA] Error actualizando ${tmplE.flag} — OT: ${otE.id}: ${flagErrE.message}`);
          }

          // g. Analytics de éxito
          await safeTrack(base44, 'ot_email_sent', { tipo: 'ENTREGADA', ot_id: otE.id, to: toEmailE, org: organization_id });
        }
        break;
      }

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
      // processed=true marcado OK
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

    // [Bloque A] Log de completado eliminado (ruido operacional)
    return Response.json(resumen);

  } catch (error) {
    console.error(`[processOTEvent] Error no controlado: ${error.message}`);
    return Response.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
});