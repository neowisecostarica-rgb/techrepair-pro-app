# TRP C4 — Billing + Licensing / Activation SOT

Status: IMPLEMENTATION FOUNDATION
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

## Next C4 slice
Expose license status, activation and renewal metadata clearly in TRP Platform Console; then define renewal/grace transition policy before any payment-provider integration.
