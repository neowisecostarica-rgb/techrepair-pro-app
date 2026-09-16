# TRP C3 — Packaging + Pricing Decision

Status: COMMERCIAL BASELINE APPROVED FOR IMPLEMENTATION
Date: 2026-09-17
Product: TRP — Technology Reliability Platform
Territory: Technology Asset Operations

## 1. Principle
TRP is not priced as a cheap ticketing tool. The commercial model must preserve the complete operational core and differentiate packages by depth, scale and control. Roles answer WHO can act; entitlements answer WHAT the tenant contract enables.

## 2. Market anchors reviewed (Sep 2026)
Public pricing research shows repair-management products around USD 39–149/month at common SMB tiers, with RepairDesk publicly starting at USD 99/store/month and Growth at USD 149/store/month; RepairShopr publicly lists Starter USD 59.99/month and Repair Shop USD 129.99/month. IT asset products can price materially higher: Snipe-IT hosted tiers include USD 39.99 and USD 99.99 monthly, while Lansweeper Starter is roughly USD 199+/month billed annually for 2,000 assets. These are market anchors, not TRP feature equivalence.

## 3. Canonical packages
### TRP Core
For a professional operation that needs the complete essential workflow.
Includes the commercial core: organization/branches/roles, reception and work orders, canonical Expediente F0–F8, diagnosis/tests, quotes and approval, customers/equipment/assets, cash/collections, delivery/evidence, warranty, operational inventory, agenda and customer portal.

### TRP Advanced
Everything in Core plus greater operational depth, scale and control: advanced multi-branch operation, deeper analytics/productivity, Quality / Non-conformities, Recycling, CRM/Leads where production-ready, and advanced automations where production-ready.

### TRP Enterprise
Contractual package for larger or higher-governance organizations. Everything production-ready in Advanced plus enterprise controls and contracted capabilities such as organization scale, governance, evidence/retention, enterprise onboarding/support and approved integrations. Employee Technology Lifecycle and external integrations remain roadmap until implemented and validated; never sell roadmap as current functionality.

## 4. Billing unit
Primary contractual unit: ORGANIZATION / TENANT.
Do not price primarily per technician/user; that creates friction against adoption and reliable data capture.
Scale dimensions may include branches, active technology assets and contracted enterprise scope. Users are not the primary billing meter.

## 5. Commercial launch baseline
Currency of record for international pricing: USD.
Local CRC display may be maintained as a commercial display layer, not as a second entitlement model.

TRP Core: USD 79/month or USD 790/year.
TRP Advanced: USD 149/month or USD 1,490/year.
TRP Enterprise: custom annual contract / quote.

Annual baseline = 10 months of monthly price (approximately two months benefit) to encourage annual commitment without creating a different product.

These are TRP launch baselines and replace the legacy Basic/Pro/Premium prices as customer-facing commercial truth. Legacy plan codes/prices remain compatibility-only until migration is authorized.

## 6. Scale policy
Core and Advanced must not become unusable through arbitrary ticket/work-order caps. No transaction cap in the essential F0–F8 workflow.
Initial package scale policy should be entitlement-configurable rather than schema-hardcoded. Branch/asset thresholds can be introduced after pilot telemetry validates real usage. Enterprise is contract-based for high scale, governance or integration requirements.

## 7. Implementation / onboarding
Recurring subscription and implementation are separate concepts.
Core: self/guided onboarding can be included for launch pilots.
Advanced: guided onboarding/migration may be included or quoted depending on migration complexity.
Enterprise: implementation, migration, integration and specialized services are separately scoped/quoted unless contract explicitly includes them.
Do not invent a universal setup fee before pilot evidence.

## 8. Billing lifecycle
Commercial billing status: trial → active → past_due → suspended → cancelled.
Operational Organization.status remains separate from billing state. Payment events may drive an explicit suspension policy later, but billing must not silently mutate tenant access without an auditable policy.
Monthly / annual / contract are canonical billing intervals.

## 9. Legacy compatibility
Organization.plan basic/pro/premium remains a legacy provisioning field for existing tenants.
Compatibility mapping is non-destructive and never presented as final TRP packaging.
EntitlementPolicy is backend commercial authority.
No automatic migration of existing tenants or prices without an explicit migration/cutover step.

## 10. Reliability positioning
Commercial narrative: Repair → Reliability.
TRP operates in Technology Asset Operations.
Reliability Layer may later use availability, MTBF, MTTR, recurrence, assets at risk, maintenance compliance and lifecycle evidence. Do not commercialize a TRP Reliability Score until methodology is validated.

## 11. Acceptance criteria for C3
- Core / Advanced / Enterprise are canonical packages.
- USD 79 / 149 / custom are launch pricing baseline.
- Annual Core 790 / Advanced 1490.
- Organization/tenant is primary billing unit.
- No essential workflow transaction caps.
- Entitlement limits remain configurable.
- Legacy prices no longer customer-facing authority.
- Enterprise roadmap capabilities are not represented as current.
- Billing state remains distinct from operational tenant status.
