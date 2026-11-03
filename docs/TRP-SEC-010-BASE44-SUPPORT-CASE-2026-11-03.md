# TRP-SEC-010 — Expediente de escalamiento Base44: identityGateway HTTP 400
Fecha: 2026-11-03 | Severidad: P0 para QA beta | Estado: LISTO PARA SOPORTE; NO enviado
App Base44 ID: 695d708948469128f473d080
Repo: neowisecostarica-rgb/techrepair-pro-app

## Resumen reproducible
Base44 Testing Agent asume rol SALES y abre CRM en test-data aislados. La sesión de Base44 se reconoce, pero TRP queda en 'Valid session · Identity service unavailable'. Las reintentos no resuelven. No se crean ni editan registros.
Cliente: src/components/contexts/AuthContext.jsx -> src/api/identity.js -> base44.functions.invoke('identityGateway',{action:'context'}).
Backend: base44/functions/identityGateway/entry.ts -> AUTH_ME PASA -> CONTEXT_BUILD falla en una consulta interna con HTTP 400. El handler devuelve 500 y código IDENTITY_GATEWAY_CONTEXT_BUILD_FAILED; la autorización es fail-closed.
El wrapper de diagnóstico contextStep ya se incorporó al código, pero sus identificadores no aparecen en los registros accesibles. La versión backend efectiva no está certificada.

## Ejecuciones y evidencia
- SALES 6ae9ea17c06b0cd8717dd21c: FAILED/platform; sesión válida, pantalla de indisponibilidad.
- SALES 6ae9ef2fad726c60d1c127bf: FAILED/platform; HTTP 400 en registros 14:28 UTC.
- SALES 6ae9fb462d67eca79f243657: FAILED/platform; HTTP 400 en registros 15:19 UTC.
- SALES 6aea004fab91e361e9cde919: FAILED/platform; HTTP 400 en registros 15:41 UTC; sin marcador contextStep.
- SALES 6aea023165a7bd96801de1e6 (tras redeploy puntual): FAILED/platform; informe de análisis goal_not_accomplished, issues=[]; el CRM no cargó.
- La función fue sincronizada puntualmente con API coding/redeploy-function/identityGateway; la respuesta estuvo truncada y la app registró commit 'Manual code change' 579e9ed003017518940b04ebde739bb8cc0f4b9f. La sincronización no produjo prueba PASS.
- Checkpoint pre-sincronización: 6aea020265e3a5041801b2f2 (SHA bceb4ad857e2d3469d19ce1d29f0b3e5efae3d0f).

## Hechos descartados o insuficientes
- La firma SDK `filter(query, sort, limit)` es idéntica en @base44/sdk@0.8.41 (usado por identityGateway) y 0.8.57 (instalado en el proyecto). Las 29 copias de userAuthorization ahora tienen 58 firmas correctas; 0 usos inválidos en pruebas estáticas.
- Base44 documenta que los usuarios temporales del Testing Agent no aparecen en el listado normal de User. Esto abre una hipótesis, no una causa demostrada: User.filter podría devolver [] y el código usa auth.me() como fallback.
- Los GET backend-functions y GET app devolvieron salida truncada; no demostraron versión/hash del backend que realmente ejecuta solicitudes.
- Un GET read-only de User con ID sintético fue bloqueado por auth_required (app privada); no produjo evidencia funcional.
- No hay evidencia de que CRM, permisos SALES o la API de datos comerciales fallen de manera autónoma; el bloqueo ocurre antes.

## Solicitud concreta a Base44
1. Confirmar el deployment/runtime hash y fecha efectivos de identityGateway cuando se ejecutó 6aea023165a7bd96801de1e6; confirmar si incluye helper contextStep.
2. Entregar trazabilidad de llamadas backend durante action=context (endpoint y status, SIN datos personales) para identificar si falla User.filter, UserAccount.filter, Organization.filter, EntitlementPolicy.filter o actualización de perfil.
3. Confirmar comportamiento de asServiceRole.entities.User.filter({id: testUserId},'-created_date',1) con usuarios temporales del Testing Agent: lista vacía, respuesta 400 o restricción especial de entidad User.
4. Verificar si coding/redeploy-function/identityGateway sincronizó la fuente y dependencias `_shared` y si la función correcta recibe requests del sandbox preview.
5. Proporcionar mecanismo verificable para leer logs de la instancia que atiende preview-sandbox, o referencia de ejecución/request ID trazable.

## Criterios de cierre
- Identificar la operación HTTP 400 y reproducir una corrección sustentada; registrar deployment/version efectiva.
- Repetir SALES en QA test-data y obtener acceso CRM correcto sin privilegios de SaaS Super Admin.
- Solo después ejecutar CUSTOMER_SERVICE, BRANCH_ADMIN, INVENTORY, SUPER_ADMIN y E2E comercial.
- P0-AUD-01 de AuditEvent duplicado bajo concurrencia permanece abierto y es una dependencia independiente de GO general.

## Seguridad y límites
No incluir tokens, emails, IDs de usuario reales ni PII en soportes o logs. No más redeploy por tanteo. No publicar sitio ni modificar registros productivos.