import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { getCanonicalBranchScope } from '../_shared/operationalAuthorization.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // ── PATRÓN OFICIAL: RESOLUCIÓN CONSOLIDADA DE organization_id ──────────────
    const authorization = await resolveAuthorizedContext(base44, user);
    if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status });
    const orgId = authorization.organizationId;
    const branchScope = getCanonicalBranchScope(authorization);
    if (!branchScope.ok) return Response.json({ error: branchScope.error, code: branchScope.code }, { status: branchScope.status });
    // ── FIN PATRÓN OFICIAL ─────────────────────────────────────────────────────

    const workOrderFilter = {
      organization_id: orgId,
      ...(!branchScope.organizationWide ? { branch_id: branchScope.branchId } : {}),
    };
    const [ordenes, clientes, equipos] = await Promise.all([
      base44.asServiceRole.entities.OrdenTrabajo.filter(workOrderFilter, '-created_date', 100),
      base44.asServiceRole.entities.Cliente.filter({ organization_id: orgId }),
      base44.asServiceRole.entities.Equipo.filter({ organization_id: orgId }),
    ]);

    // Enriquecer con datos de cliente y equipo para la UI
    const clienteMap = {};
    for (const c of (clientes || [])) clienteMap[c.id] = c;

    const equipoMap = {};
    for (const e of (equipos || [])) equipoMap[e.id] = e;

    const result = (ordenes || []).map(orden => ({
      ...orden,
      cliente: clienteMap[orden.cliente_id] || null,
      equipo: equipoMap[orden.equipo_id] || null,
    }));

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
