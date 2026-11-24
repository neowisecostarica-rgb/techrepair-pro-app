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

## Separación ejecutiva de trabajo — 04-nov (vigente)

**Regla:** Construcción/ajustes en código ahora; la aceptación funcional se agrupa en un QA final. Cada cambio sustancial sí exige build y contratos mínimos. No confundir «trabajo inmediato» con aprobación del release. Orden recomendado: MB-01 → MB-02 → MB-03 → MB-04 → MB-05 → MB-06; si un bloque depende de evidencia o permisos, avanzar al siguiente sin simular cierre.

### A. MEGABLOQUES EJECUTABLES AHORA (sin mutar datos reales)
| ID | Qué construir o corregir | Entregable inmediato | Limitación |
|---|---|---|---|
| MB-01 | Auditar brechas de Super Admin y completar únicamente los controles faltantes, reutilizando consola, RBAC y servicios actuales | Código candidato, pruebas de contrato, checkpoint | No cambiar roles reales ni impersonar fuera de permisos autorizados |
| MB-02 | Alinear capacidades, rutas, roles BRANCH_ADMIN/INVENTORY/CUSTOMER_SERVICE/TECHNICIAN y sucursales | Código o inventario de brechas con evidencia, pruebas acotadas | QA auténtico de roles queda en QA-06 |
| MB-03 | Completar flujos faltantes de recepción → OT → diagnóstico → reparación → QA → entrega, sin duplicar pantallas | Ajustes de código, casos de negocio documentados, checkpoint | No tocar órdenes reales ni simular E2E PASS |
| MB-04 | Corregir UX comprobable: alertas de órdenes antiguas, estados vacíos/graficación y catalogación de servicios; reutilizar lo existente | Mejoras justificadas y backlog separado de observaciones no confirmadas | No inventar causas a partir de video; no cambiar clasificación ni datos del cliente automáticamente |
| MB-05 | Resolver el **diseño y factibilidad** de P0-AUD-01 con capacidades existentes: primitiva atómica, contrato y costes, sin falsos cierres | Decisión técnica documentada, prototipo o pruebas de modelo aislado | Implementación runtime y proveedor externo requieren aprobación; riesgo sigue bloqueado |
| MB-06 | Conciliar versiones GitHub/Base44, preparar guía QA única y candidato de beta, sin publicar | Checkpoint maestro, matriz de cambios y checklist | Publish/deploy y GO requieren autorización y QA final |

### B. RESERVAR PARA QA CON EVIDENCIA
| ID | Validación pendiente | Dependencia / fecha |
|---|---|---|
| QA-01 | Excel real: mapeo, precio, tipo, categorías, sucursal, duplicados, vista previa e importación solo si autorizada | Jueves 05-nov |
| QA-02 | Inventario SALES frente a OWNER, sin exponer costo ni ajustes al vendedor; GitHub #15 | Navegador autenticado, lectura solamente |
| QA-03 | Conversión de prospecto a cliente y CRM | Navegador con fixture aislado para escritura |
| QA-04 | Cotizaciones: aprobación, enlace, proforma PDF y estado de envío | Lectura en cuentas reales; mutaciones solo en aislado |
| QA-05 | Caja: productos/servicios, stock, doble confirmación, pago y comprobante | Datos ficticios aislados; nunca COMPU STORE |
| QA-06 | Roles, denegaciones y aislamiento multiempresa/multisucursal; GitHub #12 | Identidad QA estable y membresías canónicas; BLOQUEADO |
| QA-07 | Taller completo: recepción a entrega | Entorno aislado y flujo coherente |
| QA-08 | Auditoría atómica bajo concurrencia: escritores concurrentes/reintentos y filas únicas; GitHub #13 | Primitiva transaccional en runtime autorizada; BLOQUEADO |
| QA-09 | Regresión final multirol, evidencia de versiones y decisión Publish/GO | QA-02..08 según alcance de beta, autorización expresa |

### NO REABRIR / SIN REPETICIONES
- UX-NAV-001 scroll entre módulos TRP: cerrado con confirmación de Dirección General.
- COM-IMPORT-001..003, proforma PDF, CRM-006, QUOTE-007, POS-008 y POS-009: correcciones implementadas y respaldadas; **solo les falta QA funcional**, no rediseño por defecto.
- Issues abiertos en GitHub: #12, #13, #15. No cerrarlos por build ni por pruebas en memoria.
- El Excel real es QA-01 de mañana, no un trabajo de hoy.
- Prioridad comercial y beta 06-nov mantienen dictamen **NO-GO** si P0-AUD-01 permanece abierto.

## Avance MB-01 Super Admin — 04-nov (posterior al split)

- **Reutilización confirmada:** Consola `src/pages/Saas.jsx` existente con administración de organizaciones, entitlements/planes, sucursales, usuarios, auditoría, salud y control de piloto; `TenantManageDialog` mantiene las acciones por organización. `AdminReset` está deshabilitado intencionalmente y **no se reactivó**.
- **Brecha corregida — MB-01A (código PASS):** Cuando `identityGateway.adminOverview` fallaba, `Saas.jsx` usaba `data = {}` y presentaba contadores vacíos como si fueran datos válidos. Ahora la consola principal muestra carga, error explícito y botón de reintento; las acciones y métricas no se renderizan hasta disponer de una consulta válida. Sin modificar funciones de backend, permisos o usuarios.
- **Evidencia:** `scripts/verify-superadmin-overview-fail-closed.test.mjs` 1/1 PASS, lifecycle Super Admin 5/5 PASS, navegación 8/8 PASS, CRM seguridad 8/8 PASS, Vite build PASS.
- **Estado MB-01:** PARCIAL, no finalizado funcionalmente. Requiere QA de consola con Super Admin real, validación de respuestas backend y de errores de consultas secundarias (Branches/OT/Garantías), y verificación de controles sensibles sin efectuar mutaciones productivas. No declarar consola integral GO.
- **Siguientes acciones:** revisar la consistencia de los estados de carga/error de métricas secundarias, continuar MB-02 en código, y agrupar QA de roles en QA-06. Ningún nuevo módulo o vista duplicada.

## Avance MB-01B — Integridad de métricas secundarias de Super Admin (04-nov)
- **Código corregido:** consultas de sucursales, órdenes, garantías y partners ahora distinguen cargando/error/sin datos; indicadores de integridad global muestran «—» cuando alguna consulta de salud no está verificada, no presentan un falso cero. Incluye aviso de módulos sin verificar y reintento selectivo.
- **Preparación de tenants:** la cantidad de sucursales y la condición «Lista» no se declaran como válidas si falla la consulta de sucursales; tabla refleja «Sin verificar», no «0».
- **Partners:** formulario no intenta usar lista no disponible y deshabilita selección si la consulta falló.
- **Pruebas:** test específico `scripts/verify-superadmin-secondary-read-state.test.mjs` PASS, lifecycle Super Admin 5/5 PASS, navegación 8/8 PASS, build PASS.
- **Estado:** MB-01A + MB-01B código completado; MB-01 conserva QA funcional de Super Admin pendiente. No ejecutar acciones administrativas reales para probar ni afirmar beta GO. Continuar MB-02 roles/permisos o cerrar brechas de código acreditadas.

