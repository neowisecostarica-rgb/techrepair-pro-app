import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { getCanonicalBranchScope } from '../_shared/operationalAuthorization.ts';

// Comando acotado: solo persiste las fotos del producto.
// La autoridad sobre stock, precios y demas campos sigue siendo
// createInventoryItem / updateInventoryItem.
const ALLOWED_ROLES = new Set(['ORG_ADMIN', 'BRANCH_ADMIN', 'INVENTORY']);
const MAX_PHOTOS = 5;
const HTTPS_URL = /^https:\/\/\S+$/i;

Deno.serve(async req => {
  if (req.method !== 'POST') return Response.json({ error: 'Metodo no permitido' }, { status: 405 });

  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });

  let body;
  try { body = await req.json(); }
  catch { return Response.json({ error: 'Body invalido' }, { status: 400 }); }

  const id = body?.id;
  const fotos = Array.isArray(body?.fotos) ? body.fotos : null;
  if (!id || !fotos) return Response.json({ error: 'id y fotos son requeridos' }, { status: 400 });
  if (fotos.length > MAX_PHOTOS) {
    return Response.json({ error: `Maximo ${MAX_PHOTOS} fotos por producto` }, { status: 400 });
  }
  if (fotos.some(url => typeof url !== 'string' || !HTTPS_URL.test(url))) {
    return Response.json({ error: 'Las fotos deben ser URLs https validas' }, { status: 400 });
  }

  const authorization = await resolveAuthorizedContext(base44, user, {
    allowedRoles: Array.from(ALLOWED_ROLES),
  });
  if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status });
  const scope = getCanonicalBranchScope(authorization);
  if (!scope.ok) return Response.json({ error: scope.error, code: scope.code }, { status: scope.status });

  const [item] = await base44.asServiceRole.entities.Inventario.filter({
    id,
    organization_id: authorization.organizationId,
  }, '-created_date', 2);
  if (!item) return Response.json({ error: 'Producto no encontrado' }, { status: 404 });
  if (!scope.organizationWide && item.branch_id !== scope.branchId) {
    return Response.json({ error: 'Producto fuera de la sucursal autorizada', code: 'INVENTORY_CROSS_BRANCH_DENIED' }, { status: 403 });
  }

  const updated = await base44.asServiceRole.entities.Inventario.update(id, {
    foto_url: fotos[0] || null,
    galeria_fotos: fotos,
  });

  return Response.json({
    success: true,
    data: {
      id: updated.id,
      foto_url: updated.foto_url || null,
      galeria_fotos: updated.galeria_fotos || [],
    },
  });
});