import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/*
=====================================
createSale — SOT-BASE44-OPERATIVO v2
=====================================
Responsabilidad única:
  1. Validar auth + organización
  2. Idempotencia: organization_id + idempotency_key
  3. Validar ventaData e itemsCarrito
  4. Validar ventaPreloadId (ownership + estado borrador)
  5. Validar stock para productos físicos
  6. Crear Venta con estado "procesando"
  7. Crear VentaItems
  8. Actualizar Inventario + registrar InventarioHistorial
  9. Marcar Cotizacion como CONVERTIDA si cotizacionOrigenId presente
 10. Actualizar Venta a estado "pagada" (último paso del happy path)

Rollback mejorado:
  - Revertir stock de Inventario
  - Eliminar VentaItems creados
  - Eliminar Venta nueva (si aplica)
  - Si rollback falla parcialmente: marcar Venta como "inconsistente"

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
  let idempotencyKey = body.idempotency_key;

  // 3. IDEMPOTENCIA
  // Si no viene idempotency_key, generar una interna (fallback temporal)
  if (!idempotencyKey) {
    console.warn('[createSale] WARN: idempotency_key no enviado desde el frontend. Generando clave interna. Este escenario debe eliminarse en v3.');
    idempotencyKey = `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Buscar venta existente por organization_id + idempotency_key
  const ventasExistentes = await base44.asServiceRole.entities.Venta.filter({
    organization_id: orgId,
    idempotency_key: idempotencyKey,
  });

  if (ventasExistentes && ventasExistentes.length > 0) {
    const ventaExistente = ventasExistentes[0];
    const estadoExistente = ventaExistente.estado;

    if (estadoExistente === 'pagada') {
      // Reintento exitoso — devolver la venta original
      console.warn(`[createSale] Idempotencia: venta ${ventaExistente.id} ya procesada (pagada). Devolviendo resultado original.`);
      return Response.json({ success: true, data: ventaExistente, idempotent: true }, { status: 200 });
    }

    if (estadoExistente === 'procesando') {
      return Response.json({
        error: 'Operación en proceso. Espera unos segundos e intenta nuevamente.',
        estado: 'procesando',
        venta_id: ventaExistente.id,
      }, { status: 409 });
    }

    if (estadoExistente === 'inconsistente') {
      return Response.json({
        error: `La venta ${ventaExistente.id} quedó en estado inconsistente por un error previo. Requiere revisión manual antes de continuar.`,
        estado: 'inconsistente',
        venta_id: ventaExistente.id,
      }, { status: 500 });
    }

    if (estadoExistente === 'anulada') {
      return Response.json({
        error: 'Esta venta fue anulada. No se puede reprocesar con la misma clave.',
        estado: 'anulada',
        venta_id: ventaExistente.id,
      }, { status: 409 });
    }

    // Cualquier otro estado inesperado
    return Response.json({
      error: `La venta con esta clave ya existe con estado "${estadoExistente}". No se puede crear una nueva.`,
      estado: estadoExistente,
      venta_id: ventaExistente.id,
    }, { status: 409 });
  }

  // 4. VALIDACIONES DE INPUT
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

  // 5. VALIDAR ventaPreloadId — ownership + estado borrador
  if (ventaPreloadId) {
    const ventasPreload = await base44.asServiceRole.entities.Venta.filter({
      id: ventaPreloadId,
      organization_id: orgId,
    });

    if (!ventasPreload || ventasPreload.length === 0) {
      return Response.json({
        error: `Venta pre-cargada "${ventaPreloadId}" no encontrada o no pertenece a esta organización`,
      }, { status: 400 });
    }

    const ventaPreload = ventasPreload[0];
    if (ventaPreload.estado !== 'borrador') {
      return Response.json({
        error: `La venta pre-cargada "${ventaPreloadId}" ya fue procesada (estado: ${ventaPreload.estado}). No se puede actualizar.`,
      }, { status: 409 });
    }
  }

  // 6. VALIDAR STOCK para productos físicos — ANTES de cualquier escritura
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
  // 7. OPERACIONES DE ESCRITURA — todas las validaciones pasaron
  // =====================================================
  let ventaResult = null;
  const itemsCreados = [];
  const inventariosActualizados = [];
  let rollbackFailed = false;
  const rollbackErrors = [];

  try {
    const publicToken = `vta_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // PASO A — Crear o actualizar Venta (estado inicial: "procesando")
    if (ventaPreloadId) {
      // Venta pre-existente: actualizar a "procesando" mientras se ejecuta la transacción
      ventaResult = await base44.asServiceRole.entities.Venta.update(ventaPreloadId, {
        estado: 'procesando',
        metodo_pago: ventaData.metodo_pago,
        public_access_token: publicToken,
        total: ventaData.total,
        subtotal: ventaData.subtotal,
        impuesto: ventaData.impuesto,
        descuento_total: ventaData.descuento_total || 0,
        idempotency_key: idempotencyKey,
      });
    } else {
      // Nueva venta — estado inicial "procesando"
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
        estado: 'procesando',
        created_by_user_id: user.id,
        public_access_token: publicToken,
        idempotency_key: idempotencyKey,
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
      // Costo histórico snapshot: fuente de verdad para cálculo de margen
      let costoSnapshot = 0;
      if (item.tipo === 'producto' && item.referencia_id && inventarioSnapshots[item.referencia_id]) {
        costoSnapshot = inventarioSnapshots[item.referencia_id].invItem.costo_unitario || 0;
      }

      const itemCreado = await base44.asServiceRole.entities.VentaItem.create({
        organization_id: orgId,
        venta_id: ventaResult.id,
        tipo: item.tipo,
        referencia_id: item.referencia_id || null,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        subtotal: item.subtotal,
        costo_unitario_snapshot: costoSnapshot,
      });

      if (!itemCreado || !itemCreado.id) {
        throw new Error(`Error al crear item: ${item.descripcion}`);
      }
      itemsCreados.push(itemCreado);
    }

    // PASO C — Actualizar Inventario + registrar InventarioHistorial
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

      // Registrar historial de movimiento de inventario
      await base44.asServiceRole.entities.InventarioHistorial.create({
        organization_id: orgId,
        inventario_id: item.referencia_id,
        campo: 'cantidad_disponible',
        valor_anterior: String(stockAnterior),
        valor_nuevo: String(stockNuevo),
        modificado_por: user.id,
        motivo: `Venta - Ref: ${ventaResult.id}`,
      });
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

    // PASO E — Marcar Venta como "pagada" (último paso — confirma transacción completa)
    const ventaFinal = await base44.asServiceRole.entities.Venta.update(ventaResult.id, {
      estado: 'pagada',
    });

    // PASO F — Post-procesamiento operacional (desacoplado, non-blocking)
    // Invoca processPostSaleActions SOLO si la venta fue exitosa y commitada.
    // Fallos aquí NO afectan el resultado de la venta (ya está pagada).
    try {
      await base44.functions.invoke('processPostSaleActions', {
        sale_id: ventaResult.id,
      });
    } catch (postSaleError) {
      // Non-critical: loguear pero no interrumpir respuesta al cliente
      console.warn('[createSale] processPostSaleActions falló (non-critical):', postSaleError.message);
    }

    return Response.json({
      success: true,
      data: {
        ...(ventaFinal || ventaResult),
        items: itemsCreados,
      },
    }, { status: 201 });

  } catch (error) {
    // ROLLBACK MANUAL — revertir en orden inverso
    console.error('[createSale] ERROR — iniciando rollback:', {
      message: error.message,
      ventaId: ventaResult?.id,
      itemsCreados: itemsCreados.length,
      inventariosActualizados: inventariosActualizados.length,
    });

    // ROLLBACK 1 — Revertir stock de Inventario
    for (const inv of inventariosActualizados) {
      try {
        await base44.asServiceRole.entities.Inventario.update(inv.id, {
          cantidad_disponible: inv.stockAnterior,
        });
        console.warn(`[createSale] Rollback stock OK: ${inv.id} → ${inv.stockAnterior}`);
      } catch (rbError) {
        rollbackFailed = true;
        rollbackErrors.push(`stock:${inv.id}:${rbError.message}`);
        console.error(`[createSale] Rollback stock FALLÓ para ${inv.id}:`, rbError.message);
      }
    }

    // ROLLBACK 2 — Eliminar VentaItems creados
    for (const itemCreado of itemsCreados) {
      try {
        await base44.asServiceRole.entities.VentaItem.delete(itemCreado.id);
        console.warn(`[createSale] Rollback VentaItem OK: ${itemCreado.id}`);
      } catch (rbError) {
        rollbackFailed = true;
        rollbackErrors.push(`ventaitem:${itemCreado.id}:${rbError.message}`);
        console.error(`[createSale] Rollback VentaItem FALLÓ para ${itemCreado.id}:`, rbError.message);
      }
    }

    // ROLLBACK 3 — Eliminar Venta nueva o marcar como inconsistente si rollback falló
    if (ventaResult?.id) {
      if (!ventaPreloadId) {
        // Venta nueva: intentar eliminar
        try {
          await base44.asServiceRole.entities.Venta.delete(ventaResult.id);
          console.warn(`[createSale] Rollback Venta eliminada: ${ventaResult.id}`);
        } catch (rbError) {
          rollbackFailed = true;
          rollbackErrors.push(`venta_delete:${ventaResult.id}:${rbError.message}`);
          console.error(`[createSale] Rollback Venta DELETE FALLÓ para ${ventaResult.id}:`, rbError.message);

          // No se pudo eliminar — marcar como inconsistente para auditoría manual
          try {
            await base44.asServiceRole.entities.Venta.update(ventaResult.id, {
              estado: 'inconsistente',
              rollback_status: rollbackFailed ? 'failed' : 'partial',
              rollback_error: rollbackErrors.slice(0, 3).join(' | ').substring(0, 500),
            });
            console.error(`[createSale] Venta ${ventaResult.id} marcada como INCONSISTENTE. Requiere revisión manual.`);
          } catch (markError) {
            console.error(`[createSale] CRÍTICO: No se pudo marcar venta ${ventaResult.id} como inconsistente:`, markError.message);
          }
        }
      } else {
        // ventaPreloadId: no eliminar, solo revertir estado a borrador (o marcar inconsistente si rollback falló)
        const estadoRevertido = rollbackFailed ? 'inconsistente' : 'borrador';
        try {
          await base44.asServiceRole.entities.Venta.update(ventaResult.id, {
            estado: estadoRevertido,
            ...(rollbackFailed && {
              rollback_status: 'partial',
              rollback_error: rollbackErrors.slice(0, 3).join(' | ').substring(0, 500),
            }),
          });
          console.warn(`[createSale] Venta preload ${ventaResult.id} revertida a estado: ${estadoRevertido}`);
        } catch (revertError) {
          console.error(`[createSale] CRÍTICO: No se pudo revertir venta preload ${ventaResult.id}:`, revertError.message);
        }
      }
    }

    const rollbackStatus = rollbackFailed ? (rollbackErrors.length > 1 ? 'partial' : 'failed') : 'success';

    return Response.json({
      error: error.message || 'Error interno al procesar la venta',
      rollback: rollbackStatus,
      ...(rollbackFailed && { rollback_errors: rollbackErrors }),
    }, { status: 500 });
  }
});