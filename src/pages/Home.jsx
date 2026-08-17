import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { Loader2 } from 'lucide-react';
import { useAuthContext } from '../components/contexts/AuthContext';
import { base44 } from '@/api/base44Client';

export default function Home() {
  const navigate = useNavigate();
  const { user, effectiveRole, loading } = useAuthContext();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      base44.auth.redirectToLogin();
      return;
    }

    if (!effectiveRole) {
      navigate(createPageUrl('Onboarding'));
      return;
    }

    // Redirigir según effectiveRole
    const landingByRole = {
      'SUPER_ADMIN': 'Saas',
      'ORG_ADMIN': 'Dashboard',
      'BRANCH_ADMIN': 'Dashboard',
      'SALES': 'Clientes',
      'TECHNICIAN': 'MiDia',
      'INVENTORY': 'Inventario',
      'CUSTOMER_SERVICE': 'Clientes',
    };

    const target = landingByRole[effectiveRole] || 'Dashboard';
    navigate(createPageUrl(target));
  }, [loading, user, effectiveRole, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-blue-50 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mx-auto mb-4" />
        <p className="text-slate-600">Redirigiendo...</p>
      </div>
    </div>
  );
}
