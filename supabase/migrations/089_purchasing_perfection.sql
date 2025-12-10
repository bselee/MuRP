-- Migration: 089_purchasing_perfection.sql
-- Description: Adds tables for precise forecasting, accuracy tracking, and advanced replenishment logic
-- Part of: Purchasing Forecasting Perfection Framework
-- ============================================================================
-- FORECAST TRACKING
-- ============================================================================
-- Track generated forecasts against actuals to calculate accuracy (MAPE)
CREATE TABLE IF NOT EXISTS forecasts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sku text NOT NULL,
    -- When the forecast was made
    generated_at timestamptz DEFAULT now(),
    generated_by text DEFAULT 'system_algo',
    -- 'system_algo', 'user_override', 'ml_model'
    -- The detailed forecast
    forecast_period_start date NOT NULL,
    forecast_period_end date NOT NULL,
    -- e.g. '2025-01-01' to '2025-01-31'
    predicted_quantity decimal(12, 2) NOT NULL,
    actual_quantity decimal(12, 2),
    -- Populated later once period passes
    -- Accuracy metrics (populated later)
    error_abs decimal(12, 2) GENERATED ALWAYS AS (
        ABS(
            predicted_quantity - COALESCE(actual_quantity, predicted_quantity)
        )
    ) STORED,
    error_pct decimal(5, 2) GENERATED ALWAYS AS (
        CASE
            WHEN COALESCE(actual_quantity, 0) > 0 THEN (
                ABS(predicted_quantity - actual_quantity) / actual_quantity
            ) * 100
            ELSE 0
        END
    ) STORED,
    -- Context
    method_used text,
    -- 'moving_average', 'seasonality_adjusted', 'manual'
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_forecasts_sku ON forecasts(sku);
CREATE INDEX idx_forecasts_period ON forecasts(forecast_period_start, forecast_period_end);
-- ============================================================================
-- SKU PURCHASING PARAMETERS (The "Control Panel" Inputs)
-- ============================================================================
-- Store strict inputs for the "Perfect" replenishment formula
CREATE TABLE IF NOT EXISTS sku_purchasing_parameters (
    sku text PRIMARY KEY,
    -- Service Level Setting (The "Z" score input)
    target_service_level decimal(3, 2) DEFAULT 0.95,
    -- 95% is standard for A-items
    z_score decimal(4, 2) DEFAULT 1.65,
    -- Corresponds to 95%
    -- Demand Variability (The "σ_demand" input)
    demand_std_dev decimal(12, 2) DEFAULT 0,
    -- Calculated from order history
    demand_mean_daily decimal(12, 2) DEFAULT 0,
    -- Calculated mean
    -- Lead Time Variability (The "√LT_variance" input)
    lead_time_mean decimal(5, 2) DEFAULT 14,
    lead_time_std_dev decimal(5, 2) DEFAULT 0,
    -- Calculated from vendor performance
    -- Calculated Safety Stock (The Result)
    -- SS = Z * sqrt( (avg_LT * sigma_D^2) + (avg_D^2 * sigma_LT^2) )
    calculated_safety_stock decimal(12, 2),
    -- Calculated Reorder Point
    -- ROP = (Avg_D * Avg_LT) + SS
    calculated_reorder_point decimal(12, 2),
    -- Management
    is_frozen boolean DEFAULT false,
    -- If true, auto-calc is disabled for manual override
    last_calculated_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
-- ============================================================================
-- SEASONALITY INDEX
-- ============================================================================
-- Store monthly seasonality factors per category or SKU
CREATE TABLE IF NOT EXISTS seasonality_indices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_type text NOT NULL,
    -- 'sku', 'category', 'global'
    scope_value text NOT NULL,
    -- sku string, category name, or 'all'
    month_of_year integer NOT NULL CHECK (
        month_of_year BETWEEN 1 AND 12
    ),
    seasonality_factor decimal(4, 2) DEFAULT 1.0,
    -- 1.0 = average, 1.2 = 20% higher, 0.8 = 20% lower
    confidence_score decimal(3, 2),
    -- Based on how much data we have
    last_updated timestamptz DEFAULT now(),
    UNIQUE(scope_type, scope_value, month_of_year)
);
-- Indices
CREATE INDEX idx_seasonality_scope ON seasonality_indices(scope_type, scope_value);
-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sku_purchasing_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasonality_indices ENABLE ROW LEVEL SECURITY;
-- Allow authenticated (internal users) full access
CREATE POLICY "Allow authenticated full access forecasts" ON forecasts FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access purchasing_params" ON sku_purchasing_parameters FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access seasonality" ON seasonality_indices FOR ALL TO authenticated USING (true);
-- ============================================================================
-- FUNCTIONS
-- ============================================================================
-- Function to update a SKU's purchasing parameters based on history
-- This implements the user's "Perfection" math
CREATE OR REPLACE FUNCTION calculate_sku_purchasing_parameters(p_sku text) RETURNS void AS $$
DECLARE v_sales_data record;
v_lead_time_data record;
v_z_score decimal;
BEGIN -- 1. Get Demand Variability (Sigma Demand)
-- We look at last 90 days of daily sales to get StdDev
WITH daily_sales AS (
    SELECT date_trunc('day', order_date) as sale_day,
        SUM((item->>'quantity')::numeric) as daily_qty
    FROM finale_orders o,
        jsonb_array_elements(o.order_items) as item
    WHERE item->>'productId' = p_sku
        AND o.order_date >= (now() - interval '90 days')
    GROUP BY 1
),
stats AS (
    SELECT avg(daily_qty) as mean,
        stddev(daily_qty) as sigma
    FROM daily_sales
)
SELECT COALESCE(mean, 0),
    COALESCE(sigma, 0) INTO v_sales_data
