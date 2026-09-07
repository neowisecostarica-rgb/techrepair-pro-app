# TRP AUD-01B — isolated Base44 certification plan

## Status

Local bundle repair prepared and validated only. This repair step did not read, write, or execute anything in Base44.

- Certification app: `TRP-AUD01B-CAS-CERT-DO-NOT-PUBLISH`
- Certification App ID: `6a831a96fe7af85246647a99`
- Candidate: `97e3a37831ec9130b87c9b16e9e4aca3739d85fc`
- Base: `1eb93a4a4b34c41561de95046dfa1880376f8dbc`
- Production app: explicitly out of scope
- RLS and authentication changes: explicitly out of scope

Known remote state is carried forward from the previously reported failed preparation and was not re-read during this local repair: the two entity schemas and `_shared/auditEvent.ts` exist, the probe `entry.ts` source exists but its prior bundle failed, no sentinel exists, and the probe has never run.

## Minimum remote resources

The certification app already contains `Aud01bCasProbe`, a disposable entity dedicated to this experiment. The complete approved certification footprint comprises these five resources:

| Remote target | Approved local source | Purpose |
|---|---|---|
| `base44/entities/Organization.jsonc` | `base44/entities/Organization.jsonc` at the candidate SHA | CAS anchor and four `audit_claim_*` fields |
| `base44/entities/AuditEvent.jsonc` | `base44/entities/AuditEvent.jsonc` at the candidate SHA | Canonical persisted event |
| `base44/functions/_shared/auditEvent.ts` | `base44/functions/_shared/auditEvent.ts` at the candidate SHA | Canonical writer reference already prepared remotely; not importable by the sandboxed function |
| `base44/functions/aud01b-certification-probe/auditEvent.ts` | `probes/aud01b/base44/functions/aud01b-certification-probe/auditEvent.ts` | Byte-identical sibling used by the sandboxed function |
| `base44/functions/aud01b-certification-probe/entry.ts` | `probes/aud01b/base44/functions/aud01b-certification-probe/entry.ts` | Isolated orchestration and fault injection; imports only `./auditEvent.ts` |

The local manifest `probes/aud01b/base44/entities/Aud01bCasProbe.jsonc` records the schema already observed remotely. It must be compared read-only before execution and must not be rewritten when it is already identical.

No frontend, caller, RLS, authentication, connector, secret, or unrelated schema is needed.

The function uses the Base44 remote-sandbox convention: kebab-case directory plus `entry.ts`. Base44 forbids a sandboxed function from importing outside that directory, so its sibling `auditEvent.ts` is required and must remain byte-identical to the canonical writer. No `function.jsonc`, CLI deploy, or whole-project synchronization is part of this plan.

Approved local SHA-256 fingerprints:

| Local source | SHA-256 |
|---|---|
| `base44/entities/Organization.jsonc` | `bbc6a7751d7b1cce847acd50150aac3fdda54181acd429b997dcb9c4bfbfe51c` |
| `base44/entities/AuditEvent.jsonc` | `3c8934e88c5c10304fb3f0e12ed636c1d6162057f52e93d636ffcecc6208ddc0` |
| `base44/functions/_shared/auditEvent.ts` | `27c2360c2394ba27149d0acff5c7238148423a50a52795c2142f8d7289baccc0` |
| `probes/aud01b/base44/functions/aud01b-certification-probe/auditEvent.ts` | `27c2360c2394ba27149d0acff5c7238148423a50a52795c2142f8d7289baccc0` |
| `probes/aud01b/base44/functions/aud01b-certification-probe/entry.ts` | `6fa2c9bc6c47903b6f4634c76be4ae32d6c3fb28b86d2689612a07796c9906b3` |
| `probes/aud01b/base44/entities/Aud01bCasProbe.jsonc` | `276f840ed82303966f021c15f0dfab9a7aba047ccba3b951329f5685ee7a9c54` |

The two local `auditEvent.ts` files have the same SHA-256 and exact bytes. If Base44 removes only the final newline when storing TypeScript, remote verification must compare both the normalized content and the documented local fingerprint; any other difference is a failure.

## Safety barriers

The runner refuses to create a Base44 client unless all of these conditions are true:

1. `--execute` is supplied explicitly.
2. `AUD01B_CERT_APP_ID` exactly equals `6a831a96fe7af85246647a99`.
3. `AUD01B_CERT_APP_NAME` exactly equals `TRP-AUD01B-CAS-CERT-DO-NOT-PUBLISH`.
4. The operator enters an existing staging-admin email and a hidden password after the target checks pass. The runner authenticates through `base44.auth.loginViaEmailPassword()`, verifies the returned user has role `admin`, and never requests, prints, stores, or accepts a raw access token.

