import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { appendAuditEvent } from '../_shared/auditEvent.ts';

Deno.serve(async req => {
  if (req.method !== 'POST') return Response.json({ error: 'Metodo no permitido' }, { status: 405 });
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const authorization = await resolveAuthorizedContext(base44, user, { allowedRoles: ['ORG_ADMIN'] });
  if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status });
  const apply = body.apply === true;
  const operationKey = typeof body.operation_key === 'string' && body.operation_key.trim() ? body.operation_key.trim().slice(0, 240) : null;
  if (apply && !operationKey) return Response.json({ error: 'operation_key requerido para apply', code: 'ROLE_MIGRATION_OPERATION_KEY_REQUIRED' }, { status: 400 });
  const accounts = await base44.asServiceRole.entities.UserAccount.filter({ organization_id: authorization.organizationId, role: 'SUPPORT' }, '-created_date', 500);
  const truncated = (accounts?.length || 0) >= 500;
  if (!apply) return Response.json({ dry_run: true, truncated, organization_id: authorization.organizationId, from_role: 'SUPPORT', to_role: 'CUSTOMER_SERVICE', affected_count: accounts?.length || 0, account_ids: (accounts || []).map(account => account.id) });
  if (truncated) return Response.json({ error: 'La migracion excede el limite seguro; ejecutar por un plan aprobado por lotes', code: 'ROLE_MIGRATION_TRUNCATED' }, { status: 409 });
  const migrated = [];
  try {
    for (const account of accounts || []) {
      const now = new Date().toISOString();
      const updated = await base44.asServiceRole.entities.UserAccount.update(account.id, {
        role: 'CUSTOMER_SERVICE', role_migrated_from: 'SUPPORT',
        role_migration_operation_key: operationKey, role_migrated_at: now, role_migrated_by: user.id,
      });
      try {
        await appendAuditEvent(base44, {
          eventType: 'USER_ROLE_MIGRATED', principalClass: authorization.principalClass,
          actorUserId: user.id, actorPrimaryRole: authorization.persistedRole,
          organizationId: authorization.organizationId, branchId: account.branch_id || null,
          resourceType: 'UserAccount', resourceId: account.id,
          commandPolicyId: 'CP-USER-001', correlationId: `${operationKey}:${account.id}`,
          auditOperationId: `support-role-migration:${account.id}`, operationKey,
          operationSemantics: { from_role: 'SUPPORT', to_role: 'CUSTOMER_SERVICE' },
          priorState: { role: 'SUPPORT' }, newState: { role: 'CUSTOMER_SERVICE' },
        });
      } catch (error) {
        await base44.asServiceRole.entities.UserAccount.update(account.id, {
          role: 'SUPPORT', role_migrated_from: account.role_migrated_from || null,
          role_migration_operation_key: account.role_migration_operation_key || null,
          role_migrated_at: account.role_migrated_at || null,
          role_migrated_by: account.role_migrated_by || null,
        }).catch(() => null);
        throw error;
      }
      migrated.push({ before: account, after: updated });
    }
  } catch (error) {
    return Response.json({
      error: 'Migracion parcial; reintente con la misma operation_key para completar las cuentas SUPPORT restantes',
      code: 'ROLE_MIGRATION_RECOVERY_REQUIRED',
      operation_key: operationKey,
      migrated_count: migrated.length,
      migrated_account_ids: migrated.map(item => item.after.id),
      retryable: true,
    }, { status: 500 });
  }
  return Response.json({ success: true, idempotent: (accounts || []).length === 0, operation_key: operationKey, migrated_count: migrated.length, account_ids: migrated.map(item => item.after.id) });
});
