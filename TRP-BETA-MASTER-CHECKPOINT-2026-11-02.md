# TRP — Checkpoint maestro beta privada
Fecha: 2026-11-02
Estado global: PRE-BETA / NO-GO (sin aprobación funcional)
Objetivo condicional: viernes 2026-11-06
Repositorio fuente: neowisecostarica-rgb/techrepair-pro-app
Aplicación: https://app.base44.com/apps/695d708948469128f473d080/editor/preview

## Matriz de seguimiento autorizada
| ID | Frente | Estado |
| --- | --- | --- |
| COM-001 | CRM y conversión de prospectos | En auditoría |
| COM-002 | Cotizaciones y proformas | Pendiente |
| COM-003 | Inventario y existencias | Pendiente |
| COM-004 | Ventas, cobros y cancelación | Pendiente |
| SEC-001 | Roles y permisos comerciales | Pendiente |
| ADM-001 | Super Admin | Pendiente |
| P0-AUD-01 | Auditoría y piloto restringido | Bloqueado |
| E2E-001 | Circuito comercial completo | Pendiente |
| OT-001 | Recepción hasta entrega | Pendiente |

## Evidencia obtenida hasta este checkpoint
- Inspección estática parcial en GitHub de src/pages/CRM.jsx, src/api/crm.js y base44/functions/crmGateway/entry.ts; se observó discrepancia entre PageGuard CRM y ALLOWED_ROLES backend para CUSTOMER_SERVICE. Sin QA autenticado, no se declara FAIL runtime.
- Inspección estática parcial de src/pages/VentasCotizaciones.jsx, src/pages/PuntoVenta.jsx, src/pages/Inventario.jsx, src/components/ventas/GestionCotizaciones.jsx y src/components/cotizacion/FormularioCotizacion.jsx.
- Crear/editar cotizaciones usa llamadas directas a entidades en componentes revisados; amerita revisión de autorización y auditoría.
- PuntoVenta utiliza createSale con idempotency_key; también contiene un borrado directo de venta borrador al cancelar conversión antigua. No se certifica atomicidad o autorización sin pruebas.
- Checkpoints históricos revisados: TRP-MB10C-PRE-GO-CHECKPOINT-2026-09-25.md, TRP-RC-006-REPORT.md, TRP-PILOT-01-V2-OPERATOR-ONLY-RUNBOOK.md. El runbook mantiene expresamente P0-AUD-01 abierto.

## Límites de evidencia
No hay prueba autenticada del runtime Base44 actual, reconciliación confirmada de código publicado/editor contra GitHub, ejecución nueva de suites, E2E real, integración nueva, merge funcional ni publicación. Ningún frente está VALIDADO/PASS.

## Control de alcance
1. Conservar módulos, datos y arquitectura existentes.
2. Prioridad comercial: CRM → cotizaciones/proformas → inventario → ventas/cobro → historial de clientes; integrar con recepción → OT → diagnóstico → reparación → entrega.
3. Seguridad, aislamiento tenant/branch, Super Admin y P0-AUD-01 son controles transversales obligatorios.
4. Trabajar bloques de 2 horas, alternando con Nexora.
5. Separar siempre código, pruebas, integración y publicación.
6. No declarar beta lista por tests automáticos. GO condicionado a QA autenticado y gates de seguridad.
7. No ampliar alcance a mejoras UX no bloqueantes.

## Próxima acción exacta
TRP-COM-001-B: auditar autorización y trazabilidad de crmGateway, FormularioCotizacion, createSale y movimientos de inventario; registrar P0/P1 con rutas y evidencias. Después ejecutar QA autenticado en ambiente de prueba controlado.

## Cierre de bloque
Código funcional: sin cambios.
Pruebas nuevas: no ejecutadas.
Integración funcional: ninguna.
Publicación: ninguna.
Estado release: PRE-BETA / NO-GO.
