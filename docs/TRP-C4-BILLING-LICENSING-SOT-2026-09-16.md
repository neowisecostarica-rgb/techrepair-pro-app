# TRP C4 — Billing + Licensing / Activation SOT

Status: IMPLEMENTATION CLOSED — PROVIDER INTEGRATION DEFERRED
Date: 2026-09-16

## Principle
Billing, entitlement, license/access and operational organization status are separate state machines. No payment provider is claimed or integrated yet. Pilot activation is administratively controlled and auditable.

## Canonical states
Billing: trial → active → past_due → suspended → cancelled.
License: pending → active → grace → suspended → revoked / expired.
Billing interval: monthly / annual / contract.
Organization.status remains operational and must not be silently changed by billing.

## Authority
`EntitlementPolicy` remains backend commercial authority. It now stores license lifecycle, billing period/renewal/grace metadata and optional provider references. RLS remains service-role only. Plaintext activation secrets are not stored.

## Pilot activation
Super Admin can explicitly activate an existing entitlement policy. Activation records timestamp/method and audit operation `LICENSE_ACTIVATED`. Existing legacy tenants continue through compatibility behavior; no destructive migration/backfill is performed.

## Provider boundary
No Stripe/BAC/other provider is assumed. Provider customer/subscription references are fields for future adapters. Webhooks, invoicing, payment collection and automatic suspension require a separately approved integration.

## Safety rules
- no automatic tenant suspension from `past_due` yet;
- no real tenant backfill without authorization;
- controlled pilot mutation guard remains enforced;
- entitlement package and billing status remain auditable;
- license activation requires Super Admin and an explicit EntitlementPolicy.

## Renewal / grace transition policy
C4 establishes an explicit, auditable policy rather than automatic payment enforcement:
- `trial`: license may be active through the trial period; transition requires an explicit commercial event.
- `active`: normal commercial state.
- `past_due`: does NOT automatically block operational access. Super Admin/provider adapter may move license to `grace` with an explicit `grace_until`.
- `grace`: access remains commercially authorized until the explicit grace deadline; expiry does not mutate Organization.status by itself.
- `suspended`: billing/license restriction is explicit and auditable; operational Organization.status remains separate.
- `cancelled`: may coexist with active license until `current_period_end` when `cancel_at_period_end=true`; after that a future scheduler/provider adapter may mark expired, but C4 does not invent such automation.
- `revoked`: deliberate commercial access revocation, not a synonym for non-payment.

Backend action `adminSetCommercialLifecycle` is the authoritative manual transition mechanism for pilot/admin operation. It records billing/license state, period dates, renewal/grace metadata, cancellation-at-period-end and audit operation `COMMERCIAL_LIFECYCLE_SET`.

## C4 closure
Implemented: schema authority, effective entitlement projection, explicit activation, lifecycle transitions, auditability, Platform Console visibility/control, provider-ready references and strict separation from Organization.status.
Deferred intentionally: payment collection, invoicing/tax documents, provider webhooks, automatic renewal scheduler and automatic suspension. Those require a selected provider and commercial/legal requirements; they are not prerequisites to an assisted pilot.
