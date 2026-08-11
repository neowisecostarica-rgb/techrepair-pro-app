import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveAuthorizedContext, resolveIdentitySnapshot } from '../_shared/userAuthorization.ts';
import {
  authorizeOperationalAction,
  pickAllowedFields,
  recordIsInsideBranchScope,
  sanitizeOperationalFilter,
  sanitizeOperationalMutation,
  validateRequestedBranch,
  WORK_ORDER_EDITABLE_FIELDS,
} from '../_shared/operationalAuthorization.ts';
import { calculateCommercialTotals } from '../_shared/commercialIntegrity.ts';

const MAX_QUERY_LIMIT = 500;
const QUOTE_APPROVAL_FIELDS = new Set([
  'aprobada_por', 'aprobada_at', 'aprobacion_interna_status', 'aprobacion_interna_motivo',
]);
const QUOTE_CONVERSION_FIELDS = new Set([
  'estado_conversion', 'venta_id', 'convertida_at', 'convertida_por',
]);
const QUOTE_CONTENT_FIELDS = new Set(['items', 'subtotal', 'descuento_total', 'impuesto', 'total']);
const MAX_DISCOUNT_WITHOUT_APPROVAL = 20;

function fail(error, status = 400, code = 'OPERATIONAL_REQUEST_INVALID') {
  return Response.json({ error, code }, { status });
}

function cleanId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function findOne(entity, query) {
  const records = await entity.filter(query, '-created_date', 1);
  return records?.[0] || null;
}

async function normalizeQuoteItems(base44, organizationId, branchId, items) {
  const normalized = [];
  for (const [index, raw] of (items || []).entries()) {
    if (raw.referencia_id && raw.item_id && raw.referencia_id !== raw.item_id) {
      throw new Error(`Item ${index + 1}: referencias de catalogo en conflicto`);
    }
    const referenceId = cleanId(raw.referencia_id || raw.item_id);
    const { item_id: _legacyItemId, ...item } = raw;
    if (['producto', 'repuesto'].includes(item.tipo)) {
      if (!referenceId) throw new Error(`Item ${index + 1}: referencia de inventario requerida`);
      const inventory = await findOne(base44.asServiceRole.entities.Inventario, {
        id: referenceId,
        organization_id: organizationId,
        branch_id: branchId,
      });
      if (!inventory) throw new Error(`Item ${index + 1}: producto no existe en la sucursal`);
    }
    normalized.push({ ...item, ...(referenceId ? { referencia_id: referenceId } : {}) });
  }
  return normalized;
}

async function resolveAuthorization(base44, user, body) {
  const identity = await resolveIdentitySnapshot(base44, user);
  if (!identity.ok) return identity;
  const sovereignIdentity = identity.user;

  // Built-in sovereign admins retain global read authority. Tenant mutations
  // still require an active impersonation selected by TRP-SEC-006.
  if (identity.isSuperAdmin && !sovereignIdentity.impersonating_org_id) {
    if (body.operation !== 'read') {
      return { ok: false, status: 403, error: 'Inicia una impersonacion autorizada para modificar datos operacionales' };
    }
    return {
      ok: true,
      organizationId: cleanId(body.organization_id || body.filter?.organization_id),
      role: 'ORG_ADMIN',
      account: null,
      isSuperAdmin: true,
      isPlatformGlobal: true,
    };
  }

  return resolveAuthorizedContext(base44, user, {
    organizationHint: cleanId(body.organization_id || body.filter?.organization_id),
  });
}

async function loadWorkOrder(base44, organizationId, workOrderId) {
  if (!workOrderId) return null;
  return findOne(base44.asServiceRole.entities.OrdenTrabajo, {
    id: workOrderId,
    organization_id: organizationId,
  });
}

async function loadSale(base44, organizationId, saleId) {
  if (!saleId) return null;
  return findOne(base44.asServiceRole.entities.Venta, {
    id: saleId,
    organization_id: organizationId,
  });
}

async function loadInventory(base44, organizationId, inventoryId) {
  if (!inventoryId) return null;
  return findOne(base44.asServiceRole.entities.Inventario, {
    id: inventoryId,
    organization_id: organizationId,
  });
}

