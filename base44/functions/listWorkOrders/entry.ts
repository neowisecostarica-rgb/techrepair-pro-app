import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { isCanonicalActiveUserAccount } from '../_shared/userAuthorization.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // ── PATRÓN OFICIAL: RESOLUCIÓN CONSOLIDADA DE organization_id ──────────────
    const orgHint = user.impersonating_org_id || user.organization_id || null;
    let orgId = user.is_super_admin === true ? orgHint : null;
    if (user.is_super_admin !== true && user.id) {
      const accounts = await base44.asServiceRole.entities.UserAccount.filter({ user_id: user.id }, 10);
      const activeAccounts = (accounts || []).filter(isCanonicalActiveUserAccount);
      const account = orgHint
        ? activeAccounts.find(candidate => candidate.organization_id === orgHint)
        : (activeAccounts.length === 1 ? activeAccounts[0] : null);
      orgId = account?.organization_id || null;
    }
    if (!orgId) return Response.json({ error: 'organization_id no resuelto para este usuario' }, { status: 403 });
    // ── FIN PATRÓN OFICIAL ─────────────────────────────────────────────────────

    const [ordenes, clientes, equipos] = await Promise.all([
      base44.entities.OrdenTrabajo.filter({ organization_id: orgId }, '-created_date', 100),
      base44.entities.Cliente.filter({ organization_id: orgId }),
      base44.entities.Equipo.filter({ organization_id: orgId }),
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
