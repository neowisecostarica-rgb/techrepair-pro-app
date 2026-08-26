# TRP Pre-Publish Validation Plan

> **Estado:** Aprobado (PRD). Plan de preparación — **no autoriza Publish, deploy, creación de staging ni cambios de producción.**
> **Fuente de verdad:** GitHub `main` (commit Aug 26, 2026).
> **Hallazgo base:** Producción no tiene desplegadas 20 funciones críticas (incl. `identityGateway`, `operationalGateway`). El último Publish exitoso ocurrió entre jun 15 y Aug 10, 2026.

---

## Objetivo

Recuperar la consistencia entre GitHub, Base44 staging y producción **sin relajar** seguridad, RLS, roles, tenant isolation, auditoría ni comportamiento fail-closed.

El plan produce **evidencia, runbooks y criterios GO/NO-GO**. La decisión de Publish queda pendiente de aprobación explícita posterior.

## Principios obligatorios

1. **GitHub es la fuente de verdad.** El draft del workspace ya está reconciliado con `main` para `identityGateway` y `operationalGateway` (verificado L1/L89/L193/L587 y L1/L671/L728).
2. **No asumir atomicidad del Publish.** Verificar el registro runtime función por función después de cada despliegue (staging y producción).
3. **No asumir versión "pre-Aug-10" en producción.** Confirmar versiones mediante inventario runtime, historial de Publish y smoke tests.
4. **No tocar RLS, autenticación, secretos, roles ni schemas** como respuesta al error de login. El error de sesión es síntoma de despliegue, no de configuración.
5. **No usar seeds, resets ni migraciones directas.** Staging usa datos sintéticos y credenciales separadas.
6. **No usar datos reales de clientes** en staging.
7. **No publicar producción sin aprobación explícita** posterior a este plan.

---

## Fase 1 — Inventario y reconciliación de solo lectura

**Objetivo:** Confirmar el estado real del workspace vs. GitHub vs. producción antes de cualquier acción.

### 1.1 Comparación GitHub `main` ↔ workspace Base44
- Entidades (schemas `base44/entities/*.jsonc`)
- Funciones (`base44/functions/*/entry.ts`)
- Dependencias `_shared` (`base44/functions/_shared/*.ts`)
- Frontend (`src/`)

### 1.2 Inventario runtime de funciones (clasificación)
Para cada función del repo, clasificar como:
- ✅ **Desplegada y operativa** — responde 200 con payload válido autenticado
- ⚠️ **Desplegada con error** — responde pero lanza excepción en runtime
- ❌ **Ausente / no desplegada** — 404 "not found or not deployed"
- ❓ **Por confirmar** — estado ambiguo

### 1.3 Revisión de historial de Publish y logs
- Fecha del último Publish exitoso en Base44 dashboard
- Logs de build/deploy de las funciones no desplegadas
- Confirmar si hubo deploys fallidos post-Aug-10

### 1.4 Documentar delta de comportamiento
Cambios relevantes desde el último snapshot runtime verificable:
- `identityGateway` — centralización de identidad/tenant
- `operationalGateway` — gateway CRUD con branch-scoping
- `deliverWorkOrder` — entrega atómica
- `manageBranchLifecycle` — lifecycle de sucursales
- Writers técnicos soberanos (`technicalActivityCommand`, `technicalRequestCommand`, `technicalRecordCommand`)
- Control de piloto (`controlled_pilot_mode`, operator-only envelope)
- Auditoría e idempotencia (`audit_operation_id`, CAS tenant anchor)

**Salida:** Inventario runtime reconciliado + delta aprobado (ver `TRP-PRE-PUBLISH-GO-NOGO.md` § Inventario).

---

## Fase 2 — Diseño y provisión de staging aislado

**Objetivo:** Validar el Publish completo (20 nuevas + 31 actualizadas) en un entorno aislado antes de producción.

> ⚠️ **No ejecutar en este plan.** Esta fase se ejecuta solo tras aprobación explícita de provisión de staging.

