import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { resolveAuthorizedContext } from './_shared_userAuthorization.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const authorization = await resolveAuthorizedContext(base44, user, { allowedRoles: ['ORG_ADMIN'] });
    if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status });

    const body = await req.json();
    const { action, termino_id = null, texto = null, activar = true } = body;
    const orgId = authorization.organizationId;

    const allTerms = await base44.asServiceRole.entities.TerminosYCondiciones.filter({ organization_id: orgId });

    if (action === 'CREATE_VERSION') {
      const cleanText = String(texto || '').trim();
      if (!cleanText) return Response.json({ error: 'El texto de términos es obligatorio' }, { status: 400 });

      // Version is allocated on the server to avoid two clients creating the same next version.
      const numericVersions = (allTerms || []).map((t) => {
        const match = String(t.version || '').match(/^v(\d+)\.(\d+)$/);
        return match ? [Number(match[1]), Number(match[2])] : [0, 0];
      });
      numericVersions.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
      const [major, minor] = numericVersions[0] || [0, 0];
      const version = major === 0 ? 'v1.0' : `v${major}.${minor + 1}`;

      const created = await base44.asServiceRole.entities.TerminosYCondiciones.create({
        organization_id: orgId,
        version,
        texto: cleanText,
        activo: false,
      });

      if (activar) {
        for (const t of (allTerms || []).filter((item) => item.activo)) {
          await base44.asServiceRole.entities.TerminosYCondiciones.update(t.id, { activo: false });
        }
        await base44.asServiceRole.entities.TerminosYCondiciones.update(created.id, { activo: true });
        created.activo = true;
      }
      return Response.json({ success: true, termino: created });
    }

    if (action === 'ACTIVATE') {
      const selected = (allTerms || []).find((t) => t.id === termino_id);
      if (!selected) return Response.json({ error: 'Versión de términos no encontrada' }, { status: 404 });

      // Deactivate first and activate selected last: if an intermediate write fails,
      // reception fails closed instead of accepting an ambiguous legal version.
      for (const t of (allTerms || []).filter((item) => item.activo && item.id !== termino_id)) {
        await base44.asServiceRole.entities.TerminosYCondiciones.update(t.id, { activo: false });
      }
      const updated = await base44.asServiceRole.entities.TerminosYCondiciones.update(termino_id, { activo: true });
      return Response.json({ success: true, termino: updated });
    }

    return Response.json({ error: 'Acción no soportada' }, { status: 400 });
  } catch (error) {
    console.error('[manageTerms]', error?.message || error);
    return Response.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
});