import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import {
  getUserDataField,
  isCanonicalSuperAdmin,
  resolveAuthorizedContext,
  resolveIdentitySnapshot,
  sanitizeOrganization,
  sanitizeUserAccount,
} from '../_shared/userAuthorization.ts';
import { appendSuperAdminAudit } from '../_shared/superAdminAudit.ts';
import { appendAuditEvent } from '../_shared/auditEvent.ts';
import { projectSuperAdminAudit } from '../_shared/dataProjections.ts';
import {
  canonicalOrganizationData,
  canonicalOwnerMembershipData,
  canonicalPrimaryBranchData,
  seedBaselineCategories,
  validateTenantReadiness,
} from '../_shared/tenantProvisioning.ts';
import {
  AUTHORIZATION_PRESET_VERSION,
  getRoleCapabilities,
  getRoleScope,
  normalizeTenantRole,
} from '../_shared/roleCapabilities.ts';
import { inspectControlledPilotConfiguration } from '../_shared/controlledPilotAuthority.ts';

const ORG_ROLES = ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN', 'SALES', 'INVENTORY', 'CUSTOMER_SERVICE', 'SUPPORT'];
const ORG_UPDATE_FIELDS = new Set([
  'name', 'legal_name', 'country', 'currency', 'telefono_negocio', 'logo_url', 'email',
  'direccion_comercial', 'tipo_entidad', 'identificacion_fiscal', 'direccion_fiscal',
  'public_base_url', 'garantia_config', 'saldo_caja_inicial', 'saldo_caja_actual',
  'ultima_actualizacion_caja', 'inventario_config', 'marketing_spend',
]);
const ADMIN_ORG_UPDATE_FIELDS = new Set(['status', 'plan', ...ORG_UPDATE_FIELDS]);

function jsonError(error, status, code = undefined) {
  return Response.json({ error, ...(code ? { code } : {}) }, { status });
}

function clean(value, maxLength = 500) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
}

function pick(input, fields) {
  const output = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (fields.has(key)) output[key] = value;
  }
  return output;
}

async function loadOrganizations(base44, ids) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))];
  if (uniqueIds.length === 0) return [];
  const organizations = [];
  for (const id of uniqueIds) {
    const found = await base44.asServiceRole.entities.Organization.filter({ id }, 1);
    if (found?.[0]) organizations.push(found[0]);
  }
  return organizations;
}

async function persistUserIdentity(base44, userId, data) {
  return base44.asServiceRole.entities.User.update(userId, data);
}

async function loadBackendUser(base44, userId) {
  const users = await base44.asServiceRole.entities.User.filter({ id: userId }, 1);
  return users?.[0] || null;
}

function controlledPilotSnapshot(organization) {
  return {
    controlled_pilot_mode: organization?.controlled_pilot_mode === true,
    controlled_pilot_operator_user_id: organization?.controlled_pilot_operator_user_id || null,
    controlled_pilot_branch_id: organization?.controlled_pilot_branch_id || null,
    controlled_pilot_configured_at: organization?.controlled_pilot_configured_at || null,
    controlled_pilot_configured_by_user_id: organization?.controlled_pilot_configured_by_user_id || null,
  };
}

