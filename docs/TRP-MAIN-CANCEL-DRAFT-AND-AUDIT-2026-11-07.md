# TRP — MAIN · Caja, anulación de borradores y auditoría (7 nov 2026)

## Implementado en MAIN
- Nueva función backend `cancelDraftSale`, fuente legible `scripts/candidates/cancelDraftSaleSource.ts`, build autónomo en `base44/functions/cancelDraftSale/entry.ts`, descriptor de función.
- Ruta backend autenticada limitada a ORG_ADMIN, BRANCH_ADMIN y SALES, scope org/sucursal validado.
- Anulación **lógica** `borrador → anulada` con `Venta.updateMany` condicional por estado, sucursal, org y ausencia de `cancel_operation_id`; no se elimina Venta.
- Bloquea ventas procesando/pagadas/inconsistentes, efectos de inventario o postventa comprometidos y rollback parcial/fallido. Conserva operation_id, usuario y fecha en esquema de Venta.
- Reintento del mismo operation_id detecta anulación previa; evento AuditEvent se intenta registrar/reconciliar. Fallos o incertidumbre no se anuncian como éxito.
- En Caja, el diálogo de conversión antigua permite «Volver sin eliminar», «Anular borrador» y «Continuar conversión»; el botón solo invoca backend cuando se está mostrando un borrador precargado.
- Se preservó la validación de cobro e inventario, sin escrituras ni modificaciones a los datos de Compu Store.

## Evidencia
- 11/11 PASS — 5 contratos de fuente de nueva función y 6 tests de reglas candidatas. **No son ejecución runtime autenticada**.
- 29/29 PASS — venta atómica simulada, incluidos bloqueos de identidad del borrador.
- Build Vite PASS; git diff --check PASS.
- Base44 bundle del nuevo backend autónomo sin imports relativos externo a la carpeta.

## Pendientes / dictamen
- La nueva función necesita QA funcional con una venta ficticia en tenant y sucursal controlados. El estado READY o tests de fuente no prueban funcionamiento del servicio en runtime.
- **P0-AUD-01 NO-GO**: appendAuditEvent todavía usa consultar→crear, sin UNIQUE transaccional; dos escritores concurrentes pueden duplicar AuditEvent. La anulación lógica/CAS de Venta NO constituye una solución del ledger, y escritura de evento tras CAS NO es transacción ACID con Venta.
- Antes de certificar cobros simultáneos o entrega operativa, resolver esa garantía y probar reintentos/carreras reales.
- No se publicó una nueva versión pública ni se alteró inventario real. Trabajar en MAIN.