## MB-02A — Alineación real de navegación y roles (04-nov)
- Revisión acotada de menú `src/config/menuConfig.js`, `PageGuard` y capacidades de `roleCapabilities.ts` de ORG_ADMIN, BRANCH_ADMIN, TECHNICIAN, SALES, INVENTORY y CUSTOMER_SERVICE.
- **Corrección concreta:** Garantías se ofrecía a CUSTOMER_SERVICE mediante `DELIVERY_OPERATIONS`, pero `VentasGarantias` solo admite ORG_ADMIN, BRANCH_ADMIN y SALES. Se agregó `tenantRoles` a ese ítem y se aplicó la restricción en el filtro compartido de menú. **No se cambiaron capacidades ni permisos de backend.**
- **Diferencias NO corregidas sin decisión de producto:** Dashboard de técnico admite acceso directo pero no se ofrece en menú; rutas Enterprise son protegidas y no están anunciadas por los presets estándar. No ampliar privilegios automáticamente.
- Pruebas: `verify-mb02-warranties-role-alignment.test.mjs` PASS, navegación 8/8 PASS, flujo comercial 16/16 PASS, compilación PASS.
- **MB-02 estado:** avance de código PASS acotado, QA de roles reales pendiente en QA-06; issue #15 Inventario SALES sigue abierto hasta navegador; #12 y #13 siguen bloqueantes.
- No se modificaron usuarios, organizaciones, pedidos ni datos COMPU STORE, ni Publish/deploy.

## MB-03A — Órdenes de taller: error de carga visible y recuperación (04-nov)
- Se revisaron las pantallas existentes `OrdenesTrabajo.jsx`, `ExpedienteOT.jsx`, la función `createWorkOrder` y la máquina de estados. La recepción ya contaba con correlación e idempotencia; **no se reimplementó ni se creó una pantalla nueva**.
- **Brecha corregida:** una falla de `listWorkOrders` se representaba como `ordenes=[]` sin diferenciar entre vacío legítimo y consulta fallida. Ahora la vista principal presenta un aviso de error con reintento y evita mostrar lista/Kanban/«No hay órdenes» o contadores falsamente vacíos durante el error.
- Pruebas: `scripts/verify-mb03-orders-error-state.test.mjs` PASS; recepción atómica 24/24 PASS; comercial 16/16 PASS; compilación PASS.
- **Estado MB-03:** parcial, no validado en navegador; recepción→diagnóstico→reparación→entrega E2E (QA-07) sigue pendiente con fixtures aislados. No tocar órdenes COMPU STORE ni publicar.
- Seguir con una brecha concreta del expediente/diagnóstico (MB-03B), sin repetir contrato de recepción salvo regresión.

## MB-03B — Expediente OT: errores separados y consulta por empresa (04-nov)
- **Hallazgo corregido:** una falla de lectura de OrdenTrabajo se mostraba como «Expediente no encontrado», confundiendo caída temporal del servicio con OT inexistente o acceso denegado.
- **Código:** `src/pages/ExpedienteOT.jsx` ahora distingue error de consulta, ausencia de OT y contexto de otra organización. Agrega mensaje de error y reintento; consulta principal `OrdenTrabajo.filter` incluye `organization_id: effectiveOrgId` y la caché incorpora el tenant. Conserva guard multitenant y controles de capacidades de expediente.
- **Evidencia:** `scripts/verify-mb03-expediente-read-error.test.mjs` PASS; compilación PASS, flujo comercial 16/16, recepción atómica 24/24, navegación 8/8 PASS.
- **Estado:** código MB-03B cerrado; QA autenticado, diagnóstico/entrega en navegador y E2E con fixtures aislados aún **PENDIENTES**. No modificar órdenes COMPU STORE ni hacer Publish.
- **Próximo trabajo:** MB-03C buscar brecha real de diagnóstico, preparación de reparación o entrega sin reabrir recepción que ya superó contratos.

## MB-03C — Diagnóstico técnico: estado de lectura verificable (04-nov)
- **Hallazgo:** ExpedienteTecnico trataba los fallos de consulta del DMR y diagnóstico como «Sin DMR»/«Sin diagnóstico», dando la impresión incorrecta de que faltaban documentos en órdenes reales.
- **Corrección:** `src/components/expediente/ExpedienteTecnico.jsx` ahora distingue cargando, error de consulta y ausencia real para DMR y DiagnosticoTecnico; alerta de disponibilidad para documento diagnóstico y evidencias; botón de reintento de consultas fallidas. Se reutilizó el expediente existente, sin cambios de estados de OT ni mutaciones.
- **Evidencia:** `scripts/verify-mb03-technical-read-state.test.mjs` PASS, build PASS, `test:commercial-flow` 16/16 PASS, `test:delivery-atomicity` 35/35 PASS.
- **Estado:** MB-03C código PASS; QA de diagnóstico/reparación/entrega en navegador y E2E-OT-001 siguen pendientes. No se publicaron cambios ni se alteraron órdenes COMPU STORE.
- **Continuidad:** avanzar con MB-04 UX operativa o completar brechas justificadas de taller; no recrear módulos ni ejecutar QA E2E hasta el bloque previsto.

## MB-04A — Operación: órdenes atrasadas independientes del período de gráficas (04-nov)
- **Hallazgo corregido:** el panel `Operacion.jsx` filtraba las OTs por fecha de creación antes de calcular los atrasos, y ocultaba órdenes antiguas activas (como las vistas en la grabación) cuando se seleccionaba mes/semana.
- **Cambio:** conservar la consulta de órdenes de empresa/sucursal para calcular OTs activas, demoradas, en cola y técnicos con carga; aplicar el rango de fechas **solo** a las gráficas históricas que requieren período. El error de la consulta de OTs ahora muestra alerta y reintento, evitando interpretar un fallo como «0 atrasos».
- **Evidencia:** `scripts/verify-mb04-overdue-orders-period.test.mjs` PASS, navegación 8/8 PASS, Vite build PASS.
- **Limitación pendiente:** la consulta actual `OrdenTrabajo.filter(query, '-created_date', 500)` obtiene como máximo 500 órdenes. La mejora evita pérdida por filtro local, pero **no garantiza cobertura histórica total en organizaciones mayores**. Revisar paginación/backend apropiado y compatibilidad durante QA; no declarar exhaustividad.
- **Estado:** MB-04A código PASS; QA navegador/estadísticas reales pendiente. No se alteraron OTs ni se publicó.
- **Continuación:** MB-04B revisar si otras gráficas vacías corresponden a datos/período/carga o a un defecto demostrable; no inventar resultados.

