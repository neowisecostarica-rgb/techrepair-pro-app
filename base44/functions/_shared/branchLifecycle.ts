import { normalizeBranchName } from './branchProtection.ts';

const ACTIONS = new Set(['CREATE', 'UPDATE_DETAILS', 'DEACTIVATE', 'REACTIVATE']);
const TERMINAL_WORK_ORDER_STATES = ['ENTREGADA', 'CANCELADA'];
const ACTIVE_RESERVATION_STATES = ['PENDING', 'RESERVED'];
const BRANCH_SCAN_LIMIT = 1001;
const ACTIVITY_SCAN_LIMIT = 1001;
const SALE_LOCK_TTL_MS = 15 * 60 * 1000;

export class BranchLifecycleError extends Error {
  code: string;
  status: number;
  details: Record<string, unknown>;

  constructor(message: string, code = 'BRANCH_LIFECYCLE_FAILED', status = 409, details = {}) {
    super(message);
    this.name = 'BranchLifecycleError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function clean(value: unknown, maxLength: number) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function stable(value: any): any {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

async function sha256(value: unknown) {
  const encoded = new TextEncoder().encode(JSON.stringify(stable(value)));
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function normalizeBranchLifecycleRequest(input: any = {}) {
  const requestedAction = clean(input.action, 40).toUpperCase();
  if (requestedAction === 'DELETE') {
    throw new BranchLifecycleError(
      'Las sucursales no pueden eliminarse fisicamente en el MVP.',
      'BRANCH_HARD_DELETE_FORBIDDEN',
      409,
    );
  }
  if (!ACTIONS.has(requestedAction)) {
    throw new BranchLifecycleError('Accion de lifecycle invalida.', 'BRANCH_ACTION_INVALID', 400);
  }
  const authorityFields = [
    'organization_id', 'deactivated_at', 'deactivated_by', 'reactivated_at', 'reactivated_by',
    'normalized_name', 'lifecycle_operation_key', 'lifecycle_request_fingerprint',
    'lifecycle_action', 'lifecycle_committed_at', 'sale_lock_token', 'sale_lock_operation_key', 'sale_lock_at',
  ];
  if (authorityFields.some(field => Object.hasOwn(input, field))) {
    throw new BranchLifecycleError('El payload intenta controlar metadata soberana.', 'BRANCH_AUTHORITY_FIELD_FORBIDDEN', 403);
  }
  if (requestedAction === 'UPDATE_DETAILS' && Object.hasOwn(input, 'active')) {
    throw new BranchLifecycleError('UPDATE_DETAILS no puede cambiar active.', 'BRANCH_ACTIVE_CHANGE_FORBIDDEN', 403);
  }
  const operationKey = clean(input.operation_key, 180);
  if (operationKey.length < 12) {
    throw new BranchLifecycleError('operation_key es obligatorio y debe ser estable.', 'BRANCH_OPERATION_KEY_INVALID', 400);
  }
  const branchId = clean(input.branch_id, 180) || null;
  const name = input.name === undefined ? undefined : clean(input.name, 160);
  const address = input.address === undefined ? undefined : (clean(input.address, 500) || null);
  const phone = input.phone === undefined ? undefined : (clean(input.phone, 80) || null);
  const reason = input.reason === undefined ? undefined : clean(input.reason, 500);

  if (requestedAction === 'CREATE') {
    if (!name) throw new BranchLifecycleError('El nombre de la sucursal es obligatorio.', 'BRANCH_NAME_REQUIRED', 400);
    if (input.active === false) {
      throw new BranchLifecycleError('Una sucursal nueva debe iniciar activa.', 'BRANCH_CREATE_INACTIVE_FORBIDDEN', 409);
    }
  } else if (!branchId) {
    throw new BranchLifecycleError('branch_id es obligatorio.', 'BRANCH_ID_REQUIRED', 400);
  }
  if (requestedAction === 'UPDATE_DETAILS' && name === undefined && address === undefined && phone === undefined) {
    throw new BranchLifecycleError('No hay detalles permitidos para actualizar.', 'BRANCH_DETAILS_REQUIRED', 400);
  }
  if (requestedAction === 'UPDATE_DETAILS' && name !== undefined && !name) {
    throw new BranchLifecycleError('El nombre no puede quedar vacio.', 'BRANCH_NAME_REQUIRED', 400);
  }
  if (requestedAction === 'DEACTIVATE' && !reason) {
    throw new BranchLifecycleError('El motivo de desactivacion es obligatorio.', 'BRANCH_DEACTIVATION_REASON_REQUIRED', 400);
  }
  return {
    action: requestedAction,
    operation_key: operationKey,
    branch_id: branchId,
    ...(name !== undefined ? { name } : {}),
    ...(address !== undefined ? { address } : {}),
    ...(phone !== undefined ? { phone } : {}),
    ...(reason !== undefined ? { reason } : {}),
  };
}

export async function fingerprintBranchLifecycleRequest(input: any) {
  return sha256(normalizeBranchLifecycleRequest(input));
}

function snapshotBranch(branch: any) {
  if (!branch) return null;
  return {
    id: branch.id,
    organization_id: branch.organization_id,
    name: branch.name,
    address: branch.address || null,
    phone: branch.phone || null,
    active: branch.active === true,
    deactivated_at: branch.deactivated_at || null,
    deactivated_by: branch.deactivated_by || null,
    deactivation_reason: branch.deactivation_reason || null,
    reactivated_at: branch.reactivated_at || null,
    reactivated_by: branch.reactivated_by || null,
  };
}

async function findOne(entity: any, query: any) {
  const records = await entity.filter(query, '-created_date', 1);
  return records?.[0] || null;
}

async function loadBranch(base44: any, organizationId: string, branchId: string) {
  return findOne(base44.asServiceRole.entities.Branch, { id: branchId, organization_id: organizationId });
}

async function findOperation(base44: any, organizationId: string, operationKey: string) {
  return findOne(base44.asServiceRole.entities.BranchLifecycleOperation, {
    organization_id: organizationId,
    operation_key: operationKey,
  });
}

async function createOrRecoverOperation(base44: any, data: any) {
  try {
    return await base44.asServiceRole.entities.BranchLifecycleOperation.create(data);
  } catch (error) {
    const recovered = await findOperation(base44, data.organization_id, data.operation_key);
    if (recovered) return recovered;
    throw error;
  }
}

async function commitOperation(base44: any, operation: any, result: any, committedAt: string) {
  try {
    await base44.asServiceRole.entities.BranchLifecycleOperation.update(operation.id, {
      branch_id: result.branch?.id || operation.branch_id || null,
      status: 'COMMITTED',
      committed_at: committedAt,
      result_snapshot: result,
    });
  } catch (error) {
    const recovered = await findOperation(base44, operation.organization_id, operation.operation_key);
    if (recovered?.status !== 'COMMITTED') throw error;
  }
  return result;
}

function isFreshLock(timestamp: unknown) {
  const parsed = Date.parse(String(timestamp || ''));
  return !Number.isFinite(parsed) || Date.now() - parsed <= SALE_LOCK_TTL_MS;
}

async function findDeactivationBlockers(base44: any, organizationId: string, branch: any) {
  const entities = base44.asServiceRole.entities;
  const [users, workOrders, reservations, sales, pendingDeliveries, pendingLifecycle, quotes] = await Promise.all([
    entities.UserAccount.filter({ organization_id: organizationId, branch_id: branch.id, status: { $in: ['active', 'invited'] } }, '-created_date', 2),
    entities.OrdenTrabajo.filter({ organization_id: organizationId, branch_id: branch.id, estado: { $nin: TERMINAL_WORK_ORDER_STATES } }, '-created_date', 2),
    entities.InventarioReserva.filter({ organization_id: organizationId, branch_id: branch.id, state: { $in: ACTIVE_RESERVATION_STATES } }, '-created_date', 2),
    entities.Venta.filter({ organization_id: organizationId, branch_id: branch.id, $or: [
      { estado: { $in: ['procesando', 'inconsistente'] } },
      { inventory_commit_status: 'PENDING' },
      { post_sale_status: 'PENDING' },
    ] }, '-created_date', 2),
    entities.OrdenTrabajo.filter({ organization_id: organizationId, branch_id: branch.id, delivery_status: 'PENDING' }, '-created_date', 2),
    entities.OrdenTrabajo.filter({ organization_id: organizationId, branch_id: branch.id, lifecycle_lock_token: { $exists: true } }, '-created_date', 2),
    entities.Cotizacion.filter({ organization_id: organizationId, branch_id: branch.id, decision_status: 'PENDING' }, '-created_date', 2),
  ]);
  const blockers: any[] = [];
  const add = (category: string, records: any[]) => {
    if (records?.length) blockers.push({ category, ids: records.map(record => record.id).filter(Boolean).slice(0, 10) });
  };
  add('assigned_users', users);
  add('non_terminal_work_orders', workOrders);
  add('active_inventory_reservations', reservations);
  add('pending_sale_operations', sales);
  add('pending_delivery_operations', pendingDeliveries);
  add('pending_work_order_lifecycle', pendingLifecycle);
  add('pending_quote_lifecycle', quotes);
  if (branch.sale_lock_token && isFreshLock(branch.sale_lock_at)) {
    blockers.push({ category: 'pending_sale_lock', ids: [branch.id] });
  }

  const activeActivities = await entities.ActividadTecnica.filter({
    organization_id: organizationId,
    estado: 'en_progreso',
  }, '-created_date', ACTIVITY_SCAN_LIMIT);
  if ((activeActivities || []).length >= ACTIVITY_SCAN_LIMIT) {
    blockers.push({ category: 'activity_scan_truncated', ids: [] });
  } else {
    const matching: any[] = [];
    for (const activity of activeActivities || []) {
      const parent = await loadBranchWorkOrder(entities, organizationId, activity.orden_trabajo_id);
      if (!parent) {
        blockers.push({ category: 'active_activity_parent_unresolved', ids: [activity.id] });
      } else if (parent.branch_id === branch.id) matching.push(activity);
    }
    add('active_technical_activities', matching);
  }
  return blockers;
}

async function loadBranchWorkOrder(entities: any, organizationId: string, workOrderId: string) {
  return findOne(entities.OrdenTrabajo, { id: workOrderId, organization_id: organizationId });
}

async function ensureUniqueName(base44: any, organizationId: string, normalizedName: string, excludeId: string | null = null) {
  const branches = await base44.asServiceRole.entities.Branch.filter({ organization_id: organizationId }, '-created_date', BRANCH_SCAN_LIMIT);
  if ((branches || []).length >= BRANCH_SCAN_LIMIT) {
    throw new BranchLifecycleError('No fue posible completar el scan de nombres.', 'BRANCH_NAME_SCAN_TRUNCATED', 409);
  }
  const duplicate = (branches || []).find((candidate: any) => candidate.id !== excludeId
    && normalizeBranchName(candidate.normalized_name || candidate.name) === normalizedName);
  if (duplicate) {
    throw new BranchLifecycleError('Ya existe una sucursal con el mismo nombre normalizado.', 'BRANCH_NAME_CONFLICT', 409, {
      conflicting_branch_id: duplicate.id,
    });
  }
}

async function acquireOrganizationLock(base44: any, organizationId: string, fingerprint: string) {
  const correlationId = crypto.randomUUID();
  const response = await base44.functions.invoke('resourceLockLite', {
    action: 'acquireMany',
    organization_id: organizationId,
    operation: 'BRANCH_LIFECYCLE',
    correlation_id: correlationId,
    request_fingerprint: fingerprint,
    resources: [`organization:${organizationId}:branch-lifecycle`],
  });
  const result = response?.data ?? response;
  if (!result?.success || !result?.lease) {
    throw new BranchLifecycleError(
      result?.error || 'No fue posible adquirir el lock organizacional.',
      result?.code || 'BRANCH_LIFECYCLE_LOCK_FAILED',
      result?.status || 423,
      { retryable: true },
    );
  }
  return result.lease;
}

async function releaseOrganizationLock(base44: any, lease: any) {
  const response = await base44.functions.invoke('resourceLockLite', {
    action: 'releaseMany',
    organization_id: lease.organization_id,
    operation: 'BRANCH_LIFECYCLE',
    correlation_id: lease.correlation_id,
    lease,
  });
  return response?.data ?? response;
}

export async function executeBranchLifecycle(base44: any, context: any, rawInput: any, options: any = {}) {
  if (context?.role !== 'ORG_ADMIN' || !context?.organizationId || !context?.actor?.id) {
    throw new BranchLifecycleError('Solo ORG_ADMIN puede gestionar sucursales.', 'BRANCH_LIFECYCLE_FORBIDDEN', 403);
  }
  const input = normalizeBranchLifecycleRequest(rawInput);
  const fingerprint = await sha256(input);
  const now = options.now || (() => new Date().toISOString());
  const acquire = options.acquireLock || (() => acquireOrganizationLock(base44, context.organizationId, fingerprint));
  const release = options.releaseLock || ((lease: any) => releaseOrganizationLock(base44, lease));
  let lease: any = null;

  try {
    lease = await acquire();
    const organization = await findOne(base44.asServiceRole.entities.Organization, {
      id: context.organizationId,
      status: 'active',
    });
    if (!organization) {
      throw new BranchLifecycleError('La organizacion no existe o no esta activa.', 'BRANCH_ORGANIZATION_INACTIVE', 409);
    }

    let operation = await findOperation(base44, context.organizationId, input.operation_key);
    if (operation) {
      if (operation.request_fingerprint !== fingerprint) {
        throw new BranchLifecycleError('operation_key ya fue usada con otro payload.', 'BRANCH_FINGERPRINT_CONFLICT', 409);
      }
      if (operation.status === 'COMMITTED') {
        return { ...operation.result_snapshot, idempotent: true, recovered: true };
      }
      const recoveredBranch = await findOne(base44.asServiceRole.entities.Branch, {
        organization_id: context.organizationId,
        lifecycle_operation_key: input.operation_key,
        lifecycle_request_fingerprint: fingerprint,
      });
      if (recoveredBranch) {
        const recovered = {
          success: true,
          action: input.action,
          branch: snapshotBranch(recoveredBranch),
          idempotent: true,
          recovered: true,
        };
        return commitOperation(base44, operation, recovered, recoveredBranch.lifecycle_committed_at || now());
      }
    } else {
      const pending = await base44.asServiceRole.entities.BranchLifecycleOperation.filter({
        organization_id: context.organizationId,
        status: 'PENDING',
      }, '-created_date', 2);
      if (pending?.length) {
        throw new BranchLifecycleError(
          'Existe una operacion Branch pendiente que requiere recovery.',
          'BRANCH_LIFECYCLE_RECOVERY_REQUIRED',
          409,
          { pending_operation_keys: pending.map((item: any) => item.operation_key) },
        );
      }
    }

    let branch: any = null;
    let blockers: any[] = [];
    let mutation: any = null;
    const committedAt = now();

    if (input.action === 'CREATE') {
      const normalizedName = normalizeBranchName(input.name);
      await ensureUniqueName(base44, context.organizationId, normalizedName);
      mutation = {
        organization_id: context.organizationId,
        name: input.name,
        normalized_name: normalizedName,
        address: input.address || null,
        phone: input.phone || null,
        active: true,
      };
    } else {
      branch = await loadBranch(base44, context.organizationId, input.branch_id);
      if (!branch) throw new BranchLifecycleError('Sucursal no encontrada.', 'BRANCH_NOT_FOUND', 404);

      if (input.action === 'UPDATE_DETAILS') {
        const nextName = input.name === undefined ? branch.name : input.name;
        const normalizedName = normalizeBranchName(nextName);
        await ensureUniqueName(base44, context.organizationId, normalizedName, branch.id);
        mutation = {
          ...(input.name !== undefined ? { name: input.name, normalized_name: normalizedName } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
        };
      }

      if (input.action === 'DEACTIVATE') {
        if (branch.active !== true) {
          mutation = null;
        } else {
          const activeBranches = await base44.asServiceRole.entities.Branch.filter({
            organization_id: context.organizationId,
            active: true,
          }, '-created_date', 2);
          if ((activeBranches || []).length <= 1) {
            throw new BranchLifecycleError(
              'La organizacion debe conservar al menos una sucursal activa.',
              'LAST_ACTIVE_BRANCH',
              409,
            );
          }
          blockers = await findDeactivationBlockers(base44, context.organizationId, branch);
          if (blockers.length) {
            throw new BranchLifecycleError(
              'La sucursal tiene asignaciones u operaciones activas.',
              'BRANCH_DEACTIVATION_BLOCKED',
              409,
              { blockers },
            );
          }
          mutation = {
            active: false,
            deactivated_at: committedAt,
            deactivated_by: context.actor.id,
            deactivation_reason: input.reason,
          };
        }
      }

      if (input.action === 'REACTIVATE') {
        mutation = branch.active === true ? null : {
          active: true,
          reactivated_at: committedAt,
          reactivated_by: context.actor.id,
        };
      }
    }

    if (!operation) {
      operation = await createOrRecoverOperation(base44, {
        organization_id: context.organizationId,
        branch_id: branch?.id || null,
        operation_key: input.operation_key,
        request_fingerprint: fingerprint,
        action: input.action,
        status: 'PENDING',
        actor_user_id: context.actor.id,
        actor_role: context.role,
        started_at: committedAt,
      });
      if (operation.request_fingerprint !== fingerprint) {
        throw new BranchLifecycleError('operation_key ya fue usada con otro payload.', 'BRANCH_FINGERPRINT_CONFLICT', 409);
      }
    }

    const lifecycleMarkers = {
      lifecycle_operation_key: input.operation_key,
      lifecycle_request_fingerprint: fingerprint,
      lifecycle_action: input.action,
      lifecycle_committed_at: committedAt,
    };

    if (input.action === 'CREATE') {
      try {
        branch = await base44.asServiceRole.entities.Branch.create({ ...mutation, ...lifecycleMarkers });
      } catch (error) {
        branch = await findOne(base44.asServiceRole.entities.Branch, {
          organization_id: context.organizationId,
          lifecycle_operation_key: input.operation_key,
          lifecycle_request_fingerprint: fingerprint,
        });
        if (!branch) throw error;
      }
    } else if (mutation) {
      const compareAndSetQuery = {
        id: branch.id,
        organization_id: context.organizationId,
        ...(input.action === 'DEACTIVATE' ? { active: true } : {}),
        ...(input.action === 'REACTIVATE' ? { active: false } : {}),
      };
      try {
        const updated = await base44.asServiceRole.entities.Branch.updateMany(
          compareAndSetQuery,
          { $set: { ...mutation, ...lifecycleMarkers } },
        );
        if (updated?.updated !== 1) {
          throw new BranchLifecycleError('La sucursal cambio durante la operacion.', 'BRANCH_LIFECYCLE_CAS_CONFLICT', 409);
        }
      } catch (error) {
        const reconciled = await loadBranch(base44, context.organizationId, branch.id);
        if (reconciled?.lifecycle_operation_key !== input.operation_key
          || reconciled?.lifecycle_request_fingerprint !== fingerprint) throw error;
      }
      branch = await loadBranch(base44, context.organizationId, branch.id);
    }

    const result = {
      success: true,
      action: input.action,
      branch: snapshotBranch(branch),
      idempotent: mutation === null,
      recovered: false,
      blockers,
    };
    return commitOperation(base44, operation, result, committedAt);
  } finally {
    if (lease) {
      try { await release(lease); }
      catch (error) { console.error('[manageBranchLifecycle] lock release failed', error); }
    }
  }
}
