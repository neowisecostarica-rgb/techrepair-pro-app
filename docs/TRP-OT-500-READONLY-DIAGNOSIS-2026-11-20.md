# TRP — Diagnóstico de OTs y HTTP 500 · 2026-11-20

**App SaaS:** `695d708948469128f473d080` (no confundir con TRP — Sitio Web `6aff72584625dbb99e995d37`).
**Estado:** OTs históricas confirmadas en la entidad; HTTP 500 al cargar la pantalla continúa **ABIERTO / NO REPRODUCIDO CON RESPUESTA DETALLADA**. Release general NO-GO.

## Evidencia de usuario
- Captura autenticada de **Órdenes** como `ORG_ADMIN` de COMPU STORE: banner «No se pudieron consultar las órdenes de trabajo. Esto no significa que el taller esté vacío. Request failed with status code 500», opción «Reintentar consulta».
- La UI `src/pages/OrdenesTrabajo.jsx` usa `base44.functions.invoke('listWorkOrders', {limit:200, cursor})`. Separa correctamente error de consulta de lista vacía.

## Evidencia read-only de datos
- Entidad `Organization`: `COMPU STORE COSTA RICA`, id `698bc7cadce06ca69e4ead17`, `active`.
- Entidad `OrdenTrabajo` filtrada por `organization_id` anterior: **39 registros** (23-feb a 05-ago 2026), distribuidos en 2 sucursales: 38 + 1. Estados: 13 `EN_COLA_REVISION`, 17 `EN_REVISION`, 5 `ASIGNADA`, 2 `DIAGNOSTICADA`, 2 `CANCELADA`.
- Los 39 registros referencian **29 IDs de Cliente** y **36 IDs de Equipo**, todos recuperados con consulta read-only `organization_id` + `id:{$in:[...]}`. No se leyeron campos personales en este diagnóstico.
- **Conclusión:** no se debe pedir a Compu Store que empiece desde cero ni asumir pérdida de OTs. Esta consulta no demuestra que todo Legacy esté migrado; sí demuestra que hay OTs previas en el TRP actual.

## Ruta técnica del error
- `base44/functions/listWorkOrders/entry.ts` autentica al usuario, resuelve el contexto, calcula el alcance de sucursal, lee `OrdenTrabajo.filter`, une `Cliente`/`Equipo` y aplica una proyección permitida. Su `catch` responde HTTP 500 con `error.message`, **sin `console.error` ni código correlacionado**.
- Base44 logs de `listWorkOrders` consultados para 18–20 nov: en Preview aparece una línea de telemetría `non_ok_pre_response=true` a las `2026-11-20T12:35:25Z`, sin excepción detallada; para Prod no se obtuvieron líneas en la ventana consultada. No adjudicar causalidad exacta sin cuerpo de respuesta/logs.
- Listado API de funciones backend desplegadas respondió `truncated:true`; el código editor no está reconciliado contra la versión servida. **No redeploy especulativo**.
- GitHub: acceso confirmado al repo `neowisecostarica-rgb/techrepair-pro-app`, permisos `admin/pull/push`. Render: acceso al workspace `Neo Wise's workspace` confirmado; `techrepairpro-core-1` figura no suspendido. **Esta ruta de lectura invoca una función Base44 directamente**; no hay llamada a Render en `listWorkOrders/entry.ts`, por lo que no atribuir el 500 a Render.

## Validación técnica del 20-nov (sin backend ni datos)
- Se actualizaron exclusivamente fixtures/aserciones de `scripts/verify-security-round2-contract.mjs`, `scripts/verify-multiuser-policy-pipeline-contract.mjs`, `scripts/verify-impersonation-session-hardening.mjs` para modelar el bloqueo de auditoría vigente y aceptar los patrones compilados de contexto/impersonación.
- Regresiones: `test:security-round2` **13/13 PASS**, `test:multiuser-policy-pipeline` **12/12 PASS**, `test:impersonation-session-hardening` **10/10 PASS**, `git diff --check` PASS. Son pruebas de código/mocks, no QA autenticado.
- P0-AUD-01 NO RESUELTO. El CAS/lease de organización no demuestra UNIQUE durable/ACID; `test:audit-concurrency-boundary` sigue en FAIL por mock sin `Organization`, no usarlo como garantía de auditoría.

## Próximo paso prioritario (diagnóstico no destructivo)
1. En sesión legítima Compu Store, repetir una sola consulta de `listWorkOrders`, capturar **status, response.error (sin tokens/PII), hora Costa Rica y request-id**; distinguir Preview de Prod.
2. Correlacionar con logs de `listWorkOrders` y comprobar versión runtime/entry servida. Si el servidor no registra errores, preparar instrumentación acotada sin datos sensibles, **con autorización específica antes de sincronizar función backend**.
3. Aislar si la excepción ocurre en resolución de identidad, lectura `OrdenTrabajo`, unión Cliente/Equipo o proyección; ejecutar una regresión aislada usando fixtures sintéticos.
4. Corregir causa demostrada, no relajar RLS, ni importar/duplicar 39 OTs; validar lectura con `ORG_ADMIN` y `SALES` en sus sucursales. No Publish nuevo ni E2E con datos reales sin aprobación.

**Restricciones preservadas:** sin cambios de roles, usuarios, OTs, clientes, inventario, cobros, funciones backend, infraestructura o publicación.
