# TRP-SEC-018 — Eliminar doble carga de organización antes del panel
Fecha: 2026-11-03 | Estado: CÓDIGO Y REGRESIONES PASS; QA REAL EN BASE44 PENDIENTE
Motivación: Dirección General reportó que SALES y OWNER/ORG_ADMIN siguen sin panel tras SEC-016/017. El video previo muestra `Verificando estado de tu cuenta...`, que procede de `Layout.jsx`.

## Hallazgo confirmado mediante código
- `base44/functions/identityGateway/entry.ts` `buildContext` ya carga y devuelve `organizations: organizations.map(sanitizeOrganization)` junto con la membresía y proyección de autorización. `sanitizeOrganization` incluye `id`, `name`, `status`.
- `src/Layout.jsx` ignoraba ese conjunto y hacía una **segunda petición** `getIdentityOrganization(effectiveOrgId)` a `identityGateway`, bloqueando toda la interfaz mientras `useQuery` estuviera cargando. Este gate duplicado mostraba exactamente `Verificando estado de tu cuenta...`.
- La segunda petición también debía resolver nuevamente la membresía y aplicar `resolveAuthorizedContext`, con posibilidad de errores de timing o sesión nativa durante el cambio de usuario. No se ha capturado evidencia de Network suficiente para afirmar que esa era toda la causa de pantalla blanca.

## Cambio frontend de alcance reducido
- En `src/components/contexts/AuthContext.jsx` se conserva `authorizedOrganizations` proveniente exclusivamente del contexto de identidad resuelto por el backend. Se limpia al comenzar cada carga de identidad y si el gateway falla (fail-closed).
- En `src/Layout.jsx` se usa `authorizedOrganizations.find(org => org?.id === effectiveOrgId)` y se eliminó **solo** el `useQuery` redundante y su spinner `Verificando estado de tu cuenta...`. No se modifica `getIdentityOrganization` para otros módulos.
- Si no existe organización coincidente, no tiene ID o no tiene estado `active`/`suspended`, se presenta bloqueo de error, **no se habilita el panel**. La suspensión existente sigue enviando a `SuspendedScreen`. El modo de impersonación suspendida conserva su aviso de solo lectura.
- El backend sigue siendo la única autoridad de roles, pertenencia, sucursal y autorización de cada comando. El contexto de UI no es autorización adicional.
- El contrato `scripts/verify-sec016-native-session-switch.mjs` fue actualizado porque SEC-018 reemplazó su expectativa anterior de query `org-status`: verifica limpieza de la organización anterior, coincidencia por id de tenant, bloqueo de estados desconocidos, preservación de suspensión y gateway backend autorizado.

## Pruebas ejecutadas
- `node scripts/verify-sec016-native-session-switch.mjs`: PASS actualizado a SEC-018.
- `node scripts/verify-sec017-midia-error-boundary.mjs`: PASS.
- `npm run test:impersonation-session-hardening`: 10/10 PASS.
- `npm run test:identity-tenant-security`: 7/7 PASS.
- `npm run test:multiuser-navigation`: 8/8 PASS.
- `npm run test:crm-customer360`: 8/8 PASS.
- `npm run build` y `git diff --check`: PASS.
- Checkpoint ANTES del cambio: `6aea2842cd1479edcf3ca090`, commit `c241c265bdbe24bc0015cdab74e6cb70b4bdebce`.

## Qué falta para cerrar el incidente
- Abrir la vista previa que ejecute el SHA candidato exacto, no suponer que build o checkpoint equivalen a Publish.
- Comprobar ventas@compustorecr.com (SALES) y gustavo@compustorecr.com (ORG_ADMIN) y luego la secuencia SALES → TECHNICIAN → SALES. Confirmar acceso al panel MiDia, al CRM y que no hay spinner persistente ni pantalla blanca.
- Si aparece 'Error al Cargar Cuenta', la respuesta `context` carece de organización o estado válido y se debe analizar `identityGateway context` con un informe mínimo sin PII; **no** relajar la condición de acceso.
- Si aparece `No se pudo mostrar el panel · SEC-017`, recopilar la consola controlada; si todo blanco, inspeccionar error global y determinar si está desplegada la versión nueva.
- No realizar writes de CRM, cotizaciones, pagos ni inventario en COMPU STORE; continuar QA en solo lectura.
- No declarar SEC-018 RESUELTO ni GO general hasta evidencia de navegador. E2E y P0-AUD-01 siguen pendientes.