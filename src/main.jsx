import { I18nProvider } from '@/i18n';
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import AppErrorBoundary from '@/components/diagnostics/AppErrorBoundary'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <AppErrorBoundary><I18nProvider><App /></I18nProvider></AppErrorBoundary>
)