async function loadPurchaseInvoice(base44, organizationId, invoiceId) {
  if (!invoiceId) return null;
  return findOne(base44.asServiceRole.entities.PurchaseInvoice, {
    id: invoiceId,
    organization_id: organizationId,
  });
}

async function resolveRecordBranchIds(base44, organizationId, entityName, record, scope) {
  if (!record) return [];
  if (scope === 'organization') return [];
  if (entityName === 'Branch') return [record.id];
  if (record.branch_id) return [record.branch_id];

  if (scope === 'work_order' || scope === 'work_order_optional') {
    const ot = await loadWorkOrder(base44, organizationId, record.orden_trabajo_id);
    return ot?.branch_id ? [ot.branch_id] : [];
  }
  if (scope === 'diagnostic_document') {
    const diagnosticId = record.diagnostico_id || record.diagnostico_tecnico_id;
    const technical = diagnosticId
      ? await findOne(base44.asServiceRole.entities.DiagnosticoTecnico, { id: diagnosticId, organization_id: organizationId })
      : null;
    const legacy = !technical && diagnosticId
      ? await findOne(base44.asServiceRole.entities.Diagnostico, { id: diagnosticId, organization_id: organizationId })
      : null;
    const ot = await loadWorkOrder(base44, organizationId, technical?.orden_trabajo_id || legacy?.orden_trabajo_id);
    return ot?.branch_id ? [ot.branch_id] : [];
  }
  if (scope === 'quote') {
    const ot = await loadWorkOrder(base44, organizationId, record.orden_trabajo_id);
    return ot?.branch_id ? [ot.branch_id] : [];
  }
  if (scope === 'sale') {
    const sale = await loadSale(base44, organizationId, record.venta_id || record.sale_id);
    return sale?.branch_id ? [sale.branch_id] : [];
  }
  if (scope === 'warranty') {
    const origin = record.origen_tipo === 'OT'
      ? await loadWorkOrder(base44, organizationId, record.origen_id)
      : await loadSale(base44, organizationId, record.origen_id);
    return origin?.branch_id ? [origin.branch_id] : [];
  }
  if (scope === 'inventory_history') {
    const inventory = await loadInventory(base44, organizationId, record.inventario_id);
    return inventory?.branch_id ? [inventory.branch_id] : [];
  }
  if (scope === 'purchase_invoice') {
    const invoice = await loadPurchaseInvoice(base44, organizationId, record.purchase_invoice_id);
    return invoice?.branch_id ? [invoice.branch_id] : [];
  }
  if (scope === 'notification') {
    const workOrder = await loadWorkOrder(base44, organizationId, record.referencia_ot_id);
    return workOrder?.branch_id ? [workOrder.branch_id] : [];
  }
  if (scope === 'workflow_gate') {
    const workOrder = record.subject_type === 'OrdenTrabajo'
      ? await loadWorkOrder(base44, organizationId, record.subject_id)
      : null;
    return workOrder?.branch_id ? [workOrder.branch_id] : [];
  }
  if (scope === 'customer') {
    const [orders, sales] = await Promise.all([
      base44.asServiceRole.entities.OrdenTrabajo.filter({ organization_id: organizationId, cliente_id: record.id }, '-created_date', 100),
      base44.asServiceRole.entities.Venta.filter({ organization_id: organizationId, cliente_id: record.id }, '-created_date', 100),
    ]);
    return [...new Set([...(orders || []).map(item => item.branch_id), ...(sales || []).map(item => item.branch_id)].filter(Boolean))];
  }
  if (scope === 'equipment') {
    const orders = await base44.asServiceRole.entities.OrdenTrabajo.filter({
      organization_id: organizationId,
      equipo_id: record.id,
    }, '-created_date', 100);
    return [...new Set((orders || []).map(item => item.branch_id).filter(Boolean))];
  }
  return [];
}

