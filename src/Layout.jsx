import React, { useState } from 'react';
import { createPageUrl } from './utils';
import { base44 } from '@/api/base44Client';
import { useAuthContext } from './components/contexts/AuthContext';
import ImpersonationBanner from './components/superadmin/ImpersonationBanner';
import SuspendedScreen from './components/suspended/SuspendedScreen';
import {
  Wrench,
  AlertCircle,
  LogOut,
  ChevronRight,
  ChevronLeft,
  Menu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import SidebarMenu from '@/components/layout/SidebarMenu';
import { MENU_ITEMS } from '@/config/menuConfig';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import LanguageSwitcher from '@/components/i18n/LanguageSwitcher';
import GlobalSearch from '@/components/search/GlobalSearch';
import useGlobalSearchShortcut from '@/components/search/useGlobalSearchShortcut';
import { Search } from 'lucide-react';
import { useI18n } from '@/i18n';
import { endIdentityImpersonation } from '@/api/identity';

function MobileNavigation({ open, onOpenChange, effectiveRole, capabilities, currentPageName, sectionsOpen, toggleSection }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[min(85vw,20rem)] border-r border-white/10 bg-[#0b1422] p-0 text-white md:hidden">
        <SheetTitle className="sr-only">Menú de TRP</SheetTitle>
        <div className="border-b border-white/10 px-5 py-6">
          <span className="text-lg font-black tracking-[-0.04em] text-white">TRP</span>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-300">Technology Reliability Platform</p>
        </div>
        <nav className="h-[calc(100%-96px)] overflow-y-auto px-4 py-5" aria-label="Navegación móvil">
          <SidebarMenu effectiveRole={effectiveRole} capabilities={capabilities} currentPageName={currentPageName} sidebarOpen={true} sectionsOpen={sectionsOpen} toggleSection={toggleSection} onNavigate={() => onOpenChange(false)} />
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function WorkspaceHeader({ currentPageName, t, platform = false, onOpenMenu }) {
  const module = MENU_ITEMS.find(item => item.path === currentPageName);
  const title = module?.i18nKey ? t(module.i18nKey, module.label) : module?.label || currentPageName;
  return (
    <header className="mb-7 flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-[#e3ece9] bg-white px-5 py-4 shadow-[0_12px_40px_-32px_rgba(7,25,35,0.4)] sm:px-6">
      <div className="flex min-w-0 items-center gap-4">
        <button type="button" onClick={onOpenMenu} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#e3ece9] text-slate-800 md:hidden" aria-label="Abrir menú de navegación"><Menu className="h-5 w-5" /></button>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#0b1422] text-xs font-black tracking-[-0.04em] text-white">TRP</span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">Technology Reliability Platform · {platform ? 'Platform' : 'Workspace'}</p>
          <h2 className="truncate text-xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-2xl">{title}</h2>
        </div>
      </div>
      <a href="/" className="inline-flex min-h-10 items-center rounded-full border border-[#e3ece9] bg-[#f6f9f8] px-4 text-xs font-semibold text-slate-700 transition-colors hover:border-teal-300 hover:text-teal-800">{t('website.nav.product', 'Producto TRP')} ↗</a>
    </header>
  );
}

function LayoutContent({ children, currentPageName }) {
  const { t } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, userAccount, effectiveRole, isImpersonating, effectiveOrgId, status, errorCode, reloadAuth, identityStatus, multiOrgAccounts, authorizedOrganizations, selectOrganization, capabilities, authorizationReady } = useAuthContext();

  useGlobalSearchShortcut(setSearchOpen);

  // The authoritative identity context already contains the sanitized tenant.
  // Do not block the application on a second getOrganization request after auth.
  // Never accept a missing/mismatched organization from another native session.
  const organization = Array.isArray(authorizedOrganizations)
    ? authorizedOrganizations.find(org => org?.id === effectiveOrgId) || null
    : null;

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
      NEGOCIO: true,
      // Compatibilidad con preferencia persistida de la navegación anterior.
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
    await endIdentityImpersonation();

    window.location.href = createPageUrl('Saas');
  };

  // FASE 3: ONBOARDING ORCHESTRATION
  // Wait for auth to be ready before making any routing decisions
  if (status === 'loading' || status === 'idle') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f8fb]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-teal-700 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">{t('loading')}</p>
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
      <div className="min-h-screen flex items-center justify-center bg-[#f6f8fb]">
        <div className="text-center max-w-md p-8 bg-white rounded-xl border border-slate-200 shadow-sm">
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Servicio Temporalmente Saturado</h2>
          <p className="text-slate-600 mb-6">
            El sistema está procesando múltiples solicitudes. Por favor, espera un momento e intenta nuevamente.
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              onClick={reloadAuth}
              className="bg-teal-700 hover:bg-teal-800"
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

  // Sesión Base44 válida, pero el gateway de identidad no respondió.
  // Mantener fail-closed: no habilitar navegación ni autorización de tenant.
  if (status === 'error' && errorCode === 'IDENTITY_GATEWAY_UNAVAILABLE') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f8fb]">
        <div className="text-center max-w-md p-8 bg-white rounded-xl border border-slate-200 shadow-sm">
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">{t('ops.sessionValid','Sesión válida · Servicio de identidad no disponible')}</h2>
          <p className="text-slate-600 mb-6">
            TRP no pudo verificar tus permisos de acceso en este momento. Por seguridad, el acceso permanece bloqueado. Intentá nuevamente o contactá al administrador.
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={reloadAuth} className="bg-teal-700 hover:bg-teal-800">
              Reintentar
            </Button>
            <Button onClick={() => base44.auth.logout()} variant="outline">
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
      <div className="min-h-screen flex items-center justify-center bg-[#f6f8fb]">
        <div className="text-center max-w-md p-8 bg-white rounded-xl border border-slate-200 shadow-sm">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">{t('ops.authError','Error de Autenticación')}</h2>
          <p className="text-slate-600 mb-6">
            No se pudo cargar la información de tu sesión. Intenta nuevamente o cierra sesión.
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              onClick={reloadAuth}
              className="bg-teal-700 hover:bg-teal-800"
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
      <div className="trp-workspace min-h-screen">
        {/* Sidebar for SUPER_ADMIN */}
        <aside className="hidden md:block fixed left-0 top-0 h-screen w-64 bg-[#0b1422] border-r border-white/10 z-40">
          <div className="flex flex-col h-full">
            <div className="p-5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-teal-400/10 ring-1 ring-inset ring-teal-300/20 rounded-xl flex items-center justify-center">
                  <span className="text-sm font-black tracking-[-0.04em] text-teal-300">TRP</span>
                </div>
                <div>
                  <h1 className="text-lg font-bold tracking-tight text-white">TRP</h1>
                  <p className="text-xs text-slate-500">Platform Administration</p>
                </div>
              </div>
            </div>

            {/* Global search trigger */}
            <div className="px-4 pb-2">
              <button
                onClick={() => setSearchOpen(true)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.05] text-slate-300 hover:bg-white/10 hover:text-white hover:border-teal-400/30 transition-colors text-sm"
              >
                <Search className="w-4 h-4" />
                <span>Buscar...</span>
                <kbd className="ml-auto text-[10px] font-medium text-slate-500">⌘K</kbd>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-4">
              <div className="px-3 pb-3"><LanguageSwitcher compact={!sidebarOpen}/></div>
              <SidebarMenu
                effectiveRole="SUPER_ADMIN"
                capabilities={[]}
                currentPageName={currentPageName}
                sidebarOpen={true}
                sectionsOpen={{}}
                toggleSection={() => {}}
              />
            </nav>

            {user && (
              <div className="p-4 border-t border-white/10">
                <div className="px-4 py-3 bg-white/5 ring-1 ring-inset ring-white/5 rounded-xl mb-3">
                  <p className="text-sm font-medium text-slate-100">{user.full_name}</p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                  <p className="text-xs text-teal-300 font-medium mt-1">SUPER_ADMIN</p>
                </div>
                <Button
                  onClick={handleLogout}
                  variant="outline"
                  className="w-full justify-start gap-2 border-slate-700 bg-transparent text-slate-400 hover:bg-white/5 hover:text-white hover:border-slate-600"
                >
                  <LogOut className="w-4 h-4" />
                  Cerrar Sesión
                </Button>
              </div>
            )}
          </div>
        </aside>

        <main className="md:ml-64">
          <div className="px-4 py-5 sm:px-6 md:p-8">
            <WorkspaceHeader currentPageName={currentPageName} t={t} platform onOpenMenu={() => setMobileMenuOpen(true)} />
            {children}
          </div>
        </main>
        <MobileNavigation open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} effectiveRole="SUPER_ADMIN" capabilities={[]} currentPageName={currentPageName} sectionsOpen={{}} toggleSection={() => {}} />
      </div>
    );
  }

  // 2a. MULTI_ORG_REQUIRED → forzar selector antes de continuar (sin fallback automático)
  if (identityStatus === 'MULTI_ORG_REQUIRED' && multiOrgAccounts && !isProtectedPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f8fb]">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 max-w-md w-full">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-[#0b1220] rounded-xl flex items-center justify-center">
              <Wrench className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{t('ops.selectOrg','Selecciona una organización')}</h2>
              <p className="text-sm text-slate-500">{t('ops.multiOrgHelp','Tu cuenta está vinculada a múltiples organizaciones')}</p>
            </div>
          </div>
          <div className="space-y-3">
            {multiOrgAccounts.map((account) => (
              <button
                key={account.id}
                onClick={() => selectOrganization(account)}
                className="w-full text-left px-4 py-4 rounded-xl border border-slate-200 hover:border-teal-400 hover:bg-teal-50 transition-all duration-200"
              >
                <p className="font-semibold text-slate-900">{account.organization_id}</p>
                <p className="text-sm text-slate-500 mt-0.5">{account.role}</p>
              </button>
            ))}
          </div>
          <button
            onClick={() => base44.auth.logout()}
            className="mt-6 w-full text-sm text-slate-400 hover:text-red-500 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  // 2b. No UserAccount → send to Onboarding (con excepción de páginas protegidas)
  if (!userAccount && !isProtectedPage) {
    if (typeof window !== 'undefined') {
      window.location.href = createPageUrl('Onboarding');
    }
    return null;
  }

  // Fail closed when the backend authorization projection is temporarily unavailable.
  // This is a UX gate only; backend command policies remain the authority.
  if (!authorizationReady && !isProtectedPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f8fb]">
        <div className="text-center max-w-md p-8 bg-white rounded-xl border border-slate-200 shadow-sm">
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Permisos no disponibles</h2>
          <p className="text-slate-600 mb-6">
            No pudimos confirmar tus permisos actuales. Ninguna operación fue habilitada; vuelve a intentarlo.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={reloadAuth}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={() => base44.auth.logout()}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>
    );
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

  // Fail closed if the context did not include the selected organization.
  // The backend remains authoritative for suspension and every operation.
  if (effectiveRole !== 'SUPER_ADMIN' && (!effectiveOrgId || !organization || !['active', 'suspended'].includes(organization.status))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f8fb]">
        <div className="text-center max-w-md p-8 bg-white rounded-xl border border-slate-200 shadow-sm">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Error al Cargar Cuenta</h2>
          <p className="text-slate-600 mb-6">
            No se pudo cargar la información de tu organización. Por favor, intenta cerrar sesión o contactar a soporte.
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              onClick={() => window.open('mailto:soporte@techrepair-platform.com', '_blank')}
              className="bg-teal-700 hover:bg-teal-800"
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

  // ── Secciones colapsables: estado persistido ya existe arriba ──

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

    <div className={`trp-workspace min-h-screen ${isImpersonating && organization?.status === 'suspended' ? 'pt-28' : isImpersonating ? 'pt-16' : ''}`}>
      {/* Sidebar */}
      <aside className={`hidden md:block fixed left-0 top-0 h-screen bg-[#0b1422] border-r border-white/10 transition-all duration-300 z-40 ${sidebarOpen ? 'w-64' : 'w-20'}`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-5 border-b border-white/10">
            <div className="flex items-center justify-between">
              {sidebarOpen && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-teal-400/10 ring-1 ring-inset ring-teal-300/20 rounded-xl flex items-center justify-center">
                    <span className="text-sm font-black tracking-[-0.04em] text-teal-300">TRP</span>
                  </div>
                  <div>
                    <h1 className="text-lg font-bold tracking-tight text-white">TRP</h1>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Technology Reliability</p>
                  </div>
                </div>
              )}
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                title={sidebarOpen ? 'Colapsar menú' : 'Expandir menú'}
              >
                {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Global search trigger */}
          <div className="px-4 pb-2">
            <button
              onClick={() => setSearchOpen(true)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.05] text-slate-300 hover:bg-white/10 hover:text-white hover:border-teal-400/30 transition-colors text-sm ${
                sidebarOpen ? '' : 'justify-center'
              }`}
            >
              <Search className="w-4 h-4 flex-shrink-0" />
              {sidebarOpen && <span>Buscar...</span>}
              {sidebarOpen && <kbd className="ml-auto text-[10px] font-medium text-slate-500">⌘K</kbd>}
            </button>
          </div>

          {/* Navigation — declarativa */}
          <nav className="flex-1 overflow-y-auto p-4">
            <SidebarMenu
              effectiveRole={effectiveRole}
              capabilities={capabilities}
              currentPageName={currentPageName}
              sidebarOpen={sidebarOpen}
              sectionsOpen={sectionsOpen}
              toggleSection={toggleSection}
            />
          </nav>

          {/* User Section */}
          {user && (
            <div className="p-4 border-t border-white/10">
              {sidebarOpen ? (
                <div className="space-y-3">
                  <div className="px-4 py-3 bg-white/5 ring-1 ring-inset ring-white/5 rounded-xl">
                    <p className="text-sm font-medium text-slate-100">{user.full_name}</p>
                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                    {effectiveRole && (
                      <p className="text-xs text-teal-300 font-medium mt-1">
                        {effectiveRole}
                        {isImpersonating && ' (Soporte)'}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={handleLogout}
                    variant="outline"
                    className="w-full justify-start gap-2 border-slate-700 bg-transparent text-slate-400 hover:bg-white/5 hover:text-white hover:border-slate-600"
                  >
                    <LogOut className="w-4 h-4" />
                    Cerrar Sesión
                  </Button>
                </div>
              ) : (
                <button
                  onClick={handleLogout}
                  className="w-full p-3 hover:bg-white/5 rounded-lg transition-colors"
                >
                  <LogOut className="w-5 h-5 text-slate-500 hover:text-white mx-auto" />
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className={`transition-all duration-300 ${sidebarOpen ? 'md:ml-64' : 'md:ml-20'}`}>
        <div className="px-5 py-6 md:px-8 md:py-8 xl:px-10">
          <WorkspaceHeader currentPageName={currentPageName} t={t} onOpenMenu={() => setMobileMenuOpen(true)} />
          {children}
        </div>
      </main>
    </div>

    <MobileNavigation open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} effectiveRole={effectiveRole} capabilities={capabilities} currentPageName={currentPageName} sectionsOpen={sectionsOpen} toggleSection={toggleSection} />
    <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
  </>
  );
}

export default function Layout(props) {
  return <LayoutContent {...props} />;
}