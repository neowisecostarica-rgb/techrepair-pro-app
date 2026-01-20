import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userAccount, setUserAccount] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [errorCode, setErrorCode] = useState(null); // Para capturar 429

  // 1️⃣ Prevent double initialization
  const hasInitializedRef = useRef(false);
  const isLoadingRef = useRef(false);
  const last429Timestamp = useRef(null);

  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    loadAuthData();
  }, []);

  const loadAuthData = async () => {
    // Prevent concurrent executions
    if (isLoadingRef.current) return;
    
    // Anti-loop: Si hay error 429 reciente (< 10 segundos), no reintentar
    if (last429Timestamp.current && Date.now() - last429Timestamp.current < 10000) {
      console.warn('AuthContext: Rate limit cooldown activo, no reintentar');
      return;
    }
    
    isLoadingRef.current = true;
    setStatus('loading');
    setErrorCode(null);

    try {
      const u = await base44.auth.me();
      setUser(u);
      last429Timestamp.current = null; // Reset 429 timestamp en success

      // Si es Super Admin sin impersonación, no cargar UserAccount
      if (u.is_super_admin && !u.impersonating_org_id) {
        setUserAccount(null);
        setStatus('ready');
        isLoadingRef.current = false;
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
        setStatus('ready');
        isLoadingRef.current = false;
        return;
      }

      // Cargar UserAccount normal
      const accounts = await base44.entities.UserAccount.filter({ user_id: u.id });
      if (accounts.length > 0) {
        setUserAccount(accounts[0]);
      } else {
        setUserAccount(null);
      }
      
      setStatus('ready');
      isLoadingRef.current = false;
    } catch (error) {
      console.error('AuthContext: Error loading auth data', error);
      
      // Detectar 429 específicamente
      if (error?.response?.status === 429 || error?.status === 429) {
        setErrorCode(429);
        last429Timestamp.current = Date.now();
        console.warn('AuthContext: Rate limit (429) detectado, bloqueando reintentos por 10s');
      }
      
      setStatus('error');
      isLoadingRef.current = false;
    }
  };

  const refreshAuth = async () => {
    // Reset state for safe re-initialization
    hasInitializedRef.current = false;
    isLoadingRef.current = false;
    setStatus('idle');
    setErrorCode(null);
    last429Timestamp.current = null; // Reset 429 cooldown
    
    // Re-run initialization
    hasInitializedRef.current = true;
    await loadAuthData();
  };

  // Alias para compatibilidad
  const reloadAuth = refreshAuth;

  // 5️⃣ Memoize derived values
  const isImpersonating = useMemo(() => {
    return user?.impersonating_org_id ? true : false;
  }, [user?.impersonating_org_id]);

  const effectiveOrgId = useMemo(() => {
    return user?.impersonating_org_id || userAccount?.organization_id || null;
  }, [user?.impersonating_org_id, userAccount?.organization_id]);

  const effectiveRole = useMemo(() => {
    // Priorizar SUPER_ADMIN puro ANTES de impersonation/userAccount
    if (user?.is_super_admin && !user?.impersonating_org_id) return 'SUPER_ADMIN';
    if (isImpersonating) return 'ORG_ADMIN';
    if (userAccount?.role) return userAccount.role;
    return null;
  }, [user?.is_super_admin, user?.impersonating_org_id, isImpersonating, userAccount?.role]);

  // Maintain backward compatibility with 'loading' boolean
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
    refreshAuth,
    reloadAuth,
  }), [user, userAccount, effectiveRole, effectiveOrgId, isImpersonating, loading, status, errorCode]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext debe usarse dentro de AuthProvider');
  }
  return context;
}