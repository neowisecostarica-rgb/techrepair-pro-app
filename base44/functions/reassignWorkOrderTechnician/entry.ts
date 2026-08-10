import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { isCanonicalActiveUserAccount, resolveAuthorizedContext } from '../_shared/userAuthorization.ts';

// Assignment is an intake operation owned by administration and sales.
// Keep this contract aligned with workflowConfig and both assignment UIs.
const AUTHORIZED_ROLES = ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES'];
const ASSIGNMENT_LOCK_TTL_MS = 15 * 60 * 1000;

function errorResponse(status, code, error, extra = {}) {
  return Response.json({ error, code, ...extra }, { status });
}

function getLockQuery(ot) {
  if (!ot.lifecycle_lock_token) {
    return {
      $or: [
        { lifecycle_lock_token: { $exists: false } },
        { lifecycle_lock_token: null },
      ],
    };
  }

  const lockAt = Date.parse(ot.lifecycle_lock_at || '');
  const isStale = Number.isFinite(lockAt)
    && Date.now() - lockAt > ASSIGNMENT_LOCK_TTL_MS;

  if (!isStale) return null;

  return {
    lifecycle_lock_token: ot.lifecycle_lock_token,
    lifecycle_lock_at: ot.lifecycle_lock_at,
  };
}

async function loadWorkOrder(base44, orgId, workOrderId) {
  const records = await base44.asServiceRole.entities.OrdenTrabajo.filter({
    id: workOrderId,
    organization_id: orgId,
  }, 1);
  return records?.[0] || null;
}

async function resolveCaller(base44, user) {
  const authorization = await resolveAuthorizedContext(base44, user, { allowedRoles: AUTHORIZED_ROLES });
  if (!authorization.ok) return {
    error: authorization.error,
    code: authorization.error?.includes('rol')
      ? 'ASSIGNMENT_ROLE_NOT_AUTHORIZED'
      : 'CALLER_ACCOUNT_NOT_ACTIVE',
  };
  return {
    orgId: authorization.organizationId,
    effectiveRole: authorization.role,
    isSuperAdmin: authorization.isSuperAdmin,
  };
}

async function loadDestinationTechnician(base44, orgId, technicianUserId) {
  const accounts = await base44.asServiceRole.entities.UserAccount.filter({
    user_id: technicianUserId,
    organization_id: orgId,
    role: 'TECHNICIAN',
  }, 5);
  return (accounts || []).find(isCanonicalActiveUserAccount) || null;
}

function buildRollbackUpdate(originalOT) {
  const set = {
    estado: originalOT.estado,
  };
  const unset = {
    lifecycle_lock_token: '',
    lifecycle_lock_operation: '',
    lifecycle_lock_owner_user_id: '',
    lifecycle_lock_at: '',
  };

  for (const field of [
    'tecnico_asignado_id',
    'tecnico_asignado_email',
    'ultima_actividad',
    'ultima_actividad_at',
  ]) {
    if (Object.prototype.hasOwnProperty.call(originalOT, field)) {
      set[field] = originalOT[field];
    } else {
      unset[field] = '';
    }
  }

  return { $set: set, $unset: unset };
}

async function releaseAssignmentLock(base44, orgId, workOrderId, operationToken) {
  const release = () => base44.asServiceRole.entities.OrdenTrabajo.updateMany({
    id: workOrderId,
    organization_id: orgId,
    lifecycle_lock_token: operationToken,
  }, {
    $unset: {
      lifecycle_lock_token: '',
      lifecycle_lock_operation: '',
      lifecycle_lock_owner_user_id: '',
      lifecycle_lock_at: '',
    },
  });

  try {
    return await release();
  } catch (firstError) {
    const reconciled = await loadWorkOrder(base44, orgId, workOrderId);
    if (reconciled?.lifecycle_lock_token !== operationToken) {
      return { updated: 1, recovered: true };
    }

    try {
      return await release();
    } catch (retryError) {
      return { updated: 0, error: retryError.message || firstError.message };
    }
  }
}

