-- =============================================
-- MIGRATION 082: VELOCITY CALCULATION FUNCTIONS
-- =============================================
-- Purpose: Create SQL functions to calculate velocity metrics
-- from finale_stock_history data
-- =============================================

-- =============================================
-- VELOCITY CALCULATION FUNCTION
-- =============================================
-- Calculates 30/60/90 day usage from stock history
CREATE OR REPLACE FUNCTION calculate_product_velocity(p_product_url TEXT)
RETURNS TABLE(
  usage_30d DECIMAL,
  usage_60d DECIMAL,
  usage_90d DECIMAL,
  daily_velocity DECIMAL,
  velocity_trend DECIMAL
) AS $$
DECLARE
  v_usage_30d DECIMAL := 0;
  v_usage_60d DECIMAL := 0;
  v_usage_90d DECIMAL := 0;
BEGIN
  -- Calculate 30-day usage (sum of negative quantities = outbound)
  SELECT COALESCE(SUM(ABS(quantity)), 0) INTO v_usage_30d
  FROM finale_stock_history
  WHERE finale_product_url = p_product_url
    AND quantity < 0  -- Outbound transactions
    AND transaction_date >= NOW() - INTERVAL '30 days';
  
  -- Calculate 60-day usage
  SELECT COALESCE(SUM(ABS(quantity)), 0) INTO v_usage_60d
  FROM finale_stock_history
  WHERE finale_product_url = p_product_url
    AND quantity < 0
    AND transaction_date >= NOW() - INTERVAL '60 days';
  
  -- Calculate 90-day usage
  SELECT COALESCE(SUM(ABS(quantity)), 0) INTO v_usage_90d
  FROM finale_stock_history
  WHERE finale_product_url = p_product_url
    AND quantity < 0
    AND transaction_date >= NOW() - INTERVAL '90 days';
  
  RETURN QUERY SELECT 
    v_usage_30d,
    v_usage_60d,
    v_usage_90d,
    v_usage_30d / 30.0 as daily_velocity,
    CASE 
      WHEN v_usage_60d - v_usage_30d > 0 THEN
        ((v_usage_30d - (v_usage_60d - v_usage_30d)) / NULLIF(v_usage_60d - v_usage_30d, 0)) * 100
      ELSE 0
    END as velocity_trend;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- BATCH VELOCITY UPDATE FUNCTION
-- =============================================
-- Updates velocity fields in inventory_items from stock history
CREATE OR REPLACE FUNCTION refresh_inventory_velocity()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  -- Update inventory_items with calculated velocity
  WITH velocity_calc AS (
    SELECT 
      fp.product_id as sku,
      COALESCE(SUM(CASE 
        WHEN fsh.transaction_date >= NOW() - INTERVAL '30 days' 
        AND fsh.quantity < 0 
        THEN ABS(fsh.quantity) 
        ELSE 0 
      END), 0) as sales_30d,
      COALESCE(SUM(CASE 
        WHEN fsh.transaction_date >= NOW() - INTERVAL '60 days' 
        AND fsh.quantity < 0 
        THEN ABS(fsh.quantity) 
        ELSE 0 
      END), 0) as sales_60d,
      COALESCE(SUM(CASE 
        WHEN fsh.transaction_date >= NOW() - INTERVAL '90 days' 
        AND fsh.quantity < 0 
        THEN ABS(fsh.quantity) 
        ELSE 0 
      END), 0) as sales_90d
    FROM finale_products fp
    LEFT JOIN finale_stock_history fsh 
      ON fp.finale_product_url = fsh.finale_product_url
    GROUP BY fp.product_id
  )
  UPDATE inventory_items ii
  SET 
    sales_30_days = vc.sales_30d,
    sales_60_days = vc.sales_60d,
    sales_90_days = vc.sales_90d,
    sales_velocity = vc.sales_30d / 30.0,
    updated_at = NOW()
  FROM velocity_calc vc
  WHERE ii.sku = vc.sku
    AND (
      ii.sales_30_days IS DISTINCT FROM vc.sales_30d
      OR ii.sales_60_days IS DISTINCT FROM vc.sales_60d
      OR ii.sales_90_days IS DISTINCT FROM vc.sales_90d
    );
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  
  RAISE NOTICE 'Updated velocity for % inventory items', updated_count;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- ADD MISSING COLUMNS TO inventory_items
