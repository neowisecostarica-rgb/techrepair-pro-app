# TRP-SEC-011 — Corrección aditiva de esquema UserAccount.user_id
Fecha: 2026-11-03 | Aplicación: 695d708948469128f473d080
Estado: DEFECTO DE ESQUEMA CORREGIDO Y CONSULTA DIRECTA PASS; QA SALES FALLA POR ONBOARDING / SIN MEMBRESÍA TEMPORAL; NO-GO GENERAL.

## Evidencia de causa técnica
- La fuente `base44/functions/identityGateway/_shared/userAuthorization.ts` ejecuta `asServiceRole.entities.UserAccount.filter({user_id:user.id}, '-created_date', 100)` al resolver membresías.
- Antes del cambio, el esquema `UserAccount.jsonc` NO declaraba `user_id`. Una consulta directa Base44 con filtro user_id se rechazó: `Unknown field "user_id" in the filter: UserAccount has no field "user_id"`.
- Consulta de control por `user_email` devolvió resultado vacío, sin error.
- Resultado independiente: existe una ruta verificable a HTTP 400. No se ha demostrado que sea la única causa de los errores de identityGateway previos.

## Cambio aplicado
- Checkpoint PREVIO: `6aea0a97a6073aa1f2dc549c`, SHA `0a609235027088e3e51e8dc1a4da91e9cf972739`.
- Archivo editado: `base44/entities/UserAccount.jsonc`.
- Solo se agregó `properties.user_id: {type: 'string'}` (campo opcional). No se modificaron listas required, roles, demás propiedades ni reglas RLS (`create/read/update/delete=false`).
- No se crearon ni modificaron registros, ni se asignó automáticamente `user_id` a membresías existentes.
- Base44 list_entity_schemas confirmó `user_id` declarado; RLS conservado.
- Prueba directa read-only contra Base44: query `UserAccount` por un `user_id` sintético inexistente devolvió `entities:[], count:0` y NO HTTP 400.

## Contratos de código
- SDK de entidades: PASS 29 copias, 58 firmas.
- Identidad/tenancy: 7/7 PASS.
- Impersonación/sesión: 10/10 PASS.
- CRM/Customer360: 8/8 PASS.
- Autorización operacional: 9 grupos PASS.
- Flujo comercial: 16/16 PASS.
- Vite build y git diff --check: PASS.

## QA post-cambio
- Testing Agent SALES flow 6ae9e9f78f0299c74d0fdc48, nueva ejecución `6aea0ad9f6c9bb351729f8f7` contra SHA `c3c34a8b878b756eb931479855535cb3b452bdd2`: FAILED / goal_accomplished=false, sin failure_reason de plataforma. Testing Agent informa que la aplicación mostró `Configura tu organización`, sin CRM ni navegación, y NO registró errores de autorización. No creó registros ni completó onboarding.
- Resultado definitivo disponible: falla por ausencia de contexto organizacional en el usuario de prueba; el problema anterior de pantalla de indisponibilidad no se reprodujo. No cambiar seguridad por ensayo y error.

## Hallazgos posteriores: membresías y QA
- Inspección read-only de Base44 `UserAccount` con `fields=['id']` y limit=1 confirmó al menos 1 registro y al menos 1 con `status='active'`, **sin extraer datos personales**.
- Consulta `{'user_id':{'$exists':true}}` devolvió 0; la observación NO permite deducir por sí sola la situación de los usuarios reales o de la base de datos de pruebas. Sí documenta que no se encontró un ID canónico persistido en los registros inspeccionables.
- El Testing Agent usa usuario temporal sin membresía de organización. Por eso el test de CRM de rol SALES no acredita acceso funcional aunque el servicio de identidad ya no arroje la pantalla de error.
- Se añadió `scripts/verify-useraccount-schema-contract.mjs`: contrato PASS para existencia de user_id opcional, conservación de campos y RLS fail-closed; consulta por user_id y email; membresía activa únicamente cuando user_id corresponde a la identidad real.
- Próximo gate: establecer fixtures aislados y una membresía válida verificada sin backfill ni asociación automática de usuarios históricos. No crear organizaciones o asignar roles en datos reales para hacer pasar el test.

## Puntos pendientes
- Verificar para las membresías existentes cuántas tienen user_id persistido; sin ese campo, la resolución canónica de membresías activas podría quedarse vacía incluso después de eliminar el 400.
- No cambiar `activeMemberships` ni invitar/asignar roles hasta revisar la migración de datos con un plan seguro y autorizado.
- SEC-QA multirol y E2E transaccional pendientes de acceso real.
- P0-AUD-01 concurrencia de AuditEvent sigue NO-GO general.

## Continuidad
Actualizar `docs/TRP-AUDIT-MASTER-STATUS-2026-11-03.md` y `AGENTS.md` con el resultado definitivo de SALES, y guardar checkpoint posterior. No repetir auditoría desde cero.