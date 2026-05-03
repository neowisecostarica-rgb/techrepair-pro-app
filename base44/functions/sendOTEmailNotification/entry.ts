import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    // Soporta llamada directa (email, codigo_ot, tipo) o desde entity automation (event + data)
    let email, codigo_ot, tipo;

    if (payload.event) {
      // Llamada desde entity automation
      const ot = payload.data;
      if (!ot) return Response.json({ success: false, message: "Sin datos de OT" });

      codigo_ot = ot.codigo_ot;

      // Buscar email del cliente
      const clientes = await base44.asServiceRole.entities.Cliente.filter({ id: ot.cliente_id });
      email = clientes?.[0]?.email;

      // Determinar tipo por evento
      if (payload.event.type === "create") {
        tipo = "CREATED";
      } else if (ot.estado === "FINALIZADA") {
        tipo = "FINALIZADA";
      } else if (ot.estado === "ENTREGADA") {
        tipo = "ENTREGADA";
      } else {
        return Response.json({ success: false, message: "Estado no requiere email" });
      }
    } else {
      // Llamada directa
      email = payload.email;
      codigo_ot = payload.codigo_ot;
      tipo = payload.tipo;
    }

    if (!email) {
      return Response.json({ success: false, message: "Cliente sin email, no enviado" });
    }

    let subject = "";
    let body = "";

    if (tipo === "CREATED") {
      subject = "Recepción de equipo";
      body = `Recibimos tu equipo con código ${codigo_ot}. Te mantendremos informado.`;
    } else if (tipo === "FINALIZADA") {
      subject = "Equipo listo";
      body = `Tu equipo (${codigo_ot}) ya está listo para retiro.`;
    } else if (tipo === "ENTREGADA") {
      subject = "Equipo entregado";
      body = `Tu equipo (${codigo_ot}) fue entregado. Gracias por confiar en nosotros.`;
    } else {
      return Response.json({ success: false, message: "Tipo de notificación no reconocido" });
    }

    await base44.asServiceRole.integrations.Core.SendEmail({ to: email, subject, body });

    console.log(`Email ${tipo} enviado a ${email} para OT ${codigo_ot}`);
    return Response.json({ success: true });
  } catch (error) {
    console.error("Error enviando email:", error);
    return Response.json({ success: false, error: error.message });
  }
});