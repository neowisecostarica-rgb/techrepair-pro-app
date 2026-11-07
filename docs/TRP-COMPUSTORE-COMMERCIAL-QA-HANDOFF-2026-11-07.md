# TRP · Entrega de código comercial y QA de Compu Store · 2026-11-07

**Fuente:** Base44 MAIN, posterior a merge PR #16 (base af626dbb). Inventario de Compu Store sin escrituras en este lote.

## Cerrado en código MAIN
- Recuperación del fixture de venta precargada: ids de cotización y OT consistentes con nuevos guards. La suite de venta atómica ahora tiene **29/29 PASS**, incluido nuevo escenario de rechazo de 4 conflictos (cotización, OT, cliente y sucursal) sin descontar inventario.
- Caja: gateway de venta, validación de cobro e idempotencia conservados; 29 pruebas de escenario en memoria PASS, **no** certificación de transacción runtime.
- Inventario: 22 contratos de integridad PASS; importador multihoja sintético 15 PASS; no se realizaron importaciones ni actualizaciones al inventario de Compu Store. Persistencia de serie en el backend real sin comprobar.
- Seguridad: 7/7 contratos de integridad y 7/7 de identidad/tenant PASS; 9 grupos de autorización operacional previamente PASS. Sin uso de sesiones reales ni test de navegador.
- Cotizaciones: 12/12 integridad PASS; CRM/Customer 360 8/8 y circuito comercial 16/16 en la ronda previa de MAIN. Build de MAIN PASS.

## Distinción imprescindible
- **PASS de contratos y simulaciones:** respalda la fuente, no la versión de funciones desplegadas ni un cobro verdadero.
- **Base44 MAIN READY:** acredita build del editor, no QA de cada función backend ni publicación del sitio.
- **AuditEvent:** el script de carrera reproduce 2 registros con el mismo audit_operation_id. No es garantía transaccional y continúa P0 abierto; no afirmar que los cobros concurrentes están certificados.
- La política de anulación de borrador es solo candidato en `scripts/candidates/cancelDraftSalePolicy.mjs`; aún no existe comando operativo.

## Plan de aceptación de Compu Store
1. **QA comercial solo lectura ya posible:** login OWNER y SALES, panel, CRM, clientes, catálogo, cotizaciones y proforma; capturas por rol y reporte de errores sin mutaciones de inventario.
2. **QA controlada con datos ficticios:** crear Lead, convertir cliente, cotizar, PDF, aprobar; verificar estados. Requiere cuentas efectivas, roles y alcance autorizados en backend runtime.
3. **Caja de prueba y stock:** solamente sobre productos y existencias de fixture que no afecten inventario del cliente; 1 cobro, 1 efecto de stock, 1 comprobante, protección ante doble envío y reintentos.
4. **QA de seguridad y auditoría concurrente:** resolver unicidad duradera del ledger, #12 identidad/fixture y #15 SALES/OWNER navegador antes de dar GO transaccional.
5. **QA Taller posterior:** recepción → OT → diagnóstico → cotización → reparación → QA → entrega.

## Dictamen
**Código comercial integrado y pruebas focalizadas actualizadas. GO para QA de lectura de Compu Store. NO-GO para declarar QA transaccional o entrega integral cerrada.** Ningún dato del cliente fue modificado. Trabajar desde MAIN, sin crear rama nueva.
