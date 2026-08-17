import React from 'react';
import { useAuthContext } from '../components/contexts/AuthContext';
import PageGuard from '../components/guards/PageGuard';
import DashboardOrgAdmin from '../components/dashboard/DashboardOrgAdmin';
import DashboardTechnician from '../components/dashboard/DashboardTechnician';
import DashboardSuperAdmin from '../components/dashboard/DashboardSuperAdmin';

// ErrorBoundary para capturar errores de render
class DashboardErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[Dashboard Crash]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-red-50 border border-red-200 rounded">
          <p className="text-red-800 font-bold">⚠️ Dashboard crash</p>
          <p className="text-sm text-slate-600">Revisa la consola para detalles</p>
          {this.state.error && (
            <pre className="mt-4 p-3 bg-white rounded text-xs overflow-auto">
              {this.state.error.toString()}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Dashboard() {
  return (
    <PageGuard allowedRoles={['SUPER_ADMIN', 'ORG_ADMIN', 'BRANCH_ADMIN', 'TECHNICIAN']}>
      <DashboardErrorBoundary>
        <DashboardContent />
      </DashboardErrorBoundary>
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

  // Default: ORG_ADMIN, BRANCH_ADMIN
  return <DashboardOrgAdmin effectiveOrgId={effectiveOrgId} />;
}
