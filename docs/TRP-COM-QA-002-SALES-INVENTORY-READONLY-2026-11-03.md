# TRP-COM-QA-002 — Inventario SALES de consulta segura
Fecha: 2026-11-03 | Estado: CORRECCIÓN DE CÓDIGO Y REGRESIONES PASS, QA NAVEGADOR PENDIENTE
Issue: https://github.com/neowisecostarica-rgb/techrepair-pro-app/issues/15

## Hallazgo y decisión
- COM-QA-001 halló enlace visible Inventario para SALES por capacidad `INVENTORY_READ`, pero `src/pages/Inventario.jsx` PageGuard no incluía SALES.
- La política de lectura de `operationalGateway` ya incluye SALES en `OPERATIONAL_ENTITY_POLICIES.Inventario.read`, mientras que create/update/delete están cerrados para todos los roles del adapter. `src/api/base44Client.js` enruta `Inventario.filter()` por ese gateway, no por RLS del navegador.
- `projectOperationalReadResult('Inventario',record,{role:'SALES'})` expone artículo, existencia y precio de venta, **no** `costo_unitario` ni `proveedor`. No se hizo ningún cambio de RLS ni de backend.
- Dirección General ha favorecido continuidad de flujo comercial; decisión técnica implementada: permitir consulta SALES de Inventario sin mutaciones y sin revelar costos o margen.

## Corrección
- `src/pages/Inventario.jsx` PageGuard añade SALES para alinear ruta y capacidad de lectura ya existente. No concede INVENTORY_OPERATIONS ni INVENTORY_ADMINISTRATION.
- SALES solo consulta catálogo, existencias y precios de venta. Se ocultan KPI de valor al costo, costo unitario y margen, porque no debe inferirlos ni verlos.
- Los botones y formularios de crear/editar artículos, ajustar stock y crear categorías solo se montan como ORG_ADMIN, y la búsqueda Enter no abre un editor en SALES. Las funciones backend siguen siendo las autoridades de mutación.
- Conservado alcance por `organization_id` y `branch_id`; rol ORG_ADMIN mantiene alcance de empresa como antes. No se tocaron inventario, organizaciones ni usuarios reales.
- Se actualizó `scripts/verify-commercial-menu-route-alignment.mjs` para exigir cero discrepancias entre menú y PageGuard para las 4 rutas comerciales y 6 roles.
- Nuevo test `scripts/verify-com-qa-002-sales-inventory-readonly.mjs` comprueba políticas, DTO de inventario redaccionado SALES, costos accesibles solo para ORG_ADMIN y supresión UI de formularios y controles.

## Pruebas
- `npx tsx scripts/verify-com-qa-002-sales-inventory-readonly.mjs`: PASS.
- `npx tsx scripts/verify-commercial-menu-route-alignment.mjs`: PASS, sin desajustes.
- `npm run test:inventory-integrity`: 22/22 PASS.
- `npm run test:multiuser-navigation`: 8/8 PASS.
- `npm run test:identity-tenant-security`: 7/7 PASS.
- `npm run build`, `git diff --check`: PASS.
- Checkpoint antes de modificación: `6aea5f700450fb3c28c78b64`, SHA `e12d640992dce2c7fd7bbc22b75a6ed78c364dde`.

## Gate de QA
1. Con `ventas@compustorecr.com` en Base44 Preview, abrir Inventario, leer filas/búsqueda y confirmar que NO aparece costo, margen, valor de stock al costo, Nuevo artículo, Editar, Ajustar, crear categorías.
2. Con `gustavo@compustorecr.com`, verificar que la vista administrativa mantiene controles, datos y valores autorizados. **No activar mutaciones**.
3. Comprobar que SALES solo puede ver existencias de su sucursal y no otra empresa. Tomar evidencia de navegador sin PII/token.
4. Si Inventario no carga o hay error, registrar consola/Network exactos, no cambiar permisos por ensayo y error.
5. Solo tras evidencia real cerrar issue #15; el QA E2E transaccional y P0-AUD-01 siguen pendientes/NO-GO general.
