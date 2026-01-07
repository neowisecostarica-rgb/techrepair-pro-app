import React, { createContext, useContext, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userAccount, setUserAccount] = useState(null);
  const [loading, setLoading] = useState(true);

  // Valores efectivos (considerando impersonation)
  const isImpersonating = user?.impersonating_org_id ? true : false;
  const effectiveOrgId = user?.impersonating_org_id || userAccount?.organization_id || null;
  const effectiveRole = isImpersonating ? 'ORG_ADMIN' : (userAccount?.role || (user?.is_super_admin ? 'SUPER_ADMIN' : null));

  useEffect(() => {
    loadAuthData();
  }, []);

  const loadAuthData = async () => {
    try {
      const u = await base44.auth.me();
      setUser(u);

      // Si es Super Admin sin impersonación, no cargar UserAccount
      if (u.is_super_admin && !u.impersonating_org_id) {
        setLoading(false);
        return;
      }

      // Si está impersonando, no necesita UserAccount real (se simula)
      if (u.is_super_admin && u.impersonating_org_id) {
        setUserAccount({
          user_id: u.id,
          user_email: u.email,
          organization_id: u.impersonating_org_id,
          role: 'ORG_ADMIN',
          active: true,
        });
        setLoading(false);
        return;
      }

      // Cargar UserAccount normal
      const accounts = await base44.entities.UserAccount.filter({ user_id: u.id });
      if (accounts.length > 0) {
        setUserAccount(accounts[0]);
      }
      
      setLoading(false);
    } catch (error) {
      setLoading(false);
    }
  };

  const refreshAuth = () => {
    loadAuthData();
  };

  const value = {
    user,
    userAccount,
    effectiveRole,
    effectiveOrgId,
    isImpersonating,
    loading,
    refreshAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext debe usarse dentro de AuthProvider');
  }
  return context;
}