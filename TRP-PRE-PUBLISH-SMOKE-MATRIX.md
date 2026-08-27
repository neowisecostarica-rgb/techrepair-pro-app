# TRP Pre-Publish Smoke Test Matrix

> **Entorno:** Staging aislado (ver `TRP-PRE-PUBLISH-RUNBOOKS.md` § Runbook A).
> **Vehículo:** Híbrido — scripts `verify-*.mjs` (contratos) + Testing Agent de Base44 (E2E autenticados).
> **Regla de interpretación:** Un 401/403/405 solo prueba fail-closed o disponibilidad parcial. **No equivale a PASS.** Solo se considera PASS cuando el flujo completa su secuencia esperada con respuesta 200 y estado persistido correcto.

---

## Sección 1 — Scripts de contrato locales

Ejecutar cada script contra staging (adaptar endpoints/credenciales sintéticas).

| # | Script | Dominio | Criterio PASS |
|---|--------|---------|--------------|
| 1 | `verify-identity-tenant-security-contract.mjs` | Identidad y tenant isolation | Sin fuga cross-tenant; identidad canónica |
| 2 | `verify-operational-authorization-contract.mjs` | Autorización operativa | Branch-scoping; reject cross-branch |
| 3 | `verify-multiuser-provisioning-contract.mjs` | Provisionamiento | Org → READY; branch + admin canónicos |
| 4 | `verify-audit-operation-identity-contract.mjs` | Auditoría y `audit_operation_id` | Unicidad de operation_id; CAS tenant anchor |
| 5 | `verify-atomic-reception-contract.mjs` | Recepción | OT + DMR atómicos; idempotencia |
| 6 | `verify-assignment-contract.mjs` | Asignación | Asignación canónica; race condition resuelta |
| 7 | `verify-multiuser-technical-contract.mjs` | Técnico/QA | Actividad técnica; 1-active-per-tech |
| 8 | `verify-commercial-flow-contract.mjs` | Comercial | Cotización → decisión → venta |
| 9 | `verify-inventory-integrity-contract.mjs` | Inventario | CAS de stock; rollback |
| 10 | `verify-atomic-sale-contract.mjs` | Venta | Venta atómica; commit de inventario |
| 11 | `verify-delivery-atomicity-contract.mjs` | Entrega | Entrega atómica; garantía |
| 12 | `verify-branch-deletion-protection-contract.mjs` | Sucursales | Protección de borrado |
| 13 | `verify-controlled-pilot-operator-contract.mjs` | Piloto controlado | Operator-only; sin bypass |
| 14 | `verify-multiuser-policy-pipeline-contract.mjs` | Plan-entitlements | Pipeline de políticas |

### Resultados
| # | Script | Estado | Notas |
|---|--------|--------|-------|
| 1 | identity-tenant | ⬜ Pendiente | |
| 2 | operational-auth | ⬜ Pendiente | |
| 3 | provisioning | ⬜ Pendiente | |
| 4 | audit-operation-id | ⬜ Pendiente | |
| 5 | atomic-reception | ⬜ Pendiente | |
| 6 | assignment | ⬜ Pendiente | |
| 7 | technical | ⬜ Pendiente | |
| 8 | commercial-flow | ⬜ Pendiente | |
| 9 | inventory-integrity | ⬜ Pendiente | |
| 10 | atomic-sale | ⬜ Pendiente | |
| 11 | delivery-atomicity | ⬜ Pendiente | |
| 12 | branch-deletion | ⬜ Pendiente | |
| 13 | controlled-pilot | ⬜ Pendiente | |
| 14 | policy-pipeline | ⬜ Pendiente | |

---

## Sección 2 — Flujos E2E autenticados (Testing Agent)

Cada flujo se describe en lenguaje natural para el Testing Agent de Base44. El agente debe ejecutar con credenciales sintéticas de staging.

### Flujo 1 — Super Admin
**Goal:** "Inicia sesión como Super Admin, abre el portal SaaS, lista organizaciones, inicia impersonación de un tenant, verifica acceso de solo lectura y termina la impersonación."

**Pasos esperados:**
1. Login Super Admin → 200
2. Portal SaaS carga → lista organizaciones
3. Impersonación de tenant X → banner visible
4. Acceso solo lectura confirmado
5. Fin de impersonación → retorno a portal SaaS

**Criterio PASS:** Secuencia completa sin errores; banner de impersonación visible; salida limpia.

### Flujo 2 — Tenant
**Goal:** "Como Super Admin, crea una organización canónica, verifica que alcanza estado READY, crea una sucursal y asigna un administrador."

**Pasos esperados:**
1. Crear Organization → 200
2. Provisionamiento automático (branch + categorías) → `provisioning_status: READY`
3. Crear branch → 200
4. Asignar ORG_ADMIN → 200
5. Validar `validateTenantReadiness` → READY

**Criterio PASS:** Org alcanza READY; branch y admin creados; `validateTenantReadiness` confirma.

### Flujo 3 — Usuarios
**Goal:** "Como ORG_ADMIN, invita un usuario TECHNICIAN, verifica la invitación, activa la cuenta, cambia el rol a SALES y suspende la cuenta."

**Pasos esperados:**
1. `manageOrgUser` invite → 200
2. Usuario acepta invitación → `status: active`
3. Cambio de rol → 200
4. Suspensión → `status: suspended`
5. Confirmar que usuario suspendido no puede autenticarse

**Criterio PASS:** Ciclo completo invite → active → role-change → suspend; suspendido falla al login.

