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
