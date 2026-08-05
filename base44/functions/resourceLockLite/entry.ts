import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MIN_TTL_MS = 30 * 1000;
const MAX_TTL_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 3 * 1000;
const MAX_TIMEOUT_MS = 10 * 1000;
const SETTLE_MS = 100;
const BASE_BACKOFF_MS = 40;
const MAX_RESOURCES = 10;

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const nowIso = () => new Date().toISOString();
const isUuid = value => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function responseError(code, message, status, options = {}) {
  return Response.json({
    success: false,
    code,
    message,
    retryable: options.retryable ?? false,
    retry_after_ms: options.retryAfterMs ?? null,
    correlation_id: options.correlationId || null,
    resources: options.resources || [],
  }, { status });
}

async function resolveOrganization(base44, user) {
  let orgId = user.impersonating_org_id || user.organization_id;
  if (!orgId && user.id) {
    const accounts = await base44.asServiceRole.entities.UserAccount.filter({ user_id: user.id }, undefined, 1);
    orgId = accounts?.[0]?.organization_id || null;
  }
  return orgId;
}

function normalizeResources(resources) {
  if (!Array.isArray(resources) || resources.length === 0 || resources.length > MAX_RESOURCES) return null;
  const normalized = resources.map(resource => String(resource || '').normalize('NFKC').trim());
  if (normalized.some(resource => !resource || !/^[a-z][a-z0-9_-]*:.+$/i.test(resource))) return null;
  return [...new Set(normalized)].sort((left, right) => left.localeCompare(right));
}

function activeLock(record, now = Date.now()) {
  return ['ACQUIRING', 'ACTIVE'].includes(record?.status)
    && Date.parse(record?.expires_at || '') > now;
}

function compareLocks(left, right) {
  const timeDifference = Date.parse(left.locked_at) - Date.parse(right.locked_at);
  return timeDifference || String(left.id).localeCompare(String(right.id));
}

async function listContenders(base44, { orgId, operation, resource }) {
  const records = await base44.asServiceRole.entities.OperationLock.filter({
    organization_id: orgId,
    operation,
    resource,
    status: { $in: ['ACQUIRING', 'ACTIVE'] },
  }, 'locked_at', 100);

  const now = Date.now();
  const expired = (records || []).filter(record => !activeLock(record, now));
  await Promise.all(expired.map(record =>
    base44.asServiceRole.entities.OperationLock.updateMany({
      id: record.id,
      locked_by: record.locked_by,
      status: record.status,
    }, { $set: { status: 'EXPIRED', released_at: nowIso() } }).catch(() => null)
  ));

  return (records || []).filter(record => activeLock(record, now)).sort(compareLocks);
}

async function releaseRecords(base44, locks, ownerToken) {
  const released = [];
  const errors = [];
  for (const lock of [...(locks || [])].reverse()) {
    try {
      const result = await base44.asServiceRole.entities.OperationLock.updateMany({
        id: lock.id,
        locked_by: ownerToken,
        status: 'ACTIVE',
      }, { $set: { status: 'RELEASED', released_at: nowIso() } });
      if (result?.updated === 1) released.push(lock.resource);
    } catch (error) {
      errors.push({ resource: lock.resource, detail: error.message });
    }
  }
  return { released, errors };
}

async function acquireResource(base44, context) {
  const {
    orgId, operation, resource, correlationId,
    requestFingerprint, ownerToken, leaseId, ttlMs,
  } = context;
  const lockedAt = nowIso();
  let candidate = null;
  try {
    candidate = await base44.asServiceRole.entities.OperationLock.create({
      organization_id: orgId,
      operation,
      resource,
      correlation_id: correlationId,
      request_fingerprint: requestFingerprint,
      locked_by: ownerToken,
      locked_at: lockedAt,
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
      status: 'ACQUIRING',
      lease_id: leaseId,
    });

    await wait(SETTLE_MS);
    const contenders = await listContenders(base44, { orgId, operation, resource });
    const winner = contenders[0];
    if (!winner || winner.id !== candidate.id || winner.locked_by !== ownerToken) {
      await base44.asServiceRole.entities.OperationLock.updateMany({
        id: candidate.id,
        locked_by: ownerToken,
        status: 'ACQUIRING',
      }, { $set: { status: 'RELEASED', released_at: nowIso() } });
      return null;
    }

    const claim = await base44.asServiceRole.entities.OperationLock.updateMany({
      id: candidate.id,
      locked_by: ownerToken,
      status: 'ACQUIRING',
    }, { $set: { status: 'ACTIVE' } });
    if (claim?.updated !== 1) {
      await base44.asServiceRole.entities.OperationLock.updateMany({
        id: candidate.id,
        locked_by: ownerToken,
        status: 'ACQUIRING',
      }, { $set: { status: 'RELEASED', released_at: nowIso() } });
      return null;
    }
    return { id: candidate.id, resource };
  } catch (error) {
    if (candidate) {
      await base44.asServiceRole.entities.OperationLock.updateMany({
        id: candidate.id,
        locked_by: ownerToken,
        status: { $in: ['ACQUIRING', 'ACTIVE'] },
      }, { $set: { status: 'RELEASED', released_at: nowIso() } }).catch(() => null);
    }
    throw error;
  }
}

