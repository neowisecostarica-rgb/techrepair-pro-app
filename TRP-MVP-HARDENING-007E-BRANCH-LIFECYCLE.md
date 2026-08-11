# TRP-MVP-HARDENING-007E — P0-07 Branch Lifecycle Protection

## Estado

Implementación de código completada sobre `rc/product-readiness-stabilization`. El auditor runtime queda preparado, pero no se ejecuta mientras Base44 continúe sirviendo `main`.

Clasificación esperada después del QA automatizado y publicación de la RC:

`CODE READY — RUNTIME LEGACY GATE DEFERRED`

## Arquitectura anterior

La administración de sucursales dependía de CRUD genérico y de una comprobación de cantidad en `Settings.jsx`. El cliente podía solicitar `Branch.create`, `Branch.update` o `Branch.delete`; la protección de “última sucursal” usaba caché de UI, no era una autoridad backend y no era segura bajo concurrencia. Tampoco existían contrato de reactivación, idempotencia durable, metadata lifecycle ni un gate de datos legacy específico.

## Decisión no-hard-delete

En el MVP ninguna operación normal puede eliminar físicamente una `Branch`, aunque esté vacía. `operationalGateway` intercepta cualquier delete antes del CRUD genérico y responde `409 BRANCH_HARD_DELETE_FORBIDDEN`. Create y update genéricos responden `BRANCH_LIFECYCLE_COMMAND_REQUIRED`.

La creación inicial de la sucursal principal durante el bootstrap de una organización sigue siendo una excepción interna de aprovisionamiento: ocurre antes de que exista una membresía capaz de invocar el comando. La compensación de ese agregado nunca comprometido puede eliminarlo si falla el propio onboarding; no constituye un delete operacional de una sucursal existente.

## Invariant soberano

Toda `Organization` activa debe conservar al menos una `Branch` donde `active === true`.

`manageBranchLifecycle` adquiere el lock existente `resourceLockLite` sobre:

`organization:{organization_id}:branch-lifecycle`

El conteo y el CAS ocurren dentro de ese lock. Por ello dos desactivaciones simultáneas sobre las dos últimas sucursales activas no pueden observar el mismo estado: como máximo una termina y la otra recibe `LAST_ACTIVE_BRANCH`.

## Comando lifecycle

`manageBranchLifecycle` es la autoridad operacional única para:

- `CREATE`
- `UPDATE_DETAILS`
- `DEACTIVATE`
- `REACTIVATE`

`DELETE` se rechaza explícitamente antes de adquirir locks o escribir. El comando resuelve autorización canónica `ORG_ADMIN`, deriva la organización, exige una organización activa y nunca confía en actor, tenant, timestamps ni metadata enviados por el cliente.

`CREATE` siempre produce `active: true`. `UPDATE_DETAILS` limita la mutación a `name`, `address` y `phone`. Activar o desactivar requiere su acción explícita y conserva el mismo ID.

Los nombres se normalizan con NFKD, eliminación de marcas diacríticas, compactación de espacios y lowercase con locale `es`. Bajo el lock organizacional se rechazan duplicados como `Sucursal Escazú` y `SUCURSAL ESCAZU`.

## Idempotencia y recovery

Cada solicitud requiere `operation_key` y genera un fingerprint SHA-256 determinista sobre el payload normalizado. `BranchLifecycleOperation` persiste estado `PENDING`/`COMMITTED`, actor, acción y snapshot de resultado. La propia `Branch` conserva marcadores backend para reconciliar respuestas ambiguas.

- misma key y mismo payload: recupera el resultado comprometido;
- misma key y payload distinto: `BRANCH_FINGERPRINT_CONFLICT`;
- replay de `CREATE`: una sola `Branch`;
- `DEACTIVATE` repetido: no reescribe timestamps ni genera efectos duplicados;
- `REACTIVATE` sobre una sucursal activa: éxito idempotente;
- una operación pending ajena obliga a recovery y falla cerrado.

## Precondiciones de desactivación

Antes de cambiar `active` a `false`, el comando verifica:

- otra sucursal activa disponible;
- ausencia de usuarios `active` o `invited` asignados;
- ausencia de OT no terminales;
- ausencia de actividades técnicas `en_progreso`;
- ausencia de reservas `PENDING` o `RESERVED`;
- ausencia de ventas procesando/inconsistentes o commits/postventa pending;
- ausencia de delivery, lifecycle de OT o decisión de cotización pending;
- ausencia de sale lock vigente.

Un scan de actividades que no puede completarse se considera blocker. Historia terminal, ventas cerradas, ledger, entregas, garantías y evidencia permanecen vinculados a la sucursal inactiva. El comando no reasigna usuarios, cancela operaciones, transfiere inventario ni repara datos.

Al confirmar la desactivación, el backend controla `deactivated_at`, `deactivated_by` y `deactivation_reason`. Reactivación controla `reactivated_at` y `reactivated_by`, sin crear registros ni mover relaciones.

## Guards de sucursal activa

`assertActiveBranch` exige coincidencia de ID, organización y `active: true`. Se integró con alcance mínimo en:

