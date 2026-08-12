import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { validatePublicTokenRecord } from '../_shared/publicTokenContract.ts';

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
    items: quote.items,
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

      const [cliente, organization] = await Promise.all([
        one(base44, 'Cliente', { id: cotizacion.cliente_id }, 'created_date'),
        one(base44, 'Organization', { id: cotizacion.organization_id }, 'created_date'),
      ]);

      return Response.json({
        success: true,
        data: {
          cotizacion: publicQuote(cotizacion),
          cliente: publicClient(cliente),
          organization: publicOrganization(organization),
        },
      });
    }

    if (type === 'warranty') {
      const garantia = await one(base44, 'Garantia', { public_access_token: token });
      if (!garantia) return fail('Garantia no encontrada', 404);
      try { requireToken(garantia, token, 'WARRANTY_READ'); }
      catch { return fail('Garantia no encontrada', 404); }

      const [cliente, organization] = await Promise.all([
        one(base44, 'Cliente', { id: garantia.cliente_id }, 'created_date'),
        one(base44, 'Organization', { id: garantia.organization_id }, 'created_date'),
      ]);

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

      const [items, cliente, organization, ordenTrabajo] = await Promise.all([
        base44.asServiceRole.entities.VentaItem.filter({
          organization_id: venta.organization_id,
          venta_id: venta.id,
        }, 'created_date', 100),
        venta.cliente_id
          ? one(base44, 'Cliente', { id: venta.cliente_id }, 'created_date')
          : null,
        one(base44, 'Organization', { id: venta.organization_id }, 'created_date'),
        venta.referencia_ot_id
          ? one(base44, 'OrdenTrabajo', {
              id: venta.referencia_ot_id,
              organization_id: venta.organization_id,
            }, 'created_date')
          : null,
      ]);

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

      return Response.json({
        success: true,
        data: {
          venta: publicSale(venta),
          items,
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

    const [cliente, equipo, organization, diagnosticos, cotizaciones] = await Promise.all([
      one(base44, 'Cliente', { id: orden.cliente_id }, 'created_date'),
      one(base44, 'Equipo', { id: orden.equipo_id }, 'created_date'),
      one(base44, 'Organization', { id: orden.organization_id }, 'created_date'),
      base44.asServiceRole.entities.DiagnosticoTecnico.filter({
        organization_id: orden.organization_id,
        orden_trabajo_id: orden.id,
      }, '-created_date', 5),
      base44.asServiceRole.entities.Cotizacion.filter({
        organization_id: orden.organization_id,
        orden_trabajo_id: orden.id,
      }, '-created_date', 5),
    ]);

    const diagnosticoTecnico = diagnosticos?.[0] || null;
    const cotizacion = cotizaciones?.[0] || null;
    let evidencias = [];
    if (diagnosticoTecnico) {
      evidencias = await base44.asServiceRole.entities.DiagnosticoEvidencia.filter({
        organization_id: orden.organization_id,
        diagnostico_id: diagnosticoTecnico.id,
      }, '-created_date', 50);
    }

    await base44.asServiceRole.entities.OrdenTrabajo.update(orden.id, {
      public_last_viewed_at: new Date().toISOString(),
    });

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
        evidencias,
        cotizacion: publicQuote(cotizacion),
      },
    });
  } catch (error) {
    console.error('[getPublicCommercialDocument] Error:', error.message);
    return fail('No se pudo cargar el documento', 500);
  }
});
