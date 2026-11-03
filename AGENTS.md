# AGENTS.md — TRP / Engineering handoff (obligatorio)

**Proyecto:** TRP — Technology Reliability Platform  
**Base44 App ID:** `695d708948469128f473d080`  
**GitHub oficial:** `neowisecostarica-rgb/techrepair-pro-app`  
**Actualización:** 2026-11-03  
**Estado de release:** **NO-GO general**. La auditoría está documentada, **no está cerrada**.

## Antes de trabajar (orden obligatorio)

1. Leer `docs/README.md`.
2. Leer `docs/TRP-AUDIT-MASTER-STATUS-2026-11-03.md` (fuente de verdad para el estado actual de la auditoría).
3. Leer `docs/TRP-SEC-004-SDK-AUTH-COPIES-AUDIT-2026-11-03.md` y `docs/TRP-SEC-005-RUNTIME-RECONCILIATION-2026-11-03.md`.
4. Leer `docs/TRP-SEC-001-E2E-001-QA-MATRIX-2026-11-03.md` antes de ejecutar pruebas.
5. Consultar el historial de checkpoints de Base44, el HEAD de GitHub y la versión que realmente atiende solicitudes; no confundir código guardado, preview, funciones backend y app publicada.

**No repitas la auditoría desde cero.** Primero identifica qué evidencia ya existe y cuál falta. Un cambio de versión o fallo de regresión sí puede justificar una nueva auditoría acotada.

## Resumen de hechos establecidos

- Dirección General eligió **secuencia comercial-first**: CRM → cotizaciones → inventario → ventas/cobros → recepción/OT. No regresar al orden técnico histórico sin decisión nueva.
- COM-001 a COM-004 tienen correcciones guardadas y contratos automatizados PASS. **No existe certificado de E2E real completo**.
- SEC-003: Testing Agent SALES falló dos veces con “Valid session · Identity service unavailable”; logs `identityGateway` muestran `CONTEXT_BUILD / HTTP 400`. Ejecuciones: `6ae9ea17c06b0cd8717dd21c` y `6ae9ef2fad726c60d1c127bf`. Ambas FAILED con `failure_reason=platform`; no es una prueba de fallo de CRM.
- SEC-003/004: corregidos errores de firma Base44 SDK `entities.Entity.filter(query, sort, limit)`. En 29 copias de autorización se verificaron **58 llamadas corregidas, 0 firmas inválidas**. El contrato `node scripts/verify-identity-filter-sdk-contract.mjs` pasa; otros controles de seguridad/comerciales también pasan. **No hay QA de backend runtime posterior que certifique el arreglo**.
- P0-AUD-01: `appendAuditEvent` permite registros duplicados en concurrencia. `npm run test:audit-concurrency-boundary` da PASS **porque reproduce el defecto**, NO porque lo resuelva. Se necesita unicidad atómica persistente y validación de concurrencia en runtime.
- SEC-005: repositorio y Base44 conectados; la comparación GitHub `628f1018` → `b6690e11` agregó solo documentación. La API para listar código backend desplegado devolvió información truncada; no hay SHA backend certificado.
- Se prepararon flujos de QA de SALES, CUSTOMER_SERVICE, SUPER_ADMIN, BRANCH_ADMIN, INVENTORY y navegación comercial (IDs en el informe maestro); **los pendientes NO deben figurar como PASS**.

## Último resultado SEC-007 (2026-11-03)

- Ejecución SALES `6aea004fab91e361e9cde919` contra `53272033893ab9fdba9cb94e45a018e381c3a574` finalizó **FAILED / platform**; CRM inaccesible. A las 15:41 UTC, logs de `identityGateway` todavía muestran `CONTEXT_BUILD / HTTP 400`.
- La instrumentación de etapas `contextStep` ya está en el código del editor, pero **ningún marcador de etapa apareció en los registros consultados**. Puede indicar versión backend diferente o visibilidad incompleta de logs; no presentar una hipótesis como hecho.
- **No repetir Testing Agent SALES** hasta verificar la implementación backend o establecer un método nuevo de diagnóstico. No asumir que editar archivos de función en sandbox no tiene efectos de runtime.

