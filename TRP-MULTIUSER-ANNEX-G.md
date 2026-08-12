# TRP Multi-User Annex G — Cutover Registry

Baseline HEAD: `d54460b7ae851a433a7c8456133545b6c8335650`  
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
| `changeWorkOrderStatus` | P0 CUTOVER REQUIRED | `CP-OT-002`; route to canonical lifecycle |
| `createCategoriaInventario` | P1 CUTOVER REQUIRED | `CP-INV-001`; inventory administration command |
| `createClient` | P1 CUTOVER REQUIRED | `CP-CUST-001` |
| `createEquipment` | P1 CUTOVER REQUIRED | `CP-EQP-001` |
| `createInventoryItem` | P0 CUTOVER REQUIRED | `CP-INV-001` |
| `createSale` | P0 CUTOVER REQUIRED | `CP-SALE-001`; sovereign sale writer |
| `createWorkOrder` | P0 CUTOVER REQUIRED | `CP-OT-001`; sovereign reception writer |
| `crmGateway` | P1 CUTOVER REQUIRED | `CP-CRM-001` |
| `customer360Gateway` | P1 CUTOVER REQUIRED | protected DTO boundary; `CUSTOMER_360_AUTHORIZED` |
| `deliverWorkOrder` | P0 CUTOVER REQUIRED | `CP-DEL-001`; sovereign delivery writer |
| `dmrAuditor` | P1 CUTOVER REQUIRED | read/audit support for `CP-DIAG-001` |
| `dmrOrchestrator` | P0 CUTOVER REQUIRED | `CP-DIAG-001`; canonical diagnosis/evidence path |
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
| `transitionWorkOrderStatus` | P0 CUTOVER REQUIRED | `CP-OT-002`; canonical lifecycle writer |
| `updateClient` | P1 CUTOVER REQUIRED | `CP-CUST-001` |
| `updateCustodiaData` | P0 CUTOVER REQUIRED | `CP-CUSTODY-001` |
| `updateDiagnosticoResumen` | P0 CUTOVER REQUIRED | `CP-DIAG-001` |
| `updateInventoryItem` | P0 CUTOVER REQUIRED | `CP-INV-001` |
| `updateWorkOrderAttentionStatus` | P0 CUTOVER REQUIRED | `CP-TECH-002` / `CP-TECH-003`; projection only after cutover |

## Generic CRUD entity boundary

All create/update/delete operations below reach `operationalGateway` from the browser adapter. They are not proof of sovereign authority. Cutover classification is explicit:

- P0 CUTOVER REQUIRED: `ActividadTecnica`, `Cotizacion` final/customer decision fields, `DiagnosticMasterRecord`, `DiagnosticoEvidencia`, `DiagnosticoResultado`, `EntregaLog`, `Garantia` OT issuance, `Inventario`, `InventarioHistorial`, `InventarioReserva`, `OrdenTrabajo` lifecycle/custody/QA fields, `OTEvent`, `PruebaTecnica`, `SolicitudTecnica`, `Venta` committed state, `VentaItem`, `WorkflowGate`.
- P1 CUTOVER REQUIRED with explicit non-sovereign policy: `BloqueoTecnico`, `CategoriaInventario`, `Cita`, `Cliente`, `ComprobanteVentaLog`, `Diagnostico`, `DiagnosticoDocumento`, `DiagnosticoTecnico`, `Equipo`, `Expense`, `NoConformidad`, `NotaInterna`, `Notificacion`, `PreDiagnostico`, `PurchaseInvoice`, `Reciclaje`, `RegistroTiempo`, `Servicio`, `Supplier`, `SupplierPayment`, `TerminosYCondiciones`.
- CONTROL PLANE / PLATFORM-MANAGED: `Branch`, `Organization`, `User`, `UserAccount`, `SuperAdminAudit`, `AuditEvent`, `BranchLifecycleOperation`, `OperationLock`.
- P1 protected reads only: every entity above plus `Lead` and `MensajeCliente`, using field-level projections and branch/resource relationships.

The frontend mutation call sites are present in the following files and terminate at that gateway: `ActividadActiva`, `AprobacionesPanel`, `TerminosYCondicionesPanel`, `FormularioCotizacion`, both diagnosis wizards, `PanelOperativoDiagnostico`, `MiDiaTech`, notification components, OT agenda/resume helpers, prediagnosis helpers, technical blockers/notes/requests, sales components, and the Agenda, Calidad, CuentasPorPagar, Gastos, OrdenesTrabajo, Proveedores, PuntoVenta, Reciclaje and VentasCotizaciones pages. Sovereign paths in those call sites must migrate to named commands; UI visibility is never authority.

## Public and automation boundaries

- Public portals (`PortalCliente`, `PortalCotizacion`, `PortalGarantia`, `PortalComprobante`) may only consume `CP-PUBLIC-001` DTOs. Quote mutation uses `CP-QUOTE-002`; no other public mutation exists.
- `useNotificacionesAutomaticas` is frontend production and cannot be authoritative. It is a cutover target for `CP-NOTIF-001`.
- `handleOTLifecycleEvent`, `processOTEvent`, and `processPostSaleActions` remain legacy-gated for sovereign side effects until positive Base44 runtime attestation is proven.

## `src/backend-sot`

Classification: **LEGACY REMOVE / PROVEN UNREACHABLE**.

Evidence at baseline: no root package script, Vite entry, Base44 function, or source import reaches this subtree; its router imports a non-existent `../../middlewares/auth`; its separate `authenticate.js` decodes JWT without signature verification. It must not be connected or treated as an authority. Removal is safe cleanup but not required for the frozen implementation and is not performed here.

