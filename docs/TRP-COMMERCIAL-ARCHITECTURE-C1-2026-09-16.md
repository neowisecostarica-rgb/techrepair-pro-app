# TRP — C1 COMMERCIAL ARCHITECTURE / SOT

Fecha: 2026-09-16
Estado: ACTIVE FOUNDATION — COMMERCIAL ENGINE
Producto: TRP — Technology Reliability Platform
Territorio: Technology Asset Operations

## 1. Objetivo

Separar definitivamente tres cosas que el legacy mezclaba:

1. `Organization.plan`: código técnico histórico de compatibilidad.
2. Commercial package: oferta que TRP vende y comunica.
3. Entitlements: autoridad backend que decide capacidades y límites reales.

Regla: un nombre de plan en frontend nunca vuelve a ser la autoridad de acceso.

## 2. Posicionamiento comercial canónico

TRP no se vende como “software para reparar computadoras”. Su núcleo probado nace en operaciones de servicio técnico, pero la dirección del producto es **Technology Reliability Platform** dentro del territorio **Technology Asset Operations**.

Narrativa:

`Repair → Operational Control → Asset Lifecycle → Reliability`

TRP organiza el trabajo técnico alrededor del activo, conserva evidencia e historial y convierte intervenciones aisladas en contexto operacional útil para decidir y operar mejor.

No comercializar todavía:
- un “TRP Reliability Score”;
- predicciones automáticas de reemplazo;
- métricas de reliability que no tengan datos/metodología suficientes;
- capabilities Enterprise que sigan en roadmap.

Reliability Layer se construye sobre evidencia explicable: disponibilidad cuando exista instrumentación válida, MTBF/MTTR cuando los eventos sean medibles, reincidencias, mantenimiento, estado del lifecycle, historial de intervenciones y señales de riesgo.

## 3. Core que no se rompe por packaging

El workflow F0–F8 permanece comercialmente útil en cualquier paquete pagado operativo:
- organización, sucursal y roles necesarios para operar;
- recepción y OT;
- asignación/cola;
- Expediente y bitácora;
- diagnóstico/pruebas;
- cotización y aprobación pública;
- reparación/actividad técnica;
- clientes/activos;
- Caja y Cobros;
- entrega/evidencia;
- garantía;
- inventario operacional ligado al servicio;
- agenda;
- portal/seguimiento del cliente;
- Hoy por rol;
- lectura básica del negocio;
- seguridad/trazabilidad operacional.

Regla comercial: el upgrade compra **profundidad, escala, control y capacidades avanzadas**; no compra la posibilidad de completar el trabajo básico.

## 4. Ejes de diferenciación

### Profundidad
Analítica avanzada, productividad, supervisión avanzada, Calidad/No conformidades, Reciclaje, CRM/Leads avanzado, automatizaciones y futuras señales Reliability validadas.

### Escala
Más complejidad organizacional, multi-sucursal avanzada, mayor volumen operativo, necesidades de administración y soporte superiores.

### Control
Gobernanza, permisos/controles más sofisticados, trazabilidad ampliada, políticas, evidencia, soporte y capacidades Enterprise cuando estén implementadas.

## 5. Unidad de cobro

Decisión de arquitectura C1: **la organización/tenant es la unidad contractual primaria**.

Sucursales, usuarios, volumen y capabilities son dimensiones de entitlement/escala, no productos separados por defecto.

No introducir cobro por OT como base del producto: penalizaría directamente el uso del workflow que TRP necesita centralizar. Si en el futuro existe consumo extraordinario de terceros/automatización, se modelará como add-on o uso medido separado, no como sustituto de la suscripción base.

## 6. Cadencia comercial

La arquitectura soportará:
- mensual;
- anual;
- Enterprise por contrato/cotización cuando corresponda.

Los importes definitivos y nombres públicos de paquetes **no se fijan en C1**. Los precios legacy existentes no se consideran aprobados ni se publicarán como pricing TRP definitivo.

## 7. Compatibilidad legacy

Estado encontrado al iniciar C:
- `Organization.plan` persiste `basic | pro | premium`;
- Super Admin contiene catálogo frontend Basic/Pro/Premium;
- `identityGateway` valida esos códigos al crear organizaciones;
- existen tenants reales con códigos legacy.

Por tanto:
- no migrar datos reales en C1;
- no renombrar destructivamente enum/códigos;
- no hacer backfill automático;
- conservar lectura de legacy;
- introducir una capa de resolución antes de cambiar autoridad.

Modelo objetivo:

`legacy plan code → commercial package resolver → entitlement policy → effective capabilities/limits`

El código legacy pasa a ser compatibilidad, no contrato comercial.

## 8. Modelo de entitlement objetivo

Cada tenant debe resolver una política efectiva con, como mínimo:
- `package_id` canónico interno;
- `billing_status`;
- `billing_interval`;
- `effective_from` / `effective_until` cuando aplique;
- límites explícitos por dimensión;
- capabilities habilitadas;
- overrides contractuales auditables;
- versión de política para migraciones futuras.

Estados de billing objetivo:
`trial | active | past_due | suspended | cancelled`

El acceso operacional no debe depender de strings de UI ni de precios hardcodeados.

## 9. Licensing / activation

Licensing debe representar derecho de uso, no autenticación.

Separación:
- Identity = quién es el usuario.
- Authorization = qué puede hacer su rol dentro del tenant.
- Entitlement = qué compró/habilitó el tenant.
- Billing = estado comercial de la suscripción/contrato.
- Activation = habilitación inicial controlada del tenant/licencia.

No reutilizar contraseñas, códigos de acceso ni claves visibles como sustituto de entitlement backend.

## 10. Enterprise

Enterprise no será simplemente “Premium con usuarios ilimitados”. Debe corresponder a necesidades reales de escala/control y a capabilities implementadas: gobernanza, seguridad, evidencia, integraciones y Employee/Asset Lifecycle cuando estén listas.

Pricing Enterprise permanece por definir en Commercial Engine y debe distinguir plataforma de implementación/servicios profesionales cuando existan.

## 11. Onboarding / implementation comercial

Separar:
- suscripción de plataforma;
- onboarding estándar incluido cuando sea viable;
- implementación/migración/configuración avanzada como alcance comercial explícito;
- servicios profesionales/Enterprise como línea separada cuando corresponda.

No esconder trabajo de implementación dentro de un precio SaaS si el alcance es materialmente distinto.

## 12. Decisiones aún abiertas — requieren cierre comercial, no ingeniería improvisada

- nombres públicos finales de paquetes;
- importes mensuales/anuales por mercado/moneda;
- descuento anual;
- límites exactos por paquete;
- qué capabilities avanzadas pertenecen a cada paquete;
- política de trial;
- grace period / past_due;
- precio y alcance de implementación;
- estructura Enterprise.

## 13. Secuencia de implementación

C1 — esta arquitectura y capa de compatibilidad.

C2 — Entitlement Authority backend: política efectiva, resolver legacy y contrato API.

C3 — integrar Super Admin con package/entitlement sin depender de catálogo hardcodeado legacy.

C4 — Billing/licensing lifecycle y estados comerciales, sin conectar cobro real hasta aprobar proveedor/operación.

C5 — cerrar packaging + pricing público aprobado y dejarlo listo para Website.

## 14. Definition of Done C1

- legacy identificado y protegido;
- separación plan/package/entitlement/billing/licensing documentada;
- unidad contractual definida;
- core protegido contra degradación artificial;
- territorio/narrativa comercial fijados;
- pricing legacy declarado no autoritativo;
- arquitectura lista para implementar C2 sin migración destructiva.
