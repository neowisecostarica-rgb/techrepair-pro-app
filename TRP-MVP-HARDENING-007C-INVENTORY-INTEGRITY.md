# TRP-MVP-HARDENING-007C — P0-03 Inventory Integrity

## Estado de cierre

**CODE READY — LEGACY DATA GATE REQUIRED**

La implementación queda preparada en el RC, pero no debe considerarse cerrada en un entorno con datos reales hasta desplegar y ejecutar `auditInventoryLegacyData` como `ORG_ADMIN`. La auditoría es estrictamente de solo lectura y no corrige, migra ni elimina registros.

## Semántica canónica

- `AVAILABLE = Inventario.cantidad_disponible`.
- `RESERVED = Inventario.cantidad_reservada`.
- `ON_HAND = AVAILABLE + RESERVED`.
- Solo `inventoryMutationService` modifica las dos proyecciones físicas.
- Todo cambio físico crea un registro append-only en `InventarioHistorial`.
- Una compensación crea `REVERSAL`; nunca elimina ni edita el movimiento original.
- Toda operación exige `organizationId`, `branchId`, actor y `operationKey` estable.

Movimientos soportados: `INITIAL_BALANCE`, `RESERVE`, `RELEASE`, `CONSUME`, `RETURN`, `SALE`, `ADJUST_IN`, `ADJUST_OUT` y `REVERSAL` interno.

## Autoridad y concurrencia

El servicio adquiere recursos ordenados, calcula un fingerprint determinista, verifica idempotencia persistida, aplica CAS sobre `AVAILABLE + RESERVED` y confirma ledger y reserva. Una respuesta ambigua se reconcilia mediante `last_inventory_operation_key` y `last_inventory_movement_key`. Un fallo parcial multi-item se compensa con movimientos inversos append-only.

`updateInventoryItem` solo admite metadatos de catálogo. Rechaza tenant, sucursal, ambas cantidades, fecha física y marcadores internos con `INVENTORY_SOVEREIGN_FIELD_FORBIDDEN`.

## Flujos migrados

- Crear producto: persiste la ficha en cero y materializa la cantidad inicial mediante `INITIAL_BALANCE`.
- Ajuste manual: requiere `operation_key` estable y usa `ADJUST_IN` o `ADJUST_OUT`.
- POS/venta: usa `SALE`; consulta inventario por organización y sucursal exactas.
- Cotización aprobada: reserva las líneas físicas mediante `RESERVE` y `InventarioReserva`.
- Cancelación de OT: libera reservas todavía activas una sola vez mediante `RELEASE`.
- Actividad técnica: asociar un repuesto no consume. Solo la confirmación explícita con cantidad ejecuta `CONSUME`.
- Facturación OT: una reserva pendiente se consume; una reserva ya consumida se factura sin un segundo decremento.
- Devolución lógica: `RETURN` repone disponible y conserva la trazabilidad de la reserva.

La identidad canónica de líneas de cotización es `referencia_id`. `item_id` solo se admite como lectura legacy cuando no entra en conflicto; cualquier referencia ausente, contradictoria o fuera de sucursal falla cerrada.

## Gate de datos legacy

Después de desplegar las entidades y funciones, ejecutar:

1. `auditInventoryLegacyData` con una sesión `ORG_ADMIN` por organización.
2. Conservar la respuesta completa como evidencia de despliegue.
3. No habilitar el cierre P0-03 si `gate` es `REQUIRED` o `truncated` es `true`.
4. Abrir un plan de remediación separado para faltantes de sucursal, proyecciones negativas, stock sin ledger, movimientos legacy, referencias de cotización/diagnóstico, actividades sin cantidad, reservas inválidas o solicitudes cumplidas sin movimiento.
5. Repetir la auditoría hasta obtener `gate: PASS` y `truncated: false`.

Este RC no incluye escrituras de backfill porque la política exige inspección previa y autorización separada para cualquier reparación de datos históricos.

## Verificación automatizada

- `npm run test:inventory-integrity`: concurrencia, idempotencia, proyecciones, reservas, fallos parciales, reversión, políticas y contratos de integración.
- `npm run test:atomic-sale`: atomicidad comercial, venta POS/OT, reservas consumidas y prevención de doble decremento.
- `npm run test:commercial-integrity`: aprobación pública, reserva física y recuperación ante fallos parciales.
- Regresiones de seguridad/autorización, lint, typecheck y build forman parte del gate del RC.

## Exclusiones respetadas

No se modifican `CEOs/`, `src/backend-sot`, P0-05, P0-07, delivery, warranty ni Wise Brain. No se agrega un segundo sistema de inventario.