## MB-04B — Gráficas y KPIs operativos confiables (04-nov)
- **Causa corregida:** el gráfico Carga por Técnico aún recorría `ordenesTrabajo` filtradas por fecha de creación, aunque los indicadores de carga actual y atraso debían conservar las OTs abiertas anteriores al período. Ahora usa `todasLasOrdenes` ya limitadas por empresa/sucursal/técnico; las gráficas históricas por estado conservan el período seleccionado.
- **Estados de carga/error:** cotizaciones pendientes y garantías por vencer distinguen consulta cargando/error de valor numérico real; muestran «—» mientras no haya resultado verificado y permiten reintentar los indicadores fallidos.
- **Aislamiento de sucursal:** garantía activa se consulta por empresa y sucursal efectiva (BRANCH_ADMIN fijo / selector ORG_ADMIN), no por todas las sucursales mientras el tablero indica una sola.
- **Validaciones:** `scripts/verify-mb04-operational-metrics.test.mjs` 2/2 PASS, navegación 8/8 PASS, Vite build PASS.
- **Límites:** consultas Base44 paginadas hasta 500; no declarar recuentos históricos exhaustivos por encima del límite. QA de datos reales, filtros y estados vacíos pendiente, sin editar órdenes. No publicado.
- **Estado:** MB-04A y MB-04B código PASS; MB-04 requiere QA visual y análisis de clasificación del catálogo «MANTENIMIENTO» antes de cierre funcional.

## Avance MB-05A — Adaptador transaccional candidato, SIN despliegue (04-nov)
- Revisión del escritor `base44/functions/_shared/auditEvent.ts` y ADR actual: el patrón `findExisting` → `AuditEvent.create` sigue **NO ATÓMICO**. La prueba `npm run test:audit-concurrency-boundary` volvió a reproducir dos filas bajo concurrencia; su PASS es prueba de defecto, **NO** solución.
- Se preparó `scripts/candidates/atomicAuditLedgerCandidate.ts` (CANDIDATO AISLADO, fuera de funciones backend vivas). Implementa digest SHA-256 canónico para campos inmutables, `INSERT ... ON CONFLICT ... DO NOTHING RETURNING` + lectura posterior para distinguir idempotencia de colisión; sin datos sensibles en el payload de ejemplo; falla cerrado si no existe conexión autorizada, la lectura es ambigua o cae el almacén.
- Pruebas `scripts/verify-p0-aud-01-candidate.test.mjs`: **4/4 PASS de lógica simulada**, incl. 8 llamadas concurrentes a simulación con restricción UNIQUE, dos empresas, colisión incompatible y caída. Modelo transaccional independiente SQLite 8 escritores PASS; prueba de identidad actual 9/9 PASS; build PASS. **Ninguna demuestra atomicidad PostgreSQL/Base44 real**.
- No se contrató ni conectó PostgreSQL, Render ni ningún proveedor externo; no se agregaron secretos, no se modificó `appendAuditEvent` productivo ni clones empaquetados; no se tocaron organizaciones ni registros reales. Los scripts son preparación de implementación, no mitigación P0 activa.
- **Dictamen: BLOQUEADO / NO-GO para auditoría concurrente.** Para cerrar #13 es imprescindible autorizar/configurar una base con restricción UNIQUE verificable o encontrar en Base44 una primitiva de escritura condicional/única realmente documentada y probada en runtime, integrar el escritor en todos los comandos con efectos de negocio, revisar fail-closed/reconciliación, y contar filas en un test concurrente real. No habilitar cobros reales basándose en las simulaciones.
- Orden de continuidad: MB-06 preparación de candidato y QA sin publicación; resolver decisión de persistencia antes del GO. El piloto sin efectos auditables no sustituye el criterio de liberación.

## MB-06 — Preparación de beta y QA único (04-nov)
- **Candidato fuente:** `1c1c8c2bb5f2ed9b7c1217d62e0f7541e49e2528` confirmado en GitHub y Base44 main; `get_app_status=ready`. La referencia local `remotes/github/main` estaba obsoleta; no hay indicio de merge pendiente por esa referencia.
- **Entregable maestro:** [`TRP-MB-06-BETA-CANDIDATE-QA-2026-11-04.md`](TRP-MB-06-BETA-CANDIDATE-QA-2026-11-04.md) con QA-01..09, bloqueos, evidencia exigida y plan de reversión.
- **Límite:** SHA de editor no valida versión backend efectiva, sin QA visual/E2E y sin publicación. Issues GitHub #12, #13, #15 permanecen abiertos; **NO-GO** para operaciones reales. Excel real pendiente jueves 05-nov.
- **Estado MB-06:** paquete documental y conciliación de fuente completados; liberación NO AUTORIZADA. No abrir una rama/PR de pruebas sin necesidad o autorización.

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


## Continuidad y cierre documental — jueves 05-nov-2026 (MB-06B)
- **Fuente actual comprobada:** Base44 main `e14995d522086675cf0c27ae119deb1adab0ac4e`, `get_app_status=ready`, `git status --short` limpio al iniciar esta sesión. Cambios posteriores al candidato funcional `1c1c8c2` afectan solo documentos (`TRP-P0-AUD-01` ADR, MB-06, README, AGENTS, backlog), según `git log --name-only`; **no prueban despliegue backend ni QA**.
- **Cierre MB-06B:** conciliación documental de SHA y clasificación ejecutiva de pendientes, sin recrear vistas, repetir suites aprobadas ni tocar datos. MB-06 preparación permanece COMPLETADA; release NO-GO y no autorizado.
- **Sin reaperturas:** UX-NAV-001 CERRADO; COM-IMPORT-001..003, COM-QUOTE-PDF, COM-CRM-006, COM-QUOTE-007, POS-008/009 y MB-01A/B, MB-02A, MB-03A/B/C, MB-04A/B permanecen implementados según evidencia del 04-nov. No declarar QA funcional PASS a partir de contratos.
- **QA mínima agrupada:** (1) Excel real: solo previsualización hasta autorización, columnas/precio/stock/tipo/sucursal/duplicados; (2) SALES/OWNER inventario, CRM, cotización/PDF y Caja en lectura; (3) cuando #12 permita fixture aislado, una sola ronda E2E Comercial+OT y pruebas negativas multirol; (4) #13 concurrencia REAL antes de operaciones sensibles; (5) matriz 1440/390 y conciliación runtime, decisión final.
- **Bloqueantes conservados:** #12 identidad y membresía aislada, #13 unicidad atómica auditada en runtime, #15 inventario SALES/OWNER navegador; no cerrar issues sin evidencia. Excel real NO RECIBIDO en esta sesión, no se afirmó previsualización.
- **Límites:** cero Publish/deploy, cero registros de COMPU STORE modificados, cero cambios de usuarios/roles o cobros. **Próximo avance seguro:** QA solo lectura y previsualización de Excel aportado por Dirección General, mientras la decisión sobre persistencia atómica queda pendiente de validación técnica/autorización.