- P0-03: mutaciones ordinarias de inventario; `REVERSAL` se conserva para recovery;
- P0-05: inicio de una nueva entrega;
- `createSale`, incluidas ventas ligadas a OT;
- creación/mutación CRM branch-scoped y mensajes Customer 360;
- inicio de actividad técnica;
- creación genérica de registros operativos a través de `operationalGateway`.

Las lecturas históricas no pasan por este guard.

## Asignación de usuarios

`manageOrgUser` valida server-side cualquier `branch_id`. Roles branch-scoped requieren una sucursal existente, del tenant canónico y activa. La validación cubre invitación, reinvitación, cambio de cuenta/rol y reactivación de membresía. `ORG_ADMIN` puede permanecer sin `branch_id` conforme al contrato actual.

## Settings

La UI elimina “Eliminar sucursal” y ofrece “Desactivar” o “Reactivar”. Crear y cambiar estado invoca `manageBranchLifecycle` con keys únicas. Los blockers backend se presentan con categoría e IDs aun cuando el SDK represente la respuesta como excepción. La UI no reasigna dependencias y no actúa como frontera de seguridad.

## Auditor legacy read-only

`auditBranchLegacyData` solo acepta POST autenticado como `ORG_ADMIN`. Lee, pagina y clasifica por organización; no contiene create, update ni delete. Audita sucursales, usuarios, OT, ventas, cotizaciones, inventario/ledger/reservas, entrega, garantía, actividades e hijos indirectos.

Detecta, entre otros:

- organización activa sin sucursal o sin sucursal activa;
- nombre/tenant/active inválidos y nombres normalizados duplicados;
- branch IDs ausentes, inexistentes o cross-tenant;
- usuarios sin scope o asignados a sucursal inactiva;
- inconsistencias de ledger, reservas, EntregaLog y Garantia;
- padres/orígenes indirectos irresolubles;
- operaciones activas sobre sucursal inactiva;
- locks de venta/lifecycle y operaciones lifecycle stale;
- truncamiento por entidad.

El gate solo es `PASS` cuando no hay categorías y `truncated === false`. El máximo de seguridad es 5.000 registros por entidad; llegar al límite produce `BLOCKED`, nunca un PASS parcial.

## Pruebas y regresiones

Suite nueva `verify-branch-deletion-protection-contract.mjs`: 43/43 PASS. Incluye concurrencia real con dos deactivations simultáneas y confirma exactamente un éxito y al menos una sucursal activa al final.

Resultados relevantes:

- Branch Lifecycle: 43/43 PASS
- Inventory Integrity: 22/22 PASS
- Atomic Sale: 28/28 PASS
- Delivery Atomicity: 35/35 PASS
- Commercial Integrity: 10/10 PASS
- Assignment: 22/22 PASS
- Atomic Reception: 24/24 PASS
- Smart Intake: 23 escenarios + 12 checks PASS
- Commercial Flow: 16/16 PASS
- Security & Integrity: 7/7 PASS
- Identity/Tenant Security: 7/7 PASS
- CRM/Customer 360: 8/8 PASS
- Operational Authorization: 9 grupos PASS
- ESLint: PASS
- production build: PASS

`npm run typecheck` continúa fallando por la deuda JSX global preexistente (tipos de componentes UI y operaciones aritméticas en numerosos archivos). No se amplió P0-07 para corregirla. Las nuevas llamadas lifecycle de `Settings.jsx` no agregan diagnósticos específicos de variables/payload; el archivo conserva los diagnósticos JSX históricos.

## Archivos principales

- `base44/entities/Branch.jsonc`
- `base44/entities/BranchLifecycleOperation.jsonc`
- `base44/functions/_shared/branchProtection.ts`
- `base44/functions/_shared/branchLifecycle.ts`
- `base44/functions/manageBranchLifecycle/entry.ts`
- `base44/functions/auditBranchLegacyData/entry.ts`
- `base44/functions/resourceLockLite/entry.ts` (selección canónica de organización para el lock)
- `base44/functions/operationalGateway/entry.ts`
- `base44/functions/manageOrgUser/entry.ts`
- guards mínimos en inventario, entrega, venta, CRM, Customer 360 y actividad técnica
- `src/pages/Settings.jsx`
- `scripts/verify-branch-deletion-protection-contract.mjs`

## Limitaciones y despliegue

- No existe purge administrativo ni hard delete de sucursales en el MVP.
- No hay reasignación, transferencia o remediation automática.
- Los scans de nombres/actividades y el auditor fallan cerrado si alcanzan sus límites.
- Una operación lifecycle durable `PENDING` no reconciliable requiere intervención controlada; el comando no inventa estado.
- Base44 todavía ejecuta `main`. Después del merge final y deployment de la RC se debe ejecutar `auditBranchLegacyData` como `ORG_ADMIN` para cada organización activa. No cerrar el runtime gate si alguna devuelve `BLOCKED` o `truncated: true`.
- Draft PR #10 debe permanecer Draft; este trabajo no autoriza merge ni Ready for Review.
