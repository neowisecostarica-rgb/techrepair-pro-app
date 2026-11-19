# TRP — continuidad Super Admin y tipado · 2026-11-19

**Aplicación:** `695d708948469128f473d080` · **Rama:** `main` · **Release:** NO-GO.  
**Alcance:** corrección de frontend y tipado; sin cambios de backend, RLS, roles, usuarios, datos operativos, infraestructura ni Publish.

## Hallazgo reproducible y corrección

La consola `src/pages/Saas.jsx` conservaba `consoleSection` en estado local actualizado solo por `window.hashchange`. Los enlaces del menú lateral usan React Router `<Link>`, que modifica el historial sin garantizar ese evento; por tanto el hash podía cambiar sin actualizar el panel mostrado. Se eliminó la dependencia de ese evento: ahora `useLocation().hash` determina la sección. Los atajos internos navegan con `useNavigate`, y se limitan a `overview`, `organizations`, `commercial`, `health`, `audit` y `pilot`.

La seguridad permanece igual: `PageGuard` exige `SUPER_ADMIN`; `identityGateway` determina el rol desde el usuario nativo de plataforma y su marca autorizada. Un `ORG_ADMIN` de un tenant no puede ingresar al Super Admin de plataforma.

## Regresiones de tipos corregidas

- `src/components/layout/SidebarMenu.jsx`: `onNavigate` es opcional en escritorio; se conserva el cierre del menú móvil cuando se entrega el callback.
- `jsconfig.json`: tipos `vite/client` para `import.meta.env`, sin alterar `checkJs`, `allowJs` o las rutas incluidas.
- `scripts/verify-superadmin-hash-navigation.mjs`: nuevo contrato de regresión de rutas y guard.

## Verificación técnica

- `node scripts/verify-superadmin-hash-navigation.mjs`: **19/19 PASS**.
- `npm run test:multiuser-navigation`: **8/8 PASS**.
- `npm run test:identity-tenant-security`: **7/7 PASS**.
- `npx tsc --project jsconfig.json --noEmit --pretty false`: **sin diagnósticos** para los archivos incluidos en esa configuración; no equivale a cobertura de todos los archivos del repositorio.
- `npm run build`: el comando inició en sandbox y `dist/index.html` está presente; el endpoint de preview respondió correctamente. No se efectuó inspección visual autenticada.

## Evidencia runtime y límites

Consultas read-only a logs: el endpoint de `identityGateway` no devolvió líneas recientes, y `operationalGateway` devolvió una respuesta HTTP 200 en el período accesible. No existe evidencia nueva suficiente para considerar resueltos los errores 403/500 reportados por Ventas/Taller. No se realizó login como Super Admin ni se cambió ninguna cuenta para forzar QA. La consulta a HEAD remoto de GitHub no se pudo completar porque el sandbox rechazó el comando; la reconciliación Base44 ↔ GitHub sigue abierta.

## Pendientes concretos

1. **P0 — QA real Super Admin:** abrir `/Saas` con una cuenta legítima cuyo contexto backend indique `SUPER_ADMIN`; comprobar menú lateral, todas las seis secciones, paneles con datos/error y versión móvil. No elevar automáticamente a `gustavo@compustorecr.com` por ser ORG_ADMIN.
2. **P0 — Ventas/Taller 403/500:** reproducir con identidades QA autorizadas, guardar módulo/acción, hora, status, función y request-id; diferenciar rechazo esperado de capacidad (403), error inesperado (500) y rate limit (429), sin modificar datos de COMPU STORE.
3. **P0 — release:** QA E2E multiempresa aislado, auditoría atómica de AuditEvent y reconciliación de runtime/publicado siguen NO-GO.
4. **P1 — visual:** recorrer módulos comerciales, Taller y plataforma con el sistema visual unificado; revisar móvil 360/390 px con sesión real.

**Regla de continuación:** ninguna prueba de código sustituye el QA humano autenticado. No hacer Publish ni modificar datos/roles productivos sin nueva autorización.
