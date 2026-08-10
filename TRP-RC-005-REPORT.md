# TRP-RC-005 — Security & Integrity Hardening

## Scope

This report covers only the P0 findings from the Product Readiness Review of PR #10. No UX, feature, publication, merge, or `CEOs/` changes are included.

## P0 resolution summary

### P0-01 — Canonical User Authorization

- Canonical predicate: `UserAccount.status === "active"`.
- The legacy `active` flag is compatibility data only and cannot grant authorization.
- Backend authorization paths touched by the PR reuse `isCanonicalActiveUserAccount`.
- Frontend identity and route guards consume the same predicate so invited, suspended, and status-less legacy memberships do not enter operational flows.

### P0-02 — Lifecycle Event Protection

- Client create/update/delete access to `OTEvent` is denied.
- Critical events are emitted only by backend-owned canonical flows.
- `processOTEvent` reloads tenant-scoped work-order state before critical derived actions and marks processing with a guarded update.
- FINALIZADA is validated from the locked current work order; a stale request cannot manufacture the transition or its event.

### P0-03 — QA Evidence Integrity

- Client create/update/delete access to `PruebaTecnica` is denied.
- `recordTechnicalTest` derives tenant, author, role, assigned technician, active QA cycle, and timestamps server-side.
- FINALIZADA requires current-cycle backend evidence from the assigned active technician and rejects later incompatible results.

### P0-04 — Inventory Atomicity

- Manual adjustments and Atomic Sale share `inventoryStockCas.ts`.
- Both use compare-and-set on expected stock, operation ownership markers, ambiguous-response reconciliation, and ownership-guarded rollback.
- Stale writes fail with a retryable conflict; rollback cannot overwrite stock already changed by another operation.

## P0-05 — Tenant isolation assessment

| Entity | Criticality | Current exposure | Risk | Recommended strategy | Applied in this PR |
| --- | --- | --- | --- | --- | --- |
| `UserAccount` | Critical | No entity RLS; onboarding, invitations, tenant selection, admin management, and super-admin flows access it directly | Cross-tenant membership disclosure or privilege mutation if platform defaults are permissive | Move all membership reads/writes behind a tenant-aware identity gateway, then apply self/tenant/super-admin RLS | No partial policy; requires identity/onboarding redesign |
| `User` | Critical | Built-in identity extension contains `is_super_admin` and impersonation state without local RLS | Privilege escalation or impersonation tampering | Make privilege and impersonation fields backend-only and separate mutable profile data | No partial policy; requires platform identity redesign |
| `Organization` | Critical | Broad frontend reads and writes; onboarding creates the organization before membership is established | Cross-tenant business/financial configuration exposure or mutation | Introduce backend organization gateway, bootstrap capability for onboarding, then tenant/self/super-admin RLS | No partial policy; current bootstrap order makes a local policy unsafe |
| `NoConformidad` | High | Operational tenant data | Cross-tenant quality and customer incident disclosure | Required `organization_id`, tenant-scoped create/read/update, no client delete | Yes |
| `Reciclaje` | High | Operational tenant and certificate data | Cross-tenant asset and environmental record disclosure | Required `organization_id`, tenant-scoped create/read/update, no client delete | Yes |
| `Partner` | High | SaaS commercial configuration, not tenant-owned | Commission manipulation or commercial disclosure | Super-admin-only CRUD | Yes |
| `PartnerReferral` | High | Cross-organization SaaS relationship | Referral/commission relationship manipulation | Super-admin-only CRUD | Yes |
| `SuperAdminAudit` | Critical | Mixed platform and operational events have no local RLS and are written directly by several frontend flows | Audit forgery, disclosure, mutation, deletion, or forged operational events | Split operational events from privileged audit, move both writers behind authorized backends, then enforce append-only policies | No partial policy; a create rule that preserves current frontend writers would still permit event forgery |

## Residual architectural risks

- `UserAccount`, `User`, and `Organization` require a coordinated identity/bootstrap redesign. Applying isolated RLS now would either leave an escalation path or break invitation acceptance, onboarding, tenant switching, and impersonation.
- `SuperAdminAudit` still mixes platform and operational event semantics. It remains a P0 until the event domains and their authorized backend writers are separated.

## Files changed

- Report/configuration: `TRP-RC-005-REPORT.md`, `package.json`.
- Entities: `Inventario.jsonc`, `InventarioHistorial.jsonc`, `NoConformidad.jsonc`, `OTEvent.jsonc`, `OrdenTrabajo.jsonc`, `Partner.jsonc`, `PartnerReferral.jsonc`, `PruebaTecnica.jsonc`, `Reciclaje.jsonc`.
- Shared backend security: `_shared/inventoryStockCas.ts`, `_shared/lifecycleSecurity.ts`, `_shared/qaEvidence.ts`, `_shared/userAuthorization.ts`.
- Backend functions: `adjustInventoryStock`, `createCategoriaInventario`, `createInventoryItem`, `createSale`, `createWorkOrder`, `getSmartIntakeByWorkOrder`, `initTechnicalActivity`, `listWorkOrders`, `manageOrgUser`, `processOTEvent`, `reassignWorkOrderTechnician`, `recordTechnicalTest`, `repairUserIdentity`, `resourceLockLite`, `transitionWorkOrderStatus`, `updateDiagnosticoResumen`, `updateInventoryItem`, `updateWorkOrderAttentionStatus`.
- Frontend consumers/guards: `AuthContext.jsx`, `DashboardOrgAdmin.jsx`, `PageGuard.jsx`, `WizardPreDiagnostico.jsx`, `UserManagementPanel.jsx`, `PruebasTecnicas.jsx`, `ColaRevision.jsx`, `OrdenesTrabajo.jsx`.
- Verification: `verify-assignment-contract.mjs`, `verify-atomic-reception-contract.mjs`, `verify-atomic-sale-contract.mjs`, `verify-commercial-flow-contract.mjs`, `verify-smart-intake-contract.mjs`, `verify-security-integrity-contract.mjs`.

## Validation evidence

- Assignment: 21/21.
- Atomic Reception: 24/24.
- Smart Intake: 23 behavioral + 12 source-contract checks.
- Commercial Flow: 16/16.
- Atomic Sale: 19/19.
- Security & Integrity: 7/7.
- CRM / Customer 360: 8/8.
- JSONC: 47/47 parsed.
- Global ESLint: passed.
- Syntax checks: 28/28 passed.
- `git diff --check`: passed.
- Production build: passed outside the sandbox. The local Base44 proxy remains disabled because `VITE_BASE44_APP_BASE_URL` is not configured.

## Final recommendation

**READY FOR MANUAL QA / NOT READY FOR MERGE**

P0-01 through P0-04 and the localized P0-05 corrections are resolved and verified. The RC can proceed to authenticated Base44 QA. Merge remains blocked by that E2E gate and by any P0/P1 discovered there; the documented architectural exposure in `UserAccount`, `User`, `Organization`, and `SuperAdminAudit` remains a known risk requiring coordinated remediation rather than incomplete RLS.
