-- ============================================================================
-- Migration 026: Forecast Accuracy Tracking & Enhanced Analytics
-- Adds tables for tracking forecast performance, seasonal patterns, vendor metrics
-- ============================================================================

-- ============================================================================
-- FORECAST ACCURACY TRACKING
-- Track historical forecast performance to improve predictions
-- ============================================================================

CREATE TABLE IF NOT EXISTS forecast_accuracy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- What was forecast
  inventory_sku VARCHAR(50) NOT NULL,
  forecast_date DATE NOT NULL, -- When forecast was made
  target_date DATE NOT NULL, -- What date was being forecast
  forecast_quantity INTEGER NOT NULL,
  
  -- What actually happened
  actual_quantity INTEGER,
  actual_recorded_at TIMESTAMPTZ,
  
  -- Accuracy metrics
  absolute_error INTEGER GENERATED ALWAYS AS (ABS(actual_quantity - forecast_quantity)) STORED,
  percentage_error DECIMAL(5,2),
  
  -- Forecast metadata
  forecast_method VARCHAR(50), -- 'moving_average', 'trend_adjusted', 'seasonal'
  confidence_score DECIMAL(3,2),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_forecast_accuracy_sku ON forecast_accuracy(inventory_sku);
CREATE INDEX idx_forecast_accuracy_dates ON forecast_accuracy(forecast_date, target_date);
CREATE INDEX idx_forecast_accuracy_error ON forecast_accuracy(absolute_error DESC);

COMMENT ON TABLE forecast_accuracy IS 'Historical forecast performance for continuous improvement';

-- ============================================================================
-- SEASONAL FACTORS TABLE
-- Store calculated seasonal adjustments
-- ============================================================================

CREATE TABLE IF NOT EXISTS seasonal_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  inventory_sku VARCHAR(50) NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  
  -- Factor calculation
  seasonal_factor DECIMAL(5,2) NOT NULL DEFAULT 1.00, -- 1.0 = average, 1.2 = 20% above
  confidence DECIMAL(3,2) NOT NULL DEFAULT 0.50,
  
  -- Supporting data
  historical_data_points INTEGER DEFAULT 0,
  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Year-over-year tracking
  yoy_growth_rate DECIMAL(5,2),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(inventory_sku, month)
);

CREATE INDEX idx_seasonal_factors_sku ON seasonal_factors(inventory_sku);
CREATE INDEX idx_seasonal_factors_month ON seasonal_factors(month);

COMMENT ON TABLE seasonal_factors IS 'Seasonal demand patterns for forecasting';

-- ============================================================================
-- VENDOR PERFORMANCE METRICS
-- Track vendor reliability over time
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendor_performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  
  -- Performance period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Delivery metrics
  total_orders INTEGER DEFAULT 0,
  on_time_deliveries INTEGER DEFAULT 0,
  late_deliveries INTEGER DEFAULT 0,
  on_time_rate DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_orders > 0 
    THEN (on_time_deliveries::DECIMAL / total_orders) * 100 
    ELSE 0 END
  ) STORED,
  
  -- Lead time metrics
  average_lead_time_days DECIMAL(5,1),
  estimated_lead_time_days INTEGER,
  lead_time_variance DECIMAL(5,1),
  
  -- Quality metrics
  quality_issues INTEGER DEFAULT 0,
  returns INTEGER DEFAULT 0,
  
  -- Cost metrics
  total_spend DECIMAL(12,2) DEFAULT 0,
  average_order_value DECIMAL(10,2),
  price_variance_percentage DECIMAL(5,2),
  
  -- Overall score (0-100)
  reliability_score INTEGER DEFAULT 50,
  
  -- Calculation metadata
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(vendor_id, period_start, period_end)
);

CREATE INDEX idx_vendor_performance_vendor ON vendor_performance_metrics(vendor_id);
CREATE INDEX idx_vendor_performance_period ON vendor_performance_metrics(period_start, period_end);
CREATE INDEX idx_vendor_performance_score ON vendor_performance_metrics(reliability_score DESC);

COMMENT ON TABLE vendor_performance_metrics IS 'Historical vendor performance tracking for reliability scoring';

-- ============================================================================
-- NOTIFICATIONS TABLE
-- In-app notification center
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User targeting
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(20), -- If null, send to all users with that role
  
  -- Notification content
  type VARCHAR(50) NOT NULL, -- 'stockout_alert', 'forecast_update', 'vendor_issue'
  severity VARCHAR(20) NOT NULL DEFAULT 'info', -- 'critical', 'high', 'medium', 'low', 'info'
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  
  -- Related data
  data JSONB, -- Structured data for the notification
  action_url VARCHAR(255), -- Deep link to related page
  
  -- Status
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  dismissed BOOLEAN DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,
  
  -- Expiry
  expires_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id) WHERE NOT dismissed;
CREATE INDEX idx_notifications_role ON notifications(role) WHERE role IS NOT NULL AND NOT dismissed;
CREATE INDEX idx_notifications_unread ON notifications(user_id, read) WHERE NOT read AND NOT dismissed;
CREATE INDEX idx_notifications_severity ON notifications(severity) WHERE NOT dismissed;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

COMMENT ON TABLE notifications IS 'In-app notification center for alerts and updates';

