# TRP-SEC-013 — Habilitación de QA con identidad canónica
Fecha: 2026-11-03 | ESTADO: BLOQUEADO EN ENTORNO DE NAVEGADOR / NO-GO general
GitHub: https://github.com/neowisecostarica-rgb/techrepair-pro-app/issues/12
Bloqueo independiente de audit concurrency: https://github.com/neowisecostarica-rgb/techrepair-pro-app/issues/13

## Qué se comprobó directamente
- Base44 Testing Agent define flujos con `name`, `goal` y `role`; ejecutar flujo acepta `flow_id` y URL opcional. No hay parámetro documentado `user_id`, identificador temporal fijo, asociación de usuario a `UserAccount`, ni fixture de sesión.
- El usuario de Testing Agent es temporal y su cuenta no queda como User persistente. En SALES 6aea0ad9f6c9bb351729f8f7, CRM no abrió: pantalla `Configura tu organización` con sesión válida y sin membresía. No se crearon registros.
- En TRP, `resolveIdentitySnapshot` y `ResolveAuthorizationContext` requieren `account.user_id === user.id`, status active, organización válida y sucursal válida cuando el rol es SINGLE_BRANCH. No deben autorizar mediante email solamente.
- `POST /testing-agent/data/seed` puede copiar hasta 5 registros vivos por entidad, incluidos datos personales, al conjunto de prueba. No se ejecutó por no poder garantizar ausencia de PII, ni una identidad temporal ligada.
- Prueba de código `npx tsx scripts/verify-sec012-isolated-membership-fixtures.mjs` produce 6/6 PASS de denegación/permitido en memoria, y 26/26 políticas CRM coherentes. NO es un test browser/E2E.
- Roles de CRM: `crmGateway` y `PageGuard` admiten ORG_ADMIN, BRANCH_ADMIN, SALES. Se retiró CRM_OPERATIONS de CUSTOMER_SERVICE en las 26 copias compartidas, con tests y build PASS.

## Siguiente implementación aceptable
1. Confirmar con Base44 procedimiento para ejecutar con identidad QA persistente/estable y `UserAccount` relacionado en **test-data**; consultar el vínculo entre `auth.me()` y User temporales.
2. En un ambiente verdaderamente aislado, definir fixtures de organización, sucursal, usuario y `UserAccount` con ID canónico exacto, más segundo tenant/branch para casos de denegación. Todos ficticios. No pasar identidades reales ni conceder rol administrativo sin autorización nativa.
3. Ejecutar SEC-QA navegador de SALES y CUSTOMER_SERVICE, luego BRANCH_ADMIN, INVENTORY, TECHNICIAN, ORG_ADMIN y SUPER_ADMIN; evidenciar accesos positivos/negativos.
4. Completar E2E-001 comercial transaccional solo con datos ficticios, y registrar capturas, fechas, commits y resultados.
5. Retener NO-GO general hasta solucionar aparte P0-AUD-01 (issue #13).

## Qué NO hacer
- NO crear o modificar registros de producción para habilitar a usuarios efímeros.
- NO ejecutar seed indiscriminado: podría copiar datos vivos al dataset de pruebas.
- NO introducir backdoors, login de prueba que evada auth, o vinculación por email sin confirmar ID.
- NO repetir el test SALES sin nuevo fixture/control probado ni afirmar PASS basándose en contratos de código.

## Navegación para futuros equipos
Leer AGENTS.md y docs/TRP-AUDIT-MASTER-STATUS-2026-11-03.md. Punto previo de SEC-012: checkpoint 6aea0eded54b64f0a1175354 / SHA 606f6fad6ee05f2af0c6c2f62f9ade15a90ec670.