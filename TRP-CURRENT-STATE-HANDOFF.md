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

Propuesta pendiente de confirmación comercial:

- Basic: 1 sucursal, 3 usuarios.
- Pro: 3 sucursales, 10 usuarios; piloto recomendado a ₡39.900/mes.
- Premium: límites por contrato.

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
