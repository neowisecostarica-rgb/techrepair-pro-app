# TRP MASTER ROADMAP — SINGLE SOURCE OF TRUTH

Fecha: 2026-09-15
Proyecto: TechRepair Pro / TRP Legacy
Base44 App ID: 695d708948469128f473d080
Baseline conocido al consolidar: 366944e843bbb290178e1887593aff87a9e271bc

## Decisión maestra

A partir de este checkpoint TRP se gestiona con UN SOLO ROADMAP. No volver a separar el camino técnico del camino de producto/comercial. Todo lo pendiente se ejecuta secuencialmente dentro de este SOT.

Regla de trabajo de Gustavo: macrobloques grandes, aproximadamente 20% discusión / 80% implementación, QA humano al final cuando sea posible. Flujo deseado: GitHub SOT → rama/PR/merge → Base44 Publish. No publicar ni mutar datos reales sin confirmación.

## Estado técnico ya alcanzado — NO REHACER SIN REGRESIÓN

- Hardening P0/P1 ampliamente completado.
- Seguridad y aislamiento multi-tenant/multi-sucursal.
- Inventario canónico, ledger, reservas, consumo, devoluciones, reversals e idempotencia.
- Solicitudes técnicas.
- AuditEvent / auditoría operacional.
- Delivery / evidencia de entrega con atomicidad.
- Automatizaciones y notificaciones con provenance.
- Provisioning y roles.
- Identidad/impersonación nativa endurecida a nivel de contratos; QA real aún pendiente.
- Métricas y paginación recibieron correcciones diferenciales el 15-Sep.
- Calidad y Reciclaje permiten vincular orden_trabajo_id en creación; UX/historial visible puede requerir revisión de producto.
- Gate automatizado histórico: 27/27 suites + lint + build PASS antes de los últimos cambios diferenciales; suites dirigidas posteriores también PASS.

Checkpoints técnicos relevantes recuperados:
- TRP MB2 CLOSED — native Base44 identity + E2E contracts PASS 2026-09-15
- TRP MB3 automated gate complete — human pilot QA pending 2026-09-15
- TRP differential MVP close — P1-10 P1-12 P1-13 verified clean
- Baseline posterior conocido: 366944e843bbb290178e1887593aff87a9e271bc

IMPORTANTE: MB3 no debe interpretarse como piloto completamente cerrado. La parte automatizada está avanzada/cerrada, pero el QA humano real quedó deliberadamente para el final.

## ROADMAP ÚNICO

### MB1 — Auditoría integral de producto — SIGUIENTE
Evaluar TRP como producto vendible y usable, no solamente como código. Panel multidisciplinario: producto SaaS, operación de talleres/servicio técnico, UX, dueño/gerencia, recepción, técnicos, ventas, inventario, multi-sucursal y comercialización.

Preguntas centrales:
- ¿Resuelve suficientemente bien el trabajo diario para que un negocio pague?
- ¿Qué sobra, qué falta y qué debe simplificarse?
- ¿Dónde existen fricciones operativas o UX?
- ¿Qué experiencia recibe cada rol?
- ¿Cómo es onboarding / first value?
- ¿Qué capacidades pertenecen al producto actual y cuáles a una evolución Enterprise?
- Revisar la idea histórica Core/Current Product vs Enterprise sin asumir que Enterprise deba ser otro producto.

Salida: Product Audit + lista priorizada de correcciones/adiciones/eliminaciones y decisión de qué debe resolverse antes de pricing/web/piloto.

### MB2 — Definición final del producto
Con base en MB1:
- Definir exactamente qué es TRP y para quién.
- ICP / comprador / usuarios.
- Problema y outcome que compra el cliente.
- Módulos/capacidades indispensables.
- Simplificaciones y límites coherentes.
- Core vs Business/Enterprise o arquitectura equivalente, sin forzar nombres hasta validar.
- Onboarding y experiencia inicial.

### MB3 — Nombre + marca + posicionamiento
- Resolver si TechRepair Pro / TRP continúa como nombre comercial o cambia.
- No inventar candidatos supuestamente acordados: los candidatos históricos exactos no están recuperados de forma confiable.
- Definir categoría, promesa, lenguaje, identidad y arquitectura de marca.
- Naming se decide antes de construir la web definitiva y antes de renombrar repo/app/código.

