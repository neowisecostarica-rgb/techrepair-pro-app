# TRP-SEC-006 — Identity Authority & Tenant Boundary Hardening

Fecha: 2026-08-10

Rama: `rc/product-readiness-stabilization`

PR: `#10 — TRP RC: Security, lifecycle, CRM and Customer 360 stabilization`

## 1. Causa raíz

La aplicación tenía varias fuentes de autoridad simultáneas. El frontend y numerosas funciones backend confiaban en campos custom de `User` (`is_super_admin`, `organization_id` e `impersonating_org_id`) para decidir privilegios y tenant efectivo. Esos campos también podían modificarse desde el cliente mediante `auth.updateMe`. A la vez, `UserAccount`, `Organization` y `SuperAdminAudit` carecían de una frontera RLS coordinada, y varias funciones usaban `asServiceRole` después de validar contra esos valores manipulables.

El resultado era una ruta potencial de elevación de privilegios, impersonación no autorizada y cruce de tenant. `SuperAdminAudit` tampoco era append-only: el cliente podía crear eventos y declarar actor, acción y organización.

## 2. Arquitectura anterior

- El cliente leía y mutaba directamente `UserAccount`, `User`, `Organization` y `SuperAdminAudit`.
- `User.is_super_admin` funcionaba en varios caminos como fuente de autoridad soberana.
- La impersonación se iniciaba y finalizaba con `base44.auth.updateMe`.
- Las RLS aceptaban `user.impersonating_org_id` sin una verificación inseparable del superadmin canónico.
- Funciones con `asServiceRole` resolvían el tenant desde campos del token/perfil antes de operar.
- Seed, reset, migración y usuarios de prueba dependían de páginas protegidas principalmente por UI.

## 3. Arquitectura nueva

La autoridad se concentra en `base44/functions/_shared/userAuthorization.ts` y en `identityGateway`.

- El superadmin real se determina exclusivamente por el rol built-in `User.role === 'admin'`.
- `UserAccount.status === 'active'` es el único estado que concede autoridad de membresía. El booleano legacy `active` no autoriza.
- Para usuarios normales, el tenant efectivo proviene de una membresía canónica activa.
- Para superadmin, una operación tenant-scoped requiere una impersonación persistida por backend.
- Todo `organization_id` recibido se trata como intención y debe coincidir con la identidad resuelta.
- Los gateways autentican primero y sólo después usan `asServiceRole` con el tenant ya validado.
- El frontend consume DTOs sanitizados y no las entidades sensibles.

## 4. Entidades modificadas

### `User`

Se aplicó seguridad de campo con escritura cliente denegada a:

- `is_super_admin`;
- `organization_id`;
- `impersonating_org_id`;
- `impersonating_started_at`;
- `impersonation_previous_organization_id` (también oculto en lectura).

`is_super_admin` queda únicamente como compatibilidad visual. No participa en decisiones de autoridad.

### `UserAccount`, `Organization`, `SuperAdminAudit`

Las cuatro operaciones RLS (`create`, `read`, `update`, `delete`) quedan en `false` para acceso directo. Sus operaciones legítimas pasan por backend autenticado.

### Entidades tenant-scoped

Se revisaron 40 políticas operativas y comerciales:

- la pertenencia normal usa `{{user.data.organization_id}}`;
- se eliminó `{{user.impersonating_org_id}}` de RLS;
- el bypass soberano usa la condición explícita del rol built-in `admin`;
- se conservaron las inmutabilidades preexistentes de eventos, QA y registros sensibles.

## 5. Funciones y gateways

### Nuevos

- `identityGateway`: contexto, selección de organización, invitaciones, bootstrap de tenant, inicio/fin de impersonación, lectura/edición sanitizada de organización y cuentas, y administración global de tenants.
- `_shared/superAdminAudit.ts`: único escritor append-only de auditoría administrativa.
- `src/api/identity.js`: contrato cliente del gateway.

### Migrados a autoridad canónica

Se migraron los caminos de recepción, asignación, Smart Intake, lifecycle, actividad técnica, cobro/venta, inventario, diagnóstico, atención, CRM/Customer 360 y eventos de OT. Entre ellos:

- `createWorkOrder`, `reassignWorkOrderTechnician`, `getSmartIntakeByWorkOrder`;
- `transitionWorkOrderStatus`, `initTechnicalActivity`, `processOTEvent`;
- `createSale`, `processPostSaleActions`, `recordTechnicalTest`;
- `createInventoryItem`, `updateInventoryItem`, `adjustInventoryStock`, `createCategoriaInventario`;
- `createEquipment`, `getFinancialMetrics`, `updateDiagnosticoResumen`;
- `listWorkOrders`, `resourceLockLite`, `manageOrgUser` y funciones DMR.