## SEC-009 — comprobación de SDK y usuario de pruebas (2026-11-03)

- Se verificó directamente @base44/sdk@0.8.41 usado por `identityGateway`: tiene `filter(query, sort, limit, skip, fields)` igual que el 0.8.57 instalado; los 58 filtros corregidos son válidos.
- Base44 documenta que la lista de User omite cuentas temporales de Testing Agent. La primera llamada de `buildContext` consulta `User.filter({id:user.id}, '-created_date', 1)`; falta determinar si devuelve lista vacía o HTTP 400. **No asumir causa sin logs/soporte**.
- La lectura exploratoria read-only a la API fue rechazada por `auth_required` (app privada), sin datos accedidos. Detalles en `docs/TRP-SEC-009-SDK-TEST-USER-2026-11-03.md`.
- Antes de otras pruebas/redeploy, exigir traza granular de `identityGateway CONTEXT_BUILD` y confirmación de versión runtime efectiva.

## SEC-010 — expediente de soporte (2026-11-03)

- Se creó `docs/TRP-SEC-010-BASE44-SUPPORT-CASE-2026-11-03.md` con evidencia técnica, cinco solicitudes específicas a Base44 y criterios de aceptación. **No se abrió ticket ni se envió**.
- Testing Agent SALES más reciente `6aea023165a7bd96801de1e6` tiene informe `goal_not_accomplished`, `issues=[]`; no accedió a CRM. No deducir PASS por lista de issues vacía.
- Escalar trazabilidad del HTTP 400 de `identityGateway` antes de otro redeploy o retest SALES; P0-AUD-01 sigue sin resolver.

## SEC-011 — esquema reparado y QA bloqueado por contexto organizacional (2026-11-03)

- Checkpoint previo al cambio `6aea0a97a6073aa1f2dc549c`. Se agregó únicamente `UserAccount.properties.user_id` de tipo string opcional; esquema Base44 y consulta directa por `user_id` ahora PASS. Conserva RLS fail-closed.
- Nuevo contrato `node scripts/verify-useraccount-schema-contract.mjs` PASS; impedir que se vuelva a eliminar `user_id` o se abran permisos de UserAccount.
- Prueba SALES `6aea0ad9f6c9bb351729f8f7`: **FAILED / goal_accomplished=false**, sin error de identidad; muestra onboarding `Configura tu organización` por falta de membresía del usuario temporal. CRM no validado.
- Consulta read-only sin datos personales: al menos 1 membresía activa de `UserAccount`, pero no se encontraron registros con `user_id` presente. El entorno de Testing Agent tiene cuentas temporales separadas; no inferir correspondencias.
- **Próximo gate:** preparar fixtures de prueba con organización, usuario temporal/membresía SALES y sucursal válidos, sin modificar relaciones productivas ni crear privilegios impropios. No repetir SALES hasta tener fixture verificada. P0-AUD-01 sigue NO-GO.

## SEC-012 — fixtures simuladas, navegación CRM y QA pendiente (2026-11-03)

- `scripts/verify-sec012-isolated-membership-fixtures.mjs`: 6/6 escenarios in-memory PASS, sin crear registros Base44: SALES empresa/sucursal, cruce empresa denegado, identidad ID distinta con mismo email denegada, invitado denegado, CUSTOMER_SERVICE no asume SALES, firma SDK correcta.
- 26 copias de `roleCapabilities.ts`: removida SOLO `CRM_OPERATIONS` de CUSTOMER_SERVICE para alinear el preset con `crmGateway` y `PageGuard` (permiten solo ORG_ADMIN, BRANCH_ADMIN, SALES); SALES conserva su permiso CRM. Checkpoint previo `6aea0e0a68cc2e37a54134c1`. El test de fixtures ahora verifica todas las copias y ambos guards.
- Ajustado test `scripts/verify-multiuser-navigation-contract.mjs` a política vigente: SALES tiene MiDia por SALE_OPERATIONS sin TECHNICAL_WORK; CUSTOMER_SERVICE ya no tiene CRM en navegación. Regresiones de seguridad, multiusuario, CRM y build PASS.
- La API de seed de Testing Agent puede copiar datos live al test-data, incluyendo PII. **No se ejecutó seed** ni se crearon membresías o usuarios reales. QA navegador y E2E siguen SIN PASS porque el usuario efímero del agente carece de membresía canónica. Ver `docs/TRP-SEC-012-SALES-QA-FIXTURES-PLAN-2026-11-03.md`.
- El siguiente equipo debe obtener identidad de QA aislada enlazada a organización/sucursal válidas o método soportado por Base44; no relajar seguridad, no vincular cuentas por email solamente y no repetir QA contra onboarding sin fixture.

