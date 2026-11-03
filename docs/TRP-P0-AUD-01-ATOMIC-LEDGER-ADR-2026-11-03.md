# TRP-P0-AUD-01 — ADR: Ledger transaccional para auditoría
Fecha: 2026-11-03 | Estado: PROPUESTA TÉCNICA PROBADA EN MODELO LOCAL, NO IMPLEMENTADA EN RUNTIME
App Base44: 695d708948469128f473d080 | Repo: neowisecostarica-rgb/techrepair-pro-app
Issue canónico: https://github.com/neowisecostarica-rgb/techrepair-pro-app/issues/13

## Dictamen actual
NO-GO general. La implementación actual de `base44/functions/_shared/auditEvent.ts` ejecuta `findExisting` seguido de `AuditEvent.create` y no es linealizable en presencia de concurrencia. `npm run test:audit-concurrency-boundary` reproduce 2 filas; que dé PASS significa que reproduce el defecto, no que lo resuelva.
El contrato de `POST /api/apps/{app_id}/entities/{entity_name}/upsert` de Base44 reconoce explícitamente que **dos llamadas concurrentes pueden crear el mismo registro**; no sirve como reparación de P0-AUD-01. Su API de entidades tampoco ofrece una transacción/unique constraint accesible en lo observado.
Se consultó `GET /api/apps/{app_id}/external-auth/list`: no hay integraciones externas conectadas (0). Por tanto aún no existe un almacén transaccional configurado para TRP.

## Arquitectura candidata
Usar un ledger autoritativo PostgreSQL (o tecnología equivalente aprobada con garantía demostrable) llamado únicamente desde backend, mediante conexión/credenciales protegidas. Base44 puede conservar una vista/replica para lectura, **nunca** como fuente de verdad de unicidad.
Clave de unicidad persistente: `(organization_id, audit_operation_id)`. Es obligatoria una operación `INSERT ... ON CONFLICT ... DO NOTHING` y posterior cotejo del hash canónico de campos inmutables. Un hash diferente con la misma clave se rechaza con `AUDIT_OPERATION_ID_COLLISION`, jamás sobrescribir una fila. No guardar secretos o datos personales innecesarios.
La propuesta SQL está en `docs/architecture/TRP-P0-AUD-01-POSTGRES-LEDGER-CANDIDATE.sql`. Se requiere permisos limitados a funciones backend, políticas de retención/backup, cifrado, observabilidad y alertas de duplicado/colisión.

## Pruebas ejecutadas (diferenciar rigurosamente)
1. Modelo local `python3 scripts/verify-p0-aud-01-atomic-ledger-model.py`: SQLite con constraint UNIQUE, 8 escritores concurrentes, exactamente 1 fila para mismo tenant/operación; retry idempotente; clave idéntica para otro tenant genera otro evento; hash diferente falla. **MODEL-ONLY PASS**. No prueba PostgreSQL ni Base44 real.
2. Prueba del código actual `npm run test:audit-concurrency-boundary`: confirma que 2 escritores generan 2 filas en implementación Base44 actual. **DEFECTO REPRODUCIDO**.
3. No se hicieron cambios al writer productivo, a los registros AuditEvent, ni despliegues.

## GATES de implementación, obligatorios antes de GO
- Aprobación de proveedor/infraestructura, costes y región de datos. Conectar el almacén transaccional a Base44 con secretos de backend, sin exponer una conexión a navegador.
- Definir identidad de operación y semántica inmutable con compatibilidad retroactiva, serialización estable/hashing idéntico entre procesos.
- Implementar writer único con inserción idempotente atómica y falla cerrada si falla la auditoría. Si un comando comercial ya se ejecutó, documentar reconciliación/saga; el ledger por sí solo no da transacción entre ventas y auditoría ni exactly-once para efectos comerciales.
- Garantizar autorización por organización, acceso mínimos al ledger, prueba de colisión, timeout, caída del proveedor y reintento. Nada de mutex en memoria ni cambio check-then-create.
- QA DE RUNTIME: 2, 8 o más instancias concurrentes con misma operación, distintas organizaciones, colisiones, caídas y reintentos; contar filas en almacén remoto y comparar consistencia de proyecciones Base44. Adjuntar logs y SHA exactos.
- Migración/historial: decidir sobre duplicados previos sin borrado automático; reconciliar registros anteriores; backup antes de mutaciones y rollback documentado.
- Actualizar documentación maestra, AGENTS.md, issue #13 y cerrar solo después de evidencia externa verificable. El QA browser sigue bloqueado por identidad de pruebas en issue #12.

## Decisión
**ADR propuesta, pendiente de aprobación.** Ningún proveedor ni conector fue contratado/conectado. No se ha migrado `AuditEvent`, no se alteró el writer ni se tocó producción. Hasta validar una primitiva atómica de persistencia en backend real, P0-AUD-01 sigue abierto.