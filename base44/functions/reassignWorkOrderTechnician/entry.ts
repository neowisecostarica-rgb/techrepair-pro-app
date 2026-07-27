import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const AUTHORIZED_ROLES = ['ORG_ADMIN', 'BRANCH_ADMIN'];
const ASSIGNMENT_LOCK_TTL_MS = 15 * 60 * 1000;

function isActiveAccount(account) {
  if (!account || account.active === false || account.status === 'suspended') return false;
  return account.status === 'active' || account.active === true;
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
  const isSuperAdmin = user.is_super_admin === true || user.data?.is_super_admin === true;

  if (isSuperAdmin) {
    if (!user.impersonating_org_id) {
      return { error: 'SUPER_ADMIN debe seleccionar una organizacion antes de asignar tecnicos' };
    }
    return {
      orgId: user.impersonating_org_id,
      effectiveRole: 'ORG_ADMIN',
      isSuperAdmin: true,
    };
  }

  const orgHint = user.impersonating_org_id || user.organization_id || null;
  const accounts = await base44.asServiceRole.entities.UserAccount.filter({ user_id: user.id }, 5);
  const eligibleAccounts = (accounts || []).filter(isActiveAccount);

  let account = null;
  if (orgHint) {
    account = eligibleAccounts.find(candidate => candidate.organization_id === orgHint) || null;
  } else if (eligibleAccounts.length === 1) {
    account = eligibleAccounts[0];
  }

  if (!account) {
    return { error: 'No existe una cuenta activa para la organizacion seleccionada' };
  }

  return {
    orgId: account.organization_id,
    effectiveRole: account.role,
    isSuperAdmin: false,
  };
}

async function loadDestinationTechnician(base44, orgId, technicianUserId) {
  const accounts = await base44.asServiceRole.entities.UserAccount.filter({
    user_id: technicianUserId,
    organization_id: orgId,
    role: 'TECHNICIAN',
  }, 5);
  return (accounts || []).find(isActiveAccount) || null;
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
    return Response.json({
      error: 'Otra operacion del lifecycle esta en progreso para esta OT',
      code: 'ASSIGNMENT_OPERATION_IN_PROGRESS',
      retryable: true,
    }, { status: 409 });
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
      return Response.json({
        error: 'Otra operacion modifico la asignacion de esta OT',
        code: 'ASSIGNMENT_CONCURRENT_UPDATE',
        retryable: true,
      }, { status: 409 });
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

    return Response.json({
      error: 'La Orden de Trabajo cambio concurrentemente',
      code: 'ASSIGNMENT_CONCURRENT_UPDATE',
      retryable: true,
    }, { status: 409 });
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
      return Response.json({
        error: 'Fallo el evento de auditoria y no fue posible revertir la asignacion',
        code: 'ASSIGNMENT_ROLLBACK_FAILED',
        audit_error: auditError.message,
      }, { status: 500 });
    }

    return Response.json({
      error: 'No se pudo registrar la auditoria. La asignacion fue revertida sin cambios',
      code: 'ASSIGNMENT_AUDIT_FAILED_ROLLED_BACK',
    }, { status: 500 });
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
      return Response.json({ error: 'Metodo no permitido' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'No autenticado' }, { status: 401 });
    }

    const caller = await resolveCaller(base44, user);
    if (caller.error) {
      return Response.json({ error: caller.error }, { status: 403 });
    }
    if (!AUTHORIZED_ROLES.includes(caller.effectiveRole)) {
      return Response.json({
        error: 'No autorizado para asignar tecnicos',
        required_roles: AUTHORIZED_ROLES,
        user_role: caller.effectiveRole,
      }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return Response.json({ error: 'Body invalido' }, { status: 400 });
    }

    const {
      orden_trabajo_id,
      tecnico_asignado_id,
      motivo,
    } = body;
    if (!orden_trabajo_id || !tecnico_asignado_id) {
      return Response.json({
        error: 'orden_trabajo_id y tecnico_asignado_id son obligatorios',
      }, { status: 400 });
    }

    const [ot, destinationTechnician] = await Promise.all([
      loadWorkOrder(base44, caller.orgId, orden_trabajo_id),
      loadDestinationTechnician(base44, caller.orgId, tecnico_asignado_id),
    ]);

    if (!ot) {
      return Response.json({
        error: 'OrdenTrabajo no encontrada en esta organizacion',
      }, { status: 404 });
    }
    if (!destinationTechnician) {
      return Response.json({
        error: 'El tecnico destino no existe, no esta activo o pertenece a otra organizacion',
        code: 'DESTINATION_TECHNICIAN_INVALID',
      }, { status: 422 });
    }

    const previousTechnicianId = ot.tecnico_asignado_id || null;
    const isInitialAssignment = ot.estado === 'EN_COLA_REVISION' && !previousTechnicianId;
    const isInitialAssignmentRecovery = ot.estado === 'EN_COLA_REVISION' && !!previousTechnicianId;

    if (isInitialAssignmentRecovery
      && previousTechnicianId !== destinationTechnician.user_id) {
      return Response.json({
        error: 'La OT contiene una asignacion inicial parcial a otro tecnico. Recargue y recupere esa asignacion antes de cambiarla',
        code: 'INITIAL_ASSIGNMENT_RECOVERY_TECHNICIAN_MISMATCH',
        tecnico_asignado_id: previousTechnicianId,
      }, { status: 409 });
    }

    if (isInitialAssignment || isInitialAssignmentRecovery) {
      return executeAssignmentOperation({
        base44,
        user,
        orgId: caller.orgId,
        ot,
        destinationTechnician,
        reason: motivo?.trim() || null,
        operation: isInitialAssignmentRecovery
          ? 'INITIAL_ASSIGNMENT_RECOVERY'
          : 'INITIAL_ASSIGNMENT',
      });
    }

    if (!previousTechnicianId) {
      return Response.json({
        error: 'La OT no tiene tecnico y no esta en EN_COLA_REVISION',
        code: 'WORK_ORDER_ASSIGNMENT_INCONSISTENT',
      }, { status: 409 });
    }

    if (previousTechnicianId === destinationTechnician.user_id) {
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
      reason: motivo?.trim() || null,
      operation: 'REASSIGNMENT',
    });
  } catch (error) {
    console.error('[reassignWorkOrderTechnician] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