## QA-01 · Análisis sin importación de Excel real (05-nov-2026)
**Fuente revisada:** `Stock In House Proveedores Octubre 2026.xlsx` aportado por Dirección General. **Solo lectura; no importado ni subido a TRP.**
- 10 hojas / 129 filas de artículos: HDDs 72, Laptops 14, CPUS 6, Monitores 14, Combos 4, Insumos 10, POS 2, Encapsulador 2, Docking Stations 3, Quemadores 2.
- Cantidad numérica solo en 73 filas (72 HDD y 1 CPU); 56 registros con `N/A`. **No interpretar N/A como 0**, ni inventario de terceros como existencia propia.
- **DEFECTO DE COMPATIBILIDAD ACTUAL:** `src/components/inventario/ImportarCatalogo.jsx` usa `readXlsxFile(file)` sin navegación de hojas, lee solo primera hoja; el libro no tiene una columna `Nombre`, sino combinaciones de marca/modelo/tipo/capacidad/serie/especificaciones, y los encabezados varían de ubicación por hoja. La lógica vigente mapearía `Tipo` a clase Producto/Servicio, aunque en varias hojas significa NUEVO/REF. No es importable directamente con seguridad.
- **Brechas de mapeo:** `numero_serie` existe en `base44/entities/Inventario.jsonc` pero no en `COLUMNS`/`ALIASES` ni en `itemData` del importador; `Especificaciones` requiere decisión de guardar en `descripcion` o campos técnicos estructurados; NUEVO/REF no es atributo de condición del esquema; Contacto del proveedor necesita decisión de relación con catálogo Proveedores; combos necesitan semántica de kits; distinguir precio de proveedor/costo vs precio de venta.
- **Acción sugerida de megabloque sin datos reales:** extensión del importador existente para múltiples hojas, detector de formato por hoja, nombre compuesto, precio origen vs venta, disponibilidad externa vs stock propio, serial/condición, mapeo de proveedor y vista previa de cada hoja; reglas con valores ausentes no deben generar existencias, costos ni precios falsos. Reutilizar entidades/servicios, no crear vistas duplicadas.
- **Estado QA-01:** ANÁLISIS ESTRUCTURAL PASS; PREVISUALIZACIÓN EN TRP NO VERIFICADA; IMPORTACIÓN NO AUTORIZADA. Requiere decidir origen de precios, propiedad del stock y destino de cada hoja antes de cambiar/importar.


### Decisión producto — búsqueda por código del cliente (05-nov-2026)
- **Regla aprobada:** `codigo_interno` TRP es identificador técnico y NO debe servir como búsqueda comercial. El cliente define su SKU; código de barras externo también puede utilizarse para buscar/escáner. El nombre sigue buscable.
- **Corrección acotada hecha:** `src/pages/Inventario.jsx` excluye `codigo_interno` del filtro de búsqueda; conserva `sku`, `codigo_barras` y `nombre`. Generación interna y visualización de código no se modificaron; no se afectó backend ni datos.
- **Validación técnica:** `verify-commercial-menu-route-alignment.mjs` PASS y `npm run build` exit 0. QA en navegador pendiente; no publicar. Revisar por separado cualquier buscador de Caja/POS y garantizar consistencia antes del release, sin ampliar esta corrección silenciosamente.
- **Aclaración adicional del Excel:** por indicación de Dirección General, Precio es precio de venta público y cantidades son existencias propias (cuando se informan); N/A no equivale a 0. Costo unitario no se deduce del precio de venta.

## TRP-IMPORT-004 — Cierre de código / continuidad 05-nov-2026
- **Evidencia definitiva**: `docs/TRP-IMPORT-004-CHECKPOINT-2026-11-05.md`.
- **Resultado**: parser multihoja integrado al importador existente; 15/15 pruebas sintéticas PASS y compilación Vite PASS; sin importaciones ni registros reales. Lectura local del Excel aportado: 10 hojas, **132 filas** (corrige apuntes previos de 129), 132 precios de venta, 76 cantidades numéricas y **ningún costo de compra**. No completar automáticamente esos valores.
- **Implementado en fuente**: lectura multihoja, normalización por hoja y fila, nombres compuestos, categoría existente, sucursal explícita, SKU y barcode de cliente separados del código interno TRP, número de serie independiente, control de duplicados, N/A y costo desconocido bloqueados, plantilla XLSX extendida.
- **Bloqueo**: actualización del servicio `createInventoryItem` para persistir serie quedó en código fuente pero la herramienta Base44 rechazó la aplicación al backend por imports compartidos `../_shared/*`; runtime NO VERIFICADO, NO cerrar ese gate.
- **QA reservada**: abrir archivo real en la interfaz con rol autorizado, confirmar 132 filas y conteos por hoja sin importación; revisar ventas/POS y búsqueda, categorías/sucursal y datos faltantes; no cargar a COMPU STORE.
- **Estado**: TRP-IMPORT-004 CÓDIGO PARCIALMENTE COMPLETADO / QA BLOQUEADA, RELEASE NO-GO; #12, #13, #15 continúan abiertos. No publicar ni habilitar operaciones reales.

## TRP-IMPORT-005 — 05-nov-2026
Diagnóstico de bloqueo de bundling cerrado: los imports `../_shared/*` existentes quedan fuera del ámbito permitido por el empaquetador de edición Base44. Candidato de bundle aislado esbuild: 8/8 comprobaciones PASS, 83760 bytes, import externo único del SDK y cero rutas relativas. Pruebas de importador 15/15 PASS. Fuente productiva conservada; archivo candidato temporal en `/tmp`, **no desplegado**. No hubo escrituras de COMPU STORE. Ver `docs/TRP-IMPORT-005-CHECKPOINT-2026-11-05.md`. **Estado: solución técnica candidata PASS; runtime NO VERIFICADO; NO-GO.** Continuar con validación aislada y QA real; no cerrar #12/#13/#15.

---

## ACTUALIZACIÓN MAESTRA — SÁBADO 07-NOV-2026 · PRE-QA COMPU STORE

**Este apartado reemplaza el estado operativo antiguo de las secciones del 04–05 nov; conserva el historial anterior solo como referencia.** Estado de MAIN al cierre previo: `d522311a47bfe85e4abfee8d83cb4b3929981879`. Fuentes de verdad actualizadas: `docs/TRP-PRE-QA-COMPUSTORE-MEGABLOCKS-2026-11-07.md`, `docs/TRP-CODEX-LEGACY-ZIP-COMPARISON-2026-11-07.md` y checkpoint de MAIN del 07-nov.

### Cerrado / no repetir
- [x] **MB-AUD**: bloqueo CAS de auditoría por organización implementado y registrado en 23 consumidores de backend. Simulación concurrente PASS y prueba nativa Base44 `update_entities` con dos solicitantes: 1 éxito/1 rechazado. Cubre el defecto read-then-create entre escritores cooperantes; no equivale a índice UNIQUE ni transacción ACID.
- [x] **MB-INVENTARIO**: 4/4 registros actuales de Compu Store correctamente asignados a sucursal Tres Ríos; cantidades verificadas 1/0/0/0; no reimportar ni tocar precios/stock.
- [x] **MB-CAJA**: versiones backend de ventas y anulación registradas; 29/29 pruebas de venta atómica PASS; 16 ventas pagadas históricas conservadas.
- [x] **MB-USUARIOS-COMERCIALES**: ORG_ADMIN, BRANCH_ADMIN y SALES activos, con user_id y usuario Base44 coincidente; dos TECHNICIAN también vinculados.
- [x] **MB-RELEASE**: paquetes de función reconciliados; API de despliegue aceptó versión del checkpoint; URL pública redirige correctamente a login; Base44 MAIN READY. No afirmar UX QA.
- [x] **MB-CODEX-PREP**: encargo de auditoría diferencial ZIP antiguo vs MAIN redactado y guardado, sin ejecutar la comparación.