The remote function checks the same App ID and name, requires an authenticated Base44 admin, and verifies exactly one sentinel record before any write:

```json
{
  "marker": "6a831a96fe7af85246647a99",
  "record_kind": "TARGET",
  "claim_state": "TARGET_CONFIRMED",
  "run_id": "BOOTSTRAP"
}
```

Every generated Organization name starts with `AUD01B-CERT-DISPOSABLE-`. Inspection and cleanup refuse any Organization whose exact generated name does not match the requested run and scenario.

## Runtime cases and gates

| Case | Runtime mechanism | Required result |
|---|---|---|
| Compatible writers | Two independent function requests released at the same timestamp | Two successful responses, one create, one duplicate, exactly one event, claim clear |
| Incompatible writers | Same operation ID, different immutable resource identity | One winner, one `AUDIT_OPERATION_ID_COLLISION`, exactly one event, claim clear |
| Ownership lost | Fault facade replaces the persisted token immediately before the pre-create ownership read | `AUDIT_CLAIM_RECOVERY_REQUIRED`, zero events, foreign claim retained |
| Create persisted, response lost | Real `AuditEvent.create()` persists, then the facade throws | Reconciled duplicate, exactly one event, claim clear |
| Create persistence unproven | Facade throws before `AuditEvent.create()` | Original failure, zero visible events, claim retained |
| Non-owner replay | First writer's release is suppressed; compatible replay follows | Replay is duplicate and does not clear the existing claim |
| Ambiguous existing events | Two compatible events are deliberately seeded in the disposable tenant | `AUDIT_OPERATION_ID_AMBIGUOUS`, two events remain, no claim acquired |

The first two cases exercise genuine concurrent HTTP requests and the real Base44 `Organization.updateMany()` behavior. Fault cases execute the exact candidate `appendAuditEvent()` through a narrow service facade that changes only the specified failure point.

## Exact remote bundle-repair plan — requires separate approval

Do not perform these steps until the user separately approves this exact remote repair.

1. Confirm the destination name and App ID exactly, and refuse any target other than `TRP-AUD01B-CAS-CERT-DO-NOT-PUBLISH` / `6a831a96fe7af85246647a99`.
2. Re-read only the target function directory and app status needed to establish the current failed-bundle state. Do not access the main TechRepair Pro app.
3. Overwrite only `base44/functions/aud01b-certification-probe/entry.ts` with the approved local `entry.ts`.
4. Create only `base44/functions/aud01b-certification-probe/auditEvent.ts` from the approved byte-identical sibling.
5. Wait for Base44 to process the function, confirm that its bundle is operational, and re-read the two files to compare normalized content with the approved local sources and fingerprints.
6. Only after the bundle is operational, read the sentinel records. Create the single sentinel shown above only if no identical sentinel exists; never create a duplicate, and refuse conflicting or multiple target sentinels.
7. Confirm that no Organization or AuditEvent probe data was created, then stop and present the remote state. Do not execute the probe.

The previously prepared Organization, AuditEvent, and `_shared/auditEvent.ts` resources are not part of this repair write and must not be rewritten. Because Base44 sandbox resource writes auto-sync, steps 3–4 are deployments even without a separate deploy command and require explicit authorization.

## Execution — separate approval after remote preparation

Use an existing certification-app admin account. The runner prompts for its email and a hidden password only after it validates the exact staging App ID and name. Do not place credentials in a file, command line, or shell history.

PowerShell setup:

```powershell
$env:AUD01B_CERT_APP_ID='6a831a96fe7af85246647a99'
$env:AUD01B_CERT_APP_NAME='TRP-AUD01B-CAS-CERT-DO-NOT-PUBLISH'
npm run probe:audit-staging -- --execute
```

The default certification run retains disposable evidence for review. `--cleanup` instead performs an ephemeral rehearsal and removes each scenario immediately after its assertions; do not use it for the evidence-producing certification run:

```powershell
npm run probe:audit-staging -- --execute --cleanup
```

Use `--scenario compatible` to execute a single named case during a controlled first run.

Cleanup of a retained certification run is a later, separately approved operation using the exact Organization IDs contained in its saved report. The probe function refuses broad deletion and deletes only events belonging to the exact disposable Organization before deleting that Organization.

## Decision rule

- `PASS`: every case satisfies its event cardinality and final-claim invariant.
- `FAIL`: any duplicate event, unexpected success, ownership violation, incorrect claim cleanup, or ambiguous selection occurs.
- Base44 CAS remains `UNPROVEN` until the compatible and incompatible concurrent cases pass repeatedly in the isolated app.

A passing run is runtime evidence for this Base44 app/version; it is not a formal platform-wide linearizability guarantee. A failed run blocks merge and production use of this CAS design.
