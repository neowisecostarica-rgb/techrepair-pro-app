/**
 * manageOrgUser — Backend function para operaciones críticas de gestión de usuarios
 * Acciones soportadas: invite, updateAccount, updateRole, updateStatus
 * Solo ORG_ADMIN puede ejecutar (verificado server-side).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { appendSuperAdminAudit } from '../_shared/superAdminAudit.ts';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 });
  }

  const body = await req.json();
  const { action, organizationId, targetAccountId, data } = body;
  if (!organizationId) {
    return Response.json({ error: 'organizationId requerido' }, { status: 400 });
  }

  // Verificar que sea ORG_ADMIN de la organización solicitada o SUPER_ADMIN.
  const authorization = await resolveAuthorizedContext(base44, user, {
    organizationHint: organizationId,
    allowedRoles: ['ORG_ADMIN'],
  });
  if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status });
  const effectiveOrgId = authorization.organizationId;
  const auditMembership = async (operation, accountId) => {
    if (!authorization.isSuperAdmin) return;
    await appendSuperAdminAudit(base44, user, {
      action: 'membership_admin',
      organizationId: effectiveOrgId,
      metadata: { operation, account_id: accountId || null },
    });
  };
  const allowedRoles = ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN', 'SALES', 'INVENTORY', 'SUPPORT'];

  if (action === 'invite') {
    const { user_email, role, branch_id } = data;
    if (!user_email || !role) {
      return Response.json({ error: 'user_email y role son requeridos' }, { status: 400 });
    }
    if (!allowedRoles.includes(role)) {
      return Response.json({ error: 'Rol inválido' }, { status: 400 });
    }

    // Invitar al usuario a la plataforma Base44
    try {
      await base44.asServiceRole.functions.invoke('__internal_invite', {});
    } catch (_) { /* no-op si ya existe */ }

    // Intentar invitar con SDK de usuarios
    try {
      await base44.users.inviteUser(user_email, 'user');
    } catch (e) {
      console.warn('[manageOrgUser] inviteUser warning (puede existir):', e.message);
    }

    // Verificar si ya existe UserAccount
    const existing = await base44.asServiceRole.entities.UserAccount.filter({
      organization_id: effectiveOrgId,
      user_email,
    });

    const now = new Date().toISOString();

    if (existing.length === 0) {
      const created = await base44.asServiceRole.entities.UserAccount.create({
        user_email,
        organization_id: effectiveOrgId,
        branch_id: branch_id || null,
        role,
        status: 'invited',
        active: false,
        invited_at: now,
      });
      try {
        await auditMembership('invite_created', created.id);
      } catch (error) {
        await base44.asServiceRole.entities.UserAccount.delete(created.id);
        throw error;
      }
      return Response.json({ success: true, action: 'created', account: created });
    }

    if (existing.length > 1) {
      return Response.json({ error: 'Existen múltiples cuentas para este email en la organización' }, { status: 409 });
    }

    const account = existing[0];
    if (isCanonicalActiveUserAccount(account)) {
      return Response.json({ error: `${user_email} ya tiene acceso activo. Usa updateRole o updateStatus.` }, { status: 409 });
    }

    // Reinvitar
    const updated = await base44.asServiceRole.entities.UserAccount.update(account.id, {
      role,
      branch_id: branch_id || null,
      status: 'invited',
      active: false,
      invited_at: now,
    });
    try {
      await auditMembership('invite_reissued', updated.id);
    } catch (error) {
      await base44.asServiceRole.entities.UserAccount.update(account.id, {
        role: account.role,
        branch_id: account.branch_id || null,
        status: account.status,
        active: account.status === 'active',
        invited_at: account.invited_at || null,
      });
      throw error;
    }
    return Response.json({ success: true, action: 'reinvited', account: updated });
  }

  if (action === 'updateStatus') {
    const { status } = data; // 'active' | 'suspended' | 'invited'
    if (!targetAccountId || !status) {
      return Response.json({ error: 'targetAccountId y status son requeridos' }, { status: 400 });
    }
    if (!['active', 'suspended', 'invited'].includes(status)) {
      return Response.json({ error: 'Estado inválido' }, { status: 400 });
    }

    // Verificar que la cuenta pertenece a la org
    const target = await base44.asServiceRole.entities.UserAccount.filter({ id: targetAccountId });
    if (!target[0] || target[0].organization_id !== effectiveOrgId) {
      return Response.json({ error: 'Cuenta no encontrada en esta organización' }, { status: 404 });
    }

    // Proteger último ORG_ADMIN activo
    if (status === 'suspended' && target[0].role === 'ORG_ADMIN') {
      const activeAdmins = await base44.asServiceRole.entities.UserAccount.filter({
        organization_id: effectiveOrgId,
        role: 'ORG_ADMIN',
      });
      const confirmedActiveAdmins = activeAdmins.filter(isCanonicalActiveUserAccount);
      if (confirmedActiveAdmins.length <= 1) {
        return Response.json({ error: 'No se puede suspender el último ORG_ADMIN activo' }, { status: 409 });
      }
    }

    const updated = await base44.asServiceRole.entities.UserAccount.update(targetAccountId, {
      status,
      active: status === 'active',
    });
    try {
      await auditMembership('status_updated', updated.id);
    } catch (error) {
      await base44.asServiceRole.entities.UserAccount.update(targetAccountId, {
        status: target[0].status,
        active: target[0].status === 'active',
      });
      throw error;
    }
    return Response.json({ success: true, account: updated });
  }

  if (action === 'updateAccount') {
    const { role, branch_id, status } = data;
    if (!targetAccountId || !role || !status) {
      return Response.json({ error: 'targetAccountId, role y status son requeridos' }, { status: 400 });
    }
    if (!allowedRoles.includes(role)) {
      return Response.json({ error: 'Rol inválido' }, { status: 400 });
    }
    if (!['active', 'suspended', 'invited'].includes(status)) {
      return Response.json({ error: 'Estado inválido' }, { status: 400 });
    }

    const target = await base44.asServiceRole.entities.UserAccount.filter({ id: targetAccountId });
    if (!target[0] || target[0].organization_id !== effectiveOrgId) {
      return Response.json({ error: 'Cuenta no encontrada en esta organización' }, { status: 404 });
    }

    const removesActiveAdmin =
      target[0].role === 'ORG_ADMIN' &&
      isCanonicalActiveUserAccount(target[0]) &&
      (role !== 'ORG_ADMIN' || status === 'suspended');

    if (removesActiveAdmin) {
      const activeAdmins = await base44.asServiceRole.entities.UserAccount.filter({
        organization_id: effectiveOrgId,
        role: 'ORG_ADMIN',
      });
      const confirmedActiveAdmins = activeAdmins.filter(isCanonicalActiveUserAccount);
      if (confirmedActiveAdmins.length <= 1) {
        return Response.json({ error: 'No se puede modificar el último ORG_ADMIN activo' }, { status: 409 });
      }
    }

    const updated = await base44.asServiceRole.entities.UserAccount.update(targetAccountId, {
      role,
      branch_id: branch_id !== undefined ? branch_id : target[0].branch_id,
      status,
      active: status === 'active',
    });
    try {
      await auditMembership('account_updated', updated.id);
    } catch (error) {
      await base44.asServiceRole.entities.UserAccount.update(targetAccountId, {
        role: target[0].role,
        branch_id: target[0].branch_id || null,
        status: target[0].status,
        active: target[0].status === 'active',
      });
      throw error;
    }
    return Response.json({ success: true, account: updated });
  }

  if (action === 'updateRole') {
    const { role, branch_id } = data;
    if (!targetAccountId || !role) {
      return Response.json({ error: 'targetAccountId y role son requeridos' }, { status: 400 });
    }
    if (!allowedRoles.includes(role)) {
      return Response.json({ error: 'Rol inválido' }, { status: 400 });
    }

    const target = await base44.asServiceRole.entities.UserAccount.filter({ id: targetAccountId });
    if (!target[0] || target[0].organization_id !== effectiveOrgId) {
      return Response.json({ error: 'Cuenta no encontrada en esta organización' }, { status: 404 });
    }

    if (target[0].role === 'ORG_ADMIN' && role !== 'ORG_ADMIN' && isCanonicalActiveUserAccount(target[0])) {
      const activeAdmins = await base44.asServiceRole.entities.UserAccount.filter({
        organization_id: effectiveOrgId,
        role: 'ORG_ADMIN',
      });
      const confirmedActiveAdmins = activeAdmins.filter(isCanonicalActiveUserAccount);
      if (confirmedActiveAdmins.length <= 1) {
        return Response.json({ error: 'No se puede cambiar el rol del último ORG_ADMIN activo' }, { status: 409 });
      }
    }

    const updated = await base44.asServiceRole.entities.UserAccount.update(targetAccountId, {
      role,
      branch_id: branch_id !== undefined ? branch_id : target[0].branch_id,
    });
    try {
      await auditMembership('role_updated', updated.id);
    } catch (error) {
      await base44.asServiceRole.entities.UserAccount.update(targetAccountId, {
        role: target[0].role,
        branch_id: target[0].branch_id || null,
      });
      throw error;
    }
    return Response.json({ success: true, account: updated });
  }

  return Response.json({ error: `Acción desconocida: ${action}` }, { status: 400 });
});
