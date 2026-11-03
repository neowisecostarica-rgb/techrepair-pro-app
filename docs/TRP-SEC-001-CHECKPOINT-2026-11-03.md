# TRP-SEC-001 — Checkpoint de seguridad y aislamiento

Fecha: 2026-11-03
Aplicación Base44: 695d708948469128f473d080
Modo: auditoría de lectura de código y pruebas automatizadas, sin publicación ni alteración de datos.
Baseline de código al comenzar: 3df45a394a579f9234e1ce41b726e01de5667d5b

## Dictamen
- Seguridad de código y contratos: PASS en las suites ejecutadas, **no equivalente a QA autenticado ni certificación de producción**.
- P0-AUD-01: **ABIERTO / NO-GO para liberación general**.
- Auditoría de sesiones reales de dos empresas y sucursales: NO VERIFICADA.
- Runtime desplegado y sincronización de funciones: NO VERIFICADOS en este ejercicio.
- No se autorizó publicación ni se ejecutaron transacciones.

## Evidencia obtenida en el sandbox Base44
- `test:identity-tenant-security`: 7/7 PASS.
- `test:operational-authorization`: 9 grupos PASS.
- `test:security-integrity`: 7/7 PASS.
- `test:security-blockers`: 9/9 grupos PASS.
- `test:security-round2`: 13/13 grupos PASS.
- `test:superadmin-lifecycle`: 5/5 PASS.
- `test:controlled-pilot`: 10 grupos PASS.
- `test:multiuser-policy-pipeline`: 12/12 grupos PASS.
- `test:impersonation-session-hardening`: 10/10 PASS.
- `test:audit-concurrency-boundary`: test 1/1 PASS **porque reproduce la condición de carrera**: el algoritmo read-before-create permite dos registros AuditEvent para el mismo par (organization_id, audit_operation_id) bajo concurrencia. No clasificar como seguridad PASS.

## P0-AUD-01: diagnóstico y restricción
`base44/functions/_shared/auditEvent.ts` verifica antes de crear y reconcilia posteriormente. El harness `scripts/verify-audit-concurrency-boundary.mjs` demuestra que dos escritores pueden observar ausencia y crear cada uno una fila. `docs/TRP-MB6-SECURITY-RUNTIME-2026-09-19.md` ya reconoce este bloqueo.

La API oficial Base44 `POST /api/apps/{app_id}/entities/{entity_name}/upsert` se describe como **beta**, y documenta explícitamente que dos llamadas concurrentes pueden crear el mismo registro: sin Idempotency-Key. No utilizar `upsert` como supuesta solución de unicidad atómica.

## Condición de cierre
1. Confirmar con Base44 disponibilidad de índice único, constraint, transacción/compare-and-set persistente o una primitiva de creación atómica por clave (organization_id, audit_operation_id).
2. Diseñar un único writer de auditoría apoyado en esa garantía; preservar el registro append-only, semántica de replay y aislamiento por organización.
3. Ejecutar prueba de dos o más escritores simultáneos contra **runtime real controlado**; verificar exactamente una fila persistida y errores/reintentos adecuados.
4. Ejecutar QA autenticado en dos organizaciones y dos sucursales, para ORG_ADMIN, BRANCH_ADMIN, SALES, INVENTORY, CUSTOMER_SERVICE, TECHNICIAN y SUPER_ADMIN (incluida impersonación). Confirmar intentos denegados y auditoría, sin modificar registros productivos.
5. Reconciliar código de Base44, funciones desplegadas y GitHub antes de cualquier GO. Obtener aprobación explícita para publish.

## Orden de ejecución
SEC-001a validar mecanismo persistente atómico (BLOQUEADO por capacidad de plataforma) → SEC-001b implementar + test concurrente real → SEC-001c QA multiempresa/roles → E2E-001 circuito CRM → Cotización → Inventario → Venta → Cobro → revisión GO/NO-GO.

No reabrir COM-001..004 sin evidencia de regresión. No crear un sistema paralelo de autorizaciones ni reemplazar el algoritmo por `upsert` beta.
