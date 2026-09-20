# TRP MB4 — Enterprise / Super Admin reconciliation — 2026-09-19

## Status rule
- **AVAILABLE IN SOURCE**: implemented, protected and automated contract/build checks pass. This is not production certification.
- **BUILT — FINAL VALIDATION PENDING**: source is complete enough for staging/runtime/human E2E, but must not be represented as production-validated yet.
- **FUTURE**: concept/integration not implemented. Do not market as current.

## AVAILABLE IN SOURCE
### Super Admin / commercial authority
- Canonical organization provisioning through identityGateway + tenantProvisioning with readiness/audit.
- Explicit Core / Business(advanced) / Enterprise entitlement assignment; users are not the primary commercial meter.
- License/billing lifecycle, suspension/reactivation, backend-owned impersonation and append-only administrative audit context.
- Organization memberships with invited/active/suspended states and last-active-ORG_ADMIN protection.
- Branch lifecycle and canonical authorization projection.
- Enterprise is technically distinct from Business through `ENTERPRISE_ASSET_CUSTODY`, `ENTERPRISE_ONBOARDING`, `ENTERPRISE_OFFBOARDING`, `ENTERPRISE_COMMAND_EVIDENCE`.
- Enterprise mutation backends fail closed when the organization lacks the corresponding entitlement.

### Enterprise Asset Control
- Reuses canonical `Equipo`; no parallel asset inventory.
- Backend-owned assignment/return history, one active custody assignment, expected return, condition, notes and evidence.
- Person-centric custody and overdue-return visibility.
- Branch authorization and append-only audit events.

### Enterprise Onboarding
- Technology onboarding only; not HRIS.
- Person/email/start date, access-preparation checklist, confirmation/no-aplica states and guarded closure.
- UI and backend entitlement gate.
- Does not claim to create third-party accounts automatically.

### Enterprise Offboarding
- Minuto Cero, person/email, active-custody reconciliation, access coordination/evidence and guarded closure.
- UI and backend entitlement gate.
- Cannot close while assets or access confirmations remain pending.
- Does not claim third-party revocation.

### Enterprise Command & Evidence
- Consolidated custody, overdue returns, onboarding/offboarding, pending access and closed-case signals.
- Actionable exception routing to operational surfaces.
- Evidence boundary explicitly distinguishes TRP records from non-integrated external systems.

## BUILT — FINAL VALIDATION PENDING
All Enterprise items above remain here for **release status** until staging/runtime and human E2E are complete. Source-level availability is not a production claim.

Required before promotion to production-validated:
1. Deploy isolated staging manifests/functions/entities.
2. Runtime test entitlement switching Business ↔ Enterprise.
3. Runtime test ORG_ADMIN and BRANCH_ADMIN branch isolation.
4. E2E: onboarding open → confirmations → close.
5. E2E: asset assignment → expected return/evidence → return.
6. E2E: offboarding Minuto Cero → asset recovery → access confirmations → close.
7. Verify audit events for every state-changing Enterprise action.
8. Verify impersonation/session switching in deployed Base44 runtime.
9. Human responsive/accessibility/role-journey QA.
10. Controlled pilot before GO/NO-GO.

## FUTURE — DO NOT MARKET AS CURRENT
- Automatic provisioning/revocation in Microsoft 365, Google Workspace, Okta, Entra, VPN or other third-party systems.
- HRIS/legal/employment workflow, payroll, disciplinary or performance management.
- Device MDM remote wipe/lock unless a specific integration is built and validated.
- Automatic evidence imported from third-party identity/security systems unless integrated.
- Post-return disposition automation beyond TRP's existing operational asset workflow.
- Any external integration described only as “según alcance” remains evaluated/contracted work, not built capability.

## Public website boundary
Current public copy remains intentionally conservative. `Onboarding especializado`, governance/evidence language and `Integraciones según alcance` do not assert automatic Enterprise onboarding/offboarding or external account actions. Do not add Minuto Cero, automatic access revocation/provisioning, MDM or HRIS claims until final runtime validation and product decision.

## Automated checkpoint
Latest source checks:
- Enterprise Onboarding: 11/11 PASS
- Enterprise Offboarding: 11/11 PASS
- Enterprise Asset Control: 10/10 PASS
- Enterprise Command & Evidence: 7/7 PASS
- Enterprise entitlement: 6/6 PASS
- Navigation: 8/8 PASS
- Build/lint: PASS

## MB4 exit decision
**Implementation scope: CLOSED for planned Enterprise/Super Admin MVP work.**
**Release validation: OPEN and intentionally deferred to staging + MB7/MB9.**
No production Publish is authorized by this checkpoint.
