# TRP-SEC-007 — Diagnóstico de etapas de identidad
Fecha 2026-11-03. Estado: instrumentación de diagnóstico aplicada, regresiones PASS; QA runtime FAILED por plataforma / NO-GO.

## Contexto
- SALES en Testing Agent falló 3 veces antes de esta intervención. Último caso 6ae9fb462d67eca79f243657 FAILED platform, pantalla 'Valid session · Identity service unavailable'.
- Logs de identityGateway: CONTEXT_BUILD, HTTP 400 (se observó de nuevo el 2026-11-03 15:19:36 UTC). El log previo carecía de ubicación de suboperación.
- Las correcciones de SDK SEC-003/SEC-004 ya están guardadas: 29 copias, 58 filtros correctos. Esto no acredita runtime activo.

## Cambio realizado
- `base44/functions/identityGateway/entry.ts`: helper `contextStep(step, operation)` ejecuta cada operación sin cambiar su resultado ni la política de acceso. Ante excepción registra solo paso fijo y HTTP status, luego relanza el mismo error. No registra usuario, email, tenant, tokens, payloads ni datos sensibles.
- Pasos: LOAD_BACKEND_USER; RESOLVE_IDENTITY; PERSIST_ADMIN_FLAG; REPAIR_IDENTITY_FLAGS; RESOLVE_REPAIRED_IDENTITY; LOAD_ORGANIZATIONS; RESOLVE_ENTITLEMENT.
- La autorización continúa fail-closed. Ningún fallback concede acceso sin contexto válido.
- Se actualizó una aserción estática de scripts/verify-impersonation-session-hardening.mjs para aceptar la lectura autoritativa de User dentro del wrapper diagnóstico sin reducir el control.

## Evidencia
- `node scripts/verify-identity-filter-sdk-contract.mjs`: PASS, 58 firmas correctas.
- `npm run test:identity-tenant-security`: 7/7 PASS.
- `npm run test:impersonation-session-hardening`: 10/10 PASS.
- `npm run test:crm-customer360`: 8/8 PASS.
- `npm run test:operational-authorization`: 9 grupos PASS.
- `npm run build`: PASS; `git diff --check`: PASS.
- Testing Agent SALES flow 6ae9e9f78f0299c74d0fdc48, ejecución nueva 6aea004fab91e361e9cde919, commit 53272033893ab9fdba9cb94e45a018e381c3a574: FAILED / platform / goal_accomplished=false al cierre. La app mostró Identity service unavailable después de dos reintentos. Logs 15:41:01, :03, :11 y :16 UTC: CONTEXT_BUILD HTTP 400, sin eventos identityGateway:context-step en registros disponibles. No declarar PASS ni inferir versión backend.

## Interpretación y siguientes pasos
1. El resultado final de ejecución 6aea004fab91e361e9cde919 es FAILED / platform. No ejecutar pruebas SALES idénticas: primero obtener versión efectiva de función y verificar sincronización o disponibilidad de trazas por etapa.
2. Si solo existe CONTEXT_BUILD y no aparece el marcador, verificar sincronización efectiva de backend contra fuente; no asumir que el archivo está en runtime.
3. Si falla LOAD_BACKEND_USER, investigar validez de `asServiceRole.entities.User.filter` (entidad User especial), contrato de SDK o entorno. No eliminar la lectura soberana sin revisar consecuencias de seguridad.
4. Si falla RESOLVE_IDENTITY, inspeccionar consultas UserAccount.filter por user_id/email y permisos/consulta. Si falla LOAD_ORGANIZATIONS o RESOLVE_ENTITLEMENT, inspeccionar las entidades referidas.
5. Con acceso SALES PASS, continuar los flujos de roles SEC-QA y E2E aislado.
6. P0-AUD-01 sigue NO-GO; la instrumentación de identidad no lo resuelve.

## Seguridad de cambio
No se hizo Publish, redeploy explícito ni cambios en datos. Base44 cloud sandbox puede sincronizar funciones automáticamente; requerir evidencia del runtime antes de declararlo corregido.