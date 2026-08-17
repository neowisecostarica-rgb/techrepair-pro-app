import { base44 } from '@/api/base44Client';

export const crmQueryKeys = {
  list: (organizationId) => ['crm', organizationId],
};

export async function invokeCrm(action, organizationId, payload = {}) {
  const response = await base44.functions.invoke('crmGateway', {
    action,
    organization_id: organizationId,
    ...payload,
  });
  const data = response?.data ?? response;
  if (!data || data.error) {
    throw new Error(data?.error || 'No se pudo completar la operacion CRM');
  }
  return data;
}
