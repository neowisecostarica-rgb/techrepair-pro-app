# TRP — CONTEXT RECOVERY / 15 SEP 2026

Status: CANONICAL RECOVERY NOTE
Recovered: 2026-09-16
Purpose: preserve the decisions and execution context from the broad 15-Sep discussion so future work does not depend on Gustavo remembering prior decisions.

## 0. Governing rule
This note is historical/canonical context feeding `docs/TRP-MASTER-EXECUTION-PLAN-2026-09-16.md`. When a later implementation decision conflicts with this recovered context, the conflict must be explicitly reconciled in the Master SOT; do not silently replace the 15-Sep decision.

## 1. What happened on 15 Sep
The work was not only technical cleanup. Gustavo explicitly requested a complete expert-level audit of whether TRP was a real sellable product and whether the direction was commercially viable. Scope included product viability, costs/pricing, packages, functions/limits, Enterprise applicability for organizations such as BAC and Municipalidad de San José, licensing/activation, commercial website, pilot and final QA.

The conclusion reached that day was: TRP is viable for an ASSISTED COMMERCIAL PILOT, not yet for an unattended mass-SaaS launch. Remaining work had to convert the hardened product into a reproducible commercial system.

## 2. Commercial baseline recovered from 15 Sep
The baseline discussed/accepted was:
- Core: USD 69/month or USD 690/year.
- Business: USD 129/month or USD 1,290/year.
- Enterprise: quote/custom annual contract + implementation.
- Early scale framing discussed around Core ~3 users / 1 site and Business ~8 users / multi-site. These numbers are commercial hypotheses to validate, not schema-hardcoded limits.
- Do NOT create artificial caps on customers, equipment/assets or work orders merely to force an upgrade.
- The complete essential operational workflow must remain usable; packages should differentiate depth, scale, governance/control, migration/integrations and Enterprise capability.
- Basic USD 39 / Pro USD 79 / Premium USD 149 were legacy/placeholder commercial artifacts found in the old product, not approved TRP commercial truth.
- Recurring billing, entitlements, licensing/activation and reproducible onboarding still needed implementation.
- Initial pilot could use administratively controlled sale/activation rather than pretending automated billing already existed.

IMPORTANT RECONCILIATION FLAG: On 16 Sep C1 introduced technical package IDs `core / advanced / enterprise`. The recovered 15-Sep commercial name was `Business`, not `Advanced`. Customer-facing naming must therefore be explicitly decided; do not assume the technical entitlement ID is the final commercial label.

IMPORTANT PRICING FLAG: The later C3 file created on 16 Sep with USD 79 / USD 149 is NOT considered approved canonical pricing until reconciled against this note. The 15-Sep baseline USD 69 / USD 129 is the recovered working baseline.

## 3. Product / viability conclusion
TRP had progressed beyond an idea or repair-ticket app. Technical hardening was sufficiently complete to proceed to product/commercial work, with automated suite 27/27 PASS plus build/lint PASS at the technical checkpoint. Human E2E QA remained intentionally deferred to the end.

Product direction had to evolve from repair management toward Technology Asset Operations / reliability, while preserving the operational repair/service workflow as a strong real-world foundation.

TRP should not become an ERP, accounting package, payroll/HR suite or generic everything-platform. Enterprise expansion should deepen technology asset operations, governance, lifecycle, evidence, SLA/maintenance and integrations.

## 4. The three megablocks agreed on 15 Sep
Gustavo explicitly accepted compressing the broad work into three major fronts before these were later expanded into the single A–H Master Roadmap:

### MB1 — Audit / commercial strategy
- Product viability.
- Costs and pricing.
- Packages and limits/capabilities.
- Commercial readiness.
- Enterprise applicability, including BAC / Municipalidad de San José type opportunities.
- Licensing/billing/activation needs.
- Pilot model.

### MB2 — Product design / identity / naming
- Product definition and simplification.
- NeoWise-level design audit, but TRP needed its own recognizable SaaS personality.
- Direction discussed as TRP INDUSTRIAL during the audit phase.
- Gustavo accepted changing the product name completely; at that moment TRP could remain a technical codename while naming was explored.
- Naming exploration later included Maximus, Vicius, Ronin and Japanese-language/concept explorations including samurai / leap-of-faith directions.
- This naming exploration was later superseded by the explicit decision to keep TRP and define it as Technology Reliability Platform. Therefore those candidate names are historical exploration, not current open tasks.

### MB3 — Web / commercialization / final QA
- Commercial website.
- Approved product story and positioning.
- Packages/pricing.
- Enterprise story.
- Screenshots/product reality, not roadmap fiction.
- Pilot/GTM.
- Human QA at the end.

## 5. Naming evolution and current reconciliation
15 Sep: Gustavo accepted potentially changing the name completely and treating TRP as technical codename while exploring alternatives.
Later exploration: Maximus, Vicius, Ronin and Japanese concepts.
Subsequent closed decision: retain TRP, official meaning `Technology Reliability Platform`; historical origin `Tech Repair Pro`; territory/category `Technology Asset Operations`.
Current rule: naming is CLOSED unless a serious legal/trademark blocker appears. Do not restart the naming exploration from the 15-Sep note.

