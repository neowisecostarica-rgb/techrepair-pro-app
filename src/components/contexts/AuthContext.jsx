import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import { base44 } from '@/api/base44Client';

const AuthContext = createContext(null);

// Roles válidos oficiales (cerrado)
const VALID_ROLES = ['ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN', 'SALES', 'INVENTORY', 'SUPPORT'];

// Roles legacy → rol oficial
const LEGACY_ROLE_MAP = {
  'admin': 'ORG_ADMIN',
  'user': 'SALES',
  'tech': 'TECHNICIAN',
  'manager': 'BRANCH_ADMIN',
  'AUDITOR': 'SUPPORT',
  'CFO': 'ORG_ADMIN',
  'CEO': 'ORG_ADMIN',
  'SUPER_ADMIN': 'ORG_ADMIN', // SUPER_ADMIN en UserAccount es un error legacy
};

// Roles que requieren branch_id obligatorio
const ROLES_REQUIRE_BRANCH = ['BRANCH_ADMIN', 'TECHNICIAN', 'SALES', 'INVENTORY', 'SUPPORT'];

/**
 * EnsureIdentity — idempotente
 * Garantiza que el UserAccount del usuario esté correcto y que user.organization_id
 * en el token esté sincronizado con el UserAccount activo.
 * No inventa roles ni organizaciones sin evidencia.
 *
 * Cuando el usuario tiene >1 UserAccount activa Y no hay un organization_id
 * ya persistido en el token que coincida con exactamente una de ellas,
 * retorna { account: null, multiOrgAccounts: [...], status: 'MULTI_ORG_REQUIRED' }
 * sin auto-seleccionar nada.
 */
