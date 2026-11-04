# TRP — BACKLOG MAESTRO Y CHECKPOINT DE CONTINUIDAD
**ID:** TRP-BACKLOG-MASTER-2026-11-04  
**Corte:** miércoles 2026-11-04, Costa Rica  
**Proyecto:** TRP, Base44 app 695d708948469128f473d080  
**GitHub:** neowisecostarica-rgb/techrepair-pro-app  
**Código candidato antes de esta consolidación:** 75e244a154c4ca0f3a8df63626c0bd4b9149fac0  
**Estado de release:** NO-GO general. No confundir checkpoint, código en editor o tests con aplicación publicada/QA de navegador.

## Decisiones operativas ratificadas
- **Comercial primero**: CRM → cotizaciones/proformas → inventario → venta/cobro → comprobante; luego OT recepción → entrega.
- Beta privada con fecha objetivo viernes **2026-11-06**, condicionada a seguridad y E2E. No prometer entrega como GO sin evidencia.
- **Jueves 2026-11-05:** probar importación con Excel real. No importar datos sin previsualización, categorías, sucursal, precios, existencias y duplicados verificados.
- No repetir auditorías estáticas ni suites ya aprobadas sin cambio relevante. Realizar QA final integrado, con pruebas aisladas y mínimo esfuerzo necesario.
- No Publish/deploy, mutaciones reales COMPU STORE, cobros, cambios de usuarios/roles, ni nuevos proveedores o costes sin autorización.
- Reutilizar entidades, componentes y flujos existentes. No crear vistas duplicadas. No hardcodear precios.

## Correcciones guardadas entre 2026-11-04 y este corte
| ID | Cambio | Evidencia / checkpoint | Estado correcto |
|---|---|---|---|
| COM-IMPORT-001 | Importador de productos y servicios (.csv/.xlsx), vista previa, mapeo, duplicados, confirmación | 6aeb5dbc77c245073cd31b87 | Implementado; importación real pendiente |
| COM-IMPORT-002 | Plantilla Excel .xlsx auténtica, columnas, ejemplos y hoja «Cómo usar» | 6aeb606f90f8fb83f7ff5678 | Código/build PASS |
| COM-IMPORT-003 | Duplicados reforzados, más campos, límite de archivo, prueba XLSX de ida/vuelta | 6aeb6174fd978da578485256 | Contratos PASS; QA con Excel real 05-nov |
| COM-QUOTE-PDF | Proforma PDF desde Cotizaciones y gestión cliente; generador común; corrección jsPDF; creación de dos PDFs con fixture | 6aeb636f045056ed04dac43c | PDF generado PASS; QA visual pendiente |
| UX-NAV-001 | Reset del scroll al cambiar módulo, respetando hash y scroll interno; tooltip de nombres truncados | 6aeb6c5a49e873f648c863fe | CERRADO en TRP con confirmación visual de Dirección General; otros SaaS no modificados |
| COM-CRM-006 | Conversión prospecto → cliente solo cierra tras éxito; previene doble clic y preserva formulario ante error | 6aeb6e68025ce9a020c44f1d | Código PASS; QA E2E pendiente |
| COM-QUOTE-007 | Preparar cotización / copiar enlace con errores diferenciados y bloqueo de clic repetido | 6aeb6fda96da1649eb3dcf6c | Código PASS; QA E2E pendiente; no equivale a envío real al cliente |
| POS-008 | Caja deja de auto-crear artículo diagnóstico y precio fijo ₡10.000 al abrir | 6aeb71148b9a0f7f121a4190 | Código PASS; QA visual pendiente |
| POS-009 | Bloqueo sincrónico de doble confirmación de venta; clave idempotente retenida | 6aeb72d44e13ab200e7471a1 | Código PASS; QA de concurrencia en runtime pendiente |
| COM-QA-002 | SALES consulta stock y precios sin costos, márgenes ni edición | 6aea60dcf531da81176fa1b5 | Contratos PASS; navegador/issue #15 pendiente |
| SEC-020 | Paneles SALES y OWNER vuelven a abrir después de corregir null.split | 6aea334ebebd14e65eecc39e | Confirmación visual de apertura, no de E2E |

