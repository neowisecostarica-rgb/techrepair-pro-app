# TRP — MB1 AUDITORÍA INTEGRAL DE PRODUCTO

Fecha: 2026-09-15
App: TRP Legacy / Base44 695d708948469128f473d080
Baseline de entrada: TRP MASTER ROADMAP SOT
Objetivo: evaluar el producto que existe hoy como software vendible y operable, no repetir la auditoría de seguridad/P0/P1.

## Panel de evaluación

La revisión se realiza desde ocho lentes simultáneos: Product Management SaaS B2B, dueño/gerente de taller, recepción/servicio al cliente, técnico, inventario/compras, ventas/caja, UX/IA de información y comercialización/onboarding.

## Conclusión ejecutiva

TRP ya tiene sustancia de producto. No es un prototipo de pantallas: existe un workflow de servicio técnico con recepción, OT, asignación, diagnóstico, cotización, aprobación, reparación, pruebas, cobro, entrega y trazabilidad; además incorpora clientes, inventario, agenda, garantías, ventas, finanzas, métricas, calidad, reciclaje, multi-sucursal, roles, portales públicos y administración SaaS.

El principal riesgo de producto ya no es falta de funciones. Es exceso de superficie, duplicación de conceptos y una arquitectura de experiencia que todavía refleja cómo se construyó el sistema en vez de cómo trabaja cada persona durante su día. Antes de pricing/web/piloto conviene concentrar el producto alrededor de un núcleo operacional inequívoco.

## Hallazgos prioritarios

### PA-01 — P0 PRODUCTO: demasiadas superficies para entender el negocio

La navegación de ORG_ADMIN expone simultáneamente Resumen del Negocio, Estado Financiero, Ventas y Ganancias, Rendimiento del Equipo, Análisis de Operaciones y Supervisión en Vivo. Son seis superficies de observación antes de entrar al trabajo operativo.

Riesgo: el dueño debe aprender qué pregunta responde cada pantalla. Esto reduce percepción de simplicidad y hace que un producto potente parezca más complejo de lo necesario.

Decisión recomendada para MB2: diseñar una jerarquía de tres niveles, no seis destinos equivalentes:
1. HOY / atención: lo que requiere acción.
2. OPERACIÓN: flujo, carga, bloqueos y supervisión.
3. NEGOCIO: ingresos, margen, ventas y rendimiento.
Las vistas analíticas profundas pueden vivir como tabs/drill-down dentro de esas superficies.

### PA-02 — P0 PRODUCTO: existen varios centros de mando para la misma jornada

ORG_ADMIN tiene Dashboard, Mi Día, Operación y señales/aprobaciones. Técnico tiene Mi Día, Órdenes, Expediente y Cola según capacidades. Ventas tiene Mi Día/Mis Ventas, CRM, Cotizaciones y Caja.

Riesgo: el usuario puede preguntarse dónde debe comenzar y dónde debe volver después de cada acción.

Decisión recomendada: una home accionable por rol. Mi Día debe ser la bandeja de ejecución; Dashboard/Negocio debe ser lectura gerencial. No duplicar tareas urgentes en múltiples páginas salvo como enlace/drill-down.

### PA-03 — P0 PRODUCTO: la OT debe convertirse en el objeto central inequívoco

El ExpedienteOT ya tiene una buena arquitectura: Header Ejecutivo + Centro de Mando + Bitácora + Técnico + Comercial. Sin embargo OrdenesTrabajo conserva una superficie enorme con múltiples modales/wizards/acciones, y existen páginas laterales para partes del mismo journey.

Decisión recomendada: declarar el Expediente OT como centro de verdad de una reparación. OrdenesTrabajo queda como inbox/lista/kanban y creación; al abrir una OT, el trabajo profundo ocurre en Expediente. Evitar mantener dos experiencias completas de detalle.

### PA-04 — P0 UX: onboarding funcional pero orientado a configuración, no a time-to-value

Onboarding crea organización y luego envía a Settings. El Dashboard posee QuickStart de cuatro pasos: configurar negocio, colaborador, cliente, primera OT. Es una base buena, pero el primer éxito comercial debería ser más directo: “recibí mi primer equipo y ya puedo darle seguimiento”.

