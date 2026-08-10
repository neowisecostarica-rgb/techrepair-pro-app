import { isCanonicalSuperAdmin } from './userAuthorization.ts';

const ALLOWED_ACTIONS = new Set([
  'view_org_list',
  'view_org_detail',
  'impersonate_start',
  'impersonate_end',
  'activate_org',
  'deactivate_org',
  'view_logs',
  'create_org',
  'change_plan',
  'update_org',
  'membership_admin',
]);

function clean(value, maxLength) {
  if (value === null || value === undefined) return null;
  return String(value).trim().slice(0, maxLength);
}

export async function appendSuperAdminAudit(base44, user, input = {}) {
  if (!isCanonicalSuperAdmin(user)) {
    const error = new Error('Solo el superadmin canonico puede emitir auditoria administrativa');
    error.code = 'SUPERADMIN_REQUIRED';
    throw error;
  }
  if (!ALLOWED_ACTIONS.has(input.action)) {
    const error = new Error('Accion de auditoria no permitida');
    error.code = 'AUDIT_ACTION_INVALID';
    throw error;
  }

  const correlationId = clean(input.correlationId, 160) || crypto.randomUUID();
  return base44.asServiceRole.entities.SuperAdminAudit.create({
    super_admin_id: user.id,
    super_admin_email: user.email,
    action: input.action,
    target_organization_id: clean(input.organizationId, 160),
    target_organization_name: clean(input.organizationName, 240),
    context: clean(input.context, 2000),
    recorded_at: new Date().toISOString(),
    correlation_id: correlationId,
    metadata: input.metadata ? JSON.stringify(input.metadata).slice(0, 8000) : null,
  });
}