## Backlog priorizado vigente
| Prioridad | ID | Trabajo pendiente | Estado | Criterio para cerrar |
|---|---|---|---|---|
| P0 | SEC-QA-015 / GitHub #15 | QA navegador Inventario SALES (lectura: stock/precio sin costo, margen ni controles) y contraste OWNER | PENDIENTE QA | Capturas y navegación con roles reales, sin cambios de registros |
| P0 | SEC-QA-COM | Revisar en navegador CRM, Cotizaciones, Proformas, Caja, recibos y alternancia SALES/OWNER | PENDIENTE QA | Recorrido solo lectura y permisos negativos evidenciados |
| P0 | SEC-013 / GitHub #12 | Identidad de prueba estable, dataset realmente aislado y QA multiempresa/multisucursal | BLOQUEADO | Membresías válidas, acceso positivo/negativo, capturas y logs sin usar COMPU STORE |
| P0 | P0-AUD-01 / GitHub #13 | AuditEvent con unicidad atómica entre escritores concurrentes | BLOQUEADO / NO-GO | Primitiva transaccional autorizada y probada en runtime con colisiones, múltiples organizaciones y reintentos |
| P0 | E2E-001 | Prospecto → cliente → cotización → aprobación → inventario → venta → pago → comprobante | PENDIENTE; depende de #12 y de autorización de prueba | Datos ficticios en entorno aislado, no contratos de código exclusivamente |
| P0 | RELEASE-001 | Conciliar código GitHub, checkpoint/editor Base44, funciones backend runtime, y publicar candidato | PENDIENTE / NO AUTORIZADO | SHA y versión verificables, QA de release y autorización explícita |
| 05-nov | COM-IMPORT-QA | Cargar Excel real, revisar detección de columnas, categorías, sucursal, precios, stock, duplicados y errores | PROGRAMADO PARA MAÑANA | Validación de vista previa y autorización previa a cualquier importación |
| P1 | COM-QUOTE-UX-QA | Ver proforma PDF final, conversión CRM y preparar/copiar enlace en navegador | PENDIENTE QA | Interfaz y PDFs revisados; sin envío real |
| P1 | POS-QA | Caja consulta artículos/servicios configurados, no auto-crea diagnóstico ni genera doble confirmación | PENDIENTE QA | Test de pantalla sobre datos ficticios/sin cobro |
| P1 | ADM-001 | Consola Super Admin: roles, alcance, usuarios y controles globales | PENDIENTE validación funcional | Matriz de permisos y flujos críticos verificados |
| P1 | SEC-001 | BRANCH_ADMIN, INVENTORY, CUSTOMER_SERVICE, TECHNICIAN, cambios de sesión y límites por organización | PENDIENTE QA | Accesos positivos y denegaciones comprobados |
| P1 | OT-001 | Recepción → OT → diagnóstico → reparación → prueba QA → entrega | PENDIENTE E2E | Recorrido real con fixtures aislados y evidencias |
| P2 | UX-VIDEO-002 | Validar órdenes antiguas de cola, gráficos vacíos, CRM sin leads, clasificación «MANTENIMIENTO» | OBSERVACIÓN NO CONFIRMADA | Diagnóstico read-only y decisión de producto, sin inferir defectos |
| P2 | UX-OTROS-SAAS | Aplicar patrón scroll-top a otros SaaS según su router | FUERA DE ALCANCE TRP | Abrir trabajos separados; no asumir despliegue transversal |

## Issues GitHub confirmados abiertos al corte
- [#12 SEC-013 — identidad QA aislada](https://github.com/neowisecostarica-rgb/techrepair-pro-app/issues/12).
- [#13 P0-AUD-01 — unicidad AuditEvent](https://github.com/neowisecostarica-rgb/techrepair-pro-app/issues/13).
- [#15 COM-QA — Inventario SALES/OWNER](https://github.com/neowisecostarica-rgb/techrepair-pro-app/issues/15).
- No cerrar automáticamente estos issues a partir de resultados estáticos ni de la revisión visual parcial.

## Orden de cierre recomendado
1. **Hoy:** cerrar lo documental y preparar checklist único de QA solo lectura (#15 y CRM/Cotizaciones/Caja), sin repetir tests.
2. **Jueves 05-nov:** importar la lista real SOLO tras previsualización validada; registrar PASS/FAIL real.
3. Resolver método seguro de prueba multiempresa (#12), ejecutar E2E aislado de una vez y cerrar gates.
4. Resolver auditoría atómica (#13) sin solución aparente ni nuevo coste no aprobado.
5. Conciliar SHA/editor/funciones desplegadas y dictaminar beta GO condicionado o NO-GO según evidencia.
6. Solo entonces autorización expresa de Publish/deploy.

## Referencias para la siguiente sesión
- docs/TRP-AUDIT-MASTER-STATUS-2026-11-03.md (historial completo)
- docs/TRP-CHECKPOINT-PAUSA-2026-11-03.md (historial de pausa, supersedido operativamente por este backlog)
- docs/TRP-UX-NAV-001-VIDEO-SCROLL-2026-11-04.md
- docs/TRP-P0-AUD-01-ATOMIC-LEDGER-ADR-2026-11-03.md
- GitHub issues #12, #13, #15
