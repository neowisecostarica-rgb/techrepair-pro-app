# TechRepair Pro — estado actual y próxima sesión

Actualizado: 2026-08-24
Propósito: retomar el trabajo sin reconstruir el contexto. No contiene secretos.

## Estado de código

- Rama: `codex/trp-aud-01b-blocker-fixes`
- Commit candidato AUD-01B: `97e3a37831ec9130b87c9b16e9e4aca3739d85fc`
- Base: `1eb93a4a4b34c41561de95046dfa1880376f8dbc`
- Revisión adversarial del commit: **CONDITIONAL PASS — CODE READY, RUNTIME GUARANTEE UNPROVEN**.
- El código resuelve ownership persistido, pérdida de claim, create incierto,
  non-owner release y eventos ambiguos.
- CAS de Base44 continúa **UNPROVEN** hasta ejecutar el probe concurrente real.

## App de certificación aislada

- Nombre: `TRP-AUD01B-CAS-CERT-DO-NOT-PUBLISH`
- App ID: `6a831a96fe7af85246647a99`
- No es producción y no debe sustituirse por la app principal TechRepair Pro.
- Recursos preparados remotamente:
  - `Organization.jsonc`
  - `AuditEvent.jsonc`
  - `_shared/auditEvent.ts`
  - `aud01b-certification-probe/entry.ts`
  - `aud01b-certification-probe/auditEvent.ts` (copia sibling para respetar el
    sandbox de imports)
- Hay exactamente un sentinel remoto `TARGET_CONFIRMED` con `run_id: BOOTSTRAP`.
- No se han creado registros desechables `Organization` ni `AuditEvent`.
- El probe remoto **todavía no se ha ejecutado**.

## Bloqueo actual del probe

El runner local fue preparado para login interactivo Base44 con email y contraseña
oculta, sin exponer tokens. El intento devolvió `400 Invalid email or password`.
No se deben repetir intentos a ciegas ni almacenar contraseñas.

Probable causa: la cuenta del builder usa OAuth (Google) o no es un usuario admin
de la app aislada. Para continuar se requiere una vía de autenticación aprobada:

1. un usuario admin real de la app aislada con login email/contraseña, o
2. un mecanismo de token/sesión documentado y aprobado para el runner.

No crear usuarios, modificar autenticación ni cambiar la app aislada sin una
autorización explícita separada.

## Archivos locales de AUD-01B sin commit

- `TRP-AUD-01B-STAGING-PROBE-PLAN.md`
- `probes/aud01b/...`
- `scripts/run-aud01b-staging-probe.mjs`
- `scripts/verify-aud01b-staging-probe-contract.mjs`
- `package.json` (scripts locales del probe)

Última validación local registrada:

- Probe local: 13/13 PASS
- Contrato identidad AUD-01B: 20/20 PASS
- Contrato multiusuario: 7/7 PASS
- ESLint: PASS
- `git diff --check`: PASS; solo advertencia LF/CRLF existente de `package.json`.

## Monetización: estado y documentos

No hay billing automatizado ni límites aplicados por backend. `Organization.plan`
existe, pero se usa como dato administrativo/interfaz; no es evidencia de pago ni
un control de acceso.

Documentos locales creados:

- `TRP-MONETIZATION-PILOT-PLAN.md`: piloto pagado manual de 30 días.
- `TRP-FIRST-PAID-PILOT-KIT.md`: propuesta comercial y runbook de onboarding.
- `TRP-PLAN-ENTITLEMENTS-TECHNICAL-DESIGN.md`: diseño seguro de enforcement
  futuro, todavía no implementado.
- `TRP-MVP-MONETIZATION-TOMORROW.md`: orden de trabajo comercial y técnico para
  retomar el MVP y el primer piloto.

Catálogo de referencia pendiente de automatización:

- Basic: 1 sucursal, 3 usuarios.
- Pro: 3 sucursales, 10 usuarios; catálogo de referencia ₡39.900/mes.
- Premium: límites por contrato.

### Oferta fundadora registrada

- ₡39.900 por implementación, configuración y primer mes.
- ₡19.900/mes desde el segundo mes.
- Exclusiva para los primeros 10 talleres activados.
- El precio se conserva mientras la suscripción permanezca activa y al día.
- Incluye onboarding y configuración estándar; migraciones grandes,
  personalizaciones, soporte presencial y trabajo adicional se cotizan aparte.

El siguiente avance de monetización, sin riesgo, es confirmar esos límites y
después implementar controles backend inicialmente en modo observación, no en modo
bloqueo. Antes de un piloto productivo, el resultado del probe AUD-01B debe quedar
documentado y revisado.

### Avance local posterior: observación de límites

El modo observación ya fue implementado localmente, sin deploy:

- Nuevo shared module: `base44/functions/_shared/planEntitlements.ts`.
- `manageOrgUser` observa invitaciones nuevas que superarían la cuota propuesta.
- `manageBranchLifecycle` observa CREATE/REACTIVATE que superarían la cuota
  propuesta de sucursales.
- El único efecto es un `AuditEvent` de observación; cualquier fallo de ese log se
  captura y no bloquea el comando principal.
- No existe enforcement, downgrade automático ni cambio de plan.

