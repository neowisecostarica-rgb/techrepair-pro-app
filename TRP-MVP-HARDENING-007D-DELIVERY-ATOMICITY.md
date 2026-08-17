# TRP-MVP-HARDENING-007D — Delivery Atomicity

## Scope

P0-05 replaces the distributed browser-owned delivery flow with one sovereign backend command: `deliverWorkOrder`. It implements recoverable operational atomicity; it does not claim that Base44 provides a multi-entity database transaction.

## Previous Architecture

`EntregarOT.jsx` previously finalized active activities, created `EntregaLog`, attempted to create `Garantia`, and finally called `transitionWorkOrderStatus`. Each write had an independent failure and concurrency boundary. The generic lifecycle function also allowed `FINALIZADA -> ENTREGADA` after finding any paid sale, while `processPostSaleActions` contained a `saldo_final -> ENTREGADA` bypass.

## Final Architecture

```text
Client
  -> deliverWorkOrder
  -> authenticated operational authorization
  -> canonical organization and OT branch
  -> technical, commercial and evidence preconditions
  -> stable operation key and deterministic fingerprint
  -> shared OT lifecycle lock
  -> recover or claim PENDING
  -> EntregaLog PENDING
  -> Warranty PENDING or NOT_APPLICABLE
  -> CAS OT FINALIZADA -> ENTREGADA
  -> activate warranty and commit EntregaLog
  -> OT delivery_status COMMITTED
  -> release lifecycle lock
  -> non-critical OTEvent processing
```

The lifecycle lock was extracted to `_shared/workOrderLifecycleLock.ts` and is shared by the existing state owner and delivery command. A public request to `transitionWorkOrderStatus` with `ENTREGADA` now returns `DELIVERY_COMMAND_REQUIRED`.

## Evidence Contract

The MVP requires:

- explicit `acceptance === true`;
- the backend-owned `DELIVERY_MVP_V1` legal text snapshot;
- backend actor and role;
- canonical organization, branch and work order;
- backend effective timestamp;
- optional normalized note;
- operation key and fingerprint;
- `PENDING`/`COMMITTED` logical state;
- immutable warranty outcome.

Signature, recipient name/ID, photos, attachments and exit-condition evidence remain optional future extensions and are not silently inferred.

`EntregaLog` remains externally append-only: operational create, update and delete are denied. Only the service-role delivery command may create it and advance its logical status.

## Warranty Applicability

The canonical source is the latest completed `DiagnosticoTecnico` satisfying:

```text
estado == listo_aprobacion
AND bloqueado == true
AND credito_consumido_finalizacion == true
```

The decision uses `tipo_intervencion`:

| tipo_intervencion | Outcome |
|---|---|
| `reparacion_puntual` | `ISSUED` |
| `mantenimiento_correctivo` | `ISSUED` |
| `diagnostico_tecnico` | `NOT_APPLICABLE` |
| `revision_general` | `NOT_APPLICABLE` |
| `mantenimiento_preventivo` | `NOT_APPLICABLE` |
| `limpieza` | `NOT_APPLICABLE` |
| missing / `otro` / unknown | fail closed |

`NOT_APPLICABLE` is stored on the delivery result and does not create a fake warranty.

When applicable, the backend issues one warranty with canonical identity `WORK_ORDER:<work_order_id>`, OT/client/equipment/branch references, server token, persisted delivery operation identity, and deterministic dates derived from the first backend `delivery_started_at`. The initial record is `PENDIENTE_ACTIVACION`; it becomes `ACTIVA/COMMITTED` only after the OT CAS succeeds.

Generic operational CRUD cannot create a WORK_ORDER warranty, alter origin/snapshot/dates/operation identity, reparent it, or delete it. Administrative update is restricted to a valid `estado` change on a committed warranty. Existing SALE-origin warranty creation remains available and receives its public token and canonical SALE identity from the gateway.

## Commercial Delivery Gate

The repository has no partial-payment ledger or `Pago` entity. A canonical `Venta` is binary: `pagada` represents full payment of that sale. P0-05 therefore reuses the existing commercial Source of Truth without creating accounting infrastructure.

The resulting rule is:

1. Scope all sales/quotes/gates to the OT organization, branch and customer.
2. If repair is applicable, or a repair sale/approved quote exists:
   - require exactly one authoritative `Venta.tipo_concepto == reparacion`;
   - require `estado == pagada`, `inventory_commit_status == COMMITTED`, and `total > 0`;
   - block any other non-annulled repair obligation;
   - if an approved quote exists, require `decision_status == COMMITTED`, `estado_conversion == CONVERTIDA`, `venta_id` equal to the paid sale, and matching totals;
   - an approved quote not linked to the paid sale blocks delivery.
