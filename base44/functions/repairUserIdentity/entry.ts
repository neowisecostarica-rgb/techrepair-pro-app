import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// Legacy endpoint retained only to fail closed for deployed callers.
// Identity and membership mutations are owned by identityGateway/manageOrgUser.
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });
  return Response.json({
    error: 'La reparación de identidad desde autoservicio está deshabilitada',
    code: 'IDENTITY_REPAIR_DISABLED',
  }, { status: 410 });
});
