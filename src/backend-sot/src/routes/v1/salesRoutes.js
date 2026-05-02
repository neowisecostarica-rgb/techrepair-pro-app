// src/routes/v1/salesRoutes.js
// Define las rutas del módulo de ventas bajo /v1/sales

import express from 'express';
import * as saleController from '../../controllers/saleController';

// El middleware de autenticación (authMiddleware) debe existir en el proyecto SOT.
// Se espera que popule req.user = { id, email, organization_id, role }.
// Si tu middleware ya está aplicado globalmente en app.js, puedes omitirlo aquí.
import { authMiddleware } from '../../middlewares/auth';

const router = express.Router();

/**
 * POST /v1/sales
 * Crea una venta con transacción atómica:
 * venta + ítems + descuento de stock + movimiento de inventario
 */
router.post('/', authMiddleware, saleController.createSale);

export default router;