### Pendientes de verdad — trabajar por evidencia, no repetir contratos
| Prioridad | ID | Pendiente | Responsable / criterio de cierre |
|---|---|---|---|
| P0 | COMPU-QA-2026-11-09 | QA real de Compu Store el lunes 9-nov: CRM→cotización→proforma→Caja, inventario visible, PDF, búsqueda, cobro/reintento y permisos positivos/negativos | Compu Store reporta PASS/FAIL con evidencia; nosotros corregimos defectos |
| P0 | P0-AUD-01 / #13 | Verificar CAS de auditoría en flujo **runtime real** e identificar limitaciones de lease y ausencia de UNIQUE/ACID; revisar trazabilidad de nuevas ventas | Ingeniería/QA de Compu Store, sin asumir exactly-once absoluto |
| P0 | QA-IDENTIDAD / #12 | Recorrido autenticado multiusuario y aislamiento por sucursal/organización; el testing agent previo quedó atascado en onboarding | QA real de roles, sin creación improvisada de cuentas ni duplicación de pruebas |
| P0 | COM-QA / #15 | Revisar por interfaz que SALES vea stock/precio pero no costo/margen ni edición; verificar OWNER/ORG_ADMIN | Capturas reales y permisos efectivos |
| P1 | USR-TECH-UNLINKED | Tercera membresía TECHNICIAN aparece `active`, pero carece de `user_id` y no coincide con User de Base44 | Determinar si es invitación pendiente o cuenta obsoleta; vincular únicamente al usuario correcto con autorización |
| P1 | AUD-HISTORICAL | La consulta a AuditEvent de Compu Store devolvió cero eventos aunque existen 16 ventas `pagada` | Distinguir datos previos del backend de nuevos eventos; no modificar ni fabricar historial |
| P1 | INVENTARIO-EXCEL-REAL | 10 hojas/132 filas de archivo histórico: QA de previsualización, series, SKU, proveedores, N/A, costos ausentes, stocks y duplicados; no reimportar al tenant de Compu Store | Cliente decide si se realizará importación futura, con respaldo y autorización |
| P1 | POS-CONCILIATION | Comprobar reintentos, cancelación lógica de borradores, cobros y reserva/consumo de stock bajo datos ficticios y sesión autorizada | QA lunes; cero escrituras no autorizadas |
| P1 | OT-E2E-001 | Flujo Taller: recepción→OT→diagnóstico→cotización→reparación→prueba→entrega | QA funcional después del comercial |
| P1 | CODEX-LEGACY-ZIP-001 | Comparar primeros ZIP con MAIN para detectar funciones perdidas, reemplazadas o retiradas por seguridad | Codex; obtener ZIP original (no disponible como ZIP en Biblioteca); reporte diferencial, sin merge/deploy |
| P2 | UX-RESTANTES | Revisar presentación móvil, navegación, tabla en cola, gráficos vacíos y consultas paginadas | Abrir defectos concretos solo si QA los reproduce |

### Correcciones directas en MAIN — 18-nov-2026
- **Typecheck:** de 3.149 a 379 diagnósticos (-2.770; 88,0 % menos) al declarar props reales de componentes UI compartidos: Button, Card, Input, Label, Textarea, Badge, Alert, Tabs, Select, Table, Dialog, Toast, AlertDialog y DropdownMenu. No se desactivó `checkJs` ni se suprimieron archivos con `@ts-nocheck`.
- **Corrección funcional Cotizaciones:** `FormularioCotizacion` ahora pasa `effectiveOrgId={organizationId}` a `CrearClienteRapido`; antes enviaba `userAccount` y el componente exigía `effectiveOrgId`, por lo que impedía crear un cliente nuevo desde una cotización.
- **Corrección funcional Taller:** `DashboardOrgAdmin` ahora proporciona a `RecentOrders` un manejador para abrir `/expediente/:id`; antes la tarjeta aceptaba clic pero no navegaba por ausencia de callback.
- **Regresión técnica:** Vite build PASS, ESLint PASS, contrato flujo comercial 16/16 PASS y contrato integridad comercial 12/12 PASS. Sin Publish, datos, permisos, backend ni Render modificados.
- **Pendiente:** 379 diagnósticos de tipos/lógica y QA de navegador autenticado de ambos recorridos. No confundir reducción de diagnósticos con igual número de bugs de negocio resueltos; NO-GO general sin los gates históricos.

### Checkpoint para continuar
- Código: `d522311a47bfe85e4abfee8d83cb4b3929981879`, previo al apunte documental histórico; para estado actualizado usar checkpoint Base44 de 18-nov.
- Enlace publicado: `https://tech-repair-pro-f473d080.base44.app`.
- **PLAN CRITERIO:** cerrar por megabloques en MAIN, reutilizar controles probados, conservar inventario Compu Store y no repetir suites sin cambios. No declarar QA aprobado por el cliente en su nombre.

## Actualización de continuidad — viernes 20-nov-2026 · Prioridades P0/P1 y protección del SOT

**Este apartado es el corte operativo más reciente; los bloques históricos anteriores no se borran ni se reinterpretan.** Leer [TRP-CONTINUIDAD-P0-P1-2026-11-20.md](TRP-CONTINUIDAD-P0-P1-2026-11-20.md) para la matriz integral de producto y el handoff paralelo a la web comercial. La definición oficial del producto sigue siendo MB2 del 15-sep; OT/Expediente y flujo F0–F8 intocables.