## 6. Product definition that followed the audit
The audit/product-definition work established:
- ICP and product must be explicit rather than a collection of modules.
- Canonical operational workflow F0–F8.
- Expediente OT as operational Source of Truth.
- Role-oriented navigation and Command Centers.
- `Hoy` as actionable home.
- `Operación` for supervision/exceptions.
- `Órdenes` for reception/inbox/search, not a second operational center.
- Onboarding must drive organization → branch → users/roles → assets → first OT / first value.
- Technology Asset Lifecycle should connect asset → person → location → history → interventions → costs → decision → retirement.
- Reliability signals can be explainable; do not invent or commercialize a Reliability Score without validated methodology.

## 7. Visual/product identity
Gustavo wanted the product to feel designed at NeoWise quality, but the resulting rule became stronger: `TRP must look and feel like TRP, not NeoWise Design.`
TRP therefore needs its own shell, login, sidebar, typography, cards, tables, forms, states, charts, microinteractions and responsive behavior. NeoWise can appear discreetly as creator; TRP is the product identity.
Website should follow the final product visual system so sales screenshots are real and coherent.

## 8. Enterprise direction
Enterprise is not simply a more expensive SMB plan. Direction includes:
- Technology Asset Operations at organizational scale.
- Multi-site governance.
- Asset lifecycle/history.
- SLA / maintenance / reliability evidence.
- Security, least privilege, tenant isolation, audit/evidence/retention.
- API/SSO and other integrations only when actually implemented/contracted.
- Enterprise Command Center.
- Technology Employee Lifecycle as a later Enterprise capability: join → assets/access assigned → changes/support/history → leave → access removed → assets recovered → reassigned/serviced/retired.
- Do not build accounting, payroll, generic HRIS or legal termination logic into TRP.

BAC and Municipalidad de San José were examples used to force Enterprise-level thinking; they are not evidence of signed customers or approved scope.

## 9. Pilot / GTM
Pilot conclusion from 15 Sep:
- Assisted commercial pilot first.
- Compu Store is a natural real-world validation environment.
- Need reproducible onboarding, offer, activation/access, support process and success criteria.
- Do not claim mass-SaaS readiness before billing/licensing/runtime/final QA are complete.
- Feedback from real use should feed the product rather than pre-building every Enterprise idea.

## 10. Technical context that must not be forgotten
Correct active legacy/Base44 app for this execution: `695d708948469128f473d080`.
Historical local checkout referenced: `C:\Users\Tavo\Documents\Codex\techrepair-pro-app`.
Do not mix it with another TRP app/directory.
Technical baseline around this period included multi-tenant/RLS, native identity hardening, automation/provisioning work and automated tests 27/27 PASS; human E2E remained pending.
Historical identity/impersonation issue: switching impersonation Rodrigo → Gustavo/Compu Store could produce `no sesión` even when identityGateway returned 200. Must be tested in final human E2E.
Historical function-count incident 31 vs 51 is stale until runtime is remeasured; do not assume current parity from old evidence.

## 11. One-roadmap rule
On 15/16 Sep Gustavo identified that work was fragmenting and asked to combine everything so nothing was forgotten. Final operating rule:
- one Master SOT;
- do not run technical and commercial roadmaps in parallel;
- preserve DONE work;
- integrate product, commercial, Enterprise, web, pilot, runtime and QA in one sequence;
- QA human at the end where possible;
- do not reopen closed blocks without regression evidence.

This became `docs/TRP-MASTER-EXECUTION-PLAN-2026-09-16.md`.

## 12. Current sequence after reconciliation
A Product Completion — CLOSED implementation.
B TRP SaaS Visual System — CLOSED implementation; visual human QA deferred.
C Commercial Engine — ACTIVE. C1 commercial architecture and C2 entitlement authority implemented. C3 pricing/package decision MUST reconcile 15-Sep baseline before being declared closed. C4 billing/licensing follows only after C3 reconciliation.
D Website / Sales Experience.
E Enterprise.
F Pilot / GTM.
G Runtime + Human E2E QA final.
H Publish + Controlled Pilot.

## 13. Anti-forgetting protocol
From now on, after a major TRP discussion or decision:
1. Update the relevant SOT/decision note in the Base44 repo.
2. Update the Master Execution Plan status/decision register.
3. Create a Base44 checkpoint after validated implementation.
4. Never rely only on conversational memory for pricing, naming, package definitions, Enterprise scope or roadmap order.
5. If a later decision conflicts with an earlier canonical note, write an explicit `SUPERSEDES / SUPERSEDED BY` reconciliation instead of silently changing it.

## 14. Immediate correction generated by this recovery
- Treat `docs/TRP-C3-PACKAGING-PRICING-DECISION-2026-09-17.md` USD 79/149 as `NEEDS RECONCILIATION`, not approved pricing.
- Restore recovered working baseline USD 69/129/custom to the Master decision register.
- Resolve Business vs Advanced customer-facing name explicitly before C3 closes.
- Do not proceed to C4 until this reconciliation is recorded.