async function ensureIdentity(u) {
  const repairs = [];

  // 1. Cargar todas las cuentas del usuario
  const allAccounts = await base44.entities.UserAccount.filter({ user_id: u.id });

  // 2. Memberships activas con organization_id válido
  const activeAccounts = allAccounts.filter(a => a.active && a.organization_id);

  if (activeAccounts.length === 0) {
    console.warn('[EnsureIdentity] Usuario sin memberships activas:', u.email);
    return { account: null, status: 'NO_MEMBERSHIP', repairs: ['no_active_membership'] };
  }

  // 3. Si hay exactamente UNA → resolución directa (caso normal)
  //    Si hay más de UNA → buscar si el token ya tiene un organization_id que coincida
  //    con exactamente una de las cuentas activas. Si coincide → usar esa (ya fue elegida previamente).
  //    Si NO coincide → forzar selector. NUNCA auto-seleccionar.
  let selectedAccount = null;

  if (activeAccounts.length === 1) {
    selectedAccount = activeAccounts[0];
  } else {
    // Más de una cuenta activa: solo resolver si el token ya persiste una elección válida
    if (u.organization_id) {
      selectedAccount = activeAccounts.find(a => a.organization_id === u.organization_id) || null;
    }
    // Si no hay coincidencia → MULTI_ORG_REQUIRED, sin fallback
    if (!selectedAccount) {
      console.warn('[EnsureIdentity] MULTI_ORG_REQUIRED para:', u.email, `(${activeAccounts.length} orgs)`);
      return { account: null, multiOrgAccounts: activeAccounts, status: 'MULTI_ORG_REQUIRED', repairs: [] };
    }
  }

  let account = selectedAccount;

  // 3. Reparar role inválido (idempotente: solo si role no está en lista oficial)
  if (!VALID_ROLES.includes(account.role)) {
    const mappedRole = LEGACY_ROLE_MAP[account.role] || 'SALES';
    console.warn(`[EnsureIdentity] Role legacy "${account.role}" → "${mappedRole}" para`, u.email);
    account = await base44.entities.UserAccount.update(account.id, { role: mappedRole });
    repairs.push(`mapped_role:${account.role}`);
  }

  // 4. Reparar branch_id faltante para roles que lo requieren (idempotente)
  if (ROLES_REQUIRE_BRANCH.includes(account.role) && !account.branch_id) {
    const branches = await base44.entities.Branch.filter({
      organization_id: account.organization_id,
      active: true
    });
    if (branches.length > 0) {
      account = await base44.entities.UserAccount.update(account.id, { branch_id: branches[0].id });
      repairs.push(`assigned_branch:${branches[0].id}`);
      console.log('[EnsureIdentity] Branch asignada automáticamente:', branches[0].id, 'para', u.email);
    } else {
      console.warn('[EnsureIdentity] No hay branches activas para org:', account.organization_id);
    }
  }

  // 5. Sincronizar user.organization_id al token (RLS requiere esto)
  //    Esta es la causa raíz del 403. Se sincroniza siempre que haya desincronización.
  if (u.organization_id !== account.organization_id) {
    console.log('[EnsureIdentity] Sincronizando token org_id:', u.organization_id, '→', account.organization_id);
    try {
      await base44.auth.updateMe({ organization_id: account.organization_id });
      u.organization_id = account.organization_id; // Actualizar referencia local
      repairs.push(`synced_token:${account.organization_id}`);
      console.log('[EnsureIdentity] ✅ Token sincronizado');
    } catch (syncError) {
      console.error('[EnsureIdentity] ❌ Error sincronizando token:', syncError);
    }
  }

  if (repairs.length > 0) {
    console.log('[EnsureIdentity] Reparaciones aplicadas para', u.email, ':', repairs);
  }

  return { account, repairs };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userAccount, setUserAccount] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [errorCode, setErrorCode] = useState(null);
  // MULTI_ORG_REQUIRED: lista de UserAccounts activas cuando el usuario pertenece a >1 org
  const [multiOrgAccounts, setMultiOrgAccounts] = useState(null);
  const [identityStatus, setIdentityStatus] = useState(null); // null | 'NO_MEMBERSHIP' | 'MULTI_ORG_REQUIRED'

  const hasInitializedRef = useRef(false);
  const isLoadingRef = useRef(false);
  const last429Timestamp = useRef(null);

  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    loadAuthData();
  }, []);

  const loadAuthData = async () => {
    if (isLoadingRef.current) return;

    if (last429Timestamp.current && Date.now() - last429Timestamp.current < 10000) {
      console.warn('AuthContext: Rate limit cooldown activo, no reintentar');
      return;
    }

    isLoadingRef.current = true;
    setStatus('loading');
    setErrorCode(null);

    try {
      const u = await base44.auth.me();
      last429Timestamp.current = null;

      // SUPER_ADMIN puro (sin impersonation): acceso solo al panel SaaS
      if (u.is_super_admin && !u.impersonating_org_id) {
        setUser(u);
        setUserAccount(null);
        setStatus('ready');
        isLoadingRef.current = false;
        return;
      }

      // SUPER_ADMIN impersonando: simular UserAccount ORG_ADMIN para la org objetivo
      if (u.is_super_admin && u.impersonating_org_id) {
        setUser(u);
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

      // Usuario normal: ejecutar EnsureIdentity
      const { account, multiOrgAccounts: multiOrgs, status: identStatus, repairs } = await ensureIdentity(u);

      setUser({ ...u });
      setUserAccount(account);
      setIdentityStatus(identStatus || null);
      setMultiOrgAccounts(multiOrgs || null);
      setStatus('ready');
      isLoadingRef.current = false;
    } catch (error) {
      console.error('AuthContext: Error loading auth data', error);

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
    hasInitializedRef.current = false;
    isLoadingRef.current = false;
    setStatus('idle');
    setErrorCode(null);
    last429Timestamp.current = null;

    hasInitializedRef.current = true;
    await loadAuthData();
  };

  const reloadAuth = refreshAuth;

  const isImpersonating = useMemo(() => {
    return user?.impersonating_org_id ? true : false;
  }, [user?.impersonating_org_id]);

  const effectiveOrgId = useMemo(() => {
    return user?.impersonating_org_id || userAccount?.organization_id || null;
  }, [user?.impersonating_org_id, userAccount?.organization_id]);

  const effectiveRole = useMemo(() => {
    if (user?.is_super_admin && !user?.impersonating_org_id) return 'SUPER_ADMIN';
    if (isImpersonating) return 'ORG_ADMIN';
    if (userAccount?.role) return userAccount.role;
    return null;
  }, [user?.is_super_admin, user?.impersonating_org_id, isImpersonating, userAccount?.role]);

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