# TRP — AUDITORÍA MAESTRA / START HERE
**ID:** TRP-AUDIT-2026-11-03
**Estado:** AUDITORÍA DE CÓDIGO EJECUTADA; CIERRE INTEGRAL BLOQUEADO (NO-GO general)
**Fecha de última consolidación:** 2026-11-03
**Aplicación Base44:** 695d708948469128f473d080
**Propósito:** Fuente de continuidad obligatoria para el siguiente equipo/agente; evitar repetir diagnósticos y no perder evidencias.

> Leer este archivo al retomar TRP. No declarar PASS de runtime a partir de pruebas de código. No ejecutar Publish, deploy, creación de clientes/cobros o cambios sobre datos reales sin autorización expresa. No reabrir correcciones comerciales COM-001..004 salvo regresión demostrada.

## Decisiones de Dirección General
- Secuencia comercial-first: CRM → cotizaciones/proformas → inventario → ventas/cobros → OT recepción-entrega.
- Beta privada condicionada a evidencia técnica y QA; no hay clientes reales en la fase descrita.
- Preservar roles, aislamiento de empresa/sucursal y Super Admin. GitHub como SOT por reconciliar; no suponer que un checkpoint Base44 equivale a un deployment.
- No crear entornos innecesarios: para QA usar el entorno de datos de prueba separado de Base44, con usuarios temporales, y no datos productivos.

## COM-QA-002 — Inventario SALES solo lectura, corrección de código (2026-11-03)
- Corregida inconsistencia de menú #15: SALES ya tenía `INVENTORY_READ` y backend `operationalGateway` permite su lectura con proyección redaccionada, pero `Inventario.jsx` PageGuard negaba SALES. Ahora lo admite **para consulta**, sin conceder INVENTORY_OPERATIONS, ni modificar RLS/backend.
- SALES consulta existencias y precios de venta de su sucursal; se ocultan costos, margen, valor de stock al costo y los modales/botones de edición, creación, categoría y ajuste. El DTO del gateway tampoco incluye `costo_unitario` ni `proveedor` para SALES. ORG_ADMIN conserva su vista administrativa. El backend sigue autorizando toda mutación.
- Tests `scripts/verify-com-qa-002-sales-inventory-readonly.mjs` PASS y `scripts/verify-commercial-menu-route-alignment.mjs` PASS (0 inconsistencias), inventario 22/22, navegación 8/8, identidad 7/7 y build PASS. PRE-checkpoint `6aea5f700450fb3c28c78b64`.
- Informe `docs/TRP-COM-QA-002-SALES-INVENTORY-READONLY-2026-11-03.md`. **No se ha hecho QA de navegador de Inventario SALES/OWNER, issue #15 debe seguir abierto.** E2E y P0-AUD-01 continúan NO-GO.

## COM-QA-001 — circuito comercial: contratos PASS, QA lectura pendiente (2026-11-03)
- Desde cierre visual SEC-020, se ejecutaron nuevamente contratos de código: flujo comercial 16/16, integridad comercial 12/12, inventario 22/22, ventas atómicas 28/28, CRM 8/8, navegación 8/8, build PASS. **No equivalen a QA runtime ni E2E**.
- Incidencia #15: SALES posee `INVENTORY_READ` y visualiza Inventario en menú, pero `PageGuard` de `src/pages/Inventario.jsx` no admite SALES. Riesgo de enlace visible que rechaza la navegación. Pendiente decisión de producto: vista estricta solo lectura para SALES o retirar enlace; no autoelevar permisos de edición. https://github.com/neowisecostarica-rgb/techrepair-pro-app/issues/15
- Nuevo test `scripts/verify-commercial-menu-route-alignment.mjs` PASS con única discrepancia conocida #15, 4 rutas × 6 roles; no se modificaron permisos ni datos. QA browser de CRM/Cotizaciones/Caja/Inventario con SALES y ORG_ADMIN todavía PENDIENTE.
- Guía `docs/TRP-COM-QA-001-COMMERCIAL-READONLY-2026-11-03.md`; E2E real y P0-AUD-01 continúan pendientes, **NO-GO general**.

## SEC-020 — CIERRE VISUAL DE PANELES SALES Y OWNER CONFIRMADO POR DIRECCIÓN GENERAL (2026-11-03)
- Dirección General informó expresamente **«ya funcionan los 2»** después del parche SEC-020, refiriéndose a los paneles SALES (`ventas@compustorecr.com`) y OWNER/ORG_ADMIN (`gustavo@compustorecr.com`) en Base44 Preview. Se registra como **PASS visual de apertura de ambos paneles, validado por usuario**.
- La causa de la pantalla blanca estaba confirmada por DevTools: `Cannot read properties of null (reading 'split')` en i18n invocado desde SidebarMenu. La corrección del manejo de claves nulas quedó en commit `a7afa0af874804e8367d074b16366d33b6649bdd`, checkpoint `6aea334ebebd14e65eecc39e`.
- **Alcance exacto:** carga de ambos paneles verificada por reporte de Dirección General; no se verificaron aún automáticamente ausencia de errores en consola, alternancia repetida SALES↔TECHNICIAN↔OWNER, CRM/cotizaciones/inventario/ventas E2E, ni aislamientos negativos. No inferir esos PASS.
- Incidente visual de pantalla blanca #14 puede cerrarse como solucionado para SALES/OWNER, dejando esos controles adicionales en backlog SEC-QA/comercial. **Release general sigue NO-GO** por P0-AUD-01 y E2E real pendiente.

