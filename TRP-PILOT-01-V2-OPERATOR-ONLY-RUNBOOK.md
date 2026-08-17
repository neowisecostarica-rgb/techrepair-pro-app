# PILOT-01 v2 — Operator-only mutation runbook

This envelope is an operational containment for a named pilot organization. It does not close P0-AUD-01 and it is not a platform guarantee of exactly-one audit creation.

## Activation gate

Activation is performed by a canonical, non-impersonating platform administrator through `identityGateway` action `configureControlledPilot`. The request must name the organization, the designated operator user ID, the canonical branch ID, and `enabled: true`.

The backend rejects activation unless the organization and branch are active and the designated user is the only active membership in the organization, with persisted role `ORG_ADMIN`. Other memberships must be suspended before activation. Public quote-decision links must not be distributed for the pilot.

## Mandatory operating restrictions

- One named human, one Base44 account, one device, and one browser tab may operate the pilot organization.
- Never share the operator credentials or open a second authenticated session.
- Never double-click, retry in another tab, refresh during a mutation, or replay a request after a timeout.
- After any timeout, HTTP 5xx, `decision_pending`, lifecycle-lock conflict, ambiguous screen state, or unexplained audit discrepancy: stop all mutations and escalate for reconciliation.
- Automations, integrations, impersonation, membership changes, and public customer approve/reject actions remain disabled.
- The customer communicates approval or rejection outside TRP. The operator then uses **Registrar Aprobacion** or **Registrar Rechazo**. The resulting audit actor is the authenticated operator, not the customer.
- Public work-order, warranty, receipt, and quote reads may continue, but pilot reads do not write `public_last_viewed_at`.

## Stop and disable

First stop the operator and close the only application tab. Confirm no request is in flight and reconcile the last OT, quote, inventory reservation, `OTEvent`, and `AuditEvent`. A canonical non-impersonating platform administrator may then call `configureControlledPilot` with the organization ID and `enabled: false`.

Do not disable to work around a denial. A malformed enabled configuration is intentionally fail-closed and requires administrative investigation while operations remain stopped.

## Residual risk

The envelope prevents different users and known backend bypasses from mutating the pilot tenant. It cannot prove that the same authenticated account is not used concurrently from two sessions, and it does not make Base44 `updateMany()` or `AuditEvent` creation atomic. The one-device/one-tab/no-retry restrictions are therefore release controls, not convenience guidance.

P0-AUD-01 remains **OPEN**. General release remains **NO-GO**.
