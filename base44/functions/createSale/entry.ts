import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/*
=====================================
createSale — SOT-BASE44-OPERATIVO v1
=====================================
Responsabilidad única:
  1. Validar auth + organización
  2. Validar ventaData e itemsCarrito
  3. Validar stock para productos físicos
  4. Crear o actualizar Venta
  5. Crear VentaItems
  6. Actualizar Inventario (solo productos físicos con permite_stock)
  7. Marcar Cotizacion como CONVERTIDA si cotizacionOrigenId presente

NO incluye: transición OT, emisión Garantía, habilitar Diagnóstico.
=====================================
*/

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Método no permitido' }, { status: 405 });
  }

  const base44 = createClientFromRequest(req);

  // 1. AUTH
  const user = await base44.auth.me();
  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 });
  }

  const orgId = user.organization_id || user.impersonating_org_id;
  if (!orgId) {
    return Response.json({ error: 'organization_id no resuelto para este usuario' }, { status: 403 });
  }

  // 2. PARSE BODY
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 });
  }

  const { ventaData, itemsCarrito, cotizacionOrigenId, ventaPreloadId } = body;

  // 3. VALIDACIONES DE INPUT
  if (!ventaData) {
    return Response.json({ error: 'ventaData es requerido' }, { status: 400 });
  }
  if (!Array.isArray(itemsCarrito) || itemsCarrito.length === 0) {
    return Response.json({ error: 'itemsCarrito es requerido y no puede estar vacío' }, { status: 400 });
  }
  if (!ventaData.metodo_pago) {
    return Response.json({ error: 'metodo_pago es requerido' }, { status: 400 });
  }
  if (!ventaData.total || ventaData.total <= 0) {
    return Response.json({ error: 'total debe ser mayor a cero' }, { status: 400 });
  }
  if (!ventaData.branch_id) {
    return Response.json({ error: 'branch_id es requerido' }, { status: 400 });
  }

  // Validar estructura de cada item
  for (const item of itemsCarrito) {
    if (!item.descripcion) {
      return Response.json({ error: 'Cada item debe tener descripcion' }, { status: 400 });
    }
    if (!item.cantidad || item.cantidad <= 0) {
      return Response.json({ error: `Item "${item.descripcion}": cantidad inválida` }, { status: 400 });
    }
    if (item.precio_unitario === undefined || item.precio_unitario === null) {
      return Response.json({ error: `Item "${item.descripcion}": precio_unitario requerido` }, { status: 400 });
    }
  }

  // 4. VALIDAR STOCK para productos físicos — ANTES de cualquier escritura
  const inventarioSnapshots = {};

  for (const item of itemsCarrito) {
    if (item.tipo !== 'producto' || !item.referencia_id) continue;

    const invResults = await base44.asServiceRole.entities.Inventario.filter({
      id: item.referencia_id,
      organization_id: orgId,
    });

    if (!invResults || invResults.length === 0) {
      return Response.json({
        error: `Producto "${item.descripcion}" no encontrado en inventario de la organización`,
      }, { status: 400 });
    }

    const invItem = invResults[0];

    // Verificar si la categoría controla stock
    let permiteStock = true;
    if (invItem.categoria_id) {
      const categorias = await base44.asServiceRole.entities.CategoriaInventario.filter({
        id: invItem.categoria_id,
      });
      const categoria = categorias[0];
      if (categoria && categoria.permite_stock === false) {
        permiteStock = false;
      }
    }

    if (permiteStock) {
      const stockDisponible = invItem.cantidad_disponible || 0;
      if (item.cantidad > stockDisponible) {
        return Response.json({
          error: `Stock insuficiente para "${invItem.nombre}": disponible ${stockDisponible}, solicitado ${item.cantidad}`,
        }, { status: 400 });
      }
    }

    inventarioSnapshots[item.referencia_id] = { invItem, permiteStock };
  }

  // =====================================================
  // 5. OPERACIONES DE ESCRITURA — validaciones pasaron
  // =====================================================
  let ventaResult = null;
  const itemsCreados = [];
  const inventariosActualizados = [];

  try {
    const publicToken = `vta_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // PASO A — Crear o actualizar Venta
    if (ventaPreloadId) {
      // Venta pre-existente (ej. cobro de taller o conversión de cotización)
      ventaResult = await base44.asServiceRole.entities.Venta.update(ventaPreloadId, {
        estado: 'pagada',
        metodo_pago: ventaData.metodo_pago,
        public_access_token: publicToken,
        total: ventaData.total,
        subtotal: ventaData.subtotal,
        impuesto: ventaData.impuesto,
        descuento_total: ventaData.descuento_total || 0,
      });
    } else {
      // Nueva venta
      ventaResult = await base44.asServiceRole.entities.Venta.create({
        organization_id: orgId,
        branch_id: ventaData.branch_id,
        cliente_id: ventaData.cliente_id || null,
        origen_venta: ventaData.origen_venta || 'tienda',
        origen_detalle: ventaData.cotizacion_id ? 'DESDE_COTIZACION' : 'POS_DIRECTO',
        tipo_concepto: ventaData.tipo_concepto || 'venta_producto',
        referencia_ot_id: ventaData.referencia_ot_id || null,
        cotizacion_id: ventaData.cotizacion_id || null,
        total: ventaData.total,
        subtotal: ventaData.subtotal,
        impuesto: ventaData.impuesto,
        descuento_total: ventaData.descuento_total || 0,
        metodo_pago: ventaData.metodo_pago,
        estado: 'pagada',
        created_by_user_id: user.id,
        public_access_token: publicToken,
      });
    }

    if (!ventaResult || !ventaResult.id) {
      throw new Error('Error al crear/actualizar la venta');
    }

    // PASO B — Crear VentaItems
    // Si ventaPreloadId con cotizacion, eliminar items existentes primero
    if (ventaPreloadId && cotizacionOrigenId) {
      const itemsExistentes = await base44.asServiceRole.entities.VentaItem.filter({
        venta_id: ventaPreloadId,
      });
      for (const itemViejo of itemsExistentes) {
        await base44.asServiceRole.entities.VentaItem.delete(itemViejo.id);
      }
    }

    for (const item of itemsCarrito) {
      const itemCreado = await base44.asServiceRole.entities.VentaItem.create({
        organization_id: orgId,
        venta_id: ventaResult.id,
        tipo: item.tipo,
        referencia_id: item.referencia_id || null,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        subtotal: item.subtotal,
      });

      if (!itemCreado || !itemCreado.id) {
        throw new Error(`Error al crear item: ${item.descripcion}`);
      }
      itemsCreados.push(itemCreado);
    }

    // PASO C — Actualizar Inventario para productos físicos
    for (const item of itemsCarrito) {
      if (item.tipo !== 'producto' || !item.referencia_id) continue;

      const snapshot = inventarioSnapshots[item.referencia_id];
      if (!snapshot || !snapshot.permiteStock) continue;

      const { invItem } = snapshot;
      const stockAnterior = invItem.cantidad_disponible || 0;
      const stockNuevo = stockAnterior - item.cantidad;

      await base44.asServiceRole.entities.Inventario.update(item.referencia_id, {
        cantidad_disponible: stockNuevo,
        fecha_ultimo_movimiento: new Date().toISOString().split('T')[0],
      });

      inventariosActualizados.push({ id: item.referencia_id, stockAnterior, stockNuevo });
    }

    // PASO D — Marcar Cotizacion como CONVERTIDA si aplica
    if (cotizacionOrigenId) {
      await base44.asServiceRole.entities.Cotizacion.update(cotizacionOrigenId, {
        estado_conversion: 'CONVERTIDA',
        convertida_at: new Date().toISOString(),
        convertida_por: user.id,
        venta_id: ventaResult.id,
      });
    }

    return Response.json({
      success: true,
      data: {
        ...ventaResult,
        items: itemsCreados,
      },
    }, { status: 201 });

  } catch (error) {
    // ROLLBACK MANUAL — revertir en orden inverso
    console.error('[createSale] ERROR — iniciando rollback:', error.message);

    for (const inv of inventariosActualizados) {
      try {
        await base44.asServiceRole.entities.Inventario.update(inv.id, {
          cantidad_disponible: inv.stockAnterior,
        });
        console.warn(`[createSale] Rollback stock: ${inv.id} → ${inv.stockAnterior}`);
      } catch (rbError) {
        console.error(`[createSale] Rollback stock FALLÓ para ${inv.id}:`, rbError.message);
      }
    }

    for (const itemCreado of itemsCreados) {
      try {
        await base44.asServiceRole.entities.VentaItem.delete(itemCreado.id);
        console.warn(`[createSale] Rollback VentaItem eliminado: ${itemCreado.id}`);
      } catch (rbError) {
        console.error(`[createSale] Rollback VentaItem FALLÓ para ${itemCreado.id}:`, rbError.message);
      }
    }

    if (ventaResult?.id && !ventaPreloadId) {
      try {
        await base44.asServiceRole.entities.Venta.delete(ventaResult.id);
        console.warn(`[createSale] Rollback Venta eliminada: ${ventaResult.id}`);
      } catch (rbError) {
        console.error(`[createSale] Rollback Venta FALLÓ para ${ventaResult.id}:`, rbError.message);
      }
    }

    return Response.json({
      error: error.message || 'Error interno al procesar la venta',
      rollback: 'ejecutado',
    }, { status: 500 });
  }
});