import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { resolveAuthorizedBranch } from '../_shared/operationalAuthorization.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const authorization = await resolveAuthorizedContext(base44, user, {
      allowedRoles: ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES', 'SUPPORT'],
    });
    if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status });
    const orgId = authorization.organizationId;

    const body = await req.json();
    const { cliente_id, tipo, marca, modelo, serie, estado_fisico, accesorios, fotos } = body;

    if (!cliente_id || !tipo || !marca) {
      return Response.json({ error: 'cliente_id, tipo y marca son obligatorios' }, { status: 400 });
    }

    // Validar que el cliente pertenezca a la misma organización
    const clientes = await base44.asServiceRole.entities.Cliente.filter({ id: cliente_id, organization_id: orgId });
    if (!clientes || clientes.length === 0) {
      return Response.json({ error: 'cliente_id no encontrado en esta organización' }, { status: 404 });
    }
    const branchAuthorization = await resolveAuthorizedBranch(base44, authorization, body.branch_id || clientes[0].branch_id, {
      allowSingleBranchFallback: true,
      required: false,
    });
    if (!branchAuthorization.ok) {
      return Response.json({ error: branchAuthorization.error, code: branchAuthorization.code }, { status: branchAuthorization.status });
    }

    const validTipos = ['laptop', 'desktop', 'tablet', 'smartphone', 'impresora', 'otro'];
    if (!validTipos.includes(tipo)) {
      return Response.json({ error: 'tipo de equipo inválido' }, { status: 400 });
    }

    // Prevención de duplicados por serie en la misma organización (solo si serie tiene valor real)
    if (serie && serie.trim()) {
      const porSerie = await base44.asServiceRole.entities.Equipo.filter({ organization_id: orgId, serie: serie.trim() });
      if (porSerie && porSerie.length > 0) {
        return Response.json({ error: 'Ya existe un equipo con este número de serie en su organización' }, { status: 409 });
      }
    }

    const equipo = await base44.asServiceRole.entities.Equipo.create({
      organization_id: orgId,
      ...(branchAuthorization.branchId ? { branch_id: branchAuthorization.branchId } : {}),
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
