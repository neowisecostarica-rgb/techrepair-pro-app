import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * adjustInventoryStock — Owner único de ajustes manuales de stock
 * ORT-v1.1A — Inventario Operacional Real
 *
 * Responsabilidades:
 *  1. Auth + organization_id válido
 *  2. Validar inventario_id pertenece a la org
 *  3. Validar delta > 0, tipo (entrada|salida), motivo obligatorio
 *  4. Prevenir stock negativo en salidas
 *  5. Actualizar Inventario.cantidad_disponible
 *  6. Crear InventarioHistorial — SIEMPRE, sin excepción
 *  7. Si falla historial → revertir stock (atomicidad)
 *
 * NO hace: purchase orders, reservas, costos, precios, suppliers
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

  const accounts = await base44.asServiceRole.entities.UserAccount.filter({ user_id: user.id, organization_id: orgId });
  const canManageInventory = user.is_super_admin === true || accounts.some(account =>
    account.role === 'ORG_ADMIN' && account.status !== 'suspended' && account.active !== false
  );
  if (!canManageInventory) {
    return Response.json({ error: 'Acceso denegado: se requiere ORG_ADMIN para modificar inventario' }, { status: 403 });
  }

  // 2. PARSE BODY
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 });
  }

  const { inventario_id, delta, tipo, motivo } = body;

  // 3. VALIDACIONES DE INPUT

  // inventario_id obligatorio
  if (!inventario_id || typeof inventario_id !== 'string') {
    return Response.json({ error: 'inventario_id es requerido' }, { status: 400 });
  }

  // tipo obligatorio: solo entrada | salida
  if (!tipo || !['entrada', 'salida'].includes(tipo)) {
    return Response.json({ error: 'tipo es requerido: "entrada" o "salida"' }, { status: 400 });
  }

  // delta: número positivo estricto
  if (delta === null || delta === undefined || typeof delta !== 'number' || isNaN(delta) || delta <= 0) {
    return Response.json({ error: 'delta debe ser un número mayor a 0' }, { status: 400 });
  }

  // motivo obligatorio
  if (!motivo || typeof motivo !== 'string' || !motivo.trim()) {
    return Response.json({ error: 'motivo es requerido' }, { status: 400 });
  }

  // 4. VALIDAR ITEM — existe y pertenece a la org
  const invResults = await base44.asServiceRole.entities.Inventario.filter({
    id: inventario_id,
    organization_id: orgId,
  });

  if (!invResults || invResults.length === 0) {
    return Response.json({
      error: 'Producto no encontrado en el inventario de esta organización',
    }, { status: 404 });
  }

  const invItem = invResults[0];
  const stockActual = invItem.cantidad_disponible ?? 0;

  // 5. CALCULAR NUEVO STOCK
  let stockNuevo;
  if (tipo === 'entrada') {
    stockNuevo = stockActual + delta;
  } else {
    // salida — prevenir stock negativo, sin excepción ni bypass
    if (stockActual - delta < 0) {
      return Response.json({
        error: `Stock insuficiente para salida. Disponible: ${stockActual}, solicitado: ${delta}`,
        stock_actual: stockActual,
      }, { status: 400 });
    }
    stockNuevo = stockActual - delta;
  }

  // 6. ACTUALIZAR STOCK
  await base44.asServiceRole.entities.Inventario.update(inventario_id, {
    cantidad_disponible: stockNuevo,
    fecha_ultimo_movimiento: new Date().toISOString().split('T')[0],
  });

  // 7. CREAR HISTORIAL — OBLIGATORIO. Si falla, revertir stock.
  try {
    const motivoFinal = `Ajuste Manual [${tipo === 'entrada' ? 'ENTRADA' : 'SALIDA'}] - ${motivo.trim()}`;

    await base44.asServiceRole.entities.InventarioHistorial.create({
      organization_id: orgId,
      inventario_id,
      campo: 'cantidad_disponible',
      valor_anterior: String(stockActual),
      valor_nuevo: String(stockNuevo),
      modificado_por: user.id,
      motivo: motivoFinal,
    });
  } catch (historialError) {
    // ATOMICIDAD: revertir stock si falla el historial
    console.error('[adjustInventoryStock] CRÍTICO: Fallo en InventarioHistorial — revirtiendo stock:', historialError.message);

    try {
      await base44.asServiceRole.entities.Inventario.update(inventario_id, {
        cantidad_disponible: stockActual,
        fecha_ultimo_movimiento: invItem.fecha_ultimo_movimiento || null,
      });
    } catch (revertError) {
      console.error('[adjustInventoryStock] CRÍTICO: No se pudo revertir stock:', revertError.message);
      return Response.json({
        error: 'Error crítico: Stock actualizado pero historial fallido y reversión fallida. Revisar manualmente.',
        stock_anterior: stockActual,
        stock_aplicado: stockNuevo,
      }, { status: 500 });
    }

    return Response.json({
      error: 'No se pudo registrar el historial del ajuste. Operación revertida sin cambios.',
    }, { status: 500 });
  }

  return Response.json({
    success: true,
    inventario_id,
    tipo,
    delta,
    stock_anterior: stockActual,
    stock_nuevo: stockNuevo,
    producto: invItem.nombre,
  }, { status: 200 });
});
