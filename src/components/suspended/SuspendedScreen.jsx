import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, LogOut, Mail } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const PLATFORM_SUPPORT_EMAIL = 'soporte@techrepair-platform.com';

export default function SuspendedScreen({ orgName, orgId }) {
  const handleContactSupport = () => {
    const subject = `Cuenta Suspendida - ${orgName || 'Organización'}`;
    const body = orgId 
      ? `Hola, mi organización (ID: ${orgId}) está suspendida y necesito ayuda para reactivarla.\n\nGracias.`
      : 'Hola, mi organización está suspendida y necesito ayuda para reactivarla.\n\nGracias.';
    
    window.open(`mailto:${PLATFORM_SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
  };

  const handleLogout = () => {
    base44.auth.logout();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-red-50 to-orange-50 flex items-center justify-center p-6">
      <Card className="w-full max-w-2xl border-0 shadow-2xl border-2 border-red-300">
        <CardContent className="p-12 text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-12 h-12 text-red-600" />
          </div>
          
          <h1 className="text-3xl font-bold text-slate-900 mb-3">Cuenta Suspendida</h1>
          
          <div className="space-y-3 mb-8">
            <p className="text-lg text-slate-700">
              Tu organización <strong>{orgName || 'está'}</strong> se encuentra temporalmente suspendida.
            </p>
            <p className="text-slate-600">
              Para reactivar tu cuenta y continuar operando, por favor contacta a nuestro equipo de soporte.
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8">
            <p className="text-sm text-amber-800">
              <strong>Nota:</strong> Durante la suspensión no es posible acceder a ningún módulo operativo del sistema.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              onClick={handleContactSupport}
              className="bg-blue-600 hover:bg-blue-700 gap-2"
              size="lg"
            >
              <Mail className="w-5 h-5" />
              Contactar Soporte
            </Button>
            
            <Button
              onClick={handleLogout}
              variant="outline"
              size="lg"
              className="gap-2"
            >
              <LogOut className="w-5 h-5" />
              Cerrar Sesión
            </Button>
          </div>

          <p className="text-xs text-slate-500 mt-8">
            Soporte: {PLATFORM_SUPPORT_EMAIL}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}