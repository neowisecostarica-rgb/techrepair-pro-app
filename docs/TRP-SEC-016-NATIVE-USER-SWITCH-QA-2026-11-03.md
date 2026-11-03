# TRP-SEC-016 — Cambio de usuario Base44 en preview: aislamiento de sesión
Fecha 2026-11-03 | Estado: CORRECCIÓN DE CÓDIGO Y TESTS PASS; QA DE NAVEGADOR PENDIENTE
Referencia: video aportado por Dirección General `20261103-1747-07.3724928.mp4` (50 s).

## Reproducción visual observada
- Con SALES, la vista queda en `Verificando estado de tu cuenta...` y después puede terminar en blanco; con TECHNICIAN sí presenta navegación y pantallas operativas; regreso a SALES reproduce el bloqueo.
- La cadena `Verificando estado de tu cuenta...` procede del gate de `src/Layout.jsx` que espera el `useQuery` de `getIdentityOrganization`, no directamente del spinner inicial de `AuthContext`.
- La consulta de estado estaba cacheada por `['org-status', effectiveOrgId]`, de modo que dos usuarios de una misma empresa compartían la clave de cache aunque tenían sesiones y roles distintos. Esto es un defecto de aislamiento de cache demostrable; no hay aún evidencia de que sea la única causa de la pantalla en blanco.
- `AuthContext.loadAuthData()` ponía status=loading, pero conservaba estado `userAccount`, `authorization` y `user` previo hasta que respondiera el nuevo gateway. Eso crea una ventana de información stale durante un cambio de usuario; deben limpiarse antes de reconstruir autoridad.
- No hay logs recientes de `identityGateway` para esa reproducción visibles mediante GET `functions-mgmt/identityGateway/logs`; no atribuir la pantalla a HTTP 400 sin evidencia.

## Corrección aplicada (sin modificar backend ni permisos)
- `src/components/contexts/AuthContext.jsx`: al iniciar nueva carga efectiva, status loading y reset sincrónico lógico en estados React `user`, `userAccount`, `authorization`, `identityStatus`, `multiOrgAccounts`, antes de solicitar contexto. `queryClientInstance.clear()` y reconciliación por foco/visibilidad/intervalo se preservan.
- `src/Layout.jsx`: `org-status` usa cache separada por `[user.id,effectiveOrgId,effectiveRole]` y solo consulta organización tras `status === ready`, `authorizationReady` y `userAccount` válido. `getIdentityOrganization` sigue pasando por `identityGateway` con autorización backend, sin shortcuts.
- Nuevo test persistente `scripts/verify-sec016-native-session-switch.mjs` confirma la transición, el aislamiento de cache y el mantenimiento de autorización de organización en servidor.

## Evidencia técnica
- `node scripts/verify-sec016-native-session-switch.mjs`: PASS.
- `npm run test:impersonation-session-hardening`: 10/10 PASS.
- `npm run test:identity-tenant-security`: 7/7 PASS.
- `npm run test:multiuser-navigation`: 8/8 PASS.
- `npm run test:crm-customer360`: 8/8 PASS.
- `npm run build` y `git diff --check`: PASS.
- Checkpoint de restauración PREVIO: `6aea22bc8d5d03273ba07f6f`, SHA `bf425dfb59ea747c362f531da0136e35d8515403`.

## Próximo gate de aceptación
1. Abrir preview en navegador con la herramienta real de cambio nativo de usuarios de Base44.
2. Ejecutar secuencia SALES (`ventas@compustorecr.com`) → TECHNICIAN (`taller@compustorecr.com`) → SALES. Registrar pantalla, duración percibida y navegación en cada paso sin extraer PII ni tokens.
3. Confirmar que SALES puede navegar a CRM y a vistas comerciales; no debe aparecer pantalla blanca, loop de onboarding ni `Verificando estado de tu cuenta...` persistente.
4. Confirmar que ningún usuario hereda data cacheada ni opciones administrativas del anterior y que no puede acceder a sucursal/tenant ajeno.
5. Repetir al menos una carga fría. No tocar leads, ventas, pagos, inventario o relaciones reales de COMPU STORE.
6. Si persiste: capturar consola del navegador y Network para `identityGateway context` y `getOrganization`; instrumentar errores por paso sin PII. No cambiar reglas de acceso por ensayo y error.

## GO/NO-GO
SEC-016 no es PASS funcional hasta el QA real. QA E2E y P0-AUD-01 persisten en NO-GO general. Este cambio es exclusivamente frontend con pruebas estáticas de regresión.