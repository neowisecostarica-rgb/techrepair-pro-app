import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2 } from 'lucide-react';

export default function Onboarding() {
  const [processing, setProcessing] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const completeOnboarding = async () => {
      try {
        const user = await base44.auth.me();
        
        // Buscar UserAccount por user_email
        const accounts = await base44.entities.UserAccount.filter({ user_email: user.email });
        
        if (accounts.length === 0) {
          setError('No se encontró una cuenta pendiente para este email.');
          setProcessing(false);
          return;
        }

        const userAccount = accounts[0];

        // Vincular user_id y activar
        await base44.entities.UserAccount.update(userAccount.id, {
          user_id: user.id,
          active: true,
        });

        // Redirigir según role
        setTimeout(() => {
          if (userAccount.role === 'SUPER_ADMIN') {
            navigate(createPageUrl('Saas'));
          } else if (userAccount.role === 'ORG_ADMIN') {
            navigate(createPageUrl('Settings'));
          } else {
            navigate(createPageUrl('Dashboard'));
          }
        }, 1500);

      } catch (err) {
        setError('Error al completar el onboarding: ' + err.message);
        setProcessing(false);
      }
    };

    completeOnboarding();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-blue-50 flex items-center justify-center p-6">
      <Card className="max-w-md w-full border-0 shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-full flex items-center justify-center mb-4">
            {processing ? (
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            ) : error ? (
              <span className="text-2xl">⚠️</span>
            ) : (
              <CheckCircle className="w-8 h-8 text-white" />
            )}
          </div>
          <CardTitle className="text-2xl font-bold">
            {processing ? 'Configurando tu cuenta...' : error ? 'Error' : '¡Listo!'}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          {processing && (
            <p className="text-slate-600">
              Estamos configurando tu acceso al sistema. Esto tomará solo unos segundos.
            </p>
          )}
          {error && (
            <div className="space-y-4">
              <p className="text-red-600">{error}</p>
              <Button onClick={() => navigate(createPageUrl('Dashboard'))}>
                Ir al Dashboard
              </Button>
            </div>
          )}
          {!processing && !error && (
            <p className="text-slate-600">Redirigiendo...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}