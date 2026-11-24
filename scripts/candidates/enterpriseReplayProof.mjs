// Isolated candidate. No production import. Caller must supply backend-verified
// authorization, persisted record and committed audit receipt from trusted storage.
import { createHash } from 'node:crypto';
const actions = new Set(['ASSET_ASSIGN','ASSET_RETURN','ONBOARD_OPEN','OFFBOARD_OPEN','ONBOARD_CONFIRM','OFFBOARD_CONFIRM','ONBOARD_CLOSE','OFFBOARD_CLOSE']);
const id = v => typeof v === 'string' && v.trim() && v.length <= 240 ? v : null;
function canonical(v) {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype)
    return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));
  throw new Error('REPLAY_INVALID_PAYLOAD');
}
export function fingerprintOperation(input) {
  const {organizationId, branchId, actorId, action, operationKey, resourceId, payload} = input;
  if (![organizationId, actorId, operationKey, resourceId].every(id) ||
      (branchId !== null && !id(branchId)) || !actions.has(action) || !payload ||
      typeof payload !== 'object' || Array.isArray(payload)) throw new Error('REPLAY_INVALID_IDENTITY');
  const identity={version:1,organizationId,branchId,actorId,action,operationKey,resourceId,payload};
  return createHash('sha256').update(JSON.stringify(canonical(identity))).digest('hex');
}
const deny=(status,code)=>({ok:false,status,code});
export function verifyCommittedReplay({auth, actorId, request, record, receipt}) {
  if (!auth?.ok || !id(auth.organizationId) || !id(actorId) ||
      !['ORG_ADMIN','BRANCH_ADMIN'].includes(auth.role)) return deny(403,'REPLAY_NOT_AUTHORIZED');
  if (!record || record.organization_id!==auth.organizationId || request.organizationId!==auth.organizationId)
    return deny(403,'REPLAY_NOT_AUTHORIZED');
  if (auth.role==='BRANCH_ADMIN' && (!id(auth.branchId) || record.branch_id!==auth.branchId || request.branchId!==auth.branchId))
    return deny(403,'REPLAY_NOT_AUTHORIZED');
  if (!receipt || receipt.status!=='COMMITTED') return deny(409,'REPLAY_RECONCILIATION_REQUIRED');
  if (receipt.organizationId!==auth.organizationId || receipt.branchId!==record.branch_id ||
      receipt.actorId!==actorId || request.actorId!==actorId || request.branchId!==record.branch_id)
    return deny(403,'REPLAY_NOT_AUTHORIZED');
  if (receipt.resourceId!==record.id || receipt.resourceId!==request.resourceId ||
      receipt.operationKey!==request.operationKey || receipt.action!==request.action)
    return deny(409,'REPLAY_CONFLICT');
  let expected;
  try { expected=fingerprintOperation(request); } catch { return deny(409,'REPLAY_INVALID_IDENTITY'); }
  if (typeof receipt.fingerprint!=='string' || receipt.fingerprint!==expected)
    return deny(409,'REPLAY_CONFLICT');
  return {ok:true,status:200}; // Never returns record; caller applies authorized projection.
}
