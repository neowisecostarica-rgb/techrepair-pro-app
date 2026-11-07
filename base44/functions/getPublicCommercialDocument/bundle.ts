// base44/functions/getPublicCommercialDocument/entry.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

// base44/functions/_shared/publicTokenContract.ts
var PUBLIC_TOKEN_MAX_TTL_DAYS = Object.freeze({
  WORK_ORDER_STATUS_READ: 30,
  QUOTE_DECISION: 7,
  WARRANTY_READ: 365,
  RECEIPT_READ: 365
});
function validatePublicTokenRecord(record, { token, purpose, resourceId, version, now = Date.now(), allowConsumed = false }) {
  const deny2 = (code) => ({ ok: false, code });
  if (!record || typeof token !== "string" || record.public_access_token !== token) return deny2("PUBLIC_TOKEN_INVALID");
  if (record.public_access_purpose !== purpose) return deny2("PUBLIC_TOKEN_WRONG_PURPOSE");
  if (record.public_access_resource_id !== resourceId) return deny2("PUBLIC_TOKEN_WRONG_RESOURCE");
  if (String(record.public_access_version) !== String(version)) return deny2("PUBLIC_TOKEN_STALE_VERSION");
  if (record.public_access_revoked_at) return deny2("PUBLIC_TOKEN_REVOKED");
  if (record.public_access_consumed_at && !allowConsumed) return deny2("PUBLIC_TOKEN_CONSUMED");
  const issuedAt = Date.parse(record.public_access_issued_at || "");
  const expiresAt = Date.parse(record.public_access_expires_at || "");
  const maxDays = PUBLIC_TOKEN_MAX_TTL_DAYS[purpose];
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= now) return deny2("PUBLIC_TOKEN_EXPIRED");
  if (expiresAt - issuedAt > maxDays * 24 * 60 * 60 * 1e3) return deny2("PUBLIC_TOKEN_TTL_EXCEEDED");
  return { ok: true };
}

