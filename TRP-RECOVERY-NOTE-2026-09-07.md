# TRP Legacy — Recovery Note — 2026-09-07

## Canonical app
- TechRepair Pro / TRP Legacy
- Base44 App ID: `695d708948469128f473d080`
- Do not apply this recovery procedure to TRP 2.0 or validation apps.

## Incident recovered in this session
TRP was blocked at startup with an authentication-looking error. A diagnostic fail-closed probe proved that the Base44 browser session was valid while `identityGateway` was unavailable.

The concrete Base44 function packaging error was:

`Relative imports can't reach outside the function`

`identityGateway/entry.ts` imported security modules using `../_shared/...`. Base44's function bundler rejected imports that escaped the function directory.

## Recovery that WORKED
`identityGateway` was made self-contained:
1. Its required shared modules and transitive dependencies were copied under `base44/functions/identityGateway/_shared/`.
2. Imports in `identityGateway/entry.ts` were changed from `../_shared/...` to `./_shared/...`.
3. Security/RBAC was NOT removed or bypassed.
4. The targeted function deploy command timed out, but after a hard refresh (`Ctrl+F5`) the application recovered and Platform Administration loaded successfully for the Super Admin.

This is the known recovery reference if the same `identityGateway unavailable` incident returns. First inspect for imports that leave the function boundary; do NOT roll back to old direct client-side auth and do NOT weaken fail-closed authorization.

## Wider backend remediation performed
The same packaging pattern was found in the other manifest-backed functions. At the time of remediation there were 20 functions with `function.jsonc`: `identityGateway` plus 19 others. The other 19 were also made self-contained by copying their required `_shared` dependencies into each function and changing their entry imports to local `./_shared/...` paths.

Validation after this macrobloque:
- Remaining `../_shared/` imports among the 20 manifest-backed function entry files: 0.
- Frontend/app build: PASS.
- Lint: PASS.
- No Publish performed.
- A targeted `operationalGateway` deploy command timed out, so runtime deployment of every remediated function was NOT independently confirmed.

## Current WARNING / next P0
Do NOT treat this checkpoint as final GO.

After the wider remediation, the user reported that other users that previously worked were no longer working. This must be investigated FIRST on resume before further deployment or Publish.

Known identity conflict discovered read-only:
- `gustavo@compustorecr.com` has `UserAccount.role = ORG_ADMIN` for organization `COMPU STORE COSTA RICA`.
- Its native Base44 User is also marked `role=admin`, `_app_role=admin`, `is_super_admin=true`.
- Current canonical authorization interprets native Base44 `admin` as sovereign SUPER_ADMIN, causing that business-owner account to see Platform Administration instead of the OWNER / Emprendedor Full panel.
- No user-role data was changed during this investigation.

## Resume order
1. P0: reproduce and recover normal-user access (ORG_ADMIN/OWNER, technician, other roles) without weakening RBAC.
2. Separate platform SUPER_ADMIN from business OWNER correctly. Keep the platform Super Admin account separate from `gustavo@compustorecr.com` OWNER membership.
3. Verify runtime status of the 20 manifest-backed functions; do not assume a CLI timeout means success or failure.
4. QA critical operational flow: reception -> work order -> technician -> diagnosis -> approval -> repair -> POS/delivery; then clients, inventory and finance.
5. GO/NO-GO only after role matrix and critical flow pass.
6. Publish only with explicit user approval.

## Safety rules
- Never use `base44 functions deploy --force` for this recovery.
- Do not mass-deploy blindly.
- Do not restore the primitive historical direct-auth architecture merely to bypass `identityGateway`.
- Do not modify RLS/data to hide an authorization failure.
- Do not Publish until explicit approval.

## Checkpoint
Checkpoint created immediately after the recovered Super Admin state and before correcting the user-role problem:
`TRP Legacy — RECOVERY identityGateway WORKING — PRE user-role fix — 2026-09-07`

This checkpoint is a recovery landmark, not a production-GO certification.