## SEC-020 — CAUSA RAÍZ CONFIRMADA por DevTools: null i18nKey en SidebarMenu (2026-11-03)
- La consola aportada por Dirección General documenta `Uncaught TypeError: Cannot read properties of null (reading 'split')` en `src/i18n/index.jsx:49` llamado desde `SidebarMenu.jsx:78`, con error de React en `<SidebarMenu>`. Esto explica que el ErrorBoundary SEC-019 sí capturara el fallo.
- `src/config/menuConfig.js` define `i18nKey:null` para CRM y ColaRevision, mientras que SidebarMenu pasaba esa clave a `t()`, cuyo `get` ejecuta `path.split('.')`. Los roles con CRM (SALES y ORG_ADMIN, también BRANCH_ADMIN) disparaban el error; TECHNICIAN no. **Causa raíz de crash de render demostrada**, no problema de permisos ni iframe.
- Corrección mínima `SidebarMenu.jsx`: usar `item.i18nKey ? t(item.i18nKey,item.label) : item.label`. Nuevo test SSR real con Vite de **6 roles PASS**, incluidos SALES/ORG_ADMIN y conservación del no-acceso CRM TECHNICIAN. Navegación 8/8, identidad 7/7, CRM 8/8, SEC-019 y build PASS. SIN cambios de auth, usuarios, RLS, backend o datos.
- PRE checkpoint `6aea2f739aba4269bcf479a4` SHA `13caec90`. Informe `docs/TRP-SEC-020-SIDEBAR-NULL-I18N-ROOT-CAUSE-2026-11-03.md`. **QA navegador del candidato pendiente**; issue #14 sigue abierto hasta confirmar que SALES/OWNER ya cargan. P0-AUD-01 y E2E siguen NO-GO general.

## SEC-020 — Causa real identificada en consola: null.split() en SidebarMenu (2026-11-03)
- Dirección General aportó screenshot de DevTools del preview SALES: `Uncaught TypeError: Cannot read properties of null (reading 'split')` en `src/i18n/index.jsx:49`, con stack explícito `SidebarMenu.jsx:78`, `Layout.jsx` y `SEC-019 REACT_ROOT`. El fallo de render ocurre **en traducción de la navegación**, no se ha demostrado fallo de permisos, iframe o gateway. Warnings React Router v7 son irrelevantes.
- Corrección frontend: traductor `get` solo usa `.split` con clave string no vacía; SidebarMenu usa fallback de categoría cuando no hay i18nKey; GlobalSearch evita traducir los elementos con `i18nKey:null`. Sin cambios a roles, entidades ni backend.
- Pruebas: `scripts/verify-sec020-null-navigation-i18n.mjs` PASS (incluye ejecución del resolver contra null/undefined), navegación 8/8, i18n navegación 7/7, i18n foundation 8/8, seguridad identidad 7/7, build PASS. Checkpoint PRE `6aea31ddb060f1319c7752f9` / SHA `3883ca9c`.
- Informe `docs/TRP-SEC-020-SIDEBAR-NULL-I18N-CRASH-2026-11-03.md`. **QA browser SALES/OWNER aún PENDIENTE** y no declarar liberación; issue #14 abierto, P0-AUD-01 continúa NO-GO.

## SEC-019 — Pantalla completamente blanca con SALES tras SEC-018 (2026-11-03)
- Nueva captura de Dirección General: Base44 Preview en modo `ventas@compustorecr.com`, aplicación vacía sin spinner, sidebar ni texto SEC-017; Base44 muestra checkpoint SEC-018. NO demuestra que la incidencia se haya resuelto.
- Instrumentación de React a nivel raíz en `src/components/diagnostics/AppErrorBoundary.jsx`, montada desde `src/main.jsx` alrededor de I18n y App. Si hay excepción de render muestra `TRP no pudo mostrar la aplicación · SEC-019 · REACT_ROOT` y registra diagnóstico mínimo sin mensaje personal/tokens. No altera autorización ni datos, no hace Publish.
- Contratos PASS: `scripts/verify-sec019-root-error-boundary.mjs`, SEC-016/018, SEC-017, identidad 7/7, navegación 8/8, build. Checkpoint ANTES del cambio `6aea2c22bc3231fb009a4ac0` / SHA `b3749f43`.
- Si con nuevo candidato sigue completamente blanco y no aparece SEC-019, investigar errores JS previos al React root, cargas de chunk, redirect o retornos `null` en Layout/PageGuard; no atribuirlo automáticamente a crash del panel.
- Informe `docs/TRP-SEC-019-ROOT-BLANK-PREVIEW-2026-11-03.md`; issue #14 sigue ABIERTO; QA navegador y P0-AUD-01 NO-GO.

## SEC-018 — Eliminación de la doble consulta de organización previa al panel (2026-11-03)
- Hallazgo concreto: `identityGateway.buildContext` **ya devuelve** `organizations` autorizadas con `id/status`, pero `Layout` hacía una segunda `getIdentityOrganization` y bloqueaba con `Verificando estado de tu cuenta...`. Ese texto coincide con el video del usuario.
- Se eliminó **solo** la segunda consulta en `src/Layout.jsx`; `AuthContext` ahora guarda `authorizedOrganizations` de la respuesta canónica y la limpia ante cambio de usuario/error. Layout selecciona organización por `effectiveOrgId` y mantiene bloqueo fail-closed si no existe o estado inválido, además de `SuspendedScreen` para empresas suspendidas. No se cambió backend, RLS, roles ni usuarios.
- El test `scripts/verify-sec016-native-session-switch.mjs` se actualizó para validar SEC-018 en lugar de exigir el antiguo query `org-status`. Contratos PASS: SEC-016/018, SEC-017, sesión 10/10, identidad 7/7, navegación 8/8, CRM 8/8, build.
- **Importante:** la duplicación del gate estaba demostrada en código, pero **no se ha confirmado todavía en navegador** que ésta sea la única causa de fallo. Documento `docs/TRP-SEC-018-CANONICAL-ORGANIZATION-CONTEXT-2026-11-03.md`. Checkpoint previo `6aea2842cd1479edcf3ca090`. Issue #14 continúa abierto; E2E y P0-AUD-01 NO-GO.

