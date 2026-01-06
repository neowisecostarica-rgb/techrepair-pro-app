import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Hook para obtener UserAccount actual
export function useUserAccount() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const { data: userAccount } = useQuery({
    queryKey: ['current-user-account', user?.id],
    queryFn: async () => {
      const accounts = await base44.entities.UserAccount.filter({ user_id: user.id });
      return accounts[0];
    },
    enabled: !!user?.id,
  });

  return { user, userAccount };
}

// Hook para queries filtradas por organización
export function useOrgQuery(entityName, additionalFilters = {}, options = {}) {
  const { userAccount } = useUserAccount();

  return useQuery({
    queryKey: [entityName, userAccount?.organization_id, additionalFilters],
    queryFn: () => base44.entities[entityName].filter({
      organization_id: userAccount.organization_id,
      ...additionalFilters
    }),
    enabled: !!userAccount?.organization_id && options.enabled !== false,
    ...options,
  });
}

// Helper para crear con organization_id inyectado
export function withOrgId(data, userAccount) {
  if (!userAccount?.organization_id) {
    throw new Error('No organization_id available');
  }
  return {
    ...data,
    organization_id: userAccount.organization_id
  };
}