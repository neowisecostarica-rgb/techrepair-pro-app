import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { getCanonicalBranchScope } from '../_shared/operationalAuthorization.ts';
import { executeInventoryCommand, InventoryCommandError } from '../_shared/inventoryMutationService.ts';

Deno.serve(async req => {
  if (req.method !== 'POST') return Response.json({ error: 'Metodo no permitido' }, { status: 405 });
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });
  const authorization = await resolveAuthorizedContext(base44, user, { allowedRoles: ['ORG_ADMIN', 'BRANCH_ADMIN', 'INVENTORY'] });
  if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status });

  let body;
  try { body = await req.json(); }
  catch { return Response.json({ error: 'Body invalido' }, { status: 400 }); }
  const { inventario_id, delta, tipo, motivo, operation_key: operationKey } = body;
  if (!inventario_id || !['entrada', 'salida'].includes(tipo)) {
    return Response.json({ error: 'inventario_id y tipo entrada|salida son requeridos' }, { status: 400 });
  }
  if (!Number.isFinite(delta) || delta <= 0) return Response.json({ error: 'delta debe ser mayor a 0' }, { status: 400 });
  if (!String(motivo || '').trim()) return Response.json({ error: 'motivo es requerido' }, { status: 400 });
  if (!String(operationKey || '').trim()) {
    return Response.json({ error: 'operation_key estable es requerido', code: 'INVENTORY_OPERATION_KEY_REQUIRED' }, { status: 400 });
  }

  const orgId = authorization.organizationId;
  const [inventory] = await base44.asServiceRole.entities.Inventario.filter({ id: inventario_id, organization_id: orgId }, 1);
  if (!inventory) return Response.json({ error: 'Producto no encontrado' }, { status: 404 });
  const scope = getCanonicalBranchScope(authorization);
  if (!scope.ok) return Response.json({ error: scope.error, code: scope.code }, { status: scope.status });
  if (!scope.organizationWide && inventory.branch_id !== scope.branchId) {
    return Response.json({ error: 'Producto fuera de la sucursal autorizada', code: 'INVENTORY_CROSS_BRANCH_DENIED' }, { status: 403 });
  }
  if (!inventory.branch_id) {
    return Response.json({ error: 'Inventario legacy sin sucursal; ejecutar auditoria', code: 'INVENTORY_BRANCH_REQUIRED' }, { status: 409 });
  }

  try {
    const result = await executeInventoryCommand(base44, {
      organizationId: orgId,
      branchId: inventory.branch_id,
      actorId: user.id || user.email,
      operationKey: String(operationKey).trim(),
      referenceType: 'MANUAL_ADJUSTMENT',
      referenceId: inventario_id,
      reason: motivo.trim(),
      movements: [{ inventoryId: inventario_id, movementType: tipo === 'entrada' ? 'ADJUST_IN' : 'ADJUST_OUT', quantity: delta }],
    });
    const movement = result.results[0];
    return Response.json({
      success: true, inventario_id, tipo, delta,
      stock_anterior: movement.available_before,
      stock_nuevo: movement.available_after,
      idempotent: result.idempotent,
    });
  } catch (error) {
    const status = error instanceof InventoryCommandError ? error.status : 500;
    return Response.json({ error: error.message, code: error.code || 'INVENTORY_ADJUST_FAILED', ...(error.details || {}) }, { status });
  }
});