async function buildContext(base44, user) {
  let identity = await resolveIdentitySnapshot(base44, user);
  if (!identity.ok) return identity;

  if (identity.isSuperAdmin) {
    if (getUserDataField(user, 'is_super_admin') !== true) {
      await persistUserIdentity(base44, user.id, { is_super_admin: true });
    }
  } else if (
    identity.activeMemberships.length === 1 &&
    identity.user.organization_id !== identity.activeMemberships[0].organization_id
  ) {
    await persistUserIdentity(base44, user.id, {
      organization_id: identity.activeMemberships[0].organization_id,
      impersonating_org_id: null,
      impersonating_started_at: null,
      impersonation_previous_organization_id: null,
      is_super_admin: false,
    });
    const refreshedUser = {
      ...user,
      organization_id: identity.activeMemberships[0].organization_id,
      data: { ...(user.data || {}), organization_id: identity.activeMemberships[0].organization_id },
    };
    identity = await resolveIdentitySnapshot(base44, refreshedUser);
  }

  const organizationIds = identity.isSuperAdmin
    ? [identity.user.impersonating_org_id]
    : [
        ...identity.activeMemberships.map(account => account.organization_id),
        ...identity.pendingInvitations.map(account => account.organization_id),
      ];
  const organizations = await loadOrganizations(base44, organizationIds);
  const organizationById = new Map(organizations.map(org => [org.id, sanitizeOrganization(org)]));
  const authorizationRole = identity.isSuperAdmin
    ? (identity.user.impersonating_org_id ? 'ORG_ADMIN' : 'SUPER_ADMIN')
    : normalizeTenantRole(identity.activeAccount?.role);
  const activeOrganization = organizations.find(org => org.id === identity.user.organization_id) || null;

  return {
    ok: true,
    user: identity.user,
    userAccount: sanitizeUserAccount(identity.activeAccount),
    memberships: identity.activeMemberships.map(sanitizeUserAccount),
    pendingInvitations: identity.pendingInvitations.map(account => ({
      ...sanitizeUserAccount(account),
      organization: organizationById.get(account.organization_id) || null,
    })),
    organizations: organizations.map(sanitizeOrganization),
    authorization: {
      role: authorizationRole,
      capabilities: authorizationRole === 'SUPER_ADMIN' ? [] : getRoleCapabilities(authorizationRole),
      scope: authorizationRole === 'SUPER_ADMIN' ? 'PLATFORM' : getRoleScope(authorizationRole),
      preset_version: AUTHORIZATION_PRESET_VERSION,
      controlled_pilot_mode: inspectControlledPilotConfiguration(activeOrganization).enabled,
    },
    identityStatus: identity.isSuperAdmin
      ? null
      : identity.activeMemberships.length > 1 && !identity.activeAccount
        ? 'MULTI_ORG_REQUIRED'
        : identity.activeMemberships.length === 0
          ? 'NO_MEMBERSHIP'
          : null,
  };
}

async function compensate(base44, records) {
  for (const record of [...records].reverse()) {
    try { await base44.asServiceRole.entities[record.entity].delete(record.id); }
    catch (error) { console.error('[identityGateway] compensation failed', record, error?.message); }
  }
}

