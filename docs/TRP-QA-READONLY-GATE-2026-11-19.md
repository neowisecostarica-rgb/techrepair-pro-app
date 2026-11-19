# TRP · QA controlado de solo lectura · 19 de noviembre de 2026
**App:** `695d708948469128f473d080` · **Rama:** `main` · **Estado:** NO-GO PUBLISH / QA transaccional bloqueado.
**Reglas:** sin Publish, sin cambios en datos ni roles de Compu Store, sin seed del agente, sin correos/pagos, sin infraestructura nueva.

## Evidencia comprobada
1. Base44 Apps API (`GET /api/apps`, proyección exacta): `dev_environment_enabled=true`. Existe Test Data, pero esto no demuestra una separación de cuentas Base44 nativas ni el contexto de cada gateway.
2. Base44 Testing Agent: hay seis flujos preexistentes de lectura; sus seis ejecuciones del 3-nov finalizaron `failed` (cinco con `failure_reason=platform`, una sin clasificación). **No se inició nueva ejecución.**
3. Contrato oficial de `POST /testing-agent/executions`: el agente abre un preview con un usuario temporal y opera contra Test Data; cada run cuesta créditos. Contrato de `POST /testing-agent/data/seed`: el arranque de un run hace seed y puede **copiar hasta cinco registros de producción por entidad a Test Data, incluidos datos personales**. Por ello la ejecución automática es NO-GO sin una estrategia aprobada de aislamiento/PII; no se llamó a esos endpoints.
4. Se verificó la **existencia por nombre**, no el valor, de `TRP_EXTERNAL_EFFECTS_MODE` entre los secretos de la aplicación. El código de `processOTEvent`, `handleOTLifecycleEvent` y `_shared/externalEffectsPolicy` suprime Core.SendEmail salvo modo explícito `PRODUCTION`, pero no se pudo verificar el **valor efectivo** ni que todos los efectos externos estén cubiertos. No se ejecutaron eventos de OT.
5. Logs recientes (17–19 nov), lectura del runtime principal: `identityGateway` 59 respuestas HTTP 200 y `operationalGateway` 16 respuestas HTTP 200; `technicalRecordCommand`, `crmGateway`, `createSale` y `createInventoryItem` no devolvieron líneas en la ventana consultada. **Esto no reproduce ni cierra los HTTP 403/500 reportados por Ventas/Taller**, porque faltan sesiones y casos autenticados por esos roles.
6. En la revisión anterior de esta jornada el preview Super Admin cargó autenticado; se comprobó responsive a 358 px sin overflow global y navegación por hash; sin mutaciones.
7. `npm run lint`, `npm run build`, `npm run typecheck`: **PASS**. Typecheck limitado al alcance configurado en `jsconfig.json`.

## Suites de contrato (mock/código, no E2E)
**56 ejecutadas: 43 PASS y 13 FAIL.** De ellas, i18n **18/18 PASS**; las otras **25/38 PASS**.

Suites en FAIL:
- `test:multiuser-public-tokens`
- `test:multiuser-automation`
- `test:multiuser-provisioning`
- `test:multiuser-policy-pipeline`
- `test:security-round2`
- `test:enterprise-asset-control`
- `test:enterprise-offboarding`
- `test:enterprise-onboarding`
- `test:enterprise-mutation-audit`
- `test:enterprise-branch-isolation`
- `test:enterprise-subject-matching`
- `test:audit-concurrency-boundary` (`AUDIT_LOCK_UNAVAILABLE` en fixture sin lock)
- `test:impersonation-session-hardening`

**No interpretar FAIL como bug productivo sin triage ni PASS como certificación runtime.** Varios mocks han quedado desfasados respecto a CAS/lock, proyecciones y contexto canónico. La suite de seguridad 2 llega a una transición con `LIFECYCLE_AUDIT_PENDING` (HTTP 500): investigar antes de GO. La de concurrencia no demuestra unicidad durable/ACID de `(organization_id,audit_operation_id)`.

## Gates y siguiente intervención
1. Triage de los 13 FAIL; priorizar `security-round2`, `multiuser-policy-pipeline`, `impersonation-session-hardening` y `audit-concurrency-boundary`. Corregir fixtures solo con evidencia; nunca bajar aserciones para pintar verde.
2. Para E2E seguro: definir dataset **100 % sintético**, identidades QA aprobadas sin modificar usuarios nativos de producción y método que **no invoque el seed automático** de Base44; verificar contexto Test y que no copie PII. Hasta entonces, no ejecutar Testing Agent.
3. Certificar modo efectivo que impide correo, WhatsApp, SMS y cobros, sin silenciar producción.
4. Reproducir con roles SALES y TECHNICIAN: CRM, cotizaciones, inventario (lectura), orden, diagnóstico, permisos por sucursal y los reportes 403/500. Primero lectura, luego escritura solo con autorizaciones y gates cumplidos.
5. Resolver el requisito P0-AUD-01 (unicidad durable) y reconciliar versión preview/runtime publicado antes de decidir Publish.
6. Una vez E2E y auditoría PASS, obtener GO de Dirección General y publicar con verificación móvil.

**Dictamen:** QA estático y lectura de logs ejecutados; E2E autenticado/transaccional no ejecutado por riesgo de copia de datos reales y de efectos externos. Checkpoint nuevo requerido para conservar evidencia.
