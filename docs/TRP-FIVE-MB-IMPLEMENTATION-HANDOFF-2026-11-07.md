# TRP — Cinco megabloques: cierre de desarrollo y handoff para pruebas reales
Fecha: 2026-11-07
App: 695d708948469128f473d080
Rama única: trp-sales-mb01-20261106

## Decisión de Dirección General
Priorizar implementación y consolidación de pendientes de los cinco megabloques antes de una única fase de pruebas reales con el operador de Compu Store. No repetir QA visual ni suites históricas durante cada lote. Esta decisión **NO autoriza** merge, Publish, deploy, cobros, importaciones reales ni acceso de pruebas sobre datos productivos.

## Lote de implementación completado hoy
- `GestionCotizaciones.jsx`: inventario filtrado por organización/sucursal, consulta de catálogo con clave de caché contextual y gate de sucursal; servicios con caché por empresa.
- `GestionCotizaciones.jsx`: lectura del cliente filtrada por ID+organización+sucursal cuando corresponde, con clave de caché contextual.
- `GestionCotizaciones.jsx` y `FormularioCotizacion.jsx`: búsqueda comercial por nombre, SKU, código de barras y marca; no por `codigo_interno` TRP.
- Se verificó que `src/api/base44Client.js` ya enruta las entidades Cotizacion/Venta por `operationalGateway`; no duplicar gateway a partir de la apariencia de mutaciones del frontend.
- Previo en esta rama: Caja reconoce SKU/barcode exactos y rechaza ambigüedad; Mi Día usa fechas locales; se reprodujo el defecto de doble AuditEvent concurrente con fixture en memoria.

## Evidencia focalizada
- `node --test scripts/verify-quote-catalog-scope-20261107.test.mjs` — 3/3 PASS (contratos de fuente; **no** QA runtime).
- `npm run build` — PASS.
- `git diff --check` — PASS.
- Sin escrituras operativas, QA navegador, pruebas de concurrencia real, importación de Excel ni roles de prueba creados.

## Matriz de estado honesta
| Bloque | Implementación | Falta antes de entregar a pruebas reales |
| --- | --- | --- |
| MB-01 CRM / Caja | Avance parcial; Customer 360 y gateways existentes; mejoras POS y Mi Día | Unicidad Lead-Cliente bajo concurrencia, cancelación idempotente de borrador, validación funcional de recibos/cobros |
| MB-02 Inventario | Importador multihoja preparado y búsqueda alineada; controles de sucursal | Persistencia de serie en runtime, reservas/existencias, prueba SALES/OWNER #15 |
| MB-03 Taller | Componentes y flujos previos conservados | Recorrido recepción→OT→diagnóstico→reparación→cobro→entrega con fixture aislado |
| MB-04 Permisos / Super Admin | Protecciones previas conservadas; lectura cotizaciones más restringida | Identidades aisladas y prueba multiempresa #12, autorización runtime real |
| MB-05 Integración / Release | Compilación y comprobaciones acotadas PASS | Auditoría atómica #13 en almacén transaccional real, QA final y reconciliación de versiones |

## Limitación estructural no solucionable como simple cambio de interfaz
`appendAuditEvent` usa lectura→creación sin UNIQUE; el diagnóstico del 7-nov reproduce duplicados de operación. Candidato de ledger transaccional disponible en `scripts/candidates/atomicAuditLedgerCandidate.ts`, pero no se ha integrado a un almacén real. Una rama de Base44 no garantiza aislamiento del backend; no cambiar escritores privilegiados ni operar sobre Compu Store hasta disponer del entorno seguro.

## Preparación del paquete para operador
1. Congelar alcance de implementación y revisar diferencias de la rama frente a main.
2. Certificar un backend/dataset independiente (organizaciones, sucursales, cuentas SALES/OWNER y registros totalmente ficticios).
3. Cerrar #13 con escritura única real, #12 con identidades aisladas, y resolver backend de cancelación/CRM antes de habilitar cobros.
4. Entregar matriz QA-02..09 para **una sola ronda** de pruebas con evidencias y casos negativos.
5. Unificar hallazgos, corregir lote final y solicitar aprobación expresa del único merge y publicación.

**Dictamen actual: IMPLEMENTACIÓN PARCIAL / handoff preparado, NO listo para pruebas transaccionales reales ni beta GO.** Los cambios ya guardados en rama se mantienen sin publicar.
