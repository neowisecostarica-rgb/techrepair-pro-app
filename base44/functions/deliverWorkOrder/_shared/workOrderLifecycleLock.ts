const LIFECYCLE_LOCK_TTL_MS = 15 * 60 * 1000;

export function workflowError(message, code, status = 409) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

export async function loadWorkOrder(base44, organizationId, workOrderId) {
  const records = await base44.asServiceRole.entities.OrdenTrabajo.filter({
    id: workOrderId,
    organization_id: organizationId,
  });
  return records?.[0] || null;
}

export async function acquireLifecycleLock({ base44, ot, orgId, effectiveUser, operation, requestedToken = null }) {
  const current = await loadWorkOrder(base44, orgId, ot.id);
  if (!current) return { acquired: false, code: 'ORDEN_TRABAJO_NOT_FOUND' };
  if (requestedToken) {
    const borrowed = current.lifecycle_lock_token === requestedToken
      && current.lifecycle_lock_operation === 'initTechnicalActivity'
      && current.lifecycle_lock_owner_user_id === effectiveUser.id;
    return borrowed
      ? { acquired: true, token: requestedToken, owned: false, ot: current }
      : { acquired: false, code: 'LIFECYCLE_LOCK_INVALID' };
  }

  const token = crypto.randomUUID();
  const now = new Date().toISOString();
  const lockData = {
    lifecycle_lock_token: token,
    lifecycle_lock_operation: operation,
    lifecycle_lock_owner_user_id: effectiveUser.id,
    lifecycle_lock_at: now,
  };
  let claim;
  try {
    claim = await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
      id: ot.id,
      organization_id: orgId,
      $or: [{ lifecycle_lock_token: { $exists: false } }, { lifecycle_lock_token: null }],
    }, { $set: lockData });
  } catch (claimError) {
    const reconciled = await loadWorkOrder(base44, orgId, ot.id);
    if (reconciled?.lifecycle_lock_token === token) {
      return { acquired: true, token, owned: true, recovered_ambiguous_lock: true, ot: reconciled };
    }
    throw claimError;
  }
  if (claim?.updated === 1) return { acquired: true, token, owned: true, ot: { ...current, ...lockData } };

  const locked = await loadWorkOrder(base44, orgId, ot.id);
  const lockTimestamp = Date.parse(locked?.lifecycle_lock_at || '');
  const stale = locked?.lifecycle_lock_token
    && Number.isFinite(lockTimestamp)
    && Date.now() - lockTimestamp > LIFECYCLE_LOCK_TTL_MS;
  if (stale) {
    let takeover;
    try {
      takeover = await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
        id: ot.id,
        organization_id: orgId,
        lifecycle_lock_token: locked.lifecycle_lock_token,
        lifecycle_lock_at: locked.lifecycle_lock_at,
      }, { $set: lockData });
    } catch (takeoverError) {
      const reconciled = await loadWorkOrder(base44, orgId, ot.id);
      if (reconciled?.lifecycle_lock_token === token) {
        return {
          acquired: true, token, owned: true, recovered_stale_lock: true,
          recovered_ambiguous_lock: true, ot: reconciled,
        };
      }
      throw takeoverError;
    }
    if (takeover?.updated === 1) {
      return { acquired: true, token, owned: true, recovered_stale_lock: true, ot: { ...locked, ...lockData } };
    }
  }
  return {
    acquired: false,
    code: 'LIFECYCLE_OPERATION_IN_PROGRESS',
    operation: locked?.lifecycle_lock_operation || null,
  };
}

export async function renewLifecycleLock(base44, orgId, workOrderId, lock) {
  const heartbeat = new Date().toISOString();
  try {
    const renewed = await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
      id: workOrderId,
      organization_id: orgId,
      lifecycle_lock_token: lock.token,
    }, { $set: { lifecycle_lock_at: heartbeat } });
    if (renewed?.updated === 1) return heartbeat;
  } catch (renewError) {
    const reconciled = await loadWorkOrder(base44, orgId, workOrderId);
    if (reconciled?.lifecycle_lock_token === lock.token) return reconciled.lifecycle_lock_at;
    throw renewError;
  }
  const current = await loadWorkOrder(base44, orgId, workOrderId);
  if (current?.lifecycle_lock_token === lock.token) return current.lifecycle_lock_at;
  throw workflowError('El lock del lifecycle fue recuperado por otra operacion.', 'LIFECYCLE_LOCK_LOST');
}

export async function releaseLifecycleLock(base44, orgId, workOrderId, lock) {
  if (!lock?.owned) return;
  const released = await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
    id: workOrderId,
    organization_id: orgId,
    lifecycle_lock_token: lock.token,
  }, {
    $unset: {
      lifecycle_lock_token: '',
      lifecycle_lock_operation: '',
      lifecycle_lock_owner_user_id: '',
      lifecycle_lock_at: '',
    },
  });
  if (released?.updated !== 1) console.warn(`[workOrderLifecycleLock] Lock no pertenece al intento: ${workOrderId}`);
}
