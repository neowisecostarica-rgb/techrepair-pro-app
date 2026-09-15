import { useEffect, useRef } from 'react';
import { createPageUrl } from '../../utils';

/**
 * Hook para manejar el redirect inicial post-login basado en el rol del usuario.
 * Solo se ejecuta una vez por sesión para evitar loops.
 * 
 * @param {Object} userAccount - El UserAccount del usuario actual
 * @param {string} currentPageName - Nombre de la página actual
 */
export function useRoleBasedRedirect(userAccount, currentPageName) {
  const hasRedirected = useRef(false);

  useEffect(() => {
    // No hacer nada si no hay userAccount o ya se redirigió
    if (!userAccount || hasRedirected.current) return;

    // Revisar si ya hicimos el redirect en esta sesión
    const redirectIdentity = `${userAccount.user_id || userAccount.user_email || 'unknown'}:${userAccount.organization_id || 'no-org'}:${userAccount.role || 'no-role'}`;
    const redirectDone = sessionStorage.getItem('role_redirect_done');
    if (redirectDone === redirectIdentity) {
      hasRedirected.current = true;
      return;
    }

    // Native Base44 impersonation can replace the effective user without a new
    // browser session. A redirect marker belonging to another identity is stale.
    hasRedirected.current = false;

    // Definir landing page por rol (fuente de verdad)
    const landingByRole = {
      'SUPER_ADMIN': 'Saas',
      'ORG_ADMIN': 'Dashboard',
      'SALES': 'Clientes',
      'TECHNICIAN': 'MiDia',
      'INVENTORY': 'Inventario',
      'CUSTOMER_SERVICE': 'Clientes',
      'BRANCH_ADMIN': 'Dashboard',
    };

    const targetLanding = landingByRole[userAccount.role];

    // Si no estamos en la landing correcta, redirigir
    if (targetLanding && currentPageName !== targetLanding) {
      hasRedirected.current = true;
      sessionStorage.setItem('role_redirect_done', redirectIdentity);
      window.location.href = createPageUrl(targetLanding);
    } else {
      // Ya estamos en la página correcta, marcar como completado
      hasRedirected.current = true;
      sessionStorage.setItem('role_redirect_done', redirectIdentity);
    }
  }, [userAccount, currentPageName]);
}