## SEC-017 — Persisten los paneles SALES/OWNER sin mostrar (2026-11-03)
- Dirección General confirmó que tras SEC-016 **sigue igual**; SALES y OWNER/ORG_ADMIN no muestran panel. Por tanto la corrección de SEC-016 es solo código PASS y **NO resuelve el incidente funcional**.
- Los logs consultados de identityGateway muestran múltiples POST HTTP 200 (18:13–18:15 UTC) sin error detallado; no demuestran que `getOrganization` o paneles terminen correctamente. `MiDia` distingue MiDiaSales/MiDiaAdmin/MiDiaTech; `Verificando estado de tu cuenta...` corresponde a `Layout` ANTES de MiDia.
- Se agregó `MiDiaErrorBoundary.jsx` y wrapper por usuario/rol en `src/pages/MiDia.jsx`, para evitar pantalla completamente blanca si un panel arroja excepción de React; caso visible `No se pudo mostrar el panel · SEC-017`. No evade PageGuard ni modifica backend/permisos.
- Contratos PASS: SEC-017, SEC-016, navegación 8/8, CRM 8/8, build. Inspección read-only en COMPU STORE confirmó 16 ventas y 5 cotizaciones, totales numéricos en registros inspeccionados. **QA del navegador pendiente; diagnóstico de causa exacta NO VERIFICADO**.
- Guía de discriminación: si permanece spinner `Verificando estado...` revisar `Layout/getIdentityOrganization`; si aparece boundary SEC-017 revisar consola `[TRP SEC-017]`; si pantalla totalmente blanca, error React superior. Informe `docs/TRP-SEC-017-MIDIA-ROLE-PANEL-DIAGNOSTICS-2026-11-03.md`; checkpoint previo `6aea25a0c5356076bd88dbd3`. No declarar GO.

## SEC-016 — Cambio de usuario nativo Base44: corrección de aislamiento frontend (2026-11-03)
- Video de Dirección General (50 s): SALES muestra `Verificando estado de tu cuenta...` y termina con pantalla vacía al alternar SALES → TECHNICIAN → SALES. TECHNICIAN sí carga. Este texto proviene de la consulta `getIdentityOrganization` en `Layout.jsx`, no del spinner inicial de AuthContext.
- Defecto verificable: la clave React Query `['org-status', effectiveOrgId]` permitía reutilizar cache entre usuarios distintos de la misma empresa; `loadAuthData()` también conservaba temporalmente identidad/autorización anterior mientras recargaba. La corrección separa la clave por `user.id`, organización y rol, habilita la consulta solo tras identidad autorizada y limpia el contexto previo antes de cargar el nuevo.
- Archivos: `src/components/contexts/AuthContext.jsx`, `src/Layout.jsx`; prueba permanente `scripts/verify-sec016-native-session-switch.mjs`. **No** se modificaron roles, membresías, RLS ni funciones backend.
- PRE-FIX checkpoint `6aea22bc8d5d03273ba07f6f` (SHA `bf425dfb59ea747c362f531da0136e35d8515403`). Contratos PASS: SEC-016, impersonación 10/10, identidad 7/7, navegación 8/8, CRM 8/8, Vite build.
- Informe `docs/TRP-SEC-016-NATIVE-USER-SWITCH-QA-2026-11-03.md`. **QA navegador de SALES → TECHNICIAN → SALES pendiente**, sin evidencia de que desapareciera el fallo; no declarar SEC-016 PASS funcional ni GO general. Si persiste, revisar Network y consola de `getOrganization` sin PII.

## SEC-015 — QA con cuentas existentes, elegibilidad confirmada (2026-11-03)
- Dirección General autorizó considerar `ventas@compustorecr.com` y `gustavo@compustorecr.com`. Consulta read-only a Base44 confirmó que ambas tienen `User.id` idéntico a `UserAccount.user_id` y membresías activas en COMPU STORE COSTA RICA (`Organization.status=active`). SALES tiene sucursal TRES RÍOS activa. La primera es `SALES` nativo Base44 `user`; la segunda es `ORG_ADMIN`, nativo Base44 `admin` pero `is_super_admin=false` (NO SUPER_ADMIN SaaS).
- **Corrección de evidencia anterior:** el filtro `user_id:{$exists:true}` usado previamente devolvió 0, pero la búsqueda por email muestra `user_id` efectivamente persistido para ambos usuarios. No realizar backfill ni afirmar ausencia de IDs a partir del resultado del filtro.
- Selección QA: `ventas@compustorecr.com` para acceso comercial **solo lectura**, `gustavo@compustorecr.com` para contraste ORG_ADMIN. Son cuentas reales asociadas a empresa existente: no crear leads, ventas, cotizaciones, cobros, inventario ni permisos en COMPU STORE para probar.
- Identidades y relaciones válidas verificadas; **QA de navegador AÚN PENDIENTE** porque no se ha abierto una sesión autenticada de ninguna cuenta. El Testing Agent sigue usando su propio usuario temporal; no reemplaza estas identidades. E2E transaccional requiere datos aislados.
- Handoff `docs/TRP-SEC-015-EXISTING-SALES-QA-2026-11-03.md`; GitHub issue #12 sigue abierto hasta QA con evidencias.

