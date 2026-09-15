import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';

function unwrap(result) {
  return result?.data ?? result;
}

async function gateway(base44, payload) {
  const result = unwrap(await base44.functions.invoke('operationalGateway', payload));
  if (result?.error) throw new Error(result.error);
  return result;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Metodo no permitido' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, termino_id = null, texto = null, activar = true } = body;

    // operationalGateway remains the canonical authorization boundary. Its policy
    // permits TerminosYCondiciones mutations only to ORG_ADMIN and scopes them to
    // the active organization/impersonation.
    const readResult = await gateway(base44, {
      entity: 'TerminosYCondiciones',
      operation: 'read',
      method: 'filter',
      filter: {},
      limit: 500,
    });
    const allTerms = readResult?.records || [];

    if (action === 'CREATE_VERSION') {
      const cleanText = String(texto || '').trim();
      if (!cleanText) return Response.json({ error: 'El texto de terminos es obligatorio' }, { status: 400 });

      const numericVersions = allTerms.map((t) => {
        const match = String(t.version || '').match(/^v(\d+)\.(\d+)$/);
        return match ? [Number(match[1]), Number(match[2])] : [0, 0];
      });
      numericVersions.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
      const [major, minor] = numericVersions[0] || [0, 0];
      const version = major === 0 ? 'v1.0' : `v${major}.${minor + 1}`;

      const created = await gateway(base44, {
        entity: 'TerminosYCondiciones',
        operation: 'create',
        data: { version, texto: cleanText, activo: false },
      });

      if (activar) {
        for (const t of allTerms.filter((item) => item.activo)) {
          await gateway(base44, { entity: 'TerminosYCondiciones', operation: 'update', id: t.id, data: { activo: false } });
        }
        const updated = await gateway(base44, { entity: 'TerminosYCondiciones', operation: 'update', id: created.id, data: { activo: true } });
        return Response.json({ success: true, termino: updated });
      }
      return Response.json({ success: true, termino: created });
    }

    if (action === 'ACTIVATE') {
      const selected = allTerms.find((t) => t.id === termino_id);
      if (!selected) return Response.json({ error: 'Version de terminos no encontrada' }, { status: 404 });
      for (const t of allTerms.filter((item) => item.activo && item.id !== termino_id)) {
        await gateway(base44, { entity: 'TerminosYCondiciones', operation: 'update', id: t.id, data: { activo: false } });
      }
      const updated = await gateway(base44, { entity: 'TerminosYCondiciones', operation: 'update', id: termino_id, data: { activo: true } });
      return Response.json({ success: true, termino: updated });
    }

    return Response.json({ error: 'Accion no soportada' }, { status: 400 });
  } catch (error) {
    console.error('[manageTerms]', error?.message || error);
    return Response.json({ error: error?.message || 'Error interno' }, { status: 500 });
  }
});