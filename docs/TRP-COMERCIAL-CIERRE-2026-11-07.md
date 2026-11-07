# TRP MAIN · cierre de esta intervención · 7 nov 2026

## Evidencia nueva
- Reparado `cancelDraftSale` para borradores heredados con `cancel_operation_id` ausente, null o vacío; el CAS permanece condicionado por empresa, sucursal y estado `borrador`.
- El código legible está en `scripts/candidates/cancelDraftSaleSource.ts` y la función empaquetada en `base44/functions/cancelDraftSale/entry.ts`; ambos en MAIN.
- Prueba de **handler real con adaptador de entidades simulado** en `scripts/verify-cancel-draft-backend-simulated-20261107.test.mjs`: 6/6 PASS: cancelar, retry, identidad distinta, rol/sucursal/estado/stock, incertidumbre de auditoría y borrador antiguo. No accede a Base44 remoto ni usa credenciales.
- Contratos de integración de cancelación: 5/5 PASS. Venta atómica simulada 29/29 PASS. Build PASS. Git diff --check PASS.
- Script `verify-audit-race-diagnostic.mjs` reproduce DOS escrituras concurrentes con la misma clave. PASS significa defecto reproducido, **NO solución**.

## Estado real y entrega
- Base44 MAIN disponible en preview; los tests simulan entidades y **no certifican la ejecución del backend remoto**. Los tests de navegador previos quedaron bloqueados por onboarding de la identidad SALES de testing agent.
- **QA comercial de lectura**: puede comenzar por operador autenticado y autorizado.
- **QA comercial con cobros/escrituras**: pendiente prueba autenticada con fixtures correctos; evitar alterar inventario de Compu Store.
- **P0 auditoría**: bloqueo de concurrencia continúa abierto. No hay UNIQUE transaccional en el ledger actual; debe existir primitiva persistente verificable antes de certificar integridad. No inventar GO.
- Datos de inventario de Compu Store: **sin mutaciones por esta intervención**; sin deploy público de frontend.