async function acquireMany(base44, context) {
  const deadline = Date.now() + context.timeoutMs;
  let attempt = 0;

  while (Date.now() <= deadline) {
    const acquired = [];
    let complete = true;
    try {
      for (const resource of context.resources) {
        if (Date.now() > deadline) {
          complete = false;
          break;
        }
        const lock = await acquireResource(base44, { ...context, resource });
        if (!lock) {
          complete = false;
          break;
        }
        acquired.push(lock);
      }
    } catch (error) {
      await releaseRecords(base44, acquired, context.ownerToken);
      throw error;
    }

    if (complete && Date.now() <= deadline) return acquired;
    await releaseRecords(base44, acquired, context.ownerToken);

    attempt += 1;
    const exponential = Math.min(BASE_BACKOFF_MS * (2 ** Math.min(attempt - 1, 5)), 800);
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(exponential / 2)));
    await wait(Math.min(exponential + jitter, remaining));
  }

  return null;
}

async function assertOwned(base44, { orgId, operation, lease }) {
  if (!lease?.owner_token || !Array.isArray(lease?.locks) || lease.locks.length === 0) return false;
  for (const lock of lease.locks) {
    const contenders = await listContenders(base44, { orgId, operation, resource: lock.resource });
    const winner = contenders[0];
    if (!winner
      || winner.id !== lock.id
      || winner.locked_by !== lease.owner_token
      || winner.status !== 'ACTIVE') return false;
  }
  return true;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return responseError('LOCK_UNAUTHORIZED', 'Debe iniciar sesión nuevamente.', 401);
    const orgId = await resolveOrganization(base44, user);
    if (!orgId) return responseError('LOCK_ORGANIZATION_UNRESOLVED', 'No se pudo determinar la organización.', 403);

    const body = await req.json();
    const action = body.action;
    const operation = String(body.operation || '').trim();
    const correlationId = body.correlation_id;

    if (!operation || !isUuid(correlationId)) {
      return responseError('LOCK_SET_INVALID', 'Operación y correlation_id son obligatorios.', 400, { correlationId });
    }

    if (action === 'acquireMany') {
      const resources = normalizeResources(body.resources);
      const requestFingerprint = String(body.request_fingerprint || '').trim();
      if (!resources || !requestFingerprint) {
        return responseError('LOCK_SET_INVALID', 'El conjunto de recursos o fingerprint no es válido.', 400, { correlationId });
      }

      const previous = await base44.asServiceRole.entities.OperationLock.filter({
        organization_id: orgId,
        operation,
        correlation_id: correlationId,
      }, '-created_date', 100);
      if ((previous || []).some(record => record.request_fingerprint !== requestFingerprint)) {
        return responseError('LOCK_FINGERPRINT_CONFLICT', 'La correlación ya fue utilizada con datos diferentes.', 409, {
          correlationId,
          resources,
        });
      }

      const ttlMs = Math.max(MIN_TTL_MS, Math.min(Number(body.ttl_ms) || DEFAULT_TTL_MS, MAX_TTL_MS));
      const timeoutMs = Math.max(0, Math.min(Number(body.timeout_ms) || DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS));
      const ownerToken = crypto.randomUUID();
      const leaseId = crypto.randomUUID();
      const locks = await acquireMany(base44, {
        orgId,
        operation,
        resources,
        correlationId,
        requestFingerprint,
        ownerToken,
        leaseId,
        ttlMs,
        timeoutMs,
      });

      if (!locks) {
        return responseError('LOCK_ACQUIRE_TIMEOUT', 'No fue posible adquirir los recursos dentro del tiempo permitido.', 423, {
          correlationId,
          resources,
          retryable: true,
          retryAfterMs: BASE_BACKOFF_MS,
        });
      }

      return Response.json({
        success: true,
        lease: {
          lease_id: leaseId,
          owner_token: ownerToken,
          organization_id: orgId,
          operation,
          correlation_id: correlationId,
          resources,
          locks,
          expires_at: new Date(Date.now() + ttlMs).toISOString(),
        },
      });
    }

    if (action === 'assertOwned') {
      const owned = await assertOwned(base44, { orgId, operation, lease: body.lease });
      if (!owned) return responseError('LOCK_LOST', 'La operación ya no posee todos los recursos.', 409, {
        correlationId,
        resources: body.lease?.resources || [],
        retryable: true,
      });
      return Response.json({ success: true, owned: true });
    }

    if (action === 'releaseMany') {
      const lease = body.lease;
      const result = await releaseRecords(base44, lease?.locks || [], lease?.owner_token);
      if (result.errors.length > 0) {
        return responseError('LOCK_RELEASE_FAILED', 'Uno o más recursos no pudieron liberarse.', 500, {
          correlationId,
          resources: lease?.resources || [],
          retryable: true,
        });
      }
      return Response.json({ success: true, released: result.released });
    }

    return responseError('LOCK_ACTION_INVALID', 'Acción de locking no reconocida.', 400, { correlationId });
  } catch (error) {
    return responseError('LOCK_INTERNAL_ERROR', 'No se pudo procesar el lock operacional.', 500, {
      retryable: true,
      resources: [],
    });
  }
});
