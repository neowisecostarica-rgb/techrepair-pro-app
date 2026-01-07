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
    const redirectDone = sessionStorage.getItem('role_redirect_done');
    if (redirectDone === 'true') {
      hasRedirected.current = true;
      return;
    }

    // Definir landing page por rol (fuente de verdad)
    const landingByRole = {
      'SUPER_ADMIN': 'Saas',
      'ORG_ADMIN': 'Dashboard',
      'SALES': 'Clientes',
      'TECHNICIAN': 'MiDia',
      'BRANCH_ADMIN': 'Dashboard',
      'AUDITOR': 'Dashboard',
      'CFO': 'Dashboard',
      'CEO': 'Dashboard'
    };

    const targetLanding = landingByRole[userAccount.role];

    // Si no estamos en la landing correcta, redirigir
    if (targetLanding && currentPageName !== targetLanding) {
      hasRedirected.current = true;
      sessionStorage.setItem('role_redirect_done', 'true');
      window.location.href = createPageUrl(targetLanding);
    } else {
      // Ya estamos en la página correcta, marcar como completado
      hasRedirected.current = true;
      sessionStorage.setItem('role_redirect_done', 'true');
    }
  }, [userAccount, currentPageName]);
}