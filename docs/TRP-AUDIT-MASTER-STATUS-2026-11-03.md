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

## Estado verificable por bloque
| ID | Estado | Evidencia y condición pendiente |
|---|---|---|
| COM-001 CRM | Corrección de UI guardada, QA NO VERIFICADO | Restricción UI alineada a crmGateway roles ORG_ADMIN, BRANCH_ADMIN, SALES. Ver checkpoint previo. |
| COM-002 Cotizaciones | Correcciones guardadas, QA NO VERIFICADO | Se retiró reenvío de estado inválido; edición conserva OT. |
| COM-003 Inventario | Correcciones guardadas, QA NO VERIFICADO | Conserva reorder=0; confirma success del backend. |
| COM-004 Ventas/cobros | Corrección guardada, QA NO VERIFICADO | POS conserva sucursal de cotización/OT. Backend sigue autorizando. |
| SEC-001 roles/aislamiento | Contratos de código PASS, QA de sesiones NO VERIFICADO | Matriz detallada en docs/TRP-SEC-001-E2E-001-QA-MATRIX-2026-11-03.md. |
| SEC-003 identidad | **Candidato técnico CORREGIDO**, runtime NO VERIFICADO | Falla SALES previa: identityGateway CONTEXT_BUILD HTTP 400. SDK .filter(query, sort, limit) recibía .filter(query, 1/100), enviando sort numérico inválido. Se normalizaron llamadas de identityGateway y userAuthorization. Nuevo contrato scripts/verify-identity-filter-sdk-contract.mjs PASS. Checkpoint de corrección 6ae9ef214cc85330a89e38f0. |
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
