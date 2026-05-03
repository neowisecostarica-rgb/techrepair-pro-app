import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const orgId = user.organization_id || user.impersonating_org_id;
    if (!orgId) return Response.json({ error: 'organization_id no resuelto para este usuario' }, { status: 403 });

    const body = await req.json();
    const { cliente_id, tipo, marca, modelo, serie, estado_fisico, accesorios, fotos } = body;

    if (!cliente_id || !tipo || !marca) {
      return Response.json({ error: 'cliente_id, tipo y marca son obligatorios' }, { status: 400 });
    }

    // Validar que el cliente pertenezca a la misma organización
    const clientes = await base44.entities.Cliente.filter({ id: cliente_id, organization_id: orgId });
    if (!clientes || clientes.length === 0) {
      return Response.json({ error: 'cliente_id no encontrado en esta organización' }, { status: 404 });
    }

    const validTipos = ['laptop', 'desktop', 'tablet', 'smartphone', 'impresora', 'otro'];
    if (!validTipos.includes(tipo)) {
      return Response.json({ error: 'tipo de equipo inválido' }, { status: 400 });
    }

    const equipo = await base44.entities.Equipo.create({
      organization_id: orgId,
      cliente_id,
      tipo,
      marca: marca.trim(),
      modelo: modelo?.trim() || undefined,
      serie: serie?.trim() || undefined,
      estado_fisico: estado_fisico || undefined,
      accesorios: accesorios || [],
      fotos: fotos || [],
    });

    return Response.json(equipo);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});