Decisión recomendada: convertir onboarding en setup guiado corto y contextual. Mínimo inicial: negocio/sucursal → usuario(s) opcionales → términos/cobro de diagnóstico si aplica → crear primera OT. Clientes/equipos se pueden crear inline durante recepción; no obligar al usuario a comprender toda Configuración antes de trabajar.

### PA-05 — P1 PRODUCTO: configuración está demasiado concentrada

Settings agrupa Negocio, Empresa, Sucursales, Usuarios y Config. Es administrativamente completo, pero mezcla setup inicial, operación recurrente y configuración avanzada.

Decisión recomendada: separar visualmente “Mi negocio”, “Equipo y acceso”, “Sucursales” y “Configuración avanzada”, manteniendo un solo módulo técnico si conviene. El onboarding debe deep-linkear a la sección exacta y no soltar al usuario en Settings genérico.

### PA-06 — P1 PRODUCTO: planes actuales son placeholders técnicos, no pricing aprobado

Saas.jsx contiene un PLAN_CATALOG frontend-only Basic ₡19.900/$39, Pro ₡39.900/$79 y Premium ₡79.900/$149 con descripciones simples. Esto demuestra soporte técnico para planes, pero NO debe tomarse como estrategia comercial aprobada.

Decisión: congelar esos valores como legacy/internal placeholder. MB4 debe definir pricing desde valor/ICP/capabilities después de cerrar MB2 y MB3. No publicar esos precios en la web por inercia.

### PA-07 — P1 PRODUCTO: la diferenciación de planes no está conectada todavía a una arquitectura comercial robusta

Las descripciones Basic/Pro/Premium hablan de sucursal, reportes y usuarios, pero el producto real tiene capacidades mucho más valiosas: trazabilidad, portales públicos, workflow de aprobación, inventario ligado a reparación, multi-sucursal, analítica, calidad, garantías y controles operativos.

Decisión recomendada: definir packaging por outcome/capability, no simplemente por número de usuarios. Evitar castigar crecimiento operacional con límites arbitrarios si no corresponden al costo/valor.

### PA-08 — P1 UX: recepción/OT es poderosa pero demasiado densa

OrdenesTrabajo.jsx supera ampliamente el tamaño de una página normal y contiene creación, edición, smart intake, predignóstico, diagnóstico técnico, cotización, agenda, actividades, cliente/equipo inline, reasignación, cobros, entrega, kanban y detalle.

Riesgo: alta densidad cognitiva, más probabilidad de inconsistencias y mayor costo de aprendizaje/mantenimiento.

Decisión recomendada: separar claramente tres momentos UX sin fragmentar el dominio:
- Recibir: cliente + equipo + motivo + evidencia/condiciones + prioridad.
- Gestionar: lista/kanban y asignación.
- Resolver: Expediente OT.

### PA-09 — P1 PRODUCTO: experiencia del cliente final es una fortaleza comercial subutilizada

PortalCliente, PortalCotizacion, PortalGarantia y PortalComprobante forman una capa customer-facing real con tokens públicos. Esto puede diferenciar TRP frente a software que solo administra internamente el taller.

Decisión recomendada: elevar “experiencia del cliente y aprobaciones sin fricción” a capability principal del producto y de la futura web. En MB2 definir un concepto unificado de Customer Journey/Portal, aunque técnicamente continúen siendo documentos/token flows separados.

### PA-10 — P1 PRODUCTO: trazabilidad y control operacional son otra fortaleza central

Expediente, bitácora, AuditEvent, actividad técnica, custodia, entrega, inventario ledger, aprobaciones y roles forman una historia coherente: saber qué pasó, quién lo hizo y dónde está el trabajo.

Decisión recomendada: esto debe formar parte del posicionamiento de producto. No vender TRP como “otro sistema para hacer órdenes”; vender el resultado: control del servicio desde que entra el equipo hasta que se entrega y cobra. La redacción final corresponde a MB3.

### PA-11 — P1 PRODUCTO: Calidad y Reciclaje son capacidades valiosas pero periféricas para el core inicial

Ambas existen y ya pueden relacionarse opcionalmente con una OT. No obstante, para un cliente nuevo pueden aumentar la sensación de complejidad si aparecen con el mismo peso que OT/Clientes/Inventario/Caja.

Decisión recomendada: mantenerlas como capabilities avanzadas o contextuales. En una OT, mostrar no conformidad/reciclaje cuando aplique; no exigir que el usuario entienda esos módulos el primer día. Revisar packaging en MB4.

