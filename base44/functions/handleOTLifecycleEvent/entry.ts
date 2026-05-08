import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

const EVENT_CONFIG = {
  OT_CREATED: {
    emailFlag: "email_created_sent",
    eventType: "CREATED",
    subject: (ot) => `Orden de trabajo creada: ${ot.codigo_ot || ot.id}`,
    body: (ot, cliente) => `
Hola ${cliente?.full_name || cliente?.nombre_completo || cliente?.nombre || "cliente"},

Hemos recibido su equipo y creamos la orden de trabajo ${ot.codigo_ot || ot.id}.

Le estaremos notificando cualquier avance importante.

Gracias por confiar en nosotros.
    `.trim(),
  },

  OT_FINALIZED: {
    emailFlag: "email_finalizada_sent",
    eventType: "FINALIZADA",
    subject: (ot) => `Orden de trabajo finalizada: ${ot.codigo_ot || ot.id}`,
    body: (ot, cliente) => `
Hola ${cliente?.full_name || cliente?.nombre_completo || cliente?.nombre || "cliente"},

Su orden de trabajo ${ot.codigo_ot || ot.id} ha sido finalizada.

Ya puede coordinar la entrega o retiro del equipo.

Gracias por confiar en nosotros.
    `.trim(),
  },

  OT_DELIVERED: {
    emailFlag: "email_entregada_sent",
    eventType: "ENTREGADA",
    subject: (ot) => `Orden de trabajo entregada: ${ot.codigo_ot || ot.id}`,
    body: (ot, cliente) => `
Hola ${cliente?.full_name || cliente?.nombre_completo || cliente?.nombre || "cliente"},

Confirmamos que la orden de trabajo ${ot.codigo_ot || ot.id} fue entregada.

Gracias por confiar en nosotros.
    `.trim(),
  },
};

async function safeTrack(base44, eventName, properties = {}) {
  try {
    if (base44.analytics?.track) {
      await base44.analytics.track({ eventName, properties });
    }
  } catch (error) {
    console.warn("[handleOTLifecycleEvent] analytics_track_failed:", error.message);
  }
}

async function getCliente(base44, record) {
  if (!record?.cliente_id) {
    console.log("[handleOTLifecycleEvent] Sin cliente_id en OT:", record?.id);
    return null;
  }
  try {
    const clientes = await base44.asServiceRole.entities.Cliente.filter(
      { id: record.cliente_id },
      1
    );
    return Array.isArray(clientes) && clientes.length > 0 ? clientes[0] : null;
  } catch (error) {
    console.warn("[handleOTLifecycleEvent] cliente_lookup_failed:", error.message);
    return null;
  }
}

function resolveEmail(record, cliente) {
  return (
    record?.cliente_email ||
    record?.email_cliente ||
    record?.email ||
    cliente?.email ||
    cliente?.correo ||
    null
  );
}

async function ensureOTEvent(base44, record, config) {
  // 0B.2C: OTEvent creation is now handled exclusively by the Gateway automation.
  // This function is neutralized to prevent duplicate OTEvent creation.
  console.log(`[handleOTLifecycleEvent] ensureOTEvent neutralizado — tipo: ${config.eventType}, OT: ${record.id} — handled_by_gateway`);
  return { created: false, reason: 'handled_by_gateway' };
}