- **P0 código corregido:** React Query 429 conserva control de reintento y se repararon dos errores TS2339 de tipado en `src/lib/query-client.js`; `typecheck`, `lint`, `build` PASS. Controles de consultas OT 9/9 y backend 429 8/8 PASS en modelo/contrato. Fuente backend del checkpoint previo ya incluía deduplicación de contexto en `operationalGateway` y respuesta 429/Retry-After en tres gateways; la versión runtime aún requiere reconciliación. Ninguna función backend se editó en esta sesión.
- **P0 auditoría:** test de concurrencia heredado estaba desfasado respecto a CAS por organización. Reemplazado el fixture del test (no writer productivo): 3/3 PASS de modelo, incluyendo escenario negativo sin CAS verdaderamente atómico que **duplica**. P0-AUD-01 #13 **NO-GO**, no existe verificación de unicidad durable ACID.
- **P0 datos/OT:** 39 OTs históricas de Compu Store preservadas y visibles en captura autenticada reciente. El problema de cuota `entity_list` estaba probado en logs; el 403 de métricas financieras se investiga por separado. No se borró ni importó ningún registro.
- **P0 QA y seguridad:** #12 fixture/identidad sintética, #15 Inventario SALES/OWNER, pruebas multitenant/roles, validación de efectos externos, E2E comercial y técnico, reconciliación backend/editor/publicado y autorización de release **PENDIENTES**. Sin Publish, infraestructura nueva, cobros, emails ni mutaciones de Compu Store.
- **P1:** onboarding hacia primera OT, coherencia visual Hoy/Negocio/Operación, QA Super Admin, importación Excel multihoja en vista previa, reportes a escala (evitar truncamiento por límites) y contextualización de Calidad/Reciclaje sin borrar capacidades. Continúan en desarrollo/QA, no certificados en runtime.
- **Roadmap:** MB3 branding/posicionamiento, MB4 packaging, MB5 web comercial en otro chat, MB6 piloto, MB7 runtime/cutover, MB8 QA humano E2E, MB9 publicación autorizada. No crear un roadmap paralelo ni inventar pricing.
- **Regresiones:** SDK 58 firmas, identidad 7/7, autorización 9 grupos, CRM 8/8, flujo 16/16, comercial 12/12, inventario 22/22, venta 29/29, seguridad 7/7 + round2 13/13, sesión 10/10, Super Admin 5/5, policy 12/12, recepción 24/24, entrega 35/35, CAS modelo 3/3; todos PASS en fuente/fixtures. No confundir con QA autenticado.


## Continuidad A1 NEOWISE Quality Engineering — 2026-11-23
- App oficial 695d708948469128f473d080, baseline 3b5b74f (actualización de paquetes sobre b6e1f8f). Se preservan definición MB2, roadmap y todos los pendientes previos.
- Skills realmente consultadas: `neowise-zeus-orchestrator` y `neowise-web-qa` como procedimientos documentales del Skills Hub, `base44-remote-dev` como skill de proveedor. Activación nativa NEOWISE no confirmada.
- Typecheck (alcance jsconfig, no global), lint, build PASS. Regresiones: seguridad round2 13/13, policy 12/12, sesión 10/10, comercial 16/16, venta 29/29, entrega PASS, presupuesto OT 9/9, concurrencia de modelo PASS (NO certifica atomicidad durable).
- De 13 suites FAIL del 19-nov, 4 ya pasaban; 9 fallaban al inicio. Se corrigieron exclusivamente tres scripts de contrato: tokens públicos (8/8), notificaciones (6/6), provisión (6/6), mediante patrones independientes de comillas y conteo de invocaciones await sin incluir declaración; no se alteró backend. Quedan seis FAIL por triage: enterprise-asset-control, enterprise-offboarding, enterprise-onboarding, enterprise-mutation-audit, enterprise-branch-isolation, enterprise-subject-matching. No calificarlos como bugs productivos sin evidencia.
- P0 sin cierre: #13 unicidad durable de auditoría, #12 E2E sintético y efectos externos, #15 QA autenticado de Inventario SALES/OWNER, 403 métricas y reconciliación runtime. No ejecutar Testing Agent con seed de PII ni mutar Compu Store. NO-GO release.
- Nueva dirección aprobada para planificación: TRP Community, gratuito permanente, minimalista, mismo core/seguridad, publicidad discreta; preservar F0–F8 de producto integral y funciones avanzadas. Definir entitlements backend, límites y costo por tenant, privacidad, soporte y modelo de anuncios contextuales/patrocinadores. NEOWISE Ads como capacidad reutilizable futura, sin implementar ni activar cobros/ads antes de viabilidad y QA. No introducir precios o planes definitivos sin aprobación.

### Decisión de Dirección — publicidad centralizada en Maegency (23-nov-2026)
TRP Community será consumidor de espacios/campañas administrados desde Maegency (My Agency), no propietario de un gestor publicitario independiente. NEOWISE Ads queda como concepto transversal bajo Maegency, que ya dispone de la capacidad futura Sponsored Wi-Fi (referencia Wandafy aportada por Dirección, por verificar). TRP solo integrará un contrato de entrega contextual de anuncios, sujeto a diseño posterior, privacidad, aislamiento de datos y costos. No compartir datos de órdenes, clientes, equipos o facturación con anunciantes. No implementar ni activar publicidad todavía; analizar el hub completo antes de definir arquitectura. Fuente cruzada: `neowisecostarica-rgb/maegency-app` — `docs/MAEGENCY-CAPABILITY-SOLUTION-REGISTRY.md`, bitácora 23-nov. No modifica gates P0 ni NO-GO de TRP.

## A2 — NEOWISE QA Enterprise · 2026-11-23
- Baseline c06b314. Se consultaron las seis suites Enterprise y los handlers actuales de activos, onboarding y offboarding; se repararon exclusivamente sus seis scripts de verificación para tolerar espacios, comillas y renombrado del bundler, conservando los predicados de seguridad. Se reforzó la comprobación del filtro de Equipo por organización y vínculo hijo-padre/sucursal en las creaciones.
- 53/53 controles estáticos de las seis suites PASS. Regresión completa de los 56 scripts test:* de package.json: **56/56 PASS**, typecheck configurado y lint PASS. Las 13 suites históricas en FAIL ya pasan en código. No equivale a E2E, ni certifica atomicidad, unicidad o aislamiento runtime.
- Hallazgos pendientes de revisión P0/P1 Enterprise: replay por operation_key de apertura/activos devuelve registros antes de comprobar alcance del registro devuelto; comprobar colisiones de clave entre sucursales/recursos, asignación sin sucursal, integridad audit tras mutaciones y concurrencia. No se explotó ni reprodujo en datos reales; no modificar backend que auto-sincroniza sin autorización. Registrar estos casos en matriz sintética junto con #12/#13.
- Skills: metodología documental neowise-web-qa y neowise-zeus-orchestrator recuperada en A1; base44-remote-dev para ejecución. No se cambió backend, datos, roles, ni publicación. Siguiente A3: preparar validación aislada de Ventas/Taller, diagnóstico de 403 métricas y contrato de seguridad de replays. NO-GO hasta evidencia runtime y E2E. Community/Ads centralizado en Maegency se conserva.

