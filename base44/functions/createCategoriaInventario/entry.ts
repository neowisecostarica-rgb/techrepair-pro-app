import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { projectOperationalReadResult } from '../_shared/dataProjections.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { organization_id, nombre, permite_stock, permite_precio, es_vendible, activo } = body;

    if (!organization_id || !nombre) {
      return Response.json({ error: 'organization_id y nombre son requeridos' }, { status: 400 });
    }

    // Verificar tenant y rol en servidor; la visibilidad de UI no es una autorización.
    const authorization = await resolveAuthorizedContext(base44, user, {
      organizationHint: organization_id,
      allowedRoles: ['ORG_ADMIN'],
    });
    if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status });

    // Usar asServiceRole para evitar RLS
    const categoria = await base44.asServiceRole.entities.CategoriaInventario.create({
      organization_id: authorization.organizationId,
      nombre,
      permite_stock: permite_stock ?? true,
      permite_precio: permite_precio ?? true,
      es_vendible: es_vendible ?? true,
      activo: activo ?? true,
    });

    return Response.json(projectOperationalReadResult('CategoriaInventario', categoria, authorization));
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
