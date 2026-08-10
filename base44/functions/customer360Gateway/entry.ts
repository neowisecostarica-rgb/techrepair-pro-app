import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';

const ALLOWED_ROLES = ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES', 'SUPPORT'];
const MESSAGE_TYPES = ['estado_ot', 'cotizacion', 'seguimiento', 'general', 'recordatorio'];
const CHANNELS = ['email', 'sms', 'whatsapp', 'sistema'];

function clean(value, maxLength = 1000) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
}

function jsonError(error, status) {
  return Response.json({ error }, { status });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return jsonError('No autenticado', 401);
    const body = await req.json().catch(() => ({}));

    const authorization = await resolveAuthorizedContext(base44, user, {
      organizationHint: body.organization_id || null,
      allowedRoles: ALLOWED_ROLES,
    });
    if (!authorization.ok) return jsonError(authorization.error, authorization.status);

    const organizationId = authorization.organizationId;
    const clienteId = clean(body.cliente_id, 120);
    if (!clienteId) return jsonError('cliente_id es obligatorio', 400);

    const clientes = await base44.asServiceRole.entities.Cliente.filter({
      id: clienteId,
      organization_id: organizationId,
    });
    const cliente = clientes?.[0];
    if (!cliente) return jsonError('Cliente no encontrado', 404);

    const action = body.action || 'get';
    if (action === 'get') {
      const [ordenes, equipos, ventas, cotizaciones, mensajes] = await Promise.all([
        base44.asServiceRole.entities.OrdenTrabajo.filter({ organization_id: organizationId, cliente_id: clienteId }),
        base44.asServiceRole.entities.Equipo.filter({ organization_id: organizationId, cliente_id: clienteId }),
        base44.asServiceRole.entities.Venta.filter({ organization_id: organizationId, cliente_id: clienteId }),
        base44.asServiceRole.entities.Cotizacion.filter({ organization_id: organizationId, cliente_id: clienteId }),
        base44.asServiceRole.entities.MensajeCliente.filter({ organization_id: organizationId, cliente_id: clienteId }),
      ]);
      return Response.json({ cliente, ordenes, equipos, ventas, cotizaciones, mensajes });
    }

    if (action === 'recordMessage') {
      const input = body.message || {};
      const tipo = MESSAGE_TYPES.includes(input.tipo) ? input.tipo : 'general';
      const canal = CHANNELS.includes(input.canal) ? input.canal : null;
      const contenido = clean(input.contenido, 12000);
      if (!canal || !contenido) return jsonError('Canal y contenido son obligatorios', 400);

      if (input.orden_trabajo_id) {
        const orders = await base44.asServiceRole.entities.OrdenTrabajo.filter({
          id: input.orden_trabajo_id,
          organization_id: organizationId,
          cliente_id: clienteId,
        });
        if (!orders?.[0]) return jsonError('La orden no pertenece a este cliente', 400);
      }

      const mensaje = await base44.asServiceRole.entities.MensajeCliente.create({
        organization_id: organizationId,
        cliente_id: clienteId,
        orden_trabajo_id: input.orden_trabajo_id || null,
        remitente_id: user.id,
        remitente_nombre: user.full_name || user.email || 'Usuario',
        tipo,
        plantilla_usada: clean(input.plantilla_usada, 160) || null,
        asunto: clean(input.asunto, 300) || null,
        contenido,
        canal,
        enviado: false,
      });
      return Response.json({ mensaje }, { status: 201 });
    }

    return jsonError(`Accion Customer 360 desconocida: ${action}`, 400);
  } catch (error) {
    console.error('[customer360Gateway]', error?.message || error);
    return jsonError('No se pudo cargar el expediente del cliente', 500);
  }
});
