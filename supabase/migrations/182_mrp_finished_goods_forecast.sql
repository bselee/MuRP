-- ============================================================================
-- FINISHED GOODS DEMAND ENGINE
-- What we expect to SELL drives everything downstream
-- ============================================================================

-- Finished goods forecast table - weekly demand buckets
CREATE TABLE IF NOT EXISTS finished_goods_forecast (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id VARCHAR(100) NOT NULL,          -- Finale SKU (CRAFT8, BLU101, etc.)
  forecast_period DATE NOT NULL,             -- Weekly buckets

  -- DEMAND SIGNALS
  base_forecast INTEGER NOT NULL DEFAULT 0,  -- Statistical baseline
  sales_order_demand INTEGER DEFAULT 0,      -- Committed orders not yet shipped
  safety_stock_target INTEGER DEFAULT 0,     -- Buffer we want to maintain
  promotional_lift INTEGER DEFAULT 0,        -- Known upcoming spikes

  -- CALCULATED
  gross_requirement INTEGER GENERATED ALWAYS AS
    (base_forecast + sales_order_demand + safety_stock_target + promotional_lift) STORED,

  -- SEASONALITY
  seasonal_index DECIMAL(4,2) DEFAULT 1.00,  -- 1.5 = 50% above normal

  -- TRACKING
  forecast_confidence VARCHAR(20) DEFAULT 'medium',  -- high/medium/low
  forecast_method VARCHAR(50),               -- 'historical_avg', 'trend', 'manual'
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint on product + period
  UNIQUE(product_id, forecast_period)
);

-- Indexes for performance
CREATE INDEX idx_fg_forecast_product ON finished_goods_forecast(product_id);
CREATE INDEX idx_fg_forecast_period ON finished_goods_forecast(forecast_period);
CREATE INDEX idx_fg_forecast_gross_req ON finished_goods_forecast(gross_requirement DESC);

-- Seasonal indices by month and category
CREATE TABLE IF NOT EXISTS seasonal_indices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  category VARCHAR(100) NOT NULL,           -- 'soil', 'irrigation', 'nutrients', 'lighting', etc.
  index_value DECIMAL(4,2) NOT NULL,        -- 1.0 = normal, 1.5 = 50% above
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(month, category)
);

-- Pre-populate BuildASoil's seasonal patterns for soil category
INSERT INTO seasonal_indices (month, category, index_value, notes) VALUES
  (1, 'soil', 0.60, 'Winter lull - indoor grows prep'),
  (2, 'soil', 0.80, 'Early planners'),
  (3, 'soil', 1.40, 'Spring ramp begins'),
  (4, 'soil', 1.80, 'Peak season starts'),
  (5, 'soil', 1.90, 'Peak - outdoor planting'),
  (6, 'soil', 1.50, 'Late planters'),
  (7, 'soil', 0.90, 'Mid-season maintenance'),
  (8, 'soil', 0.80, 'Harvest prep'),
  (9, 'soil', 0.70, 'Post-harvest'),
  (10, 'soil', 0.75, 'Fall indoor setup'),
  (11, 'soil', 0.65, 'Black Friday spike'),
  (12, 'soil', 0.50, 'Holiday slowdown')
ON CONFLICT (month, category) DO NOTHING;

-- Default seasonal pattern (all products baseline)
INSERT INTO seasonal_indices (month, category, index_value, notes) VALUES
  (1, 'default', 0.70, 'Post-holiday slow'),
  (2, 'default', 0.85, 'Picking up'),
  (3, 'default', 1.20, 'Spring begins'),
  (4, 'default', 1.50, 'Peak growing season'),
  (5, 'default', 1.60, 'Peak'),
  (6, 'default', 1.30, 'Tapering'),
  (7, 'default', 1.00, 'Normal'),
  (8, 'default', 0.90, 'Pre-harvest'),
  (9, 'default', 0.80, 'Harvest'),
  (10, 'default', 0.85, 'Fall prep'),
  (11, 'default', 0.90, 'Black Friday'),
  (12, 'default', 0.60, 'Holiday slow')
