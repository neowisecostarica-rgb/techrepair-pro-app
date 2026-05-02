// src/services/saleService.js
// Lógica de negocio para el módulo de ventas.
// Coordina modelos, ejecuta la transacción atómica y maneja errores de negocio.

import db from '../db';
import * as saleModel from '../models/saleModel';
import * as saleItemModel from '../models/saleItemModel';
import * as inventoryModel from '../models/inventoryModel';

/**
 * Crea una venta de forma atómica:
 * 1. Valida cliente (si aplica)
 * 2. Valida y bloquea stock (SELECT FOR UPDATE) por ítem de producto
 * 3. INSERT sales
 * 4. INSERT sale_items (N ítems)
 * 5. UPDATE inventario (descuento de stock)
 * 6. INSERT inventory_movements
 * Todo dentro de BEGIN/COMMIT — ROLLBACK automático si cualquier paso falla.
 *
 * @param {object} saleData - datos de la venta (ver saleController)
 * @param {string} userId   - id del usuario autenticado
 * @param {string} userEmail
 * @param {string} organizationId
 * @returns {object} venta creada + items
 * @throws {Error} con mensaje legible para el cliente
 */
async function createSale(saleData, userId, userEmail, organizationId) {
  const {
    client_id,
    work_order_id,
    diagnostic_id,
    quote_id,
    branch_id,
    payment_method,
    total,
    subtotal,
    tax = 0,
    discount = 0,
    notes,
    origen_venta = 'store',
    origen_detalle = 'POS_DIRECT',
    tipo_concepto = 'product_sale',
    items,
  } = saleData;

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // ─────────────────────────────────────────────
    // PASO 1 — Validar cliente (si se provee)
    // ─────────────────────────────────────────────
    if (client_id) {
      const clienteValido = await inventoryModel.validateClient(client_id, organizationId, client);
      if (!clienteValido) {
        throw Object.assign(
          new Error(`Cliente "${client_id}" no encontrado o no pertenece a la organización`),
          { statusCode: 400 }
        );
      }
    }

    // ─────────────────────────────────────────────
    // PASO 2 — Validar y bloquear stock (SELECT FOR UPDATE)
    // Acumulamos snapshots para no hacer un doble SELECT después
    // ─────────────────────────────────────────────
    const inventorySnapshots = {}; // { [inventory_item_id]: row }

    for (const item of items) {
      if (!item.inventory_item_id) continue; // servicios: skip stock

      const invItem = await inventoryModel.lockInventoryItem(
        item.inventory_item_id,
        organizationId,
        client
      );

      if (!invItem) {
        throw Object.assign(
          new Error(`Ítem de inventario "${item.inventory_item_id}" no encontrado o no pertenece a la organización`),
          { statusCode: 400 }
        );
      }

      // Solo productos físicos requieren validación de stock
      if (invItem.tipo_item === 'producto') {
        const stockDisponible = parseFloat(invItem.cantidad_disponible) || 0;
        if (item.quantity > stockDisponible) {
          throw Object.assign(
            new Error(
              `Stock insuficiente para "${invItem.nombre}": disponible ${stockDisponible}, solicitado ${item.quantity}`
            ),
            { statusCode: 400 }
          );
        }
      }

      inventorySnapshots[item.inventory_item_id] = invItem;
    }

    // ─────────────────────────────────────────────
    // PASO 3 — Crear la Venta
    // ─────────────────────────────────────────────
    const newSale = await saleModel.createSale(
      {
        organization_id: organizationId,
        branch_id,
        client_id,
        work_order_id,
        diagnostic_id,
        quote_id,
        origen_venta,
        origen_detalle,
        tipo_concepto,
        total,
        subtotal: subtotal !== undefined ? subtotal : total,
        tax,
        discount,
        payment_method,
        notes,
        created_by_user_id: userId,
      },
      client
    );

    // ─────────────────────────────────────────────
    // PASO 4 — Crear ítems de la venta
    // ─────────────────────────────────────────────
    const createdItems = [];

    for (const item of items) {
      const createdItem = await saleItemModel.createSaleItem(
        newSale.id,
        organizationId,
        item,
        client
      );
      createdItems.push(createdItem);
    }

    // ─────────────────────────────────────────────
    // PASO 5+6 — Descontar stock + registrar movimientos
    // Solo para ítems con inventory_item_id de tipo 'producto'
    // ─────────────────────────────────────────────
    for (const item of items) {
      if (!item.inventory_item_id) continue;

      const invItem = inventorySnapshots[item.inventory_item_id];
      if (!invItem || invItem.tipo_item !== 'producto') continue;

      const stockBefore = parseFloat(invItem.cantidad_disponible) || 0;
      const stockAfter = stockBefore - item.quantity;

      // Descontar stock (UPDATE)
      await inventoryModel.deductStock(item.inventory_item_id, item.quantity, client);

      // Registrar movimiento (INSERT)
      await inventoryModel.createInventoryMovement({
        organizationId,
        inventarioId: item.inventory_item_id,
        saleId: newSale.id,
        quantity: item.quantity,
        stockBefore,
        stockAfter,
        createdBy: userEmail,
        client,
      });
    }

    // ─────────────────────────────────────────────
    // COMMIT — todas las operaciones completadas
    // ─────────────────────────────────────────────
    await client.query('COMMIT');

    return {
      ...newSale,
      items: createdItems,
    };

  } catch (error) {
    // ROLLBACK automático — PostgreSQL revierte TODO lo que ocurrió desde BEGIN
    await client.query('ROLLBACK');
    console.error('[saleService.createSale] ROLLBACK ejecutado:', error.message);
    throw error; // Re-lanzar para que el controlador responda al cliente

  } finally {
    client.release(); // Siempre liberar el cliente al pool
  }
}

export { createSale };