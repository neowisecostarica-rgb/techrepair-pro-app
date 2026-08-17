import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// Retired duplicate DMR writer. createWorkOrder is the sole authority for
// reception DMR creation and owns its idempotency identity.
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ error: 'No autenticado', code: 'AUTH_REQUIRED' }, { status: 401 });
  }
  return Response.json({
    error: 'dmrOrchestrator fue retirado; la creacion DMR pertenece a createWorkOrder',
    code: 'DMR_ORCHESTRATOR_RETIRED',
  }, { status: 410 });
});
