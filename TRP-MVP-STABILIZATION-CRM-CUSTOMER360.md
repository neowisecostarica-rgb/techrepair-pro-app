# TRP MVP — Estabilización CRM y Customer 360

**Estado:** implementación local completada; validación autenticada en Base44 pendiente.

## Alcance atendido

- CRM: lectura, creación, actualización, asignación y conversión de leads.
- Expediente del cliente (Customer 360): perfil, órdenes, equipos, ventas, cotizaciones y comunicaciones.
- Identidad multitenant: validación canónica de membresía activa y organización autorizada.
- Onboarding: activación consistente de `UserAccount.status` al aceptar invitaciones o crear la organización inicial.

## Causa principal de los 403

El frontend mezclaba llamadas directas a entidades protegidas con intentos de sincronizar privilegios del usuario desde el cliente. Además, algunos usuarios podían conservar `active: true` mientras su estado canónico seguía siendo `invited`, lo que producía sesiones aparentemente válidas que luego eran rechazadas por las reglas de autorización.

## Correcciones implementadas

1. Se agregó un resolvedor compartido de autorización que exige una membresía canónica activa, resuelve una única organización y valida el rol antes de usar acceso de servicio.
2. Se eliminó la autoelevación del rol de plataforma desde `AuthContext`.
3. CRM ahora opera mediante `crmGateway`; la organización, el estado y la asignación se validan en el servidor.
4. Customer 360 ahora opera mediante `customer360Gateway`; todas las lecturas y comunicaciones se limitan al tenant autorizado.
5. El onboarding activa tanto el estado canónico como el indicador legado para evitar ciclos de autenticación y 403 posteriores.
6. Se agregaron estados explícitos de carga, error y reintento en CRM y Expediente.

## Verificación ejecutada

- Contrato CRM/Customer 360: **8/8**.
- Asignación: **21/21**.
- Recepción atómica: **24/24**.
- Smart Intake: **23 pruebas + 12 comprobaciones**.
- Flujo comercial: **16/16**.
- Venta atómica: **19/19**.
- Security & Integrity: **7/7**.
- ESLint: aprobado.
- Build de producción: aprobado.
- `git diff --check`: aprobado.

## Puertas pendientes antes de declarar el MVP utilizable completo

1. Sincronizar/desplegar `crmGateway`, `customer360Gateway` y las funciones modificadas en el proyecto Base44.
2. Ejecutar QA manual con una sesión autenticada y datos reales de una organización.
3. Recorrer el flujo completo: Recepción → Asignación → Smart Intake → Diagnóstico → Cotización → Aprobación → Reparación → Pruebas → Finalización → Cobro → Entrega.
4. Verificar los perfiles ORG_ADMIN, BRANCH_ADMIN, SALES, SUPPORT y técnico, incluyendo aislamiento entre organizaciones.
5. Registrar y corregir cualquier nuevo P0/P1 que aparezca durante el recorrido vivo.

La validación local no puede sustituir esta última etapa porque el repositorio no contiene `VITE_BASE44_APP_BASE_URL` y la sesión local no dispone de autenticación Base44.
