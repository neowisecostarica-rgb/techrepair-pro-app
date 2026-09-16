# TRP — MASTER EXECUTION PLAN / SOT

Fecha: 2026-09-16
Estado: ACTIVE — SINGLE ROADMAP
Producto: TRP — Technology Reliability Platform
Territorio: Technology Asset Operations
App Base44: 695d708948469128f473d080

## REGLA MAESTRA
Este documento consolida el plan de ejecución vigente. No crear caminos paralelos ni volver a abrir bloques cerrados sin evidencia de regresión. QA humano E2E se mantiene al final, como decisión de producto/ejecución.

### Contexto canónico recuperado del 15-Sep
Fuente obligatoria: `docs/TRP-CONTEXT-RECOVERY-2026-09-15.md`.
Ese documento conserva la auditoría amplia de producto/comercial/Enterprise/web/licenciamiento/piloto y las decisiones que originaron este roadmap. No depender de memoria conversacional para reconstruirlas. Si una decisión posterior entra en conflicto, registrar explícitamente la reconciliación/SUPERSEDES en el SOT.

## DECISIONES CERRADAS
- Marca: TRP.
- Significado oficial actual: Technology Reliability Platform.
- Origen histórico: Tech Repair Pro.
- Territorio/categoría: Technology Asset Operations.
- Naming cerrado salvo bloqueo legal/marca serio.
- MB1 Product Audit: cerrado.
- MB2 Product Definition: cerrado.
- Hardening/ingeniería base: cerrado suficiente para continuar producto; no reauditar desde cero.
- TRP debe adquirir identidad SaaS propia y dejar de sentirse como NeoWise Design/producto interno.
- Web definitiva se construye después de que exista el TRP SaaS Visual System, para usar screenshots/producto reales.

## MEGABLOQUE A — PRODUCT COMPLETION
Estado: CLOSED — IMPLEMENTATION COMPLETE / HUMAN E2E DEFERRED TO G

Objetivo: terminar el núcleo operacional antes de pricing/web.

Incluye:
- Simplificación del producto y eliminación de superficies/conceptos duplicados.
- Navegación definitiva orientada al trabajo real.
- Command Centers por rol.
- Expediente OT como Source of Truth operacional.
- Workflow F0–F8 coherente: diagnóstico → cotización → aprobación → ejecución → calidad → entrega/cierre.
- Integrar Calidad/Reciclaje a la trazabilidad de OT cuando corresponda.
- Technology Asset Lifecycle: activo → persona → ubicación → historial → intervenciones → costos → decisiones → retiro.
- Onboarding SaaS: organización → sucursal → usuarios/roles → activos → primera OT.
- Optimizar Time-to-Value.

## MEGABLOQUE B — TRP SAAS VISUAL SYSTEM
Estado: CLOSED — IMPLEMENTATION COMPLETE / HUMAN VISUAL QA DEFERRED TO G

Principio: `TRP must look and feel like TRP, not NeoWise Design.`

Objetivo: convertir la aplicación en un SaaS Enterprise reconocible e independiente visualmente.

Incluye:
- Product shell propio de TRP.
- Login/auth experience coherente con la marca.
- Sidebar/navigation/header.
- Command Centers con lenguaje visual TRP.
- Tipografía.
- Iconografía.
- Cards.
- Tablas.
- Formularios.
- Estados y badges.
- Gráficos/data visualization.
- Spacing/densidad.
- Empty/loading/error/success/warning states.
- Microinteracciones.
- Responsive laptop/desktop/mobile/Enterprise displays.
- Consistencia entre módulos.
- Eliminar sensación visual de software interno NeoWise/Base44/genérico.
- NeoWise puede figurar discretamente como creador cuando corresponda, pero TRP es la identidad de producto.

Definition of success visual: una captura del producto debe ser reconocible como TRP aun sin contexto externo.

## MEGABLOQUE C — COMMERCIAL ENGINE
Estado: CLOSED — C1/C2/C3/C4/C5 COMPLETE / WEBSITE HANDOFF READY

Incluye:
- Aplicar Brand Positioning definitivo.
- Narrativa Repair → Reliability.
- Formalizar Technology Asset Operations como territorio.
- Reliability Layer: evaluar availability, MTBF, MTTR, reincidencias, activos en riesgo, mantenimiento y lifecycle.
- TRP Reliability Score queda como hipótesis futura; no comercializar hasta tener metodología validada.
- MB4 Plans: paquetes reales sin heredar automáticamente Basic/Pro/Premium legacy.
- Pricing mensual/anual.
- Unidad de cobro y límites/capabilities.
- Enterprise pricing.
- Onboarding/implementation comercial.
- Entitlements reales en backend.
- Billing: suscripción, pago, renovación, suspensión/cancelación.
- Licensing/activation.

