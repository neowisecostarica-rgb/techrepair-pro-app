import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { resolveAuthorizedBranch } from '../_shared/operationalAuthorization.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const authorization = await resolveAuthorizedContext(base44, user, {
      allowedRoles: ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES', 'CUSTOMER_SERVICE'],
    });
    if (!authorization.ok) {
      return Response.json({ error: authorization.error }, { status: authorization.status });
    }
    const orgId = authorization.organizationId;

    const body = await req.json();
    const { nombre_completo, identificacion, tipo_cliente, telefono, email, direccion, notas } = body;
    const branchAuthorization = await resolveAuthorizedBranch(base44, authorization, body.branch_id, {
      allowSingleBranchFallback: true,
      required: false,
    });
    if (!branchAuthorization.ok) {
      return Response.json({ error: branchAuthorization.error, code: branchAuthorization.code }, { status: branchAuthorization.status });
    }

    if (!nombre_completo || !identificacion || !telefono) {
      return Response.json({ error: 'nombre_completo, identificacion y telefono son obligatorios' }, { status: 400 });
    }

    const validTipos = ['individual', 'empresa'];
    if (tipo_cliente && !validTipos.includes(tipo_cliente)) {
      return Response.json({ error: 'tipo_cliente inválido' }, { status: 400 });
    }

    const identificacionNormalizada = identificacion.trim();
    const duplicados = await base44.asServiceRole.entities.Cliente.filter({
      organization_id: orgId,
      identificacion: identificacionNormalizada,
    });
    if (duplicados.length > 0) {
      return Response.json({
        error: 'Ya existe un cliente con esta identificación en la organización',
        cliente_id: duplicados[0].id,
      }, { status: 409 });
    }

    console.log('[createClient] Iniciando creación de cliente', { orgId, nombre_completo, identificacion });

    console.log('[createClient] Enviando a entity.create...');
    const cliente = await base44.asServiceRole.entities.Cliente.create({
      organization_id: orgId,
      ...(branchAuthorization.branchId ? { branch_id: branchAuthorization.branchId } : {}),
      nombre_completo: nombre_completo.trim(),
      identificacion: identificacionNormalizada,
      tipo_cliente: tipo_cliente || 'individual',
      telefono: telefono.trim(),
      email: email?.trim() || undefined,
      direccion: direccion?.trim() || undefined,
      notas: notas?.trim() || undefined,
    });

    console.log('[createClient] Cliente creado exitosamente', { id: cliente.id });
    return Response.json(cliente);
  } catch (error) {
    console.error('[createClient] ERROR en catch:', error.message, error.stack || '');
    return Response.json({ error: error.message }, { status: 500 });
  }
});
