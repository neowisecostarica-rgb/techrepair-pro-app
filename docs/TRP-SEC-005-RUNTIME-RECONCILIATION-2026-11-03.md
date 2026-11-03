# TRP-SEC-005 — Reconciliación entre fuente y runtime Base44
Fecha: 2026-11-03 | App: 695d708948469128f473d080
Baseline de editor: 628f101859e65fd0dee24c854c8200893e978ec8
Modalidad: solo lectura de runtime, sin despliegue, Publish ni mutaciones de datos.

## Dictamen
**CÓDIGO PASS / RUNTIME NO CERTIFICADO / NO-GO GENERAL.**

## Evidencias
- Base44 get_app_status=ready; versión del sandbox de editor 628f101859e65fd0dee24c854c8200893e978ec8.
- GET sandbox/preview-url devolvió preview-sandbox disponible (cold_start=false, restored_from_snapshot=false). Esto no certifica el código de cada función backend.
- GET backend-functions y GET app devolvieron truncated=true; no permiten comparar hashes ni versiones desplegadas de identityGateway.
- Los logs previos de identityGateway a 14:08 y 14:28 UTC registraron CONTEXT_BUILD / HTTP 400, y el retest SALES 6ae9ef2fad726c60d1c127bf terminó FAILED, failure_reason=platform.
- No se ha ejecutado retest tras la corrección SEC-004 de 28 copias; no atribuir la falla a una versión precisa sin evidencia.
- El API Base44 coding/redeploy-function hace un despliegue real. No se invocó por falta de autorización explícita.
- Fuente actual: 29 copias userAuthorization.ts, 58 firmas de filtros de membresía corregidas, 0 incorrectas. scripts/verify-identity-filter-sdk-contract.mjs PASS.
- SHA256 identityGateway/entry.ts: cb02b2d550ac72f65bfd3ab7d2318397e164f082966c296dcbf7999c939f340d.
- SHA256 identityGateway/_shared/userAuthorization.ts: 8eff7c69ed14fc9ec130980e80a6ac5e1752865543aecea0fe6502eaec97011f.
- Las copias crmGateway y operationalGateway de userAuthorization.ts comparten ese último hash.
- P0-AUD-01 sigue reproducible: dos escritores generan dos AuditEvent para una operación; PASS del test de reproducción NO significa seguridad aprobada.

## Condiciones de cierre
1. Obtener evidencia individual de versión/hash backend de identityGateway y dependencias (API de lectura soportada, editor de funciones o Base44 soporte). No inferirlo del git SHA.
2. Si difiere, preparar despliegue acotado y validación de runtime; requerir autorización explícita antes de ejecutar deploy. Si coincide, aislar la subetapa de CONTEXT_BUILD responsable del 400 sin datos sensibles.
3. Repetir SALES y luego el QA de CUSTOMER_SERVICE, BRANCH_ADMIN, INVENTORY, SUPER_ADMIN y demás roles en datos aislados.
4. Ejecutar E2E comercial aislado con evidencia de inventario, cobros e idempotencia.
5. Cerrar P0-AUD-01 solamente con atomicidad de persistencia real, prueba concurrente de runtime y evidencia de exactamente una fila.

## Prohibiciones
Sin Publish, redeploy o mutación productiva hasta autorización. No declarar GO ni inferir runtime PASS por contratos del código.
Continuar desde docs/TRP-AUDIT-MASTER-STATUS-2026-11-03.md.