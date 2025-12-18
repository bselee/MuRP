-- Migration 099: Add consumption fields to inventory_items
-- These fields will be populated from Finale's Internal Notes during sync

-- Add consumption and receipt tracking columns to inventory_items
ALTER TABLE inventory_items
ADD COLUMN IF NOT EXISTS daily_consumption NUMERIC(12,6) DEFAULT 0,
ADD COLUMN IF NOT EXISTS consumption_30day NUMERIC(12,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS consumption_90day NUMERIC(12,4) DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_build_consumption NUMERIC(12,4),
ADD COLUMN IF NOT EXISTS last_received_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS supplier_lead_time_days INTEGER DEFAULT 14;

-- Add comments
COMMENT ON COLUMN inventory_items.daily_consumption IS 'Daily consumption rate from Finale Internal Notes';
COMMENT ON COLUMN inventory_items.consumption_30day IS '30-day consumption from Finale Internal Notes';
COMMENT ON COLUMN inventory_items.consumption_90day IS '90-day consumption from Finale Internal Notes';
COMMENT ON COLUMN inventory_items.avg_build_consumption IS 'Average consumption per BOM build';
COMMENT ON COLUMN inventory_items.last_received_at IS 'Date of last PO receipt for this SKU';
COMMENT ON COLUMN inventory_items.supplier_lead_time_days IS 'Supplier lead time from Finale';

-- Create index for quick lookup of items needing reorder
CREATE INDEX IF NOT EXISTS idx_inventory_consumption
ON inventory_items(daily_consumption DESC)
WHERE daily_consumption > 0;

-- Update the product_reorder_analytics view to include inventory_items consumption data
-- This allows the view to use either logged consumption OR synced Finale consumption
CREATE OR REPLACE VIEW product_reorder_analytics AS
WITH purchase_stats AS (
  SELECT
    sku,
    COUNT(*) as purchase_count,
    AVG(lead_time_days) as avg_lead_time_days,
    MIN(lead_time_days) as min_lead_time_days,
    MAX(lead_time_days) as max_lead_time_days,
    AVG(unit_cost) as avg_unit_cost,
    MAX(received_at) as last_received_at,
    SUM(quantity_purchased) as total_purchased_qty
  FROM product_purchase_log
  WHERE received_at IS NOT NULL
  GROUP BY sku
),
consumption_stats AS (
  SELECT
    sku,
    COUNT(*) as consumption_count,
    SUM(quantity_consumed) as total_consumed_qty,
    AVG(quantity_consumed) as avg_consumption_qty,
    SUM(CASE WHEN consumed_at >= NOW() - INTERVAL '30 days' THEN quantity_consumed ELSE 0 END) as consumed_last_30_days,
    SUM(CASE WHEN consumed_at >= NOW() - INTERVAL '90 days' THEN quantity_consumed ELSE 0 END) as consumed_last_90_days,
    MAX(consumed_at) as last_consumed_at
  FROM product_consumption_log
  GROUP BY sku
),
current_inventory AS (
  SELECT
    sku,
    name as product_name,
    units_in_stock as quantity_on_hand,
    units_available as available_quantity,
    reorder_point,
    qty_to_order as max_stock_level,
    -- Finale consumption data (synced from Internal Notes)
    daily_consumption as finale_daily_consumption,
    consumption_30day as finale_consumption_30day,
    consumption_90day as finale_consumption_90day,
    avg_build_consumption as finale_avg_build_consumption,
    last_received_at as finale_last_received_at,
    supplier_lead_time_days as finale_lead_time_days
  FROM inventory_items
)
SELECT
  i.sku,
  i.product_name,
  i.quantity_on_hand,
  i.available_quantity,
  i.reorder_point,
  i.max_stock_level,

  -- Purchase metrics (prefer logged data, fallback to Finale data)
  COALESCE(p.purchase_count, 0) as purchase_count,
  COALESCE(p.avg_lead_time_days, i.finale_lead_time_days, 14) as avg_lead_time_days,
  COALESCE(p.min_lead_time_days, i.finale_lead_time_days, 14) as min_lead_time_days,
  COALESCE(p.max_lead_time_days, i.finale_lead_time_days, 14) as max_lead_time_days,
  COALESCE(p.avg_unit_cost, 0) as avg_unit_cost,
  COALESCE(p.last_received_at, i.finale_last_received_at) as last_received_at,
  COALESCE(p.total_purchased_qty, 0) as total_purchased_qty,

  -- Consumption metrics (prefer logged data, fallback to Finale data)
  COALESCE(c.consumption_count, 0) as consumption_count,
  COALESCE(c.total_consumed_qty, 0) as total_consumed_qty,
  COALESCE(c.avg_consumption_qty, i.finale_avg_build_consumption, 0) as avg_consumption_qty,
  COALESCE(c.consumed_last_30_days, i.finale_consumption_30day, 0) as consumed_last_30_days,
  COALESCE(c.consumed_last_90_days, i.finale_consumption_90day, 0) as consumed_last_90_days,
  c.last_consumed_at,

  -- Daily consumption rate (prefer logged, fallback to Finale)
  COALESCE(
    NULLIF(c.consumed_last_30_days / 30.0, 0),
    i.finale_daily_consumption,
    0
  ) as daily_consumption_rate,

  -- Days of stock remaining
  CASE
    WHEN COALESCE(NULLIF(c.consumed_last_30_days / 30.0, 0), i.finale_daily_consumption, 0) > 0
         AND i.available_quantity > 0
    THEN (i.available_quantity / COALESCE(NULLIF(c.consumed_last_30_days / 30.0, 0), i.finale_daily_consumption))
    ELSE 999
  END as days_of_stock_remaining,

  -- Suggested reorder point
  CASE
    WHEN COALESCE(NULLIF(c.consumed_last_30_days / 30.0, 0), i.finale_daily_consumption, 0) > 0
         AND COALESCE(p.avg_lead_time_days, i.finale_lead_time_days, 14) > 0
    THEN CEIL(
      COALESCE(NULLIF(c.consumed_last_30_days / 30.0, 0), i.finale_daily_consumption)
      * (COALESCE(p.avg_lead_time_days, i.finale_lead_time_days, 14) + 7)
    )
    ELSE i.reorder_point
  END as suggested_reorder_point,

  -- Suggested max stock
  CASE
    WHEN COALESCE(c.consumed_last_90_days, i.finale_consumption_90day, 0) > 0
    THEN CEIL((COALESCE(c.consumed_last_90_days, i.finale_consumption_90day) / 90.0) * 90)
    ELSE i.max_stock_level
  END as suggested_max_stock,

  -- Reorder status
  CASE
    WHEN i.available_quantity <= 0 THEN 'OUT_OF_STOCK'
    WHEN i.available_quantity <= (COALESCE(i.reorder_point, 0) * 0.5) THEN 'CRITICAL'
    WHEN i.available_quantity <= COALESCE(i.reorder_point, 0) THEN 'REORDER_NOW'
    WHEN i.available_quantity <= (COALESCE(i.reorder_point, 0) * 1.5) THEN 'REORDER_SOON'
    ELSE 'OK'
  END as reorder_status

FROM current_inventory i
LEFT JOIN purchase_stats p ON i.sku = p.sku
LEFT JOIN consumption_stats c ON i.sku = c.sku;

-- Grant access
GRANT SELECT ON product_reorder_analytics TO authenticated;