### C3 — RECONCILIATION CLOSED (15-Sep context)
Reconciliado contra `docs/TRP-CONTEXT-RECOVERY-2026-09-15.md`:
- Baseline recuperada del 15-Sep: Core USD 69/mes o 690/año; Business USD 129/mes o 1,290/año; Enterprise custom/contrato anual + implementación.
- La propuesta posterior USD 79/149 queda SUPERSEDED por la baseline recuperada USD 69/129.
- Nombre comercial de trabajo: `Business`; ID técnico de entitlement permanece `advanced` para evitar migración innecesaria.
- No imponer caps artificiales a órdenes/clientes/activos para forzar upgrade.
- Escala inicial por usuarios/sedes se mantiene como hipótesis configurable, no límite hardcoded, hasta validación de piloto.
- Gate cerrado. C4 Billing/Licensing queda habilitado como siguiente bloque.

### C4 — BILLING + LICENSING CLOSED
- Billing, entitlement, license y Organization.status separados.
- Ciclos de billing/licencia explícitos y auditables.
- Activación administrada para piloto.
- Renovación/período/grace/cancel-at-period-end modelados.
- `past_due` no suspende automáticamente la operación.
- Platform Console expone paquete, billing, licencia, renovación y activación.
- Payment provider/webhooks/invoicing/automatic scheduler diferidos hasta selección e integración real; no se simulan.
- SOT: `docs/TRP-C4-BILLING-LICENSING-SOT-2026-09-16.md`.

### C5 — COMMERCIAL CLOSURE CLOSED
- Oferta vendible definida: Core / Business / Enterprise.
- Pricing piloto: USD 69/690, USD 129/1290, Enterprise custom.
- Unidad contractual: organización/tenant.
- Onboarding/implementación separados del SaaS cuando el alcance es material.
- Launch motion: demo/contacto/piloto asistido; no free trial público inventado.
- Límites de claims Reliability y Enterprise cerrados para evitar roadmap fiction.
- Website handoff canónico: `docs/TRP-C5-COMMERCIAL-CLOSURE-2026-09-16.md`.
- MEGABLOQUE C CLOSED. Pricing continúa validándose con evidencia del piloto, sin bloquear D.

### C5 — COMMERCIAL CLOSURE CLOSED
- Posicionamiento y promesa comercial listos para web.
- ICP de lanzamiento y no-ICP definidos.
- Core USD 69/690, Business USD 129/1290, Enterprise custom como baseline de piloto.
- Onboarding/implementation separados de suscripción sin setup fee universal inventado.
- Trial público automático no aprobado; piloto con activación administrada/auditable.
- Claims/no-claims cerrados para evitar vender roadmap.
- Handoff explícito a Website, Enterprise y Pilot/GTM.
- SOT: `docs/TRP-C5-COMMERCIAL-CLOSURE-2026-09-16.md`.

**MEGABLOQUE C — CLOSED. Próximo bloque: D — WEBSITE / SALES EXPERIENCE.**

## MEGABLOQUE D — WEBSITE / SALES EXPERIENCE
Estado: NEXT — ENABLED BY C COMMERCIAL CLOSURE

Construir después de A+B+C.

Incluye:
- Web comercial TRP completa.
- Hero/promesa.
- Problema y transformación.
- Storytelling Reliability.
- Cómo funciona.
- Screenshots/mockups del TRP SaaS Visual System definitivo.
- Capacidades/módulos.
- Asset lifecycle.
- Roles.
- Multi-sucursal.
- Seguridad/trazabilidad.
- Planes/precios aprobados.
- FAQ.
- CTA demo/contacto.
- Responsive premium.
- No mostrar roadmap como funcionalidad existente.

## MEGABLOQUE E — ENTERPRISE
Estado: PENDIENTE / DISEÑO POST-CORE

Incluye:
- Enterprise Command Center.
- Security: least privilege, roles, PII, tenant isolation, auditoría.
- Compliance/evidence/retention.
- Arquitectura de integraciones Enterprise: HRIS, identity/SSO, MDM/RMM, ITSM y otros cuando tengan sentido.
- Distinguir capabilities reales vs roadmap.
- Enterprise sales/proposal material.

