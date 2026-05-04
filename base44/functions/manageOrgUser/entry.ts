/**
 * manageOrgUser — Backend function para operaciones críticas de gestión de usuarios
 * Acciones soportadas: invite, updateRole, updateStatus, updateBranch
 * Solo ORG_ADMIN puede ejecutar (verificado server-side).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 });
  }

  // Verificar que sea ORG_ADMIN o SUPER_ADMIN
  const callerAccounts = await base44.asServiceRole.entities.UserAccount.filter({ user_id: user.id });
  const callerOrgId = user.impersonating_org_id || user.organization_id;
  const callerAccount = callerAccounts.find(a => a.organization_id === callerOrgId && a.active);

  const isSuperAdmin = user.is_super_admin === true;
  const isOrgAdmin = callerAccount?.role === 'ORG_ADMIN';

  if (!isSuperAdmin && !isOrgAdmin) {
    return Response.json({ error: 'Acceso denegado: se requiere ORG_ADMIN' }, { status: 403 });
  }

  const body = await req.json();
  const { action, organizationId, targetAccountId, data } = body;

  // Garantizar aislamiento: solo operar dentro de la org del caller
  const effectiveOrgId = isSuperAdmin ? organizationId : callerOrgId;
  if (!effectiveOrgId) {
    return Response.json({ error: 'organizationId requerido' }, { status: 400 });
  }

  if (action === 'invite') {
    const { user_email, role, branch_id } = data;
    if (!user_email || !role) {
      return Response.json({ error: 'user_email y role son requeridos' }, { status: 400 });
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
        active: true,
        invited_at: now,
      });
      return Response.json({ success: true, action: 'created', account: created });
    }

    const account = existing[0];
    if (account.status === 'active' || account.active === true) {
      return Response.json({ error: `${user_email} ya tiene acceso activo. Usa updateRole o updateStatus.` }, { status: 409 });
    }

    // Reinvitar
    const updated = await base44.asServiceRole.entities.UserAccount.update(account.id, {
      role,
      branch_id: branch_id || null,
      status: 'invited',
      active: true,
      invited_at: now,
    });
    return Response.json({ success: true, action: 'reinvited', account: updated });
  }

  if (action === 'updateStatus') {
    const { status } = data; // 'active' | 'suspended' | 'invited'
    if (!targetAccountId || !status) {
      return Response.json({ error: 'targetAccountId y status son requeridos' }, { status: 400 });
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
        active: true,
      });
      if (activeAdmins.length <= 1) {
        return Response.json({ error: 'No se puede suspender el último ORG_ADMIN activo' }, { status: 409 });
      }
    }

    const updated = await base44.asServiceRole.entities.UserAccount.update(targetAccountId, {
      status,
      active: status !== 'suspended',
    });
    return Response.json({ success: true, account: updated });
  }

  if (action === 'updateRole') {
    const { role, branch_id } = data;
    if (!targetAccountId || !role) {
      return Response.json({ error: 'targetAccountId y role son requeridos' }, { status: 400 });
    }

    const target = await base44.asServiceRole.entities.UserAccount.filter({ id: targetAccountId });
    if (!target[0] || target[0].organization_id !== effectiveOrgId) {
      return Response.json({ error: 'Cuenta no encontrada en esta organización' }, { status: 404 });
    }

    const updated = await base44.asServiceRole.entities.UserAccount.update(targetAccountId, {
      role,
      branch_id: branch_id !== undefined ? branch_id : target[0].branch_id,
    });
    return Response.json({ success: true, account: updated });
  }

  return Response.json({ error: `Acción desconocida: ${action}` }, { status: 400 });
});