import React from 'react';
import { useUserAccount } from '@/components/hooks/useOrgData';
import PageGuard from '@/components/guards/PageGuard';
import { useAuthContext } from '@/components/contexts/AuthContext';
import MiDiaTech from '@/components/midia/MiDiaTech';
import MiDiaAdmin from '@/components/midia/MiDiaAdmin';
import MiDiaSales from '@/components/midia/MiDiaSales';
import MiDiaErrorBoundary from '@/components/midia/MiDiaErrorBoundary';

export default function MiDia() {
  return (
    <PageGuard allowedRoles={['ORG_ADMIN', 'TECHNICIAN', 'BRANCH_ADMIN', 'SALES']}>
      <MiDiaContent />
    </PageGuard>
  );
}

function MiDiaContent() {
  const { userAccount } = useUserAccount();
  const { user, effectiveRole, effectiveOrgId } = useAuthContext();

  const panel = effectiveRole === 'ORG_ADMIN' || effectiveRole === 'BRANCH_ADMIN'
    ? 'ADMIN'
    : effectiveRole === 'SALES'
      ? 'SALES'
      : 'TECHNICIAN';
  // A failed render must not leave a blank page. The key also isolates failures
  // when Base44 changes the native session without reloading the tab.
  return (
    <MiDiaErrorBoundary key={`${user?.id || 'no-user'}:${effectiveRole || 'no-role'}`} panel={panel}>
      {panel === 'ADMIN' ? (
        <MiDiaAdmin user={user} effectiveOrgId={effectiveOrgId} effectiveRole={effectiveRole} />
      ) : panel === 'SALES' ? (
        <MiDiaSales user={user} effectiveOrgId={effectiveOrgId} />
      ) : (
        <MiDiaTech user={user} userAccount={userAccount} effectiveOrgId={effectiveOrgId} effectiveRole={effectiveRole} />
      )}
    </MiDiaErrorBoundary>
  );
}