## SEC-014 — alternativa QA con usuario estable provisionado (2026-11-03)
- Base44 ofrece `POST /users/provisions` para provisionar usuario por correo controlado, y `POST /embed-url` para acceso con token de un solo uso al `live_preview`. No se ha demostrado que Testing Agent pueda usar la misma identidad embebida; su propio flujo inicia usuario temporal.
- `GET /remix/requirements` confirma app tipo user_app con backend y sin secretos declarados. Un remix crearía otra app; no se hizo por preferencia de evitar entornos adicionales. Una rama Base44 es rama de código, **no** prueba de separación de datos.
- **Bloqueo para acción:** se requiere correo QA bajo control del usuario y sesión de navegador compatible, y luego verificar ID nativo `auth.me()` antes de crear membresía. No crear correo inventado ni roles por email. No se aprovisionaron usuarios ni se generaron tokens ni cambiaron datos.
- Procedimiento seguro: `docs/TRP-SEC-014-STABLE-QA-IDENTITY-PROVISIONING-2026-11-03.md`; issue #12 sigue abierto; SEC-QA/E2E no están aprobados. P0-AUD-01 sigue NO-GO.

## P0-AUD-01 — diseño transaccional auditado (2026-11-03)
- El writer actual sigue sin ser atómico: `npm run test:audit-concurrency-boundary` reproduce 2 registros para la misma clave concurrente. Esta prueba PASS **confirma el defecto**.
- Base44 documenta que `POST entities/upsert` no impide duplicados si corren dos solicitudes simultáneas; no sirve como solución. Se consultaron conectores externos de TRP: **0 configurados**.
- Se preparó **ADR de arquitectura** `docs/TRP-P0-AUD-01-ATOMIC-LEDGER-ADR-2026-11-03.md`, esquema SQL solo ilustrativo `docs/architecture/TRP-P0-AUD-01-POSTGRES-LEDGER-CANDIDATE.sql` y prueba de modelo local `scripts/verify-p0-aud-01-atomic-ledger-model.py`.
- **MODELO PASS exclusivamente:** SQLite con restricción UNIQUE, 8 writers concurrentes → exactamente una fila, reintento idempotente, aislamiento por tenant y colisión incompatible bloqueada. No se ha desplegado PostgreSQL ni ninguna conexión; este PASS no autoriza beta ni GO.
- Issue #13 actualizado: https://github.com/neowisecostarica-rgb/techrepair-pro-app/issues/13. Continúa **OPEN/P0/NO-GO**. Se requiere aprobar proveedor/infraestructura y probar la primitiva atómica **en runtime real**, fail-closed, reconciliación de auditoría y efectos de negocio.

## SEC-013 — Identidad de QA aislada: capacidades Base44 y seguimiento formal (2026-11-03)
- GitHub **issue #12** abierto: `https://github.com/neowisecostarica-rgb/techrepair-pro-app/issues/12` — proveer identidad QA estable y membresía canónica en dataset aislado para ejecutar SEC-QA y E2E. Documentación `docs/TRP-SEC-013-QA-IDENTITY-GATE-2026-11-03.md`.
- Se verificó contrato oficial Testing Agent: test define `name/goal/role`; ejecución `flow_id` y URL opcional. **No admite asignar directamente `user_id`, ni pasar membresía de QA**. El usuario es temporal, y la última prueba llegó a onboarding porque no tenía organización. Un cambio de rol seleccionado para Testing Agent no crea una membresía canónica en TRP.
- No se ejecutó seed automático porque puede copiar datos y PII de producción al dataset de pruebas y no crea garantía de vínculo entre usuario temporal y UserAccount. No se alteraron miembros ni organizaciones productivas, ni se publicó la app. El bloqueo de QA navegador real está **confirmado**, no resuelto; mantener SEC-QA y E2E en PENDIENTE.
- GitHub **issue #13** abierto: `https://github.com/neowisecostarica-rgb/techrepair-pro-app/issues/13` — cierre independiente de P0-AUD-01, requiere atomicidad persistente y prueba concurrente en runtime. **NO-GO general**.
- Próxima dependencia: obtener método soportado por Base44 para sesión estable de QA en datos aislados o usuario real QA controlado dentro de un entorno separado, sin alterar producción; luego ejecutar pruebas de roles y flujo E2E, documentar evidencias.

## SEC-012 — QA simulado de membresías y alineación de roles CRM (2026-11-03)
- Dirección General autorizó ejecutar los pendientes para beta privada. Se preparó un harness **in-memory**, `scripts/verify-sec012-isolated-membership-fixtures.mjs`, con 6 escenarios PASS de SALES, tenant/sucursal, ID canónico, invitaciones y denegación CUSTOMER_SERVICE. No representa QA real de navegador ni fue necesario crear organizaciones/usuarios/datos productivos.
- Se detectó que 26 copias de `roleCapabilities.ts` otorgaban `CRM_OPERATIONS` a CUSTOMER_SERVICE, contrario al `PageGuard` de CRM y `crmGateway` (ORG_ADMIN/BRANCH_ADMIN/SALES). Se eliminó únicamente esa capacidad de CUSTOMER_SERVICE en las 26 copias, manteniendo SALES. Checkpoint previo `6aea0e0a68cc2e37a54134c1`. Se corrigieron aserciones de navegación obsoletas y se amplió el test de fixtures para vigilar los 26 presets, backend y guard.
- PASS: 6/6 fixtures simulados; 8/8 navegación; 12/12 policy pipeline; 6/6 aprovisionamiento; 7/7 identidad; 8/8 CRM; 9 grupos autorización; 13/13 seguridad round2; 16/16 commercial-flow; build.
- **Bloqueo real:** Testing Agent crea usuarios temporales que no tienen membresía válida en `UserAccount`. Su seed automático puede copiar registros live a test-data, incluidos datos personales, y no garantiza vínculo testUserId↔UserAccount. No se ejecutó seed ni se modificaron datos operativos; **SEC-QA real y E2E transaccional siguen PENDIENTES**. Necesitamos fixtures dev verificables o un usuario QA aislado con identidad y organización explícitas, sin modificar usuarios productivos.
- Informe: `docs/TRP-SEC-012-SALES-QA-FIXTURES-PLAN-2026-11-03.md`. Mantener P0-AUD-01 NO-GO y no declarar release PASS.