async function validateRecordScope(base44, authorization, decision, entityName, record) {
  if (authorization.isPlatformGlobal || decision.branchScope.organizationWide || decision.policy.scope === 'organization') {
    return { ok: true };
  }
  const branchIds = await resolveRecordBranchIds(
    base44,
    authorization.organizationId,
    entityName,
    record,
    decision.policy.scope,
  );
  if (!recordIsInsideBranchScope(decision.branchScope, branchIds)) {
    return {
      ok: false,
      status: 403,
      code: 'OPERATIONAL_CROSS_BRANCH_DENIED',
      error: 'El recurso no pertenece a la sucursal autorizada',
    };
  }
  return { ok: true };
}

async function assertBranchExists(base44, organizationId, branchId) {
  if (!branchId) return false;
  const branch = await findOne(base44.asServiceRole.entities.Branch, {
    id: branchId,
    organization_id: organizationId,
  });
  return Boolean(branch?.active !== false);
}

async function determineCreateBranch(base44, authorization, decision, entityName, data) {
  if (decision.policy.scope === 'organization') return { ok: true, branchId: null };
  if (entityName === 'Branch') return { ok: true, branchId: null };
  let parentBranchId = null;
  if (data.orden_trabajo_id) {
    const parentWorkOrder = await loadWorkOrder(base44, authorization.organizationId, data.orden_trabajo_id);
    if (!parentWorkOrder) return { ok: false, status: 404, error: 'Orden de trabajo relacionada no encontrada' };
    parentBranchId = parentWorkOrder.branch_id || null;
  }
  if (entityName === 'Garantia' && data.origen_id) {
    const origin = data.origen_tipo === 'OT'
      ? await loadWorkOrder(base44, authorization.organizationId, data.origen_id)
      : await loadSale(base44, authorization.organizationId, data.origen_id);
    if (!origin) return { ok: false, status: 404, error: 'Origen de garantia no encontrado' };
    parentBranchId = origin.branch_id || null;
  }
  if (entityName === 'SupplierPayment' && data.purchase_invoice_id) {
    const invoice = await loadPurchaseInvoice(base44, authorization.organizationId, data.purchase_invoice_id);
    if (!invoice) return { ok: false, status: 404, error: 'Factura de compra relacionada no encontrada' };
    parentBranchId = invoice.branch_id || null;
  }
  if (entityName === 'Notificacion' && data.referencia_ot_id) {
    const workOrder = await loadWorkOrder(base44, authorization.organizationId, data.referencia_ot_id);
    if (!workOrder) return { ok: false, status: 404, error: 'OT relacionada con la notificacion no encontrada' };
    parentBranchId = workOrder.branch_id || null;
  }
  if (!decision.branchScope.organizationWide) {
    const branchCheck = validateRequestedBranch(decision.branchScope, cleanId(data.branch_id));
    if (!branchCheck.ok) return branchCheck;
    if (entityName === 'SupplierPayment' && !parentBranchId) {
      return { ok: false, status: 403, code: 'OPERATIONAL_CROSS_BRANCH_DENIED', error: 'La factura relacionada no tiene una sucursal autorizada' };
    }
    if (parentBranchId !== null && parentBranchId !== decision.branchScope.branchId) {
      return { ok: false, status: 403, code: 'OPERATIONAL_CROSS_BRANCH_DENIED', error: 'El recurso relacionado pertenece a otra sucursal' };
    }
    return { ok: true, branchId: decision.branchScope.branchId };
  }

  let branchId = cleanId(data.branch_id) || parentBranchId;
  if (!branchId && data.orden_trabajo_id) {
    branchId = (await loadWorkOrder(base44, authorization.organizationId, data.orden_trabajo_id))?.branch_id || null;
  }
  if (!branchId && data.venta_id) {
    branchId = (await loadSale(base44, authorization.organizationId, data.venta_id))?.branch_id || null;
  }
  if (!branchId && entityName === 'Cita' && data.tecnico_asignado_id) {
    const accounts = await base44.asServiceRole.entities.UserAccount.filter({
      organization_id: authorization.organizationId,
      user_id: data.tecnico_asignado_id,
      status: 'active',
    }, '-created_date', 5);
    branchId = accounts?.[0]?.branch_id || null;
  }
  if (!branchId) {
    const branches = await base44.asServiceRole.entities.Branch.filter({
      organization_id: authorization.organizationId,
      active: true,
    }, '-created_date', 2);
    if (branches?.length === 1) branchId = branches[0].id;
  }
  const organizationWideOptional = ['Cliente', 'Equipo', 'Expense', 'PurchaseInvoice', 'Notificacion', 'SupplierPayment'].includes(entityName);
  if (!organizationWideOptional && !branchId) {
    return { ok: false, status: 400, code: 'OPERATIONAL_BRANCH_REQUIRED', error: 'La operacion requiere una sucursal valida' };
  }
  if (branchId && !await assertBranchExists(base44, authorization.organizationId, branchId)) {
    return { ok: false, status: 400, code: 'OPERATIONAL_BRANCH_INVALID', error: 'La sucursal no es valida o esta inactiva' };
  }
  return { ok: true, branchId };
}

