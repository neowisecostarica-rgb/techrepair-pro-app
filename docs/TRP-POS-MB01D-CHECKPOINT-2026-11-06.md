# TRP · POS-MB01D / Caja y alcance comercial — checkpoint 2026-11-06

Aplicación: TRP. Rama: trp-sales-mb01-20261106 (6aee203da472b2ecf945baae).
Base de sesión: commit 9bee6728f2c7311c5b5a2460c3838090eef7753c.

## Código implementado, solo en rama
1. createSale/entry.ts: antes de reclamar una Venta en estado borrador, el servidor compara sucursal, cotización, cliente y OT de origen con los valores comerciales normalizados/autorizados. Rechaza mismatch con 409 y códigos SALE_PRELOAD_BRANCH_MISMATCH, SALE_PRELOAD_QUOTE_MISMATCH, SALE_PRELOAD_CUSTOMER_MISMATCH y SALE_PRELOAD_WORK_ORDER_MISMATCH. No modifica el mecanismo existente de CAS en updateMany.
2. PuntoVenta.jsx: consultas de inventario, clientes, OTs, equipos, cotizaciones y garantías usan contexto de sucursal en su filtro y caché y requieren sucursal para los roles no ORG_ADMIN.
3. DiagnosticoTecnico no tiene branch_id: conserva lectura por organización sujeta a la autorización del gateway; la consulta no agrega un atributo inexistente, y requiere contexto de sucursal antes de ejecutarse.
4. Servicio es de alcance empresarial: permanece filtrado por organización, no por branch_id; no inventar ámbito para servicios.
5. Previamente: retorno de borrador sin borrado en frontend y denegación de Venta.delete en backend.

## Evidencia nueva
- npm run build: exit 0 (advertencia no bloqueante de Browserslist desactualizada).
- 11/11 verificaciones estáticas focalizadas del lote PASS; git diff --check limpio.
- No se ejecutaron suites históricas ni QA de navegador ni tests de concurrencia runtime.

## Riesgos pendientes / no cierre
- La validación estricta de borradores históricos sin campos de origen puede producir 409. Se prefiere no reclamar un borrador ambiguo, y se requiere conciliación autorizada.
- Las cifras/listas de Caja y catálogos están limitados por topes de 200/500 registros; no son métricas históricas exhaustivas.
- P0-AUD-01 GitHub #13 sigue sin UNIQUE atómico certificado. Identidades aisladas #12 y QA SALES/OWNER inventario #15 siguen pendientes.
- La cancelación definitiva de borradores requiere writer idempotente + trazabilidad y pruebas backend aisladas. No está implementada.
- NO-GO para merge/publicación o cobros reales hasta cerrar P0 y QA agrupada.

## Prohibiciones cumplidas
Sin cambios a main, sin Publish, sin deploy ni merge. No se leyeron/modificaron registros de COMPU STORE ni se hicieron cobros o ventas de prueba.