### MB4 — Planes + pricing + modelo comercial
- Unidad de cobro.
- Mensual/anual.
- Sucursales/usuarios/capacidades.
- Onboarding/implementación.
- Demo/trial si aplica.
- Planes y diferenciación.
- Enterprise si corresponde.
- No tratar precios históricos/propuestos como decisión final sin revalidarlos después de la auditoría de producto.

### MB5 — Web comercial / Sales Experience
Construir después de producto + naming + pricing:
- Hero y promesa.
- Problema / transformación.
- Cómo funciona.
- Screenshots/mockups reales del software.
- Capacidades/módulos.
- Roles.
- Multi-sucursal.
- Seguridad/trazabilidad.
- Planes/precios.
- FAQ.
- CTA demo/contacto.
- Responsive y experiencia premium.

### MB6 — Pilot & Go-to-Market
- Clientes piloto.
- Datos/demo reproducibles.
- Onboarding.
- Acceso/licenciamiento.
- Criterios de éxito.
- Operación inicial y soporte.

### MB7 — Runtime + cutover final
- Comparar repo actual ↔ runtime Base44 real.
- Revalidar cantidad/paridad de funciones desplegadas.
- La incidencia histórica 51 locales vs 31 remotas es STALE hasta volver a medirla; no asumir que sigue ni que desapareció.
- Ejecutar gates legacy permitidos, incluyendo auditorías de inventario/entrega según contratos actuales.
- No hacer backfill/mutación real sin autorización.
- Preparar Publish, no ejecutarlo sin confirmación.

### MB8 — QA humano E2E FINAL
Dejar para el final como pidió Gustavo:
- Impersonación real Rodrigo → Gustavo / Compu Store.
- Aislamiento organización/tenant y sucursal con usuarios reales.
- Roles reales.
- Flujo OT E2E.
- Cotización → envío → decisión/aprobación.
- Inventario relacionado.
- Entrega.
- Portales/tokens públicos sin autenticación donde corresponda.
- Multi-dispositivo / sesiones si aplica.
- Revisar UX final de Calidad/Reciclaje y su trazabilidad visible dentro de OT.

### MB9 — Publish + piloto controlado
Solo después de pasar MB7 y MB8:
- Publish/cutover autorizado.
- Piloto controlado.
- Monitoreo.
- Corregir regresiones reales, no reabrir bloques cerrados sin evidencia.

## Pendientes técnicos que permanecen absorbidos dentro del roadmap

No constituyen un segundo camino. Se resuelven dentro de MB7/MB8 o cuando MB1 demuestre necesidad:
- Gates de datos legacy.
- Paridad repo/runtime.
- Impersonación real.
- Tenant/branch isolation con usuarios reales.
- Roles reales.
- OT E2E.
- Portales públicos.
- Cotización y entrega E2E.
- Revisar límites/caps de métricas a escala antes de certificar P1-10/P1-12 globalmente.
- Revisar cursor de listWorkOrders ante empates exactos de created_date si la auditoría de escala lo exige.
- Calidad/Reciclaje ya poseen FK opcional en UI/create; revisar si producto exige selector de OT, obligatoriedad por tipo o inclusión visible en ExpedienteOT.

## Orden de ejecución desde este punto

MB1 Product Audit → correcciones funcionales reveladas por auditoría → MB2 Product Definition → MB3 Naming/Positioning → MB4 Pricing/Plans → MB5 Website → MB6 Pilot/GTM → MB7 Runtime/Cutover → MB8 Human E2E QA → MB9 Publish/Pilot.

No volver a crear dos roadmaps paralelos.

## Próxima acción al retomar

COMENZAR MB1 — AUDITORÍA INTEGRAL DE PRODUCTO sobre el TRP actual. No volver a auditar P0/P1 desde cero. Usar el producto actual como objeto de análisis y producir una lista priorizada de cambios necesarios para convertirlo en un producto vendible antes de pricing y web.