1. Crear una app Base44 de staging separada (no reutilizar producción).
2. Copiar **únicamente** schemas, funciones y configuración aprobada desde GitHub `main`.
3. **No copiar** datos, usuarios, secretos ni credenciales de producción.
4. Crear datos sintéticos mínimos:
   - 1 organización (sintética)
   - 1 sucursal
   - 1 Super Admin
   - 1 ORG_ADMIN
   - 1 BRANCH_ADMIN
   - 1 TECHNICIAN
   - 1 SALES
   - 1 INVENTORY
   - 1 CUSTOMER_SERVICE
   - 1 SUPPORT
5. Confirmar que cada función requerida aparece en el registro runtime de staging (verificación función por función).

**Salida:** Staging aislado, sin datos reales, con las 51 funciones + `_shared` desplegadas. Runbook: `TRP-PRE-PUBLISH-RUNBOOKS.md` § Staging.

---

## Fase 3 — Matriz de smoke tests

**Objetivo:** Validar los 7 flujos críticos y los contratos de seguridad en staging.

### 3.1 Scripts de contrato locales (`scripts/verify-*.mjs`)
Ejecutar contra staging (adaptar endpoints/credenciales):
- `verify-identity-tenant-security-contract.mjs` — identidad y tenant isolation
- `verify-operational-authorization-contract.mjs` — autorización operativa
- `verify-multiuser-provisioning-contract.mjs` — provisionamiento
- `verify-audit-operation-identity-contract.mjs` — auditoría y `audit_operation_id`
- `verify-atomic-reception-contract.mjs` — recepción
- `verify-assignment-contract.mjs` — asignación
- `verify-multiuser-technical-contract.mjs` — técnico/QA
- `verify-commercial-flow-contract.mjs` — comercial
- `verify-inventory-integrity-contract.mjs` — inventario
- `verify-atomic-sale-contract.mjs` — venta
- `verify-delivery-atomicity-contract.mjs` — entrega
- `verify-branch-deletion-protection-contract.mjs` — sucursales
- `verify-controlled-pilot-operator-contract.mjs` — piloto controlado
- `verify-multiuser-policy-pipeline-contract.mjs` — plan-entitlements

### 3.2 Flujos E2E autenticados (Testing Agent de Base44)
7 flujos, cada uno con requests autenticados y payloads válidos:

1. **Super Admin** — login → portal SaaS → organizaciones → impersonación → salida
2. **Tenant** — creación canónica → `READY` → sucursal → administrador
3. **Usuarios** — invitación → activación → roles → suspensión
4. **Recepción** — cliente → equipo → OT → DMR → trazabilidad
5. **Técnico** — asignación → actividad → diagnóstico → QA → finalización
6. **Comercial** — cotización → decisión → venta → inventario → postventa
7. **Entrega** — validación comercial → entrega → garantía → comprobante → auditoría

> ⚠️ **Regla de interpretación:** Un 401/403/405 solo prueba fail-closed o disponibilidad parcial. **No equivale a flujo PASS.** Solo se considera PASS cuando el flujo completa su secuencia esperada con respuesta 200 y estado persistido correcto.

**Salida:** Matriz de pruebas ejecutada con resultados PASS/FAIL por caso. Detalle: `TRP-PRE-PUBLISH-SMOKE-MATRIX.md`.

---

## Fase 4 — Seguridad y fail-closed

**Objetivo:** Confirmar que roles, RLS y fail-closed sobreviven al Publish.

Para cada rol (ORG_ADMIN, BRANCH_ADMIN, TECHNICIAN, SALES, INVENTORY, CUSTOMER_SERVICE, SUPPORT, SUPER_ADMIN), validar:

- ✅ Lectura limitada a su organización/sucursal (branch-scoping)
- ✅ Escritura solo mediante comandos canónicos (Sovereign Writer pattern)
- ✅ Rechazo 401 sin autenticación
- ✅ Rechazo 403 con rol insuficiente
- ✅ Rechazo cross-tenant (tenant isolation)
- ✅ Campos backend-only no manipulables desde frontend (RLS `write: false`)
- ✅ Bloqueo de writers alternativos (generic entity update rechazado)
- ✅ Controlled pilot sin bypass por impersonación, membresías o automatización