## A3.1 — Taller/Ventas: integridad de lecturas financieras y operativas · 2026-11-23
- Baseline 96ecab7. Skills: `neowise-web-qa` y `neowise-zeus-orchestrator` (procedimientos documentales recuperados en A1), `base44-remote-dev` (ejecución directa). Sin Builder AI, Publish, modificaciones de datos ni funciones backend.
- DashboardOrgAdmin: clave de caché de finanzas incorpora organización, rol, sucursal y período; respuestas OT malformadas dejan de convertirse en listas vacías; consultas financieras/OT sin retry automático, con recuperación manual; errores no se presentan como ceros, se omiten gráficos/listas de OT no verificadas, y se evita sugerir setup incompleto por consultas fallidas o aún cargando.
- Finanzas: consultas de métricas y series separadas por rol/sucursal y período; BRANCH_ADMIN sin sucursal no inicia lecturas; respuesta incompleta se rechaza; error de métricas impide mostrar KPI falsos, error de serie no equivale a ausencia de ventas, con reintentos manuales. Backend conserva roles y guard de sucursal.
- Nuevo contrato `node scripts/verify-a3-financial-read-states.mjs`: 8/8 PASS. `npx tsx scripts/verify-ot-rate-limit-backend.mjs`: 8/8 PASS; `node scripts/verify-ot-query-budget.mjs`: 9/9 PASS; comercial 16/16 y venta atómica 29/29 PASS; typecheck, lint y build PASS. Son pruebas de fuente/mocks y compilación, no QA de navegador ni producción.
- El 403 histórico de getFinancialMetrics y 500 específico de listWorkOrders NO están reproducidos ni cerrados. El código candidato contiene contrato 429 y mitigación de cuota, pero runtime no reconciliado. Pendiente A3.2: QA sintético de roles y operaciones comerciales/taller, sin seed de PII, verificar efecto externo y captura segura del 403/500 en lectura autorizada. A4: seguridad/replay, ledger durable #13. NO-GO general. Mantener Community y publicidad centralizada Maegency.

## A3.2 — QA sintético de Taller/Ventas · 2026-11-23
- Baseline d53394f. Nuevo `scripts/verify-a3-synthetic-qa.mjs` ejecutado mediante tsx: 31/31 PASS. Seis roles, dos empresas, tres sucursales, membresías canónicas, denegación cross-tenant y branch scope, permisos comerciales/técnicos, proyección de inventario SALES vs OWNER y política de correo con transporte falso y cuatro configuraciones no productivas. No red, no cuentas reales, no envío externo.
- Regresiones ejecutadas: recepción atómica 24/24, asignación 22/22, Smart Intake 23 + 12 contratos fuente, técnico multiusuario 7 grupos, inventario PASS, venta atómica 29/29 y entrega atómica PASS. Son simulaciones independientes, no recorrido E2E conectado ni runtime remoto.
- Skills aplicadas: neowise-web-qa y neowise-zeus-orchestrator como procedimientos documentales recuperados en A1; base44-remote-dev para ejecución directa. Sin cambios en backend, datos, permisos, publicación o anuncios.
- A3.2 simulaciones cerradas; QA autenticado real permanece bloqueado por identidad QA aislada, efecto externo efectivo y reconciliación de versión. 403/500 históricos no cerrados. Siguiente A4: reproducir riesgos de replay en fixture sintético y evaluar ledger durable #13, sin sincronizar backend sin autorización. Preservar todos los gates y Community/Maegency Ads.

## A4.1 — Seguridad avanzada: replay Enterprise y ledger · 2026-11-23
- Baseline 4c134eb. `npx tsx scripts/verify-a4-enterprise-replay-boundary.mjs`: 3 defectos reproducidos con handlers fuente y SDK/autoridad simulados (activos, onboarding, offboarding): replay por clave devuelve registro de otra sucursal de la misma empresa. No prueba explotación ni paridad runtime. Prioridad P0 de seguridad antes de release.
- Candidatos aislados en `scripts/candidates/enterprise-replay/` (no se importan en runtime): guard de sucursal sobre registro previo, conflicto de activo/acción/estado o nombre de sujeto. 9/9 controles candidatos PASS (3 negativas cross-branch, 3 replay válido, 3 conflicto). Solución parcial: falta identidad inmutable completa del payload, verificación del actor, auditoría en replay tras fallo, sucursal nula y validación de rama/tenant, concurrencia y revisión antes de integración. No desplegar estos archivos directamente.
- P0-AUD-01: 3/3 pruebas del límite CAS (una reproduce duplicado), 4/4 candidato PostgreSQL con mock, modelo SQLite 8 escritores una fila por clave. No certifica PostgreSQL remoto, ni atomicidad entre negocio y auditoría. Mantener #13 abierto; reutilizar ADR y SQL ya existentes, investigar conexión aprobada y prueba remota aislada antes de cualquier migración.
- Skills: neowise-web-qa y neowise-zeus-orchestrator como procedimientos documentales anteriores; base44-remote-dev para ejecución. Sin cambios en funciones runtime, datos ni infraestructura. Siguiente A4.2: endurecer candidato replay con semántica completa y reconciliación del ledger; aprobación específica antes de sincronizar backend. NO-GO general.

## A4.2 — Replay proof and integration gate · 2026-11-23
- Baseline 45ae83b. New isolated `scripts/candidates/enterpriseReplayProof.mjs` and `scripts/verify-a4-replay-proof.test.mjs`: 19/19 PASS, validates committed receipt, tenant/branch/actor/resource/action/key/payload fingerprint; rejects missing/pending audit, legacy missing hash, malformed payload and changed fields. Existing A4.1 reproduction 3/3 and candidate 9/9 remain. No backend import/integration.
- New integration gate `docs/TRP-A4-REPLAY-LEDGER-INTEGRATION-GATE-2026-11-23.md`: durable reservation, normalization per action, reconciliation after partial writes, receipt authority, privacy and runtime acceptance. PostgreSQL not in sandbox PATH, no external service provisioned. #13 and Enterprise replay P0 remain open. Do not deploy candidate as-is; QA authenticated remains pending.
- Skills: base44-remote-dev execution (procedure from prior blocks), neowise-web-qa / neowise-zeus-orchestrator documented methodology. Next A4.3 decide approved isolated persistent storage and backend integration; can advance independent A5 onboarding review without declaring security closed. No production writes, Publish, roles, ads or costs.

### A5/A6 — Comunidad y crecimiento orgánico en Instagram (23-nov-2026)
Idea de Dirección: invitar a los técnicos de TRP a visitar y seguir la cuenta oficial de Instagram. Propuesta de UX: CTA voluntario «Únete a nuestra comunidad de técnicos» después de activar el taller o en la sección Comunidad; acceso al producto gratuito nunca condicionado a seguir, dar like o compartir. URL oficial configurable, pendiente de confirmar; no inventar cuenta ni hardcodear. Contenido futuro: tips, guías, novedades, experiencias de técnicos y feedback; medir clics agregados sin afirmar que equivalen a follows. Sin implementación, publicación o creación de cuenta en esta intervención. Preservar roadmap A5/A6 y gates de seguridad.