-- ============================================================================
-- TREND ANALYSIS VIEW
-- Materialized view for quick trend calculations
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS inventory_trends AS
SELECT 
  i.sku,
  i.name,
  i.stock AS current_stock,
  i.sales_last_30_days,
  i.sales_last_90_days,
  
  -- Daily averages
  (i.sales_last_30_days / 30.0) AS avg_daily_30d,
  (i.sales_last_90_days / 90.0) AS avg_daily_90d,
  
  -- Growth rate
  CASE 
    WHEN (i.sales_last_90_days / 90.0) > 0 
    THEN (((i.sales_last_30_days / 30.0) - (i.sales_last_90_days / 90.0)) / (i.sales_last_90_days / 90.0)) * 100
    ELSE 0
  END AS growth_rate_pct,
  
  -- Trend direction
  CASE
    WHEN ((i.sales_last_30_days / 30.0) - (i.sales_last_90_days / 90.0)) > ((i.sales_last_90_days / 90.0) * 0.15) THEN 'up'
    WHEN ((i.sales_last_30_days / 30.0) - (i.sales_last_90_days / 90.0)) < ((i.sales_last_90_days / 90.0) * -0.15) THEN 'down'
    ELSE 'stable'
  END AS trend_direction,
  
  -- Days until stockout
  CASE 
    WHEN (i.sales_last_30_days / 30.0) > 0 
    THEN FLOOR(i.stock / (i.sales_last_30_days / 30.0))
    ELSE 999
  END AS days_until_stockout,
  
  -- Refresh timestamp
  NOW() AS calculated_at
FROM inventory_items i
WHERE i.status = 'active';

CREATE UNIQUE INDEX idx_inventory_trends_sku ON inventory_trends(sku);
CREATE INDEX idx_inventory_trends_direction ON inventory_trends(trend_direction);
CREATE INDEX idx_inventory_trends_stockout ON inventory_trends(days_until_stockout);

COMMENT ON MATERIALIZED VIEW inventory_trends IS 'Pre-calculated trend metrics for fast analytics (refresh daily)';

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE forecast_accuracy ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasonal_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Forecast accuracy: authenticated users can read
CREATE POLICY "Allow authenticated read on forecast_accuracy"
  ON forecast_accuracy FOR SELECT
  TO authenticated
  USING (true);

-- Seasonal factors: authenticated users can read
CREATE POLICY "Allow authenticated read on seasonal_factors"
  ON seasonal_factors FOR SELECT
  TO authenticated
  USING (true);

-- Vendor performance: authenticated users can read
CREATE POLICY "Allow authenticated read on vendor_performance"
  ON vendor_performance_metrics FOR SELECT
  TO authenticated
  USING (true);

-- Notifications: users can read their own or role-based
CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id OR
    role IN (
      SELECT role FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Notifications: users can update their own
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON POLICY "Users can read own notifications" ON notifications IS 'Users see notifications targeted to them or their role';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to refresh inventory trends materialized view
CREATE OR REPLACE FUNCTION refresh_inventory_trends()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY inventory_trends;
END;
$$;

COMMENT ON FUNCTION refresh_inventory_trends IS 'Refresh inventory trends view (call daily via cron)';

-- Function to calculate seasonal factors for an item
CREATE OR REPLACE FUNCTION calculate_seasonal_factors(p_sku VARCHAR(50))
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_month INTEGER;
  v_month_avg DECIMAL;
  v_overall_avg DECIMAL;
  v_factor DECIMAL;
  v_data_points INTEGER;
BEGIN
  -- Get overall average from historical sales
  SELECT AVG(quantity) INTO v_overall_avg
  FROM historical_sales
  WHERE sku = p_sku
    AND date >= CURRENT_DATE - INTERVAL '2 years';
  
  -- Skip if no data
  IF v_overall_avg IS NULL OR v_overall_avg = 0 THEN
    RETURN;
  END IF;
  
  -- Calculate factor for each month
  FOR v_month IN 1..12 LOOP
    SELECT 
      AVG(quantity),
      COUNT(*)
    INTO v_month_avg, v_data_points
    FROM historical_sales
    WHERE sku = p_sku
      AND EXTRACT(MONTH FROM date) = v_month
      AND date >= CURRENT_DATE - INTERVAL '2 years';
    
    -- Calculate seasonal factor
    IF v_month_avg IS NOT NULL AND v_month_avg > 0 THEN
      v_factor := v_month_avg / v_overall_avg;
      
      -- Upsert seasonal factor
      INSERT INTO seasonal_factors (
        inventory_sku,
        month,
        seasonal_factor,
        confidence,
        historical_data_points,
        last_calculated_at
      ) VALUES (
        p_sku,
        v_month,
        v_factor,
        LEAST(1.0, v_data_points / 12.0), -- Confidence based on data points
        v_data_points,
        NOW()
      )
      ON CONFLICT (inventory_sku, month)
      DO UPDATE SET
        seasonal_factor = EXCLUDED.seasonal_factor,
        confidence = EXCLUDED.confidence,
        historical_data_points = EXCLUDED.historical_data_points,
        last_calculated_at = NOW();
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION calculate_seasonal_factors IS 'Calculate seasonal demand patterns for a SKU';

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Add default notification channels to app_settings
INSERT INTO app_settings (
  setting_category,
  setting_key,
  setting_value,
  display_name,
  description
)
VALUES (
  'notifications',
  'notification_channels',
  '["in-app"]'::jsonb,
  'Notification Channels',
  'Enabled notification channels for stockout alerts (in-app, email, slack)'
)
ON CONFLICT (setting_key) DO NOTHING;

-- Add notification thresholds
INSERT INTO app_settings (
  setting_category,
  setting_key,
  setting_value,
  display_name,
  description
)
VALUES (
  'notifications',
  'stockout_alert_thresholds',
  '{"critical": 3, "high": 7, "normal": 14}'::jsonb,
  'Stockout Alert Thresholds',
  'Days until stockout thresholds for triggering notifications'
)
ON CONFLICT (setting_key) DO NOTHING;
