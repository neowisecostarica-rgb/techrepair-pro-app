# TRP SALES MB-01F — Caja / Mi Día · 2026-11-07

App 695d708948469128f473d080, rama trp-sales-mb01-20261106. **No merge, Publish, deploy ni escrituras de datos operativos**.

## Implementado
- `src/components/pos/resolveExactCatalogItem.js`: resolución exacta por barcode del cliente o SKU, con normalización, prioridad de barcode y rechazo de identificadores ambiguos. El `codigo_interno` de TRP está excluido.
- `src/pages/PuntoVenta.jsx`: Enter del buscador de Caja usa ese resolver: agrega solo coincidencia única; ambiguos muestran error en vez de agregar producto equivocado; desconocidos conservan aviso preexistente.
- `src/components/midia/MiDiaSales.jsx`: las consultas de citas usan día local; las ventas de hoy se comparan por día calendario local válido (sin UTC date drift).

## Evidencia
- `node --test scripts/verify-pos-exact-code-20261107.test.mjs`: **5/5 PASS**, barcode, SKU, omisión código interno, vacío/desconocido, duplicados y prioridad.
- `npm run build`: **PASS**. `git diff --check`: **PASS**.
- Ninguna QA autenticada o de navegador, ni transacción realizada. La compilación y las pruebas de lógica local NO validan inventario/venta runtime.

## Estado de cinco megabloques
- MB-01 CRM/Caja: **PARCIAL**; esta corrección mejora entrada de artículos y Mi Día, pero transacciones y cancelación de borradores siguen sin validar.
- MB-02 Inventario: **PARCIAL**; SKU/barcode/nombre y búsqueda comercial alineada, #15 navegador pendientes.
- MB-03 Taller: **PENDIENTE E2E**; no se modificó.
- MB-04 Seguridad: **PARCIAL**; #12 fixture e identidad aislada pendientes.
- MB-05 QA/Integración: **PENDIENTE**; #13 auditoría atómica es **NO-GO**, reproducción concurrente en `scripts/verify-audit-race-diagnostic.mjs` (1/1 diagnóstico del defecto).

## Próximo gate técnico
Resolver unicidad persistente y atómica del AuditEvent, con backend aislado y prueba concurrente real; cotizaciones writer, CRM de identidad transaccional y cancelación soberana después. Completar una única QA E2E combinada 02..09 sin repetir suites ya aprobadas. No habilitar cobros reales sin cierre de #12/#13/#15.
