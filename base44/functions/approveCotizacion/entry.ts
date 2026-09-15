import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';

// P0-04: Atomic cotizacion send — consolidates OT transition + cotizacion update
// into a single sovereign command. Replaces fragmented frontend two-call flow.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const authorization = await resolveAuthorizedContext(base44, user, {
      allowedRoles: ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES', 'TECHNICIAN'],
    });
    if (!authorization.ok) {
      return Response.json({ error: authorization.error }, { status: authorization.status });
    }

    const body = await req.json();
    const { cotizacion_id, canal_envio = 'link' } = body;

    if (!cotizacion_id) {
      return Response.json({ error: 'cotizacion_id es obligatorio' }, { status: 400 });
    }

    // Load cotizacion with asServiceRole (Cotizacion RLS is deny-all)
    const cotizaciones = await base44.asServiceRole.entities.Cotizacion.filter({
      id: cotizacion_id,
      organization_id: authorization.organizationId,
    });
    if (!cotizaciones || cotizaciones.length === 0) {
      return Response.json({ error: 'Cotización no encontrada' }, { status: 404 });
    }
    const cotizacion = cotizaciones[0];

    // Validate current state — only borrador can be sent
    if (cotizacion.estado !== 'borrador') {
      return Response.json({
        error: `Solo se pueden enviar cotizaciones en estado borrador (actual: ${cotizacion.estado})`,
      }, { status: 400 });
    }

    // Server-side descuento policy check — cannot be bypassed by client
    if (cotizacion.requiere_aprobacion && !cotizacion.aprobada_por) {
      return Response.json({
        error: 'Esta cotización requiere aprobación interna por el descuento aplicado',
        code: 'DISCOUNT_REQUIRES_APPROVAL',
      }, { status: 403 });
    }

    // If OT exists and is DIAGNOSTICADA, transition to COTIZADA first.
    // Order matters: OT transition before cotizacion update so a failure leaves
    // the cotizacion in borrador (safe retry) instead of enviada without OT (inconsistent).
    if (cotizacion.orden_trabajo_id) {
      const ots = await base44.asServiceRole.entities.OrdenTrabajo.filter({
        id: cotizacion.orden_trabajo_id,
        organization_id: authorization.organizationId,
      });
      if (ots && ots.length > 0 && ots[0].estado === 'DIAGNOSTICADA') {
        const transitionResponse = await base44.functions.invoke('transitionWorkOrderStatus', {
          orden_trabajo_id: cotizacion.orden_trabajo_id,
          newStatus: 'COTIZADA',
          observacion: `Cotización ${cotizacion.id} enviada al cliente`,
        });
        const transitionData = transitionResponse?.data;
        if (transitionData?.error) {
          return Response.json({
            error: `No se pudo transicionar la OT: ${transitionData.error}`,
            code: 'OT_TRANSITION_FAILED',
          }, { status: 500 });
        }
      }
    }

    // Update cotizacion to 'enviada' with envio metadata
    const now = new Date().toISOString();
    const envioRecord = {
      canal: canal_envio,
      fecha: now,
      enviado_por: user.id,
      enviado_por_nombre: user.full_name || user.email,
    };

    const historial = Array.isArray(cotizacion.historial_envios) ? [...cotizacion.historial_envios] : [];
    historial.push(envioRecord);

    const updated = await base44.asServiceRole.entities.Cotizacion.update(cotizacion_id, {
      estado: 'enviada',
      enviada_at: now,
      ultimo_envio: envioRecord,
      historial_envios: historial,
    });

    return Response.json({ success: true, cotizacion: updated });
  } catch (error) {
    console.error('[approveCotizacion]', error?.message || error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});