### PA-12 — P1 PRODUCTO: CRM puede ampliar demasiado el ICP si se presenta como protagonista

TRP posee Gestión de Leads además de clientes, ventas y cotizaciones. Es útil, pero competir como CRM general diluye la propuesta de servicio técnico.

Decisión recomendada: CRM debe apoyar adquisición/seguimiento del taller, no definir el producto. Mantenerlo subordinado al journey de servicio y ventas.

### PA-13 — P1 UX: inconsistencia terminológica y visual

Existen rastros de nombres históricos (“Antes: Dashboard”, “Antes: Punto de Venta”), estados internos en inglés en CRM, varios estilos de gradientes/emoji, y títulos como Dashboard Ejecutivo, Resumen del Negocio, Mi Día, Supervisión en Vivo. La funcionalidad puede estar correcta y aun así sentirse como varias generaciones del producto juntas.

Decisión recomendada: MB2 debe crear vocabulario canónico y mapa de navegación. MB3 aplica identidad/naming; no hacer rebranding cosmético antes de simplificar IA/UX.

### PA-14 — P1 ESCALA: algunas superficies gerenciales todavía usan límites fijos

DashboardOrgAdmin consulta hasta 500 OTs/clientes; MiDiaAdmin consulta 100 OTs y 50 ventas/cotizaciones. Esto puede ser aceptable para una bandeja reciente, pero no debe confundirse con una métrica exhaustiva. Las métricas canónicas deben venir de endpoints agregados/paginados y las bandejas deben declarar horizonte/recencia.

Decisión recomendada: antes del piloto, etiquetar qué superficies son “bandeja reciente” y cuáles son “métrica total”. MB7 debe certificar que ningún KPI comercial se trunca silenciosamente.

### PA-15 — P1 PRODUCTO: falta una narrativa explícita de activación y éxito

El software sabe crear empresa y primeras entidades, pero no existe todavía un modelo de activación comercial medible.

Propuesta para MB2/MB6:
- Activado: primera OT creada y asignada.
- First value: cliente recibe seguimiento/cotización y la OT avanza al menos una etapa real.
- Operational adoption: equipo usa Mi Día/Expediente durante una semana.
- Business value: dueño puede ver pendientes, tiempos, cobros y estado del taller sin reconstruirlos manualmente.

## Arquitectura de producto propuesta para MB2

No implementar todavía como renombre masivo; usarla como hipótesis a convertir en especificación.

### Nivel 1 — Hoy
Home por rol. Acciones, bloqueos, aprobaciones y trabajo que requiere atención.

### Nivel 2 — Taller
Órdenes (inbox/kanban/recepción), Agenda, Inventario contextual y acceso al Expediente OT.

### Nivel 3 — Clientes y Ventas
Clientes, Cotizaciones, Caja/Cobros, Garantías. CRM como capability secundaria.

### Nivel 4 — Negocio
Una superficie ejecutiva principal con drill-down a Finanzas, Operación y Rendimiento, evitando seis destinos con igual jerarquía.

### Nivel 5 — Administración
Negocio, equipo/accesos, sucursales, configuración avanzada.

Calidad/Reciclaje se muestran como capabilities avanzadas/contextuales según packaging.

## Qué NO falta

No hace falta inventar otro módulo genérico de tareas, otro CRM, otro dashboard, otro sistema de documentos o otro motor de inventario. La auditoría encuentra suficiente profundidad funcional para un MVP comercial. El trabajo pendiente es concentración, consistencia, onboarding y packaging.

## Gate de salida MB1

MB1 se considera completo cuando este diagnóstico se acepta como base y se transforma en MB2 Product Definition con:
1. ICP primario.
2. Jobs-to-be-done por rol.
3. Core workflow oficial.
4. Arquitectura de navegación objetivo.
5. Capabilities Core vs avanzadas.
6. Lista exacta de cambios UX/funcionales antes del piloto.
7. Vocabulario canónico.
8. Métricas de activación/adopción.

## Orden recomendado

No entrar todavía a precios ni página web. Primero MB2 convierte estos hallazgos en una definición cerrada del producto y en un backlog pequeño de simplificación. Luego MB3 Naming/Positioning, MB4 Pricing/Plans, MB5 Website, y finalmente Pilot/Runtime/QA/Publish según el Master Roadmap.
