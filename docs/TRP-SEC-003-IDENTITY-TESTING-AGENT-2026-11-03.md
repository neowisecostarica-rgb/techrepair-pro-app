# TRP-SEC-003 — Bloqueo del servicio de identidad en Testing Agent
Fecha: 2026-11-03
App ID: 695d708948469128f473d080
Baseline analizada: 76cb801b85e11d6f68b6e331062efbe93d99e23a
Modo: inspección y registro, sin publicación ni mutación de registros.

## Evidencia de la ejecución
- Flujo: SEC-QA-03 SALES acceso CRM, flow ID 6ae9e9f78f0299c74d0fdc48.
- Ejecución: 6ae9ea17c06b0cd8717dd21c.
- Commit bajo prueba: 678eb563f94a3dc264cedd7827e4eedad4f7c91f.
- Entorno: preview-sandbox, base44_data_env=dev, usuario temporal SALES.
- Estado final: FAILED, goal_accomplished=false, failure_reason=platform, credits_charged=0.
- Pantallas visitadas: MiDia, CRM. El agente vio 'Valid session · Identity service unavailable' y reintentó sin lograr cargar CRM.
- No se crearon, editaron, convirtieron ni eliminaron registros.

## Diagnóstico técnico
- AuthContext.jsx llama getIdentityContext() -> identityGateway(action='context'). Si falla, base44.auth.me() solo verifica sesión; una sesión válida con gateway indisponible produce IDENTITY_GATEWAY_UNAVAILABLE y status=error (fail closed).
- Logs de identityGateway recuperados con API de Base44 en ventana 2026-11-03T14:00Z–14:20Z: errores repetidos a las 14:08 UTC en etapa CONTEXT_BUILD, código IDENTITY_GATEWAY_CONTEXT_BUILD_FAILED, error 'Request failed with status code 400'.
- Telemetría contiene target preview-sandbox--695d708948469128f473d080.base44.app, con non_ok_pre_response=true.
- API de logs con env=preview devolvió [] para la misma ventana; env=prod expuso los eventos asociados a preview-sandbox. La clasificación de ámbito de logs requiere confirmación; **no extrapolar indisponibilidad en producción**.
- Ruta de origen: base44/functions/identityGateway/entry.ts: action=context -> buildContext(). Dependencias dentro del contexto: loadBackendUser(User.filter), resolveIdentitySnapshot(UserAccount.filter por ID/email), Organization.filter, resolveEffectiveEntitlement. No hay traza suficientemente granular para identificar cuál de esas consultas devuelve 400.
- Esto es BLOQUEO DEL ENTORNO/IDENTIDAD, no evidencia de que CRM tenga un error de lógica de prospectos. El resultado categorizado por Testing Agent como platform respalda la clasificación provisional.

## Gate y plan mínimo
1. SEC-003a: solicitar a Base44 trazabilidad del HTTP 400 en identityGateway/CONTEXT_BUILD, request IDs y soporte para la ruta de sandbox. Confirmar si User.filter / UserAccount.filter / Organization.filter o entitlement es la llamada que falla.
2. SEC-003b: contrastar despliegue efectivo de identityGateway y dependencias con código del commit probado; resolver desalineación preview/runtime antes de editar permisos. Instrumentación adicional, si es imprescindible, **solo en candidato aislado**, con etapas/códigos no sensibles y sin registrar PII.
3. SEC-003c: repetir SEC-QA-03; requerir PASS del flujo y evidencia de UI más ausencia de escalamiento privilegiado. Repetir luego SEC-QA-05 y SEC-QA-07.
4. SEC-003d: iniciar E2E comercial únicamente con roles y datos de prueba confirmados.
5. P0-AUD-01 continúa abierto: unicidad de AuditEvent concurrente exige garantía atómica de persistencia y prueba de runtime. No confundir este bloqueo con el 400 de identidad.

## Prohibiciones
- No convertir errores de identidad en permiso fallback; no crear UserAccount ni tenant artificial en producción.
- No lanzar flujos de CUSTOMER_SERVICE o SUPER_ADMIN hasta que SEC-QA-03 se diagnostique.
- No Publish/deploy; no elevar roles ni modificar datos reales.
