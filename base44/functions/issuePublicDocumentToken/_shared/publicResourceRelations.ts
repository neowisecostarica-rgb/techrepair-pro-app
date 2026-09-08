async function exactlyOne(entity, query) {
  const rows = await entity.filter(query, '-created_date', 2);
  return rows?.length === 1 ? rows[0] : null;
}

function deny(code) {
  return { ok: false, code };
}

/**
 * Resolve every relation reachable from a public bearer inside the bearer
 * resource's canonical organization. Callers must fail closed on `ok: false`.
 */
export async function resolvePublicResourceRelations(base44, { type, record }) {
  const organizationId = record?.organization_id || null;
  if (!organizationId) return deny('PUBLIC_RESOURCE_ORGANIZATION_REQUIRED');
  const organization = await exactlyOne(base44.asServiceRole.entities.Organization, { id: organizationId });
  if (!organization) return deny('PUBLIC_RESOURCE_ORGANIZATION_INVALID');

  if (type === 'quote') {
    const client = record.cliente_id
      ? await exactlyOne(base44.asServiceRole.entities.Cliente, {
          id: record.cliente_id,
          organization_id: organizationId,
        })
      : null;
    if (!client) return deny('PUBLIC_QUOTE_CLIENT_INVALID');
    const workOrder = record.orden_trabajo_id
      ? await exactlyOne(base44.asServiceRole.entities.OrdenTrabajo, {
          id: record.orden_trabajo_id,
          organization_id: organizationId,
        })
      : null;
    if (record.orden_trabajo_id && !workOrder) return deny('PUBLIC_QUOTE_WORK_ORDER_INVALID');
    if (workOrder && workOrder.cliente_id !== client.id) return deny('PUBLIC_QUOTE_CLIENT_RELATIONSHIP_INVALID');
    if (workOrder && record.branch_id && workOrder.branch_id !== record.branch_id) return deny('PUBLIC_QUOTE_BRANCH_RELATIONSHIP_INVALID');
    const equipment = workOrder?.equipo_id
      ? await exactlyOne(base44.asServiceRole.entities.Equipo, {
          id: workOrder.equipo_id,
          organization_id: organizationId,
        })
      : null;
    if (workOrder?.equipo_id && !equipment) return deny('PUBLIC_QUOTE_EQUIPMENT_INVALID');
    if (equipment && equipment.cliente_id !== client.id) return deny('PUBLIC_QUOTE_EQUIPMENT_RELATIONSHIP_INVALID');
    return { ok: true, organization, client, workOrder, equipment };
  }

  if (type === 'warranty') {
    const client = record.cliente_id
      ? await exactlyOne(base44.asServiceRole.entities.Cliente, {
          id: record.cliente_id,
          organization_id: organizationId,
        })
      : null;
    if (!client) return deny('PUBLIC_WARRANTY_CLIENT_INVALID');
    const originEntity = record.origen_tipo === 'OT'
      ? base44.asServiceRole.entities.OrdenTrabajo
      : record.origen_tipo === 'VENTA'
        ? base44.asServiceRole.entities.Venta
        : null;
    if (!originEntity || !record.origen_id) return deny('PUBLIC_WARRANTY_ORIGIN_INVALID');
    const origin = await exactlyOne(originEntity, {
      id: record.origen_id,
      organization_id: organizationId,
    });
    if (!origin) return deny('PUBLIC_WARRANTY_ORIGIN_INVALID');
    if (origin.cliente_id !== client.id) return deny('PUBLIC_WARRANTY_CLIENT_RELATIONSHIP_INVALID');
    if (record.branch_id && origin.branch_id && record.branch_id !== origin.branch_id) return deny('PUBLIC_WARRANTY_BRANCH_RELATIONSHIP_INVALID');
    const equipmentId = record.equipo_id || (record.origen_tipo === 'OT' ? origin.equipo_id : null);
    const equipment = equipmentId
      ? await exactlyOne(base44.asServiceRole.entities.Equipo, { id: equipmentId, organization_id: organizationId })
      : null;
    if (equipmentId && !equipment) return deny('PUBLIC_WARRANTY_EQUIPMENT_INVALID');
    if (equipment && equipment.cliente_id !== client.id) return deny('PUBLIC_WARRANTY_EQUIPMENT_RELATIONSHIP_INVALID');
    return { ok: true, organization, client, origin, equipment };
  }

  if (type === 'receipt') {
    const client = record.cliente_id
      ? await exactlyOne(base44.asServiceRole.entities.Cliente, {
          id: record.cliente_id,
          organization_id: organizationId,
        })
      : null;
    if (record.cliente_id && !client) return deny('PUBLIC_RECEIPT_CLIENT_INVALID');
    const workOrder = record.referencia_ot_id
      ? await exactlyOne(base44.asServiceRole.entities.OrdenTrabajo, {
          id: record.referencia_ot_id,
          organization_id: organizationId,
        })
      : null;
    if (record.referencia_ot_id && !workOrder) return deny('PUBLIC_RECEIPT_WORK_ORDER_INVALID');
    if (workOrder && workOrder.cliente_id !== client?.id) return deny('PUBLIC_RECEIPT_CLIENT_RELATIONSHIP_INVALID');
    if (workOrder && record.branch_id && workOrder.branch_id !== record.branch_id) return deny('PUBLIC_RECEIPT_BRANCH_RELATIONSHIP_INVALID');
    const equipment = workOrder?.equipo_id
      ? await exactlyOne(base44.asServiceRole.entities.Equipo, {
          id: workOrder.equipo_id,
          organization_id: organizationId,
        })
      : null;
    if (workOrder?.equipo_id && !equipment) return deny('PUBLIC_RECEIPT_EQUIPMENT_INVALID');
    if (equipment && equipment.cliente_id !== client?.id) return deny('PUBLIC_RECEIPT_EQUIPMENT_RELATIONSHIP_INVALID');
    return { ok: true, organization, client, workOrder, equipment };
  }

  if (type === 'work_order') {
    const [client, equipment] = await Promise.all([
      record.cliente_id
        ? exactlyOne(base44.asServiceRole.entities.Cliente, {
            id: record.cliente_id,
            organization_id: organizationId,
          })
        : null,
      record.equipo_id
        ? exactlyOne(base44.asServiceRole.entities.Equipo, {
            id: record.equipo_id,
            organization_id: organizationId,
          })
        : null,
    ]);
    if (!client) return deny('PUBLIC_WORK_ORDER_CLIENT_INVALID');
    if (!equipment) return deny('PUBLIC_WORK_ORDER_EQUIPMENT_INVALID');
    if (equipment.cliente_id !== client.id) return deny('PUBLIC_WORK_ORDER_EQUIPMENT_RELATIONSHIP_INVALID');
    if (equipment.branch_id && record.branch_id && equipment.branch_id !== record.branch_id) return deny('PUBLIC_WORK_ORDER_BRANCH_RELATIONSHIP_INVALID');
    return { ok: true, organization, client, equipment };
  }

  return deny('PUBLIC_RESOURCE_TYPE_INVALID');
}
