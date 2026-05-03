import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const orgId = user.organization_id || user.impersonating_org_id;
    if (!orgId) return Response.json({ error: 'organization_id no resuelto para este usuario' }, { status: 403 });

    const body = await req.json();
    const { nombre_completo, identificacion, tipo_cliente, telefono, email, direccion, notas } = body;

    if (!nombre_completo || !identificacion || !telefono) {
      return Response.json({ error: 'nombre_completo, identificacion y telefono son obligatorios' }, { status: 400 });
    }

    const validTipos = ['individual', 'empresa'];
    if (tipo_cliente && !validTipos.includes(tipo_cliente)) {
      return Response.json({ error: 'tipo_cliente inválido' }, { status: 400 });
    }

    const cliente = await base44.entities.Cliente.create({
      organization_id: orgId,
      nombre_completo: nombre_completo.trim(),
      identificacion: identificacion.trim(),
      tipo_cliente: tipo_cliente || 'individual',
      telefono: telefono.trim(),
      email: email?.trim() || undefined,
      direccion: direccion?.trim() || undefined,
      notas: notas?.trim() || undefined,
    });

    return Response.json(cliente);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});