### Technology Employee Lifecycle
Dirección Enterprise a desarrollar como ciclo tecnológico completo:
`Employee joins → assets/access assigned → changes during employment → support/repair/history → employee leaves → access removed → assets recovered → assets reassigned/serviced/retired`.

### Enterprise Employee Onboarding
Pendiente de SOT/diseño detallado. Debe contemplar:
- alta tecnológica de persona;
- relación Persona ↔ Activos ↔ Ubicación;
- asignación/entrega de equipos;
- seriales/condición/evidencia;
- solicitud/provisión/confirmación de accesos cuando existan integraciones o responsables externos;
- responsables y timestamps;
- aceptación/documentos;
- inicio del lifecycle tecnológico.

### Enterprise Employee Offboarding
SOT existente: `docs/TRP-ENTERPRISE-OFFBOARDING-SOT-2026-09-16.md`.

Debe contemplar:
- detectar activos asignados;
- recuperación: pendiente/recibido/faltante/excepción;
- condición y evidencia al devolver;
- matriz/checklist de accesos;
- responsables, solicitud, confirmación y timestamps;
- concepto configurable de Minuto Cero/effective offboarding time;
- siguiente destino: reasignación, diagnóstico, mantenimiento, reparación, sanitización/borrado cuando exista capacidad, inventario o retiro;
- reporte/cierre auditable.

TRP no se convierte por defecto en HRIS, nómina, cálculo de liquidaciones, asesor jurídico ni herramienta para decidir despidos.

### Commercial Validation & Delivery Model — Offboarding
Oportunidad validable mediante ecosistema actual:
`Compu Store Costa Rica → captación/comercial → SOLUCA (Soluciones Caraigres) → ejecución especializada → TRP como plataforma tecnológica → NeoWise convierte aprendizaje real en producto.`

Flujo inverso futuro posible:
`TRP/NeoWise → oportunidad Enterprise → SOLUCA/Compu Store ejecutan componentes especializados según alcance.`

Principio: usar casos reales para aprender antes de sobrediseñar el módulo. Separar responsabilidades comerciales, técnicas, legales y de tratamiento de datos.

Fuente de oportunidad Offboarding aportada por Gustavo el 2026-09-16 y capturada en el SOT específico. Los precios del material fuente NO se adoptan como pricing TRP.

## MEGABLOQUE F — PILOT / GTM
Estado: PENDIENTE

Incluye:
- Oferta piloto.
- Selección de clientes.
- Datos/demo reproducibles.
- Onboarding de pilotos.
- Acceso/licenciamiento.
- Criterios de éxito.
- Operación/soporte inicial.
- Pilot SMB/Mid-market para core operacional.
- Pilot Enterprise para assets/lifecycle/reliability cuando esté listo.
- Compu Store/SOLUCA como canal potencial de aprendizaje/captación para Offboarding Enterprise.
- Convertir feedback real en Product Learning Loop de NeoWise/TRP.

## MEGABLOQUE G — RUNTIME + HUMAN QA FINAL
Estado: PENDIENTE / QA AL FINAL

### Runtime/Cutover
- Repo actual ↔ runtime Base44 real.
- Revalidar paridad/cantidad de functions; incidente histórico 51 vs 31 es STALE hasta volver a medir.
- Legacy data gates permitidos.
- No hacer backfill/mutación real sin autorización.
- Production readiness.

### Human E2E QA final
- Impersonación Rodrigo → Gustavo / Compu Store.
- Tenant/org/branch isolation con usuarios reales.
- Roles reales.
- OT E2E.
- Cotización → envío → decisión/aprobación.
- Inventario/activos relacionados.
- Entrega/cierre.
- Portales/tokens públicos donde corresponda.
- Calidad/Reciclaje dentro de trazabilidad OT.
- Responsive/multi-device/sesiones.
- Visual QA completo: toda superficie debe sentirse TRP.
- Enterprise Onboarding/Offboarding E2E solo cuando esas capabilities hayan sido implementadas.

## MEGABLOQUE H — PUBLISH + CONTROLLED PILOT
Estado: FINAL / PENDIENTE

- Pre-Publish Smoke Matrix.
- Resolver regresiones reales.
- Publish/cutover solo con autorización.
- Piloto controlado.
- Monitoreo post-publish.
- Métricas/feedback.
- Corregir regresiones sin reabrir bloques cerrados arbitrariamente.

## ORDEN DE EJECUCIÓN VIGENTE

