import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { validateTenantReadiness } from '../_shared/tenantProvisioning.ts';

Deno.serve(async req => {
  if (req.method !== 'POST') return Response.json({ error: 'Metodo no permitido' }, { status: 405 });
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const authorization = await resolveAuthorizedContext(base44, user, {
    organizationHint: body.organization_id || null,
    allowedRoles: ['ORG_ADMIN'],
  });
  if (!authorization.ok) return Response.json({ error: authorization.error, code: authorization.code }, { status: authorization.status });
  const readiness = await validateTenantReadiness(base44, authorization.organizationId);
  return Response.json(readiness, { status: readiness.ready ? 200 : 409 });
});