-- =============================================
ALTER TABLE inventory_items 
  ADD COLUMN IF NOT EXISTS sales_30_days DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_60_days DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_90_days DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sales_velocity DECIMAL(12,4) DEFAULT 0;

-- =============================================
-- VELOCITY SUMMARY VIEW
-- =============================================
CREATE OR REPLACE VIEW inventory_velocity_summary AS
SELECT 
  ii.sku,
  ii.name,
  ii.category,
  ii.stock,
  ii.sales_30_days,
  ii.sales_60_days,
  ii.sales_90_days,
  ii.sales_velocity,
  -- Days of stock remaining
  CASE 
    WHEN ii.sales_velocity > 0 THEN ROUND(ii.stock / ii.sales_velocity)
    ELSE NULL
  END as days_of_stock,
  -- ABC classification
  CASE
    WHEN ii.sales_velocity >= 10 THEN 'A - High Velocity'
    WHEN ii.sales_velocity >= 3 THEN 'B - Medium Velocity'
    WHEN ii.sales_velocity >= 0.5 THEN 'C - Low Velocity'
    WHEN ii.sales_velocity > 0 THEN 'D - Very Low Velocity'
    ELSE 'F - No Movement'
  END as velocity_class,
  -- Reorder urgency
  CASE
    WHEN ii.stock <= 0 THEN 'OUT_OF_STOCK'
    WHEN ii.sales_velocity > 0 AND (ii.stock / ii.sales_velocity) <= 7 THEN 'CRITICAL'
    WHEN ii.sales_velocity > 0 AND (ii.stock / ii.sales_velocity) <= 14 THEN 'LOW'
    WHEN ii.sales_velocity > 0 AND (ii.stock / ii.sales_velocity) <= 30 THEN 'WATCH'
    ELSE 'OK'
  END as reorder_urgency
FROM inventory_items ii
WHERE ii.stock > 0 OR ii.sales_velocity > 0
ORDER BY ii.sales_velocity DESC NULLS LAST;

-- =============================================
-- INDEX FOR VELOCITY QUERIES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_inventory_items_velocity 
  ON inventory_items(sales_velocity DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_stock_history_velocity 
  ON finale_stock_history(finale_product_url, transaction_date, quantity)
  WHERE quantity < 0;

-- =============================================
-- UPDATE SYNC SCHEDULE TO INCLUDE SHIPMENTS
-- =============================================
-- Add shipment sync to the hourly schedule
-- This adds transaction history needed for velocity calculations

-- Remove old schedule if exists
SELECT cron.unschedule('finale-shipment-sync') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'finale-shipment-sync'
);

-- Schedule shipment sync every 6 hours (less frequent - historical data)
SELECT cron.schedule(
  'finale-shipment-sync',
  '0 6,12,18,0 * * *',  -- Run at 6am, 12pm, 6pm, midnight UTC
  $$SELECT trigger_shipment_sync()$$
);

-- Function to trigger shipment sync
CREATE OR REPLACE FUNCTION trigger_shipment_sync()
RETURNS JSONB AS $$
DECLARE
  supabase_url TEXT;
  request_id BIGINT;
BEGIN
  supabase_url := current_setting('app.settings.supabase_url', TRUE);
  
  IF supabase_url IS NULL THEN
    supabase_url := 'https://mpuevsmtowyexhsqugkm.supabase.co';
  END IF;
  
  -- Make HTTP request to sync-finale-shipments function
  SELECT net.http_post(
    url := supabase_url || '/functions/v1/sync-finale-shipments',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('daysBack', 90)
  ) INTO request_id;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Shipment sync triggered',
    'request_id', request_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- DOCUMENTATION
-- =============================================
COMMENT ON FUNCTION calculate_product_velocity(TEXT) IS 'Calculates 30/60/90 day velocity for a single product';
COMMENT ON FUNCTION refresh_inventory_velocity() IS 'Batch updates all inventory items with velocity from stock history';
COMMENT ON VIEW inventory_velocity_summary IS 'Summary view of inventory with velocity metrics and reorder urgency';

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 082: Velocity calculation functions complete';
  RAISE NOTICE '  ✓ calculate_product_velocity() function created';
  RAISE NOTICE '  ✓ refresh_inventory_velocity() function created';
  RAISE NOTICE '  ✓ inventory_velocity_summary view created';
  RAISE NOTICE '  ✓ Shipment sync scheduled every 6 hours';
  RAISE NOTICE '  ✓ Velocity indexes created';
END $$;