## SEC-011 — corrección aditiva de UserAccount.user_id (2026-11-03)
- Diagnóstico directo Base44: el filtro por `UserAccount.user_id` devolvía error `Unknown field "user_id" in the filter`, mientras que el filtro por `user_email` respondía correctamente. `loadCanonicalMemberships` consulta `user_id`: defecto de esquema real y ruta plausible al HTTP 400 previo.
- Checkpoint previo `6aea0a97a6073aa1f2dc549c` (commit `0a609235027088e3e51e8dc1a4da91e9cf972739`). Se agregó **solo** `properties.user_id` tipo string opcional a `base44/entities/UserAccount.jsonc`, sin cambiar RLS ni required. Esquema confirmado por Base44 y consulta directa por ID sintético ahora devuelve lista vacía **sin HTTP 400**.
- Contratos PASS: SDK (29 copias/58 llamadas), identidad 7/7, impersonación 10/10, CRM 8/8, autorización 9 grupos, flujo comercial 16/16, build PASS.
- Nueva prueba SALES `6aea0ad9f6c9bb351729f8f7` contra SHA `c3c34a8b878b756eb931479855535cb3b452bdd2` iniciada, **FAILED / goal_accomplished=false**, sin `failure_reason` de plataforma: la sesión pasó a onboarding `Configura tu organización`, sin error de identidad visible, pero el usuario temporal carecía de membresía organizacional y no pudo abrir CRM. No hubo alta de empresa ni cambios de datos. **La indisponibilidad anterior dejó de reproducirse, pero CRM/SEC-QA siguen sin PASS.**
- No se migraron registros históricos ni se asignaron membresías. Inspección read-only de `UserAccount` confirmó al menos 1 membresía activa y 0 registros encontrados por `user_id: {$exists:true}` en la consulta disponible; no se inspeccionaron PII ni se vincularon identidades. Es distinto del dataset de Testing Agent; no confundir ambos. Antes de marcar multiempresa PASS se requieren fixtures de usuario/sucursal/membresía válidos y controlados.
- Se añadió contrato persistente `scripts/verify-useraccount-schema-contract.mjs` (PASS) para impedir la regresión del esquema y conservar RLS fail-closed. SEC-011 queda **corregido a nivel de esquema**, pendiente de QA con identidad SALES configurada. Documento `docs/TRP-SEC-011-USERACCOUNT-SCHEMA-FIX-2026-11-03.md` actualizado.
- Documento técnico `docs/TRP-SEC-011-USERACCOUNT-SCHEMA-FIX-2026-11-03.md`. P0-AUD-01 permanece NO-GO.

## SEC-010 — expediente técnico Base44 preparado (2026-11-03)
- Se revisó la definición `User.jsonc`, el cliente que invoca `identityGateway` y el informe final de Testing Agent `6aea023165a7bd96801de1e6`: `goal_not_accomplished` e `issues=[]`; el usuario SALES siguió sin entrar al CRM. Esto no equivale a demostrar que el CRM sea defectuoso.
- Se creó el expediente `docs/TRP-SEC-010-BASE44-SUPPORT-CASE-2026-11-03.md` con evidencias de ejecuciones, versiones, rollback, cinco preguntas para soporte y criterios de cierre, sin PII. **No se envió a Base44 ni se abrió ticket**.
- Falta identificar exactamente qué operación de `CONTEXT_BUILD` devuelve 400; no hay nueva prueba que justifique otro redeploy o repetición de SALES. Se mantiene estado NO-GO y P0-AUD-01 independiente.

## SEC-009 — SDK backend y cuentas temporales del Testing Agent (2026-11-03)
- `identityGateway/entry.ts` importa `npm:@base44/sdk@0.8.41`. Se obtuvo este paquete en `/tmp` y se verificó su implementación: `filter(query, sort, limit, skip, fields)`; la firma corregida usada por SEC-003/004 es válida tanto para SDK 0.8.41 como para 0.8.57. La divergencia de versión por sí misma **NO explica el HTTP 400**.
- Base44 documenta que `GET entities/User` omite cuentas temporales del Testing Agent. En `buildContext`, la primera operación es `User.filter({id:user.id}, '-created_date', 1)` y, si no encuentra registro, usa `auth.me()`. Se abre hipótesis **NO CONFIRMADA** sobre compatibilidad del usuario temporal con esa consulta; una lista vacía no explica por sí sola un HTTP 400.
- Se intentó una consulta read-only con ID sintético inexistente y `fields=id`; Base44 respondió `auth_required` porque la aplicación es privada. No se accedió a información real ni se modificaron datos; **ningún resultado funcional concluyente**.
- Siguiente paso: trazas por request ID o soporte Base44 para identificar la operación de CONTEXT_BUILD que responde 400; no repetir redeploy ni SALES sin nueva evidencia. Documento `docs/TRP-SEC-009-SDK-TEST-USER-2026-11-03.md`. P0-AUD-01 sigue NO-GO.

