// Retired compatibility endpoint.
// Attention-state mutations belong exclusively to updateWorkOrderAttentionStatus;
// lifecycle mutations belong exclusively to transitionWorkOrderStatus.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'No autenticado', code: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
    }

    return Response.json({
      error: 'Este escritor legacy esta retirado. Usa el comando soberano correspondiente.',
      code: 'LEGACY_WORK_ORDER_WRITER_RETIRED',
      lifecycle_owner: 'transitionWorkOrderStatus',
      attention_owner: 'updateWorkOrderAttentionStatus',
    }, { status: 410 });
  } catch (error) {
    return Response.json({ error: error.message, code: 'LEGACY_WRITER_RETIREMENT_ERROR' }, { status: 500 });
  }
});
