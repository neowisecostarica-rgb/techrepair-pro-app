/**
 * repairUserIdentity — Repara el UserAccount del usuario autenticado.
 * Solo puede modificar la propia cuenta del usuario que invoca la función.
 * Usa asServiceRole para escritura (el user token no tiene permisos de escritura en UserAccount).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { isCanonicalActiveUserAccount } from '../_shared/userAuthorization.ts';

// Roles válidos oficiales (cerrado)
const VALID_ROLES = ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN', 'SALES', 'INVENTORY', 'SUPPORT'];

// Roles legacy → rol oficial
const LEGACY_ROLE_MAP = {
  'admin': 'ORG_ADMIN',
  'user': 'SALES',
  'tech': 'TECHNICIAN',
  'manager': 'BRANCH_ADMIN',
  'AUDITOR': 'SUPPORT',
  'CFO': 'ORG_ADMIN',
  'CEO': 'ORG_ADMIN',
  'SUPER_ADMIN': 'ORG_ADMIN', // SUPER_ADMIN en UserAccount es un error legacy
};

// Roles que requieren branch_id obligatorio
const ROLES_REQUIRE_BRANCH = ['BRANCH_ADMIN', 'TECHNICIAN', 'SALES', 'INVENTORY', 'SUPPORT'];

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // A. Obtener usuario actual
  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 });
  }

  // SUPER_ADMIN no pasa por reparación de UserAccount
  if (user.is_super_admin) {
    return Response.json({ status: 'skipped', reason: 'super_admin' });
  }

  const body = await req.json().catch(() => ({}));

  // B. Buscar UserAccount activa del usuario
  // Si se provee organization_id (caso multi-org), filtrar por esa org
  const targetOrgId = body.organization_id || user.organization_id || null;

  const allAccounts = await base44.asServiceRole.entities.UserAccount.filter({ user_id: user.id });
  const activeAccounts = allAccounts.filter(account =>
    isCanonicalActiveUserAccount(account) && account.organization_id
  );

  if (activeAccounts.length === 0) {
    return Response.json({ status: 'no_membership', repairs: [] });
  }

  // Seleccionar cuenta a reparar
  let account = null;
  if (targetOrgId) {
    account = activeAccounts.find(a => a.organization_id === targetOrgId) || null;
  }
  // Si no se encontró con org_id específico y solo hay una cuenta, usar esa
  if (!account && activeAccounts.length === 1) {
    account = activeAccounts[0];
  }

  if (!account) {
    // Multi-org sin org_id específico: no se puede determinar qué cuenta reparar
    return Response.json({ status: 'multi_org_required', repairs: [] });
  }

  const repairs = [];
  const updates = {};

  // C1. Mapear role legacy → role oficial
  if (!VALID_ROLES.includes(account.role)) {
    const mappedRole = LEGACY_ROLE_MAP[account.role] || 'SALES';
    console.log(`[repairUserIdentity] Role legacy "${account.role}" → "${mappedRole}" para user_id: ${user.id}`);
    updates.role = mappedRole;
    repairs.push(`mapped_role:${account.role}→${mappedRole}`);
  }

  // Determinar el role efectivo (ya reparado si aplica) para evaluar branch_id
  const effectiveRole = updates.role || account.role;

  // C2. Asignar branch_id si el role lo requiere y está vacío
  if (ROLES_REQUIRE_BRANCH.includes(effectiveRole) && !account.branch_id) {
    const branches = await base44.asServiceRole.entities.Branch.filter({
      organization_id: account.organization_id,
      active: true,
    });
    if (branches.length > 0) {
      updates.branch_id = branches[0].id;
      repairs.push(`assigned_branch:${branches[0].id}`);
      console.log(`[repairUserIdentity] Branch asignada: ${branches[0].id} para user_id: ${user.id}`);
    } else {
      console.warn(`[repairUserIdentity] No hay branches activas para org: ${account.organization_id}`);
    }
  }

  // D. Aplicar updates si hay algo que reparar
  if (Object.keys(updates).length > 0) {
    // Seguridad: NO permitir cambiar organization_id ni campos fuera del scope de reparación
    delete updates.organization_id;
    delete updates.status;
    delete updates.active;
    delete updates.user_id;
    delete updates.user_email;

    account = await base44.asServiceRole.entities.UserAccount.update(account.id, updates);
    console.log(`[repairUserIdentity] Reparaciones aplicadas para user_id: ${user.id}:`, repairs);
  }

  return Response.json({
    status: 'ok',
    repairs,
    account: {
      id: account.id,
      role: account.role,
      branch_id: account.branch_id,
      organization_id: account.organization_id,
    },
  });
});
