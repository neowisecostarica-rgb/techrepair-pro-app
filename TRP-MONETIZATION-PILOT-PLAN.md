# TRP — Monetization and First Paid Pilot Plan

Date: 2026-08-24
Status: **proposal — no billing, product, or Base44 changes authorized by this document**

## 1. Objective

Validate that one real repair workshop will pay for TechRepair Pro before investing in automated subscription billing.

The first commercial milestone is not "Stripe live". It is:

> One workshop completes onboarding, uses the core operating flow for two weeks, pays manually, and agrees to renew.

## 2. Current product position

TRP already contains the operational product surface needed for a workshop pilot:

- work orders, technical activity, diagnostics, quotes, delivery, and warranties;
- point of sale, sales history, inventory, customers, CRM, and financial views;
- organization, branch, role, and provisioning foundations;
- customer-facing quote, receipt, and warranty portals.

The product also has a `basic` / `pro` / `premium` Organization field and a Super Admin plan catalog. These are **commercial labels only today**: source code does not yet enforce plan entitlements or subscription payment state.

## 3. What is not ready for automated SaaS revenue

Do not represent any of the following as implemented:

1. Stripe Checkout, subscriptions, invoices, webhooks, refunds, or dunning.
2. A billing ledger or a server-verified payment-state model.
3. Feature, user, branch, or volume limits enforced by plan.
4. Automated trial expiry, suspension for non-payment, or reactivation.
5. A production-release approval.

The repository has Stripe packages installed, but no application use of Stripe was found. The first pilot should therefore use manual billing.

## 4. Commercial offer for the first pilot

### Customer profile

Independent repair workshop in Costa Rica that has:

- one primary branch;
- at least one reception/sales user and one technician;
- recurring work orders and inventory movement;
- willingness to replace a spreadsheet, WhatsApp-only, or fragmented workflow.

### Pilot offer

- Plan: **Pro**.
- Founder price: **₡39,900** for implementation, setup and the first month;
  **₡19,900/month** thereafter while the subscription stays active and current.
- Availability: first 10 activated workshops only.
- Pilot term: 30 days, with hands-on onboarding and weekly check-ins.
- Collection: SINPE Móvil or bank transfer; issue the agreed commercial receipt/invoice outside TRP until billing is implemented.
- Activation: Super Admin assigns `pro` manually only after payment is confirmed.
- Renewal decision: day 21–30, based on actual workshop use and support burden.

This is a business proposal, not a tax, accounting, or legal determination. Confirm the commercial document and applicable Costa Rican tax treatment before charging.

## 5. Proposed plan matrix

The public catalog currently presents Basic at ₡19,900, Pro at ₡39,900, and Premium at ₡79,900 per month. The founder offer is a limited commercial exception for the first 10 workshops, not an automated billing rule. The following is the proposed operating contract for a future entitlement implementation; it must be approved before it becomes code.

| Area | Basic — ₡19,900 | Pro — ₡39,900 | Premium — ₡79,900 |
|---|---:|---:|---:|
| Branches | 1 | Up to 3 | Custom / fair-use |
| Active staff users | Up to 3 | Up to 10 | Custom / fair-use |
| Work orders, diagnostics, quotes, POS | Included | Included | Included |
| Inventory and warranties | Included | Included | Included |
| Core operational dashboard | Included | Included | Included |
| Advanced finance, sales, and team analysis | — | Included | Included |
| Multi-branch operations | — | Included | Included |
| White-label/public base URL | — | — | Included |
| Support | Standard | Priority | Priority + onboarding review |

Important: the listed capabilities are a **commercial proposal**. Existing role/capability authorization remains the only enforcement today; plan labels must not be relied on for access control until backend entitlements exist.

## 6. Manual billing workflow for the pilot

1. Qualify the workshop and record the commercial agreement outside the repository.
2. Confirm payment using the business's approved bank/SINPE process.
3. Super Admin creates the Organization, first branch, and initial Org Admin through the existing onboarding/provisioning flow.
4. Set the Organization plan to `pro` manually and record payment evidence in the company billing system, not in free-text source files.
5. Conduct a 60–90 minute onboarding session.
6. Review use and unresolved issues after days 3, 7, and 14.
7. On day 21, ask for the renewal decision; never suspend an operating workshop automatically during the pilot.

## 7. First-customer onboarding checklist

### Before activation

- [ ] Commercial contact, legal/business name, country, currency, and billing contact confirmed.
- [ ] Pilot price, start date, support channel, and payment method agreed.
- [ ] Production release gate approved; this checklist is not an authorization to publish.
- [ ] Organization, branch, and initial Org Admin created through the canonical flow.
- [ ] Initial service catalog, inventory categories, and at least five representative inventory items loaded.

### Training and acceptance

- [ ] Reception creates a work order.
- [ ] Technician records a diagnostic and quote.
- [ ] Customer quote decision and payment workflow are exercised.
- [ ] Sales/POS and an inventory movement are exercised.
- [ ] Delivery, receipt, warranty, and audit evidence are verified.
- [ ] Org Admin can add/operate the agreed staff roles.

### First 14 days

- [ ] Day 3 check-in: blockers and data quality.
- [ ] Day 7 check-in: usage, pending support, and training gaps.
- [ ] Day 14 review: value delivered, adoption, and renewal risks.

## 8. Metrics that decide whether to continue selling

Track per pilot customer, manually at first:

| Metric | Minimum signal |
|---|---|
| Activated users | At least 2 staff members use TRP weekly |
| Operational adoption | At least 10 real work orders processed in 14 days |
| Core-flow completion | Work order → diagnosis/quote → payment → delivery completes without spreadsheet fallback |
| Data quality | No unresolved tenant, inventory, or audit integrity incident |
| Support cost | Fewer than 3 critical support interventions per week after onboarding |
| Commercial validation | Customer pays or explicitly commits to renewal at the agreed price |

## 9. Technical launch gates

These gates remain separate from pricing and are required before a real paid production pilot:

1. Resolve the AUD-01B staging execution authentication path and run the two-writer runtime probe.
2. Classify Base44 CAS based on runtime evidence: `PROVEN`, `UNPROVEN`, or `INVALID`.
3. Complete final review/merge approval for the candidate audit change.
4. Complete the existing controlled-pilot and deployment-time audits identified in the security result documents.
5. Obtain explicit authorization before any production publish, schema apply, migration, backfill, or customer data creation.

## 10. Next implementation order

1. Approve or revise the proposed plan matrix and pilot price.
2. Resolve the staging authentication path and finish AUD-01B runtime certification.
3. Prepare the first pilot onboarding material and commercial agreement.
4. Run one controlled paid pilot with manual collection.
5. Only after renewal evidence, design a billing domain:
   - `Subscription` / billing-account record;
   - server-side entitlement checks;
   - Stripe Checkout and server-verified webhooks;
   - cancellation, renewal, failed-payment, and audit policies.

## 11. Decisions required from the product owner

- [ ] Confirm the first-pilot price and whether there is a discount or free trial.
- [ ] Confirm the Basic / Pro / Premium limits above.
- [ ] Choose the first pilot workshop and support owner.
- [ ] Decide whether manual collections are SINPE, transfer, invoice, or a combination.
- [ ] Approve the technical release gates before inviting any paid customer.

## 12. Scope protections

This plan does not authorize Stripe setup, production publish, user creation, payment processing, RLS/authentication changes, schema changes, remote data writes, or collection of customer credentials.
