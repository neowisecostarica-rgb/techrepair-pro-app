-- =========================================================
-- MIGRACIÓN 001 — Tablas de Ventas
-- Ejecutar en la base de datos PostgreSQL del SOT en Render
-- =========================================================

-- ───────────────────────────────────────────
-- 1. SALES
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       TEXT NOT NULL,
  branch_id             TEXT,
  client_id             TEXT,
  work_order_id         TEXT,
  diagnostic_id         TEXT,
  quote_id              TEXT,
  origen_venta          TEXT NOT NULL DEFAULT 'store',
  origen_detalle        TEXT NOT NULL DEFAULT 'POS_DIRECT',
  tipo_concepto         TEXT NOT NULL DEFAULT 'product_sale',
  total                 NUMERIC(12, 2) NOT NULL,
  subtotal              NUMERIC(12, 2) NOT NULL,
  tax                   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount              NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_method        TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'paid',
  notes                 TEXT,
  created_by_user_id    TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_org         ON sales (organization_id);
CREATE INDEX IF NOT EXISTS idx_sales_client      ON sales (client_id);
CREATE INDEX IF NOT EXISTS idx_sales_work_order  ON sales (work_order_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at  ON sales (created_at DESC);

-- ───────────────────────────────────────────
-- 2. SALE_ITEMS
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sale_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id               UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  organization_id       TEXT NOT NULL,
  item_type             TEXT NOT NULL DEFAULT 'product',  -- 'product' | 'service'
  inventory_item_id     TEXT,                              -- FK lógica a inventario (Base44 o tabla propia)
  description           TEXT NOT NULL,
  quantity              NUMERIC(10, 3) NOT NULL,
  unit_price            NUMERIC(12, 2) NOT NULL,
  subtotal              NUMERIC(12, 2) NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items (sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_inv_id  ON sale_items (inventory_item_id);

-- ───────────────────────────────────────────
-- 3. INVENTORY_MOVEMENTS
-- Registra cada entrada/salida de inventario
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_movements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       TEXT NOT NULL,
  inventario_id         TEXT NOT NULL,     -- ID del ítem en inventario
  tipo_movimiento       TEXT NOT NULL,     -- 'salida' | 'entrada' | 'ajuste'
  cantidad              NUMERIC(10, 3) NOT NULL,
  stock_anterior        NUMERIC(10, 3) NOT NULL,
  stock_nuevo           NUMERIC(10, 3) NOT NULL,
  motivo                TEXT NOT NULL,     -- 'venta', 'compra', 'ajuste_manual', etc.
  referencia_id         TEXT,              -- ID de la venta, OT, etc.
  referencia_tipo       TEXT,              -- 'Venta', 'OrdenTrabajo', etc.
  created_by            TEXT,              -- email del usuario
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_mov_org        ON inventory_movements (organization_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_inv_id     ON inventory_movements (inventario_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_ref_id     ON inventory_movements (referencia_id);

-- ───────────────────────────────────────────
-- 4. TABLA INVENTARIO (si no existe aún)
-- Debe tener al menos estas columnas para que el servicio funcione.
-- Si ya tienes una tabla inventario, verifica que existan estas columnas.
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventario (
  id                    TEXT PRIMARY KEY,
  organization_id       TEXT NOT NULL,
  nombre                TEXT NOT NULL,
  tipo_item             TEXT NOT NULL DEFAULT 'producto',  -- 'producto' | 'servicio_diagnostico' | 'servicio_estandar'
  cantidad_disponible   NUMERIC(10, 3) NOT NULL DEFAULT 0,
  fecha_ultimo_movimiento DATE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- Agrega las demás columnas que ya tengas
);

CREATE INDEX IF NOT EXISTS idx_inventario_org ON inventario (organization_id);

-- ───────────────────────────────────────────
-- 5. TABLA CLIENTES (si no existe aún)
-- ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clientes (
  id                    TEXT PRIMARY KEY,
  organization_id       TEXT NOT NULL,
  nombre_completo       TEXT NOT NULL
  -- Agrega las demás columnas que ya tengas
);