import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const orgId = user.organization_id || user.impersonating_org_id;
    if (!orgId) return Response.json({ error: 'organization_id no resuelto para este usuario' }, { status: 403 });

    const body = await req.json();
    const { cliente_id, nombre_completo, tipo_cliente, telefono, email, direccion, notas } = body;

    if (!cliente_id) {
      return Response.json({ error: 'cliente_id es obligatorio' }, { status: 400 });
    }
    if (!nombre_completo || !telefono) {
      return Response.json({ error: 'nombre_completo y telefono son obligatorios' }, { status: 400 });
    }

    const validTipos = ['individual', 'empresa'];
    if (tipo_cliente && !validTipos.includes(tipo_cliente)) {
      return Response.json({ error: 'tipo_cliente inválido' }, { status: 400 });
    }

    // Verificar que el cliente exista y pertenezca a la org
    const clientes = await base44.entities.Cliente.filter({ id: cliente_id, organization_id: orgId });
    if (!clientes || clientes.length === 0) {
      return Response.json({ error: 'Cliente no encontrado o no pertenece a esta organización' }, { status: 404 });
    }

    console.log('[updateClient] Actualizando cliente', { cliente_id, orgId });

    const clienteActualizado = await base44.entities.Cliente.update(cliente_id, {
      nombre_completo: nombre_completo.trim(),
      tipo_cliente: tipo_cliente || 'individual',
      telefono: telefono.trim(),
      email: email?.trim() || undefined,
      direccion: direccion?.trim() || undefined,
      notas: notas?.trim() || undefined,
      // organization_id e identificacion no se tocan
    });

    console.log('[updateClient] Cliente actualizado exitosamente', { id: clienteActualizado.id });
    return Response.json(clienteActualizado);
  } catch (error) {
    console.error('[updateClient] ERROR en catch:', error.message, error.stack || '');
    return Response.json({ error: error.message }, { status: 500 });
  }
});