# TRP — Continuidad P0/P1 y puente de producto para los dos chats

**Fecha:** 20 de noviembre de 2026 (Costa Rica)  
**SaaS:** Base44 `695d708948469128f473d080` · GitHub `neowisecostarica-rgb/techrepair-pro-app`  
**Estado:** código candidato en validación; **RELEASE NO-GO / SIN AUTORIZACIÓN PARA PUBLICAR**.

## 1. Autoridad de producto — no sustituir ni abreviar

La única definición de producto es [TRP-PRODUCT-DEFINITION-MB2-2026-09-15.md](TRP-PRODUCT-DEFINITION-MB2-2026-09-15.md), respaldada por [TRP-MASTER-ROADMAP-SOT-2026-09-15.md](TRP-MASTER-ROADMAP-SOT-2026-09-15.md). Este documento **no redefine TRP**. El otro chat desarrolla solamente la **página comercial**; no debe condicionar, reducir ni reescribir el alcance del SaaS.

**Promesa funcional integral:** TRP (Technology Reliability Platform) es el sistema operativo para negocios de servicio técnico con custodia de equipos. La OT y su expediente son el centro del dominio, de recepción a entrega y cobro. CRM, Caja, Inventario, Agenda, análisis, portales, calidad y reciclaje existen como capacidades coordinadas, no productos independientes.

**Proceso canónico F0–F8**, siempre conservarlo:

| Fase | Capacidad funcional que debe existir |
|---|---|
| F0 Activación | Organización, sucursal, reglas mínimas, guía a primera OT |
| F1 Recepción | Cliente, equipo, motivo, condición, evidencia, prioridad, OT |
| F2 Triage | Cola de revisión, asignación, política de diagnóstico |
| F3 Diagnóstico | Bitácora técnica, DMR, pruebas y hallazgos |
| F4 Decisión | Cotización, enlace público, aprobación/rechazo trazado |
| F5 Reparación | Ejecución, repuestos, reservas, consumos, bloqueos |
| F6 QA técnico | Pruebas finales y cierre técnico |
| F7 Cobro y entrega | Caja, comprobante, evidencia, garantía cuando corresponda |
| F8 Post-servicio | Portal, historial, garantía y trazabilidad; calidad/reciclaje según contexto |

**Navegación objetivo:** Hoy (por rol), Taller (Órdenes, Agenda, Inventario), Clientes y Ventas (Clientes, Cotizaciones, Caja y Cobros, Garantías), Negocio (Resumen/Finanzas/Operación/Equipo), Administración, y Super Admin SaaS separado. `OrdenesTrabajo` es inbox/kanban/recepción; `ExpedienteOT` es la verdad profunda de cada OT. La simplificación de menú **no autoriza borrar capacidades**.

**Roles preservados:** ORG_ADMIN, BRANCH_ADMIN, CUSTOMER_SERVICE, TECHNICIAN, SALES, INVENTORY y SUPER_ADMIN. Aislamiento empresa/sucursal por autoridad de backend; ningún rol se amplía para facilitar un test.

**Capacidades avanzadas preservadas:** Calidad/No conformidades, Reciclaje, CRM/Leads avanzado, analítica/productividad, supervisión y multi-sucursal avanzadas, automatizaciones, administración SaaS. Son opciones de contexto/paquetes futuros, **no funcionalidades eliminadas**. Naming/branding comercial, planes/pricing y packaging requieren decisión separada; no introducir precios hardcodeados.

## 2. Hechos verificados en el corte 20-nov

| Área | Estado exacto | Evidencia y límite |
|---|---|---|
| OTs históricas Compu Store | **Datos existentes; lectura previa verificada** | 39 OTs, 29 referencias de Cliente y 36 de Equipo recuperables; captura posterior de lista muestra OTs reales. No migrar de nuevo ni empezar de cero |
| Incidente 500 / cuota | **Causa demostrada para dos gateways; alivio de código** | Logs Base44: 140 `entity_list` por 60 s/llamador; fuente anterior incorporó 429/Retry-After, menor consulta duplicada y ritmo de sondeo menor. La causalidad del antiguo 500 exacto de `listWorkOrders` y paridad runtime siguen pendientes |
| React Query 429 y TypeScript | **CORREGIDO EN CANDIDATO** | `src/lib/query-client.js` tipado sin alterar fail-closed o retry; `typecheck`, `lint`, `build` PASS |
| OT y expedientes | **Contratos PASS; QA E2E PENDIENTE** | Presupuesto consultas 9/9; límites 8/8; recepción atómica 24/24; entrega 35/35; no se hicieron nuevas recepciones ni entregas reales |
| Comercial | **Contratos PASS; QA navegador pendiente** | CRM 8/8, flujo 16/16, integridad 12/12, inventario 22/22, venta 29/29 |
| Seguridad y sesiones | **Contratos PASS; QA auténtico pendiente** | Identidad 7/7, autorización 9 grupos, seguridad 7/7 y round 2 13/13, sesión 10/10, policy 12/12, Super Admin 5/5 |
| Concurrencia de auditoría | **Fixture actualizado; P0 NO-GO** | 3/3 pruebas de **modelo**: CAS simulado 1 fila, no atómico 2 filas, lock ausente fail-closed. No se demostró UNIQUE durable/ACID en runtime |