async function sendEmailIfNeeded(base44, record, cliente, config) {
  const flag = config.emailFlag;

  // 0B.2C.3: ENTREGADA email migrado a processOTEvent — neutralización legacy
  if (config.eventType === "ENTREGADA") {
    console.log(`[handleOTLifecycleEvent] OT_DELIVERED email neutralizado — handled_by_processOTEvent — OT: ${record.id}`);
    return { sent: false, skipped: true, reason: "handled_by_processOTEvent" };
  }

  if (record[flag] === true) {
    console.log(`[handleOTLifecycleEvent] Email ya enviado (flag ${flag}=true) — OT: ${record.id}, saltando.`);
    return { sent: false, skipped: true, reason: "already_sent" };
  }

  const to = resolveEmail(record, cliente);

  if (!to) {
    console.log(`[handleOTLifecycleEvent] Sin email de cliente — OT: ${record.id}, saltando envío.`);
    return { sent: false, skipped: true, reason: "no_email" };
  }

  try {
    await base44.asServiceRole.integrations.Core.SendEmail({
      to,
      subject: config.subject(record),
      body: config.body(record, cliente),
    });

    await base44.asServiceRole.entities.OrdenTrabajo.update(record.id, {
      [flag]: true,
    });

    console.log(`[handleOTLifecycleEvent] Email enviado y flag ${flag} actualizado — OT: ${record.id}, destinatario: ${to}`);
    return { sent: true, skipped: false };
  } catch (emailError) {
    // El error de email NO debe romper el flujo — solo se registra
    console.error(`[handleOTLifecycleEvent] Error al enviar email — OT: ${record.id}, error: ${emailError.message}`);
    return { sent: false, skipped: false, error: emailError.message };
  }
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();

    if (!user) {
      throw new Error("No autenticado");
    }

    const payload = await req.json();

    console.log("[handleOTLifecycleEvent] Evento recibido:", JSON.stringify({
      event_type: payload.event?.type,
      _trigger: payload._trigger,
      ot_id: payload.record?.id || payload.data?.id,
      ot_estado: payload.record?.estado || payload.data?.estado,
    }));

    // Soporta llamada desde entity automation (data + event) o directa (record + _trigger)
    let record = payload.record || payload.data;
    let _trigger = payload._trigger;

    // Si viene de automation entity sin _trigger explícito, intentar resolver
    if (!_trigger && payload.event) {
      if (payload.event.type === "create") {
        _trigger = "OT_CREATED";
      } else if (record?.estado === "FINALIZADA") {
        _trigger = "OT_FINALIZED";
      } else if (record?.estado === "ENTREGADA") {
        _trigger = "OT_DELIVERED";
      }
    }

    if (!record?.id) {
      console.error("[handleOTLifecycleEvent] Payload inválido: falta record o record.id");
      return Response.json({ error: "Missing record or record.id" }, { status: 400 });
    }

    const orgId = user.organization_id || user.impersonating_org_id;
    if (record.organization_id && orgId && record.organization_id !== orgId) {
      console.error(`[handleOTLifecycleEvent] Forbidden — OT org: ${record.organization_id}, user org: ${orgId}`);
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!_trigger || !EVENT_CONFIG[_trigger]) {
      console.warn(`[handleOTLifecycleEvent] Trigger inválido o no reconocido: "${_trigger}" — OT: ${record.id}`);
      return Response.json(
        { error: `Invalid or missing _trigger: ${_trigger}` },
        { status: 400 }
      );
    }

    const config = EVENT_CONFIG[_trigger];

    console.log(`[handleOTLifecycleEvent] Procesando trigger: ${_trigger}, OT: ${record.id}`);

    const cliente = await getCliente(base44, record);
    const emailResult = await sendEmailIfNeeded(base44, record, cliente, config);
    const eventResult = await ensureOTEvent(base44, record, config);

    await safeTrack(base44, "ot_lifecycle_event_processed", {
      trigger: _trigger,
      ot_id: record.id,
      cliente_id: record.cliente_id || null,
      event_type: config.eventType,
      email_sent: emailResult.sent,
      email_skipped: emailResult.skipped,
      ot_event_created: eventResult.created,
      success: true,
    });

    console.log(`[handleOTLifecycleEvent] Completado — trigger: ${_trigger}, OT: ${record.id}, email_sent: ${emailResult.sent}, ot_event_created: ${eventResult.created}`);

    return Response.json({
      status: "success",
      trigger: _trigger,
      ot_id: record.id,
      email_sent: emailResult.sent,
      email_skipped: emailResult.skipped,
      email_error: emailResult.error || null,
      ot_event_created: eventResult.created,
    });
  } catch (error) {
    console.error("[handleOTLifecycleEvent] Error general:", error.message);

    await safeTrack(base44, "ot_lifecycle_event_failed", {
      error: error.message,
      success: false,
    });

    return Response.json({ status: "error", error: error.message }, { status: 500 });
  }
});