3. For diagnosis/review without a repair obligation:
   - require the canonical `revision_venta_id` or exactly one committed paid `revision_diagnostico` sale;
   - require `diagnostico_habilitado` linked to that sale or a resolved `COMMERCIAL_AUTHORIZATION` WorkflowGate referencing it.
4. Multiple approved canonical quotes, multiple paid obligations, pending/inconsistent sales, mismatched totals, unresolved authorization or absent obligations fail closed.
5. The committed commercial decision is persisted as `delivery_commercial_snapshot`; replay after logical commit does not recalculate it.

Consequences:

- diagnostic payment plus unpaid repair: blocked;
- committed repair sale matching its approved quote: allowed;
- pending/inconsistent repair sale: blocked;
- replay: returns the original committed calculation.

## Idempotency and Concurrency

The normalized payload contains only work order, explicit acceptance, optional note, operation key, and the backend legal contract/version. A stable JSON serialization is hashed with SHA-256.

- same key + same fingerprint: recover/continue;
- same key + different fingerprint: `DELIVERY_FINGERPRINT_CONFLICT`;
- different key after commit: `ALREADY_DELIVERED`;
- existing PENDING: reconcile each critical record and continue;
- two concurrent users: the shared OT lifecycle lock permits at most one logical delivery.

Query-before-create is executed only while holding that lock. Ambiguous create/update responses are followed by canonical reconciliation before retrying or failing.

## Recovery and Critical Commit

Critical writes are monotonic:

1. OT claims delivery `PENDING`.
2. `EntregaLog` is created/recovered `PENDING`.
3. Required warranty is created/recovered `PENDING`, or `NOT_APPLICABLE` is persisted.
4. OT is changed with CAS to `ENTREGADA` while still `PENDING`.
5. Required warranty is activated/committed.
6. `EntregaLog` is committed.
7. OT is marked `delivery_status == COMMITTED` with canonical references.

No response can return `success: true` until step 7 reconciles successfully. A failure leaves an observable `PENDING` marker and `delivery_error`; replay with the same identity resumes. Active technical activities block before the first critical write and are never fabricated as `ok`.

## Non-Critical Side Effects

`OTEvent`, email, analytics, notifications, client cache invalidation and timeline projections are outside the commit. `deliverWorkOrder` emits/reconciles the `ENTREGADA` event after releasing the lifecycle lock. Event failure is returned as `PENDING_RETRY` and does not corrupt or roll back delivery.

## Legacy Gate

`auditDeliveryLegacyData` is ORG_ADMIN-only and strictly read only. It pages organization-scoped work orders, logs, warranties, activities, diagnostics, events, sales, quotes and WorkflowGates. It reports `gate`, `truncated`, audited totals, counts and bounded remediation references for all categories required by P0-05.

The runtime gate is intentionally deferred until the final RC is merged to `main` and Base44 executes the integrated code. The auditor never creates evidence, warranties, branches or dates.

## Tests and Regressions

`verify-delivery-atomicity-contract.mjs` contains 35 tests covering the 30 required scenarios plus canonical intervention mapping, deterministic fingerprint/date behavior, bypass closure and exact commercial source reporting. It includes fault injection before and after every critical phase and recovery after ambiguous writes.

Required regression commands:

```text
npm run test:delivery-atomicity
npm run test:inventory-integrity
npm run test:atomic-sale
npm run test:commercial-integrity
npm run test:commercial-flow
npm run test:operational-authorization
npm run test:security-integrity
npm run test:identity-tenant-security
npm run test:assignment
npm run lint
npm run build
```

## Files Modified

- delivery command, atomicity service, shared lifecycle lock and legacy auditor;
- `OrdenTrabajo`, `EntregaLog`, `Garantia` and `OTEvent` schemas;
- operational authorization/gateway;
- terminal lifecycle and post-sale bypass owners;
- `EntregarOT.jsx`;
- P0-05 and commercial-flow verification scripts;
- package test command and this document.

`createSale`, inventory P0-03, P0-07, CEOs, Wise Brain, `src/backend-sot/`, branch configuration and unrelated UI are not modified.

## Known Limitations and Deployment Considerations

- Base44 does not provide a claimed multi-entity DB transaction; correctness is operational, monotonic and replayable.
- Runtime unique constraints are not assumed. Uniqueness is enforced by the shared OT lock, persisted operation identity and reconciliation.
- Legacy delivered work orders do not automatically acquire new evidence. They must pass the read-only gate and receive separately approved remediation if blocked.
- `tipo_intervencion == otro` and incomplete diagnostic history fail closed.
- The runtime legacy audit cannot execute against this RC while Base44 continues to serve the version integrated in `main`.