FROM stats;
-- 2. Get Lead Time Variability
-- We use the vendor_intelligence tables
SELECT COALESCE(vpm.actual_lead_time_days_avg, v.lead_time_days) as mean_lt,
    COALESCE(vpm.lead_time_variance, 0) as sigma_lt,
    vpm.effective_lead_time_days INTO v_lead_time_data
FROM inventory_items i
    JOIN vendors v ON i.vendor_id = v.id
    LEFT JOIN vendor_performance_metrics vpm ON v.id = vpm.vendor_id
WHERE i.sku = p_sku
ORDER BY vpm.period_end DESC
LIMIT 1;
-- 3. Get Z-Score (or default)
SELECT z_score INTO v_z_score
FROM sku_purchasing_parameters
WHERE sku = p_sku;
IF v_z_score IS NULL THEN v_z_score := 1.65;
END IF;
-- Default 95%
-- 4. Calculate Safety Stock & ROP
-- Formula: SS = Z * sqrt( (AvgLT * SigmaD^2) + (AvgD^2 * SigmaLT^2) )
-- Note: If SigmaLT is 0, this simplifies to Z * SigmaD * sqrt(AvgLT)
-- Upsert parameters
INSERT INTO sku_purchasing_parameters (
        sku,
        demand_mean_daily,
        demand_std_dev,
        lead_time_mean,
        lead_time_std_dev,
        z_score,
        calculated_safety_stock,
        calculated_reorder_point,
        last_calculated_at
    )
VALUES (
        p_sku,
        v_sales_data.mean,
        v_sales_data.sigma,
        COALESCE(v_lead_time_data.mean_lt, 14),
        COALESCE(v_lead_time_data.sigma_lt, 0),
        v_z_score,
        (
            v_z_score * SQRT(
                (
                    COALESCE(v_lead_time_data.mean_lt, 14) * POWER(v_sales_data.sigma, 2)
                ) + (
                    POWER(v_sales_data.mean, 2) * POWER(COALESCE(v_lead_time_data.sigma_lt, 0), 2)
                )
            )
        ),
        (
            v_sales_data.mean * COALESCE(v_lead_time_data.mean_lt, 14)
        ) + (
            v_z_score * SQRT(
                (
                    COALESCE(v_lead_time_data.mean_lt, 14) * POWER(v_sales_data.sigma, 2)
                ) + (
                    POWER(v_sales_data.mean, 2) * POWER(COALESCE(v_lead_time_data.sigma_lt, 0), 2)
                )
            )
        ),
        now()
    ) ON CONFLICT (sku) DO
UPDATE
SET demand_mean_daily = EXCLUDED.demand_mean_daily,
    demand_std_dev = EXCLUDED.demand_std_dev,
    lead_time_mean = EXCLUDED.lead_time_mean,
    lead_time_std_dev = EXCLUDED.lead_time_std_dev,
    calculated_safety_stock = EXCLUDED.calculated_safety_stock,
    calculated_reorder_point = EXCLUDED.calculated_reorder_point,
    last_calculated_at = now()
WHERE sku_purchasing_parameters.is_frozen = false;
END;
$$ LANGUAGE plpgsql;