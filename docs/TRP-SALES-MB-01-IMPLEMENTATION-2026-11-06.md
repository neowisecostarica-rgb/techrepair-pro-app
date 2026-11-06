# TRP-SALES-MB-01 — implementación parcial aislada

Fecha: 2026-11-06. Rama Base44: `trp-sales-mb01-20261106` (`6aee203da472b2ecf945baae`). Base: `1d7859d787dea01a8b6af3a9e8f9d744c7750cc3`.

## Cambios aplicados únicamente a la rama
1. `src/pages/PuntoVenta.jsx`: retirada la llamada directa `Venta.delete` del botón que regresaba desde una conversión antigua; ahora vuelve sin borrar el borrador. La cancelación definitiva queda pendiente de un comando backend autorizado, con trazabilidad y control de estado.
2. `src/components/midia/MiDiaSales.jsx`: errores y carga explícitos para CRM, cotizaciones, ventas y citas; un fallo ya no se anuncia como 'sin datos'. Enlace de seguimiento de cotización ahora usa ruta existente `VentasCotizaciones`. Totales visibles expresados en colones y ventas personales del día solo `pagada`.

## Hallazgos aún abiertos, sin cambios backend
- P0 candidato: `FormularioCotizacion` y `GestionCotizaciones` crean/actualizan `Cotizacion` desde frontend. Requiere resolver RLS y writer servidor para garantizar estados/snapshots, no solo desactivar UI.
- P0: P0-AUD-01 (#13): auditoría concurrente sin unicidad atómica en runtime. NO-GO para cobros reales.
- P0: #12 no hay aislamiento autenticado QA multiempresa. No se hicieron mutaciones de datos reales.
- P0 QA: #15 inventario SALES/OWNER no verificado en navegador. Se conservan controles previos de precio, stock, SKU, barcode y ocultamiento de costo.
- P1: `crmGateway` usa chequeo de duplicados y reconciliación Lead -> Cliente, pero no prueba unicidad transaccional bajo carreras. UI CRM y roles backend están alineados en ORG_ADMIN, BRANCH_ADMIN y SALES.
- P1: Mi Día y métricas siguen limitadas por ventanas de 50/200/500 registros y la consulta de citas usa `tecnico_asignado_id`, lo que amerita revisión del vínculo con vendedores. No se falsea cierre funcional.
- P1: Customer 360 tiene gateway existente; QA autenticada pendiente.
- Cotización PDF, enlaces, idempotencia `createSale` y prevención de doble confirmación conservados; no repetir suites ya aprobadas salvo regresión concreta.

## Verificaciones de esta rama
- `npm run build`: exit 0 (observación: aviso de base Browserslist desactualizada).
- Verificaciones estáticas focalizadas 12/12 PASS para los nuevos cambios; `git diff --check` sin errores.
- Sin QA de navegador, sin pruebas de concurrencia runtime ni E2E.

## Matriz de aceptación única pendiente
QA-03 CRM conversión + Customer 360; QA-04 cotizaciones, enlace y PDF; QA-05 Caja, idempotencia, recibo; QA-02 Inventario SALES/OWNER y búsqueda SKU/barcode/nombre; Mi Día, métricas e historial con roles; QA-06 roles y aislamiento multiempresa; QA-08 ledger atómico real; E2E-001 circuito completo. Solo fixtures ficticios en entorno de datos verdaderamente aislado. Medir PASS/FAIL/NO VERIFICADO.

## Restricciones
No se tocó main, no merge, no Publish/deploy, no datos COMPU STORE, no cobros reales. La rama aísla código, **no garantiza aislamiento de datos/backend**, por lo que no se ejecutaron operaciones de escritura. Estado: **implementación parcial de front-end / beta NO-GO**.