async function finalizeProvisioning(base44, { organization, branch, account, actor, principalClass, correlationId }) {
  const structural = await validateTenantReadiness(base44, organization.id, { requireReadyMarker: false });
  if (!structural.ready) {
    const error = new Error('PROVISIONING_READINESS_VALIDATION_FAILED');
    error.code = 'PROVISIONING_READINESS_VALIDATION_FAILED';
    error.details = structural;
    throw error;
  }
  await appendAuditEvent(base44, {
    eventType: 'TENANT_PROVISIONED',
    principalClass,
    actorUserId: actor.id,
    actorPrimaryRole: principalClass === 'PLATFORM_ADMIN' ? 'SUPER_ADMIN' : 'ORG_ADMIN',
    organizationId: organization.id,
    branchId: branch.id,
    resourceType: 'Organization',
    resourceId: organization.id,
    commandPolicyId: 'CP-PROV-001',
    correlationId,
    auditOperationId: `tenant-provisioning:${organization.id}`,
    operationKey: correlationId,
    newState: { provisioning_status: 'READY', owner_account_id: account.id, primary_branch_id: branch.id },
    metadata: { preset_version: structural.preset_version, custom_grants_enabled: false, checks: structural.checks },
  });
  const provisionedAt = new Date().toISOString();
  const readyOrganization = await base44.asServiceRole.entities.Organization.update(organization.id, {
    provisioning_status: 'READY',
    provisioned_at: provisionedAt,
  });
  const readiness = await validateTenantReadiness(base44, organization.id);
  if (!readiness.ready) throw Object.assign(new Error('PROVISIONING_READY_MARKER_INVALID'), { code: 'PROVISIONING_READY_MARKER_INVALID', details: readiness });
  return { organization: readyOrganization, readiness };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonError('Metodo no permitido', 405, 'METHOD_NOT_ALLOWED');

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return jsonError('No autenticado', 401, 'AUTH_REQUIRED');
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'context';

    if (action === 'context') {
      const context = await buildContext(base44, user);
      if (!context.ok) return jsonError(context.error, context.status);
      return Response.json(context);
    }

    if (action === 'switchOrganization') {
      if (isCanonicalSuperAdmin(user)) {
        return jsonError('Superadmin debe usar impersonacion autorizada', 403, 'IMPERSONATION_REQUIRED');
      }
      const authorization = await resolveAuthorizedContext(base44, user, {
        organizationHint: clean(body.organization_id, 160),
        allowedRoles: ORG_ROLES,
      });
      if (!authorization.ok) return jsonError(authorization.error, authorization.status);
      await persistUserIdentity(base44, user.id, {
        organization_id: authorization.organizationId,
        impersonating_org_id: null,
        impersonating_started_at: null,
        impersonation_previous_organization_id: null,
        is_super_admin: false,
      });
      return Response.json({ success: true, organization_id: authorization.organizationId });
    }

    if (action === 'acceptInvitation') {
      if (isCanonicalSuperAdmin(user)) return jsonError('Superadmin no acepta membresias de tenant', 403);
      const identity = await resolveIdentitySnapshot(base44, user);
      const invitationId = clean(body.invitation_id, 160);
      const invitation = identity.pendingInvitations.find(candidate =>
        !invitationId || candidate.id === invitationId
      );
      if (!invitation) return jsonError('Invitacion no encontrada', 404, 'INVITATION_NOT_FOUND');
      const [invitationOrganization] = await base44.asServiceRole.entities.Organization.filter({ id: invitation.organization_id }, 1);
      if (inspectControlledPilotConfiguration(invitationOrganization).enabled) {
        return jsonError('Las membresias estan congeladas durante el piloto controlado', 409, 'CONTROLLED_PILOT_MEMBERSHIP_FROZEN');
      }

      const updated = await base44.asServiceRole.entities.UserAccount.update(invitation.id, {
        user_id: user.id,
        status: 'active',
        active: true,
        accepted_at: invitation.accepted_at || new Date().toISOString(),
      });
      await persistUserIdentity(base44, user.id, {
        organization_id: invitation.organization_id,
        impersonating_org_id: null,
        impersonating_started_at: null,
        impersonation_previous_organization_id: null,
        is_super_admin: false,
      });
      return Response.json({ success: true, account: sanitizeUserAccount(updated) });
    }

    if (action === 'bootstrapOrganization') {
      if (isCanonicalSuperAdmin(user)) return jsonError('Superadmin debe usar adminCreateOrganization', 403);
      const identity = await resolveIdentitySnapshot(base44, user);
      if (identity.activeMemberships.length > 0 || identity.pendingInvitations.length > 0) {
        return jsonError('La cuenta ya tiene una membresia o invitacion', 409, 'MEMBERSHIP_ALREADY_EXISTS');
      }

      const input = body.organization || {};
      const name = clean(input.name, 240);
      const country = clean(input.country, 120);
      const currency = clean(input.currency, 16).toUpperCase();
      if (!name || !country || !currency) return jsonError('Nombre, pais y moneda son requeridos', 400);

      const created = [];
      try {
        const correlationId = clean(body.correlation_id, 240) || crypto.randomUUID();
        const organization = await base44.asServiceRole.entities.Organization.create(canonicalOrganizationData({
          name,
          country,
          currency,
          plan: 'basic',
        }, correlationId));
        created.push({ entity: 'Organization', id: organization.id });
        const account = await base44.asServiceRole.entities.UserAccount.create(canonicalOwnerMembershipData({
          organizationId: organization.id, userId: user.id, email: user.email, status: 'active',
        }));
        created.push({ entity: 'UserAccount', id: account.id });
        const branch = await base44.asServiceRole.entities.Branch.create(canonicalPrimaryBranchData(organization.id));
        created.push({ entity: 'Branch', id: branch.id });
        await seedBaselineCategories(base44, organization.id, created);
        const finalized = await finalizeProvisioning(base44, {
          organization, branch, account, actor: user, principalClass: 'HUMAN_MEMBER', correlationId,
        });
        await persistUserIdentity(base44, user.id, {
          organization_id: organization.id,
          impersonating_org_id: null,
          impersonating_started_at: null,
          impersonation_previous_organization_id: null,
          is_super_admin: false,
        });
        return Response.json({
          success: true,
          organization: sanitizeOrganization(finalized.organization),
          account: sanitizeUserAccount(account),
          branch,
          readiness: finalized.readiness,
        }, { status: 201 });
      } catch (error) {
        await compensate(base44, created);
        throw error;
      }
    }

    if (action === 'configureControlledPilot') {
      if (!isCanonicalSuperAdmin(user)) return jsonError('Superadmin requerido', 403, 'SUPERADMIN_REQUIRED');
      const internalUser = await loadBackendUser(base44, user.id);
      if (getUserDataField(internalUser || user, 'impersonating_org_id')) {
        return jsonError('Finaliza la impersonacion antes de configurar el piloto', 409, 'CONTROLLED_PILOT_IMPERSONATION_ACTIVE');
      }

      const organizationId = clean(body.organization_id, 160);
      const enabled = body.enabled === true;
      const [organization] = await base44.asServiceRole.entities.Organization.filter({ id: organizationId }, 1);
      if (!organization) return jsonError('Organizacion no encontrada', 404, 'ORGANIZATION_NOT_FOUND');
      const before = controlledPilotSnapshot(organization);
      let changes;

      if (enabled) {
        if (organization.status !== 'active') return jsonError('La organizacion debe estar activa', 409, 'CONTROLLED_PILOT_ORGANIZATION_INACTIVE');
        const operatorUserId = clean(body.operator_user_id, 160);
        const branchId = clean(body.branch_id, 160);
        if (!operatorUserId || !branchId) return jsonError('operator_user_id y branch_id son requeridos', 400, 'CONTROLLED_PILOT_CONFIGURATION_INVALID');
        const [accounts, branches] = await Promise.all([
          base44.asServiceRole.entities.UserAccount.filter({ organization_id: organizationId }, '-created_date', 500),
          base44.asServiceRole.entities.Branch.filter({ id: branchId, organization_id: organizationId, active: true }, '-created_date', 2),
        ]);
        const activeAccounts = (accounts || []).filter(account => account.status === 'active');
        const operatorAccount = activeAccounts.find(account => account.user_id === operatorUserId);
        if (activeAccounts.length !== 1 || !operatorAccount || operatorAccount.role !== 'ORG_ADMIN') {
          return jsonError('El piloto requiere exactamente una membresia activa ORG_ADMIN para el operador designado', 409, 'CONTROLLED_PILOT_SINGLE_OPERATOR_REQUIRED');
        }
        if (branches?.length !== 1) return jsonError('La sucursal canonica no existe o no esta activa', 409, 'CONTROLLED_PILOT_BRANCH_INVALID');
        const now = new Date().toISOString();
        changes = {
          controlled_pilot_mode: true,
          controlled_pilot_operator_user_id: operatorUserId,
          controlled_pilot_branch_id: branchId,
          controlled_pilot_configured_at: now,
          controlled_pilot_configured_by_user_id: user.id,
        };
      } else {
        changes = {
          controlled_pilot_mode: false,
          controlled_pilot_operator_user_id: null,
          controlled_pilot_branch_id: null,
          controlled_pilot_configured_at: new Date().toISOString(),
          controlled_pilot_configured_by_user_id: user.id,
        };
      }

      const updated = await base44.asServiceRole.entities.Organization.update(organization.id, changes);
      try {
        await appendSuperAdminAudit(base44, user, {
          action: 'update_org',
          organizationId: organization.id,
          organizationName: organization.name,
          correlationId: body.correlation_id,
          metadata: {
            operation: enabled ? 'CONTROLLED_PILOT_ENABLED' : 'CONTROLLED_PILOT_DISABLED',
            operator_user_id: changes.controlled_pilot_operator_user_id,
            branch_id: changes.controlled_pilot_branch_id,
          },
        });
      } catch (error) {
        await base44.asServiceRole.entities.Organization.update(organization.id, before).catch(() => null);
        throw error;
      }
      return Response.json({
        success: true,
        controlled_pilot: inspectControlledPilotConfiguration(updated),
      });
    }

    if (action === 'startImpersonation') {
      if (!isCanonicalSuperAdmin(user)) return jsonError('Superadmin requerido', 403, 'SUPERADMIN_REQUIRED');
      const organizationId = clean(body.organization_id, 160);
      const [organization] = await base44.asServiceRole.entities.Organization.filter({ id: organizationId }, 1);
      if (!organization) return jsonError('Organizacion no encontrada', 404);
      if (organization.status !== 'active') return jsonError('No se puede impersonar una organizacion suspendida', 409);
      if (inspectControlledPilotConfiguration(organization).enabled) {
        return jsonError('La impersonacion esta deshabilitada durante el piloto controlado', 409, 'CONTROLLED_PILOT_IMPERSONATION_DISABLED');
      }

      const internalUser = await loadBackendUser(base44, user.id);
      const previousOrganizationId = getUserDataField(internalUser || user, 'organization_id');
      const previousImpersonationId = getUserDataField(internalUser || user, 'impersonating_org_id');
      if (previousImpersonationId) {
        return jsonError('Finaliza la impersonacion activa antes de iniciar otra', 409, 'IMPERSONATION_ALREADY_ACTIVE');
      }
      const startedAt = new Date().toISOString();
      await persistUserIdentity(base44, user.id, {
        is_super_admin: true,
        organization_id: organization.id,
        impersonating_org_id: organization.id,
        impersonating_started_at: startedAt,
        impersonation_previous_organization_id: previousOrganizationId || null,
      });
      try {
        await appendSuperAdminAudit(base44, user, {
          action: 'impersonate_start',
          organizationId: organization.id,
          organizationName: organization.name,
          correlationId: body.correlation_id,
          metadata: { previous_impersonation_id: previousImpersonationId || null },
        });
      } catch (error) {
        await persistUserIdentity(base44, user.id, {
          organization_id: previousOrganizationId || null,
          impersonating_org_id: previousImpersonationId || null,
          impersonating_started_at: null,
          impersonation_previous_organization_id: null,
        });
        throw error;
      }
      return Response.json({ success: true, organization: sanitizeOrganization(organization), started_at: startedAt });
    }

    if (action === 'endImpersonation') {
      if (!isCanonicalSuperAdmin(user)) return jsonError('Superadmin requerido', 403, 'SUPERADMIN_REQUIRED');
      const internalUser = await loadBackendUser(base44, user.id);
      const authoritativeUser = internalUser || user;
      const organizationId = getUserDataField(authoritativeUser, 'impersonating_org_id');
      if (!organizationId) return Response.json({ success: true, idempotent: true });
      const [organization] = await base44.asServiceRole.entities.Organization.filter({ id: organizationId }, 1);
      const previousOrganizationId = getUserDataField(authoritativeUser, 'impersonation_previous_organization_id');
      const previousStartedAt = getUserDataField(authoritativeUser, 'impersonating_started_at');
      await persistUserIdentity(base44, user.id, {
        organization_id: previousOrganizationId || null,
        impersonating_org_id: null,
        impersonating_started_at: null,
        impersonation_previous_organization_id: null,
        is_super_admin: true,
      });
      try {
        await appendSuperAdminAudit(base44, user, {
          action: 'impersonate_end',
          organizationId,
          organizationName: organization?.name,
          correlationId: body.correlation_id,
          metadata: { started_at: previousStartedAt || null },
        });
      } catch (error) {
        await persistUserIdentity(base44, user.id, {
          organization_id: organizationId,
          impersonating_org_id: organizationId,
          impersonating_started_at: previousStartedAt || new Date().toISOString(),
          impersonation_previous_organization_id: previousOrganizationId || null,
        });
        throw error;
      }
      return Response.json({ success: true });
    }

    if (action === 'getOrganization' || action === 'updateOrganization' || action === 'listAccounts') {
      const authorization = await resolveAuthorizedContext(base44, user, {
        organizationHint: clean(body.organization_id, 160) || null,
        allowedRoles: action === 'updateOrganization' ? ['ORG_ADMIN'] : ORG_ROLES,
      });
      if (!authorization.ok) return jsonError(authorization.error, authorization.status);

      if (action === 'listAccounts') {
        const accounts = await base44.asServiceRole.entities.UserAccount.filter({
          organization_id: authorization.organizationId,
        }, '-created_date', 500);
        return Response.json({ accounts: (accounts || []).map(sanitizeUserAccount) });
      }

      const [organization] = await base44.asServiceRole.entities.Organization.filter({
        id: authorization.organizationId,
      }, 1);
      if (!organization) return jsonError('Organizacion no encontrada', 404);
      if (action === 'getOrganization') {
        return Response.json({ organization: sanitizeOrganization(organization) });
      }

      const updates = pick(body.changes, ORG_UPDATE_FIELDS);
      const updated = await base44.asServiceRole.entities.Organization.update(organization.id, updates);
      return Response.json({ organization: sanitizeOrganization(updated) });
    }

    if (action === 'adminOverview') {
      if (!isCanonicalSuperAdmin(user)) return jsonError('Superadmin requerido', 403, 'SUPERADMIN_REQUIRED');
      const [organizations, accounts, auditLogs] = await Promise.all([
        base44.asServiceRole.entities.Organization.list('-created_date', 500),
        base44.asServiceRole.entities.UserAccount.list('-created_date', 2000),
        base44.asServiceRole.entities.SuperAdminAudit.list('-recorded_at', 200),
      ]);
      return Response.json({
        organizations: (organizations || []).map(sanitizeOrganization),
        accounts: (accounts || []).map(sanitizeUserAccount),
        auditLogs: (auditLogs || []).map(projectSuperAdminAudit),
      });
    }

    if (action === 'adminUpdateOrganization') {
      if (!isCanonicalSuperAdmin(user)) return jsonError('Superadmin requerido', 403, 'SUPERADMIN_REQUIRED');
      const organizationId = clean(body.organization_id, 160);
      const [organization] = await base44.asServiceRole.entities.Organization.filter({ id: organizationId }, 1);
      if (!organization) return jsonError('Organizacion no encontrada', 404);
      if (inspectControlledPilotConfiguration(organization).enabled) {
        return jsonError('El superadmin no puede mutar una organizacion en piloto controlado', 409, 'CONTROLLED_PILOT_ADMIN_MUTATION_DISABLED');
      }
      const updates = pick(body.changes, ADMIN_ORG_UPDATE_FIELDS);
      if (Object.keys(updates).length === 0) return jsonError('No hay cambios permitidos', 400);
      const updated = await base44.asServiceRole.entities.Organization.update(organization.id, updates);
      const auditAction = updates.status === 'active'
        ? 'activate_org'
        : updates.status === 'suspended'
          ? 'deactivate_org'
          : Object.hasOwn(updates, 'plan')
            ? 'change_plan'
            : 'update_org';
      try {
        await appendSuperAdminAudit(base44, user, {
          action: auditAction,
          organizationId: organization.id,
          organizationName: organization.name,
          correlationId: body.correlation_id,
          metadata: { changed_fields: Object.keys(updates) },
        });
      } catch (error) {
        const rollback = Object.fromEntries(Object.keys(updates).map(field => [field, organization[field] ?? null]));
        await base44.asServiceRole.entities.Organization.update(organization.id, rollback);
        throw error;
      }
      return Response.json({ organization: sanitizeOrganization(updated) });
    }

    if (action === 'adminCreateOrganization') {
      if (!isCanonicalSuperAdmin(user)) return jsonError('Superadmin requerido', 403, 'SUPERADMIN_REQUIRED');
      const input = body.organization || {};
      const adminEmail = clean(body.admin_email, 254).toLowerCase();
      const name = clean(input.name, 240);
      const country = clean(input.country, 120);
      const currency = clean(input.currency, 16).toUpperCase();
      const plan = ['basic', 'pro', 'premium'].includes(input.plan) ? input.plan : 'basic';
      if (!name || !country || !currency || !adminEmail) {
        return jsonError('Organizacion y email administrador son requeridos', 400);
      }
      const created = [];
      try {
        const correlationId = clean(body.correlation_id, 240) || crypto.randomUUID();
        const organization = await base44.asServiceRole.entities.Organization.create(canonicalOrganizationData({
          ...pick(input, ADMIN_ORG_UPDATE_FIELDS),
          name,
          country,
          currency,
          plan,
        }, correlationId));
        created.push({ entity: 'Organization', id: organization.id });
        const branch = await base44.asServiceRole.entities.Branch.create(canonicalPrimaryBranchData(organization.id));
        created.push({ entity: 'Branch', id: branch.id });
        const account = await base44.asServiceRole.entities.UserAccount.create(canonicalOwnerMembershipData({
          organizationId: organization.id, email: adminEmail, status: 'invited',
        }));
        created.push({ entity: 'UserAccount', id: account.id });
        await seedBaselineCategories(base44, organization.id, created);
        try { await base44.users.inviteUser(adminEmail, 'user'); }
        catch (error) { console.warn('[identityGateway] invite warning', error?.message); }
        await appendSuperAdminAudit(base44, user, {
          action: 'create_org',
          organizationId: organization.id,
          organizationName: organization.name,
          correlationId,
          metadata: { admin_email: adminEmail },
        });
        const finalized = await finalizeProvisioning(base44, {
          organization, branch, account, actor: user, principalClass: 'PLATFORM_ADMIN', correlationId,
        });
        return Response.json({
          organization: sanitizeOrganization(finalized.organization),
          account: sanitizeUserAccount(account),
          branch,
          readiness: finalized.readiness,
        }, { status: 201 });
      } catch (error) {
        await compensate(base44, created);
        throw error;
      }
    }

    return jsonError(`Accion de identidad desconocida: ${action}`, 400);
  } catch (error) {
    console.error('[identityGateway]', error?.code || error?.message || error);
    return jsonError('No se pudo completar la operacion de identidad', 500, error?.code);
  }
});
