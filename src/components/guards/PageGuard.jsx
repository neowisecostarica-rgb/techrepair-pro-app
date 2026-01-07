import React from 'react';
import { useAuthContext } from '../contexts/AuthContext';
import { createPageUrl } from '../../utils';
import { Loader2, AlertCircle } from 'lucide-react';

/**
 * Guard de página que verifica permisos por rol efectivo.
 * Usa AuthContext unificado.
 */
export default function PageGuard({ allowedRoles, children }) {
  const { user, userAccount, effectiveRole, loading } = useAuthContext();

  if (loading) {
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

  // Si no tiene rol efectivo y no es página permitida sin rol, mostrar error
  if (!effectiveRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center max-w-md p-6">
          <AlertCircle className="w-12 h-12 text-orange-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Sin Rol Asignado</h2>
          <p className="text-slate-600">
            Tu usuario no tiene un rol asignado en ninguna organización. Contacta al administrador.
          </p>
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