**Nota sobre los PASS:** son compilación, análisis estático o pruebas automatizadas contra modelos/fixtures. No constituyen certificación de producción ni del piloto humano.

## 3. P0 — bloqueos reales antes de operar o publicar

| P0 | Estado | Próximo criterio de aceptación |
|---|---|---|
| P0-AUD-01 / GitHub #13 | **BLOQUEADO** | Auditoría de efectos de negocio con unicidad **durable** por `(organization_id,audit_operation_id)`; 2+ escritores reales, reintentos, colisiones, fallas y evidencia del almacenamiento. CAS/lease cooperante no equivale a UNIQUE/ACID |
| SEC-QA / GitHub #12 | **BLOQUEADO** | Identidades canónicas y tenant QA 100 % sintético, sin seed de PII de producción; acceso permitido/denegado por rol, empresa y sucursal |
| Efectos externos | **NO VERIFICADO** | Comprobar valor efectivo y alcance completo de `TRP_EXTERNAL_EFFECTS_MODE`, correo, SMS/WhatsApp y cobros; no disparar eventos para probarlo sobre Compu Store |
| E2E comercial + taller | **PENDIENTE** | CRM→cotización→aprobación→inventario→pago→comprobante y recepción→diagnóstico→reparación→QA→entrega en datos aislados, con evidencia de reversión/idempotencia |
| Inventario SALES/OWNER / #15 | **PENDIENTE QA autenticado** | SALES ve stock/precio sin costos/márgenes/edición; OWNER conserva control; documentar negativa de permisos |
| Reconciliación release | **PENDIENTE / NO AUTORIZADO** | GitHub SHA, Base44 checkpoint/editor, hashes/versiones backend en ejecución y app publicada, QA móvil, rollback y autorización explícita |
| Compu Store `getFinancialMetrics` 403 | **DIAGNÓSTICO PENDIENTE** | Capturar respuesta segura y contexto de permisos/rol, distinguir acceso denegado legítimo de fallo; no alterar privilegios especulativamente |

No ejecutar pruebas transaccionales en Compu Store ni configurar nuevo proveedor/secretos por iniciativa propia. La verificación de fuentes/backend puede implicar sincronización de runtime aunque no se pulse Publish: pedir autorización antes de editar `base44/functions/**`.

## 4. P1 — desarrollo/QA posterior al gate P0

- QA visual real de roles, panel Super Admin, recepción y expediente, Cotizaciones/PDF, Caja, importador Excel multihoja (solo previsualización sin importar).
- Onboarding de valor temprano: negocio → sucursal → primera recepción; setup progresivo. Conservar métricas de activación F0–F8 y roles según definición MB2.
- Uniformidad UX/UI de Hoy/Negocio/Operación, jerarquía de navegación, nombres canónicos y adaptación móvil; ocultar complejidad avanzada por contexto, no borrar capacidades.
- Contadores, gráficos y KPIs completos mediante agregaciones/paginación; los límites de 200/500 registros deben explicitarse y certificarse a escala.
- Actividad histórica de auditoría, enlaces/portales y pruebas positivas/negativas de multi-sucursal, incluida reconciliación de ventas y órdenes sin crear registros ficticios en tenant real.

## 5. Roadmap (no etiquetar como funcionalidad ya verificada)

- MB3 posicionamiento/naming y marca; MB4 planes/pricing (sin romper core); MB5 web comercial (otro chat); MB6 piloto y GTM.
- MB7 runtime/cutover; MB8 QA humano E2E; MB9 Publish y piloto autorizado.
- Calidad/Reciclaje contextual dentro de expediente, analítica profunda, multi-sucursal avanzada, automatizaciones y administración SaaS continúan en la visión integral. Profundidad/escala/packaging se valida sin degradar el proceso principal.

## 6. Continuidad y reglas para ambos chats

1. **Chat SaaS TRP:** implementar correcciones P0/P1 seguras en código, ejecutar pruebas y documentar evidencia; no tocar funciones/backend, permisos, datos operativos, facturación, Render ni Publish sin autorización.
2. **Chat de página comercial:** leer primero la definición MB2, este handoff y el roadmap único; presentar capacidades como visión/producto o como validadas según evidencia, **sin afirmar que el beta pasó E2E o release**. El trabajo comercial no cambia el SOT del SaaS.
3. El estado de ingeniería vigente está en `docs/TRP-AUDIT-MASTER-STATUS-2026-11-03.md` y `docs/TRP-BACKLOG-MASTER-2026-11-04.md`; reportar siempre **VERIFICADO / EN DESARROLLO / ROADMAP** y el alcance de cada prueba.
4. Al retomar: comenzar por P0-AUD-01, identidad QA/effects mode y conciliación runtime; reunir una sola ronda de QA auténtico y registrar resultados antes de solicitar GO.
5. Checkpoint Base44 de esta sesión se crea al cerrar los cambios. No se borraron funciones, entidades ni datos existentes.
