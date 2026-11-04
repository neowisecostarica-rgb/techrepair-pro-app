import { useLayoutEffect } from 'react';
import { Toaster } from "@/components/ui/toaster"
import ExpedienteOT from './pages/ExpedienteOT';
import ActivoDetalle from './pages/ActivoDetalle';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import TRPWebsite from './pages/TRPWebsite';
import { AuthProvider, useAuthContext } from '@/components/contexts/AuthContext';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

// Every new module should open from its heading, never inherit the previous
// module's page scroll. Hash links keep their native anchor behavior.
function ScrollToTopOnModuleChange() {
  const { pathname, hash } = useLocation();
  useLayoutEffect(() => {
    if (hash) return;
    const reset = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
    };
    reset();
    // Browsers may restore the old position when a route settles; clear it
    // once more after the new module paints, without touching sidebar/modals.
    const frame = window.requestAnimationFrame(reset);
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);
  return null;
}

const PUBLIC_PAGE_NAMES = ['PortalCliente', 'PortalCotizacion', 'PortalComprobante', 'PortalGarantia'];
const MARKETING_PATHS = ['/trp', '/website'];
const PUBLIC_ROUTE_ALIASES = { '/cotizacion': 'PortalCotizacion' };

const AuthenticatedApp = () => {
  const { status } = useAuthContext();
  const location = useLocation();
  const normalizedPath = (location.pathname.replace(/\/+$/, '') || '/').toLowerCase();
  if (MARKETING_PATHS.includes(normalizedPath)) return <Routes><Route path="*" element={<TRPWebsite />} /></Routes>;

  const publicPageName = PUBLIC_ROUTE_ALIASES[normalizedPath]
    || PUBLIC_PAGE_NAMES.find(name => normalizedPath === `/${name}`.toLowerCase());

  if (publicPageName) {
    const PublicPage = Pages[publicPageName];
    return (
      <Routes>
        <Route path={`/${publicPageName}`} element={<PublicPage />} />
        {publicPageName === 'PortalCotizacion' && <Route path="/cotizacion" element={<PublicPage />} />}
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    );
  }

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      {/* ── Expediente OT — ruta con parámetro dinámico ── */}
      <Route
        path="/expediente/:id"
        element={
          <LayoutWrapper currentPageName="ExpedienteOT">
            <ExpedienteOT />
          </LayoutWrapper>
        }
      />
      {/* ── Expediente del activo — historial longitudinal ── */}
      <Route
        path="/activo/:id"
        element={
          <LayoutWrapper currentPageName="Activos">
            <ActivoDetalle />
          </LayoutWrapper>
        }
      />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <ScrollToTopOnModuleChange />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
