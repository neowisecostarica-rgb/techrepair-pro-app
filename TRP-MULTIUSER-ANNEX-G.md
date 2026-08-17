# TRP Multi-User Annex G — Cutover Registry

Verified working HEAD: `a64d1a5ee727077c09dda576070da004e87638f8`
Registry version: `TRP_MULTIUSER_COMMAND_POLICY_V1`

The browser compatibility adapter in `src/api/base44Client.js` routes protected entity CRUD to `operationalGateway`; therefore its entity calls are reachable mutation call sites but not independent authorities. The gateway is the common bypass/cutover boundary. Schema RLS denies direct CRUD for all protected operational entities.

## Backend function surfaces

| Surface | Classification | Target policy / disposition |
|---|---|---|
| `adjustInventoryStock` | P0 CUTOVER REQUIRED | `CP-INV-001`; canonical inventory writer |
| `auditBranchLegacyData` | DEFERRED | read-only legacy gate |
| `auditDeliveryLegacyData` | DEFERRED | read-only legacy gate |
| `auditInventoryLegacyData` | DEFERRED | read-only legacy gate |
| `auditMultiUserLegacyData` | DEFERRED | read-only M0 gate |
| `changeWorkOrderStatus` | RETIRED / FAIL CLOSED | authenticated requests receive `410 LEGACY_WORK_ORDER_WRITER_RETIRED`; lifecycle and attention fields have separate named owners |
| `createCategoriaInventario` | P1 CUTOVER REQUIRED | `CP-INV-001`; inventory administration command |
| `createClient` | P1 CUTOVER REQUIRED | `CP-CUST-001` |
| `createEquipment` | P1 CUTOVER REQUIRED | `CP-EQP-001` |
| `createInventoryItem` | P0 CUTOVER REQUIRED | `CP-INV-001` |
| `createSale` | P0 CUTOVER REQUIRED | `CP-SALE-001`; sovereign sale writer |
| `createWorkOrder` | P0 CUTOVER REQUIRED | `CP-OT-001`; sovereign reception writer |
| `crmGateway` | P1 CUTOVER REQUIRED | `CP-CRM-001` |
| `customer360Gateway` | P1 CUTOVER REQUIRED | protected DTO boundary; `CUSTOMER_360_AUTHORIZED` |
| `deliverWorkOrder` | P0 CUTOVER REQUIRED | `CP-DEL-001`; sovereign delivery writer |
| `dmrAuditor` | READ ONLY / PLATFORM ADMIN | positive `SuperAdminAudit` DTO; no DMR mutation authority |
| `dmrOrchestrator` | RETIRED / FAIL CLOSED | authenticated requests receive `410 DMR_ORCHESTRATOR_RETIRED`; `createWorkOrder` is the sole DMR creation authority |
| `dmrUtils` | P1 CUTOVER REQUIRED | internal DMR helper; no independent client authority |
| `getFinancialMetrics` | DEFERRED | protected read projection; capability/scope cutover |
| `getOTEventHealth` | DEFERRED | protected read/health projection |
| `getPublicCommercialDocument` | PUBLIC BOUNDARY | `CP-PUBLIC-001`; exact token-bound read |
| `getSmartIntakeByWorkOrder` | DEFERRED | protected read projection |
| `handleOTLifecycleEvent` | AUTOMATION | `CP-AUTO-001`; disable sovereign side effects without attestation |
| `identityGateway` | CONTROL PLANE / PLATFORM-MANAGED | preserve Base44 impersonation; provisioning routes to `CP-PROV-001` |
| `initTechnicalActivity` | P0 CUTOVER REQUIRED | `CP-TECH-001` |
| `listWorkOrders` | P1 CUTOVER REQUIRED | DTO-only read boundary |
| `manageBranchLifecycle` | P0 CUTOVER REQUIRED | `CP-BR-001`; sovereign branch writer |
| `manageOrgUser` | P0 CUTOVER REQUIRED | `CP-USER-001`; ORG_ADMIN only |
| `migrateLegacyUsers` | CONTROL PLANE / PLATFORM-MANAGED | controlled compatibility migration only |
| `operationalGateway` | P0 CUTOVER REQUIRED | generic protected CRUD boundary; sovereign writes must be retired/routed |
| `processOTEvent` | AUTOMATION | `CP-AUTO-001`; no payload-derived authority |
| `processPostSaleActions` | AUTOMATION | `CP-AUTO-001`; event consequence only |
| `reassignWorkOrderTechnician` | P0 CUTOVER REQUIRED | `CP-ASG-001` / `CP-ASG-002` |
| `recordTechnicalTest` | P0 CUTOVER REQUIRED | `CP-QA-001`; QA defect/custody cutover |
| `repairUserIdentity` | CONTROL PLANE / PLATFORM-MANAGED | sovereign identity repair; no tenant CRUD exposure |
| `resourceLockLite` | P1 CUTOVER REQUIRED | internal lock primitive; no independent policy grant |
| `technicalRecordCommand` | CUT OVER / GOVERNED | `CP-DIAG-002`; updates authorize the existing canonical graph; organization/branch/OT/diagnostic/technician/author relationships are immutable |
| `transitionWorkOrderStatus` | P0 CUTOVER REQUIRED | `CP-OT-002`; canonical lifecycle writer |
| `updateClient` | P1 CUTOVER REQUIRED | `CP-CUST-001` |
| `updateCustodiaData` | P0 CUTOVER REQUIRED | `CP-CUSTODY-001` |
| `updateDiagnosticoResumen` | CUSTODY-AWARE NAMED WRITER | technician-authored diagnostic truth; only the effective assigned technician may write; positive OT DTO |
| `updateInventoryItem` | P0 CUTOVER REQUIRED | `CP-INV-001` |
| `updateWorkOrderAttentionStatus` | P0 CUTOVER REQUIRED | `CP-TECH-002` / `CP-TECH-003`; projection only after cutover |

