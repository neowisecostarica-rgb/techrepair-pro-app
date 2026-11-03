import React from 'react';

export default class MiDiaErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    // Do not print member IDs, user data or backend payloads in UI.
    console.error('[TRP SEC-017] MiDia render failed', {
      panel: this.props.panel,
      errorName: error?.name || 'Error',
      errorMessage: typeof error?.message === 'string' ? error.message.slice(0, 180) : 'Render error',
      componentStack: typeof info?.componentStack === 'string' ? info.componentStack.slice(0, 900) : '',
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="max-w-xl mx-auto mt-12 rounded-xl border border-amber-300 bg-amber-50 p-6" role="alert">
        <h1 className="text-xl font-semibold text-slate-900">No se pudo mostrar el panel</h1>
        <p className="mt-2 text-sm text-slate-700">
          Ocurrió un problema al mostrar esta pantalla. El acceso permanece protegido;
          no se han habilitado operaciones adicionales.
        </p>
        <p className="mt-3 text-xs text-slate-600">Diagnóstico: SEC-017 · Panel {this.props.panel}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-5 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Reintentar carga
        </button>
      </main>
    );
  }
}
