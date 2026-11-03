# TRP-SEC-019 — Pantalla blanca en Base44 Preview con SALES, tras SEC-018
Fecha: 2026-11-03 | Estado: DIAGNÓSTICO GLOBAL REACT AÑADIDO Y PROBADO EN CÓDIGO; CAUSA FUNCIONAL NO CONFIRMADA
Imagen de Dirección General: Base44 /editor/preview, banner azul `Estás actuando como ventas@compustorecr.com`, rectángulo vacío gris claro sin sidebar, panel, spinner ni mensaje SEC-017. La lista lateral muestra checkpoint SEC-018.

## Qué prueba y qué no
- La captura demuestra un render vacío dentro del iframe de Base44 en modo nativo de actuación como usuario SALES. No demuestra por sí sola un crash React, un retorno `null`, un redirect repetido ni un error de carga de recursos.
- `get_app_status` devuelve ready con versión de SEC-018 `b3749f43f179cd86353ce056d8202dd79613e94c`. La captura es consistente con la vista previa después de SEC-018, pero no incluye evidencia de bundles ni DevTools.
- Las rutas de `MiDia` tienen `PageGuard` y `MiDiaErrorBoundary` SEC-017, que solo detecta excepciones **dentro del panel**. La pantalla completamente vacía obliga a observar un nivel superior.
- Los logs de `identityGateway` anteriores incluyen POST 200; sin Network / console del iframe no se puede afirmar que el gateway sea la causa.

## Implementación SEC-019
- Nuevo componente `src/components/diagnostics/AppErrorBoundary.jsx` rodea toda la aplicación desde `src/main.jsx`, incluyendo I18n, `AuthProvider`, `Router`, Layout y paneles.
- Captura errores React de render/hijos y muestra texto estable `TRP no pudo mostrar la aplicación`, `Código de diagnóstico: SEC-019 · REACT_ROOT`, y botón Reintentar. Registra un identificador en consola con nombre de excepción y componente abreviado, pero sin imprimir mensaje que pueda contener información de usuario, tokens, URL o payloads.
- La protección no modifica ni concede roles, sesión, RLS ni operaciones del backend. Si el problema es HTML/JS que no arranca, error de cargador previo a React, redirección con `return null`, o render legal vacío, esta protección no lo capturará; esos casos requieren consola/Network del navegador.
- Test de contrato `scripts/verify-sec019-root-error-boundary.mjs` confirma la envoltura completa y los controles de privacidad; no se removieron barreras de organización ni suspensión.

## Pruebas y reversión
- Checkpoint previo a SEC-019 `6aea2c22bc3231fb009a4ac0`, SHA `b3749f43f179cd86353ce056d8202dd79613e94c`.
- `node scripts/verify-sec019-root-error-boundary.mjs` PASS.
- `node scripts/verify-sec016-native-session-switch.mjs` PASS.
- `node scripts/verify-sec017-midia-error-boundary.mjs` PASS.
- `npm run test:identity-tenant-security` 7/7 PASS.
- `npm run test:multiuser-navigation` 8/8 PASS.
- `npm run build` y `git diff --check` PASS.

## Próximo gate decisivo
1. Confirmar que la vista previa ejecuta SHA posterior a SEC-019 y recargar de forma normal.
2. Si aparece `SEC-019 · REACT_ROOT`: recopilar el nombre del error, la primera línea útil de stack del navegador, sin URLs/tokens ni información personal.
3. Si aparece `SEC-017 · Panel SALES/ADMIN`: la excepción está dentro de MiDia, consultar consola `[TRP SEC-017]`.
4. Si aparece `Error al Cargar Cuenta`: el contexto autorizado no contiene una organización coincidente, revisar respuesta de `identityGateway context` con datos sanitizados.
5. Si sigue absolutamente blanco: inspeccionar DevTools del iframe Base44 en consola y Network para error JS, bundle/chunk no servido, redirect/bucle o `return null` de Layout/guard. SEC-019 no prueba un crash si no aparece.
6. Repetir SALES, ORG_ADMIN y TECHNICIAN sin escribir datos operativos. No declarar GO hasta que se vean los paneles y haya evidencia QA.

## Decisión
SEC-019 es exclusivamente instrumentación diagnóstica. La causa exacta permanece NO VERIFICADA, el incidente de GitHub #14 sigue ABIERTO y P0-AUD-01 / QA E2E permanecen NO-GO.