## Generic CRUD entity boundary

All create/update/delete operations below reach `operationalGateway` from the browser adapter. They are not proof of sovereign authority. Cutover classification is explicit:

- P0 CUTOVER REQUIRED: `ActividadTecnica`, `Cotizacion` final/customer decision fields, `DiagnosticMasterRecord`, `DiagnosticoEvidencia`, `DiagnosticoResultado`, `EntregaLog`, `Garantia` OT issuance, `Inventario`, `InventarioHistorial`, `InventarioReserva`, `OrdenTrabajo` lifecycle/custody/QA fields, `OTEvent`, `PruebaTecnica`, `SolicitudTecnica`, `Venta` committed state, `VentaItem`, `WorkflowGate`.
- P1 CUTOVER REQUIRED with explicit non-sovereign policy: `BloqueoTecnico`, `CategoriaInventario`, `Cita`, `Cliente`, `ComprobanteVentaLog`, `Diagnostico`, `DiagnosticoDocumento`, `DiagnosticoTecnico`, `Equipo`, `Expense`, `NoConformidad`, `NotaInterna`, `Notificacion`, `PreDiagnostico`, `PurchaseInvoice`, `Reciclaje`, `RegistroTiempo`, `Servicio`, `Supplier`, `SupplierPayment`, `TerminosYCondiciones`.
- CONTROL PLANE / PLATFORM-MANAGED: `Branch`, `Organization`, `User`, `UserAccount`, `SuperAdminAudit`, `AuditEvent`, `BranchLifecycleOperation`, `OperationLock`.
- P1 protected reads only: every entity above plus `Lead` and `MensajeCliente`, using entity-specific positive projections and branch/resource relationships. `OrdenTrabajo` generic reads never include device credentials or public bearer metadata; credential access exists only through `revealDeviceCredential` with required audit evidence.

The frontend mutation call sites are present in the following files and terminate at that gateway: `ActividadActiva`, `AprobacionesPanel`, `TerminosYCondicionesPanel`, `FormularioCotizacion`, both diagnosis wizards, `PanelOperativoDiagnostico`, `MiDiaTech`, notification components, OT agenda/resume helpers, prediagnosis helpers, technical blockers/notes/requests, sales components, and the Agenda, Calidad, CuentasPorPagar, Gastos, OrdenesTrabajo, Proveedores, PuntoVenta, Reciclaje and VentasCotizaciones pages. Sovereign paths in those call sites must migrate to named commands; UI visibility is never authority.

## Public and automation boundaries