**Salida:** Matriz rol × verificación con resultados. Detalle: `TRP-PRE-PUBLISH-SMOKE-MATRIX.md` § Seguridad.

---

## Fase 5 — Diseño de rollback y pausa de mutaciones

**Objetivo:** Tener un mecanismo ensayado de contención antes de depender de rollback en producción.

### 5.1 Pausa global de mutaciones (nueva)
1. Diseñar un mecanismo **explícito** de pausa global de mutaciones (flag de Organization o función gateway).
2. **No reutilizar** `controlled_pilot_mode` como mantenimiento global (es operador-only, no global).
3. Implementarlo y probarlo primero en staging.
4. Definir:
   - Operaciones bloqueadas (todos los comandos soberanos P0)
   - Mensaje visible para usuarios (UX de mantenimiento)
   - Responsable de activación/desactivación (ORG_ADMIN + SUPER_ADMIN)
   - Auditoría de cambios (AuditEvent)
   - Validación de que no haya requests en vuelo (drain window)

### 5.2 Runbook de rollback
1. Pausar mutaciones (activar flag global)
2. Esperar drain window (confirmar 0 requests en vuelo)
3. Revertir en Git (`git revert` del commit que rompió → push → sync Base44)
4. Reconciliar draft ↔ `main`
5. Re-publicar (Publish)
6. Ejecutar smoke tests post-rollback
7. Reanudar mutaciones solo tras PASS

**Salida:** Runbook de rollback + mecanismo de pausa ensayado en staging. Detalle: `TRP-PRE-PUBLISH-RUNBOOKS.md` § Rollback.

---

## Criterios GO / NO-GO

### ✅ GO (para solicitar autorización de Publish a producción)
- [ ] Staging reconciliado con GitHub `main`
- [ ] Inventario runtime completo (51 funciones + `_shared` clasificadas)
- [ ] Todas las funciones necesarias desplegadas en staging
- [ ] Contratos locales PASS (14 scripts)
- [ ] 7 flujos E2E PASS
- [ ] RLS, RBAC y fail-closed PASS (matriz rol × verificación)
- [ ] Pausa de mutaciones y rollback ensayados en staging
- [ ] Checklist de producción revisado
- [ ] **Aprobación explícita para Publish** (separada de este plan)

### ❌ NO-GO
- [ ] Cualquier función ausente del registro runtime
- [ ] Error de build/deploy no explicado
- [ ] Fallo E2E en cualquier flujo
- [ ] Fuga cross-tenant
- [ ] Bypass de autorización
- [ ] Inconsistencias de auditoría
- [ ] Rollback no ensayado en staging
- [ ] Datos reales en staging
- [ ] Draft no reconciliado con GitHub

---

## Fuera de alcance

- Stripe, billing automático y portal autoservicio
- Nuevas funcionalidades Enterprise
- Crear Compu Store en producción
- Cambios visuales no necesarios
- Cambios de RLS, autenticación, secretos o roles sin diagnóstico concreto

## Resultado esperado

Entregar:
1. **Runbooks** — `TRP-PRE-PUBLISH-RUNBOOKS.md` (staging + rollback + pausa)
2. **Matriz de pruebas** — `TRP-PRE-PUBLISH-SMOKE-MATRIX.md` (scripts + E2E + seguridad)
3. **Inventario runtime** — `TRP-PRE-PUBLISH-GO-NOGO.md` § Inventario (template)
4. **Checklist GO/NO-GO** — `TRP-PRE-PUBLISH-GO-NOGO.md` § Checklist
5. **Evidencia de staging** — pendiente de provisión (Fase 2, requiere aprobación)

**Detenerse antes de cualquier Publish o deploy productivo y solicitar autorización explícita.**