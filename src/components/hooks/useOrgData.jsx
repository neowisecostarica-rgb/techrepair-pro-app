import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuthContext } from '../contexts/AuthContext';

// Hook para obtener UserAccount actual (DEPRECADO - usar useAuthContext)
export function useUserAccount() {
  const { user, userAccount } = useAuthContext();
  return { user, userAccount };
}

// Hook para queries filtradas por organización
export function useOrgQuery(entityName, additionalFilters = {}, options = {}) {
  const { effectiveOrgId } = useAuthContext();

  return useQuery({
    queryKey: [entityName, effectiveOrgId, additionalFilters],
    queryFn: () => base44.entities[entityName].filter({
      organization_id: effectiveOrgId,
      ...additionalFilters
    }),
    enabled: !!effectiveOrgId && options.enabled !== false,
    ...options,
  });
}

// Helper para crear con organization_id inyectado
export function withOrgId(data, contextOrAccount) {
  const orgId = contextOrAccount?.effectiveOrgId || contextOrAccount?.organization_id;
  if (!orgId) {
    throw new Error('No organization_id available');
  }
  return {
    ...data,
    organization_id: orgId
  };
}