- Public portals (`PortalCliente`, `PortalCotizacion`, `PortalGarantia`, `PortalComprobante`) may only consume `CP-PUBLIC-001` DTOs. Quote mutation uses `CP-QUOTE-002`; no other public mutation exists.
- `useNotificacionesAutomaticas` is frontend production and cannot be authoritative. It is a cutover target for `CP-NOTIF-001`.
- `handleOTLifecycleEvent`, `processOTEvent`, and `processPostSaleActions` remain legacy-gated for sovereign side effects until positive Base44 runtime attestation is proven.

## `src/backend-sot`

Classification: **LEGACY REMOVE / PROVEN UNREACHABLE**.

Evidence at baseline: no root package script, Vite entry, Base44 function, or source import reaches this subtree; its router imports a non-existent `../../middlewares/auth`; its separate `authenticate.js` decodes JWT without signature verification. It must not be connected or treated as an authority. Removal is safe cleanup but not required for the frozen implementation and is not performed here.

## Final cutover disposition

This section is the final status overlay for the exhaustive registry above. It does not claim a Base44 deployment or a production-data migration.

| Final status | Registered surfaces |
|---|---|
| **CUT OVER / GOVERNED** | `adjustInventoryStock`, `createCategoriaInventario`, `createClient`, `createEquipment`, `createInventoryItem`, `createSale`, `createWorkOrder`, `crmGateway`, `customer360Gateway`, `deliverWorkOrder`, `dmrAuditor`, `dmrUtils`, `handleOTLifecycleEvent`, `identityGateway`, `initTechnicalActivity`, `listWorkOrders`, `manageBranchLifecycle`, `manageOrgUser`, `notificationCommand`, `operationalGateway`, `processPostSaleActions`, `publicTokenAuthority`, `reassignWorkOrderTechnician`, `recordTechnicalTest`, `repairUserIdentity`, `resourceLockLite`, `technicalRecordCommand`, `transitionWorkOrderStatus`, `updateClient`, `updateCustodiaData`, `updateDiagnosticoResumen`, `updateInventoryItem`, `updateWorkOrderAttentionStatus` |
| **RETIRED / FAIL CLOSED** | `changeWorkOrderStatus` (`410 LEGACY_WORK_ORDER_WRITER_RETIRED`); `dmrOrchestrator` (`410 DMR_ORCHESTRATOR_RETIRED`) |
| **READ ONLY GATE — NOT EXECUTED** | `auditBranchLegacyData`, `auditDeliveryLegacyData`, `auditInventoryLegacyData`, `auditMultiUserLegacyData` |
| **PROTECTED READ / GOVERNED DTO** | `getFinancialMetrics`, `getOTEventHealth`, `getPublicCommercialDocument`, `getSmartIntakeByWorkOrder` |
| **AUTOMATION PLATFORM BLOCKED / FAIL CLOSED** | unattended `processOTEvent`; no side effect is enabled without a verifiable Base44 automation attestation |
| **CONTROLLED MIGRATION — NOT EXECUTED** | `migrateSupportRole` (dry-run default, explicit apply, idempotency/audit/recovery contract); compatibility normalization remains active |
| **CONTROL PLANE / PLATFORM-MANAGED** | Base44 Super Admin impersonation, Organization/User/UserAccount control paths, provisioning and identity repair |
| **LEGACY REMOVE / PROVEN UNREACHABLE** | `src/backend-sot` |
| **CANCELLATION POLICY PRESERVED / HARDENED** | the pre-existing admin/state/branch mapping remains authoritative; idempotent retries use the same target-role predicate and return only the work-order mutation projection |

### Generic CRUD final disposition

The browser compatibility adapter continues to expose entity-shaped calls for migration compatibility. Generic technical mutations fail closed at `operationalGateway`, while supported diagnostic, blocker, note and time-record calls route to `technicalRecordCommand`. Updates authorize the existing canonical record before mutation, and ordinary updates cannot change tenant, branch, work order, diagnostic parent, technician, author, customer or equipment relationships. `updateDiagnosticoResumen` accepts only the effective assigned technician. Every protected read and mutation response crosses an explicit positive projection; the generic OT read cannot return `contrasena_ingreso` or public bearer fields. Direct `AuditEvent` client CRUD remains denied.

### Final searches

