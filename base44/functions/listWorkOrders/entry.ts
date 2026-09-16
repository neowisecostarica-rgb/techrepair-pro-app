import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveAuthorizedContext } from './_shared/userAuthorization.ts';
import { getCanonicalBranchScope } from './_shared/operationalAuthorization.ts';
import { projectWorkOrderList, projectWorkOrderTeamAwareness } from './_shared/dataProjections.ts';

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const authorization = await resolveAuthorizedContext(base44, user);
    if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status });
    const orgId = authorization.organizationId;
    const branchScope = getCanonicalBranchScope(authorization);
    if (!branchScope.ok) return Response.json({ error: branchScope.error, code: branchScope.code }, { status: branchScope.status });

    const body = await req.json().catch(() => ({}));
    const pageSize = Math.min(Math.max(Number(body?.limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const cursor = typeof body?.cursor === 'string' && body.cursor ? body.cursor : null;
    const workOrderFilter = {
      organization_id: orgId,
      ...(!branchScope.organizationWide ? { branch_id: branchScope.branchId } : {}),
      ...(cursor ? { created_date: { $lt: cursor } } : {}),
    };

    // Request one extra row so truncation is explicit and callers can continue.
    const ordenesPage = await base44.asServiceRole.entities.OrdenTrabajo.filter(workOrderFilter, '-created_date', pageSize + 1);
    const hasMore = (ordenesPage || []).length > pageSize;
    const ordenes = (ordenesPage || []).slice(0, pageSize);
    const clienteIds = [...new Set(ordenes.map(o => o.cliente_id).filter(Boolean))];
    const equipoIds = [...new Set(ordenes.map(o => o.equipo_id).filter(Boolean))];
    const [clientes, equipos] = await Promise.all([
      clienteIds.length ? base44.asServiceRole.entities.Cliente.filter({ organization_id: orgId, id: { $in: clienteIds } }, '-created_date', clienteIds.length) : [],
      equipoIds.length ? base44.asServiceRole.entities.Equipo.filter({ organization_id: orgId, id: { $in: equipoIds } }, '-created_date', equipoIds.length) : [],
    ]);

    const clienteMap = new Map((clientes || []).map(cliente => [cliente.id, cliente]));
    const equipoMap = new Map((equipos || []).map(equipo => [equipo.id, equipo]));
    const records = ordenes.map(orden => authorization.role === 'TECHNICIAN'
      ? projectWorkOrderTeamAwareness(orden, equipoMap.get(orden.equipo_id))
      : projectWorkOrderList(orden, clienteMap.get(orden.cliente_id), equipoMap.get(orden.equipo_id)));
    const nextCursor = hasMore && ordenes.length ? ordenes[ordenes.length - 1].created_date || null : null;

    return Response.json({ records, has_more: hasMore, next_cursor: nextCursor });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
