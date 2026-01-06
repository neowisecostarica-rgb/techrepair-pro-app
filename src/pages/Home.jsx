import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();

  useEffect(() => {
    const redirect = async () => {
      try {
        const user = await base44.auth.me();
        const accounts = await base44.entities.UserAccount.filter({ user_id: user.id });

        if (accounts.length === 0) {
          // No existe UserAccount, ir a onboarding
          navigate(createPageUrl('Onboarding'));
          return;
        }

        const userAccount = accounts[0];

        // Redirigir según role
        if (userAccount.role === 'SUPER_ADMIN') {
          navigate(createPageUrl('Saas'));
        } else if (userAccount.role === 'ORG_ADMIN') {
          navigate(createPageUrl('Settings'));
        } else {
          navigate(createPageUrl('Dashboard'));
        }
      } catch (err) {
        // Si no está autenticado, ir a login
        base44.auth.redirectToLogin();
      }
    };

    redirect();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-blue-50 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mx-auto mb-4" />
        <p className="text-slate-600">Redirigiendo...</p>
      </div>
    </div>
  );
}