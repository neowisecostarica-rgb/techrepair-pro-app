# TRP — índice de documentación para continuidad

**Entrada para programación:** [AGENTS.md](../AGENTS.md), con reglas, gates, comandos y handoff obligatorio.

**LEER PRIMERO:** [TRP-AUDIT-MASTER-STATUS-2026-11-03.md](TRP-AUDIT-MASTER-STATUS-2026-11-03.md)

**SEC-019 (pantalla blanca total tras SEC-018):** [Instrumentación global de errores React; QA en navegador pendiente](TRP-SEC-019-ROOT-BLANK-PREVIEW-2026-11-03.md).

**SEC-018 (organización en contexto canónico):** [Eliminación del doble gate previo al panel, con QA real pendiente](TRP-SEC-018-CANONICAL-ORGANIZATION-CONTEXT-2026-11-03.md).

**SEC-017 (panel SALES/OWNER aún falla):** [Diagnóstico de pantallas y protección contra error de render](TRP-SEC-017-MIDIA-ROLE-PANEL-DIAGNOSTICS-2026-11-03.md).

**SEC-016 (video de cambio de usuario):** [QA y corrección del aislamiento frontend — validación real pendiente](TRP-SEC-016-NATIVE-USER-SWITCH-QA-2026-11-03.md).

**QA con cuentas existentes confirmadas:** [SEC-015 — SALES y ORG_ADMIN, solo lectura](TRP-SEC-015-EXISTING-SALES-QA-2026-11-03.md).

**Nueva ruta QA con identidad estable:** [SEC-014 provisionamiento de usuario QA en Base44 (pendiente de correo controlado)](TRP-SEC-014-STABLE-QA-IDENTITY-PROVISIONING-2026-11-03.md).

**Diseño de auditoría atómica:** [ADR P0-AUD-01, propuesta sin desplegar](TRP-P0-AUD-01-ATOMIC-LEDGER-ADR-2026-11-03.md).

**Bloqueos vigentes con issues:** [SEC-013 QA de identidad aislada](TRP-SEC-013-QA-IDENTITY-GATE-2026-11-03.md) ([GitHub #12](https://github.com/neowisecostarica-rgb/techrepair-pro-app/issues/12)) · [Auditoría atómica P0-AUD-01 (GitHub #13)](https://github.com/neowisecostarica-rgb/techrepair-pro-app/issues/13).

Esta es la entrada para cualquier nuevo equipo, Codex, Work o agente que retome TRP. La auditoría comercial-first de noviembre **no está cerrada integralmente**; hay correcciones con contratos PASS pero no un GO de runtime.

1. [Estado maestro de auditoría](TRP-AUDIT-MASTER-STATUS-2026-11-03.md) — decisiones, evidencias, bloqueos, pruebas y próximos trabajos.
2. [Plan maestro histórico](TRP-MASTER-EXECUTION-PLAN-2026-09-16.md) — roadmap anterior y referencia al estado posterior.
3. [Matriz multiempresa y E2E](TRP-SEC-001-E2E-001-QA-MATRIX-2026-11-03.md) — criterios de aceptación pendientes.
4. [Diagnóstico de acceso](TRP-SEC-003-IDENTITY-TESTING-AGENT-2026-11-03.md) — fallo del Testing Agent anterior a la corrección de consultas.
5. [SEC-002 Testing Agent](TRP-SEC-002-TESTING-AGENT-CHECKPOINT-2026-11-03.md) — primeros identificadores de flujos.
6. [SEC-001 seguridad](TRP-SEC-001-CHECKPOINT-2026-11-03.md) — evidencia de contratos y P0-AUD-01.

**Reglas de continuación:** No confundir los contratos automatizados con QA autenticado, ni la prueba de concurrencia que reproduce duplicación con PASS de seguridad. No hacer Publish, merges externos o modificaciones de datos operativos sin autorización. Antes de editar reconciliar commit de Base44, versión de funciones y estado de GitHub.