ON CONFLICT (month, category) DO NOTHING;

-- Enable RLS
ALTER TABLE finished_goods_forecast ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasonal_indices ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Allow all access to finished_goods_forecast"
  ON finished_goods_forecast FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to seasonal_indices"
  ON seasonal_indices FOR ALL
  USING (true) WITH CHECK (true);

-- Function to generate forecast from historical data
CREATE OR REPLACE FUNCTION generate_finished_goods_forecast(
  p_horizon_weeks INTEGER DEFAULT 13,  -- 13 weeks = ~3 months
  p_lookback_days INTEGER DEFAULT 90
)
RETURNS INTEGER AS $$
DECLARE
  v_records_created INTEGER := 0;
  v_product RECORD;
  v_week_start DATE;
  v_base_forecast INTEGER;
  v_seasonal_idx DECIMAL;
BEGIN
  -- For each BOM finished SKU with sales history
  FOR v_product IN
    SELECT
      b.finished_sku,
      i.category,
      COALESCE(i.sales_last_30_days, 0) / 30.0 AS daily_demand,
      COALESCE(i.sales_last_90_days, 0) / 90.0 AS avg_daily_90
    FROM boms b
    LEFT JOIN inventory_items i ON b.finished_sku = i.sku
    WHERE b.is_active = TRUE
      AND (i.sales_last_30_days > 0 OR i.sales_last_90_days > 0)
  LOOP
    -- Generate forecast for each week
    FOR w IN 0..p_horizon_weeks-1 LOOP
      v_week_start := DATE_TRUNC('week', CURRENT_DATE + (w * 7)::integer)::DATE;

      -- Base forecast = weekly demand (daily * 7)
      v_base_forecast := CEIL(v_product.daily_demand * 7);

      -- Get seasonal index for this month/category
      SELECT COALESCE(si.index_value, 1.0) INTO v_seasonal_idx
      FROM seasonal_indices si
      WHERE si.month = EXTRACT(MONTH FROM v_week_start)
        AND si.category = COALESCE(v_product.category, 'default')
      LIMIT 1;

      -- If no category match, try default
      IF v_seasonal_idx IS NULL THEN
        SELECT COALESCE(si.index_value, 1.0) INTO v_seasonal_idx
        FROM seasonal_indices si
        WHERE si.month = EXTRACT(MONTH FROM v_week_start)
          AND si.category = 'default'
        LIMIT 1;
      END IF;

      v_seasonal_idx := COALESCE(v_seasonal_idx, 1.0);

      -- Insert or update forecast
      INSERT INTO finished_goods_forecast (
        product_id,
        forecast_period,
        base_forecast,
        seasonal_index,
        forecast_method,
        forecast_confidence
      ) VALUES (
        v_product.finished_sku,
        v_week_start,
        v_base_forecast,
        v_seasonal_idx,
        'historical_avg',
        CASE
          WHEN v_product.daily_demand > 1 THEN 'high'
          WHEN v_product.daily_demand > 0.3 THEN 'medium'
          ELSE 'low'
        END
      )
      ON CONFLICT (product_id, forecast_period)
      DO UPDATE SET
        base_forecast = EXCLUDED.base_forecast,
        seasonal_index = EXCLUDED.seasonal_index,
        forecast_method = EXCLUDED.forecast_method,
        forecast_confidence = EXCLUDED.forecast_confidence,
        updated_at = NOW();

      v_records_created := v_records_created + 1;
    END LOOP;
  END LOOP;

  RETURN v_records_created;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at
CREATE TRIGGER update_finished_goods_forecast_updated_at
  BEFORE UPDATE ON finished_goods_forecast
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE finished_goods_forecast IS 'Weekly demand forecasts for finished goods (BOM assemblies) - drives the MRP cascade';
COMMENT ON TABLE seasonal_indices IS 'Monthly seasonal adjustment factors by product category';
