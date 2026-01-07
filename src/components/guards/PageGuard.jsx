import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../../utils';
import { Loader2 } from 'lucide-react';

/**
 * Guard de página que verifica permisos por rol.
 * Si el usuario no tiene acceso, lo redirige a su landing page correspondiente.
 * 
 * @param {Array<string>} allowedRoles - Lista de roles permitidos para esta página
 * @param {React.ReactNode} children - Contenido de la página
 */
export default function PageGuard({ allowedRoles, children }) {
  const [loading, setLoading] = useState(true);
  const [userAccount, setUserAccount] = useState(null);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const user = await base44.auth.me();
        const accounts = await base44.entities.UserAccount.filter({ user_id: user.id });
        
        if (accounts.length > 0) {
          const account = accounts[0];
          setUserAccount(account);

          // Verificar si el rol tiene acceso
          if (!allowedRoles.includes(account.role)) {
            // Redirigir a landing page según rol
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

            const targetLanding = landingByRole[account.role];
            if (targetLanding) {
              window.location.href = createPageUrl(targetLanding);
              return;
            }
          }
        }
        
        setLoading(false);
      } catch (error) {
        // Si no está autenticado, redirigir a login
        base44.auth.redirectToLogin();
      }
    };

    checkAccess();
  }, [allowedRoles]);

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

  return <>{children}</>;
}