// base44/functions/_shared/publicResourceRelations.ts
async function exactlyOne(entity, query) {
  const rows = await entity.filter(query, "-created_date", 2);
  return rows?.length === 1 ? rows[0] : null;
}
function deny(code) {
  return { ok: false, code };
}
async function resolvePublicResourceRelations(base44, { type, record }) {
  const organizationId = record?.organization_id || null;
  if (!organizationId) return deny("PUBLIC_RESOURCE_ORGANIZATION_REQUIRED");
  const organization = await exactlyOne(base44.asServiceRole.entities.Organization, { id: organizationId });
  if (!organization) return deny("PUBLIC_RESOURCE_ORGANIZATION_INVALID");
  if (type === "quote") {
    const client = record.cliente_id ? await exactlyOne(base44.asServiceRole.entities.Cliente, {
      id: record.cliente_id,
      organization_id: organizationId
    }) : null;
    if (!client) return deny("PUBLIC_QUOTE_CLIENT_INVALID");
    const workOrder = record.orden_trabajo_id ? await exactlyOne(base44.asServiceRole.entities.OrdenTrabajo, {
      id: record.orden_trabajo_id,
      organization_id: organizationId
    }) : null;
    if (record.orden_trabajo_id && !workOrder) return deny("PUBLIC_QUOTE_WORK_ORDER_INVALID");
    if (workOrder && workOrder.cliente_id !== client.id) return deny("PUBLIC_QUOTE_CLIENT_RELATIONSHIP_INVALID");
    if (workOrder && record.branch_id && workOrder.branch_id !== record.branch_id) return deny("PUBLIC_QUOTE_BRANCH_RELATIONSHIP_INVALID");
    const equipment = workOrder?.equipo_id ? await exactlyOne(base44.asServiceRole.entities.Equipo, {
      id: workOrder.equipo_id,
      organization_id: organizationId
    }) : null;
    if (workOrder?.equipo_id && !equipment) return deny("PUBLIC_QUOTE_EQUIPMENT_INVALID");
    if (equipment && equipment.cliente_id !== client.id) return deny("PUBLIC_QUOTE_EQUIPMENT_RELATIONSHIP_INVALID");
    return { ok: true, organization, client, workOrder, equipment };
  }
  if (type === "warranty") {
    const client = record.cliente_id ? await exactlyOne(base44.asServiceRole.entities.Cliente, {
      id: record.cliente_id,
      organization_id: organizationId
    }) : null;
    if (!client) return deny("PUBLIC_WARRANTY_CLIENT_INVALID");
    const originEntity = record.origen_tipo === "OT" ? base44.asServiceRole.entities.OrdenTrabajo : record.origen_tipo === "VENTA" ? base44.asServiceRole.entities.Venta : null;
    if (!originEntity || !record.origen_id) return deny("PUBLIC_WARRANTY_ORIGIN_INVALID");
    const origin = await exactlyOne(originEntity, {
      id: record.origen_id,
      organization_id: organizationId
    });
    if (!origin) return deny("PUBLIC_WARRANTY_ORIGIN_INVALID");
    if (origin.cliente_id !== client.id) return deny("PUBLIC_WARRANTY_CLIENT_RELATIONSHIP_INVALID");
    if (record.branch_id && origin.branch_id && record.branch_id !== origin.branch_id) return deny("PUBLIC_WARRANTY_BRANCH_RELATIONSHIP_INVALID");
    const equipmentId = record.equipo_id || (record.origen_tipo === "OT" ? origin.equipo_id : null);
    const equipment = equipmentId ? await exactlyOne(base44.asServiceRole.entities.Equipo, { id: equipmentId, organization_id: organizationId }) : null;
    if (equipmentId && !equipment) return deny("PUBLIC_WARRANTY_EQUIPMENT_INVALID");
    if (equipment && equipment.cliente_id !== client.id) return deny("PUBLIC_WARRANTY_EQUIPMENT_RELATIONSHIP_INVALID");
    return { ok: true, organization, client, origin, equipment };
  }
  if (type === "receipt") {
    const client = record.cliente_id ? await exactlyOne(base44.asServiceRole.entities.Cliente, {
      id: record.cliente_id,
      organization_id: organizationId
    }) : null;
    if (record.cliente_id && !client) return deny("PUBLIC_RECEIPT_CLIENT_INVALID");
    const workOrder = record.referencia_ot_id ? await exactlyOne(base44.asServiceRole.entities.OrdenTrabajo, {
      id: record.referencia_ot_id,
      organization_id: organizationId
    }) : null;
    if (record.referencia_ot_id && !workOrder) return deny("PUBLIC_RECEIPT_WORK_ORDER_INVALID");
    if (workOrder && workOrder.cliente_id !== client?.id) return deny("PUBLIC_RECEIPT_CLIENT_RELATIONSHIP_INVALID");
    if (workOrder && record.branch_id && workOrder.branch_id !== record.branch_id) return deny("PUBLIC_RECEIPT_BRANCH_RELATIONSHIP_INVALID");
    const equipment = workOrder?.equipo_id ? await exactlyOne(base44.asServiceRole.entities.Equipo, {
      id: workOrder.equipo_id,
      organization_id: organizationId
    }) : null;
    if (workOrder?.equipo_id && !equipment) return deny("PUBLIC_RECEIPT_EQUIPMENT_INVALID");
    if (equipment && equipment.cliente_id !== client?.id) return deny("PUBLIC_RECEIPT_EQUIPMENT_RELATIONSHIP_INVALID");
    return { ok: true, organization, client, workOrder, equipment };
  }
  if (type === "work_order") {
    const [client, equipment] = await Promise.all([
      record.cliente_id ? exactlyOne(base44.asServiceRole.entities.Cliente, {
        id: record.cliente_id,
        organization_id: organizationId
      }) : null,
      record.equipo_id ? exactlyOne(base44.asServiceRole.entities.Equipo, {
        id: record.equipo_id,
        organization_id: organizationId
      }) : null
    ]);
    if (!client) return deny("PUBLIC_WORK_ORDER_CLIENT_INVALID");
    if (!equipment) return deny("PUBLIC_WORK_ORDER_EQUIPMENT_INVALID");
    if (equipment.cliente_id !== client.id) return deny("PUBLIC_WORK_ORDER_EQUIPMENT_RELATIONSHIP_INVALID");
    if (equipment.branch_id && record.branch_id && equipment.branch_id !== record.branch_id) return deny("PUBLIC_WORK_ORDER_BRANCH_RELATIONSHIP_INVALID");
    return { ok: true, organization, client, equipment };
  }
  return deny("PUBLIC_RESOURCE_TYPE_INVALID");
}

