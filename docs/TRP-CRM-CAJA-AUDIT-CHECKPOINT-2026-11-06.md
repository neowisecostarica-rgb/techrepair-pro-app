# TRP CRM/Caja/Auditoría — checkpoint incremental (2026-11-06)

Aplicación: TRP (695d708948469128f473d080)
Rama Base44 única: trp-sales-mb01-20261106
Base al iniciar: commit 349cef32e67fd603bfb7bcddd53c7e619653e090

## Implementación en código (no publicada)
- crmGateway/entry.ts: cuando Lead.converted_to_cliente_id existe, consultar cliente por ID+organización+sucursal antes de afirmar idempotencia; rechazar referencia huérfana y diferente identificación con 409. No proyectar cliente null como éxito.
- crmGateway/entry.ts: si la conciliación posterior encuentra cliente concurrente diferente, responder 409 CRM_CONVERSION_CONCURRENT_CONFLICT, no afirmar conversión exitosa sin que Lead apunte al cliente.
- Se preservaron roles autorizados, comprobación previa de duplicados y flujo original de conversión.

## Evidencia nueva
- Compilación npm run build exit 0; git diff --check sin problemas.
- Aserciones estáticas específicas de cambios 7/7 PASS; no repetición de suites históricas.
- No hay QA autenticada ni prueba de concurrencia de Base44, solo revisión y validación sintáctica/estática.

## Caja
- De lotes anteriores: ninguna eliminación de venta desde UI; operacionalGateway deniega Venta.delete para todos los roles. Los borradores se conservan.
- Cancelación definitiva trazable e idempotente NO implementada. Exige diseño del comando soberano y pruebas de estado contra backend aislado, sin tocar datos reales.

## Auditoría atómica
- Confirmado el patrón no atómico findExisting -> AuditEvent.create de base44/functions/_shared/auditEvent.ts y copias empaquetadas.
- Existe scripts/candidates/atomicAuditLedgerCandidate.ts y ADR/modelos previamente simulados; no es garantía real de UNIQUE.
- P0-AUD-01/#13 continúa BLOQUEADO; no se han conectado almacenes transaccionales ni cambiado el writer productivo.
- No afirmar GO para ventas reales, piloto o merge sin cierre de este defecto y validación de concurrencia.
- #12 identidades de prueba aisladas sigue bloqueando QA de permisos y concurrencia real; #15 QA de inventario SALES/OWNER sigue abierta.

## Política de cambios
Solo rama aislada de código; no main, merge, Publish, deploy, usuarios de prueba reales, movimientos de inventario ni COMPU STORE. Un único merge al final sujeto a QA agrupada. Progreso CRM/Caja PARCIAL y P0 audit NO-GO.
