import React from 'react';
import { useAuthContext } from '../components/contexts/AuthContext';
import PageGuard from '../components/guards/PageGuard';
import DashboardOrgAdmin from '../components/dashboard/DashboardOrgAdmin';
import DashboardTechnician from '../components/dashboard/DashboardTechnician';
import DashboardSales from '../components/dashboard/DashboardSales';
import DashboardSuperAdmin from '../components/dashboard/DashboardSuperAdmin';

export default function Dashboard() {
  return (
    <PageGuard allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN', 'SALES', 'AUDITOR', 'CFO', 'CEO']}>
      <DashboardContent />
    </PageGuard>
  );
}

function DashboardContent() {
  const { effectiveRole, effectiveOrgId, user, status } = useAuthContext();

  // Wait for auth to be ready
  if (status !== 'ready') {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center">
        <p className="text-slate-500">Cargando dashboard...</p>
      </div>
    );
  }

  // Render role-specific dashboard
  if (effectiveRole === 'SUPER_ADMIN') {
    return <DashboardSuperAdmin />;
  }

  if (effectiveRole === 'TECHNICIAN') {
    return <DashboardTechnician effectiveOrgId={effectiveOrgId} userId={user?.id} />;
  }

  if (effectiveRole === 'SALES') {
    return <DashboardSales effectiveOrgId={effectiveOrgId} />;
  }

  // Default: ORG_ADMIN, BRANCH_ADMIN, AUDITOR, CFO, CEO
  return <DashboardOrgAdmin effectiveOrgId={effectiveOrgId} />;
}