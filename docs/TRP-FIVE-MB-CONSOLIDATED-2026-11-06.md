# TRP — Cinco megabloques en una sola rama (checkpoint de ejecución)
Fecha: 2026-11-06 | App: 695d708948469128f473d080
Rama única: trp-sales-mb01-20261106 (6aee203da472b2ecf945baae)
Base: 1d7859d787dea01a8b6af3a9e8f9d744c7750cc3
NO merge, NO Publish, NO deploy, NO cambios a COMPU STORE. Rama de código NO garantiza backend/datos aislados.

## MB-01 Ventas y CRM — PARCIAL
- Ya guardado en TRP-SALES-MB-01-IMPLEMENTATION-2026-11-06.md: Caja no elimina borradores directamente al regresar, Mi Día distingue errores/carga y enlaces/rótulos comerciales corregidos.
- CRM/C360 existentes: gateways protegidos; duplicados de conversión con reconciliación NO prueban unicidad transaccional.
- Candidato no implementado: writer canónico de cotizaciones con validación de estado, snapshots, descuento, rol/sucursal y audit trail; revisar entity RLS antes de migrar componentes. No introducir un endpoint privilegiado sin garantía de seguridad.
- Cancelación definitiva de borradores requiere comando de servidor y validación backend. No eliminar registros en el navegador.

## MB-02 Inventario — PARCIAL
- Corrección en rama: el listado no amplía alcance cuando falta sucursal para roles no ORG_ADMIN; consulta bloqueada y error explícito; KPIs ocultos mientras carga/falla.
- Se conserva búsqueda comercial SKU, código barras y nombre; código interno no forma parte de búsqueda.
- Parser Excel multihoja existente y pruebas anteriores conservadas; TRP-IMPORT-005 solo tiene bundle candidato y persistencia de serie NO certificada. Sin importación.
- Riesgo abierto: QA SALES/OWNER #15, límites de resultados y verificaciones de reservas/stock en runtime.

## MB-03 Taller — INSPECCIONADO, SIN NUEVOS CAMBIOS
- OrdenesTrabajo distingue error y no ofrece vista vacía ficticia; expediente y diagnóstico tienen correcciones previas registradas en backlog.
- En esta sesión NO se replicaron tests ya certificados ni se alteraron OTs. Recorrido recepción-OT-diagnóstico-reparación-entrega sigue pendiente de fixture aislado QA-07.
- Limitación de Operacion: consulta hasta 500 OTs, no declarar recuentos históricos exhaustivos.

## MB-04 Administración y seguridad — PARCIAL
- Se comprobó existencia de PageGuard y fallos explícitos de Super Admin, previamente cubiertos por MB-01A/B y SEC-001. No se modificaron identidades, roles ni consola sin evidencia nueva.
- En métricas de ventas, roles no administrativos dejan de ampliar a toda la empresa cuando falta sucursal; garantías y cotizaciones tienen filtro de sucursal. Errores de consultas se muestran explícitos y bloquean indicadores.
- P0-AUD-01 #13 SIGUE BLOQUEADO: Ledger/uniqueness bajo concurrencia real no resuelto por los contratos/simulaciones. #12 identidad QA multiempresa sin resolver. No inferir GO.

## MB-05 Integración y preparación beta — PARCIAL
- Historial de ventas falla cerrado cuando no existe sucursal autorizada o falla lectura, en lugar de mostrar historial vacío.
- Una ronda de build Vite exit 0 después del último lote; 16/16 comprobaciones estáticas focalizadas PASS; git diff --check sin incidencias.
- Sin pruebas runtime autenticadas, sin uso de navegador, sin carga Excel, sin transacciones. No se repiten las suites históricas.

## Matriz única de aceptación pendiente (no declarar PASS)
| ID | Alcance | Estado |
|---|---|---|
| QA-02/#15 | SALES frente OWNER: inventario stock/precio, sin costo/edición | NO VERIFICADO |
| QA-03 | CRM -> Cliente, duplicados, Customer 360 | NO VERIFICADO |
| QA-04 | Cotización, aprobación, estados, link y PDF | NO VERIFICADO |
| QA-05 | Caja, stock, venta, idempotencia, recibo | NO VERIFICADO |
| QA-06/#12 | Multirol y aislamiento multiempresa/sucursal | BLOQUEADO |
| QA-07 | Recepción a entrega | NO VERIFICADO |
| QA-08/#13 | Registro AuditEvent con UNIQUE y concurrencia en runtime real | BLOQUEADO |
| QA-09 | QA final 1440/390 + reconciliar editor/runtime/GitHub | PENDIENTE |

## Reglas de avance
1. No hacer merge hasta resolver los P0, verificar contractos afectados y ejecutar QA autorizada con datos realmente aislados.
2. No desplegar funciones backend de una rama como si estuvieran aisladas de producción sin comprobar la separación de entornos.
3. No repetir tests completos previamente aprobados; solo pruebas específicas de código tocado y QA consolidada final.
4. Un solo merge al final es preferencia operativa, NO una garantía de seguridad: sujeto a revisión de diff, integridad y autorización.
5. Conservar estos estados como PARCIAL; cinco megabloques fueron abordados, no completados integralmente.