async function findAssignmentEvent(base44, orgId, workOrderId) {
  const events = await base44.asServiceRole.entities.OTEvent.filter({
    organization_id: orgId,
    orden_trabajo_id: workOrderId,
    tipo: 'TRANSITION_ASIGNADA',
  }, '-created_date', 5);
  return events?.[0] || null;
}

async function findReassignmentEvent(base44, orgId, workOrderId, operationToken) {
  const events = await base44.asServiceRole.entities.OTEvent.filter({
    organization_id: orgId,
    orden_trabajo_id: workOrderId,
    tipo: 'TRANSITION_REASIGNADA',
  }, '-created_date', 10);

  return (events || []).find(event => {
    try {
      return JSON.parse(event.detalle || '{}').operation_id === operationToken;
    } catch {
      return false;
    }
  }) || null;
}

async function createRequiredAuditEvent({
  base44,
  orgId,
  ot,
  user,
  operationToken,
  operation,
  previousTechnicianId,
  destinationTechnician,
  reason,
}) {
  if (operation !== 'REASSIGNMENT') {
    const existing = await findAssignmentEvent(base44, orgId, ot.id);
    if (existing) return { event: existing, created: false };
  }

  const eventType = operation === 'REASSIGNMENT'
    ? 'TRANSITION_REASIGNADA'
    : 'TRANSITION_ASIGNADA';
  const now = new Date().toISOString();
  const detail = JSON.stringify({
    operation_id: operationToken,
    operation,
    tecnico_anterior_id: previousTechnicianId || null,
    tecnico_nuevo_id: destinationTechnician.user_id,
    usuario_ejecutor: user.email,
    motivo: reason || null,
    timestamp: now,
  });

  try {
    const event = await base44.asServiceRole.entities.OTEvent.create({
      organization_id: orgId,
      orden_trabajo_id: ot.id,
      tipo: eventType,
      detalle: detail,
      created_by_user_id: user.id,
      processed: false,
      created_at: now,
    });
    return { event, created: true };
  } catch (error) {
    const recovered = operation === 'REASSIGNMENT'
      ? await findReassignmentEvent(base44, orgId, ot.id, operationToken)
      : await findAssignmentEvent(base44, orgId, ot.id);
    if (recovered) return { event: recovered, created: false, recovered: true };
    throw error;
  }
}

