# TRP — First Paid Pilot Kit

Status: **draft for commercial approval — no offer is binding until approved by the product owner**
Reference plan: `TRP-MONETIZATION-PILOT-PLAN.md`

## A. Customer-facing pilot offer

### TechRepair Pro Pilot

TechRepair Pro helps a repair workshop manage the complete operating flow in one place:

- work orders and technical follow-up;
- diagnostics and customer quotes;
- point of sale, inventory, delivery, and warranties;
- customer and sales visibility for the workshop owner.

### Proposed pilot terms

| Item | Proposal |
|---|---|
| Plan | Pro |
| Price | ₡39,900 per month |
| Initial term | 30 days |
| Included onboarding | One setup and training session of 60–90 minutes |
| Included support | Weekly check-in during the pilot and priority operational support |
| Initial scope | Up to 3 branches and 10 active staff users — proposed commercial limit, not yet system-enforced |
| Payment | SINPE Móvil or bank transfer, confirmed before activation |

### What we need from the workshop

1. One responsible owner or administrator.
2. One reception/sales person and one technician for the first training.
3. Five representative repair jobs or cases to model the operational flow.
4. A small initial service catalog and representative inventory list.
5. Feedback at days 7 and 14.

### Pilot success definition

The pilot is successful when the workshop can process real work orders through diagnosis, quotation, payment, delivery, and warranty evidence without returning to disconnected spreadsheets as the system of record.

### Important note

This offer is a sales draft, not a legal contract, tax invoice, service-level agreement, or guarantee of uninterrupted availability. Final commercial and legal terms must be approved before sending it to a customer.

## B. Internal operator runbook

### 1. Qualify before promising activation

- [ ] Workshop has a clear owner/admin contact.
- [ ] Workshop operates in the intended initial market and currency.
- [ ] Core need matches TRP: repair work orders, quotes, inventory, POS, and delivery traceability.
- [ ] Customer accepts a guided pilot rather than a self-service unattended launch.
- [ ] No production activation is promised until technical release gates are approved.

### 2. Commercial confirmation

- [ ] Confirm selected plan, price, start date, payment method, and support channel.
- [ ] Confirm the business/legal name and billing contact outside the source repository.
- [ ] Receive and verify payment through the approved business process.
- [ ] Record the commercial evidence in the company billing system, never in source code or chat.

### 3. Tenant and data setup

Only after production activation has separate approval:

- [ ] Create Organization through the canonical provisioning path.
- [ ] Create first branch and assign initial Org Admin.
- [ ] Configure country, currency, business name, and workshop contact information.
- [ ] Create core service catalog and inventory categories.
- [ ] Load a small verified initial inventory set.
- [ ] Confirm the selected plan label and active organization status.

### 4. Guided acceptance session

Run these in order with the workshop staff:

1. Create a customer and device.
2. Open a work order.
3. Record technician assignment and diagnostic activity.
4. Produce a quote and obtain a customer decision.
5. Register a permitted payment/sale path.
6. Complete delivery and verify warranty/receipt evidence.
7. Review dashboard, inventory, and open work-order visibility.

If any critical integrity or authorization failure occurs, stop the customer session and escalate; do not work around the failure with direct data edits.

### 5. Follow-up cadence

| Time | Operator action | Required output |
|---|---|---|
| Day 0 | Setup and guided acceptance | Onboarding checklist complete or documented blocker |
| Day 3 | Short check-in | Adoption and support issues list |
| Day 7 | Operational review | Usage signal, unresolved defects, training actions |
| Day 14 | Value review | Pilot scorecard and renewal risks |
| Day 21–30 | Renewal conversation | Continue, revise scope, or stop decision |

### 6. Pilot scorecard

| Question | Pass signal |
|---|---|
| Are staff using TRP? | Two or more staff log work weekly |
| Is the main flow working? | Ten real work orders in 14 days |
| Is TRP the system of record? | Core flow completes without spreadsheet fallback |
| Is support sustainable? | Fewer than three critical interventions per week after onboarding |
| Is value commercial? | Customer pays or commits to renewal |

## C. Do not do during the pilot

- Do not promise plan limits are automatically enforced; they are not yet.
- Do not claim Stripe, automated subscriptions, invoices, refunds, or self-service billing exist.
- Do not use customer credentials in a support ticket, chat, source file, or test script.
- Do not bypass authorization, RLS, or canonical command paths to "make it work".
- Do not publish, create a production tenant, or collect payment until the separate technical release gates are approved.
