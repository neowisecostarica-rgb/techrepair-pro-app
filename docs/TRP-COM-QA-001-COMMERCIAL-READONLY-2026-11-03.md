# TRP-COM-QA-001 — Retomar QA comercial tras SEC-020
Fecha: 2026-11-03 | Estado: REGRESIONES DE CÓDIGO PASS, QA NAVEGADOR / E2E REAL PENDIENTES
App Base44: 695d708948469128f473d080 | SHA base: 27901d73998c9771af5717fad128968714b93e39

## Punto de partida comprobado
Dirección General confirmó que abren SALES y OWNER en vista previa; SEC-020/caso GitHub #14 cerrado. No repetir incidentes SEC-016..020 salvo regresión reproducible.

## Resultados de regresión ejecutada en esta sesión
- `npm run test:commercial-flow`: 16/16 PASS.
- `npm run test:commercial-integrity`: 12/12 PASS.
- `npm run test:inventory-integrity`: 22/22 PASS.
- `npm run test:atomic-sale`: 28/28 PASS.
- `npm run test:crm-customer360`: 8/8 PASS.
- `npm run test:multiuser-navigation`: 8/8 PASS.
- `npm run build`: PASS. Esto es validación del **código**, NO prueba funcional del runtime en navegador.
- Nuevo test `npx tsx scripts/verify-commercial-menu-route-alignment.mjs`: PASS con defecto conocido explícito; verifica cuatro rutas, seis roles y hace fallar futuras desviaciones no aprobadas.

## Incidencia concreta nueva — GitHub #15
`https://github.com/neowisecostarica-rgb/techrepair-pro-app/issues/15`
- `SALES` posee `INVENTORY_READ`; `menuConfig.js` muestra Inventario por esa capacidad, pero `src/pages/Inventario.jsx` PageGuard permite solo ORG_ADMIN/BRANCH_ADMIN/TECHNICIAN/INVENTORY. Es una ruta ofrecida que puede rechazar al usuario.
- No se aplicó corrección arbitraria: **la decisión de producto** es si SALES debe consultar existencias con **interfaz estrictamente de solo lectura**, o si se retira Inventario del menú SALES. Nunca conceder permisos de ajustes de stock por arreglar navegación.
- Test registra exactamente el desacople y garantiza que no se introduzcan otros, sin debilitar backend/RLS.

## Checklist para QA real de solo lectura
1. Con `ventas@compustorecr.com`: abrir CRM, verificar lista/carga, navegación entre pestañas, acceso sin error y sin acciones de crear/editar.
2. Abrir Cotizaciones: lista, estados y detalle sin emitir, aprobar, convertir o enviar.
3. Abrir Caja y Cobros: comprobar que muestra interfaz sin confirmar venta, cobro ni descontar stock.
4. Abrir Inventario: **documentar** la discrepancia del issue #15 sin modificar roles. No indicar PASS de lectura si PageGuard lo niega.
5. Con `gustavo@compustorecr.com` (ORG_ADMIN, no Super Admin): contrastar rutas CRM/Cotizaciones/Inventario/Caja en modo lectura.
6. Si alguna pantalla falla: screenshot + consola solo del error (sin token, datos comerciales ni PII), URL de ruta y rol.
7. No realizar operaciones comerciales reales ni crear registros de prueba en COMPU STORE. E2E transaccional requiere dataset ficticio realmente aislado, con aprobación separada.

## Pendientes excluidos de este bloque
- SEC-QA roles adicionales y aislamiento multiempresa/multisucursal en sesión real.
- E2E CRM→cotización→inventario→venta→cobro→comprobante en fixture aislado.
- P0-AUD-01, GitHub #13: duplicación concurrente de AuditEvent, release general **NO-GO**.
