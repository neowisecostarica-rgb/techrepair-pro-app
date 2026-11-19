import { useEffect, useLayoutEffect } from 'react';
import { Toaster } from "@/components/ui/toaster"
import ExpedienteOT from './pages/ExpedienteOT';
import ActivoDetalle from './pages/ActivoDetalle';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, useLocation, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import Home from './pages/Home';
import { AuthProvider, useAuthContext } from '@/components/contexts/AuthContext';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

// A new module always starts at the top, including platform-console tabs.
// Real hash anchors on other pages (e.g. a document section) keep their target.
function ScrollToTopOnModuleChange() {
  const { pathname, hash } = useLocation();
  const platformTab = pathname.toLowerCase() === '/saas';
  const destination = platformTab ? `${pathname}${hash}` : pathname;

  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = previous; };
  }, []);

  useLayoutEffect(() => {
    if (hash && !platformTab) return;

    const reset = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
      document.body.scrollTop = 0;
      document.querySelectorAll('[data-trp-scroll-root]').forEach(el => { el.scrollTop = 0; });
    };
    reset();
    let nextFrame;
    const frame = window.requestAnimationFrame(() => {
      reset();
      nextFrame = window.requestAnimationFrame(reset);
    });
    // Allow the new route's layout to settle before the browser restores scroll.
    const timer = window.setTimeout(reset, 80);
    return () => {
      window.cancelAnimationFrame(frame);
      if (nextFrame) window.cancelAnimationFrame(nextFrame);
      window.clearTimeout(timer);
    };
  }, [destination]);
  return null;
}

const PUBLIC_PAGE_NAMES = ['PortalCliente', 'PortalCotizacion', 'PortalComprobante', 'PortalGarantia'];
// The marketing website lives in a separate public app; this app is for TRP operations.
const PUBLIC_ROUTE_ALIASES = { '/cotizacion': 'PortalCotizacion' };

const AuthenticatedApp = () => {
  const { status } = useAuthContext();
  const location = useLocation();
  const normalizedPath = (location.pathname.replace(/\/+$/, '') || '/').toLowerCase();
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
      <Route path="/" element={<Home />} />
      <Route path="/trp" element={<Navigate to="/" replace />} />
      <Route path="/website" element={<Navigate to="/" replace />} />
      <Route path="/app" element={
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
