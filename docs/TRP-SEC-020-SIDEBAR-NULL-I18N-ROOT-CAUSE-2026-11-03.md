# TRP-SEC-020 — CAUSA RAÍZ CONFIRMADA: i18nKey null rompe SidebarMenu
Fecha 2026-11-03 | Estado: CORRECCIÓN DE CÓDIGO + SSR PASS; QA VISUAL EN PREVIEW PENDIENTE
Origen: captura DevTools aportada por Dirección General de Base44 preview, actuando como SALES.

## Evidencia exacta de la consola de Chrome
`Uncaught TypeError: Cannot read properties of null (reading 'split')`
Stack: `index.jsx:49:413`, `index.jsx:49:461`, `SidebarMenu.jsx:78:165`, `SidebarMenu.jsx:60:30`, `SidebarMenu.jsx:37:19`; React señala error en `<SidebarMenu>`, contenido dentro de `Layout`, `App`, `AuthProvider`, `AppErrorBoundary` SEC-019.
Los avisos amarillos de React Router Future Flag NO son la causa.

## Causa trazada hasta las fuentes exactas
- `src/config/menuConfig.js`: elementos CRM y ColaRevision declaran explícitamente `i18nKey: null`. Solo se representan para roles con las capacidades pertinentes.
- `src/components/layout/SidebarMenu.jsx` llamaba `t(item.i18nKey, item.label)` para TODOS los ítems visibles.
- `src/i18n/index.jsx` implementa `t` mediante función `get=(obj,path)=>path.split('.').reduce(...)`. Cuando `path=null`, se produce TypeError antes de completar render de Layout y panel.
- Esto explica que SALES y ORG_ADMIN, con CRM disponible, fallen mientras TECHNICIAN sin CRM podía cargar. BRANCH_ADMIN también tiene CRM.
- SEC-019 sí capturaba la excepción global y cumplió el propósito de instrumentación; el error NO está en el iframe, ni se ha comprobado fallo de auth.

## Corrección aplicada
- `src/components/layout/SidebarMenu.jsx` ahora hace `item.i18nKey ? t(item.i18nKey, item.label) : item.label`. Si no hay clave de traducción, muestra el texto literal (CRM / Cola de Revisión) sin llamar `t(null)`.
- No se cambiaron claves i18n globales, capacidades, RLS, roles, usuarios, organización, backend, ni datos comerciales.
- Nuevo test de renderizado SSR real con Vite `scripts/verify-sec020-sidebar-null-i18n.mjs`. Ejecuta componentes reales `SidebarMenu`, `I18nProvider`, `MemoryRouter`, `MENU_ITEMS` y roles desde `getRoleCapabilities`.

## Evidencia de pruebas
- **SSR de 6 roles PASS:** ORG_ADMIN, BRANCH_ADMIN, SALES, TECHNICIAN, INVENTORY, CUSTOMER_SERVICE.
- Aserciones de prueba: CRM y ColaRevision tienen `i18nKey=null`, SALES/ORG_ADMIN/BRANCH_ADMIN renderizan CRM sin excepción, TECHNICIAN NO recibe CRM.
- `npm run test:multiuser-navigation`: 8/8 PASS.
- `npm run test:identity-tenant-security`: 7/7 PASS.
- `npm run test:crm-customer360`: 8/8 PASS.
- `node scripts/verify-sec019-root-error-boundary.mjs`: PASS.
- `npm run build` y `git diff --check`: PASS.
- Avisos de useLayoutEffect durante SSR y base browserslist obsoleta: warnings no bloqueantes. La prueba SSR terminó exit code 0.
- Checkpoint PREVIO a corrección: `6aea2f739aba4269bcf479a4`, SHA `13caec90cf81fc9b77d6d74d14065851fbf17b67`.

## Siguiente validación (no confundir con tests)
- Abrir Base44 editor preview con el SHA candidato SEC-020 y recargar la vista.
- Comprobar `ventas@compustorecr.com` SALES: aparece navegación y MiDia/CRM sin error `reading split`.
- Comprobar `gustavo@compustorecr.com` ORG_ADMIN: aparece panel y enlaces, y `taller@compustorecr.com` TECHNICIAN sigue funcional.
- Secuencia SALES → TECHNICIAN → SALES. Revisar consola, sin nuevas excepciones de render.
- Guardar evidencia visual y cerrar el issue #14 SOLO si QA de navegador PASS. P0-AUD-01 sigue NO-GO general y E2E transaccional no está completo.