A Product Completion
→ B TRP SaaS Visual System
→ C Commercial Engine
→ D Website / Sales Experience
→ E Enterprise
→ F Pilot / GTM
→ G Runtime + Human E2E QA
→ H Publish + Controlled Pilot

## CIERRE MEGABLOQUE A — 2026-09-16

Product Completion queda cerrado en implementación. Human E2E permanece deliberadamente diferido al Megabloque G.

Entregado:
- navegación simplificada y homes por rol;
- Hoy como superficie accionable para administración, sucursal, técnico y ventas;
- Operación como supervisión/excepciones;
- Órdenes como recepción/inbox/búsqueda, sin segundo centro operativo legacy;
- Expediente OT como SOT operacional canónico del F0–F8;
- Calidad/Reciclaje contextualizados en la OT y sujetos a autorización;
- onboarding hacia primera recepción y primer Expediente;
- Activos + expediente longitudinal del activo;
- señales de lifecycle explicables sin inventar Reliability Score;
- permisos de lectura comercial/técnica ajustados en Expediente/Activo;
- vocabulario core canonizado en superficies activas (Hoy, Caja y Cobros, Expediente);
- build/lint/diff-check PASS al cierre.

Deuda conscientemente trasladada:
- identidad visual/branding TechRepair residual en shell/login/estados → Megabloque B;
- métricas exhaustivas/paginación/runtime real → Megabloque G;
- pricing/entitlements/billing/licensing → Megabloque C;
- Employee Lifecycle Enterprise → Megabloque E.

## CIERRE MEGABLOQUE B — 2026-09-16

TRP SaaS Visual System queda cerrado en implementación de la pasada visual sistémica. Human visual E2E permanece deliberadamente diferido al Megabloque G junto con el QA funcional final.

Entregado en la pasada B:
- shell/layout TRP y limpieza de branding residual;
- lenguaje visual aplicado a Command Centers y superficies core;
- primitives UI base (button/card/input/table/badge) alineados;
- consistencia visual extendida a Órdenes, Activos, Expediente, Agenda, Clientes, Inventario, Caja/Cobros, Settings, SaaS y portales públicos;
- estados/superficies de suspensión y portales alineados con TRP;
- identidad visual separada de TechRepair/NeoWise en las superficies intervenidas.

No se declara QA visual humano final aquí; ese gate sigue en G.

## C1 — COMMERCIAL ARCHITECTURE — 2026-09-16

SOT: `docs/TRP-COMMERCIAL-ARCHITECTURE-C1-2026-09-16.md`.

Decisiones C1:
- `Organization.plan` legacy deja de considerarse autoridad comercial;
- separar legacy plan, commercial package, entitlement, billing y activation/licensing;
- organización/tenant como unidad contractual primaria;
- core F0–F8 no se degrada para forzar upgrade;
- diferenciación por profundidad, escala y control;
- Basic/Pro/Premium y sus precios hardcodeados son compatibilidad legacy, no pricing TRP aprobado;
- Premium legacy no implica Enterprise;
- Reliability Score sigue fuera de comercialización;
- capa de compatibilidad inicial en `src/config/commercialArchitecture.js` sin mutar tenants reales.

## PRÓXIMA ACCIÓN

Entrar a C3 — Packaging + Pricing Decision. Definir nombres comerciales finales, unidad de cobro, límites, mensual/anual, Enterprise y onboarding/implementation. Entitlement Authority ya es backend SOT y Super Admin consume package efectivo; Organization.plan queda solo como compatibilidad legacy. No conectar billing real hasta aprobar pricing.


## C2 — ENTITLEMENT AUTHORITY — 2026-09-16

Estado: CLOSED — BACKEND AUTHORITY + SUPER ADMIN INTEGRATION

Entregado:
- entidad `EntitlementPolicy` service-only con package, billing status/interval, capabilities, limits, overrides y vigencia;
- `entitlementAuthority.ts` resuelve policy explícita o fallback legacy no destructivo;
- `identityGateway.context` devuelve entitlement efectivo del tenant activo;
- `adminOverview` devuelve entitlements efectivos por organización;
- nueva acción Super Admin `adminSetEntitlement` auditable;
- Super Admin filtra/muestra Core/Advanced/Enterprise desde autoridad backend;
- cambio comercial ya no muta `Organization.plan`;
- precios legacy hardcodeados retirados del panel Super Admin;
- creación de tenant conserva Basic/Pro/Premium únicamente como código de provisioning legacy hasta una migración posterior segura;
- cero backfill/mutación masiva de tenants reales.

Gate C2: build/lint/diff-check PASS.
