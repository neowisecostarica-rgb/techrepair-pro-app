# TRP-SEC-020 — React crash por clave de traducción nula en navegación
Fecha 2026-11-03 | Estado: ERROR REAL IDENTIFICADO, CÓDIGO CORREGIDO Y TESTS PASS; QA NAVEGADOR PENDIENTE
GitHub: https://github.com/neowisecostarica-rgb/techrepair-pro-app/issues/14

## Evidencia real del navegador
Captura de Chrome DevTools aportada por Dirección General (Base44 preview, SALES). Excepción literal:
`Uncaught TypeError: Cannot read properties of null (reading 'split')`.
Stack: `src/i18n/index.jsx:49` (traductor `get(obj,path)` usa `path.split('.')`) ← `src/components/layout/SidebarMenu.jsx:78` ← render de `SidebarMenu` ← `src/Layout.jsx`. React reporta `The above error occurred in <SidebarMenu>`; el boundary global confirma `[TRP SEC-019] Root React render failure`.
**Causa material identificada:** ruta de traducción de navegación pasa clave nula o inválida al traductor; éste llamaba `.split` sin validar tipo/valor. El árbol de React fallaba en el sidebar, antes de abrir panel SALES/ADMIN. Los warnings de React Router v7 no están relacionados.

## Corrección acotada
- `src/i18n/index.jsx`: el resolver `get(obj,path)` solo ejecuta `path.split('.')` si la clave es string no vacía. Ante `null`, `undefined` u otro tipo devuelve `undefined` y la función `t` usa su fallback. Las claves válidas conservan el comportamiento previo.
- `src/components/layout/SidebarMenu.jsx`: encabezados de categorías sin clave válida muestran el título literal. Labels sin `i18nKey` ya usaban fallback literal; se mantiene.
- `src/components/search/GlobalSearch.jsx`: dos usos de traducción para `MENU_ITEMS` ahora respetan `i18nKey: null` (hay elementos así en `menuConfig.js`), sin pasar `null` al traductor.
- No se tocaron roles, `User`, `UserAccount`, backend, RLS, rutas comerciales ni datos de COMPU STORE.

## Verificaciones
- Nuevo `scripts/verify-sec020-null-navigation-i18n.mjs`: PASS; ejecuta el resolver extraído del código real contra claves válidas, `null`, `undefined`, números, objetos, string vacío y ausentes.
- Navegación multiusuario 8/8 PASS; i18n navigation 7/7 PASS; i18n foundation 8/8 PASS; seguridad de identidad 7/7 PASS; `npm run build` PASS y `git diff --check` PASS.
- Checkpoint ANTES: `6aea31ddb060f1319c7752f9`, SHA `3883ca9c3dcf61c77635934232b9c512a68c6ff9`.
- Causa específica confirmada por stack; **no declarar QA real PASS ni problema solucionado funcionalmente** hasta recargar preview actualizado y comprobar SALES + OWNER.

## QA de cierre
1. Abrir Base44 Preview actualizado y actuar como ventas@compustorecr.com; verificar sidebar y `MiDiaSales`, luego CRM en solo lectura.
2. Cambiar a gustavo@compustorecr.com: comprobar OWNER / ORG_ADMIN y panel `MiDiaAdmin`, luego regresar a SALES. Verificar TECHNICIAN no regresa.
3. Comprobar consola: ausencia de error `null.split` y de `SEC-019 · REACT_ROOT`; si hay otro error, registrar stack exacto.
4. Sin crear prospectos, cotizaciones, ventas, cobros ni modificaciones de inventario.
5. Actualizar issue #14, auditoría maestra y checkpoint con prueba visual. `P0-AUD-01` y E2E comercial siguen NO-GO hasta sus propias validaciones.