function requestedBranch(body) {
  return cleanId(body.branch_id || body.filter?.branch_id || body.data?.branch_id);
}

async function handleRead(base44, authorization, decision, body) {
  const entityName = body.entity;
  const entity = base44.asServiceRole.entities[entityName];
  const branchCheck = authorization.isPlatformGlobal
    ? { ok: true }
    : validateRequestedBranch(decision.branchScope, requestedBranch(body));
  if (!branchCheck.ok) return branchCheck;

  const filter = sanitizeOperationalFilter(body.filter || {});
  if (authorization.organizationId) filter.organization_id = authorization.organizationId;
  const requested = requestedBranch(body);
  const directBranchScope = ['branch'].includes(decision.policy.scope) && entityName !== 'Branch';
  if (!authorization.isPlatformGlobal && directBranchScope) {
    if (!decision.branchScope.organizationWide) filter.branch_id = decision.branchScope.branchId;
    else if (requested) filter.branch_id = requested;
  }

  const limit = Math.min(Math.max(Number(body.limit) || 100, 1), MAX_QUERY_LIMIT);
  const fetchLimit = directBranchScope || decision.policy.scope === 'organization' ? limit : MAX_QUERY_LIMIT;
  const records = body.method === 'list'
    ? await entity.list(body.sort || '-created_date', fetchLimit)
    : await entity.filter(filter, body.sort || '-created_date', fetchLimit);

  if (authorization.isPlatformGlobal || (decision.branchScope.organizationWide && !requested) || decision.policy.scope === 'organization') {
    return { ok: true, records: (records || []).slice(0, limit) };
  }

  const effectiveBranchId = requested || decision.branchScope.branchId;
  const effectiveScope = { organizationWide: false, branchId: effectiveBranchId };
  const scoped = [];
  for (const record of records || []) {
    const branchIds = await resolveRecordBranchIds(
      base44,
      authorization.organizationId,
      entityName,
      record,
      decision.policy.scope,
    );
    if (recordIsInsideBranchScope(effectiveScope, branchIds)) scoped.push(record);
    if (scoped.length >= limit) break;
  }
  return { ok: true, records: scoped };
}