Los endpoints legacy `repairUserIdentity` y la mutación de `migrateLegacyUsers` fallan cerrados. La migración sólo conserva diagnóstico `dry-run`.

## 6. Accesos frontend eliminados

La búsqueda de regresión queda en cero para:

- `base44.entities.UserAccount`;
- `base44.entities.User`;
- `base44.entities.Organization`;
- `base44.entities.SuperAdminAudit`;
- `base44.auth.updateMe`.

`AuthContext`, SaaS, onboarding, dashboards, configuración, inventario, agenda, expediente, OT, ventas y Customer 360 consumen ahora el gateway de identidad. Los eventos operativos que antes contaminaban `SuperAdminAudit` se eliminaron de ese registro administrativo.

## 7. Modelo seguro de impersonación

1. Sólo un usuario con rol built-in `admin` puede iniciar o finalizar impersonación.
2. La organización destino debe existir y estar activa.
3. No se permiten impersonaciones anidadas.
4. Los campos de sesión se escriben únicamente con service role después de autenticar.
5. Toda función tenant-scoped vuelve a resolver la impersonación desde backend; no confía en el request.
6. Inicio y fin generan auditoría con actor derivado de sesión, timestamp y correlation ID.
7. Si la auditoría falla, se revierte el cambio de impersonación.

## 8. Auditoría append-only

`SuperAdminAudit` tiene un único escritor: `_shared/superAdminAudit.ts`.

- Sólo acepta superadmin canónico.
- Deriva ID y email desde la sesión.
- Usa un catálogo cerrado de acciones.
- Deriva timestamp en backend.
- Sanitiza organización, contexto, metadata y correlation ID.
- No existe `update` ni `delete` en backend o frontend.
- RLS cliente deniega create/read/update/delete.
- Las mutaciones administrativas con auditoría obligatoria compensan su cambio si el append falla.

## 9. Admin, seed y reset

Las páginas `AdminReset`, `AdminSeedCompuStore`, `MigrationAdmin` y `CrearUsuariosPrueba` ya no ejecutan mutaciones. Muestran un estado de mantenimiento deshabilitado. El endpoint de migración legacy es read-only y una solicitud mutante devuelve `MUTATING_MIGRATION_DISABLED`.

El bootstrap de tenant y la creación administrativa de organizaciones se ejecutan en `identityGateway`, con validación backend, idempotencia/compensación y auditoría cuando corresponde.

## 10. Pruebas añadidas

`npm run test:identity-tenant-security` valida:

- rol built-in como única autoridad superadmin;
- rechazo del flag custom y de impersonación manipulada;
- aislamiento de tenant y denegación de administración de membresías por rol no autorizado;
- inicio/fin real del gateway de impersonación con dos appends de auditoría;
- RLS/FLS fail-closed;
- ausencia de accesos sensibles directos en frontend;
- ausencia de autoridad residual basada en campos custom en funciones backend;
- único writer append-only y actor derivado de sesión;
- rutas browser de mantenimiento deshabilitadas.

También se actualizaron los harnesses de regresión para inyectar la autoridad canónica en lugar de reproducir el modelo inseguro anterior.

## 11. Resultados

| Gate | Resultado |
|---|---|
| Identity / Tenant Security | PASS — 7/7 |
| Security & Integrity | PASS — 7/7 |
| CRM / Customer 360 | PASS — 8/8 |
| Recepción atómica | PASS — 24/24 |
| Asignación | PASS — 21/21 |
| Smart Intake | PASS — 23 escenarios + 12 contratos de fuente |
| Comercial / lifecycle | PASS — 16/16 |
| Venta / cobro atómico e inventario | PASS — 19/19 |
| ESLint | PASS |
| Production build | PASS |
| `git diff --check` | PASS |

## 12. Riesgos residuales y siguiente gate

- La validación automatizada no sustituye la verificación del comportamiento RLS desplegado por Base44. Debe probarse con sesiones reales de usuario normal, ORG_ADMIN y superadmin.
- Debe confirmarse que la sincronización de `User.data.organization_id` ocurre al cargar `identityGateway.context` antes de las lecturas operativas directas permitidas por RLS.
- Deben verificarse 401/403/404 reales, cambio multi-organización, inicio/fin de impersonación, aislamiento de caché y navegación tras recargar.
- Las herramientas mutantes de mantenimiento quedaron deshabilitadas; cualquier runbook futuro requiere diseño backend, autorización y auditoría separados.
- El siguiente gate sigue siendo QA manual autenticado en Base44 sobre una misma OT completa. Este documento no declara `MVP PASS` ni autoriza merge automático.

Decisión técnica de TRP-SEC-006: `P0 CLOSED — READY FOR MERGE REVIEW`.
