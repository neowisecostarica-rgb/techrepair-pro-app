# TRP MULTI-USER — AUD-01B Atomic Audit Claim Closure

Date: 2026-08-20
Status: **CODE COMPLETE / RUNTIME DEPLOYMENT NOT APPLIED**

## Outcome

`appendAuditEvent` no longer relies on `filter -> create -> reconcile` as its concurrency guarantee. Audit materialization is serialized per tenant with a compare-and-set claim on the already-existing `Organization` row.

For a given `(organization_id, audit_operation_id)` the code now guarantees at most one `AuditEvent.create` attempt at a time. Compatible replays resolve to the same canonical event, incompatible identity reuse fails closed, and legacy multiplicity remains an ambiguity error.

## Atomic protocol

1. Build the canonical event and hash only its immutable operation identity.
2. Reconcile an already-visible `AuditEvent` before claiming.
3. Acquire `Organization.audit_claim_token` with `Organization.updateMany` only while that field is missing or null.
4. Read back the random backend token, operation ID and identity hash after every reported or ambiguous claim acquisition.
5. After re-checking for an existing event, verify the persisted ownership tuple again immediately before `AuditEvent.create`.
6. Confirm the created event is visible and compatible before conditionally releasing the exact claim token.
7. Reconcile ambiguous create and release responses without issuing a second create.

The claim has no expiry and no automatic takeover. This is intentional: a time-based lease without a native unique index or fencing token could allow an old owner to resume after takeover and create a second event.

## Failure and recovery semantics

- A live compatible contender waits briefly for the canonical event, then returns it as a duplicate.
- A contender with incompatible immutable semantics receives `AUDIT_OPERATION_ID_COLLISION`.
- A busy or orphaned claim that does not produce an event receives `AUDIT_CLAIM_RECOVERY_REQUIRED`; no event is created and the claim is not stolen.
- If `AuditEvent.create` throws and persistence cannot be proven, the owned claim is retained for manual recovery.
- If create succeeds but visibility cannot be confirmed, the claim is retained with `AUDIT_EVENT_VISIBILITY_UNCONFIRMED`.
- More than one matching audit row remains `AUDIT_OPERATION_ID_AMBIGUOUS`.

Manual recovery must be performed by an authorized platform operator while tenant mutations are stopped:

1. Read the exact `Organization` claim tuple and query `AuditEvent` by its organization and operation ID.
2. If exactly one compatible event exists, clear the claim with a compare-and-set on the exact token/hash/operation tuple.
3. If no event exists, first prove no request is still in flight; only then clear the exact claim and retry the original sovereign command.
4. If multiple or incompatible rows exist, keep the tenant blocked and escalate for forensic reconciliation.

No recovery, schema apply, publish, migration, backfill or runtime record mutation was executed in this change.

## Schema

Backend-only `Organization` fields added:

- `audit_claim_token`
- `audit_claim_operation_id`
- `audit_claim_identity_hash`
- `audit_claimed_at`

All deny client read/write through field RLS. The existing entity-level RLS remains deny-all for direct client CRUD.

## Verification

- AUD operation identity and atomic-claim contract: **20/20 PASS**.
- Multi-user audit coverage: **7/7 PASS**.
- Security Round 2: **13/13 PASS**.
- Assignment: **22/22 PASS**.
- Atomic reception: **24/24 PASS**.
- Commercial integrity: **12/12 PASS**.
- Inventory integrity: **22/22 PASS**.
- Atomic sale: **28/28 PASS**.
- Delivery atomicity: **35/35 PASS**.
- Branch lifecycle: **43/43 PASS**.
- Multi-user technical: **7/7 PASS**.
- Multi-user technical requests: **6/6 PASS**.
- Multi-user foundation: **11/11 PASS**.
- Security blocker remediation: **9/9 PASS**.
- Aggregate exercised groups/tests: **259 PASS**.
- ESLint: **PASS**.
- Production Vite build: **PASS**. The first sandboxed attempt was blocked from reading an esbuild support path; the approved unrestricted retry completed and refreshed `dist`.
- `git diff --check`: **PASS** (line-ending notices only).

## Release disposition

AUD-01B is closed in source, but P0-AUD-01 must remain operationally open until the four schema fields and function code are deployed together and a runtime two-request concurrency probe proves exactly one canonical `AuditEvent`. The operator-only pilot controls remain in force until that deployment gate is completed.
