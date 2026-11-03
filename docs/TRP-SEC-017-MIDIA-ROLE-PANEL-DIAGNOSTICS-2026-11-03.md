# TRP-SEC-017 — SALES y ORG_ADMIN aún sin panel después de SEC-016
Fecha: 2026-11-03 | Estado: DIAGNÓSTICO FRONTEND AÑADIDO, NO CERRADO EN NAVEGADOR
Referencia: reporte de Dirección General: 'sigue igual no muestra el panel ni de ventas ni de owner'.

## Evidencia y corrección de hipótesis
- La corrección SEC-016 ya estaba guardada en Base44 (status ready SHA 66f43477). Dirección General reportó que el problema persistía para SALES y OWNER/ORG_ADMIN. Por tanto **SEC-016 NO fue solución funcional**.
- Logs nuevos `identityGateway`: 2026-11-03 18:13-18:15 UTC numerosas solicitudes `POST -> 200` y sin errores mostrados. Esto indica disponibilidad de gateway, NO certifica que `getOrganization` o CRM den un payload correcto para cada rol; sin trazas de acción no hay causa confirmada.
- `src/pages/MiDia.jsx` enruta SALES a `MiDiaSales`, ORG_ADMIN/BRANCH_ADMIN a `MiDiaAdmin`, TECHNICIAN a `MiDiaTech`. El texto 'Verificando estado de tu cuenta...' es de `src/Layout.jsx` antes del render del panel. Si sigue solo ese texto, un boundary de MiDia no se ejecuta.
- Lectura mínima sin PII de datos existentes en COMPU STORE: Venta count=16 y Cotizacion count=5; sus `total` consultados eran de tipo number, por lo que un error genérico en `.toFixed()` por strings no se reprodujo con esos registros. No se extrajeron datos de compradores.

## Instrumentación de recuperación agregada
- Nuevo `src/components/midia/MiDiaErrorBoundary.jsx`: captura excepciones de renderizado/React en `MiDia`, muestra `No se pudo mostrar el panel` con identificación SEC-017 y rol del panel, botón de recarga. El mensaje técnico de la excepción no se expone en UI; sólo se registra en consola del navegador con límites, sin tokens ni payloads.
- `src/pages/MiDia.jsx` conserva PageGuard y 3 paneles originales, añade boundary con key por `user.id` y `effectiveRole`, para reiniciar el error boundary al cambiar usuario sin heredar estado.
- No se modificaron backend, cuentas, permisos, RLS, organización, cotizaciones ni ventas. No se hizo Publish.
- Se creó test de contrato `scripts/verify-sec017-midia-error-boundary.mjs` que verifica el ruteo, el boundary y que CRM sigue usando gateway autenticado.

## Pruebas y restore
- Checkpoint previo: `6aea25a0c5356076bd88dbd3` (SHA `66f43477cdebe00388ce770804fc7619bbc077af`).
- `node scripts/verify-sec017-midia-error-boundary.mjs`: PASS.
- `node scripts/verify-sec016-native-session-switch.mjs`: PASS.
- `npm run test:multiuser-navigation`: 8/8 PASS.
- `npm run test:crm-customer360`: 8/8 PASS.
- `npm run build` y `git diff --check`: PASS.

## Gate de QA decisivo
1. Comprobar que el preview realmente ejecuta el SHA candidato actualizado. No presumir despliegue por build o checkpoint.
2. Alternar SALES → TECHNICIAN → ORG_ADMIN → SALES. Observar las pantallas y abrir consola/Network si procede.
3. Si aparece `No se pudo mostrar el panel · SEC-017 · Panel SALES/ADMIN`, capturar la consola `[TRP SEC-017] MiDia render failed` (omitir PII/token). Es error de render de un panel.
4. Si persiste `Verificando estado de tu cuenta...`, el bloqueo es de `Layout.jsx` en `getIdentityOrganization`; medir la petición `identityGateway` con action `getOrganization`, su estado/código y duración y comprobar cambios de sesión. No diagnosticar como panel sin pruebas.
5. Si se ve una página vacía sin ninguno de los textos, verificar error global de React/App que ocurre antes del boundary y consola.
6. No modificar datos reales para conseguir éxito. Mantener issue SEC-016 abierto hasta evidencia; E2E y P0-AUD-01 siguen NO-GO.