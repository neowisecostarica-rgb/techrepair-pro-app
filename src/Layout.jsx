import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { base44 } from '@/api/base44Client';
import { AuthProvider, useAuthContext } from './components/contexts/AuthContext';
import ImpersonationBanner from './components/superadmin/ImpersonationBanner';
import SuspendedScreen from './components/suspended/SuspendedScreen';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Wrench,
  Package,
  Users,
  ShoppingCart,
  Calendar,
  Recycle,
  AlertCircle,
  LogOut,
  ChevronRight,
  ChevronLeft,
  ShieldAlert,
  Settings,
  FileText,
  Sun,
  ChevronDown,
  TrendingUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';

function LayoutContent({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { user, userAccount, effectiveRole, isImpersonating, effectiveOrgId, status, errorCode, reloadAuth } = useAuthContext();

  // Query organization (MUST be before any conditional returns)
  const { data: organization, isLoading: isLoadingOrg, isError: isErrorOrg } = useQuery({
    queryKey: ['org-status', effectiveOrgId],
    queryFn: async () => {
      const orgs = await base44.entities.Organization.filter({ id: effectiveOrgId });
      return orgs[0];
    },
    enabled: !!effectiveOrgId && effectiveRole !== 'SUPER_ADMIN',
    staleTime: 60000,
  });

  // Estado de secciones colapsables
  const [sectionsOpen, setSectionsOpen] = useState(() => {
    try {
      const saved = localStorage.getItem('sideMenuSections');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      // Fallback si hay error al parsear
    }
    return {
      TALLER: true,
      VENTAS: true,
      CLIENTES: true,
      INVENTARIO: true,
      'VISIÓN DEL NEGOCIO': true,
      FINANZAS: true,
      CONFIGURACIÓN: true,
    };
  });

  const toggleSection = (category) => {
    const newState = {
      ...sectionsOpen,
      [category]: !sectionsOpen[category]
    };
    setSectionsOpen(newState);
    try {
      localStorage.setItem('sideMenuSections', JSON.stringify(newState));
    } catch (e) {
      // Silenciar errores de localStorage
    }
  };

  const handleLogout = () => {
    base44.auth.logout();
  };

  const handleEndImpersonation = async () => {
    await base44.auth.updateMe({
      impersonating_org_id: null,
      impersonating_started_at: null
    });

    // Registrar fin en auditoría (non-blocking)
    base44.entities.SuperAdminAudit.create({
      super_admin_id: user.id,
      super_admin_email: user.email,
      action: 'impersonate_end',
      target_organization_id: effectiveOrgId,
    }).catch(err => {
      console.warn('Auditoría impersonate_end falló (non-blocking):', err);
    });

    window.location.href = createPageUrl('Saas');
  };

  // FASE 3: ONBOARDING ORCHESTRATION
  // Wait for auth to be ready before making any routing decisions
  if (status === 'loading' || status === 'idle') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-emerald-50 to-blue-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Cargando plataforma...</p>
        </div>
      </div>
    );
  }

  // DEFENSIVO: Si estamos en Settings u Onboarding, no forzar redirect prematuro
  const protectedPages = ['Settings', 'Onboarding'];
  const isProtectedPage = protectedPages.includes(currentPageName);

  // Error 429: Mostrar pantalla de cooldown sin loops
  if (status === 'error' && errorCode === 429) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-emerald-50 to-blue-50">
        <div className="text-center max-w-md p-8 bg-white rounded-2xl shadow-xl">
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Servicio Temporalmente Saturado</h2>
          <p className="text-slate-600 mb-6">
            El sistema está procesando múltiples solicitudes. Por favor, espera un momento e intenta nuevamente.
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              onClick={reloadAuth}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Reintentar
            </Button>
            <Button
              onClick={() => base44.auth.logout()}
              variant="outline"
            >
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Otros errores de auth
  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-emerald-50 to-blue-50">
        <div className="text-center max-w-md p-8 bg-white rounded-2xl shadow-xl">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Error de Autenticación</h2>
          <p className="text-slate-600 mb-6">
            No se pudo cargar la información de tu sesión. Intenta nuevamente o cierra sesión.
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              onClick={reloadAuth}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Reintentar
            </Button>
            <Button
              onClick={() => base44.auth.logout()}
              variant="outline"
            >
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 1. SUPER_ADMIN (non-impersonating) → must access SaaS panel and admin tools
  if (effectiveRole === 'SUPER_ADMIN' && !isImpersonating) {
    if (currentPageName !== 'Saas' && currentPageName !== 'AdminReset') {
      if (typeof window !== 'undefined') {
        window.location.href = createPageUrl('Saas');
      }
      return null;
    }

    // SUPER_ADMIN in Saas or AdminReset page: Render minimal layout
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-blue-50">
        <style>{`
          :root {
            --primary: 142 71% 45%;
            --primary-foreground: 0 0% 100%;
            --secondary: 200 70% 50%;
            --accent: 142 71% 95%;
          }
        `}</style>

        {/* Sidebar for SUPER_ADMIN */}
        <aside className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-slate-200 z-40">
          <div className="flex flex-col h-full">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-xl flex items-center justify-center">
                  <Wrench className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-slate-900">TechRepair</h1>
                  <p className="text-xs text-slate-500">Super Admin</p>
                </div>
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto p-4">
              <div className="space-y-1">
                <Link
                  to={createPageUrl('Saas')}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    currentPageName === 'Saas'
                      ? 'bg-gradient-to-r from-emerald-500 to-blue-500 text-white shadow-lg'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <LayoutDashboard className={`w-5 h-5 ${currentPageName === 'Saas' ? 'text-white' : 'text-slate-400'}`} />
                  <span className="font-medium">Panel SaaS</span>
                </Link>
                <Link
                  to={createPageUrl('AdminReset')}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    currentPageName === 'AdminReset'
                      ? 'bg-gradient-to-r from-emerald-500 to-blue-500 text-white shadow-lg'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <AlertCircle className={`w-5 h-5 ${currentPageName === 'AdminReset' ? 'text-white' : 'text-slate-400'}`} />
                  <span className="font-medium">Admin Reset</span>
                </Link>
              </div>
            </nav>

            {user && (
              <div className="p-4 border-t border-slate-200">
                <div className="px-4 py-3 bg-slate-50 rounded-xl mb-3">
                  <p className="text-sm font-medium text-slate-900">{user.full_name}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                  <p className="text-xs text-emerald-600 font-medium mt-1">SUPER_ADMIN</p>
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
            )}
          </div>
        </aside>

        <main className="ml-64">
          <div className="p-8">{children}</div>
        </main>
      </div>
    );
  }

  // 2. No UserAccount → send to Onboarding (con excepción de páginas protegidas)
  if (!userAccount && !isProtectedPage) {
    if (typeof window !== 'undefined') {
      window.location.href = createPageUrl('Onboarding');
    }
    return null;
  }

  // 3. UserAccount exists but incomplete setup → send to Onboarding
  // Check if organization_id is missing (indicates incomplete setup)
  if (userAccount && !userAccount.organization_id && !isProtectedPage) {
    if (typeof window !== 'undefined') {
      window.location.href = createPageUrl('Onboarding');
    }
    return null;
  }

  // 4. User is in Onboarding page → allow access without further checks
  if (currentPageName === 'Onboarding') {
    return <>{children}</>;
  }

  // GATE GLOBAL: Verificar suspensión de Organization (P0 - Bloqueo Total)
  // Esperar a que cargue org antes de decidir
  if (effectiveOrgId && effectiveRole !== 'SUPER_ADMIN' && isLoadingOrg) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-emerald-50 to-blue-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Verificando estado de tu cuenta...</p>
        </div>
      </div>
    );
  }

  // Error al cargar Organization → Fallback (RIESGO 1)
  if (effectiveOrgId && isErrorOrg && effectiveRole !== 'SUPER_ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-red-50 to-orange-50">
        <div className="text-center max-w-md p-8 bg-white rounded-2xl shadow-xl">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Error al Cargar Cuenta</h2>
          <p className="text-slate-600 mb-6">
            No se pudo cargar la información de tu organización. Por favor, intenta cerrar sesión o contactar a soporte.
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              onClick={() => window.open('mailto:soporte@techrepair-platform.com', '_blank')}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Contactar Soporte
            </Button>
            <Button
              onClick={() => base44.auth.logout()}
              variant="outline"
            >
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // BLOQUEO TOTAL: Si Organization está suspendida → SuspendedScreen
  // EXCEPCIÓN: Permitir SUPER_ADMIN impersonation para soporte (solo lectura)
  if (organization?.status === 'suspended' && !isImpersonating) {
    return <SuspendedScreen orgName={organization?.name} orgId={organization?.id} />;
  }

  // Menús según role
  const superAdminMenu = [
    { label: 'Panel SaaS', path: 'Saas', icon: LayoutDashboard },
    { label: 'Admin Reset', path: 'AdminReset', icon: AlertCircle },
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
    { label: 'CRM', path: 'CRM', icon: Users },
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
   // ORG_ADMIN gets full org access - CATEGORIZED MENU
   menuItems = [
     // ⭐ HOME OPERATIVA (sin categoría)
     { label: 'Mi Día', path: 'MiDia', icon: Sun, category: null },

     // VISIÓN DEL NEGOCIO
     { label: 'Resumen del Negocio', path: 'Dashboard', icon: LayoutDashboard, category: 'VISIÓN DEL NEGOCIO', tooltip: 'Antes: Dashboard' },
     { label: 'Estado Financiero', path: 'Finanzas', icon: LayoutDashboard, category: 'VISIÓN DEL NEGOCIO', tooltip: 'Antes: Dashboard (Finanzas)' },
     { label: 'Ventas y Ganancias', path: 'VentasMetricas', icon: LayoutDashboard, category: 'VISIÓN DEL NEGOCIO', tooltip: 'Antes: Métricas' },
     { label: 'Rendimiento del Equipo', path: 'ProductividadTecnicos', icon: Users, category: 'VISIÓN DEL NEGOCIO' },
     { label: 'Análisis de Operaciones', path: 'AnalisisTrabajo', icon: FileText, category: 'VISIÓN DEL NEGOCIO' },
     { label: 'Supervisión en Vivo', path: 'Operacion', icon: Wrench, category: 'VISIÓN DEL NEGOCIO', tooltip: 'Antes: Operación' },

     // TALLER
     { label: 'Órdenes de Trabajo', path: 'OrdenesTrabajo', icon: Wrench, category: 'TALLER' },
     { label: 'Cola de Revisión', path: 'ColaRevision', icon: FileText, category: 'TALLER' },
     { label: 'Agenda', path: 'Agenda', icon: Calendar, category: 'TALLER' },
     { label: 'Reciclaje', path: 'Reciclaje', icon: Recycle, category: 'TALLER' },
     { label: 'No Conformidades', path: 'Calidad', icon: AlertCircle, category: 'TALLER' },

     // VENTAS
     { label: 'Caja y Cobros', path: 'PuntoVenta', icon: ShoppingCart, category: 'VENTAS', tooltip: 'Antes: Punto de Venta' },
     { label: 'Historial de Ventas', path: 'VentasHistorial', icon: FileText, category: 'VENTAS' },
     { label: 'Cotizaciones', path: 'VentasCotizaciones', icon: FileText, category: 'VENTAS' },
     { label: 'Garantías', path: 'VentasGarantias', icon: ShieldAlert, category: 'VENTAS' },

     // CLIENTES
     { label: 'Clientes', path: 'Clientes', icon: Users, category: 'CLIENTES' },
     { label: 'Gestión de Leads', path: 'CRM', icon: Users, category: 'CLIENTES', tooltip: 'Antes: CRM' },

     // INVENTARIO
     { label: 'Inventario', path: 'Inventario', icon: Package, category: 'INVENTARIO' },

     // CONFIGURACIÓN (SIEMPRE AL FINAL)
     { label: 'Configuración', path: 'Settings', icon: Settings, category: 'CONFIGURACIÓN' },
   ];
 } else if (effectiveRole === 'BRANCH_ADMIN') {
   // BRANCH_ADMIN gets operational access (no Settings)
   menuItems = [
     { label: 'Mi Día', path: 'MiDia', icon: Sun, category: null },

     { label: 'Resumen del Negocio', path: 'Dashboard', icon: LayoutDashboard, category: 'VISIÓN DEL NEGOCIO', tooltip: 'Antes: Dashboard' },
     { label: 'Estado Financiero', path: 'Finanzas', icon: LayoutDashboard, category: 'VISIÓN DEL NEGOCIO', tooltip: 'Antes: Dashboard (Finanzas)' },
     { label: 'Supervisión en Vivo', path: 'Operacion', icon: Wrench, category: 'VISIÓN DEL NEGOCIO', tooltip: 'Antes: Operación' },

     { label: 'Órdenes de Trabajo', path: 'OrdenesTrabajo', icon: Wrench, category: 'TALLER' },
     { label: 'Cola de Revisión', path: 'ColaRevision', icon: FileText, category: 'TALLER' },
     { label: 'Agenda', path: 'Agenda', icon: Calendar, category: 'TALLER' },

     { label: 'Caja y Cobros', path: 'PuntoVenta', icon: ShoppingCart, category: 'VENTAS', tooltip: 'Antes: Punto de Venta' },
     { label: 'Historial de Ventas', path: 'VentasHistorial', icon: FileText, category: 'VENTAS' },
     { label: 'Cotizaciones', path: 'VentasCotizaciones', icon: FileText, category: 'VENTAS' },
     { label: 'Garantías', path: 'VentasGarantias', icon: ShieldAlert, category: 'VENTAS' },
     { label: 'Ventas y Ganancias', path: 'VentasMetricas', icon: LayoutDashboard, category: 'VENTAS', tooltip: 'Antes: Métricas' },

     { label: 'Clientes', path: 'Clientes', icon: Users, category: 'CLIENTES' },
     { label: 'Gestión de Leads', path: 'CRM', icon: Users, category: 'CLIENTES', tooltip: 'Antes: CRM' },

     { label: 'Inventario', path: 'Inventario', icon: Package, category: 'INVENTARIO' },
   ];
 } else if (effectiveRole === 'SALES') {
   menuItems = [
     { label: 'Mi Día', path: 'MiDia', icon: Sun, category: null },
     { label: 'Mis Ventas', path: 'MisVentas', icon: TrendingUp, category: null },

     { label: 'Caja y Cobros', path: 'PuntoVenta', icon: ShoppingCart, category: 'VENTAS', tooltip: 'Antes: Punto de Venta' },
     { label: 'Historial de Ventas', path: 'VentasHistorial', icon: FileText, category: 'VENTAS' },
     { label: 'Cotizaciones', path: 'VentasCotizaciones', icon: FileText, category: 'VENTAS' },
     { label: 'Garantías', path: 'VentasGarantias', icon: ShieldAlert, category: 'VENTAS' },

     { label: 'Clientes', path: 'Clientes', icon: Users, category: 'CLIENTES' },
     { label: 'Gestión de Leads', path: 'CRM', icon: Users, category: 'CLIENTES', tooltip: 'Antes: CRM' },

     { label: 'Órdenes de Trabajo', path: 'OrdenesTrabajo', icon: Wrench, category: 'TALLER' },
     { label: 'Agenda', path: 'Agenda', icon: Calendar, category: 'TALLER' },
   ];
 } else if (effectiveRole === 'TECHNICIAN') {
   menuItems = [
     { label: 'Mi Día', path: 'MiDia', icon: Sun, category: null },

     { label: 'Cola de Revisión', path: 'ColaRevision', icon: FileText, category: 'TALLER' },
     { label: 'Mi Agenda', path: 'Agenda', icon: Calendar, category: 'TALLER' },

     { label: 'Inventario', path: 'Inventario', icon: Package, category: 'INVENTARIO' },

     { label: 'Mis Estadísticas', path: 'Dashboard', icon: LayoutDashboard, category: 'VISIÓN DEL NEGOCIO' },
   ];
   }

   return (
  <>
    {isImpersonating && (
      <ImpersonationBanner 
        organizationName="Organización"
        onEndImpersonation={handleEndImpersonation}
      />
    )}

    {isImpersonating && organization?.status === 'suspended' && (
      <div className="fixed top-16 left-0 right-0 bg-red-600 text-white px-6 py-3 text-center z-50 shadow-lg">
        <p className="font-bold text-sm">
          ⚠️ TENANT SUSPENDIDO — SOLO LECTURA (MODO SOPORTE)
        </p>
      </div>
    )}

    <div className={`min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-blue-50 ${isImpersonating && organization?.status === 'suspended' ? 'pt-28' : isImpersonating ? 'pt-16' : ''}`}>
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
                title={sidebarOpen ? 'Colapsar menú' : 'Expandir menú'}
              >
                {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4">
            <div className="space-y-1">
              {(() => {
                // Group items by category (null = no category, shown first)
                const categories = [...new Set(menuItems.map(item => item.category))];

                return categories.map((category, catIndex) => {
                  const items = menuItems.filter(item => item.category === category);
                  const isFirstCategory = catIndex === 0;
                  const needsSeparator = !isFirstCategory && category !== null;
                  const isOpen = category === null || sectionsOpen[category];

                  return (
                    <div key={category || 'home'} className={needsSeparator ? 'pt-4 mt-4 border-t border-slate-200' : ''}>
                      {sidebarOpen && category && (
                        <button
                          onClick={() => toggleSection(category)}
                          className="w-full px-3 mb-2 flex items-center gap-2 hover:bg-slate-50 rounded-lg py-1 transition-colors"
                        >
                          {isOpen ? (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          )}
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            {category}
                          </p>
                        </button>
                      )}
                      {isOpen && items.map((item) => {
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
                            title={sidebarOpen && item.tooltip ? item.tooltip : undefined}
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
                  );
                });
              })()}
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