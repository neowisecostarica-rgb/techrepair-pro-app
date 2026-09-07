# TRP — plan de continuación para monetizar el MVP

Fecha de preparación: 2026-08-24

## Resultado buscado

Conseguir un primer taller piloto pagado y usar sus dos primeras semanas para
validar el flujo operativo, sin declarar todavía disponibilidad empresarial ni
activar cobro automático.

## Estado al cerrar hoy

| Área | Estado | Qué falta |
| --- | --- | --- |
| Flujo operativo TRP | Listo para piloto controlado | Validación con un taller real. |
| AUD-01B código | Conditional pass | Ejecutar probe concurrente en staging aislado. |
| Staging AUD-01B | Recursos preparados | Acceso admin válido para ejecutar el probe. |
| Cobro | Propuesta preparada | Confirmar precio, canal de pago y primer cliente. |
| Planes | Observación local lista | No desplegar ni bloquear hasta validar el piloto. |

## Mañana: orden de trabajo

### 1. Decisión comercial — 30 minutos

Oferta fundadora acordada para usar en el piloto:

- Plan Fundador TRP.
- ₡39.900 por implementación, configuración y primer mes.
- ₡19.900/mes a partir del segundo mes.
- Disponible únicamente para los primeros 10 talleres que se activen.
- El precio fundador se conserva mientras el taller mantenga su suscripción activa
  y sus pagos al día.
- Hasta 3 sucursales y 10 usuarios como acuerdo comercial, sin bloqueo técnico
  todavía.
- Cobro manual por SINPE Móvil o transferencia.
- Onboarding de 60–90 minutos y soporte semanal.

Usar `TRP-FIRST-PAID-PILOT-KIT.md` como guion; no prometer Stripe, límites
automáticos ni SLA empresarial. La implementación incluida cubre configuración
estándar y onboarding; migraciones grandes, configuraciones especiales, soporte
presencial o trabajo adicional se cotizan aparte.

### 2. Buscar el primer taller — 60 a 90 minutos

Contactar 5 talleres que cumplan:

- Reciben al menos 5 equipos por semana.
- Actualmente usan WhatsApp, papel o hojas de cálculo.
- El dueño o administrador puede dedicar 60 minutos al onboarding.
- Aceptan dar feedback durante 14 días.

Meta: lograr una llamada de demostración, no cerrar masivamente.

### 3. Resolver el gate AUD-01B — 30 a 60 minutos

No repetir contraseñas a ciegas. Determinar cómo autenticar un admin de la app
aislada `TRP-AUD01B-CAS-CERT-DO-NOT-PUBLISH`:

1. Confirmar si la cuenta usa Google/OAuth o email/contraseña.
2. Si es OAuth, buscar un método de sesión/token documentado y autorizado para
   el runner, sin guardar secretos en archivos ni Git.
3. Solo con acceso válido, ejecutar el probe autorizado en staging.

Éxito: clasificar CAS como PROVEN, UNPROVEN o INVALID con evidencia. No tocar la
app principal TechRepair Pro.

### 4. Preparar onboarding — 45 minutos

Para el taller que acepte:

- Nombre legal/comercial, teléfono, moneda y sucursal principal.
- Lista inicial de usuarios y sus roles.
- Inventario mínimo y categorías.
- Un caso real para crear: cliente, equipo, orden de trabajo, diagnóstico,
  cotización y entrega.
- Acordar canal de soporte y métricas de día 7 y día 14.

No crear tenants ni datos productivos sin aprobación explícita de la persona
responsable del taller.

## Esta semana

| Prioridad | Entregable | Condición |
| --- | --- | --- |
| P0 | Probe AUD-01B ejecutado y revisión final | Acceso staging válido. |
| P0 | Primer taller en demo/onboarding | Oferta piloto confirmada. |
| P1 | Registro de incidencias y métricas piloto | Taller activo. |
| P1 | Revisar observaciones de límites de plan | Después de deploy aprobado y con piloto. |
| P2 | Diseñar Stripe/suscripciones | Tras validar interés y uso real. |

## Regla de lanzamiento

Se puede operar un piloto con acompañamiento. No escalar a múltiples clientes ni
prometer operación sin supervisión hasta que AUD-01B tenga evidencia runtime y el
primer piloto complete al menos 14 días de uso.
