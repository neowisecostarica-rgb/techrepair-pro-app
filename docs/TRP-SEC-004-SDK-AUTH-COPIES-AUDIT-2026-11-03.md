# TRP-SEC-004 — Copias de autorización y alcance SDK
Fecha: 2026-11-03. Estado: DIAGNÓSTICO COMPLETADO, REMEDIACIÓN GLOBAL PENDIENTE / NO-GO.

## Hallazgo reproducible
Base44 SDK filter(query, sort, limit) trata el segundo argumento como sort. Las llamadas filter({user_id:user.id},100) y filter({user_email:user.email},100) envían sort=100 y omiten limit; forma correcta: filter(query, '-created_date', 100). scripts/verify-identity-filter-sdk-contract.mjs reproduce este comportamiento sin red.

## Inventario
- 28 archivos base44/functions/*/_shared/userAuthorization.ts con 56 llamadas defectuosas del patrón de membresías, usando 100 como segundo argumento.
- Incluyen crmGateway, customer360Gateway, operationalGateway y approveCotizacion. Una copia adicional reside en base44/functions/_shared/userAuthorization.ts.
- La copia de identityGateway/_shared/userAuthorization.ts se corrigió antes, junto con filtros de su entry.ts. Sin embargo, retest SALES sigue FAILED por HTTP 400 en CONTEXT_BUILD; no se sabe si se ejecutó el código actualizado.
- Se verificó mediante inspección que las copias pueden diferir en su semántica de autorización; NO sustituir archivos completos ni mezclar reglas de Super Admin.

## Evidencia runtime
- SALES runs 6ae9ea17c06b0cd8717dd21c y 6ae9ef2fad726c60d1c127bf: FAILED platform; acceso CRM bloqueado antes de cargar.
- Logs identityGateway 14:08 y 14:28 UTC: CONTEXT_BUILD / HTTP 400.
- GET backend-functions devolvió truncated=true; no hay confirmación de hashes del backend desplegado. Código de editor no prueba lo ejecutado en sandbox/producción.

## Plan seguro
1. Capturar baseline por función; editar SOLO dos firmas de filter por copia en candidato controlado, con diff y sin modificar reglas de autorización.
2. Añadir contrato SDK que recorra las 28 copias y confirme que ningún filtro de membresía pasa un número como sort.
3. Ejecutar identidad, aislamiento empresa/sucursal, comerciales, lint y build. Separar test que reproduce duplicación de uno que demuestra su resolución.
4. Reconciliar cada versión backend con el código fuente. Redeploy de función es un despliegue explícito en Base44; NO ejecutarlo sin autorización.
5. Repetir SALES y QA de roles en entorno dev; después E2E transaccional con fixtures aislados.
6. P0-AUD-01 sigue abierto: requiere una primitiva persistente atómica de unicidad por organización y operación, validada en runtime.

## Dictamen
El defecto está confirmado en la FUENTE. No está confirmado que las 28 funciones fallen actualmente en producción. El HTTP 400 de identityGateway sigue siendo bloqueo real; no atribuirlo con certeza a un único filtro sin traza.