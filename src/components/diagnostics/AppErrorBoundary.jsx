import React from 'react';

// Root-level render containment. Does not bypass auth, tenant gating or backend policies.
export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    // Minimal diagnostics only: avoid identities, tokens, payloads and URLs.
    console.error('[TRP SEC-019] Root React render failure', {
      name: error?.name || 'Error',
      componentStack: typeof info?.componentStack === 'string'
        ? info.componentStack.slice(0, 700).replace(/https?:\/\/\S+/g, '[url]')
        : '',
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main role="alert" className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-lg rounded-xl border border-amber-300 bg-white p-7 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">TRP no pudo mostrar la aplicación</h1>
          <p className="mt-3 text-slate-700">
            Ocurrió un error al dibujar la pantalla. Tu sesión y los permisos continúan protegidos.
          </p>
          <p className="mt-3 text-sm text-slate-600">Código de diagnóstico: SEC-019 · REACT_ROOT</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded bg-slate-900 px-4 py-2 text-white"
          >
            Reintentar
          </button>
        </div>
      </main>
    );
  }
}
