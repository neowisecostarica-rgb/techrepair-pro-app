import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { base44 } from '@/api/base44Client';
import { AuthProvider, useAuthContext } from './components/contexts/AuthContext';
import ImpersonationBanner from './components/superadmin/ImpersonationBanner';
import {
  LayoutDashboard,
  Wrench,
  Package,
  Users,
  ShoppingCart,
  Calendar,
  Recycle,
  AlertCircle,
  Menu,
  X,
  LogOut,
  ChevronRight,
  ShieldAlert,
  Settings,
  FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';

function LayoutContent({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { user, userAccount, effectiveRole, isImpersonating, effectiveOrgId, status, refreshAuth } = useAuthContext();

  const handleEndImpersonation = async () => {
    await base44.auth.updateMe({
      impersonating_org_id: null,
      impersonating_started_at: null
    });
    
    // Registrar fin en auditoría
    await base44.entities.SuperAdminAudit.create({
      super_admin_id: user.id,
      super_admin_email: user.email,
      action: 'impersonate_end',
      target_organization_id: effectiveOrgId,
    });

    window.location.href = createPageUrl('Saas');
  };

  // FASE 3: ONBOARDING ORCHESTRATION
  // Wait for auth to be ready before making any routing decisions
  if (status !== 'ready') {
    return null;
  }

  // 1. SUPER_ADMIN (non-impersonating) → must access SaaS panel only
  if (effectiveRole === 'SUPER_ADMIN' && !isImpersonating && currentPageName !== 'Saas') {
    if (typeof window !== 'undefined') {
      window.location.href = createPageUrl('Saas');
    }
    return null;
  }

  // 2. No UserAccount → send to Onboarding
  if (!userAccount && currentPageName !== 'Onboarding') {
    if (typeof window !== 'undefined') {
      window.location.href = createPageUrl('Onboarding');
    }
    return null;
  }

  // 3. UserAccount exists but incomplete setup → send to Onboarding
  // Check if organization_id is missing (indicates incomplete setup)
  if (userAccount && !userAccount.organization_id && currentPageName !== 'Onboarding') {
    if (typeof window !== 'undefined') {
      window.location.href = createPageUrl('Onboarding');
    }
    return null;
  }

  // 4. User is in Onboarding page → allow access without further checks
  if (currentPageName === 'Onboarding') {
    return <>{children}</>;
  }

  // Menús según role
  const superAdminMenu = [
    { label: 'Panel SaaS', path: 'Saas', icon: LayoutDashboard },
  ];

  const orgAdminMenu = [
    { label: 'Configuración', path: 'Settings', icon: LayoutDashboard },
    { label: 'Dashboard', path: 'Dashboard', icon: LayoutDashboard },
  ];

  const operationalMenu = [
    { label: 'Dashboard', path: 'Dashboard', icon: LayoutDashboard },
    { label: 'Mi Día', path: 'MiDia', icon: Wrench },
    { label: 'Cola Revisión', path: 'ColaRevision', icon: LayoutDashboard },
    { label: 'Órdenes de Trabajo', path: 'OrdenesTrabajo', icon: Wrench },
    { label: 'Clientes', path: 'Clientes', icon: Users },
    { label: 'Inventario', path: 'Inventario', icon: Package },
    { label: 'Punto de Venta', path: 'PuntoVenta', icon: ShoppingCart },
    { label: 'Agenda', path: 'Agenda', icon: Calendar },
    { label: 'Reciclaje', path: 'Reciclaje', icon: Recycle },
    { label: 'Calidad', path: 'Calidad', icon: AlertCircle },
  ];

 // STRICT MENU SELECTION: Only show routes allowed per effectiveRole
 let menuItems = [];

 if (!effectiveRole) {
   menuItems = [];
 } else if (effectiveRole === 'SUPER_ADMIN') {
   // SUPER_ADMIN can ONLY access SaaS panel (unless impersonating, which changes effectiveRole to ORG_ADMIN)
   menuItems = superAdminMenu;
 } else if (effectiveRole === 'ORG_ADMIN') {
   // ORG_ADMIN gets full org access
   menuItems = [
     { label: 'Configuración', path: 'Settings', icon: Settings },
     { label: 'Dashboard', path: 'Dashboard', icon: LayoutDashboard },
     { label: 'Órdenes de Trabajo', path: 'OrdenesTrabajo', icon: Wrench },
     { label: 'Clientes', path: 'Clientes', icon: Users },
     { label: 'Inventario', path: 'Inventario', icon: Package },
     { label: 'Punto de Venta', path: 'PuntoVenta', icon: ShoppingCart },
     { label: 'Cola Revisión', path: 'ColaRevision', icon: FileText },
     { label: 'Agenda', path: 'Agenda', icon: Calendar },
     { label: 'Reciclaje', path: 'Reciclaje', icon: Recycle },
     { label: 'Calidad', path: 'Calidad', icon: AlertCircle },
   ];
 } else if (effectiveRole === 'BRANCH_ADMIN') {
   // BRANCH_ADMIN gets operational access (no Settings)
   menuItems = [
     { label: 'Dashboard', path: 'Dashboard', icon: LayoutDashboard },
     { label: 'Órdenes de Trabajo', path: 'OrdenesTrabajo', icon: Wrench },
     { label: 'Clientes', path: 'Clientes', icon: Users },
     { label: 'Inventario', path: 'Inventario', icon: Package },
     { label: 'Punto de Venta', path: 'PuntoVenta', icon: ShoppingCart },
     { label: 'Cola Revisión', path: 'ColaRevision', icon: FileText },
   ];
 } else if (effectiveRole === 'SALES') {
   menuItems = [
     { label: 'Clientes', path: 'Clientes', icon: Users },
     { label: 'Órdenes de Trabajo', path: 'OrdenesTrabajo', icon: Wrench },
     { label: 'Punto de Venta', path: 'PuntoVenta', icon: ShoppingCart },
   ];
 } else if (effectiveRole === 'TECHNICIAN') {
   menuItems = [
     { label: 'Mi Día', path: 'MiDia', icon: Wrench },
     { label: 'Cola Revisión', path: 'ColaRevision', icon: FileText },
     { label: 'Inventario', path: 'Inventario', icon: Package },
   ];
 }

const handleLogout = () => {
  base44.auth.logout();
};

return (
  <>
    {isImpersonating && (
      <ImpersonationBanner 
        organizationName="Organización"
        onEndImpersonation={handleEndImpersonation}
      />
    )}

    <div className={`min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-blue-50 ${isImpersonating ? 'pt-16' : ''}`}>
      <style>{`
        :root {
          --primary: 142 71% 45%;
          --primary-foreground: 0 0% 100%;
          --secondary: 200 70% 50%;
          --accent: 142 71% 95%;
        }
      `}</style>

      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 h-screen bg-white border-r border-slate-200 transition-all duration-300 z-40 ${sidebarOpen ? 'w-64' : 'w-20'}`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center justify-between">
              {sidebarOpen && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-xl flex items-center justify-center">
                    <Wrench className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-slate-900">TechRepair</h1>
                    <p className="text-xs text-slate-500">Pro Platform</p>
                  </div>
                </div>
              )}
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4">
            <div className="space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPageName === item.path;
                return (
                  <Link
                    key={item.path}
                    to={createPageUrl(item.path)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                      isActive
                        ? 'bg-gradient-to-r from-emerald-500 to-blue-500 text-white shadow-lg shadow-emerald-500/30'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-emerald-500'}`} />
                    {sidebarOpen && (
                      <>
                        <span className="flex-1 font-medium">{item.label}</span>
                        {isActive && <ChevronRight className="w-4 h-4" />}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* User Section */}
          {user && (
            <div className="p-4 border-t border-slate-200">
              {sidebarOpen ? (
                <div className="space-y-3">
                  <div className="px-4 py-3 bg-slate-50 rounded-xl">
                    <p className="text-sm font-medium text-slate-900">{user.full_name}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                    {effectiveRole && (
                      <p className="text-xs text-emerald-600 font-medium mt-1">
                        {effectiveRole}
                        {isImpersonating && ' (Soporte)'}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={handleLogout}
                    variant="outline"
                    className="w-full justify-start gap-2 text-slate-600 hover:text-red-600 hover:border-red-300"
                  >
                    <LogOut className="w-4 h-4" />
                    Cerrar Sesión
                  </Button>
                </div>
              ) : (
                <button
                  onClick={handleLogout}
                  className="w-full p-3 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <LogOut className="w-5 h-5 text-slate-400 hover:text-red-600 mx-auto" />
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className={`transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-20'}`}>
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  </>
  );
}

export default function Layout(props) {
  return (
    <AuthProvider>
      <LayoutContent {...props} />
    </AuthProvider>
  );
}