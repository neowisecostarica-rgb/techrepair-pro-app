import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { getCanonicalBranchScope, validateRequestedBranch } from '../_shared/operationalAuthorization.ts';
import { appendAuditEvent } from '../_shared/auditEvent.ts';

const LOCK_OPERATION = 'RECEPTION_CREATE';
const VALID_EQUIPMENT_TYPES = ['laptop', 'desktop', 'tablet', 'smartphone', 'impresora', 'otro'];
const FAILURE_CODES = {
  resolve_equipment: 'RECEPTION_EQUIPMENT_CREATE_FAILED',
  create_work_order: 'RECEPTION_WORK_ORDER_CREATE_FAILED',
  create_dmr: 'RECEPTION_DMR_CREATE_FAILED',
  create_event: 'RECEPTION_EVENT_CREATE_FAILED',
};

class ReceptionError extends Error {
  constructor(code, message, status = 500, options = {}) {
    super(message);
    this.name = 'ReceptionError';
    this.code = code;
    this.status = status;
    this.failedStep = options.failedStep || 'unknown';
    this.auditDetail = options.auditDetail || message;
    this.retryable = options.retryable ?? false;
  }
}

const nowIso = () => new Date().toISOString();
const isUuid = value => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function fingerprintReception(body) {
  const canonical = JSON.stringify({
    cliente_id: body.cliente_id || null,
    branch_id: body.branch_id || null,
    equipment_mode: body.equipment_mode || null,
    equipo_id: body.equipo_id || null,
    equipment: {
      tipo: body.equipment?.tipo || null,
      marca: body.equipment?.marca?.trim() || null,
      modelo: body.equipment?.modelo?.trim() || null,
      serie: body.equipment?.serie?.trim() || null,
      estado_fisico: body.equipment?.estado_fisico || null,
    },
    motivo_ingreso: body.motivo_ingreso?.trim() || null,
    terms_id: body.terms_id || null,
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeSerial(value) {
  return String(value || '').normalize('NFKC').trim().toUpperCase();
}

function unwrapFunctionResult(result) {
  return result?.data ?? result;
}

async function invokeResourceLock(base44, payload) {
  try {
    const result = unwrapFunctionResult(await base44.functions.invoke('resourceLockLite', payload));
    if (result?.success === true) return result;
    const resultCode = result?.code === 'LOCK_FINGERPRINT_CONFLICT'
      ? 'RECEPTION_IDEMPOTENCY_CONFLICT'
      : result?.code;
    throw new ReceptionError(
      resultCode || 'RECEPTION_LOCK_FAILED',
      result?.message || 'No se pudo adquirir el lock de recepción.',
      result?.code === 'LOCK_ACQUIRE_TIMEOUT' ? 423 : 409,
      { failedStep: 'resource_lock', retryable: result?.retryable ?? true },
    );
  } catch (error) {
    if (error instanceof ReceptionError) throw error;
    const detail = error?.data || error?.response?.data || {};
    const detailCode = detail.code === 'LOCK_FINGERPRINT_CONFLICT'
      ? 'RECEPTION_IDEMPOTENCY_CONFLICT'
      : detail.code;
    throw new ReceptionError(
      detailCode || error?.code || 'RECEPTION_LOCK_FAILED',
      detail.message || error?.message || 'No se pudo adquirir el lock de recepción.',
      error?.status || 500,
      { failedStep: 'resource_lock', auditDetail: detail.audit_detail || error?.message, retryable: detail.retryable ?? true },
    );
  }
}

async function assertResourceLease(base44, lease, correlationId) {
  if (!lease) throw new ReceptionError('LOCK_LOST', 'La recepción perdió sus recursos.', 409, {
    failedStep: 'resource_lock',
    retryable: true,
  });
  await invokeResourceLock(base44, {
    action: 'assertOwned',
    operation: LOCK_OPERATION,
    correlation_id: correlationId,
    lease,
  });
}

async function ownsResourceLease(base44, lease, correlationId) {
  try {
    await assertResourceLease(base44, lease, correlationId);
    return true;
  } catch {
    return false;
  }
}

async function releaseResourceLease(base44, lease, correlationId) {
  if (!lease) return;
  try {
    await invokeResourceLock(base44, {
      action: 'releaseMany',
      operation: LOCK_OPERATION,
      correlation_id: correlationId,
      lease,
    });
  } catch (error) {
    console.error(`[createWorkOrder] No se pudo liberar Resource Lock Lite: ${error.message}`);
  }
}

async function resolveOrganization(base44, user) {
  const authorization = await resolveAuthorizedContext(base44, user, {
    allowedRoles: ['ORG_ADMIN', 'BRANCH_ADMIN', 'SALES', 'CUSTOMER_SERVICE'],
  });
  return authorization;
}

function buildDmrNumber(correlationId) {
  const year = new Date().getFullYear();
  return `DMR-${year}-${correlationId.replaceAll('-', '').toUpperCase()}`;
}

function buildWorkOrderCode(correlationId) {
  const year = new Date().getFullYear();
  return `OT-${year}-${correlationId.replaceAll('-', '').toUpperCase()}`;
}

function buildSuccess({ correlationId, equipment, equipmentCreated, workOrder, dmr, event, idempotent }) {
  return {
    success: true,
    correlation_id: correlationId,
    idempotent,
    equipment: { id: equipment.id, created: equipmentCreated },
    work_order: { id: workOrder.id, code: workOrder.codigo_ot },
    dmr: { id: dmr.id, number: dmr.dmr_number },
    event: { id: event.id, type: event.tipo },
    navigate_to: `/expediente/${workOrder.id}`,
  };
}

async function auditReception(base44, action, orgId, details) {
  console.info('[createWorkOrder] operational trace', {
    action,
    organization_id: orgId,
    ...details,
    timestamp: nowIso(),
  });
}

async function findOne(entity, query) {
  const records = await entity.filter(query, undefined, 5);
  return records?.[0] || null;
}

async function safeDeleteOwned(entity, { id, orgId, correlationId }) {
  if (!id) return { deleted: false, reason: 'not_created' };
  const record = await findOne(entity, {
    id,
    organization_id: orgId,
    reception_correlation_id: correlationId,
  });
  if (!record) return { deleted: false, reason: 'not_owned_or_missing' };
  await entity.delete(id);
  return { deleted: true };
}

async function compensateReception(base44, context) {
  const {
    orgId, correlationId, equipmentMode,
    equipmentId, workOrderId, dmrId, eventId,
  } = context;
  const deleted = [];
  const preserved = [];
  const errors = [];

  for (const [label, entity, id] of [
    ['event', base44.asServiceRole.entities.OTEvent, eventId],
    ['dmr', base44.asServiceRole.entities.DiagnosticMasterRecord, dmrId],
    ['work_order', base44.asServiceRole.entities.OrdenTrabajo, workOrderId],
  ]) {
    try {
      const result = await safeDeleteOwned(entity, { id, orgId, correlationId });
      if (result.deleted) deleted.push(`${label}:${id}`);
      else if (id) preserved.push(`${label}:${id}:${result.reason}`);
    } catch (error) {
      errors.push(`${label}:${id}:${error.message}`);
    }
  }

  if (equipmentId) {
    if (equipmentMode !== 'create') {
      preserved.push(`equipment:${equipmentId}:preexisting`);
    } else {
      try {
        const equipment = await findOne(base44.asServiceRole.entities.Equipo, {
          id: equipmentId,
          organization_id: orgId,
          reception_correlation_id: correlationId,
          created_by_reception: true,
        });
        if (!equipment) {
          preserved.push(`equipment:${equipmentId}:not_owned_or_missing`);
        } else {
          const references = await base44.asServiceRole.entities.OrdenTrabajo.filter({
            organization_id: orgId,
            equipo_id: equipmentId,
          });
          const externalReferences = (references || []).filter(order =>
            order.id !== workOrderId || order.reception_correlation_id !== correlationId
          );
          if (externalReferences.length > 0) {
            preserved.push(`equipment:${equipmentId}:referenced_by_other_work_order`);
          } else if ((references || []).length > 0) {
            preserved.push(`equipment:${equipmentId}:work_order_still_present`);
          } else {
            await base44.asServiceRole.entities.Equipo.delete(equipmentId);
            deleted.push(`equipment:${equipmentId}`);
          }
        }
      } catch (error) {
        errors.push(`equipment:${equipmentId}:${error.message}`);
      }
    }
  }

  return {
    status: errors.length > 0 ? 'FAILED' : 'SUCCEEDED',
    deleted,
    preserved,
    errors,
  };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  let user = null;
  let orgId = null;
  let authorization = null;
  let body = {};
  let lease = null;
  const partial = {
    equipmentId: null,
    workOrderId: null,
    dmrId: null,
    eventId: null,
    equipmentMode: null,
  };
  let failedStep = 'authenticate';
  let reconciledExistingArtifact = false;

  try {
    user = await base44.auth.me();
    if (!user) throw new ReceptionError('RECEPTION_UNAUTHORIZED', 'Debe iniciar sesión nuevamente.', 401, { failedStep });

    authorization = await resolveOrganization(base44, user);
    orgId = authorization.ok ? authorization.organizationId : null;
    if (!orgId) {
      throw new ReceptionError('RECEPTION_ORGANIZATION_UNRESOLVED', 'No se pudo determinar la organización.', 403, { failedStep: 'resolve_organization' });
    }

    body = await req.json();
    const {
      correlation_id: correlationId,
      cliente_id: clientId,
      branch_id: requestedBranchId,
      equipment_mode: equipmentMode,
      equipo_id: requestedEquipmentId,
      equipment: requestedEquipment,
      terms_id: termsId,
      motivo_ingreso: admissionReason,
    } = body;
    const branchScope = getCanonicalBranchScope(authorization);
    if (!branchScope.ok) {
      throw new ReceptionError(branchScope.code || 'RECEPTION_BRANCH_SCOPE_INVALID', branchScope.error, branchScope.status, { failedStep: 'validate_branch_scope' });
    }
    const branchCheck = validateRequestedBranch(branchScope, requestedBranchId);
    if (!branchCheck.ok) {
      throw new ReceptionError(branchCheck.code, branchCheck.error, branchCheck.status, { failedStep: 'validate_branch_scope' });
    }
    const branchId = branchScope.organizationWide ? requestedBranchId : branchScope.branchId;
    partial.equipmentMode = equipmentMode;

    failedStep = 'validate_request';
    if (!isUuid(correlationId) || !clientId || !branchId || !admissionReason?.trim()) {
      throw new ReceptionError(
        'RECEPTION_VALIDATION_FAILED',
        'Cliente, sucursal, motivo y referencia de recepción son obligatorios.',
        400,
        { failedStep },
      );
    }
    if (!['existing', 'create'].includes(equipmentMode)) {
      throw new ReceptionError('RECEPTION_VALIDATION_FAILED', 'Debe seleccionar o registrar un equipo.', 400, { failedStep });
    }
    if (equipmentMode === 'existing' && !requestedEquipmentId) {
      throw new ReceptionError('RECEPTION_VALIDATION_FAILED', 'Debe seleccionar un equipo existente.', 400, { failedStep });
    }
    if (equipmentMode === 'create'
      && (!VALID_EQUIPMENT_TYPES.includes(requestedEquipment?.tipo) || !requestedEquipment?.marca?.trim())) {
      throw new ReceptionError('RECEPTION_VALIDATION_FAILED', 'Tipo y marca del equipo son obligatorios.', 400, { failedStep });
    }
    const normalizedSerial = equipmentMode === 'create' ? normalizeSerial(requestedEquipment?.serie) : '';

    const [client, branch, terms] = await Promise.all([
      findOne(base44.asServiceRole.entities.Cliente, { id: clientId, organization_id: orgId }),
      findOne(base44.asServiceRole.entities.Branch, { id: branchId, organization_id: orgId, active: true }),
      termsId
        ? findOne(base44.asServiceRole.entities.TerminosYCondiciones, {
            id: termsId,
            organization_id: orgId,
            activo: true,
          })
        : Promise.resolve(null),
    ]);
    if (!client) throw new ReceptionError('RECEPTION_CLIENT_NOT_FOUND', 'El cliente no pertenece a esta organización.', 404, { failedStep: 'validate_client' });
    if (!branch) throw new ReceptionError('RECEPTION_BRANCH_INVALID', 'La sucursal no es válida o está inactiva.', 400, { failedStep: 'validate_branch' });
    if (!terms) throw new ReceptionError('RECEPTION_TERMS_INVALID', 'Los términos seleccionados ya no están activos.', 400, { failedStep: 'validate_terms' });

    failedStep = 'acquire_lock';
    const requestFingerprint = await fingerprintReception(body);
    const resources = [`client:${clientId}`];
    if (normalizedSerial) resources.push(`serial:${normalizedSerial}`);
    const lockResult = await invokeResourceLock(base44, {
      action: 'acquireMany',
      operation: LOCK_OPERATION,
      correlation_id: correlationId,
      request_fingerprint: requestFingerprint,
      resources,
      timeout_ms: body.lock_timeout_ms,
    });
    lease = lockResult.lease;

    failedStep = 'resolve_equipment';
    await assertResourceLease(base44, lease, correlationId);
    let equipment = await findOne(base44.asServiceRole.entities.Equipo, {
      organization_id: orgId,
      reception_correlation_id: correlationId,
    });
    if (equipment) reconciledExistingArtifact = true;
    let equipmentCreated = Boolean(equipment?.created_by_reception);

    if (equipmentMode === 'existing') {
      equipment = await findOne(base44.asServiceRole.entities.Equipo, {
        id: requestedEquipmentId,
        organization_id: orgId,
      });
      if (!equipment) throw new ReceptionError('RECEPTION_EQUIPMENT_NOT_FOUND', 'El equipo no pertenece a esta organización.', 404, { failedStep });
      if (equipment.cliente_id !== clientId) {
        throw new ReceptionError('RECEPTION_EQUIPMENT_OWNER_MISMATCH', 'El equipo no pertenece al cliente seleccionado.', 409, { failedStep });
      }
      if (!branchScope.organizationWide && equipment.branch_id && equipment.branch_id !== branchScope.branchId) {
        throw new ReceptionError('RECEPTION_EQUIPMENT_CROSS_BRANCH_DENIED', 'El equipo pertenece a otra sucursal.', 403, { failedStep });
      }
      equipmentCreated = false;
    } else if (!equipment) {
      if (normalizedSerial) {
        const tenantEquipment = await base44.asServiceRole.entities.Equipo.filter({ organization_id: orgId });
        const duplicate = (tenantEquipment || []).find(record => normalizeSerial(record.serie) === normalizedSerial);
        if (duplicate) {
          throw new ReceptionError('RECEPTION_SERIAL_CONFLICT', 'Ya existe un equipo con este número de serie.', 409, { failedStep });
        }
      }
      await assertResourceLease(base44, lease, correlationId);
      equipment = await base44.asServiceRole.entities.Equipo.create({
        organization_id: orgId,
        branch_id: branchId,
        cliente_id: clientId,
        tipo: requestedEquipment.tipo,
        marca: requestedEquipment.marca.trim(),
        modelo: requestedEquipment.modelo?.trim() || undefined,
        serie: normalizedSerial || undefined,
        estado_fisico: requestedEquipment.estado_fisico || undefined,
        accesorios: requestedEquipment.accesorios || [],
        fotos: requestedEquipment.fotos || [],
        reception_correlation_id: correlationId,
        created_by_reception: true,
      });
      equipmentCreated = true;
    }
    if (equipment.cliente_id !== clientId) {
      throw new ReceptionError('RECEPTION_EQUIPMENT_OWNER_MISMATCH', 'El equipo recuperado no pertenece al cliente seleccionado.', 409, { failedStep });
    }
    partial.equipmentId = equipment.id;

    failedStep = 'create_work_order';
    await assertResourceLease(base44, lease, correlationId);
    let workOrder = await findOne(base44.asServiceRole.entities.OrdenTrabajo, {
      organization_id: orgId,
      reception_correlation_id: correlationId,
    });
    if (workOrder) reconciledExistingArtifact = true;
    if (!workOrder) {
      workOrder = await base44.asServiceRole.entities.OrdenTrabajo.create({
        organization_id: orgId,
        codigo_ot: buildWorkOrderCode(correlationId),
        branch_id: branchId,
        cliente_id: clientId,
        equipo_id: equipment.id,
        motivo_ingreso: admissionReason.trim(),
        estado: 'EN_COLA_REVISION',
        tipo_ingreso: body.tipo_ingreso || 'presencial',
        prioridad: body.prioridad || 'normal',
        observaciones_ingreso: body.observaciones_ingreso?.trim() || undefined,
        serie_ingreso: body.serie_ingreso?.trim() || equipment.serie || undefined,
        accesorios_ingreso: body.accesorios_ingreso?.trim() || undefined,
        estado_fisico_ingreso: body.estado_fisico_ingreso || undefined,
        contrasena_ingreso: body.contrasena_ingreso?.trim() || undefined,
        responsable_recepcion: body.responsable_recepcion?.trim() || undefined,
        tracking_code: body.tracking_code?.trim() || undefined,
        created_by_user_id: user.id,
        fecha_ingreso: nowIso(),
        reception_correlation_id: correlationId,
      });
    }
    partial.workOrderId = workOrder.id;

    failedStep = 'create_dmr';
    await assertResourceLease(base44, lease, correlationId);
    let dmr = await findOne(base44.asServiceRole.entities.DiagnosticMasterRecord, {
      organization_id: orgId,
      reception_correlation_id: correlationId,
    });
    if (dmr) reconciledExistingArtifact = true;
    if (!dmr) {
      dmr = await base44.asServiceRole.entities.DiagnosticMasterRecord.create({
        organization_id: orgId,
        orden_trabajo_id: workOrder.id,
        dmr_number: buildDmrNumber(correlationId),
        created_at: nowIso(),
        document_status: 'ACTIVE',
        version: 1,
        replaces_dmr_id: null,
        cliente_snapshot: {
          id: client.id || '',
          nombre_completo: client.nombre_completo || '',
          identificacion: client.identificacion || '',
          telefono: client.telefono || '',
          email: client.email || '',
        },
        activo_snapshot: {
          id: equipment.id || '',
          tipo: equipment.tipo || '',
          marca: equipment.marca || '',
          modelo: equipment.modelo || '',
          serie: equipment.serie || '',
          estado_fisico: equipment.estado_fisico || '',
        },
        contexto_recepcion: {
          motivo_ingreso: workOrder.motivo_ingreso || '',
          tipo_ingreso: workOrder.tipo_ingreso || 'presencial',
          prioridad: workOrder.prioridad || 'normal',
          accesorios_ingreso: workOrder.accesorios_ingreso || '',
          serie_ingreso: workOrder.serie_ingreso || '',
          observaciones_ingreso: workOrder.observaciones_ingreso || '',
          codigo_ot: workOrder.codigo_ot || '',
          fecha_ingreso: workOrder.fecha_ingreso || nowIso(),
        },
        legal_snapshot: {
          terminos_aceptados: true,
          terminos_aceptados_at: nowIso(),
          terminos_version: terms.version,
          terminos_texto_snapshot: terms.texto,
        },
        diagnostico_snapshot: null,
        pdf_url: null,
        pdf_hash: null,
        created_by_user_id: user.id,
        reception_correlation_id: correlationId,
      });
    }
    partial.dmrId = dmr.id;

    failedStep = 'create_event';
    await assertResourceLease(base44, lease, correlationId);
    let event = await findOne(base44.asServiceRole.entities.OTEvent, {
      organization_id: orgId,
      reception_correlation_id: correlationId,
      orden_trabajo_id: workOrder.id,
      tipo: 'CREATED',
    });
    if (event) reconciledExistingArtifact = true;
    if (!event) {
      event = await base44.asServiceRole.entities.OTEvent.create({
        organization_id: orgId,
        orden_trabajo_id: workOrder.id,
        tipo: 'CREATED',
        created_by_user_id: user.id,
        processed: false,
        created_at: nowIso(),
        reception_correlation_id: correlationId,
      });
    }
    partial.eventId = event.id;

    await auditReception(base44, 'RECEPTION_CREATED', orgId, {
      correlation_id: correlationId,
      equipment_id: equipment.id,
      work_order_id: workOrder.id,
      dmr_id: dmr.id,
      event_id: event.id,
      created_by: user.id,
    });
    await appendAuditEvent(base44, {
      eventType: 'WORK_ORDER_RECEPTION_CREATED',
      principalClass: authorization.principalClass,
      actorUserId: user.id,
      actorPrimaryRole: authorization.persistedRole,
      organizationId: orgId,
      branchId,
      resourceType: 'OrdenTrabajo',
      resourceId: workOrder.id,
      commandPolicyId: 'CP-OT-001',
      correlationId,
      auditOperationId: `work-order-reception:${workOrder.id}`,
      operationKey: correlationId,
      outcome: reconciledExistingArtifact ? 'IDEMPOTENT_REPLAY' : 'COMMITTED',
      newState: { estado: workOrder.estado, equipment_id: equipment.id, dmr_id: dmr.id },
      metadata: { legacy_event_id: event.id, equipment_created: equipmentCreated },
    });

    return Response.json(buildSuccess({
      correlationId,
      equipment,
      equipmentCreated,
      workOrder,
      dmr,
      event,
      idempotent: reconciledExistingArtifact,
    }));
  } catch (error) {
    const normalized = error instanceof ReceptionError
      ? error
      : new ReceptionError(
          FAILURE_CODES[failedStep] || 'RECEPTION_INTERNAL_ERROR',
          'No se pudo registrar la recepción. No se guardaron cambios.',
          500,
          { failedStep, auditDetail: error.message, retryable: true },
        );

    let compensation = { status: 'NOT_REQUIRED', deleted: [], preserved: [], errors: [] };
    const ownsLock = lease ? await ownsResourceLease(base44, lease, body.correlation_id) : false;
    if (ownsLock && (partial.equipmentId || partial.workOrderId || partial.dmrId || partial.eventId)) {
      compensation = await compensateReception(base44, {
        orgId,
        correlationId: body.correlation_id,
        equipmentMode: partial.equipmentMode,
        equipmentId: partial.equipmentId,
        workOrderId: partial.workOrderId,
        dmrId: partial.dmrId,
        eventId: partial.eventId,
      });
    } else if (!ownsLock && (partial.equipmentId || partial.workOrderId || partial.dmrId || partial.eventId)) {
      compensation = {
        status: 'SKIPPED_LOCK_NOT_OWNED',
        deleted: [],
        preserved: [
          partial.eventId && `event:${partial.eventId}`,
          partial.dmrId && `dmr:${partial.dmrId}`,
          partial.workOrderId && `work_order:${partial.workOrderId}`,
          partial.equipmentId && `equipment:${partial.equipmentId}`,
        ].filter(Boolean),
        errors: [],
      };
    }

    const compensationFailed = compensation.status === 'FAILED';
    const code = compensationFailed ? 'RECEPTION_COMPENSATION_FAILED' : normalized.code;
    const message = compensationFailed
      ? 'La recepción falló y requiere revisión manual. No reintente con datos diferentes.'
      : normalized.message;

    await auditReception(base44, compensationFailed ? 'RECEPTION_COMPENSATION_FAILED' : 'RECEPTION_FAILED', orgId, {
      correlation_id: body.correlation_id || null,
      code,
      failed_step: normalized.failedStep,
      audit_detail: normalized.auditDetail,
      partial_state: {
        equipment_id: partial.equipmentId,
        work_order_id: partial.workOrderId,
        dmr_id: partial.dmrId,
        event_id: partial.eventId,
      },
      compensation,
      reported_by: user?.id || null,
    });

    return Response.json({
      success: false,
      code,
      message,
      audit_detail: normalized.auditDetail,
      correlation_id: body.correlation_id || null,
      failed_step: normalized.failedStep,
      retryable: compensationFailed ? false : normalized.retryable,
      partial_state: {
        equipment_id: partial.equipmentId,
        work_order_id: partial.workOrderId,
        dmr_id: partial.dmrId,
        event_id: partial.eventId,
      },
      compensation,
    }, { status: compensationFailed ? 500 : normalized.status });
  } finally {
    await releaseResourceLease(base44, lease, body.correlation_id);
  }
});