async function executeAssignmentOperation({
  base44,
  user,
  orgId,
  ot,
  destinationTechnician,
  reason,
  operation,
}) {
  const operationToken = crypto.randomUUID();
  const now = new Date().toISOString();
  const previousTechnicianId = ot.tecnico_asignado_id || null;
  const lockQuery = getLockQuery(ot);

  if (!lockQuery) {
    return errorResponse(409, 'ASSIGNMENT_OPERATION_IN_PROGRESS',
      'Otra operacion del lifecycle esta en progreso para esta OT', {
      retryable: true,
    });
  }

  const claimQuery = {
    id: ot.id,
    organization_id: orgId,
    estado: ot.estado,
    tecnico_asignado_id: previousTechnicianId,
    ...lockQuery,
  };

  const targetState = operation === 'REASSIGNMENT' ? ot.estado : 'ASIGNADA';
  const updatePayload = {
    estado: targetState,
    tecnico_asignado_id: destinationTechnician.user_id,
    tecnico_asignado_email: destinationTechnician.user_email,
    ultima_actividad: operation === 'REASSIGNMENT'
      ? `Tecnico reasignado por ${user.email}`
      : `Tecnico asignado por ${user.email}`,
    ultima_actividad_at: now,
    lifecycle_lock_token: operationToken,
    lifecycle_lock_operation: operation === 'REASSIGNMENT'
      ? 'technicianReassignment'
      : 'initialTechnicianAssignment',
    lifecycle_lock_owner_user_id: user.id,
    lifecycle_lock_at: now,
  };

  let claim;
  try {
    claim = await base44.asServiceRole.entities.OrdenTrabajo.updateMany(
      claimQuery,
      { $set: updatePayload },
    );
  } catch (claimError) {
    const reconciled = await loadWorkOrder(base44, orgId, ot.id);
    const thisAttemptOwnsMutation = reconciled?.lifecycle_lock_token === operationToken
      && reconciled?.estado === targetState
      && reconciled?.tecnico_asignado_id === destinationTechnician.user_id;
    if (!thisAttemptOwnsMutation) throw claimError;
    claim = { updated: 1, recovered: true };
  }

  if (claim?.updated !== 1) {
    const current = await loadWorkOrder(base44, orgId, ot.id);
    if (current?.lifecycle_lock_token && current.lifecycle_lock_token !== operationToken) {
      return errorResponse(409, 'ASSIGNMENT_CONCURRENT_UPDATE',
        'Otra operacion modifico la asignacion de esta OT', {
        retryable: true,
      });
    }

    if (current?.estado === targetState
      && current?.tecnico_asignado_id === destinationTechnician.user_id) {
      return Response.json({
        success: true,
        idempotent: true,
        operation,
        orden_trabajo_id: ot.id,
        tecnico_asignado_id: destinationTechnician.user_id,
        estado_anterior: ot.estado,
        estado_actual: current.estado,
        updated_ot: current,
      });
    }

    return errorResponse(409, 'ASSIGNMENT_CONCURRENT_UPDATE',
      'La Orden de Trabajo cambio concurrentemente', {
      retryable: true,
    });
  }

  try {
    await createRequiredAuditEvent({
      base44,
      orgId,
      ot,
      user,
      operationToken,
      operation,
      previousTechnicianId,
      destinationTechnician,
      reason,
    });
  } catch (auditError) {
    const rollback = await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
      id: ot.id,
      organization_id: orgId,
      estado: targetState,
      tecnico_asignado_id: destinationTechnician.user_id,
      lifecycle_lock_token: operationToken,
    }, buildRollbackUpdate(ot));

    if (rollback?.updated !== 1) {
      return errorResponse(500, 'ASSIGNMENT_ROLLBACK_FAILED',
        'Fallo el evento de auditoria y no fue posible revertir la asignacion');
    }

    return errorResponse(500, 'ASSIGNMENT_AUDIT_FAILED_ROLLED_BACK',
      'No se pudo registrar la auditoria. La asignacion fue revertida sin cambios');
  }

  const release = await releaseAssignmentLock(base44, orgId, ot.id, operationToken);
  const lockCleanupPending = release?.updated !== 1;
  if (lockCleanupPending) {
    console.error(`[reassignWorkOrderTechnician] Lock pendiente de limpieza para OT ${ot.id}: ${release?.error || 'resultado ambiguo'}`);
  }

  const updatedOT = {
    ...ot,
    ...updatePayload,
    estado: targetState,
  };
  delete updatedOT.lifecycle_lock_token;
  delete updatedOT.lifecycle_lock_operation;
  delete updatedOT.lifecycle_lock_owner_user_id;
  delete updatedOT.lifecycle_lock_at;

  return Response.json({
    success: true,
    idempotent: false,
    recovered_ambiguous_write: claim.recovered === true,
    lock_cleanup_pending: lockCleanupPending,
    operation,
    orden_trabajo_id: ot.id,
    tecnico_asignado_id: destinationTechnician.user_id,
    estado_anterior: ot.estado,
    estado_actual: targetState,
    updated_ot: updatedOT,
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Metodo no permitido');
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return errorResponse(401, 'AUTHENTICATION_REQUIRED', 'No autenticado');
    }

    const caller = await resolveCaller(base44, user);
    if (caller.error) {
      return errorResponse(403, caller.code, caller.error);
    }
    if (!AUTHORIZED_ROLES.includes(caller.effectiveRole)) {
      return errorResponse(403, 'ASSIGNMENT_ROLE_NOT_AUTHORIZED',
        'No autorizado para asignar tecnicos', {
          required_roles: AUTHORIZED_ROLES,
          user_role: caller.effectiveRole,
        });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return errorResponse(400, 'INVALID_JSON_BODY', 'Body invalido');
    }

    const {
      orden_trabajo_id,
      tecnico_asignado_id,
      motivo,
    } = body;
    const hasValidIds = typeof orden_trabajo_id === 'string'
      && orden_trabajo_id.trim().length > 0
      && typeof tecnico_asignado_id === 'string'
      && tecnico_asignado_id.trim().length > 0;
    if (!hasValidIds) {
      return errorResponse(400, 'ASSIGNMENT_PAYLOAD_INVALID',
        'orden_trabajo_id y tecnico_asignado_id son obligatorios');
    }
    if (motivo != null && typeof motivo !== 'string') {
      return errorResponse(400, 'ASSIGNMENT_REASON_INVALID',
        'motivo debe ser texto');
    }

    const reason = motivo?.trim() || null;

    const [ot, destinationTechnician] = await Promise.all([
      loadWorkOrder(base44, caller.orgId, orden_trabajo_id),
      loadDestinationTechnician(base44, caller.orgId, tecnico_asignado_id),
    ]);

    if (!ot) {
      return errorResponse(404, 'WORK_ORDER_NOT_FOUND',
        'OrdenTrabajo no encontrada en esta organizacion');
    }
    if (!destinationTechnician) {
      return errorResponse(422, 'DESTINATION_TECHNICIAN_INVALID',
        'El tecnico destino no existe, no esta activo o pertenece a otra organizacion');
    }

    if (['ENTREGADA', 'CANCELADA'].includes(ot.estado)) {
      return errorResponse(409, 'WORK_ORDER_ASSIGNMENT_FORBIDDEN_STATE',
        `No se puede asignar un tecnico a una OT en estado ${ot.estado}`);
    }

    const previousTechnicianId = ot.tecnico_asignado_id || null;
    const isInitialAssignment = ot.estado === 'EN_COLA_REVISION' && !previousTechnicianId;
    const isInitialAssignmentRecovery = ot.estado === 'EN_COLA_REVISION' && !!previousTechnicianId;

    if (isInitialAssignmentRecovery
      && previousTechnicianId !== destinationTechnician.user_id) {
      return errorResponse(409, 'INITIAL_ASSIGNMENT_RECOVERY_TECHNICIAN_MISMATCH',
        'La OT contiene una asignacion inicial parcial a otro tecnico. Recargue y recupere esa asignacion antes de cambiarla', {
        tecnico_asignado_id: previousTechnicianId,
      });
    }

    if (isInitialAssignment || isInitialAssignmentRecovery) {
      return executeAssignmentOperation({
        base44,
        user,
        orgId: caller.orgId,
        ot,
        destinationTechnician,
        reason,
        operation: isInitialAssignmentRecovery
          ? 'INITIAL_ASSIGNMENT_RECOVERY'
          : 'INITIAL_ASSIGNMENT',
      });
    }

    if (!previousTechnicianId) {
      return errorResponse(409, 'WORK_ORDER_ASSIGNMENT_INCONSISTENT',
        'La OT no tiene tecnico y no esta en EN_COLA_REVISION');
    }

    if (previousTechnicianId === destinationTechnician.user_id) {
      if (ot.lifecycle_lock_token && !getLockQuery(ot)) {
        return errorResponse(409, 'ASSIGNMENT_OPERATION_IN_PROGRESS',
          'Otra operacion del lifecycle esta en progreso para esta OT', {
            retryable: true,
          });
      }
      return Response.json({
        success: true,
        idempotent: true,
        operation: 'REASSIGNMENT',
        orden_trabajo_id,
        tecnico_asignado_id: previousTechnicianId,
        estado_anterior: ot.estado,
        estado_actual: ot.estado,
        updated_ot: ot,
      });
    }

    return executeAssignmentOperation({
      base44,
      user,
      orgId: caller.orgId,
      ot,
      destinationTechnician,
      reason,
      operation: 'REASSIGNMENT',
    });
  } catch (error) {
    console.error('[reassignWorkOrderTechnician] Error:', error.message);
    return errorResponse(500, 'ASSIGNMENT_INTERNAL_ERROR',
      'No fue posible completar la asignacion del tecnico');
  }
});
