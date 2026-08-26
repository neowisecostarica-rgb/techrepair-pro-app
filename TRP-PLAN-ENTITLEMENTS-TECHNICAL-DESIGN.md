# TRP — Diseño técnico de planes y entitlements

Estado: modo observación implementado localmente; no desplegado.
Fecha: 2026-08-24

## Objetivo

Convertir los planes `basic`, `pro` y `premium` en permisos reales aplicados por
el backend. La interfaz puede mostrar beneficios, pero nunca debe ser la barrera
de seguridad o de cobro.

Este diseño no sustituye la certificación AUD-01B: antes de un piloto productivo,
el probe de concurrencia debe completarse en la app aislada y sus resultados deben
ser revisados.

## Propuesta comercial a confirmar

| Plan | Sucursales | Usuarios activos | Uso previsto |
| --- | ---: | ---: | --- |
| Basic | 1 | 3 | Taller pequeño |
| Pro | 3 | 10 | Taller en crecimiento |
| Premium | Acordado por contrato | Acordado por contrato | Operación multi-sucursal |

La tabla es una propuesta para el primer piloto; no debe codificarse hasta que se
apruebe comercialmente. Las operaciones base (órdenes, clientes, inventario,
garantías y cotizaciones) permanecen disponibles para todos los planes.

## Modelo recomendado

1. Crear una única política compartida, por ejemplo
   `base44/functions/_shared/planEntitlements.ts`, con los límites y flags.
2. Mantener `Organization.plan` como selección comercial visible, pero no como
   evidencia de pago.
3. En una fase posterior, agregar una fuente de verdad de suscripción (por ejemplo
   entidad `Subscription`) con estado, período, proveedor, referencia externa y
   versión de entitlements.
4. Las integraciones de pago solo actualizan esa fuente de verdad mediante webhook
   verificado; ningún caller del frontend puede elevar un plan.

## Puntos de aplicación en backend

| Operación | Punto existente | Regla futura |
| --- | --- | --- |
| Crear organización | `identityGateway` | Asignar plan inicial explícito y registrar auditoría. |
| Cambiar plan | `identityGateway` (superadmin) | Validar transición, conservar evidencia y auditar. No conceder por petición de cliente. |
| Invitar/activar usuario | `manageOrgUser` | Contar usuarios activos persistidos antes de la mutación y rechazar si se alcanza el límite. |
| Crear/reactivar sucursal | lifecycle de Branch | Contar sucursales activas persistidas antes de la mutación y rechazar si se alcanza el límite. |
| Funciones Premium | gateway/función propietaria | Verificar flag de entitlement en backend antes de procesar o exponer datos. |

Los controles se ejecutarán después de identificar al actor y comprobar su rol,
pero antes de cada escritura. Deben responder con un código estable, por ejemplo
`PLAN_LIMIT_REACHED`, sin revelar datos de otros tenants.

## Concurrencia y migración segura

Los contadores de usuarios y sucursales deben asumir solicitudes simultáneas. Un
simple `count` seguido de `create` no es suficiente si dos administradores actúan
en paralelo. Antes de activar límites de pago se requiere una estrategia atómica
probada en Base44 (reserva condicional/CAS u otra garantía documentada y probada).

Despliegue propuesto:

1. Modo observación: registrar cuándo una escritura excedería el límite, sin
   bloquearla.
2. Revisar organizaciones existentes y asignar excepciones/grandfathering
   explícitas donde corresponda.
3. Aplicar límites solamente a nuevas altas y aumentos de consumo.
4. Nunca desactivar usuarios o sucursales existentes automáticamente por una
   reducción de plan.
5. Activar bloqueo por tenant solo tras pruebas de concurrencia, contratos y una
   revisión operacional.

## Implementación local actual

Se agregó `base44/functions/_shared/planEntitlements.ts` en modo observación.
Registra un `AuditEvent` solamente cuando una acción supera los límites propuestos;
atrapa cualquier fallo de lectura o auditoría para no modificar el resultado del
comando de negocio.

- `manageOrgUser` observa toda transición que agrega consumo de asiento: nueva
  invitación, reinvitación desde suspensión, activación y edición integral que
  reactive una cuenta. `invited` y `active` consumen asiento; `suspended` no.
- `manageBranchLifecycle` observa una creación o reactivación que deje a la
  organización sobre el límite de sucursales.
- No existe código `PLAN_LIMIT_REACHED`, ningún rechazo nuevo ni modificación
  automática de usuarios, sucursales o planes.

Checkpoint 2026-08-26: la prueba de observación ahora ejecuta comportamiento real
para límites y transiciones, además de verificar los puntos de integración. Pasa
5/5 casos locales.

La activación del código requiere revisión, commit y una autorización separada de
despliegue. No debe desplegarse mientras AUD-01B siga sin certificación runtime.

## Pruebas necesarias antes de activar

- usuario bajo, en y sobre el límite;
- sucursal bajo, en y sobre el límite;
- dos invitaciones y dos creaciones de sucursal realmente paralelas;
- downgrade con uso superior al nuevo límite, sin borrar ni bloquear trabajo
  existente;
- intento de elevar plan desde un cliente no autorizado;
- auditoría completa de cambio de plan y de rechazo por límite;
- compatibilidad de los callers existentes.

## Decisiones pendientes

- Confirmar la tabla comercial del primer piloto.
- Elegir proveedor y proceso de cobro antes de implementar suscripciones.
- Definir la excepción contractual de Premium.
- Completar el probe AUD-01B de staging y clasificar su garantía CAS.

Hasta entonces, el piloto puede cobrarse manualmente y el plan puede mantenerse
como acuerdo comercial administrado, sin prometer límites automáticos todavía.