// base44/functions/_shared/controlledPilotAuthority.ts
function cleanId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function inspectControlledPilotConfiguration(organization) {
  if (organization?.controlled_pilot_mode !== true) {
    return { enabled: false, valid: true, operatorUserId: null, branchId: null };
  }
  const operatorUserId = cleanId(organization.controlled_pilot_operator_user_id);
  const branchId = cleanId(organization.controlled_pilot_branch_id);
  return {
    enabled: true,
    valid: Boolean(operatorUserId && branchId),
    operatorUserId,
    branchId
  };
}

// base44/functions/getPublicCommercialDocument/entry.ts
var PUBLIC_TYPES = ["work_order", "quote", "warranty", "receipt"];
function fail(message, status = 400) {
  return Response.json({ success: false, error: message }, { status });
}
function publicOrganization(org) {
  if (!org) return null;
  return {
    id: org.id,
    name: org.name,
    logo_url: org.logo_url,
    telefono_negocio: org.telefono_negocio,
    email: org.email,
    direccion: org.direccion,
    direccion_comercial: org.direccion_comercial
  };
}
function publicClient(client) {
  if (!client) return null;
  return {
    id: client.id,
    nombre_completo: client.nombre_completo,
    telefono: client.telefono,
    email: client.email
  };
}
function publicEquipment(equipment) {
  if (!equipment) return null;
  return {
    id: equipment.id,
    tipo: equipment.tipo,
    marca: equipment.marca,
    modelo: equipment.modelo,
    serie_ingreso: equipment.serie_ingreso
  };
}
function publicQuote(quote) {
  if (!quote) return null;
  return {
    id: quote.id,
    organization_id: quote.organization_id,
    cliente_id: quote.cliente_id,
    orden_trabajo_id: quote.orden_trabajo_id,
    vendedor_nombre: quote.vendedor_nombre,
    version: quote.version,
    items: Array.isArray(quote.items) ? quote.items.map((item) => ({
      tipo: item.tipo,
      referencia_id: item.referencia_id,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      descuento_porcentaje: item.descuento_porcentaje,
      subtotal: item.subtotal
    })) : [],
    subtotal: quote.subtotal,
    descuento_total: quote.descuento_total,
    impuesto: quote.impuesto,
    total: quote.total,
    estado: quote.estado,
    valida_hasta: quote.valida_hasta,
    notas: quote.notas,
    created_date: quote.created_date,
    enviada_at: quote.enviada_at,
    aprobada_at: quote.aprobada_at
  };
}
function publicWarranty(warranty) {
  if (!warranty) return null;
  return {
    id: warranty.id,
    organization_id: warranty.organization_id,
    cliente_id: warranty.cliente_id,
    origen_tipo: warranty.origen_tipo,
    origen_id: warranty.origen_id,
    fecha_emision: warranty.fecha_emision,
    fecha_inicio: warranty.fecha_inicio,
    fecha_fin: warranty.fecha_fin,
    estado: warranty.estado,
    texto_snapshot: warranty.texto_snapshot
  };
}
function publicSale(sale) {
  if (!sale) return null;
  return {
    id: sale.id,
    organization_id: sale.organization_id,
    cliente_id: sale.cliente_id,
    referencia_ot_id: sale.referencia_ot_id,
    tipo_concepto: sale.tipo_concepto,
    subtotal: sale.subtotal,
    descuento_total: sale.descuento_total,
    impuesto: sale.impuesto,
    total: sale.total,
    metodo_pago: sale.metodo_pago,
    estado: sale.estado,
    created_date: sale.created_date
  };
}
function publicWorkOrder(workOrder) {
  if (!workOrder) return null;
  return {
    id: workOrder.id,
    organization_id: workOrder.organization_id,
    codigo_ot: workOrder.codigo_ot,
    estado: workOrder.estado,
    motivo_ingreso: workOrder.motivo_ingreso,
    fecha_ingreso: workOrder.fecha_ingreso,
    fecha_entrega_estimada: workOrder.fecha_entrega_estimada,
    fecha_diagnostico: workOrder.fecha_diagnostico,
    fecha_cierre: workOrder.fecha_cierre,
    created_date: workOrder.created_date,
    cliente_aprobado: workOrder.cliente_aprobado,
    cliente_aprobado_at: workOrder.cliente_aprobado_at,
    cliente_rechazo_motivo: workOrder.cliente_rechazo_motivo
  };
}
function requireToken(record, token, purpose, version = "v1") {
  const validation = validatePublicTokenRecord(record, {
    token,
    purpose,
    resourceId: record?.id,
    version
  });
  if (!validation.ok) throw new Error(validation.code);
}
function publicSaleItem(item) {
  return {
    id: item.id,
    tipo: item.tipo,
    referencia_id: item.referencia_id,
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    precio_unitario: item.precio_unitario,
    subtotal: item.subtotal
  };
}
function publicEvidence(evidence) {
  return {
    id: evidence.id,
    tipo: evidence.tipo,
    url: evidence.url,
    contenido_texto: evidence.contenido_texto,
    descripcion: evidence.descripcion
  };
}
async function one(base44, entity, query, sort = "-created_date") {
  const records = await base44.asServiceRole.entities[entity].filter(query, sort, 2);
  return records?.[0] || null;
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return fail("Metodo no permitido", 405);
  try {
    const base44 = createClientFromRequest(req);
    const { type, token } = await req.json();
    if (!PUBLIC_TYPES.includes(type)) return fail("Tipo de documento invalido");
    if (typeof token !== "string" || token.length < 16 || token.length > 256) {
      return fail("Token invalido", 404);
    }
    if (type === "quote") {
      const cotizacion2 = await one(base44, "Cotizacion", { public_access_token: token });
      if (!cotizacion2) return fail("Cotizacion no encontrada", 404);
      try {
        requireToken(cotizacion2, token, "QUOTE_DECISION", cotizacion2.version || "v1");
      } catch {
        return fail("Cotizacion no encontrada", 404);
      }
      const relations2 = await resolvePublicResourceRelations(base44, { type, record: cotizacion2 });
      if (!relations2.ok) return fail("Cotizacion no encontrada", 404);
      const { client: cliente2, organization: organization2 } = relations2;
      return Response.json({
        success: true,
        data: {
          cotizacion: publicQuote(cotizacion2),
          cliente: publicClient(cliente2),
          organization: publicOrganization(organization2),
          customer_decision_enabled: !inspectControlledPilotConfiguration(organization2).enabled
        }
      });
    }
    if (type === "warranty") {
      const garantia = await one(base44, "Garantia", { public_access_token: token });
      if (!garantia) return fail("Garantia no encontrada", 404);
      try {
        requireToken(garantia, token, "WARRANTY_READ");
      } catch {
        return fail("Garantia no encontrada", 404);
      }
      const relations2 = await resolvePublicResourceRelations(base44, { type, record: garantia });
      if (!relations2.ok) return fail("Garantia no encontrada", 404);
      const { client: cliente2, organization: organization2 } = relations2;
      return Response.json({
        success: true,
        data: {
          garantia: publicWarranty(garantia),
          cliente: publicClient(cliente2),
          organization: publicOrganization(organization2)
        }
      });
    }
    if (type === "receipt") {
      const venta = await one(base44, "Venta", { public_access_token: token });
      if (!venta || venta.estado !== "pagada") return fail("Comprobante no encontrado", 404);
      try {
        requireToken(venta, token, "RECEIPT_READ");
      } catch {
        return fail("Comprobante no encontrado", 404);
      }
      const relations2 = await resolvePublicResourceRelations(base44, { type, record: venta });
      if (!relations2.ok) return fail("Comprobante no encontrado", 404);
      const [items] = await Promise.all([
        base44.asServiceRole.entities.VentaItem.filter({
          organization_id: venta.organization_id,
          venta_id: venta.id
        }, "created_date", 100)
      ]);
      if ((items || []).some((item) => item.organization_id !== venta.organization_id || item.venta_id !== venta.id)) {
        return fail("Comprobante no encontrado", 404);
      }
      const { client: cliente2, organization: organization2, workOrder: ordenTrabajo } = relations2;
      let garantia = null;
      if (venta.referencia_ot_id) {
        garantia = await one(base44, "Garantia", {
          organization_id: venta.organization_id,
          origen_tipo: "OT",
          origen_id: venta.referencia_ot_id
        });
      }
      if (!garantia) {
        garantia = await one(base44, "Garantia", {
          organization_id: venta.organization_id,
          origen_tipo: "VENTA",
          origen_id: venta.id
        });
      }
      if (garantia) {
        const warrantyRelations = await resolvePublicResourceRelations(base44, { type: "warranty", record: garantia });
        const expectedOriginId = garantia.origen_tipo === "OT" ? venta.referencia_ot_id : venta.id;
        if (!warrantyRelations.ok || warrantyRelations.client?.id !== cliente2?.id || warrantyRelations.origin?.id !== expectedOriginId) {
          return fail("Comprobante no encontrado", 404);
        }
      }
      return Response.json({
        success: true,
        data: {
          venta: publicSale(venta),
          items: (items || []).map(publicSaleItem),
          cliente: publicClient(cliente2),
          organization: publicOrganization(organization2),
          ordenTrabajo: ordenTrabajo ? {
            id: ordenTrabajo.id,
            codigo_ot: ordenTrabajo.codigo_ot
          } : null,
          garantia: publicWarranty(garantia)
        }
      });
    }
    const orden = await one(base44, "OrdenTrabajo", { public_access_token: token });
    if (!orden) return fail("Orden no encontrada", 404);
    try {
      requireToken(orden, token, "WORK_ORDER_STATUS_READ");
    } catch {
      return fail("Orden no encontrada", 404);
    }
    const relations = await resolvePublicResourceRelations(base44, { type, record: orden });
    if (!relations.ok) return fail("Orden no encontrada", 404);
    const [diagnosticos, cotizaciones] = await Promise.all([
      base44.asServiceRole.entities.DiagnosticoTecnico.filter({
        organization_id: orden.organization_id,
        orden_trabajo_id: orden.id
      }, "-created_date", 5),
      base44.asServiceRole.entities.Cotizacion.filter({
        organization_id: orden.organization_id,
        orden_trabajo_id: orden.id
      }, "-created_date", 5)
    ]);
    const { client: cliente, equipment: equipo, organization } = relations;
    const diagnosticoTecnico = diagnosticos?.[0] || null;
    const cotizacion = cotizaciones?.[0] || null;
    if (cotizacion) {
      const quoteRelations = await resolvePublicResourceRelations(base44, { type: "quote", record: cotizacion });
      if (!quoteRelations.ok || quoteRelations.workOrder?.id !== orden.id || quoteRelations.client?.id !== cliente.id) {
        return fail("Orden no encontrada", 404);
      }
    }
    let evidencias = [];
    if (diagnosticoTecnico) {
      evidencias = await base44.asServiceRole.entities.DiagnosticoEvidencia.filter({
        organization_id: orden.organization_id,
        diagnostico_id: diagnosticoTecnico.id
      }, "-created_date", 50);
      if (evidencias.some((evidence) => evidence.organization_id !== orden.organization_id || evidence.diagnostico_id !== diagnosticoTecnico.id)) return fail("Orden no encontrada", 404);
    }
    if (!inspectControlledPilotConfiguration(organization).enabled) {
      await base44.asServiceRole.entities.OrdenTrabajo.update(orden.id, {
        public_last_viewed_at: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    const diagnostico = diagnosticoTecnico ? {
      id: diagnosticoTecnico.id,
      estado_diagnostico: diagnosticoTecnico.bloqueado ? "completado" : diagnosticoTecnico.estado,
      descripcion_problema: diagnosticoTecnico.causa_probable,
      trabajo_recomendado: diagnosticoTecnico.trabajo_recomendado,
      tiempo_estimado_horas: diagnosticoTecnico.tiempo_estimado_horas,
      tiempo_estimado_dias: diagnosticoTecnico.tiempo_estimado_horas ? Math.max(1, Math.ceil(Number(diagnosticoTecnico.tiempo_estimado_horas) / 8)) : null,
      propuesta_precio_total: cotizacion?.total || 0,
      riesgos_no_reparar: diagnosticoTecnico.riesgos_no_reparar
    } : null;
    return Response.json({
      success: true,
      data: {
        orden: publicWorkOrder(orden),
        cliente: publicClient(cliente),
        equipo: publicEquipment(equipo),
        organization: publicOrganization(organization),
        diagnostico,
        evidencias: evidencias.map(publicEvidence),
        cotizacion: publicQuote(cotizacion)
      }
    });
  } catch (error) {
    console.error("[getPublicCommercialDocument] Error:", error.message);
    return fail("No se pudo cargar el documento", 500);
  }
});
