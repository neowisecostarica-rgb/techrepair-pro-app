import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const ot = payload.data;
    if (!ot?.id) {
      return Response.json({ success: false, message: "Sin datos de OT" });
    }

    // Determinar tipo de evento
    let tipo;
    if (payload.event?.type === "create") {
      tipo = "CREATED";
    } else if (ot.estado === "FINALIZADA") {
      tipo = "FINALIZADA";
    } else if (ot.estado === "ENTREGADA") {
      tipo = "ENTREGADA";
    } else {
      return Response.json({ success: false, message: "Estado no requiere evento" });
    }

    await base44.asServiceRole.entities.OTEvent.create({
      orden_trabajo_id: ot.id,
      tipo,
      processed: false,
      created_at: new Date().toISOString()
    });

    console.log(`OTEvent ${tipo} registrado para OT ${ot.id}`);
    return Response.json({ success: true, tipo });
  } catch (error) {
    console.error("Error registrando OTEvent:", error);
    return Response.json({ success: false, error: error.message });
  }
});