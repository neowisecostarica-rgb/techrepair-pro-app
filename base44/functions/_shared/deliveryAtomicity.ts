import {
  acquireLifecycleLock,
  loadWorkOrder,
  releaseLifecycleLock,
  renewLifecycleLock,
} from './workOrderLifecycleLock.ts';

export const DELIVERY_LEGAL_TEXT = 'Confirmo que he recibido el equipo y el servicio descrito en esta orden de trabajo, y que el equipo ha sido entregado en las condiciones acordadas.';
export const DELIVERY_LEGAL_VERSION = 'DELIVERY_MVP_V1';

const REPAIR_INTERVENTIONS = new Set(['reparacion_puntual', 'mantenimiento_correctivo']);
const NON_REPAIR_INTERVENTIONS = new Set([
  'diagnostico_tecnico',
  'revision_general',
  'mantenimiento_preventivo',
  'limpieza',
]);
const DELIVERY_QUERY_LIMIT = 200;

export class DeliveryCommandError extends Error {
  constructor(message, code, status = 409, details = {}) {
    super(message);
    this.name = 'DeliveryCommandError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  }
  return value;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function normalizeDeliveryRequest(input = {}) {
  const workOrderId = String(input.work_order_id || input.orden_trabajo_id || '').trim();
  const operationKey = String(input.delivery_operation_key || input.operation_key || '').trim();
  const acceptance = input.acceptance === true;
  const note = String(input.nota_entrega || input.note || '').trim().slice(0, 2000) || null;
  if (!workOrderId) throw new DeliveryCommandError('work_order_id es requerido.', 'DELIVERY_WORK_ORDER_REQUIRED', 400);
  if (!acceptance) throw new DeliveryCommandError('La aceptacion explicita es obligatoria.', 'DELIVERY_ACCEPTANCE_REQUIRED', 422);
  if (!/^[A-Za-z0-9:_-]{16,200}$/.test(operationKey)) {
    throw new DeliveryCommandError('operation_key estable es requerido.', 'DELIVERY_OPERATION_KEY_REQUIRED', 400);
  }
  return {
    work_order_id: workOrderId,
    acceptance: true,
    nota_entrega: note,
    operation_key: operationKey,
    legal_text: DELIVERY_LEGAL_TEXT,
    legal_version: DELIVERY_LEGAL_VERSION,
  };
}

export async function fingerprintDeliveryRequest(normalized) {
  return sha256(JSON.stringify(stableValue(normalized)));
}

function diagnosticTimestamp(record) {
  for (const value of [record?.fecha_completado, record?.updated_date, record?.created_date]) {
    const parsed = Date.parse(value || '');
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function determineWarrantyApplicability(diagnostics = []) {
  const canonical = (diagnostics || [])
    .filter(record => record?.bloqueado === true
      && record?.credito_consumido_finalizacion === true
      && record?.estado === 'listo_aprobacion')
    .sort((left, right) => diagnosticTimestamp(right) - diagnosticTimestamp(left))[0];
  if (!canonical?.tipo_intervencion) {
    throw new DeliveryCommandError(
      'No existe una intervencion tecnica finalizada que permita decidir la garantia.',
      'DELIVERY_WARRANTY_APPLICABILITY_UNDETERMINED',
      422,
    );
  }
  const interventionType = canonical.tipo_intervencion;
  if (REPAIR_INTERVENTIONS.has(interventionType)) {
    return { applicable: true, outcome: 'ISSUED', intervention_type: interventionType, diagnostic_id: canonical.id };
  }
  if (NON_REPAIR_INTERVENTIONS.has(interventionType)) {
    return { applicable: false, outcome: 'NOT_APPLICABLE', intervention_type: interventionType, diagnostic_id: canonical.id };
  }
  throw new DeliveryCommandError(
    `La intervencion "${interventionType}" no determina de forma segura si hubo reparacion.`,
    'DELIVERY_WARRANTY_APPLICABILITY_UNDETERMINED',
    422,
  );
}

function moneyMatches(left, right) {
  return Number.isFinite(Number(left)) && Number.isFinite(Number(right))
    && Math.abs(Number(left) - Number(right)) <= 0.01;
}

function saleIsCommittedPaid(sale) {
  return sale?.estado === 'pagada'
    && sale?.inventory_commit_status === 'COMMITTED'
    && Number(sale?.total) > 0;
}

function assertSingle(records, code, message) {
  if ((records || []).length > 1) throw new DeliveryCommandError(message, code, 409);
  return records?.[0] || null;
}

export function evaluateCommercialDeliveryGate({ ot, applicability, sales = [], quotes = [], workflowGates = [] }) {
  const scopedSales = sales.filter(sale => sale.organization_id === ot.organization_id
    && sale.referencia_ot_id === ot.id
    && sale.branch_id === ot.branch_id
    && (!sale.cliente_id || sale.cliente_id === ot.cliente_id));
  const repairSales = scopedSales.filter(sale => sale.tipo_concepto === 'reparacion');
  const approvedQuotes = quotes.filter(quote => quote.organization_id === ot.organization_id
    && quote.orden_trabajo_id === ot.id
    && quote.branch_id === ot.branch_id
    && quote.estado === 'aprobada'
    && quote.decision_status === 'COMMITTED');
  if (approvedQuotes.length > 1) {
    throw new DeliveryCommandError(
      'Existe mas de una cotizacion aprobada canonica para la OT.',
      'DELIVERY_COMMERCIAL_APPROVED_QUOTE_AMBIGUOUS',
      409,
    );
  }
  const repairObligationExists = applicability.applicable || repairSales.length > 0 || approvedQuotes.length > 0;

  if (repairObligationExists) {
    const paidRepairSales = repairSales.filter(saleIsCommittedPaid);
    const sale = assertSingle(
      paidRepairSales,
      'DELIVERY_COMMERCIAL_DUPLICATE_REPAIR_SALES',
      'Existe mas de una venta de reparacion pagada para la OT.',
    );
    if (!sale) {
      throw new DeliveryCommandError(
        'La obligacion de reparacion no esta liquidada.',
        'DELIVERY_COMMERCIAL_REPAIR_UNPAID',
        422,
      );
    }
    if (repairSales.some(candidate => candidate.id !== sale.id && !['anulada'].includes(candidate.estado))) {
      throw new DeliveryCommandError(
        'Existen obligaciones de reparacion concurrentes o pendientes.',
        'DELIVERY_COMMERCIAL_REPAIR_AMBIGUOUS',
        409,
      );
    }

    let quote = null;
    if (sale.cotizacion_id) {
      quote = approvedQuotes.find(candidate => candidate.id === sale.cotizacion_id) || null;
      if (!quote
        || quote.estado_conversion !== 'CONVERTIDA'
        || quote.venta_id !== sale.id
        || !moneyMatches(quote.total, sale.total)) {
        throw new DeliveryCommandError(
          'La venta no liquida la cotizacion aprobada de la OT.',
          'DELIVERY_COMMERCIAL_QUOTE_MISMATCH',
          422,
        );
      }
    } else if (approvedQuotes.length > 0) {
      throw new DeliveryCommandError(
        'Existe una cotizacion aprobada que no fue liquidada por la venta canonica.',
        'DELIVERY_COMMERCIAL_QUOTE_UNPAID',
        422,
      );
    }

    return {
      satisfied: true,
      basis: quote ? 'APPROVED_QUOTE_PAID_SALE' : 'AUTHORITATIVE_PAID_REPAIR_SALE',
      sale_id: sale.id,
      quote_id: quote?.id || null,
      required_total: Number(quote?.total ?? sale.total),
      paid_total: Number(sale.total),
      pending_balance: 0,
    };
  }

  const revisionSales = scopedSales.filter(sale => sale.tipo_concepto === 'revision_diagnostico');
  const referencedSale = ot.revision_venta_id
    ? revisionSales.find(sale => sale.id === ot.revision_venta_id) || null
    : null;
  const paidRevisionSales = revisionSales.filter(saleIsCommittedPaid);
  const sale = referencedSale || assertSingle(
    paidRevisionSales,
    'DELIVERY_COMMERCIAL_DUPLICATE_REVISION_SALES',
    'Existe mas de una venta de revision pagada para la OT.',
  );
  if (!sale || !saleIsCommittedPaid(sale)) {
    throw new DeliveryCommandError(
      'La obligacion de diagnostico/revision no esta liquidada.',
      'DELIVERY_COMMERCIAL_REVISION_UNPAID',
      422,
    );
  }
  const gateResolved = workflowGates.some(gate => gate.organization_id === ot.organization_id
    && gate.subject_type === 'OrdenTrabajo'
    && gate.subject_id === ot.id
    && gate.wait_reason === 'COMMERCIAL_AUTHORIZATION'
    && gate.status === 'RESOLVED'
    && gate.resolution_payload?.sale_id === sale.id);
  if (!(ot.diagnostico_habilitado === true && ot.revision_venta_id === sale.id) && !gateResolved) {
    throw new DeliveryCommandError(
      'El pago existe pero no resolvio la autorizacion comercial canonica.',
      'DELIVERY_COMMERCIAL_AUTHORIZATION_UNRESOLVED',
      422,
    );
  }
  return {
    satisfied: true,
    basis: gateResolved ? 'RESOLVED_COMMERCIAL_GATE' : 'CANONICAL_REVISION_SALE',
    sale_id: sale.id,
    quote_id: null,
    required_total: Number(sale.total),
    paid_total: Number(sale.total),
    pending_balance: 0,
  };
}

function utcDate(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

export function addUtcMonths(dateValue, months) {
  const source = new Date(`${dateValue}T00:00:00.000Z`);
  const targetMonth = source.getUTCMonth() + Number(months);
  const year = source.getUTCFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(source.getUTCDate(), lastDay);
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

async function list(entity, filter, sort = '-created_date', limit = DELIVERY_QUERY_LIMIT) {
  return entity.filter(filter, sort, limit);
}

async function createRecoverable(entity, data, find, duplicateCode) {
  const existing = await find();
  if (existing?.length > 1) throw new DeliveryCommandError('Registros criticos duplicados.', duplicateCode, 409);
  if (existing?.[0]) return { record: existing[0], recovered: true };
  try {
    const created = await entity.create(data);
    return { record: created, recovered: false };
  } catch (error) {
    const reconciled = await find();
    if (reconciled?.length === 1) return { record: reconciled[0], recovered: true, ambiguous: true };
    throw error;
  }
}

async function updateRecoverable(entity, query, mutation, reconcile, code) {
  let result;
  let writeError;
  try {
    result = await entity.updateMany(query, mutation);
  } catch (error) {
    writeError = error;
  }
  if (result?.updated === 1) return reconcile();
  const current = await reconcile();
  if (current) return current;
  if (writeError) throw writeError;
  throw new DeliveryCommandError('Una escritura critica cambio concurrentemente.', code, 409);
}

async function loadPrerequisites(base44, orgId, ot) {
  const [activities, diagnostics, sales, quotes, gates, organizations, warranties] = await Promise.all([
    list(base44.asServiceRole.entities.ActividadTecnica, {
      organization_id: orgId, orden_trabajo_id: ot.id, estado: 'en_progreso',
    }),
    list(base44.asServiceRole.entities.DiagnosticoTecnico, { organization_id: orgId, orden_trabajo_id: ot.id }),
    list(base44.asServiceRole.entities.Venta, { organization_id: orgId, referencia_ot_id: ot.id }),
    list(base44.asServiceRole.entities.Cotizacion, { organization_id: orgId, orden_trabajo_id: ot.id }),
    list(base44.asServiceRole.entities.WorkflowGate, { organization_id: orgId, subject_type: 'OrdenTrabajo', subject_id: ot.id }),
    list(base44.asServiceRole.entities.Organization, { id: orgId }, '-created_date', 1),
    list(base44.asServiceRole.entities.Garantia, { organization_id: orgId, origen_tipo: 'OT', origen_id: ot.id }),
  ]);
  if ([activities, diagnostics, sales, quotes, gates, warranties].some(records => records?.length >= DELIVERY_QUERY_LIMIT)) {
    throw new DeliveryCommandError('La validacion critica excedio el limite seguro.', 'DELIVERY_VALIDATION_TRUNCATED', 409);
  }
  const activeActivities = activities.filter(record => record.soft_deleted !== true);
  if (activeActivities.length > 0) {
    throw new DeliveryCommandError(
      'La OT tiene actividades tecnicas activas; deben resolverse antes de entregar.',
      'DELIVERY_ACTIVE_TECHNICAL_ACTIVITY',
      422,
      { activity_ids: activeActivities.map(record => record.id) },
    );
  }
  const applicability = determineWarrantyApplicability(diagnostics);
  const commercial = evaluateCommercialDeliveryGate({ ot, applicability, sales, quotes, workflowGates: gates });
  const config = organizations?.[0]?.garantia_config || null;
  let warrantyTerms = null;
  let warrantyMonths = null;
  if (applicability.applicable) {
    warrantyTerms = String(config?.texto_reparaciones || '').trim();
    warrantyMonths = Number(config?.meses_vigencia_reparaciones);
    if (!warrantyTerms || !Number.isInteger(warrantyMonths) || warrantyMonths < 1 || warrantyMonths > 120) {
      throw new DeliveryCommandError(
        'La configuracion soberana de garantia de reparacion esta incompleta.',
        'DELIVERY_WARRANTY_CONFIG_REQUIRED',
        422,
      );
    }
  }
  return { applicability, commercial, warrantyTerms, warrantyMonths, existingWarranties: warranties };
}

function assertOperationIdentity(ot, operationKey, requestFingerprint) {
  if (ot.delivery_operation_key && ot.delivery_operation_key !== operationKey) {
    if (ot.delivery_status === 'COMMITTED' || ot.estado === 'ENTREGADA') {
      throw new DeliveryCommandError('La OT ya fue entregada por otra operacion.', 'ALREADY_DELIVERED', 409);
    }
    throw new DeliveryCommandError('Otra entrega esta pendiente para esta OT.', 'DELIVERY_OPERATION_IN_PROGRESS', 409);
  }
  if (ot.delivery_request_fingerprint && ot.delivery_request_fingerprint !== requestFingerprint) {
    throw new DeliveryCommandError(
      'La operation key ya fue utilizada con un payload diferente.',
      'DELIVERY_FINGERPRINT_CONFLICT',
      409,
    );
  }
}

async function recoverCommitted(base44, orgId, ot, operationKey, requestFingerprint) {
  assertOperationIdentity(ot, operationKey, requestFingerprint);
  const logs = await list(base44.asServiceRole.entities.EntregaLog, {
    organization_id: orgId, orden_trabajo_id: ot.id, operation_key: operationKey,
  });
  if (logs.length !== 1 || logs[0].delivery_status !== 'COMMITTED' || logs[0].fingerprint !== requestFingerprint) {
    throw new DeliveryCommandError('La entrega comprometida no tiene un EntregaLog valido.', 'DELIVERY_COMMITTED_LOG_INVALID', 409);
  }
  let warranty = null;
  if (ot.delivery_warranty_outcome === 'ISSUED') {
    const warranties = await list(base44.asServiceRole.entities.Garantia, {
      organization_id: orgId, delivery_operation_key: operationKey,
    });
    if (warranties.length !== 1
      || warranties[0].delivery_status !== 'COMMITTED'
      || warranties[0].estado !== 'ACTIVA'
      || warranties[0].source !== 'WORK_ORDER'
      || warranties[0].source_id !== ot.id) {
      throw new DeliveryCommandError('La entrega comprometida no tiene una garantia valida.', 'DELIVERY_COMMITTED_WARRANTY_INVALID', 409);
    }
    warranty = warranties[0];
  } else if (ot.delivery_warranty_outcome !== 'NOT_APPLICABLE') {
    throw new DeliveryCommandError('El resultado de garantia no esta comprometido.', 'DELIVERY_WARRANTY_OUTCOME_INVALID', 409);
  }
  return { ot, delivery_log: logs[0], warranty, idempotent: true, recovered: true };
}

async function emitDeliveryEvent(base44, context, result) {
  try {
    const existing = await list(base44.asServiceRole.entities.OTEvent, {
      organization_id: context.organizationId,
      orden_trabajo_id: result.ot.id,
      tipo: 'ENTREGADA',
      delivery_operation_key: context.operationKey,
    }, '-created_date', 5);
    if (!existing.length) {
      await base44.asServiceRole.entities.OTEvent.create({
        organization_id: context.organizationId,
        orden_trabajo_id: result.ot.id,
        tipo: 'ENTREGADA',
        delivery_operation_key: context.operationKey,
        created_by_user_id: context.actor.id,
        processed: false,
        created_at: result.ot.delivered_at,
      });
    }
    return { event_status: 'READY' };
  } catch (error) {
    console.warn(`[deliverWorkOrder] non_critical_event_failed: ${error.message}`);
    return { event_status: 'PENDING_RETRY', event_error: error.message };
  }
}

async function executeCriticalDelivery(base44, context, normalized, fingerprint, lock) {
  const orgId = context.organizationId;
  let ot = await loadWorkOrder(base44, orgId, normalized.work_order_id);
  if (!ot || ot.lifecycle_lock_token !== lock.token) {
    throw new DeliveryCommandError('No se pudo confirmar la OT bajo el lifecycle lock.', 'LIFECYCLE_LOCK_LOST', 409);
  }
  assertOperationIdentity(ot, normalized.operation_key, fingerprint);

  if (ot.delivery_status === 'COMMITTED') {
    return recoverCommitted(base44, orgId, ot, normalized.operation_key, fingerprint);
  }
  if (ot.estado === 'ENTREGADA' && !ot.delivery_operation_key) {
    throw new DeliveryCommandError(
      'La OT fue entregada por un flujo legacy y requiere auditoria.',
      'DELIVERY_LEGACY_STATE_BLOCKED',
      409,
    );
  }
  if (!['FINALIZADA', 'ENTREGADA'].includes(ot.estado)) {
    throw new DeliveryCommandError(
      `La OT debe estar FINALIZADA. Estado actual: ${ot.estado}.`,
      'DELIVERY_INVALID_STATE',
      422,
    );
  }

  const prerequisites = await loadPrerequisites(base44, orgId, ot);
  const plannedOutcome = ot.delivery_warranty_outcome || prerequisites.applicability.outcome;
  const interventionType = ot.delivery_intervention_type || prerequisites.applicability.intervention_type;
  const commercialSnapshot = ot.delivery_commercial_snapshot || prerequisites.commercial;
  const warrantyTerms = ot.delivery_warranty_terms_snapshot ?? prerequisites.warrantyTerms;
  const warrantyMonths = ot.delivery_warranty_months ?? prerequisites.warrantyMonths;
  if (ot.delivery_status === 'PENDING'
    && (plannedOutcome !== prerequisites.applicability.outcome
      || interventionType !== prerequisites.applicability.intervention_type)) {
    throw new DeliveryCommandError('El contrato tecnico cambio durante recovery.', 'DELIVERY_RECOVERY_CONTRACT_CHANGED', 409);
  }

  let startedAt = ot.delivery_started_at || new Date().toISOString();
  if (!ot.delivery_status) {
    const claimData = {
      delivery_status: 'PENDING',
      delivery_operation_key: normalized.operation_key,
      delivery_request_fingerprint: fingerprint,
      delivery_started_at: startedAt,
      delivery_warranty_outcome: plannedOutcome,
      delivery_intervention_type: interventionType,
      delivery_commercial_snapshot: commercialSnapshot,
      delivery_warranty_terms_snapshot: warrantyTerms,
      delivery_warranty_months: warrantyMonths,
    };
    ot = await updateRecoverable(
      base44.asServiceRole.entities.OrdenTrabajo,
      {
        id: ot.id,
        organization_id: orgId,
        estado: 'FINALIZADA',
        lifecycle_lock_token: lock.token,
        $or: [{ delivery_status: { $exists: false } }, { delivery_status: null }],
      },
      { $set: claimData },
      async () => {
        const current = await loadWorkOrder(base44, orgId, ot.id);
        return current?.delivery_operation_key === normalized.operation_key
          && current?.delivery_request_fingerprint === fingerprint
          ? current : null;
      },
      'DELIVERY_CLAIM_CONCURRENT_UPDATE',
    );
    startedAt = ot.delivery_started_at;
  }

  await renewLifecycleLock(base44, orgId, ot.id, lock);
  const logFind = () => list(base44.asServiceRole.entities.EntregaLog, {
    organization_id: orgId, orden_trabajo_id: ot.id, operation_key: normalized.operation_key,
  });
  const logResult = await createRecoverable(base44.asServiceRole.entities.EntregaLog, {
    organization_id: orgId,
    branch_id: ot.branch_id,
    orden_trabajo_id: ot.id,
    delivered_by_user_id: context.actor.id,
    delivered_by_role: context.role,
    delivered_at: startedAt,
    acceptance: true,
    checkbox_texto_legal: DELIVERY_LEGAL_TEXT,
    nota_entrega: normalized.nota_entrega,
    entrega_con_saldo_pendiente: false,
    operation_key: normalized.operation_key,
    fingerprint,
    delivery_status: 'PENDING',
    delivery_warranty_outcome: plannedOutcome,
    intervention_type: interventionType,
    commercial_snapshot: commercialSnapshot,
  }, logFind, 'DELIVERY_LOG_DUPLICATED');
  let deliveryLog = logResult.record;
  if (deliveryLog.fingerprint !== fingerprint
    || deliveryLog.branch_id !== ot.branch_id
    || deliveryLog.acceptance !== true
    || deliveryLog.checkbox_texto_legal !== DELIVERY_LEGAL_TEXT) {
    throw new DeliveryCommandError('El EntregaLog recuperado no coincide con la operacion.', 'DELIVERY_LOG_CONFLICT', 409);
  }

  await renewLifecycleLock(base44, orgId, ot.id, lock);
  let warranty = null;
  const existingWarranties = prerequisites.existingWarranties;
  if (plannedOutcome === 'ISSUED') {
    if (existingWarranties.length > 1) {
      throw new DeliveryCommandError('Existen garantias OT duplicadas.', 'DELIVERY_WARRANTY_DUPLICATED', 409);
    }
    if (existingWarranties[0]
      && existingWarranties[0].delivery_operation_key !== normalized.operation_key) {
      throw new DeliveryCommandError('Existe una garantia legacy incompatible.', 'DELIVERY_WARRANTY_LEGACY_CONFLICT', 409);
    }
    const issuedDate = utcDate(startedAt);
    const warrantyFind = () => list(base44.asServiceRole.entities.Garantia, {
      organization_id: orgId, delivery_operation_key: normalized.operation_key,
    });
    const warrantyResult = await createRecoverable(base44.asServiceRole.entities.Garantia, {
      organization_id: orgId,
      branch_id: ot.branch_id,
      cliente_id: ot.cliente_id,
      equipo_id: ot.equipo_id || null,
      origen_tipo: 'OT',
      origen_id: ot.id,
      source: 'WORK_ORDER',
      source_id: ot.id,
      source_identity: `WORK_ORDER:${ot.id}`,
      delivery_operation_key: normalized.operation_key,
      delivery_request_fingerprint: fingerprint,
      delivery_status: 'PENDING',
      public_access_token: `gar_${crypto.randomUUID()}`,
      fecha_emision: issuedDate,
      fecha_inicio: issuedDate,
      fecha_fin: addUtcMonths(issuedDate, warrantyMonths),
      estado: 'PENDIENTE_ACTIVACION',
      texto_snapshot: warrantyTerms,
      creado_por: context.actor.id,
    }, warrantyFind, 'DELIVERY_WARRANTY_DUPLICATED');
    warranty = warrantyResult.record;
    if (warranty.delivery_request_fingerprint !== fingerprint
      || warranty.source !== 'WORK_ORDER'
      || warranty.source_id !== ot.id
      || warranty.branch_id !== ot.branch_id) {
      throw new DeliveryCommandError('La garantia recuperada no coincide con la entrega.', 'DELIVERY_WARRANTY_CONFLICT', 409);
    }
  } else if (existingWarranties.length > 0) {
    throw new DeliveryCommandError(
      'La entrega es NOT_APPLICABLE pero ya existe una garantia OT.',
      'DELIVERY_NOT_APPLICABLE_WARRANTY_CONFLICT',
      409,
    );
  }

  await renewLifecycleLock(base44, orgId, ot.id, lock);
  if (ot.estado === 'FINALIZADA') {
    ot = await updateRecoverable(
      base44.asServiceRole.entities.OrdenTrabajo,
      {
        id: ot.id,
        organization_id: orgId,
        estado: 'FINALIZADA',
        delivery_status: 'PENDING',
        delivery_operation_key: normalized.operation_key,
        delivery_request_fingerprint: fingerprint,
        lifecycle_lock_token: lock.token,
      },
      { $set: { estado: 'ENTREGADA', delivered_at: startedAt, ultima_actividad: 'Entrega confirmada', ultima_actividad_at: startedAt } },
      async () => {
        const current = await loadWorkOrder(base44, orgId, ot.id);
        return current?.estado === 'ENTREGADA'
          && current?.delivery_operation_key === normalized.operation_key ? current : null;
      },
      'DELIVERY_WORK_ORDER_CAS_FAILED',
    );
  }

  if (warranty && warranty.delivery_status !== 'COMMITTED') {
    warranty = await updateRecoverable(
      base44.asServiceRole.entities.Garantia,
      {
        id: warranty.id,
        organization_id: orgId,
        delivery_operation_key: normalized.operation_key,
        delivery_status: 'PENDING',
        estado: 'PENDIENTE_ACTIVACION',
      },
      { $set: { delivery_status: 'COMMITTED', estado: 'ACTIVA', activated_at: startedAt } },
      async () => {
        const records = await list(base44.asServiceRole.entities.Garantia, { id: warranty.id, organization_id: orgId }, '-created_date', 1);
        return records[0]?.delivery_status === 'COMMITTED' && records[0]?.estado === 'ACTIVA' ? records[0] : null;
      },
      'DELIVERY_WARRANTY_COMMIT_FAILED',
    );
  }

  if (deliveryLog.delivery_status !== 'COMMITTED') {
    deliveryLog = await updateRecoverable(
      base44.asServiceRole.entities.EntregaLog,
      {
        id: deliveryLog.id,
        organization_id: orgId,
        operation_key: normalized.operation_key,
        fingerprint,
        delivery_status: 'PENDING',
      },
      { $set: { delivery_status: 'COMMITTED', warranty_id: warranty?.id || null } },
      async () => {
        const records = await list(base44.asServiceRole.entities.EntregaLog, { id: deliveryLog.id, organization_id: orgId }, '-created_date', 1);
        return records[0]?.delivery_status === 'COMMITTED' ? records[0] : null;
      },
      'DELIVERY_LOG_COMMIT_FAILED',
    );
  }

  const committedAt = new Date().toISOString();
  ot = await updateRecoverable(
    base44.asServiceRole.entities.OrdenTrabajo,
    {
      id: ot.id,
      organization_id: orgId,
      estado: 'ENTREGADA',
      delivery_status: 'PENDING',
      delivery_operation_key: normalized.operation_key,
      delivery_request_fingerprint: fingerprint,
      lifecycle_lock_token: lock.token,
    },
    {
      $set: {
        delivery_status: 'COMMITTED',
        delivery_committed_at: committedAt,
        delivery_log_id: deliveryLog.id,
        delivery_warranty_id: warranty?.id || null,
        delivery_warranty_outcome: plannedOutcome,
      },
      $unset: { delivery_error: '' },
    },
    async () => {
      const current = await loadWorkOrder(base44, orgId, ot.id);
      return current?.delivery_status === 'COMMITTED'
        && current?.delivery_log_id === deliveryLog.id
        && current?.delivery_warranty_outcome === plannedOutcome ? current : null;
    },
    'DELIVERY_COMMIT_FAILED',
  );
  return { ot, delivery_log: deliveryLog, warranty, idempotent: false, recovered: logResult.recovered };
}

export async function executeDeliveryCommand(base44, context, input) {
  const normalized = normalizeDeliveryRequest(input);
  const requestFingerprint = await fingerprintDeliveryRequest(normalized);
  const initial = await loadWorkOrder(base44, context.organizationId, normalized.work_order_id);
  if (!initial) throw new DeliveryCommandError('Orden de trabajo no encontrada.', 'DELIVERY_WORK_ORDER_NOT_FOUND', 404);
  if (initial.organization_id !== context.organizationId) {
    throw new DeliveryCommandError('La OT pertenece a otra organizacion.', 'DELIVERY_CROSS_ORGANIZATION_DENIED', 403);
  }
  if (typeof context.authorizeBranch === 'function') context.authorizeBranch(initial.branch_id);

  const lock = await acquireLifecycleLock({
    base44,
    ot: initial,
    orgId: context.organizationId,
    effectiveUser: context.actor,
    operation: 'deliverWorkOrder',
  });
  if (!lock.acquired) {
    throw new DeliveryCommandError(
      'Otra operacion del lifecycle esta en progreso.',
      lock.code || 'LIFECYCLE_OPERATION_IN_PROGRESS',
      409,
      { retryable: true, operation: lock.operation || null },
    );
  }

  let result;
  try {
    result = await executeCriticalDelivery(base44, context, normalized, requestFingerprint, lock);
  } catch (error) {
    try {
      await base44.asServiceRole.entities.OrdenTrabajo.updateMany({
        id: normalized.work_order_id,
        organization_id: context.organizationId,
        delivery_status: 'PENDING',
        delivery_operation_key: normalized.operation_key,
        lifecycle_lock_token: lock.token,
      }, { $set: { delivery_error: String(error?.code || error?.message || 'DELIVERY_FAILED').slice(0, 500) } });
    } catch {
      // El error original es soberano; este marcador es solo observabilidad.
    }
    throw error;
  } finally {
    try {
      await releaseLifecycleLock(base44, context.organizationId, normalized.work_order_id, lock);
    } catch (releaseError) {
      // El protocolo compartido recupera locks vencidos. Un fallo de limpieza
      // no debe ocultar el resultado soberano de la entrega ni su error real.
      console.error('No fue posible liberar el lifecycle lock de entrega', releaseError);
    }
  }

  const sideEffects = await emitDeliveryEvent(base44, {
    ...context,
    operationKey: normalized.operation_key,
  }, result);
  return {
    success: true,
    operation_key: normalized.operation_key,
    request_fingerprint: requestFingerprint,
    idempotent: result.idempotent,
    recovered: result.recovered,
    work_order: result.ot,
    delivery_log: result.delivery_log,
    warranty: result.warranty,
    warranty_outcome: result.ot.delivery_warranty_outcome,
    non_critical_side_effects: sideEffects,
  };
}
