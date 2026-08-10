import React from 'react';
import { useAuthContext } from '../contexts/AuthContext';
import { createPageUrl } from '../../utils';
import { base44 } from '@/api/base44Client';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Guard de página que verifica permisos por rol efectivo.
 * Usa AuthContext unificado.
 * Enforce strict role-based access control per FASE 2.
 * FASE 3: Layout handles onboarding, PageGuard assumes user is ready.
 * FASE 4: Block inactive users from accessing operational routes.
 */
export default function PageGuard({ allowedRoles, children }) {
  const { user, userAccount, effectiveRole, effectiveOrgId, status } = useAuthContext();

  // Wait for auth to be ready
  if (status !== 'ready') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-emerald-600" />
          <p className="text-slate-600">Verificando acceso...</p>
        </div>
      </div>
    );
  }

  // Si no está autenticado, redirigir a login
  if (!user) {
    if (typeof window !== 'undefined') {
      base44.auth.redirectToLogin();
    }
    return null;
  }

  // SUPER_ADMIN bypass: Allow access to Saas without effectiveOrgId
  if (effectiveRole === 'SUPER_ADMIN' && allowedRoles.includes('SUPER_ADMIN')) {
    return <>{children}</>;
  }

  // P0.2 TENANT ZERO: Block access without valid tenant
  // This is a second layer of defense beyond Layout
  if (!effectiveOrgId) {
    if (typeof window !== 'undefined') {
      window.location.href = createPageUrl('Onboarding');
    }
    return null;
  }

  // FASE 3: Assume Layout already handled onboarding
  // If we reach here without effectiveRole, something is wrong, but Layout should have redirected
  if (!effectiveRole) {
    // This should never happen if Layout orchestration is correct
    console.error('PageGuard: No effectiveRole but user passed Layout checks');
    return null;
  }

  // FASE 4: Block inactive users (soft disabled)
  if (userAccount && userAccount.status !== 'active') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center max-w-md p-6">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Cuenta Desactivada</h2>
          <p className="text-slate-600">
            Tu cuenta ha sido desactivada. Contacta al administrador para más información.
          </p>
          <Button
            onClick={() => base44.auth.logout()}
            className="mt-6"
          >
            Cerrar Sesión
          </Button>
        </div>
      </div>
    );
  }

  // Verificar si el rol efectivo tiene acceso
  if (!allowedRoles.includes(effectiveRole)) {
    // Redirigir a landing page según rol efectivo
    const landingByRole = {
      'SUPER_ADMIN': 'Saas',
      'ORG_ADMIN': 'Dashboard',
      'SALES': 'Clientes',
      'TECHNICIAN': 'MiDia',
      'INVENTORY': 'Inventario',
      'SUPPORT': 'Clientes',
      'BRANCH_ADMIN': 'Dashboard',
      'AUDITOR': 'Dashboard',
      'CFO': 'Dashboard',
      'CEO': 'Dashboard'
    };

    const targetLanding = landingByRole[effectiveRole];
    if (targetLanding && typeof window !== 'undefined') {
      window.location.href = createPageUrl(targetLanding);
      return null;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center max-w-md p-6">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h2>
          <p className="text-slate-600">No tienes permisos para acceder a esta página.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