- Active frontend role literals contain no tenant `SUPPORT`, `CFO`, `CEO` or `AUDITOR` authority assumptions.
- Public portals submit the URL bearer only to exact-purpose public endpoints; protected DTOs never echo the bearer.
- Critical notification production is backend-owned; the former browser producer is disabled.
- No Base44 publish, production backfill, role migration apply, or legacy-data mutation was performed.

## Policy pipeline closure overlay

Runtime boundary:

`ResolveAuthorizationContext -> EvaluateCommandPolicy -> ExecuteSovereignCommand -> named sovereign writer`

- Resolver: `base44/functions/_shared/userAuthorization.ts`; canonical membership, normalized role, capabilities, tenant and branch are backend-derived.
- Evaluator/registry: `base44/functions/_shared/commandPolicy.ts`; unknown policies, invalid principal classes, missing capabilities, wrong relationships, failed scope and failed command preconditions deny.
- Execution boundary: `base44/functions/_shared/commandExecution.ts`; only sealed evaluator decisions are accepted, the registered writer identity must match, and the supplied callback remains the named domain writer.
- Shadow mode: `OBSERVE_ONLY`; compatibility decisions can never grant. Allow/deny or deny-reason differences create `AUTHORIZATION_SHADOW_MISMATCH` evidence without bearer/token values. An authoritative ALLOW mismatch fails closed when its evidence cannot be persisted.

### Production paths wired in the closure run

| Command / entrypoint | Policy | Capability / authority | Effective relationship and scope | Named sovereign writer | Audit / shadow evidence |
|---|---|---|---|---|---|
| staff work-order transition | `CP-OT-002` + exact `OT_TRANSITION_POLICIES` edge | command-specific capability (`TECHNICAL_ASSIGNMENT`, `TECHNICAL_WORK`, `QUOTE_OPERATIONS` or `DELIVERY_OPERATIONS`) | `SUPERVISOR`, `EFFECTIVE_TECHNICIAN` or `BRANCH_RESOURCE`; exact tenant and OT branch | `transitionWorkOrderStatus` | `WORK_ORDER_STATUS_TRANSITIONED`; shadow mismatch event when compatibility differs |
| initial assignment / forced reassignment | `CP-ASG-001` / `CP-ASG-002` | `TECHNICAL_ASSIGNMENT`; initial compatibility permits `ORG_ADMIN`, `BRANCH_ADMIN`, `SALES`; forced reassignment precondition limits execution to administrators | `SUPERVISOR`; exact OT/destination tenant and branch | `reassignWorkOrderTechnician` | canonical assignment/reassignment evidence plus shadow mismatch event |
| technical-request stock fulfillment | `CP-REQ-003` | `INVENTORY_OPERATIONS` | `INVENTORY_FULFILLER`; request and inventory branch | `technicalRequestCommand->inventoryMutationService` | `TECHNICAL_REQUEST_FULFILLED`, inventory ledger/audit and shadow mismatch event |
| atomic delivery | `CP-DEL-001` | `DELIVERY_OPERATIONS`; compatibility observes the former `ORG_ADMIN` / `BRANCH_ADMIN` / `SALES` role gate | `BRANCH_RESOURCE`; exact OT tenant and branch; `FINALIZADA`/idempotent `ENTREGADA` state gate | `deliverWorkOrder` -> `executeDeliveryCommand` | `WORK_ORDER_DELIVERED`, delivery evidence and shadow mismatch event |
| branch lifecycle administration | `CP-BR-001` | `ORG_ADMINISTRATION` (`ORG_ADMIN` preset) | `ORG_RESOURCE`; canonical organization | `manageBranchLifecycle` -> `executeBranchLifecycle` | `BRANCH_LIFECYCLE_COMMITTED`, lifecycle operation and shadow mismatch event |
| public quote/customer decision | `CP-QUOTE-002` | resource-scoped `QUOTE_DECISION` authority contract; no staff capability | `CUSTOMER_TOKEN_RESOURCE`; exact purpose, quote, version, expiry, revocation/consumption and OT relationship | `handlePublicCustomerDecisionV2` | `PUBLIC_QUOTE_DECISION_COMMITTED`; token reference hash only, never bearer value |
| custody-aware technical record mutation | `CP-DIAG-002` | command-specific `TECHNICAL_WORK`, or `QUOTE_OPERATIONS` only for diagnostic documents | `EFFECTIVE_TECHNICIAN` or document-only `BRANCH_RESOURCE`; existing canonical tenant/parent/OT/branch is authorized and relationships are immutable on update | `technicalRecordCommand` | `TECHNICAL_RECORD_MUTATED`; backend audit-operation identity, server-derived authorship and rollback on audit failure |

