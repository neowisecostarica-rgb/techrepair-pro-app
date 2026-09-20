# TRP CHECKPOINT — 2026-09-19 — MB6 PAUSE

## Source of truth / resume instruction
Canonical app: TRP Legacy / Technology Reliability Platform — Base44 App ID `695d708948469128f473d080`.
Resume directly from this checkpoint. Do not reopen completed MB1–MB5 work and do not publish production without Gustavo's explicit approval.

## Macroblock status
- MB1 reconciliation: completed automated layer.
- MB2 Nielsen Norman audit: completed.
- MB3 UX/UI remediation: automated implementation closed; human QA deferred to MB9.
- MB4 functional completion: implementation scope closed; runtime/release validation remains open.
- MB5 i18n ES/EN/PT/FR/NO: operational application automated implementation CLOSED. Public `TRPWebsite.jsx` and `WebsiteVisualEditor.jsx` intentionally deferred to MB8 website localization/experience. Human language QA deferred MB9.
- MB6 technical/security: IN PROGRESS. Current pause point is Function Registration Reconciliation.

## MB6 completed in source
1. Enterprise mutation audit/idempotency: Onboarding/Offboarding CONFIRM_ACCESS and CLOSE now use operation key, correlation, deterministic audit identity and replay handling. Contract 7/7 PASS.
2. Enterprise ORG/BRANCH isolation: enterprise cases/access items are branch scoped; new child items persist branch_id; legacy child rows resolve branch through parent. Contract 7/7 PASS; Operational Authorization 9 groups PASS.
3. Subject/custody matching: normalized reference/email/name; email stable fallback for new assignments/offboarding. Contract 7/7 PASS; Asset Control 10/10 and Offboarding 11/11 PASS.
4. P0-AUD-01 investigated honestly: remains OPEN. Dedicated concurrency harness proves application-level read-before-create can duplicate AuditEvent under simultaneous same-operation writers. Source schema exposes no proven atomic uniqueness primitive for `(organization_id, audit_operation_id)`. General release remains NO-GO on this P0 until atomic persistence + concurrent staging/runtime proof exists. Sequential audit/replay contracts remain green.
5. Impersonation/session source hardening: authoritative backend identity reread, explicit effective impersonated org, stale impersonation repair for normal tenant membership, cache/redirect reset before identity transitions, fail-closed gateway behavior. Contract 10/10 PASS; Identity/Tenant Security 7/7; Multi-user Foundation 11 groups PASS. Historical “no sesión” bug is NOT runtime-closed until staging Super Admin → org → return test passes.

## Exact current blocker / next action
Function inventory was reconciled by READ only:
- 58 directories under `base44/functions` total.
- `_shared` is not deployable.
- 57 deployable function directories.
- Only 25 currently have `function.jsonc`.
- Therefore 32 deployable functions are missing explicit manifests.
- Historical 31/51 counts are obsolete.
- About 41 literal `functions.invoke(...)` targets were observed; these need registration reconciliation too.

Attempted write twice through Base44 connector. Reads work, but write commands returned `403 Forbidden`. No manifest patch was applied. Do NOT assume the 32 manifests exist.

### Resume sequence
1. Test Base44 write access with a minimal non-production source operation.
2. If write succeeds, generate missing `base44/functions/<name>/function.jsonc` with `{name:<directory>, entry:'entry.ts'}` for every deployable directory lacking one.
3. Add `scripts/verify-function-registration.mjs` and package script `test:function-registration` verifying:
   - every deployable function has `entry.ts`;
   - every deployable function has valid `function.jsonc`;
   - manifest name equals directory name;
   - entry equals `entry.ts`;
   - literal `functions.invoke(...)` targets resolve to registered functions (excluding intentional internal calls such as `__internal_invite`).
4. Run registration verifier + lint + build + Identity/Tenant Security + Operational Authorization + git diff check.
5. Update MB6 runtime doc: source manifest drift closed, but actual Base44 runtime registration/deployment still requires staging validation.
6. Continue MB6 runtime/manifests reconciliation, then staging-required impersonation/session validation and remaining security/runtime items.

## Last known green validation
- MB5 operational literal-visible scan: zero genuine untranslated operational literals under the chosen scan; only canonical internal state such as `estado === 'pagada'` remains by design.
- Enterprise Mutation Audit 7/7.
- Enterprise Branch Isolation 7/7.
- Enterprise Subject Matching 7/7.
- Enterprise Onboarding 11/11.
- Enterprise Offboarding 11/11.
- Enterprise Asset Control 10/10.
- Enterprise Entitlement 6/6.
- Audit Operation Identity 9/9.
- Audit Coverage 7/7.
- Security Round 2 13/13.
- Impersonation/Session Hardening 10/10.
- Identity/Tenant Security 7/7.
- Multi-user Foundation 11 groups.
- Operational Authorization 9 groups.
- Build/lint/git diff were green before connector write failures.

## Release rules
- NO production Publish without Gustavo's explicit approval.
- P0-AUD-01 remains OPEN; do not call general release ready.
- Source/contract PASS is not equivalent to staging/runtime PASS.
- Human integral QA remains MB9.