Validaciones del avance: `test:plan-entitlements` 2/2 PASS,
`test:branch-lifecycle` 43/43 PASS, `test:multiuser-foundation` 11 grupos PASS,
ESLint PASS y `git diff --check` PASS (solo avisos LF/CRLF ya conocidos).

## Restricciones vigentes

- No tocar ni usar la app principal TechRepair Pro para el probe.
- No publicar, desplegar ni sincronizar masivamente Base44 sin autorización.
- No cambiar RLS, autenticación ni secretos sin autorización específica.
- No hacer commit, push o merge de los cambios locales sin autorización.
- Conservar `CEOs/` intacto: es preexistente y no rastreado.

## Checkpoint 2026-08-26 — avance READY TO SELL

- Estado contrastado con GitHub: `origin/main` avanzó a `807fa5a`; la rama actual
  está 3 commits ahead y 2 behind, con solape directo en `package.json`.
- La rama candidata todavía no tiene ref remota/PR. La autenticación local de
  GitHub está vencida y la CLI local de Base44 no está instalada.
- Se corrigió la observación de asientos para cubrir reinvitación y reactivación,
  no solo la invitación nueva. Continúa en modo observación, sin enforcement.
- `test:plan-entitlements`: 5/5 PASS. El inventario AUD de callers fue actualizado
  a 24 y `test:audit-operation-identity`: 20/20 PASS.
- Regresiones enfocadas de recepción, asignación, comercial, inventario, venta,
  entrega, sucursales, provisioning, técnico, piloto controlado y seguridad: PASS.
- El mock obsoleto del policy pipeline fue alineado con el claim CAS persistido;
  `test:multiuser-policy-pipeline`: 12/12 PASS sin cambio productivo.
- Clasificación y ruta mínima actualizadas en
  `TRP-MVP-READY-TO-SELL-CHECKPOINT.md`.
- No se ejecutó commit, push, merge, deploy, publish, schema apply ni escritura
  remota. AUD-01B runtime y el E2E autenticado continúan bloqueando venta productiva.

## Checkpoint 2026-08-27 — preparación de PR y recuperación controlada

- GitHub fue consultado por `git fetch`: `origin/main` avanzó a `af1699d` y la
  rama candidata publicada permanece en `46fe272`. Antes de integrar, la rama
  está **6 commits ahead y 2 commits behind** de `origin/main`.
- Los dos commits nuevos de `main` incorporan el plan/runbooks/matriz pre-publish,
  actualizan `@base44/vite-plugin` a `^1.0.32` y contienen la misma corrección de
  cotizaciones y clientes que estaba presente localmente. El merge-tree no
  reportó conflicto semántico en esos archivos.
- Validación local de los cambios candidatos: comercial 12/12, venta atómica
  28/28, entitlements 5/5, identidad de auditoría 20/20, policy pipeline 12/12,
  lifecycle de sucursales 43/43 y provisioning 6/6 PASS; ESLint específico no
  tiene errores y `vite build` PASS. Permanecen dos advertencias preexistentes de
  variables sin uso en `Saas.jsx`.
- GitHub CLI sigue con token inválido, por lo que el estado de PR no se pudo
  consultar ni mutar por `gh`; el remoto Git sí fue verificado. No se ejecutó
  push, merge remoto, deploy, publish, schema apply ni escritura en Base44.
- Gate Base44: **NO PUBLISH**. La recuperación continúa únicamente con inventario
  y reconciliación de solo lectura; cualquier staging, sincronización o Publish
  exige autorización explícita separada, y el runtime probe AUD-01B sigue
  bloqueado por una vía de autenticación aprobada.
- Cierre de preparación: los cambios TRP se confirmaron como `3c12ae1`,
  `origin/main` (`af1699d`) se integró localmente en `1c55d8c` sin conflictos y
  ambos commits fueron enviados a la rama candidata. GitHub confirma que el PR
  borrador #11 está abierto, con `1c55d8c` como head y `af1699d` como base.

## Checkpoint 2026-08-27 — incidente runtime de producción confirmado

- La aplicación principal **TechRepair Pro** (App ID `695d708948469128f473d080`)
  muestra en Vista Previa: “Error de Autenticación — No se pudo cargar la
  información de tu sesión”. No se trata como un problema de contraseña ni como
  motivo para relajar RLS, roles o comportamiento fail-closed.
- Inventario runtime de solo lectura, con sesión Base44 autenticada: producción
  tiene **31** funciones; el código aprobado contiene **51**. Las 20 ausentes
  incluyen `identityGateway`, `operationalGateway`, `customer360Gateway`,
  `crmGateway`, `deliverWorkOrder`, `manageBranchLifecycle` y
  `validateTenantReadiness`.
- Causa raíz operativa: el frontend publicado invoca `identityGateway` para
  resolver sesión e identidad, pero esa función no existe en el runtime de
  producción. El MVP no puede recuperarse solo con cambios de navegador,
  credenciales o configuración local.
- Decisión: preparar GO/NO-GO y staging; **no ejecutar Publish todavía**. Un
  Publish controlado solo podrá realizarse tras una confirmación final explícita
  del usuario, con la rama aprobada, inventario reconciliado, smoke tests y un
  plan de detención/rollback verificable.
