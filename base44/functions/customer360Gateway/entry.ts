import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { getCanonicalBranchScope } from '../_shared/operationalAuthorization.ts';
import { assertActiveBranch, BranchProtectionError } from '../_shared/branchProtection.ts';

const ALLOWED_ROLES = ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES', 'SUPPORT'];
const MESSAGE_TYPES = ['estado_ot', 'cotizacion', 'seguimiento', 'general', 'recordatorio'];
const CHANNELS = ['email', 'sms', 'whatsapp', 'sistema'];

function clean(value, maxLength = 1000) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
}

function jsonError(error, status, code = undefined) {
  return Response.json({ error, ...(code ? { code } : {}) }, { status });
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
    const branchScope = getCanonicalBranchScope(authorization);
    if (!branchScope.ok) return jsonError(branchScope.error, branchScope.status);
    const branchFilter = branchScope.organizationWide ? {} : { branch_id: branchScope.branchId };
    const clienteId = clean(body.cliente_id, 120);
    if (!clienteId) return jsonError('cliente_id es obligatorio', 400);

    const clientes = await base44.asServiceRole.entities.Cliente.filter({
      id: clienteId,
      organization_id: organizationId,
    });
    const cliente = clientes?.[0];
    if (!cliente) return jsonError('Cliente no encontrado', 404);
    if (!branchScope.organizationWide && cliente.branch_id !== branchScope.branchId) {
      const [relatedOrders, relatedSales] = await Promise.all([
        base44.asServiceRole.entities.OrdenTrabajo.filter({ organization_id: organizationId, cliente_id: clienteId, branch_id: branchScope.branchId }, '-created_date', 1),
        base44.asServiceRole.entities.Venta.filter({ organization_id: organizationId, cliente_id: clienteId, branch_id: branchScope.branchId }, '-created_date', 1),
      ]);
      if (!relatedOrders?.length && !relatedSales?.length) return jsonError('Cliente no encontrado', 404);
    }

    const action = body.action || 'get';
    if (action === 'get') {
      const [ordenes, equipos, ventas, cotizaciones, mensajes] = await Promise.all([
        base44.asServiceRole.entities.OrdenTrabajo.filter({ organization_id: organizationId, cliente_id: clienteId, ...branchFilter }),
        base44.asServiceRole.entities.Equipo.filter({ organization_id: organizationId, cliente_id: clienteId }),
        base44.asServiceRole.entities.Venta.filter({ organization_id: organizationId, cliente_id: clienteId, ...branchFilter }),
        base44.asServiceRole.entities.Cotizacion.filter({ organization_id: organizationId, cliente_id: clienteId, ...branchFilter }),
        base44.asServiceRole.entities.MensajeCliente.filter({ organization_id: organizationId, cliente_id: clienteId, ...branchFilter }),
      ]);
      const equiposVisibles = branchScope.organizationWide
        ? equipos
        : (equipos || []).filter(equipo =>
            equipo.branch_id === branchScope.branchId
            || (ordenes || []).some(orden => orden.equipo_id === equipo.id));
      return Response.json({ cliente, ordenes, equipos: equiposVisibles, ventas, cotizaciones, mensajes });
    }

    if (action === 'recordMessage') {
      const input = body.message || {};
      let linkedOrder = null;
      if (input.orden_trabajo_id) {
        const orders = await base44.asServiceRole.entities.OrdenTrabajo.filter({
          id: input.orden_trabajo_id,
          organization_id: organizationId,
          cliente_id: clienteId,
          ...branchFilter,
        });
        linkedOrder = orders?.[0] || null;
        if (!linkedOrder) return jsonError('La orden no pertenece a este cliente', 400);
      }
      const messageBranchId = branchScope.branchId || linkedOrder?.branch_id || cliente.branch_id || null;
      if (messageBranchId) {
        try {
          await assertActiveBranch(base44, organizationId, messageBranchId, {
            code: 'CUSTOMER_MESSAGE_BRANCH_INACTIVE',
            status: 409,
            message: 'La sucursal esta inactiva y no admite nuevos mensajes operacionales.',
          });
        } catch (error) {
          if (error instanceof BranchProtectionError) return jsonError(error.message, error.status, error.code);
          throw error;
        }
      }
      const tipo = MESSAGE_TYPES.includes(input.tipo) ? input.tipo : 'general';
      const canal = CHANNELS.includes(input.canal) ? input.canal : null;
      const contenido = clean(input.contenido, 12000);
      if (!canal || !contenido) return jsonError('Canal y contenido son obligatorios', 400);

      const mensaje = await base44.asServiceRole.entities.MensajeCliente.create({
        organization_id: organizationId,
        ...(messageBranchId ? { branch_id: messageBranchId } : {}),
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
