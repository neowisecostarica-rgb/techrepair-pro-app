# TRP MB6 — Technical / Security Runtime

## Status
IN PROGRESS — source hardening active; no production publish.

## Closed in source
- Enterprise Onboarding/Offboarding CONFIRM_ACCESS and CLOSE: explicit operation key, correlation, deterministic audit identity and replay handling.
- Enterprise Onboarding/Offboarding read isolation: organization + branch scope, including legacy child-item parent resolution.
- Enterprise Offboarding custody matching: normalized reference/email/name with stable email fallback for new custody/offboarding records.

## P0-AUD-01 — OPEN
Requirement: exactly one AuditEvent for the same organization + audit_operation_id under concurrent writers.

Current implementation performs read-before-create plus reconcile-after-create. This is safe for sequential replay and detects ambiguity after duplicates exist, but it cannot prove exactly-one under a race where two writers both observe no row and both create. The dedicated concurrency harness intentionally reproduces that race.

### Closure condition
P0-AUD-01 may only be marked CLOSED after the persistence layer provides an atomic uniqueness primitive for `(organization_id, audit_operation_id)` (unique constraint/index, atomic create-if-absent, transactional compare-and-set, or equivalent platform-supported primitive) and a concurrent runtime/staging test proves one persisted event. Application-only preflight checks are not sufficient.

Until then: controlled-pilot envelope may remain usable according to its existing runbook, but general release remains NO-GO on this P0.

## Next
1. Verify whether the current Base44 runtime/entity layer exposes an atomic uniqueness/upsert primitive suitable for AuditEvent.
2. If available, implement it and run real concurrent staging verification.
3. If unavailable, retain P0-AUD-01 OPEN and do not misrepresent source-contract tests as a concurrency guarantee.
4. Continue MB6 with impersonation/session runtime hardening and function packaging/runtime reconciliation.
