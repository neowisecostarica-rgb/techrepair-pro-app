import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { validatePublicTokenRecord } from '../_shared/publicTokenContract.ts';
import { resolvePublicResourceRelations } from '../_shared/publicResourceRelations.ts';
import { inspectControlledPilotConfiguration } from '../_shared/controlledPilotAuthority.ts';

const PUBLIC_TYPES = ['work_order', 'quote', 'warranty', 'receipt'];

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
    direccion_comercial: org.direccion_comercial,
  };
}

function publicClient(client) {
  if (!client) return null;
  return {
    id: client.id,
    nombre_completo: client.nombre_completo,
    telefono: client.telefono,
    email: client.email,
  };
}

function publicEquipment(equipment) {
  if (!equipment) return null;
  return {
    id: equipment.id,
    tipo: equipment.tipo,
    marca: equipment.marca,
    modelo: equipment.modelo,
    serie_ingreso: equipment.serie_ingreso,
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
    items: Array.isArray(quote.items) ? quote.items.map(item => ({
      tipo: item.tipo,
      referencia_id: item.referencia_id,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      descuento_porcentaje: item.descuento_porcentaje,
      subtotal: item.subtotal,
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
    aprobada_at: quote.aprobada_at,
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
    texto_snapshot: warranty.texto_snapshot,
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
    created_date: sale.created_date,
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
    cliente_rechazo_motivo: workOrder.cliente_rechazo_motivo,
  };
}

function requireToken(record, token, purpose, version = 'v1') {
  const validation = validatePublicTokenRecord(record, {
    token, purpose, resourceId: record?.id, version,
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
    subtotal: item.subtotal,
  };
}

function publicEvidence(evidence) {
  return {
    id: evidence.id,
    tipo: evidence.tipo,
    url: evidence.url,
    contenido_texto: evidence.contenido_texto,
    descripcion: evidence.descripcion,
  };
}

async function one(base44, entity, query, sort = '-created_date') {
  const records = await base44.asServiceRole.entities[entity].filter(query, sort, 2);
  return records?.[0] || null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail('Metodo no permitido', 405);

  try {
    const base44 = createClientFromRequest(req);
    const { type, token } = await req.json();

    if (!PUBLIC_TYPES.includes(type)) return fail('Tipo de documento invalido');
    if (typeof token !== 'string' || token.length < 16 || token.length > 256) {
      return fail('Token invalido', 404);
    }

    if (type === 'quote') {
      const cotizacion = await one(base44, 'Cotizacion', { public_access_token: token });
      if (!cotizacion) return fail('Cotizacion no encontrada', 404);
      try { requireToken(cotizacion, token, 'QUOTE_DECISION', cotizacion.version || 'v1'); }
      catch { return fail('Cotizacion no encontrada', 404); }

      const relations = await resolvePublicResourceRelations(base44, { type, record: cotizacion });
      if (!relations.ok) return fail('Cotizacion no encontrada', 404);
      const { client: cliente, organization } = relations;

      return Response.json({
        success: true,
        data: {
          cotizacion: publicQuote(cotizacion),
          cliente: publicClient(cliente),
          organization: publicOrganization(organization),
          customer_decision_enabled: !inspectControlledPilotConfiguration(organization).enabled,
        },
      });
    }

    if (type === 'warranty') {
      const garantia = await one(base44, 'Garantia', { public_access_token: token });
      if (!garantia) return fail('Garantia no encontrada', 404);
      try { requireToken(garantia, token, 'WARRANTY_READ'); }
      catch { return fail('Garantia no encontrada', 404); }

      const relations = await resolvePublicResourceRelations(base44, { type, record: garantia });
      if (!relations.ok) return fail('Garantia no encontrada', 404);
      const { client: cliente, organization } = relations;

      return Response.json({
        success: true,
        data: {
          garantia: publicWarranty(garantia),
          cliente: publicClient(cliente),
          organization: publicOrganization(organization),
        },
      });
    }

    if (type === 'receipt') {
      const venta = await one(base44, 'Venta', { public_access_token: token });
      if (!venta || venta.estado !== 'pagada') return fail('Comprobante no encontrado', 404);
      try { requireToken(venta, token, 'RECEIPT_READ'); }
      catch { return fail('Comprobante no encontrado', 404); }

      const relations = await resolvePublicResourceRelations(base44, { type, record: venta });
      if (!relations.ok) return fail('Comprobante no encontrado', 404);
      const [items] = await Promise.all([
        base44.asServiceRole.entities.VentaItem.filter({
          organization_id: venta.organization_id,
          venta_id: venta.id,
        }, 'created_date', 100),
      ]);
      if ((items || []).some(item => item.organization_id !== venta.organization_id || item.venta_id !== venta.id)) {
        return fail('Comprobante no encontrado', 404);
      }
      const { client: cliente, organization, workOrder: ordenTrabajo } = relations;

      let garantia = null;
      if (venta.referencia_ot_id) {
        garantia = await one(base44, 'Garantia', {
          organization_id: venta.organization_id,
          origen_tipo: 'OT',
          origen_id: venta.referencia_ot_id,
        });
      }
      if (!garantia) {
        garantia = await one(base44, 'Garantia', {
          organization_id: venta.organization_id,
          origen_tipo: 'VENTA',
          origen_id: venta.id,
        });
      }
      if (garantia) {
        const warrantyRelations = await resolvePublicResourceRelations(base44, { type: 'warranty', record: garantia });
        const expectedOriginId = garantia.origen_tipo === 'OT' ? venta.referencia_ot_id : venta.id;
        if (!warrantyRelations.ok
          || warrantyRelations.client?.id !== cliente?.id
          || warrantyRelations.origin?.id !== expectedOriginId) {
          return fail('Comprobante no encontrado', 404);
        }
      }

      return Response.json({
        success: true,
        data: {
          venta: publicSale(venta),
          items: (items || []).map(publicSaleItem),
          cliente: publicClient(cliente),
          organization: publicOrganization(organization),
          ordenTrabajo: ordenTrabajo ? {
            id: ordenTrabajo.id,
            codigo_ot: ordenTrabajo.codigo_ot,
          } : null,
          garantia: publicWarranty(garantia),
        },
      });
    }

    const orden = await one(base44, 'OrdenTrabajo', { public_access_token: token });
    if (!orden) return fail('Orden no encontrada', 404);
    try { requireToken(orden, token, 'WORK_ORDER_STATUS_READ'); }
    catch { return fail('Orden no encontrada', 404); }

    const relations = await resolvePublicResourceRelations(base44, { type, record: orden });
    if (!relations.ok) return fail('Orden no encontrada', 404);
    const [diagnosticos, cotizaciones] = await Promise.all([
      base44.asServiceRole.entities.DiagnosticoTecnico.filter({
        organization_id: orden.organization_id,
        orden_trabajo_id: orden.id,
      }, '-created_date', 5),
      base44.asServiceRole.entities.Cotizacion.filter({
        organization_id: orden.organization_id,
        orden_trabajo_id: orden.id,
      }, '-created_date', 5),
    ]);
    const { client: cliente, equipment: equipo, organization } = relations;

    const diagnosticoTecnico = diagnosticos?.[0] || null;
    const cotizacion = cotizaciones?.[0] || null;
    if (cotizacion) {
      const quoteRelations = await resolvePublicResourceRelations(base44, { type: 'quote', record: cotizacion });
      if (!quoteRelations.ok
        || quoteRelations.workOrder?.id !== orden.id
        || quoteRelations.client?.id !== cliente.id) {
        return fail('Orden no encontrada', 404);
      }
    }
    let evidencias = [];
    if (diagnosticoTecnico) {
      evidencias = await base44.asServiceRole.entities.DiagnosticoEvidencia.filter({
        organization_id: orden.organization_id,
        diagnostico_id: diagnosticoTecnico.id,
      }, '-created_date', 50);
      if (evidencias.some(evidence => (
        evidence.organization_id !== orden.organization_id
        || evidence.diagnostico_id !== diagnosticoTecnico.id
      ))) return fail('Orden no encontrada', 404);
    }

    // Public reads remain strictly non-mutating in controlled pilot mode.
    if (!inspectControlledPilotConfiguration(organization).enabled) {
      await base44.asServiceRole.entities.OrdenTrabajo.update(orden.id, {
        public_last_viewed_at: new Date().toISOString(),
      });
    }

    const diagnostico = diagnosticoTecnico ? {
      id: diagnosticoTecnico.id,
      estado_diagnostico: diagnosticoTecnico.bloqueado ? 'completado' : diagnosticoTecnico.estado,
      descripcion_problema: diagnosticoTecnico.causa_probable,
      trabajo_recomendado: diagnosticoTecnico.trabajo_recomendado,
      tiempo_estimado_horas: diagnosticoTecnico.tiempo_estimado_horas,
      tiempo_estimado_dias: diagnosticoTecnico.tiempo_estimado_horas
        ? Math.max(1, Math.ceil(Number(diagnosticoTecnico.tiempo_estimado_horas) / 8))
        : null,
      propuesta_precio_total: cotizacion?.total || 0,
      riesgos_no_reparar: diagnosticoTecnico.riesgos_no_reparar,
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
        cotizacion: publicQuote(cotizacion),
      },
    });
  } catch (error) {
    console.error('[getPublicCommercialDocument] Error:', error.message);
    return fail('No se pudo cargar el documento', 500);
  }
});