## SEC-008 — sincronización autorizada y verificación runtime (2026-11-03)
- Dirección General autorizó continuar con la sincronización puntual de `identityGateway`.
- Checkpoint **previo** para restauración: `6aea020265e3a5041801b2f2`, commit `bceb4ad857e2d3469d19ce1d29f0b3e5efae3d0f`.
- Se envió exclusivamente el contenido completo de `base44/functions/identityGateway/entry.ts` (42.110 caracteres, con `contextStep`) a Base44 `POST /coding/redeploy-function/identityGateway`. La respuesta de esa API se truncó, **sin confirmación directa de compilador o versión del servicio**.
- Después, Base44 reportó estado `ready` y commit `579e9ed003017518940b04ebde739bb8cc0f4b9f` (Git: `Manual code change`); esto demuestra persistencia de cambio en app/editor, pero todavía no demuestra que el runtime esté libre del HTTP 400.
- Nuevo Testing Agent SALES: ejecución **`6aea023165a7bd96801de1e6`**, disparada contra SHA `579e9ed003017518940b04ebde739bb8cc0f4b9f`; **FAILED / platform / goal_accomplished=false** en resultado final: CRM no abrió y persistió `Valid session · Identity service unavailable` tras Retry. **NO declarar PASS**. Logs consultados tras la sincronización no mostraron marcadores `context-step` nuevos. No lanzar más sincronizaciones indiscriminadas; solicitar observabilidad del despliegue/ruteo del backend y de la consulta HTTP 400.
- No se hizo Publish del frontend ni mutación de datos comerciales. P0-AUD-01 permanece NO-GO.

## Actualización SEC-007 — diagnóstico por etapas de identityGateway (2026-11-03)
- El intento SALES `6ae9fb462d67eca79f243657` terminó **FAILED / platform**; el acceso siguió bloqueado tras tres reintentos. Se volvió a observar `identityGateway / CONTEXT_BUILD / HTTP 400` en registros a las 15:19 UTC.
- Para evitar más conjeturas, se instrumentó `base44/functions/identityGateway/entry.ts` con `contextStep`: emite únicamente un identificador de etapa fijo y estatus HTTP cuando falla; luego relanza error sin conceder acceso. Etapas: LOAD_BACKEND_USER, RESOLVE_IDENTITY, PERSIST_ADMIN_FLAG, REPAIR_IDENTITY_FLAGS, RESOLVE_REPAIRED_IDENTITY, LOAD_ORGANIZATIONS, RESOLVE_ENTITLEMENT. No registra datos personales.
- Regresiones tras el cambio: contrato SDK PASS, identidad 7/7, impersonación 10/10, CRM 8/8, autorización 9 grupos y build PASS. Se actualizó el test estático para reconocer la misma lectura autoritativa envuelta por diagnóstico.
- Se inició retest SALES **`6aea004fab91e361e9cde919`** contra SHA `53272033893ab9fdba9cb94e45a018e381c3a574`, **FAILED / platform / goal_accomplished=false**. El usuario de prueba no pudo abrir CRM, incluso tras dos reintentos. Logs de identityGateway a las 15:41:01, 15:41:03, 15:41:11 y 15:41:16 UTC: `CONTEXT_BUILD / HTTP 400`, sin ningún marcador `identityGateway:context-step` en los registros consultados. Esto es consistente con backend no sincronizado o trazas incompletas, no prueba suficiente de versión activa. **No ejecutar otra prueba SALES idéntica hasta reconciliar la función.** Mantener SEC-007 NO VERIFICADO / NO-GO.
- Informe: `docs/TRP-SEC-007-IDENTITY-CONTEXT-STAGES-2026-11-03.md`. P0-AUD-01 sigue NO-GO.

## Actualización SEC-006 — handoff permanente para programadores (2026-11-03)
- **Entrada obligatoria creada en la raíz:** `AGENTS.md`. Identifica aplicación/repositorio, estado NO-GO, secuencia comercial-first, evidencias existentes, comandos de regresión, gates SEC/E2E y riesgos de Base44. Antes de una nueva auditoría leer esta guía y los informes enlazados.
- `README.md` y `docs/README.md` contienen enlaces prominentes a `AGENTS.md` y a este estado maestro. Se mantuvo la documentación dentro del repositorio conectado `neowisecostarica-rgb/techrepair-pro-app`, además de los checkpoints de Base44.
- Importante: el sandbox remoto de Base44 puede sincronizar cambios de archivos backend automáticamente; **no se debe inferir que editar sin Publish carece de efectos en runtime de preview**. La publicación y la sincronización de recursos backend son conceptos diferentes; ninguna prueba de frontend acredita la versión backend sin verificarla.
- Nueva ejecución de Testing Agent SALES **`6ae9fb462d67eca79f243657`**, iniciada contra commit `34cf2b66e5f0d845a0f3d96bedf6d368d5b2bba1`, último estado consultado **PENDING**. Obtener veredicto final y logs antes de actualizar SEC-003. No declarar PASS antes de la respuesta final.
- Ninguna transacción de ventas, cambios de stock ni Publish fue solicitada en esta intervención; no se invocó despliegue manual.

