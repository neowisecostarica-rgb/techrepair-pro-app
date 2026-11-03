# TRP-SEC-012 — Plan verificable para fixtures SALES y recuperación de membresías legacy
Fecha 2026-11-03 | Estado: QA SIMULADO 6/6 PASS, POLÍTICA CRM ALINEADA, QA NAVEGADOR PENDIENTE; sin mutaciones de datos

## Punto de partida comprobado
- SEC-011 agregó UserAccount.user_id opcional; filtro directo por ese campo en Base44 ahora funciona sin HTTP 400 y test SDK/seguridad PASS.
- Testing Agent SALES `6aea0ad9f6c9bb351729f8f7` (commit c3c34a8b878b756eb931479855535cb3b452bdd2) terminó FAILED con goal_accomplished=false y failure_reason=null: navegó a `Configura tu organización` sin error de identidad. No entró a CRM ni creó una organización.
- Inspección read-only de UserAccount (solamente campo id, limit 1): al menos un registro, al menos una membresía active. Consulta por user_id {$exists:true} devolvió 0. No se accedió a emails ni se modificaron registros.
- En `identityGateway/_shared/userAuthorization.ts`, una membresía activa exige explícitamente account.user_id === user.id y status === 'active'. Por lo tanto un UserAccount legacy sin user_id no concede acceso (fail closed), incluso cuando coincide el email. Es correcto mantener este control, no bypass.
- `resolveAuthorizedContext` también exige organización activa y sucursal activa para rol SINGLE_BRANCH. Una membresía aislada sin sucursal funcional no satisface el circuito de SALES.

## Ejecución técnica de SEC-012 — evidencia
- Se creó `scripts/verify-sec012-isolated-membership-fixtures.mjs` (fixtures exclusivamente en memoria, sin recursos Base44). Se ejecutaron 6 escenarios: SALES válido en org A/sucursal A, cruce org B denegado, ID distinto con mismo correo denegado, invitación sin activar denegada, CUSTOMER_SERVICE sin privilegios SALES, y contrato SDK de filtros válido. **6/6 PASS simulados**, no equivalentes a prueba de navegador.
- Se descubrió inconsistencia: `CUSTOMER_SERVICE` tenía `CRM_OPERATIONS` en 26 copias `roleCapabilities.ts`, mientras que `src/pages/CRM.jsx` y `crmGateway/entry.ts` autorizan solo ORG_ADMIN, BRANCH_ADMIN y SALES. Se retiró únicamente `CRM_OPERATIONS` del preset CUSTOMER_SERVICE en esas 26 copias. SALES conserva la capacidad. Checkpoint previo: `6aea0e0a68cc2e37a54134c1`.
- `scripts/verify-sec012-isolated-membership-fixtures.mjs` ahora comprueba 26 políticas sincronizadas más el PageGuard y el backend CRM. `scripts/verify-multiuser-navigation-contract.mjs` corrigió dos aserciones obsoletas: MiDia se muestra a SALES por SALE_OPERATIONS (sin TECHNICAL_WORK), y CRM no se muestra a CUSTOMER_SERVICE con el preset corregido. No se añadieron privilegios ni reglas de bypass.
- Regresiones PASS: 6/6 fixtures, 8/8 navegación, 12/12 policy pipeline, 6/6 aprovisionamiento, 7/7 seguridad identidad, 8/8 CRM, 9 grupos autorización operacional, 13/13 seguridad round2, 16/16 commercial-flow y build. Los controles de UI reales siguen pendientes.
- No se ejecutó `testing-agent/data/seed`: su API documenta que puede copiar hasta 5 registros productivos por entidad, incluyendo datos personales, al test-data. No está demostrada una manera segura de ligar el usuario efímero del Testing Agent con `UserAccount.user_id`. Evitar sembrado indiscriminado para no crear falsa autorización o copiar PII.
- Resultado: código y simulación PASS; **NO declarar SEC-QA/E2E PASS**, ni modificar registros de organización, sucursal o membresía para hacer pasar el navegador.

## Estrategia segura de QA
1. Establecer si Testing Agent puede operar con identidad temporal ligada a membresía persistente en su *test-data*; solicitar capacidad documentada al proveedor o utilizar un usuario de QA establecido específicamente con una identidad y organización ficticia en un entorno aislado. NO vincular usuarios aleatorios.
2. Definir fixtures: Organización QA activa, Branch QA activa, usuario QA SALES, UserAccount.user_id exactamente igual al ID retornado por auth.me() del usuario QA, user_email correspondiente, organization_id de fixture, branch_id QA, role SALES, status active. Fixture explícita y verificable; nunca derivada del usuario humano dueño de TRP.
3. Crear también una segunda empresa y sucursal para pruebas negativas de cruce tenant; usuarios QA CUSTOMER_SERVICE, INVENTORY, BRANCH_ADMIN y SUPER_ADMIN con autoridad nativa comprobada (no auto elevar role). Si Base44 Testing Agent no soporta identidad fija, anotar BLOCKED y cambiar método de QA, no relajar seguridad.
4. Ejecutar matriz de casos en `docs/TRP-SEC-001-E2E-001-QA-MATRIX-2026-11-03.md`; verificar CRM accesible para SALES, consola SaaS inaccesible, branch B denegada; luego E2E de cotización, inventario, venta y cobro con datos simulados.
5. Capturar evidencias de rol, resultado, fecha, commit y backend, sin guardar tokens ni PII. NO marcar PASS si falta un caso.

## Miembros legacy: plan de reconciliación distinto a QA
- Leer y documentar, solo con autorización y proyección mínima, el total de membresías activas sin user_id; revisar existencia de email válido y unicidad por empresa antes de cada vinculación.
- No hacer backfill a partir de coincidencia de email únicamente; el registro puede ser de invitación o un usuario distinto, y la autorización exige usuario canónico verificado.
- Para cada vinculación de producción, exigir prueba de identidad real, organización, estado de invitación/aceptación y aprobación; realizar cambios transaccionales y auditados, con rollback. Esta sesión NO ejecutó esta migración.
- Mantener siempre el requisito user_id=user.id; está prohibido alterar UserAccount.status o isCanonicalSuperAdmin para abrir el QA.

## Gates finales
- SEC-011 campo/esquema: corregido y testeado.
- SEC-QA identidad ligada a organización/sucursal: PENDIENTE.
- E2E-001: PENDIENTE.
- P0-AUD-01 unicidad atómica de AuditEvent: NO-GO general.

## Archivos de continuidad
- AGENTS.md
- docs/TRP-AUDIT-MASTER-STATUS-2026-11-03.md
- docs/TRP-SEC-011-USERACCOUNT-SCHEMA-FIX-2026-11-03.md
- scripts/verify-useraccount-schema-contract.mjs