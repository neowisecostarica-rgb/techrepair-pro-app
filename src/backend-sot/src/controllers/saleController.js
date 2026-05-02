// src/controllers/saleController.js
// Maneja HTTP request/response para el módulo de ventas.
// Extrae y valida inputs — delega lógica a saleService.

import saleService from '../services/saleService';

/**
 * POST /v1/sales
 *
 * Body esperado:
 * {
 *   payment_method: string (requerido)
 *   total: number (requerido)
 *   subtotal?: number
 *   tax?: number
 *   discount?: number
 *   client_id?: string
 *   work_order_id?: string
 *   diagnostic_id?: string
 *   quote_id?: string
 *   branch_id?: string
 *   origen_venta?: 'store' | 'workshop'
 *   origen_detalle?: 'POS_DIRECT' | 'FROM_QUOTE' | 'FROM_OT'
 *   tipo_concepto?: 'product_sale' | 'repair' | 'diagnostic_review' | 'other'
 *   notes?: string
 *   items: Array<{
 *     description: string (requerido)
 *     quantity: number (requerido, > 0)
 *     unit_price: number (requerido)
 *     subtotal?: number
 *     inventory_item_id?: string
 *     tipo?: 'product' | 'service'
 *   }>
 * }
 *
 * El middleware de auth debe poblar req.user con { id, email, organization_id }
 */
async function createSale(req, res) {
  // ─── Extraer usuario autenticado ───────────────────────────────────────────
  const user = req.user;
  if (!user || !user.id) {
    return res.status(401).json({ success: false, error: 'No autenticado' });
  }

  const organizationId = user.organization_id;
  if (!organizationId) {
    return res.status(400).json({ success: false, error: 'organization_id requerido' });
  }

  // ─── Extraer y validar body ────────────────────────────────────────────────
  const {
    payment_method,
    total,
    items,
    ...rest
  } = req.body;

  if (!payment_method) {
    return res.status(400).json({ success: false, error: 'payment_method es requerido' });
  }

  if (total === undefined || total === null) {
    return res.status(400).json({ success: false, error: 'total es requerido' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'items es requerido y no puede estar vacío' });
  }

  // Validar estructura básica de cada ítem
  for (const item of items) {
    if (!item.description) {
      return res.status(400).json({ success: false, error: 'Cada item debe tener description' });
    }
    if (!item.quantity || item.quantity <= 0) {
      return res.status(400).json({
        success: false,
        error: `Item "${item.description}": quantity debe ser mayor a 0`,
      });
    }
    if (item.unit_price === undefined || item.unit_price === null) {
      return res.status(400).json({
        success: false,
        error: `Item "${item.description}": unit_price es requerido`,
      });
    }
  }

  // ─── Delegar al servicio ───────────────────────────────────────────────────
  try {
    const sale = await saleService.createSale(
      { payment_method, total, items, ...rest },
      user.id,
      user.email,
      organizationId
    );

    return res.status(201).json({ success: true, data: sale });

  } catch (error) {
    const status = error.statusCode || 500;
    console.error('[saleController.createSale] Error:', error.message);

    return res.status(status).json({
      success: false,
      error: error.message || 'Error interno al procesar la venta',
    });
  }
}

export { createSale };