## Actualización SEC-004 — normalización global del SDK (2026-11-03)
**Código corregido; runtime aún NO VERIFICADO.** Se detectaron 56 llamadas a filtros de membresía con el límite 100 colocado en el segundo parámetro (sort) en 28 archivos de autorización adicionales. Se cambió solo la firma a `filter(query, '-created_date', 100)` en esos 28 archivos. El contrato `scripts/verify-identity-filter-sdk-contract.mjs` ahora verifica 29 copias y 58 llamadas corregidas. Las pruebas de identidad, CRM, autorización, cotizaciones, inventario y ventas, impersonación y Super Admin y el build pasaron. No hubo Publish/redeploy; QA de navegador sigue pendiente de un runtime que sirva las correcciones. Referencia: `docs/TRP-SEC-004-SDK-AUTH-COPIES-AUDIT-2026-11-03.md`. P0-AUD-01 sigue NO-GO.

## Actualización SEC-005 — reconciliación GitHub / runtime (2026-11-03)
- Repositorio **conectado oficialmente** en Base44: `neowisecostarica-rgb/techrepair-pro-app` (conexión activa, webhook activo).
- La corrección SEC-004 se encuentra en GitHub SHA `628f101859e65fd0dee24c854c8200893e978ec8`.
- GitHub y sandbox de Base44 alcanzaron SHA posterior `b6690e119c1cdbc115840811fade1cad20bf9c0e` — único cambio adicional frente a 628f1018: archivo de documentación `docs/TRP-SEC-005-RUNTIME-RECONCILIATION-2026-11-03.md`; **sin diferencias de código** en esa comparación. Esta reconciliación es de *fuente*, no de funciones desplegadas.
- Base44 agent-profile: SPA Vite, runtime backend actual, backend functions habilitadas; preview sandbox disponible. El endpoint `GET backend-functions` devuelve respuesta truncada y no permite verificar SHA/hash del código que realmente atiende `identityGateway`.
- SEC-003/004 **NO CERRADO en navegador**; última prueba SALES falló en `CONTEXT_BUILD` HTTP 400. No hubo redeploy y no se debe inferir que la fuente corregida esté activa en runtime.
- Documento detallado: `docs/TRP-SEC-005-RUNTIME-RECONCILIATION-2026-11-03.md`.

## Estado verificable por bloque
| ID | Estado | Evidencia y condición pendiente |
|---|---|---|
| COM-001 CRM | Corrección de UI guardada, QA NO VERIFICADO | Restricción UI alineada a crmGateway roles ORG_ADMIN, BRANCH_ADMIN, SALES. Ver checkpoint previo. |
| COM-002 Cotizaciones | Correcciones guardadas, QA NO VERIFICADO | Se retiró reenvío de estado inválido; edición conserva OT. |
| COM-003 Inventario | Correcciones guardadas, QA NO VERIFICADO | Conserva reorder=0; confirma success del backend. |
| COM-004 Ventas/cobros | Corrección guardada, QA NO VERIFICADO | POS conserva sucursal de cotización/OT. Backend sigue autorizando. |
| SEC-001 roles/aislamiento | Contratos de código PASS, QA de sesiones NO VERIFICADO | Matriz detallada en docs/TRP-SEC-001-E2E-001-QA-MATRIX-2026-11-03.md. |
| SEC-003/004 identidad y SDK | **Código CORREGIDO** en gateway y copias, runtime NO VERIFICADO | Falla SALES previa: identityGateway CONTEXT_BUILD HTTP 400. SDK .filter(query, sort, limit) recibía .filter(query, 1/100), enviando sort numérico inválido. Se normalizaron llamadas de identityGateway y userAuthorization. Nuevo contrato scripts/verify-identity-filter-sdk-contract.mjs PASS. Checkpoint de corrección 6ae9ef214cc85330a89e38f0. |
| P0-AUD-01 auditoría concurrente | **BLOQUEADO / NO-GO** | scripts/verify-audit-concurrency-boundary.mjs reproduce dos AuditEvent para la misma clave concurrente. Base44 upsert beta no garantiza atomicidad y puede duplicar en concurrencia. Se requiere primitiva persistente única y prueba real. |
| SEC-QA multirol | En preparación, no aprobado | Testing Agent con flujos descritos abajo, pruebas funcionales sin veredicto PASS. |
| E2E-001 circuito comercial | Contratos PASS, transacción E2E NO VERIFICADA | Se preparó flujo de inspección solo lectura. Transacciones únicamente con datos de prueba cuando roles funcionen. |
| ADM-001 Super Admin | Contratos PASS, navegador NO VERIFICADO | Hay flujo preparado. |
| OT-001 recepción-entrega | PENDIENTE tras circuito comercial | No confundir con COM. |