## Instrucciones de operación y seguridad

- **No realizar Publish, redeploy manual, merges, cambios de permisos, ni cambios sobre clientes, inventario, ventas o cobros reales sin autorización específica.**
- **Advertencia sobre Base44 cloud sandbox:** los cambios guardados en archivos de funciones backend pueden sincronizarse automáticamente con el runtime de preview o entorno remoto, aunque no se pulse Publish. Antes de editar cualquier `base44/functions/**`, verificar efecto y alcance real. No afirmar “sin deploy” solo porque no se llamó a un endpoint explícito de despliegue; distinguir publicación a usuarios y sincronización de recursos.
- No crear fallback de autorización: ante fallos de `identityGateway`, bloquear acceso y preservar el aislamiento entre empresas/sucursales.
- No reescribir las distintas copias `userAuthorization.ts` usando una sola plantilla: algunas implementan políticas diferentes de Super Admin; modificar solo lo que corresponda, con diffs y regresiones.
- No sustituir P0-AUD-01 por `upsert` beta, consulta previa seguida de `create`, mutex de memoria o retardos: no son garantía de unicidad entre instancias.
- Para pruebas automatizadas, usar los datos de prueba aislados de Base44; confirmar roles efectivos, límites de tenant y sucursal, y ausencia de mutaciones productivas.

## Pruebas mínimas antes de marcar un cambio seguro

```bash
node scripts/verify-identity-filter-sdk-contract.mjs
npm run test:identity-tenant-security
npm run test:operational-authorization
npm run test:crm-customer360
npm run test:commercial-flow
npm run test:commercial-integrity
npm run test:inventory-integrity
npm run test:atomic-sale
npm run test:security-integrity
npm run test:impersonation-session-hardening
npm run test:superadmin-lifecycle
npm run build
git diff --check
```

No sumar `test:audit-concurrency-boundary` al conteo de pruebas de seguridad resueltas: **confirma el bloqueo vigente**.

## Próximos gates (en este orden)

1. **SEC-003/005:** reconciliar fuente vs backend efectivamente ejecutado de `identityGateway`; aislar HTTP 400; retest SALES con evidencia de navegador.
2. **SEC-QA:** validar autorización multiempresa, multisucursal y roles (incluido Super Admin) con casos positivos y negativos.
3. **E2E-001:** ejecutar CRM → cliente → cotización → aprobación → inventario → venta/cobro → comprobante en datos aislados, con reintentos.
4. **P0-AUD-01:** obtener e implementar garantía transaccional/constraint atómico y probar exactamente una fila bajo 2+ escritores concurrentes.
5. Consolidar informe final con evidencia SHA, fecha, actor, entorno y resultados, emitir dictamen GO/NO-GO. Mantener **NO-GO** mientras falte cualquiera de los gates obligatorios.

## Al cerrar cualquier sesión

Actualizar primero `docs/TRP-AUDIT-MASTER-STATUS-2026-11-03.md` con hallazgos, pruebas, cambios y bloqueos; enlazar documentos específicos; crear checkpoint Base44 para que el progreso sea restaurable. Conservar GitHub y Base44 reconciliados. Escribir **PENDIENTE / NO VERIFICADO** cuando falte evidencia.