### Flujo 4 — Recepción
**Goal:** "Como CUSTOMER_SERVICE, crea un cliente, registra un equipo, crea una orden de trabajo con pre-diagnóstico y verifica que se genera el DMR y la trazabilidad."

**Pasos esperados:**
1. `createClient` → 200
2. `createEquipment` → 200
3. `createWorkOrder` → 200 (con pre-diagnóstico)
4. DMR generado → `DiagnosticMasterRecord` creado
5. `OTEvent` CREATED emitido
6. Trazabilidad: OT → DMR → OTEvent enlazados

**Criterio PASS:** OT + DMR + OTEvent creados atómicamente; `reception_correlation_id` consistente.

### Flujo 5 — Técnico
**Goal:** "Como ORG_ADMIN, asigna una OT a un técnico; como TECHNICIAN, inicia la actividad, completa el diagnóstico, pasa a QA y finaliza."

**Pasos esperados:**
1. `reassignWorkOrderTechnician` → 200 (OT → ASIGNADA)
2. `initTechnicalActivity` → 200 (ActividadTecnica en_progreso)
3. Wizard de diagnóstico → `DiagnosticoTecnico` listo_aprobacion
4. `transitionWorkOrderStatus` → DIAGNOSTICADA
5. QA → `transitionWorkOrderStatus` PRUEBAS
6. Finalizar → FINALIZADA

**Criterio PASS:** Asignación → actividad → diagnóstico → QA → finalización; 1 actividad activa por técnico; AuditEvent por transición.

### Flujo 6 — Comercial
**Goal:** "Como SALES, crea una cotización desde el diagnóstico, el cliente la aprueba, registra la venta, verifica el commit de inventario y ejecuta las acciones postventa."

**Pasos esperados:**
1. `FormularioCotizacion` → Cotizacion creada
2. Cliente aprueba (portal o manual)
3. `createSale` → 200 (origen: DESDE_COTIZACION)
4. `inventory_commit_status: COMMITTED`
5. `processPostSaleActions` → `post_sale_status: COMPLETED`
6. OT → APROBADA → EN_REPARACION

**Criterio PASS:** Cotización → decisión → venta → inventario commit → postventa; idempotencia de `createSale`.

### Flujo 7 — Entrega
**Goal:** "Como ORG_ADMIN, valida el gate comercial de entrega, entrega la OT al cliente, verifica la garantía emitida, el comprobante y el AuditEvent de entrega."

**Pasos esperados:**
1. `deliverWorkOrder` → 200
2. `delivery_status: COMMITTED`
3. Garantía emitida → `delivery_warranty_outcome: ISSUED`
4. Comprobante generado
5. AuditEvent ENTREGADA creado
6. `email_entregada_sent: true`

**Criterio PASS:** Entrega atómica; garantía; comprobante; auditoría; email idempotente.

### Resultados
| # | Flujo | Rol | Estado | Notas |
|---|-------|-----|--------|-------|
| 1 | Super Admin | SUPER_ADMIN | ⬜ Pendiente | |
| 2 | Tenant | SUPER_ADMIN | ⬜ Pendiente | |
| 3 | Usuarios | ORG_ADMIN | ⬜ Pendiente | |
| 4 | Recepción | CUSTOMER_SERVICE | ⬜ Pendiente | |
| 5 | Técnico | ORG_ADMIN + TECHNICIAN | ⬜ Pendiente | |
| 6 | Comercial | SALES | ⬜ Pendiente | |
| 7 | Entrega | ORG_ADMIN | ⬜ Pendiente | |

---

## Sección 3 — Seguridad y fail-closed

Matriz rol × verificación. Cada celda debe marcarse ✅ PASS / ❌ FAIL / ⬜ Pendiente.

| Verificación | SUPER_ADMIN | ORG_ADMIN | BRANCH_ADMIN | TECHNICIAN | SALES | INVENTORY | CUSTOMER_SERVICE | SUPPORT |
|---|---|---|---|---|---|---|---|---|
| Lectura limitada a org/branch | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Escritura solo vía comandos canónicos | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Rechazo 401 sin auth | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Rechazo 403 rol insuficiente | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Rechazo cross-tenant | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Campos backend-only no manipulables | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Bloqueo de writers alternativos | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |
| Controlled pilot sin bypass | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ |

### Casos negativos específicos a verificar
1. **Cross-tenant read:** TECHNICIAN de Org A intenta leer OT de Org B → 403
2. **Cross-branch write:** BRANCH_ADMIN de Branch 1 intenta mutar inventario de Branch 2 → 403
3. **Generic entity update:** Frontend intenta `OrdenTrabajo.update({estado: 'FINALIZADA'})` directo → rechazado por gateway
4. **Pilot bypass:** TECHNICIAN no operador intenta mutar en piloto controlado → 403
5. **Impersonation bypass:** SUPER_ADMIN impersonando intenta mutar en tenant suspendido → bloqueado
6. **Backend-only field:** Frontend intenta setear `lifecycle_audit_*` → RLS `write: false` bloquea
7. **Audit operation_id collision:** Dos operaciones con mismo `operation_id` pero payload distinto → error de colisión

---

## Resumen ejecutivo

| Sección | Total | PASS | FAIL | Pendiente |
|---------|-------|------|------|-----------|
| Scripts de contrato | 14 | 0 | 0 | 14 |
| Flujos E2E | 7 | 0 | 0 | 7 |
| Seguridad (rol × verificación) | 64 | 0 | 0 | 64 |
| **Total** | **85** | **0** | **0** | **85** |

**Criterio GO global:** 85/85 PASS.