async function validateMutationContext(base44, authorization, decision, entityName, operation, current, data) {
  if (current) {
    const scope = await validateRecordScope(base44, authorization, decision, entityName, current);
    if (!scope.ok) return scope;
  }

  if (entityName === 'OrdenTrabajo') {
    if (operation !== 'update') return { ok: false, status: 403, error: 'La OT solo puede crearse o cambiar lifecycle mediante sus gateways dedicados' };
    return { ok: true, data: pickAllowedFields(data, WORK_ORDER_EDITABLE_FIELDS) };
  }

  if (entityName === 'Venta') {
    if (operation === 'create' && data.estado !== 'borrador') {
      return { ok: false, status: 403, error: 'Las ventas pagadas solo pueden crearse mediante createSale' };
    }
    if (operation === 'delete' && !['borrador', 'procesando', 'inconsistente'].includes(current?.estado)) {
      return { ok: false, status: 403, error: 'Una venta confirmada no puede eliminarse' };
    }
  }

  if (entityName === 'VentaItem' && operation === 'create') {
    const sale = await loadSale(base44, authorization.organizationId, data.venta_id);
    if (!sale || sale.estado !== 'borrador') return { ok: false, status: 403, error: 'Los items directos solo se admiten para una venta borrador autorizada' };
    const saleScope = await validateRecordScope(base44, authorization, { ...decision, policy: { ...decision.policy, scope: 'sale' } }, 'VentaItem', { venta_id: sale.id });
    if (!saleScope.ok) return saleScope;
  }

  if (entityName === 'Cotizacion' && ['create', 'update'].includes(operation)) {
    const keys = Object.keys(data);
    const touchesApproval = keys.some(key => QUOTE_APPROVAL_FIELDS.has(key));
    const touchesConversion = keys.some(key => QUOTE_CONVERSION_FIELDS.has(key));
    const touchesContent = keys.some(key => QUOTE_CONTENT_FIELDS.has(key));
    if (operation === 'create') {
      if (data.estado !== undefined && data.estado !== 'borrador') {
        return { ok: false, status: 403, error: 'Una cotizacion nueva siempre inicia en borrador' };
      }
      if (touchesApproval || touchesConversion) {
        return { ok: false, status: 403, error: 'Una cotizacion nueva no puede nacer aprobada o convertida' };
      }
    }
    if (touchesApproval && authorization.role !== 'ORG_ADMIN') {
      return { ok: false, status: 403, error: 'Solo ORG_ADMIN puede registrar la aprobacion interna' };
    }
    if (data.aprobacion_interna_status
      && !['APROBADA', 'RECHAZADA'].includes(data.aprobacion_interna_status)) {
      return { ok: false, status: 422, error: 'Decision interna de cotizacion no valida' };
    }
    if (['aprobada', 'rechazada', 'vencida'].includes(data.estado)) {
      return { ok: false, status: 403, error: 'El estado final del cliente solo puede registrarse mediante el lifecycle publico gobernado' };
    }
    if (operation === 'update' && data.estado !== undefined) {
      const allowedStateChange = current?.estado === 'borrador' && ['borrador', 'enviada'].includes(data.estado);
      if (!allowedStateChange) return { ok: false, status: 403, error: 'Este estado de cotizacion requiere su gateway de lifecycle' };
    }
    if (touchesConversion) {
      return { ok: false, status: 403, error: 'La conversion de cotizacion solo puede materializarse mediante createSale' };
    }
    if (operation === 'update' && current?.estado !== 'borrador' && touchesContent) {
      return { ok: false, status: 409, error: 'El contenido comercial no puede editarse despues del envio' };
    }

    if (operation === 'create' || touchesContent || data.estado === 'enviada') {
      try {
        let quoteBranchId = data.branch_id || current?.branch_id || null;
        if (!quoteBranchId && (data.orden_trabajo_id || current?.orden_trabajo_id)) {
          const quoteWorkOrder = await loadWorkOrder(
            base44, authorization.organizationId, data.orden_trabajo_id || current?.orden_trabajo_id,
          );
          quoteBranchId = quoteWorkOrder?.branch_id || null;
        }
        if (!quoteBranchId && !decision.branchScope.organizationWide) quoteBranchId = decision.branchScope.branchId;
        if (!quoteBranchId) {
          const branches = await base44.asServiceRole.entities.Branch.filter({
            organization_id: authorization.organizationId,
            active: true,
          }, '-created_date', 2);
          if (branches?.length === 1) quoteBranchId = branches[0].id;
        }
        const canonicalItems = await normalizeQuoteItems(
          base44, authorization.organizationId, quoteBranchId, data.items || current?.items || [],
        );
        const calculated = calculateCommercialTotals(canonicalItems);
        data.items = calculated.items;
        data.subtotal = calculated.subtotal;
        data.descuento_total = calculated.descuento_total;
        data.impuesto = calculated.impuesto;
        data.total = calculated.total;
        data.requiere_aprobacion = calculated.items.some(
          item => Number(item.descuento_porcentaje || 0) > MAX_DISCOUNT_WITHOUT_APPROVAL,
        );
        if (operation === 'update' && touchesContent) {
          data.aprobada_por = null;
          data.aprobada_at = null;
          data.aprobacion_interna_status = data.requiere_aprobacion ? 'PENDIENTE' : null;
          data.aprobacion_interna_motivo = null;
        }
        if (data.estado === 'enviada' && data.requiere_aprobacion && !current?.aprobada_por) {
          return { ok: false, status: 409, error: 'La cotizacion requiere aprobacion interna antes del envio' };
        }
      } catch (error) {
        return { ok: false, status: 422, error: error.message || 'Contenido comercial invalido' };
      }
    }
  }

  if (entityName === 'Notificacion' && operation === 'update' && !['ORG_ADMIN', 'BRANCH_ADMIN'].includes(authorization.role)) {
    const actorId = authorization.identity?.user?.id;
    const roleTargetMatches = !current?.role_target
      || current.role_target === authorization.role
      || (current.role_target === 'CASHIER' && authorization.role === 'SALES');
    if ((current?.user_id && current.user_id !== actorId) || !roleTargetMatches) {
      return { ok: false, status: 403, error: 'La notificacion no pertenece al usuario o rol autorizado' };
    }
    return { ok: true, data: pickAllowedFields(data, ['estado']) };
  }

  if (authorization.role === 'TECHNICIAN') {
    const workOrderId = current?.orden_trabajo_id || data.orden_trabajo_id || null;
    if (workOrderId && !['Cita'].includes(entityName)) {
      const assignedWorkOrder = await loadWorkOrder(base44, authorization.organizationId, workOrderId);
      if (!assignedWorkOrder || assignedWorkOrder.tecnico_asignado_id !== authorization.identity?.user?.id) {
        return { ok: false, status: 403, error: 'El tecnico solo puede operar su OT asignada' };
      }
    }
    if (entityName === 'ActividadTecnica' && current && current.tecnico_id !== authorization.identity?.user?.id && current.tecnico_asignado_id !== authorization.identity?.user?.id) {
      return { ok: false, status: 403, error: 'El tecnico solo puede modificar su propia actividad' };
    }
    if (entityName === 'Cita') {
      const technicianId = current?.tecnico_asignado_id || data.tecnico_asignado_id;
      if (technicianId !== authorization.identity?.user?.id) {
        return { ok: false, status: 403, error: 'El tecnico solo puede modificar sus propias citas' };
      }
    }
  }

  return { ok: true, data };
}

