import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getIdentityContext, switchIdentityOrganization } from '@/api/identity';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userAccount, setUserAccount] = useState(null);
  const [status, setStatus] = useState('idle');
  const [errorCode, setErrorCode] = useState(null);
  const [multiOrgAccounts, setMultiOrgAccounts] = useState(null);
  const [identityStatus, setIdentityStatus] = useState(null);
  const hasInitializedRef = useRef(false);
  const isLoadingRef = useRef(false);
  const last429Timestamp = useRef(null);

  const loadAuthData = async () => {
    if (isLoadingRef.current) return;
    if (last429Timestamp.current && Date.now() - last429Timestamp.current < 10000) return;

    isLoadingRef.current = true;
    setStatus('loading');
    setErrorCode(null);
    try {
      const context = await getIdentityContext();
      const contextUser = context.user;
      const account = contextUser?.is_super_admin && contextUser?.impersonating_org_id
        ? {
            user_id: contextUser.id,
            user_email: contextUser.email,
            organization_id: contextUser.impersonating_org_id,
            role: 'ORG_ADMIN',
            status: 'active',
            active: true,
          }
        : context.userAccount;

      setUser(contextUser || null);
      setUserAccount(account || null);
      setIdentityStatus(context.identityStatus || null);
      setMultiOrgAccounts(context.identityStatus === 'MULTI_ORG_REQUIRED'
        ? context.memberships || []
        : null);
      last429Timestamp.current = null;
      setStatus('ready');
    } catch (error) {
      console.error('AuthContext: identity gateway failed', error);
      if (error?.response?.status === 429 || error?.status === 429) {
        setErrorCode(429);
        last429Timestamp.current = Date.now();
      }
      setStatus('error');
    } finally {
      isLoadingRef.current = false;
    }
  };

  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    loadAuthData();
  }, []);

  const refreshAuth = async () => {
    isLoadingRef.current = false;
    last429Timestamp.current = null;
    await loadAuthData();
  };

  const selectOrganization = async (account) => {
    await switchIdentityOrganization(account.organization_id);
    await refreshAuth();
  };

  const isImpersonating = Boolean(user?.is_super_admin && user?.impersonating_org_id);
  const effectiveOrgId = userAccount?.organization_id || user?.organization_id || null;
  const effectiveRole = user?.is_super_admin && !isImpersonating
    ? 'SUPER_ADMIN'
    : isImpersonating
      ? 'ORG_ADMIN'
      : userAccount?.role || null;
  const loading = status === 'idle' || status === 'loading';

  const value = useMemo(() => ({
    user,
    userAccount,
    effectiveRole,
    effectiveOrgId,
    isImpersonating,
    loading,
    status,
    errorCode,
    identityStatus,
    multiOrgAccounts,
    selectOrganization,
    refreshAuth,
    reloadAuth: refreshAuth,
  }), [
    user,
    userAccount,
    effectiveRole,
    effectiveOrgId,
    isImpersonating,
    loading,
    status,
    errorCode,
    identityStatus,
    multiOrgAccounts,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuthContext debe usarse dentro de AuthProvider');
  return context;
}
