import { base44 } from '@/api/base44Client';

export const identityQueryKeys = {
  context: ['identity', 'context'],
  organization: (organizationId) => ['identity', 'organization', organizationId || 'active'],
  accounts: (organizationId) => ['identity', 'accounts', organizationId || 'active'],
  adminOverview: ['identity', 'admin-overview'],
};

const IDENTITY_TRANSIENT_STATUSES = new Set([0, 408, 425, 429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function identityErrorStatus(error) {
  return error?.response?.status || error?.status || 0;
}

export async function invokeIdentity(action, payload = {}, options = {}) {
  const attempts = options.retryTransient === true ? 3 : 1;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await base44.functions.invoke('identityGateway', { action, ...payload });
      return response?.data ?? response;
    } catch (error) {
      lastError = error;
      const status = identityErrorStatus(error);
      if (attempt >= attempts || !IDENTITY_TRANSIENT_STATUSES.has(status)) throw error;
      // Context is read-only from the caller's perspective and safe to retry.
      // Short bounded backoff absorbs transient preview/runtime cold-start failures
      // without weakening fail-closed authorization.
      await sleep(250 * attempt);
    }
  }
  throw lastError;
}

export const getIdentityContext = () => invokeIdentity('context', {}, { retryTransient: true });
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
