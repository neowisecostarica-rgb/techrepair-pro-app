import { base44 } from '@/api/base44Client';

export const identityQueryKeys = {
  context: ['identity', 'context'],
  organization: (organizationId) => ['identity', 'organization', organizationId || 'active'],
  accounts: (organizationId) => ['identity', 'accounts', organizationId || 'active'],
  adminOverview: ['identity', 'admin-overview'],
};

export async function invokeIdentity(action, payload = {}) {
  const response = await base44.functions.invoke('identityGateway', { action, ...payload });
  return response?.data ?? response;
}

export const getIdentityContext = () => invokeIdentity('context');
export const switchIdentityOrganization = (organizationId) =>
  invokeIdentity('switchOrganization', { organization_id: organizationId });
export const acceptIdentityInvitation = (invitationId) =>
  invokeIdentity('acceptInvitation', { invitation_id: invitationId });
export const bootstrapIdentityOrganization = (organization) =>
  invokeIdentity('bootstrapOrganization', { organization });
export const startIdentityImpersonation = (organizationId) =>
  invokeIdentity('startImpersonation', { organization_id: organizationId });
export const endIdentityImpersonation = () => invokeIdentity('endImpersonation');
export const getIdentityOrganization = (organizationId) =>
  invokeIdentity('getOrganization', { organization_id: organizationId });
export const updateIdentityOrganization = (organizationId, changes) =>
  invokeIdentity('updateOrganization', { organization_id: organizationId, changes });
export const listIdentityAccounts = (organizationId) =>
  invokeIdentity('listAccounts', { organization_id: organizationId });
export const getIdentityAdminOverview = () => invokeIdentity('adminOverview');
export const adminUpdateIdentityOrganization = (organizationId, changes) =>
  invokeIdentity('adminUpdateOrganization', { organization_id: organizationId, changes });
export const adminCreateIdentityOrganization = (organization, adminEmail) =>
  invokeIdentity('adminCreateOrganization', { organization, admin_email: adminEmail });
