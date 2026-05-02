import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/*
=====================================
POST /v1/sales — Backend Ventas v1
=====================================
Flujo:
1. Validar auth + organization_id
2. Validar items (stock suficiente)
3. BEGIN transacción simulada via secuencia atómica:
   a. Crear Venta
   b. Crear VentaItems
   c. Descontar Inventario
   d. Registrar InventarioHistorial
4. ROLLBACK manual si falla algún paso
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
    return Response.json({ error: 'organization_id requerido' }, { status: 400 });
  }

  // 2. PARSE BODY
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 });
  }

  const {
    client_id,
    work_order_id,
    payment_method,
    total,
    subtotal,
    tax = 0,
    discount = 0,
    notes,
    origen_detalle = 'POS_DIRECTO',
    items = [],
  } = body;

  // 3. VALIDACIONES DE INPUT
  if (!payment_method) {
    return Response.json({ error: 'payment_method requerido' }, { status: 400 });
  }
  if (total === undefined || total === null) {
    return Response.json({ error: 'total requerido' }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return Response.json({ error: 'items requerido y no puede estar vacío' }, { status: 400 });
  }

  // Validar estructura de cada item
  for (const item of items) {
    if (!item.description) {
      return Response.json({ error: 'Cada item debe tener description' }, { status: 400 });
    }
    if (!item.quantity || item.quantity <= 0) {
      return Response.json({ error: `Item "${item.description}": quantity inválida` }, { status: 400 });
    }
    if (item.unit_price === undefined || item.unit_price === null) {
      return Response.json({ error: `Item "${item.description}": unit_price requerido` }, { status: 400 });
    }
  }

  // 4. VALIDAR CLIENTE (si aplica)
  if (client_id) {
    const clientes = await base44.asServiceRole.entities.Cliente.filter({
      id: client_id,
      organization_id: orgId,
    });
    if (!clientes || clientes.length === 0) {
      return Response.json({
        error: `Cliente ${client_id} no encontrado o no pertenece a la organización`,
      }, { status: 400 });
    }
  }

  // 5. VALIDAR INVENTARIO Y STOCK por cada item con referencia
  const inventorySnapshots = {};

  for (const item of items) {
    if (!item.inventory_item_id) continue;

    const inventoryResults = await base44.asServiceRole.entities.Inventario.filter({
      id: item.inventory_item_id,
      organization_id: orgId,
    });

    if (!inventoryResults || inventoryResults.length === 0) {
      return Response.json({
        error: `Ítem de inventario "${item.inventory_item_id}" no encontrado o no pertenece a la organización`,
      }, { status: 400 });
    }

    const invItem = inventoryResults[0];

    // Solo validar stock para productos físicos (no servicios)
    if (invItem.tipo_item === 'producto') {
      const stockDisponible = invItem.cantidad_disponible || 0;
      if (item.quantity > stockDisponible) {
        return Response.json({
          error: `Stock insuficiente para "${invItem.nombre}": disponible ${stockDisponible}, solicitado ${item.quantity}`,
        }, { status: 400 });
      }
    }

    inventorySnapshots[item.inventory_item_id] = invItem;
  }

  // =====================================================
  // 6. TRANSACCIÓN: crear venta + items + descontar stock
  // Si falla cualquier paso, intentamos revertir lo creado
  // =====================================================
  let ventaCreada = null;
  const itemsCreados = [];
  const inventariosActualizados = [];

  try {
    // PASO A — Crear Venta
    ventaCreada = await base44.asServiceRole.entities.Venta.create({
      organization_id: orgId,
      branch_id: body.branch_id || null,
      cliente_id: client_id || null,
      referencia_ot_id: work_order_id || null,
      origen_venta: body.origen_venta || 'tienda',
      origen_detalle,
      tipo_concepto: body.tipo_concepto || 'venta_producto',
      total: total,
      subtotal: subtotal !== undefined ? subtotal : total,
      impuesto: tax,
      descuento_total: discount,
      metodo_pago: payment_method,
      estado: 'pagada',
      created_by_user_id: user.id,
      notas: notes || null,
    });

    if (!ventaCreada || !ventaCreada.id) {
      throw new Error('Error al crear la venta');
    }

    // PASO B — Crear VentaItems
    for (const item of items) {
      const itemCreado = await base44.asServiceRole.entities.VentaItem.create({
        organization_id: orgId,
        venta_id: ventaCreada.id,
        tipo: item.tipo || (item.inventory_item_id ? 'producto' : 'servicio'),
        referencia_id: item.inventory_item_id || null,
        descripcion: item.description,
        cantidad: item.quantity,
        precio_unitario: item.unit_price,
        subtotal: item.subtotal !== undefined ? item.subtotal : (item.quantity * item.unit_price),
      });

      if (!itemCreado || !itemCreado.id) {
        throw new Error(`Error al crear item: ${item.description}`);
      }

      itemsCreados.push(itemCreado);
    }

    // PASO C — Descontar stock + registrar historial
    for (const item of items) {
      if (!item.inventory_item_id) continue;

      const invItem = inventorySnapshots[item.inventory_item_id];
      if (!invItem || invItem.tipo_item !== 'producto') continue;

      const stockAnterior = invItem.cantidad_disponible || 0;
      const stockNuevo = stockAnterior - item.quantity;

      await base44.asServiceRole.entities.Inventario.update(
        item.inventory_item_id,
        {
          cantidad_disponible: stockNuevo,
          fecha_ultimo_movimiento: new Date().toISOString().split('T')[0],
        }
      );

      inventariosActualizados.push({
        id: item.inventory_item_id,
        stockAnterior,
        stockNuevo,
      });

      // Registrar historial de movimiento
      await base44.asServiceRole.entities.InventarioHistorial.create({
        organization_id: orgId,
        inventario_id: item.inventory_item_id,
        tipo_movimiento: 'salida',
        cantidad: item.quantity,
        stock_anterior: stockAnterior,
        stock_nuevo: stockNuevo,
        motivo: 'venta',
        referencia_id: ventaCreada.id,
        referencia_tipo: 'Venta',
        created_by: user.email,
      });
    }

    // ÉXITO — devolver venta completa con items
    return Response.json({
      success: true,
      data: {
        ...ventaCreada,
        items: itemsCreados,
      },
    }, { status: 201 });

  } catch (error) {
    // =====================================================
    // ROLLBACK MANUAL
    // Intentar revertir en orden inverso: historial → stock → items → venta
    // =====================================================
    console.error('[createSale] ERROR — iniciando rollback:', error.message);

    // Revertir stock de inventarios ya actualizados
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

    // Eliminar VentaItems creados
    for (const itemCreado of itemsCreados) {
      try {
        await base44.asServiceRole.entities.VentaItem.delete(itemCreado.id);
        console.warn(`[createSale] Rollback VentaItem eliminado: ${itemCreado.id}`);
      } catch (rbError) {
        console.error(`[createSale] Rollback VentaItem FALLÓ para ${itemCreado.id}:`, rbError.message);
      }
    }

    // Eliminar Venta creada
    if (ventaCreada?.id) {
      try {
        await base44.asServiceRole.entities.Venta.delete(ventaCreada.id);
        console.warn(`[createSale] Rollback Venta eliminada: ${ventaCreada.id}`);
      } catch (rbError) {
        console.error(`[createSale] Rollback Venta FALLÓ para ${ventaCreada.id}:`, rbError.message);
      }
    }

    return Response.json({
      error: error.message || 'Error interno al procesar la venta',
      rollback: 'ejecutado',
    }, { status: 500 });
  }
});