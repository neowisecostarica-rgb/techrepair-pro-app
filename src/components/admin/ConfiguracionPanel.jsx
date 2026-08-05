import React from 'react';
import TerminosYCondicionesPanel from './TerminosYCondicionesPanel';
import GarantiaPanel from './GarantiaPanel';
import { useAuthContext } from '../contexts/AuthContext';

export default function ConfiguracionPanel() {
  const { effectiveOrgId } = useAuthContext();

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-900">Políticas del Negocio</h2>
      <TerminosYCondicionesPanel organizationId={effectiveOrgId} />
      <GarantiaPanel organizationId={effectiveOrgId} />
    </div>
  );
}