The public `DIAGNOSTICADA -> APROBADA` and `COTIZADA -> APROBADA` paths validate the customer token before policy evaluation and do not call the staff membership resolver. A customer token receives no general capabilities.

### Explicit runtime pipeline exceptions

These surfaces remain backend-authoritative and fail closed through their pre-existing resolver, capability/role, scope and domain-writer guards, but do not yet call `ExecuteSovereignCommand`. They are visible migration exceptions rather than alternate grant authorities:

| Exception group | Current authority | Disposition |
|---|---|---|
| `createWorkOrder` (`CP-OT-001`) | named reception writer + resolver/branch/domain gates | pipeline migration exception |
| `initTechnicalActivity`, `technicalActivityCommand`, `recordTechnicalTest`, `updateCustodiaData`, `updateDiagnosticoResumen` (`CP-TECH-*`, `CP-DIAG-001`, `CP-QA-001`, `CP-CUSTODY-001`) | named technical/QA writers + effective-custody checks; diagnostic summary is technician-authored; all responses use positive DTOs | pipeline migration exception |
| `createSale` and staff quote operations (`CP-SALE-001`, `CP-QUOTE-001`) | sovereign sale writer / protected quote gateway + commercial integrity gates | pipeline migration exception |
| direct inventory administration/mutation commands (`CP-INV-001`) other than request fulfillment | canonical inventory mutation service + branch/idempotency/ledger guards | pipeline migration exception |
| customer, equipment, CRM, agenda, recycle and finance compatibility commands (`CP-CUST-001`, `CP-EQP-001`, `CP-CRM-001`, `CP-AGENDA-001`, `CP-RECYCLE-001`, `CP-FIN-001`) | resolver + `operationalGateway`/named gateway policy and projections | pipeline migration exception |
| `manageOrgUser` (`CP-USER-001`) | `ORG_ADMIN` resolver gate + last-admin/branch protections + named writer | pipeline migration exception |
| `notificationCommand` (`CP-NOTIF-001`) | authenticated recovery or blocked automation context + durable event dedupe | pipeline migration exception |
| provisioning (`CP-PROV-001`) | platform/self-provisioning contract + canonical tenant manifest/readiness writer | control-plane pipeline exception |
| legacy cancellation edges | frozen admin/state/branch mapping in `transitionWorkOrderStatus`; initial and idempotent calls share one authority predicate | policy preserved and blocker remediated; no new `CP-OT-002` edge invented |
| `CP-PUBLIC-001` public document reads | exact resource/purpose token validation and DTO projection | read-only; no mutation execution boundary required |
| unattended `CP-AUTO-001` | positive Base44 runtime attestation required | platform blocked / no execution |

No exception may use client-provided role, capability, organization or branch data as authority. The closure run did not publish or execute any runtime migration.

## Security blocker remediation overlay

- `ExecuteSovereignCommand` trusts exact evaluator objects through a module-private `WeakSet`; object spread and structured clones are denied as `UNEVALUATED_COMMAND_DECISION`.
- Public quote, warranty, receipt and work-order responses are validated as complete resource graphs. Nested sale items, warranties, quotes, equipment and diagnostic evidence are tenant/root-qualified before explicit public DTO projection.
- Protected list/filter/get and mutation results use entity/command-specific positive DTOs. Stored bearer, credential, cost snapshot, custody, lock and fingerprint fields cannot hitchhike from service-role records; the dedicated audited credential reveal is the only credential path.
- External request correlation is trace-only. `audit_operation_id` is the security identity. Lifecycle transitions generate it in the backend and persist it with true previous/new state, command, actor and commit timestamp. Audit failure retains those immutable facts; retry reconstructs the original transition rather than `current -> current`.
- No Base44 publish, schema application, backfill, migration apply or production mutation was performed by this remediation.
