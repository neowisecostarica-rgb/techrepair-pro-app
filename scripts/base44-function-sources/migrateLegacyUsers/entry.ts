import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { isCanonicalSuperAdmin } from '../_shared/userAuthorization.ts';

const VALID_ROLES = new Set(['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN', 'SALES', 'INVENTORY', 'SUPPORT']);
const VALID_STATUSES = new Set(['invited', 'active', 'suspended']);

// Legacy name retained for deployment compatibility. This endpoint is now a
// read-only diagnostic; mutations require a separately reviewed backend runbook.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 });
    if (!isCanonicalSuperAdmin(user)) {
      return Response.json({ error: 'Superadmin canónico requerido' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    if (body.dry_run === false) {
      return Response.json({
        error: 'La migración mutante está deshabilitada',
        code: 'MUTATING_MIGRATION_DISABLED',
      }, { status: 403 });
    }

    const accounts = await base44.asServiceRole.entities.UserAccount.list('-created_date', 500);
    const findings = (accounts || []).flatMap(account => {
      const issues = [];
      if (!account.organization_id) issues.push('missing_organization_id');
      if (!VALID_ROLES.has(account.role)) issues.push('invalid_role');
      if (!VALID_STATUSES.has(account.status)) issues.push('missing_or_invalid_status');
      return issues.length > 0 ? [{ account_id: account.id, issues }] : [];
    });

    return Response.json({
      dry_run: true,
      mutation_enabled: false,
      total_accounts: accounts?.length || 0,
      findings,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
