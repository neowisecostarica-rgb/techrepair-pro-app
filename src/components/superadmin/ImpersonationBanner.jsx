import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, LogOut } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function ImpersonationBanner({ organizationName, onEndImpersonation }) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-red-600 to-orange-600 text-white py-3 px-6 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center animate-pulse">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="font-bold text-lg">🔒 MODO SOPORTE ACTIVO</p>
            <p className="text-sm text-white/90">
              Operando como Admin en: <strong>{organizationName}</strong>
            </p>
          </div>
        </div>
        <Button
          onClick={onEndImpersonation}
          variant="outline"
          className="bg-white text-red-600 hover:bg-red-50 border-0"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Finalizar Soporte
        </Button>
      </div>
    </div>
  );
}