async function handleMutation(base44, user, authorization, decision, body) {
  const entityName = body.entity;
  const operation = body.operation;
  const entity = base44.asServiceRole.entities[entityName];
  const id = cleanId(body.id);
  const branchCheck = validateRequestedBranch(decision.branchScope, requestedBranch(body));
  if (!branchCheck.ok) return branchCheck;

  if (operation === 'delete' && entityName === 'Notificacion' && !id && body.filter) {
    const filter = sanitizeOperationalFilter(body.filter);
    filter.organization_id = authorization.organizationId;
    const records = await entity.filter(filter, '-created_date', MAX_QUERY_LIMIT);
    for (const record of records || []) await entity.delete(record.id);
    return { ok: true, record: { deleted: records?.length || 0 } };
  }

  let current = null;
  if (operation !== 'create') {
    if (!id) return { ok: false, status: 400, error: 'id requerido' };
    current = await findOne(entity, { id, organization_id: authorization.organizationId });
    if (!current) return { ok: false, status: 404, error: 'Recurso no encontrado' };
  }

  let data = sanitizeOperationalMutation(body.data || {});
  const requestedQuoteApproval = entityName === 'Cotizacion'
    && Object.keys(data).some(key => QUOTE_APPROVAL_FIELDS.has(key));
  const context = await validateMutationContext(base44, authorization, decision, entityName, operation, current, data);
  if (!context.ok) return context;
  data = context.data || data;

  if (entityName === 'Cotizacion' && operation === 'update') {
    if (requestedQuoteApproval) {
      if (data.aprobacion_interna_status === 'RECHAZADA') {
        data.aprobada_por = null;
        data.aprobada_at = null;
        data.aprobacion_interna_motivo = String(data.aprobacion_interna_motivo || '').trim().slice(0, 500) || null;
      } else {
        data.aprobacion_interna_status = 'APROBADA';
        data.aprobacion_interna_motivo = null;
        data.aprobada_por = user.id;
        data.aprobada_at = new Date().toISOString();
      }
    }
    if (data.estado === 'enviada') {
      const sentAt = new Date().toISOString();
      const expiry = current?.valida_hasta
        ? new Date(`${current.valida_hasta}T23:59:59.999Z`).toISOString()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const envio = {
        canal: data.ultimo_envio?.canal || 'link',
        fecha: sentAt,
        enviado_por: user.id,
        enviado_por_nombre: user.full_name || user.email,
      };
      data.enviada_at = sentAt;
      data.ultimo_envio = envio;
      data.historial_envios = [...(current?.historial_envios || []), envio];
      data.public_access_token = current?.public_access_token || `cot_${crypto.randomUUID()}`;
      data.public_access_expires_at = current?.public_access_expires_at || expiry;
    }
  }

  if (operation === 'create') {
    const createScope = await determineCreateBranch(base44, authorization, decision, entityName, body.data || {});
    if (!createScope.ok) return createScope;
    const actorId = user.id;
    data.organization_id = authorization.organizationId;
    if (createScope.branchId && ['branch', 'quote', 'warranty', 'customer', 'equipment', 'work_order_optional', 'notification', 'purchase_invoice'].includes(decision.policy.scope)) {
      data.branch_id = createScope.branchId;
    }
    if (entityName === 'Cotizacion') {
      data.estado = 'borrador';
      data.estado_conversion = 'SIN_CONVERTIR';
      data.aprobacion_interna_status = data.requiere_aprobacion ? 'PENDIENTE' : null;
      data.vendedor_id = actorId;
      data.vendedor_nombre = user.full_name || user.email;
    }
    if (entityName === 'Venta') data.created_by_user_id = actorId;
    if (['Expense', 'PurchaseInvoice', 'SupplierPayment'].includes(entityName)) data.created_by = actorId;
    if (entityName === 'NoConformidad') data.reportado_por = actorId;
    if (entityName === 'Cita') {
      data.created_by_user_id = actorId;
      data.created_by_role = authorization.role;
    }
    if (['ActividadTecnica', 'RegistroTiempo'].includes(entityName) && authorization.role === 'TECHNICIAN') {
      data.tecnico_id = actorId;
    }
    if (entityName === 'Garantia') data.creado_por = actorId;
    if (entityName === 'EntregaLog') {
      data.delivered_by_user_id = actorId;
      data.delivered_by_role = authorization.role;
    }
    const created = await entity.create(data);
    return { ok: true, record: created };
  }

  if (operation === 'update') {
    const updated = await entity.update(id, data);
    return { ok: true, record: updated };
  }

  if (operation === 'delete') {
    await entity.delete(id);
    return { ok: true, record: { id, deleted: true } };
  }

  return { ok: false, status: 400, error: 'Operacion no soportada' };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return fail('Metodo no permitido', 405, 'METHOD_NOT_ALLOWED');
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return fail('No autenticado', 401, 'UNAUTHENTICATED');
    const body = await req.json();
    const operation = body.operation;
    if (!['read', 'create', 'update', 'delete'].includes(operation)) return fail('Operacion no soportada');

    const authorization = await resolveAuthorization(base44, user, body);
    if (!authorization.ok) return fail(authorization.error, authorization.status, authorization.code || 'OPERATIONAL_AUTH_DENIED');
    const decision = authorizeOperationalAction(authorization, body.entity, operation);
    if (!decision.ok) return fail(decision.error, decision.status, decision.code);

    const result = operation === 'read'
      ? await handleRead(base44, authorization, decision, body)
      : await handleMutation(base44, user, authorization, decision, body);
    if (!result.ok) return fail(result.error, result.status, result.code);
    return Response.json(operation === 'read' ? { records: result.records } : result.record);
  } catch (error) {
    console.error('[operationalGateway]', error?.message || error);
    return fail('No fue posible completar la operacion operacional', 500, 'OPERATIONAL_INTERNAL_ERROR');
  }
});
