import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveAuthorizedContext } from '../_shared/userAuthorization.ts';
import { applyInventoryStockCas, rollbackInventoryStockCas } from '../_shared/inventoryStockCas.ts';
import { getCanonicalBranchScope } from '../_shared/operationalAuthorization.ts';

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

  const authorization = await resolveAuthorizedContext(base44, user, { allowedRoles: ['ORG_ADMIN', 'BRANCH_ADMIN', 'INVENTORY'] });
  if (!authorization.ok) return Response.json({ error: authorization.error }, { status: authorization.status });
  const orgId = authorization.organizationId;

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
  const branchScope = getCanonicalBranchScope(authorization);
  if (!branchScope.ok) return Response.json({ error: branchScope.error, code: branchScope.code }, { status: branchScope.status });
  if (!branchScope.organizationWide && invItem.branch_id !== branchScope.branchId) {
    return Response.json({ error: 'El producto no pertenece a la sucursal autorizada', code: 'INVENTORY_CROSS_BRANCH_DENIED' }, { status: 403 });
  }
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

  // 6. ACTUALIZAR STOCK CON EL MISMO CAS CANONICO UTILIZADO POR ATOMIC SALE
  const operationId = `manual-adjust:${crypto.randomUUID()}`;
  const operationKey = crypto.randomUUID();
  const movementDate = new Date().toISOString().split('T')[0];
  let stockResult;
  try {
    stockResult = await applyInventoryStockCas(base44.asServiceRole.entities.Inventario, {
      inventoryId: inventario_id,
      organizationId: orgId,
      expectedStock: stockActual,
      newStock: stockNuevo,
      movementDate,
      operationId,
      operationKey,
    });
  } catch (updateError) {
    const [reconciled] = await base44.asServiceRole.entities.Inventario.filter({
      id: inventario_id,
      organization_id: orgId,
    }, 1);
    if (reconciled?.last_sale_id === operationId && reconciled?.last_sale_operation_key === operationKey) {
      stockResult = { updated: 1, recovered_ambiguous_update: true };
    } else {
      return Response.json({ error: `No se pudo confirmar el ajuste: ${updateError.message}` }, { status: 500 });
    }
  }

  if (stockResult?.updated !== 1) {
    const [current] = await base44.asServiceRole.entities.Inventario.filter({
      id: inventario_id,
      organization_id: orgId,
    }, 1);
    return Response.json({
      error: 'El inventario cambio durante el ajuste. Reintenta con el stock actualizado.',
      code: 'INVENTORY_CONCURRENT_UPDATE',
      stock_actual: current?.cantidad_disponible,
      retryable: true,
    }, { status: 409 });
  }

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
      stock_operation_id: operationId,
      stock_operation_key: operationKey,
    });
  } catch (historialError) {
    // ATOMICIDAD: revertir stock si falla el historial
    console.error('[adjustInventoryStock] CRÍTICO: Fallo en InventarioHistorial — revirtiendo stock:', historialError.message);

    try {
      const reverted = await rollbackInventoryStockCas(base44.asServiceRole.entities.Inventario, {
        inventoryId: inventario_id,
        organizationId: orgId,
        expectedCurrentStock: stockNuevo,
        previousStock: stockActual,
        previousMovementDate: invItem.fecha_ultimo_movimiento || null,
        operationId,
        operationKey,
      });
      if (reverted?.updated !== 1) throw new Error('CAS rollback ownership lost');
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
