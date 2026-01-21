import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useUserAccount } from '@/components/hooks/useOrgData';
import PageGuard from '@/components/guards/PageGuard';
import { useAuthContext } from '@/components/contexts/AuthContext';
import MiDiaTech from '@/components/midia/MiDiaTech';
import MiDiaAdmin from '@/components/midia/MiDiaAdmin';
import MiDiaSales from '@/components/midia/MiDiaSales';

export default function MiDia() {
  return (
    <PageGuard allowedRoles={['ORG_ADMIN', 'TECHNICIAN', 'SALES', 'BRANCH_ADMIN']}>
      <MiDiaContent />
    </PageGuard>
  );
}

function MiDiaContent() {
  const { userAccount } = useUserAccount();
  const { user, effectiveRole, effectiveOrgId } = useAuthContext();

  if (effectiveRole === 'ORG_ADMIN' || effectiveRole === 'BRANCH_ADMIN') {
    return <MiDiaAdmin user={user} effectiveOrgId={effectiveOrgId} effectiveRole={effectiveRole} />;
  }

  if (effectiveRole === 'SALES') {
    return <MiDiaSales user={user} effectiveOrgId={effectiveOrgId} />;
  }

  return (
    <MiDiaTech 
      user={user} 
      userAccount={userAccount} 
      effectiveOrgId={effectiveOrgId} 
      effectiveRole={effectiveRole} 
    />
  );
}