## A5.1 — Onboarding autónomo · 2026-11-23
- Baseline a93b280. Corregido candidato frontend: distinguir falla de identidad de cuenta desactivada, recuperación por verificación antes de repetir creación, no aceptar arbitrariamente múltiples invitaciones, comprobar readiness/owner/sucursal devueltos por backend antes de wizard. Propagar sucursal principal a invitación de roles scoped, guard síncrono de doble clic, validación de correo y copy sin prometer entrega. Equipo opcional para técnico independiente. No prometer acceso a todas las funciones ni no duplicación sin evidencia durable.
- `node scripts/verify-a5-onboarding-contract.mjs`: 12/12 PASS de fuente; provisioning 6/6, identidad 7/7, recepción 24/24; lint/typecheck/build PASS. No QA de navegador ni registro real. Plan inicial backend sigue basic; no activar Community ni cambiar entitlements. Backend inviteUser puede enviar correo, no invocado en QA. Riesgos pendientes: provisioning concurrente y recuperación de membresías no activas, persistencia de wizard, selección multi-org/invitaciones, monedas/idiomas completos, QA con identidades aisladas, envío externo, Community e Instagram configurable.
- Skills: base44-remote-dev consultada y ejecutada; metodología documental neowise-web-qa y neowise-zeus-orchestrator de A1. Sin Publish, datos, funciones backend o cobros. A5.2 pendiente; A4.3 y NO-GO permanecen.

## A5.2 — Continuidad de onboarding y comunidad · 2026-11-23
- Baseline 9dcc9e0. Progreso UX local por app/usuario/organización (solo identificadores y paso), reanudación en la ruta Onboarding tras verificar membresía ORG_ADMIN activa, organización READY/activa y sucursal principal activa perteneciente al tenant mediante gateway. No concede autoridad; no garantiza recuperación en otro dispositivo ni reanudación automática desde cualquier ruta. Se limpia al salir hacia recepción o Mi Día. No se guarda formulario ni datos de clientes.
- CTA Instagram voluntario en paso final, configuración pública de build VITE_TRP_INSTAGRAM_URL; no URL oficial inventada, se oculta si falta o es inválida, se valida HTTPS/perfil/host sin query ni redirecciones. No se rastrea follows ni se condiciona acceso. Pendiente confirmar URL, localización completa y eventual configuración central de plataforma.
- Nuevo test `node --test scripts/verify-a5-onboarding-progress.test.mjs` 13/13, contrato A5 12/12, provisioning 6/6; typecheck/lint/build PASS. Backend conserva plan basic; no activar Community ni pagos. Sin QA autenticado/visual ni cambios en backend, datos o Publish.
- A5.3 pendiente: países/monedas/idiomas, verificación del plan real y recuperación remota, completar onboarding E2E con identidades aisladas. A4.3 NO-GO permanece. Arquitectura web comercial y SaaS separados, una autoridad de identidad/planes en SaaS; preservar apps existentes. Skills: base44-remote-dev ejecución, neowise-web-qa y neowise-zeus-orchestrator metodología documental anterior.

### A6.1 — TRP Community: estrategia creativa y UGC (23-nov-2026)
- Dirección creativa aprobada para backlog: mockumentary original de humor de taller, cámara documental, miradas a cámara, silencios y situaciones reales exageradas; identidad propia, sin copiar personajes, guiones ni marca de The Office. Rodri como posible talento UGC.
- Audiencia: técnicos independientes y pequeños talleres. Tono humano, cercano, humorístico y compartible. Piezas iniciales: «Solo una revisadita», papelito perdido/OT sin registro, taller sin sistema (WhatsApp y papeles), «¿Ya está listo?» y cobros/repuestos olvidados. TRP aparece como solución sin exagerar capacidades no certificadas.
- Entregables pendientes: A6.1a biblia creativa y tono oficial; A6.1b diez guiones originales para Rodri; A6.1c calendario Reels/Instagram, CTA voluntario y prueba de formatos UGC; A6.1d medición agregada de alcance, visitas y activación, sin PII de taller. Confirmar cuenta oficial y autorización de talento antes de publicar. No condicionar acceso gratuito a follows.
- Coordinar con TRP sitio web y Maegency Ads (hub centralizado). Mantener la prioridad A4/A5 de seguridad y activación; no crear campaña, activar anuncios ni gastar presupuesto en esta etapa.

## A5.3a — Robustez de activación y formulario de negocio · 2026-11-23
- Baseline 83aece4, con A5.1/A5.2 preservados. Corregido acceso al getter localStorage: si está bloqueado, el almacenamiento UX es opcional y no interrumpe bootstrap, reanudación o salida. No concede autoridad ni resuelve recuperación remota.
- StepBusinessDetails: formulario nativo con validación de email, guard síncrono de doble guardado y de salto durante escritura; campos deshabilitados mientras guarda. País/moneda: labels vinculados, una columna en pantallas estrechas. No cambiar opciones de moneda sin conciliar formatos y contratos en todo TRP.
- Evidencia: progress 16/16 (incluye getter bloqueado y dos contratos fuente), A5 12/12, provisioning 6/6, identidad 7/7; typecheck configurado, lint y build PASS. Sin navegador autenticado, sin cambios backend ni datos, sin Publish.
- Skills: base44-remote-dev (instrucciones y ejecución directa); neowise-web-qa y neowise-zeus-orchestrator (metodología documental previamente recuperada del Hub, no activación nativa confirmada). A5.3b: conciliar moneda/país/i18n y plan backend, recuperación remota y QA real. A4.3, ledger #13, aislamiento #12 y release NO-GO siguen abiertos. A6.1 creativo registrado, no implementado.

## A5.3b — Confirmación de plan y diagnóstico internacional · 2026-11-23
- Baseline f779975. Alta nueva verifica respuesta de bootstrap y consulta independiente de contexto: mismo usuario, tenant, OWNER activo, país, moneda, organización READY y plan basic / entitlement core / licencia active. Comprueba además sucursal principal coincidente. Si no se confirma, ofrece revalidación sin repetir alta en la misma sesión; no concede privilegios ni activa Community. Recuperación durable tras reinicio y QA real siguen pendientes.
- Corregido getter localStorage de inicialización i18n para evitar caída global si el almacenamiento está bloqueado; conserva selección de idioma del navegador. No se tradujo todo el onboarding.
- Evidencia: 18/18 pruebas nuevas (contextos sintéticos, inicialización i18n, contrato fuente), 12/12 A5, 16/16 progreso, 8/8 i18n foundation; typecheck, lint y build PASS. No se ejecutó bootstrap real.
- Hallazgo P0 de lanzamiento internacional: 35 archivos fuera de diccionarios contienen símbolo CRC, incluyendo POS, cotizaciones, PDF, recibos, portales; DTO publicOrganization no proyecta moneda y Venta/Cotizacion/Garantia no declaran currency. Selectores onboarding y Super Admin tienen catálogos dispares. No ampliar mercados ni cambiar monedas de registros existentes hasta definir moneda histórica de documentos, proyección pública autorizada, redondeos, impuestos, importación y formato por tenant; no inferir USD o CRC de idioma. A5.3c: diseño de contrato monetario y migración segura, prueba de montos en CRC/USD/MXN/EUR; autorización necesaria para backend.
- Skills: base44-remote-dev consultada y ejecutada, neowise-web-qa / neowise-zeus-orchestrator metodología documental previa. Sin Publish, funciones backend, usuarios/datos ni cobros. A4.3/#12/#13/#15, 403/500, QA runtime y A6.1 pendientes; NO-GO.
