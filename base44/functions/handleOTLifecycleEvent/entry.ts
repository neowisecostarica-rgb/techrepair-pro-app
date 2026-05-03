import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

const EVENT_CONFIG = {
  OT_CREATED: {
    emailFlag: "email_created_sent",
    eventType: "CREATED",
    subject: (ot) => `Orden de trabajo creada: ${ot.codigo_ot || ot.id}`,
    body: (ot, cliente) => `
Hola ${cliente?.full_name || cliente?.nombre || "cliente"},

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
Hola ${cliente?.full_name || cliente?.nombre || "cliente"},

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
Hola ${cliente?.full_name || cliente?.nombre || "cliente"},

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
    console.log("analytics_track_failed", error.message);
  }
}

async function getCliente(base44, record) {
  if (!record?.cliente_id) return null;
  try {
    const clientes = await base44.asServiceRole.entities.Cliente.filter(
      { id: record.cliente_id },
      1
    );
    return Array.isArray(clientes) && clientes.length > 0 ? clientes[0] : null;
  } catch (error) {
    console.log("cliente_lookup_failed", error.message);
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
  const existing = await base44.asServiceRole.entities.OTEvent.filter(
    { orden_trabajo_id: record.id, tipo: config.eventType },
    1
  );

  if (Array.isArray(existing) && existing.length > 0) {
    console.log(`OTEvent already exists: ${config.eventType} / OT ${record.id}`);
    return { created: false };
  }

  await base44.asServiceRole.entities.OTEvent.create({
    orden_trabajo_id: record.id,
    tipo: config.eventType,
    processed: false,
    created_at: new Date().toISOString(),
  });

  console.log(`OTEvent created: ${config.eventType} / OT ${record.id}`);
  return { created: true };
}

async function sendEmailIfNeeded(base44, record, cliente, config) {
  const flag = config.emailFlag;

  if (record[flag] === true) {
    console.log(`Email already sent. Skipping ${flag} / OT ${record.id}`);
    return { sent: false, skipped: true };
  }

  const to = resolveEmail(record, cliente);

  if (!to) {
    console.log(`Missing client email for OT ${record.id}, skipping email.`);
    return { sent: false, skipped: true, reason: "no_email" };
  }

  await base44.asServiceRole.integrations.Core.SendEmail({
    to,
    subject: config.subject(record),
    body: config.body(record, cliente),
  });

  await base44.asServiceRole.entities.OrdenTrabajo.update(record.id, {
    [flag]: true,
  });

  console.log(`Email sent and flag updated: ${flag} / OT ${record.id}`);
  return { sent: true, skipped: false };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const payload = await req.json();

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
      return Response.json({ error: "Missing record or record.id" }, { status: 400 });
    }

    if (!_trigger || !EVENT_CONFIG[_trigger]) {
      return Response.json(
        { error: `Invalid or missing _trigger: ${_trigger}` },
        { status: 400 }
      );
    }

    const config = EVENT_CONFIG[_trigger];

    console.log("handleOTLifecycleEvent:start", { trigger: _trigger, ot_id: record.id });

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

    console.log("handleOTLifecycleEvent:success", { trigger: _trigger, ot_id: record.id });

    return Response.json({
      status: "success",
      trigger: _trigger,
      ot_id: record.id,
      email_sent: emailResult.sent,
      email_skipped: emailResult.skipped,
      ot_event_created: eventResult.created,
    });
  } catch (error) {
    console.error("handleOTLifecycleEvent:error", error.message);

    await safeTrack(base44, "ot_lifecycle_event_failed", {
      error: error.message,
      success: false,
    });

    return Response.json({ status: "error", error: error.message }, { status: 500 });
  }
});