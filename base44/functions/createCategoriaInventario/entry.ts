import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { isCanonicalActiveUserAccount } from '../_shared/userAuthorization.ts';

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
    const userOrgId = user.impersonating_org_id || user.organization_id;
    const isSuperAdmin = user.is_super_admin === true;

    if (!isSuperAdmin && userOrgId !== organization_id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const accounts = await base44.asServiceRole.entities.UserAccount.filter({ user_id: user.id, organization_id });
    const canManageInventory = isSuperAdmin || accounts.some(account =>
      account.role === 'ORG_ADMIN' && isCanonicalActiveUserAccount(account)
    );
    if (!canManageInventory) {
      return Response.json({ error: 'Acceso denegado: se requiere ORG_ADMIN para modificar inventario' }, { status: 403 });
    }

    // Usar asServiceRole para evitar RLS
    const categoria = await base44.asServiceRole.entities.CategoriaInventario.create({
      organization_id,
      nombre,
      permite_stock: permite_stock ?? true,
      permite_precio: permite_precio ?? true,
      es_vendible: es_vendible ?? true,
      activo: activo ?? true,
    });

    return Response.json(categoria);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
