# TRP Multi-User Platform Blockers

## PB-AUTOMATION-001 — Base44 automation attestation unavailable

- Scope: `processOTEvent` and any future unattended side-effect consumer.
- Current repository/runtime evidence exposes no server-verifiable automation identity, signature, secret, or positive trusted-origin attestation.
- Payload fields such as `_trigger`, `event.entity_id`, `organization_id`, and resource IDs are intentionally not treated as authentication.
- Enforcement: unauthenticated `processOTEvent` calls return `503 AUTOMATION_TRUST_ATTESTATION_UNAVAILABLE` before reading an event or executing any side effect.
- Authenticated administrative recovery remains possible and tenant/branch authorization is revalidated.
- Required platform resolution: document and prove a Base44-provided server-side attestation contract, then validate it before enabling unattended consumption.
- No Base44 capability or production configuration was modified by this implementation.

Workflow events remain durable in `OTEvent`. `notificationCommand` can idempotently materialize supported notifications from those events under authenticated administrative recovery. The former browser-owned notification producer is disabled.
