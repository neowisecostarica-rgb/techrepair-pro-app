# TRP — Cinco megabloques, cierre de lote técnico (2026-11-07)

Aplicación 695d708948469128f473d080 | Rama `trp-sales-mb01-20261106` | Sin merge, sin Publish, sin importación ni escrituras a Compu Store.

## Solicitud de Dirección General
Terminar todo lo posible en código y preparar una sola entrega al operador para pruebas reales. No convertir pruebas estáticas en certificación funcional, no tocar datos reales y no hacer deploy/merge sin validación.

## Cambios implementados en este lote
- `src/components/cotizacion/FormularioCotizacion.jsx`: bloqueo sincrónico de doble envío, validación de sucursal autorizada, bloqueo de edición fuera de estado borrador, feedback explícito ante error; la mutación existente continúa enrutada por el gateway.
- `src/components/ventas/GestionCotizaciones.jsx`: igual bloqueo de envío repetido, guardado restringido por alcance y estado, botón deshabilitado durante solicitud, mensaje explícito de error al guardar.
- Búsqueda comercial, caché tenant/sucursal, Mi Día local y Caja seguras implementadas en checkpoints previos de la misma rama; no se recrearon rutas ni módulos.
- `scripts/candidates/cancelDraftSalePolicy.mjs`: **candidato no productivo** de transición lógica borrador→anulada, restricciones por empresa/sucursal/rol, prohibición de ventas pagadas/inconsistentes, bloqueo de inventario comprometido, reintento idempotente con identidad de operación. No es endpoint ni writer, por tanto **NO cancela realmente ventas**.
- `scripts/verify-draft-cancellation-candidate-20261107.test.mjs`: seis tests de reglas del candidato (no runtime).

## Evidencia de este lote
- `node --test scripts/verify-draft-cancellation-candidate-20261107.test.mjs scripts/verify-quote-catalog-scope-20261107.test.mjs scripts/verify-pos-exact-code-20261107.test.mjs`: **14/14 PASS** (6 política candidato, 3 contratos cotizaciones, 5 lógica POS).
- `npm run build`: PASS; `git diff --check`: PASS.
- No se ejecutaron tests autenticados, de red, de concurrencia PostgreSQL, de navegador o de transacciones.

## Estado de desarrollo: no falsificar cierre
| Megabloque | Código listo en rama | Trabajo abierto |
| --- | --- | --- |
| MB-01 CRM / Cotizaciones / Caja | Frontend reforzado, gateways existentes, búsqueda, historial y errores | **P0** unicidad real Lead→Cliente; writer de cancelación con CAS y audit trail; transacciones E2E no verificadas |
| MB-02 Inventario | Importador multihoja, número de serie en fuente backend, validación costo/stock sin inventar datos, ventas por SKU/barcode | Persistencia real de serie no comprobada, reserva/stock runtime, #15 navegador |
| MB-03 Taller | Flujo previo conservado, sin regresión intencional | QA de OT completa con fixture aislado pendiente |
| MB-04 Permisos / Super Admin | Protecciones y restricciones de sucursal conservadas y extendidas | #12 identidades y dataset separados pendientes; verificación runtime de permisos |
| MB-05 Audit / Integración | Script de carrera reproduce fallo; ADR y SQL candidatos | **P0** #13 audit ledger no transaccional; almacén/constraint UNIQUE no conectado; reconciliación runtime y publicación pendientes |

## Impedimentos reales antes de que el operador haga pruebas transaccionales
1. Ledger autoritativo con restricción UNIQUE transaccional real o tecnología con garantía equivalente, aprobada y aislada. El SDK de entidades Base44 observado no ofrece esa garantía; los mutex JS, consultas previas y upsert sin UNIQUE no la sustituyen.
2. Cerrar CRM Lead→Cliente con misma garantía, o solución probada de consistencia. No convertir el candidato de auditoría en transacción comercial ACID por afirmación.
3. Implementar `cancelDraftSale` como comando soberano con CAS, ACL, ledger persistente, estado `anulada` y replay. No habilitar borrado directo.
4. Preparar identidades/cuentas de prueba con membresías correctas en entorno y backend realmente aislados; **no** usar Compu Store ni instancias productivas.
5. Una sola ronda QA-02..09 y decisión de release con versiones y SHA conciliados.

## Instrucciones de handoff para el operador
Las pantallas se probarán en orden CRM→Clientes→Cotizaciones→Inventario→Caja→Recibo→Taller; se anotará PASS/FAIL/NO VERIFICADO y evidencia por rol (SALES, OWNER/ORG_ADMIN, BRANCH_ADMIN, INVENTORY). La prueba real con escrituras queda retenida hasta cerrar los bloqueos #12 y #13. Conservamos rollback a este checkpoint y un solo merge futuro tras autorización.

**Dictamen: entrega de lote de desarrollo completada, aplicación integral NO CERRADA y beta NO-GO.**
