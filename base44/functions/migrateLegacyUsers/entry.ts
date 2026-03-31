import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const VALID_ROLES = ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN', 'SALES', 'INVENTORY', 'SUPPORT'];

const LEGACY_ROLE_MAP = {
  'admin': 'ORG_ADMIN',
  'user': 'SALES',
  'tech': 'TECHNICIAN',
  'manager': 'BRANCH_ADMIN',
  'AUDITOR': 'SUPPORT',
  'CFO': 'ORG_ADMIN',
  'CEO': 'ORG_ADMIN',
  'SUPER_ADMIN': 'ORG_ADMIN',
};

const ROLES_REQUIRE_BRANCH = ['BRANCH_ADMIN', 'TECHNICIAN', 'SALES', 'INVENTORY', 'SUPPORT'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Solo SUPER_ADMIN puede ejecutar esta función
    const user = await base44.auth.me();
    if (!user?.is_super_admin) {
      return Response.json({ error: 'Forbidden: Solo SUPER_ADMIN puede ejecutar migraciones' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dry_run = body.dry_run !== false; // Default: dry_run = true (seguro)

    const report = {
      dry_run,
      total_accounts: 0,
      repaired: [],
      skipped: [],
      errors: [],
    };

    // Cargar todas las UserAccounts
    const allAccounts = await base44.asServiceRole.entities.UserAccount.list('-created_date', 500);
    report.total_accounts = allAccounts.length;

    // Cargar todas las Branches (para asignación)
    const allBranches = await base44.asServiceRole.entities.Branch.filter({ active: true });
    const branchesByOrg = {};
    for (const b of allBranches) {
      if (!branchesByOrg[b.organization_id]) branchesByOrg[b.organization_id] = [];
      branchesByOrg[b.organization_id].push(b);
    }

    for (const account of allAccounts) {
      const repairs = [];

      // L1: Sin organization_id → no se puede reparar sin evidencia, marcar como orphan
      if (!account.organization_id) {
        repairs.push({ type: 'CANNOT_REPAIR', reason: 'missing_organization_id' });
        report.repaired.push({ id: account.id, email: account.user_email, repairs });
        continue;
      }

      // L2: Role inválido → mapear
      if (!VALID_ROLES.includes(account.role)) {
        const mappedRole = LEGACY_ROLE_MAP[account.role] || 'SALES';
        repairs.push({ type: 'map_role', from: account.role, to: mappedRole });
        if (!dry_run) {
          await base44.asServiceRole.entities.UserAccount.update(account.id, { role: mappedRole });
          account.role = mappedRole; // actualizar referencia para checks subsecuentes
        }
      }

      // L3: Inactivo + tiene organization_id → reactivar
      if (!account.active && account.organization_id) {
        repairs.push({ type: 'reactivate' });
        if (!dry_run) {
          await base44.asServiceRole.entities.UserAccount.update(account.id, { active: true });
          account.active = true;
        }
      }

      // L4: branch_id faltante para roles que lo requieren
      if (ROLES_REQUIRE_BRANCH.includes(account.role) && !account.branch_id) {
        const orgBranches = branchesByOrg[account.organization_id] || [];
        if (orgBranches.length > 0) {
          repairs.push({ type: 'assign_branch', branch_id: orgBranches[0].id });
          if (!dry_run) {
            await base44.asServiceRole.entities.UserAccount.update(account.id, { branch_id: orgBranches[0].id });
          }
        } else {
          repairs.push({ type: 'CANNOT_REPAIR', reason: 'no_branches_in_org', org: account.organization_id });
        }
      }

      if (repairs.length > 0) {
        report.repaired.push({ id: account.id, email: account.user_email, org: account.organization_id, repairs });
      } else {
        report.skipped.push(account.id);
      }
    }

    return Response.json(report);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});