## Diagnóstico SEC-003: qué se hizo
- Ejecución original de Testing Agent SALES 6ae9ea17c06b0cd8717dd21c: FAILED / failure_reason=platform / goal_accomplished=false. Identidad mostró 'Valid session · Identity service unavailable'.
- Logs identityGateway en 2026-11-03 14:08 UTC: CONTEXT_BUILD, IDENTITY_GATEWAY_CONTEXT_BUILD_FAILED, HTTP 400; target preview-sandbox.
- Inspección en node_modules/@base44/sdk/dist/modules/entities.js: segundo argumento de filter es sort, tercero limit. Se reprodujo en nuevo test; .filter({id},1) genera params.sort=1 sin params.limit; .filter({id}, '-created_date',1) genera sort/limit válidos.
- Candidato corrige filtros de User, Organization, UserAccount y otras consultas del mismo identityGateway. No cambia las reglas de autorización ni otorga fallback si falla el backend.
- Pruebas del candidato: verify-identity-filter-sdk-contract PASS; identity-tenant-security 7/7; impersonation-session-hardening 10/10; operational-authorization 9 grupos; superadmin-lifecycle 5/5; build PASS; git diff --check PASS.
- **No se comprobó aún que preview sirva la nueva implementación backend.** Retest SALES execution 6ae9ef2fad726c60d1c127bf **FAILED / failure_reason=platform / goal_accomplished=false**. Volvió a aparecer 'Valid session · Identity service unavailable'. Logs de identityGateway registrados 2026-11-03 14:28:24Z, 14:28:30Z y 14:28:39Z: CONTEXT_BUILD HTTP 400. El candidato compila, pero el runtime ejecutado aún falla. **NO afirmar resuelta SEC-003**. Debe verificarse la implementación backend efectivamente desplegada en preview, diagnosticar la operación 400 y repetir test.

## P0-AUD-01: qué falta para cierre
- Ubicación: base44/functions/_shared/auditEvent.ts, función appendAuditEvent: filter → create sin transacción. Esta secuencia permite carrera aunque se reconcilie al fallar.
- AuditEvent.jsonc tiene RLS denegado a cliente, pero **ninguna unique constraint visible** para (organization_id, audit_operation_id).
- El API upsert Base44 beta reconoce que llamadas simultáneas pueden crear dos registros; NO utilizarlo para afirmar exactly-once.
- **GATE:** soporte de Base44 o solución de almacenamiento transaccional aprobada; implementación con writer canónico, control de errores/reintentos, prueba concurrente real demostrando exactamente un registro para la misma operación, aislamiento entre organizaciones y persistencia ante reintentos/crashes. Hasta entonces NO-GO general.
- Evitar mutex local, check-then-create y retardo arbitrario: no son garantías entre instancias.

## Testing Agent — flujos existentes y estado
- SEC-QA-03 SALES CRM: flow 6ae9e9f78f0299c74d0fdc48; ejecución original FAIL plataforma (6ae9ea17c06b0cd8717dd21c); retest 6ae9ef2fad726c60d1c127bf FAILED plataforma; identidad vuelve a fallar. La ejecución quedó archivada sin modificar datos.
- SEC-QA-05 CUSTOMER_SERVICE CRM denegado: flow 6ae9ea09d84de077deb6d822 — no ejecutado.
- SEC-QA-07 SUPER_ADMIN consola: flow 6ae9ea1075e8169fbbbcbf64 — no ejecutado.
- SEC-QA-02 BRANCH_ADMIN: flow 6ae9ef6dad726c60d1c1283f — preparado, no ejecutado.
- SEC-QA-04 INVENTORY: flow 6ae9ef6f4b0233f418893f68 — preparado, no ejecutado.
- E2E-001 inspección de navegación comercial (no transaccional): flow 6ae9ef74951e6336118fee6b — preparado, no ejecutado.
- No confundir estos flujos de inspección con el E2E transaccional de venta/aprobación/cobro. Para ese E2E aún se requieren fixtures y aislamiento verificados.

## Contratos comerciales regresados tras corrección de identidad
- multiuser-audit 7/7 PASS.
- commercial-flow 16/16 PASS.
- commercial-integrity 12/12 PASS.
- atomic-sale 28/28 PASS.
- inventory-integrity 22/22 PASS.
- security-integrity 7/7 PASS.
- security-round2 13/13 PASS.
- audit-concurrency-boundary 1/1 prueba de **reproducción del fallo**, no aprobación.

## Próximas 4 acciones por prioridad
1. **SEC-003:** reconciliar backend servido en preview (retest 6ae9ef2fad726c60d1c127bf FAILED, HTTP 400 en CONTEXT_BUILD) contra el candidato corregido. No está probado que el servidor haya incorporado el código corregido; no hacer redeploy de producción sin autorización. Si falla por cuenta QA sin membresía, clasificarlo como fixture/QA, no como error de CRM.
2. **SEC-QA:** ejecutar y documentar accesos de SALES, CUSTOMER_SERVICE, SUPER_ADMIN, BRANCH_ADMIN e INVENTORY, luego roles restantes y cruce empresa/sucursal. Requiere identidad estable.
3. **E2E-001:** ejecutar recorrido de lectura y después recorrido con fixtures dev: Lead → Cliente → Cotización → Aprobación → Stock → Venta → Cobro → Comprobante, probando reintentos y auditoría.
4. **P0-AUD-01:** obtener mecanismo atómico de Base44/alternativa aprobada y probar concurrencia real. Sin esto no cerrar NO-GO general.

## Condiciones de dictamen final
**GO beta privada** solo si el alcance piloto y el riesgo residual están expresamente aprobados, autenticación y roles verificados, E2E funcional documentado y P0 crítico resuelto o formalmente mitigado con un gate explícito aceptable. **GO general** requiere cierre de P0-AUD-01 y QA final en runtime. No inventar evidencias ni sobrescribir estos estados.

## Referencias internas
- docs/TRP-SEC-001-CHECKPOINT-2026-11-03.md
- docs/TRP-SEC-001-E2E-001-QA-MATRIX-2026-11-03.md
- docs/TRP-SEC-002-TESTING-AGENT-CHECKPOINT-2026-11-03.md
- docs/TRP-SEC-003-IDENTITY-TESTING-AGENT-2026-11-03.md
- docs/TRP-MASTER-EXECUTION-PLAN-2026-09-16.md (roadmap histórico; esta auditoría posterior actualiza el estado de validación)
