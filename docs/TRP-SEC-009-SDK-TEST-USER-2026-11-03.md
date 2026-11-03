# TRP-SEC-009 — Compatibilidad SDK y usuario temporal del Testing Agent
Fecha: 2026-11-03 | Aplicación: 695d708948469128f473d080
**Dictamen:** Causa HTTP 400 todavía NO VERIFICADA; sin nuevo despliegue, Publish ni modificación de datos.

## Hallazgos verificados
- `identityGateway/entry.ts` importa `npm:@base44/sdk@0.8.41`; SDK de sandbox instalado `0.8.57` y otros gateways `0.8.25`.
- Se descargó @base44/sdk@0.8.41 a `/tmp/trp-sdk-0841` (fuera del repositorio) y se inspeccionó `dist/modules/entities.js`: firma `async filter(query, sort, limit, skip, fields)`; los argumentos corregidos son correctos también para 0.8.41.
- `identityGateway` primero realiza `base44.asServiceRole.entities.User.filter({id:user.id}, '-created_date',1)` en `loadBackendUser`, antes de `resolveIdentitySnapshot`.
- La documentación de la API oficial de Base44 para `GET /api/apps/{app_id}/entities/User` advierte que su listado EXCLUYE cuentas de corta duración creadas por ejecuciones de pruebas. Esta es una hipótesis relevante sobre usuario temporal, NO prueba de que el filtro falle. Una lista vacía debe disparar fallback a `auth.me()` según el código, pero respuesta HTTP 400 debe investigarse separadamente.
- La prueba read-only con ID sintético no existente, fields=id y limit=1 fue denegada por la API: `auth_required / This app is private`. Por tanto no se obtuvo prueba directa del comportamiento de la entidad en este contexto.
- Último retest posterior al redeploy puntual: Testing Agent `6aea023165a7bd96801de1e6` FAILED / platform; identidad indisponible. Base44 reportó app ready; GET de logs carece de marcadores de pasos. No afirmar que el redeploy haya corregido la función.

## Qué comprobar sin modificar seguridad
1. Obtener trazas de Base44 por request ID de Testing Agent y confirmar qué endpoint dentro de CONTEXT_BUILD responde 400. Solicitar a soporte visibilidad del bundle backend servido y de los registros de los marcadores `contextStep`.
2. Verificar con soporte si `asServiceRole.entities.User.filter` incluye la cuenta temporal del Testing Agent, devuelve [] o responde 400. Evitar asumir que una cuenta temporal es un User persistido.
3. Repetir solo UNA vez el recorrido después de un cambio que resuelva una causa identificada. No repetir a ciegas ni sustituir el fail-closed por fallback de autorización.
4. No cambiar `isCanonicalSuperAdmin`, impersonación ni membresías antes de QA multirol.
5. Mantener P0-AUD-01 abierto, requiere persistencia con unicidad atómica probada.

## Referencias operativas
- `docs/TRP-AUDIT-MASTER-STATUS-2026-11-03.md` estado maestro.
- `docs/TRP-SEC-007-IDENTITY-CONTEXT-STAGES-2026-11-03.md` diagnóstico por etapas.
- `AGENTS.md` instrucciones de continuidad.
- Base44 API: GET /api/apps/{app_id}/entities/User (nota sobre cuentas temporales).