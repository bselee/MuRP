-- ============================================================================
-- Migration: Purchasing AI Features
-- Description: Tables for cost-effective AI purchasing intelligence
-- Version: 1.0.0
-- Created: 2025-11-17
-- ============================================================================

-- ============================================================================
-- AI Anomaly Detection Logs
-- Stores daily/weekly anomaly detection results for inventory
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_anomaly_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Detection metadata
  detection_type VARCHAR(50) NOT NULL DEFAULT 'daily', -- 'daily', 'weekly', 'on_demand'
  items_analyzed INTEGER NOT NULL DEFAULT 0,

  -- Results summary
  critical_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  info_count INTEGER NOT NULL DEFAULT 0,

  -- Anomalies (JSON array of detected issues)
  critical_anomalies JSONB DEFAULT '[]'::jsonb,
  warning_anomalies JSONB DEFAULT '[]'::jsonb,
  info_anomalies JSONB DEFAULT '[]'::jsonb,

  -- AI metadata
  model_used VARCHAR(100),
  cost_usd DECIMAL(10,6) DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  execution_time_ms INTEGER,

  -- Alert status
  alerts_sent BOOLEAN DEFAULT FALSE,
  alert_recipients TEXT[],

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for anomaly logs
CREATE INDEX IF NOT EXISTS idx_ai_anomaly_logs_detected_at ON ai_anomaly_logs(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_anomaly_logs_detection_type ON ai_anomaly_logs(detection_type);
CREATE INDEX IF NOT EXISTS idx_ai_anomaly_logs_critical_count ON ai_anomaly_logs(critical_count) WHERE critical_count > 0;

COMMENT ON TABLE ai_anomaly_logs IS 'Stores AI-detected inventory anomalies (consumption spikes, stockouts, data errors)';

-- ============================================================================
-- AI Vendor Email Intelligence
-- Caches parsed vendor email data (tracking numbers, status updates)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_vendor_email_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Email metadata
  email_from VARCHAR(255) NOT NULL,
  email_subject TEXT,
  email_body TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Extracted data
  po_number VARCHAR(100),
  tracking_number VARCHAR(100),
  carrier VARCHAR(50),
  expected_delivery DATE,
  backorder_skus TEXT[],
  vendor_notes TEXT,

  -- Extraction metadata
  extracted BOOLEAN DEFAULT FALSE,
  extraction_confidence DECIMAL(3,2), -- 0.00 to 1.00
  model_used VARCHAR(100),
  cost_usd DECIMAL(10,6) DEFAULT 0,

  -- Processing status
  applied_to_po BOOLEAN DEFAULT FALSE,
  po_id UUID REFERENCES purchase_orders(id),

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for vendor email cache
CREATE INDEX IF NOT EXISTS idx_ai_vendor_email_po_number ON ai_vendor_email_cache(po_number);
CREATE INDEX IF NOT EXISTS idx_ai_vendor_email_received_at ON ai_vendor_email_cache(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_vendor_email_extracted ON ai_vendor_email_cache(extracted) WHERE extracted = TRUE;
CREATE INDEX IF NOT EXISTS idx_ai_vendor_email_applied ON ai_vendor_email_cache(applied_to_po) WHERE applied_to_po = FALSE;

COMMENT ON TABLE ai_vendor_email_cache IS 'Caches AI-extracted vendor email intelligence (tracking numbers, delivery dates)';

-- ============================================================================
-- AI Consolidation Opportunities
-- Stores AI-identified opportunities to consolidate orders
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_consolidation_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Opportunity details
  opportunity_type VARCHAR(50) NOT NULL, -- 'shipping_threshold', 'vendor_combine', 'timing_optimization'
  vendor_id UUID REFERENCES vendors(id),
  vendor_name VARCHAR(255),

  -- Financial impact
  current_order_total DECIMAL(10,2),
  shipping_threshold DECIMAL(10,2),
  potential_savings DECIMAL(10,2) NOT NULL,

  -- Recommended items to add
  recommended_items JSONB DEFAULT '[]'::jsonb,
  -- Format: [{"sku": "ABC123", "qty": 10, "cost": 100, "days_stock_remaining": 45}]

  -- Timing
  urgency VARCHAR(20) DEFAULT 'low', -- 'low', 'medium', 'high'
  valid_until DATE,

  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'accepted', 'rejected', 'expired'
  accepted_at TIMESTAMPTZ,
  accepted_by VARCHAR(255),
  rejection_reason TEXT,

  -- AI metadata
  identified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  model_used VARCHAR(100),
  confidence_score DECIMAL(3,2), -- 0.00 to 1.00
  cost_usd DECIMAL(10,6) DEFAULT 0,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for consolidation opportunities
CREATE INDEX IF NOT EXISTS idx_ai_consolidation_vendor ON ai_consolidation_opportunities(vendor_id);
CREATE INDEX IF NOT EXISTS idx_ai_consolidation_status ON ai_consolidation_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_ai_consolidation_savings ON ai_consolidation_opportunities(potential_savings DESC);
CREATE INDEX IF NOT EXISTS idx_ai_consolidation_urgency ON ai_consolidation_opportunities(urgency);

COMMENT ON TABLE ai_consolidation_opportunities IS 'AI-identified order consolidation opportunities to save shipping costs';

-- ============================================================================
-- AI Purchasing Insights
-- General AI insights and recommendations for purchasing
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_purchasing_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Insight details
  insight_type VARCHAR(50) NOT NULL, -- 'seasonal_pattern', 'vendor_performance', 'budget_optimization', 'stockout_risk'
  category VARCHAR(50), -- 'forecast', 'optimization', 'risk', 'opportunity'
  priority VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'

  -- Content
  title VARCHAR(255) NOT NULL,
  summary TEXT NOT NULL,
  detailed_analysis JSONB,
  recommendations JSONB,

  -- Affected entities
  affected_skus TEXT[],
  affected_vendors UUID[],
  affected_pos UUID[],

  -- Financial impact
  estimated_impact_usd DECIMAL(10,2),
  impact_type VARCHAR(20), -- 'savings', 'cost_avoidance', 'revenue_protection'

  -- Validity
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until DATE,
  stale BOOLEAN DEFAULT FALSE,

  -- AI metadata
  model_used VARCHAR(100),
  confidence_score DECIMAL(3,2),
  cost_usd DECIMAL(10,6) DEFAULT 0,
  input_data_hash VARCHAR(64), -- To prevent duplicate insights

  -- User interaction
  viewed BOOLEAN DEFAULT FALSE,
  viewed_at TIMESTAMPTZ,
  viewed_by VARCHAR(255),
  dismissed BOOLEAN DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,
  dismissed_reason TEXT,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for purchasing insights
CREATE INDEX IF NOT EXISTS idx_ai_insights_type ON ai_purchasing_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_ai_insights_priority ON ai_purchasing_insights(priority);
CREATE INDEX IF NOT EXISTS idx_ai_insights_generated_at ON ai_purchasing_insights(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_insights_viewed ON ai_purchasing_insights(viewed) WHERE viewed = FALSE;
CREATE INDEX IF NOT EXISTS idx_ai_insights_dismissed ON ai_purchasing_insights(dismissed) WHERE dismissed = FALSE;
CREATE INDEX IF NOT EXISTS idx_ai_insights_stale ON ai_purchasing_insights(stale) WHERE stale = FALSE;

COMMENT ON TABLE ai_purchasing_insights IS 'AI-generated purchasing insights (seasonal patterns, optimization opportunities)';

-- ============================================================================
-- AI Cost Tracking (Enhanced)
-- Tracks AI usage and costs specifically for purchasing features
-- Note: We already have mcp_tool_calls for general AI tracking,
-- this table is specifically for purchasing AI features
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_purchasing_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Date and service
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  service_name VARCHAR(50) NOT NULL, -- 'anomaly_detection', 'email_parsing', 'consolidation', 'insights'

  -- Model and usage
  model_name VARCHAR(100) NOT NULL,
  provider VARCHAR(50), -- 'anthropic', 'openai', 'gemini'

  -- Token usage
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,

  -- Cost
  cost_usd DECIMAL(10,6) NOT NULL DEFAULT 0,

  -- Call count
  calls_count INTEGER DEFAULT 1,

  -- Metadata
  execution_time_ms INTEGER,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for cost tracking
CREATE INDEX IF NOT EXISTS idx_ai_purchasing_costs_date ON ai_purchasing_costs(date DESC);
CREATE INDEX IF NOT EXISTS idx_ai_purchasing_costs_service ON ai_purchasing_costs(service_name);
-- Note: Removed functional index on DATE_TRUNC('month', date) because DATE_TRUNC is not IMMUTABLE.
-- The monthly costs view still works efficiently using the date index.

COMMENT ON TABLE ai_purchasing_costs IS 'Tracks AI costs and usage for purchasing intelligence features';

-- ============================================================================
-- AI Job Execution Logs
-- Tracks execution of scheduled AI jobs (nightly analysis, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_job_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Job details
  job_name VARCHAR(100) NOT NULL, -- 'nightly_analysis', 'weekly_patterns', 'vendor_review'
  job_type VARCHAR(50) NOT NULL, -- 'scheduled', 'manual', 'triggered'

  -- Execution
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed', 'cancelled'

  -- Results
  jobs_completed INTEGER DEFAULT 0,
  total_cost_usd DECIMAL(10,6) DEFAULT 0,
  execution_time_ms INTEGER,

  -- Cost breakdown
  cost_breakdown JSONB, -- {"anomaly_detection": 0.05, "consolidation": 0.02, ...}

  -- Errors
  error_message TEXT,
  error_stack TEXT,

  -- Audit
  triggered_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for job logs
CREATE INDEX IF NOT EXISTS idx_ai_job_logs_job_name ON ai_job_logs(job_name);
CREATE INDEX IF NOT EXISTS idx_ai_job_logs_started_at ON ai_job_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_job_logs_status ON ai_job_logs(status);

COMMENT ON TABLE ai_job_logs IS 'Tracks execution of scheduled AI purchasing jobs';

-- ============================================================================
-- Views for Reporting
-- ============================================================================

-- Daily AI cost summary
CREATE OR REPLACE VIEW ai_purchasing_daily_costs AS
SELECT
  date,
  service_name,
  SUM(cost_usd) as total_cost,
  SUM(total_tokens) as total_tokens,
  SUM(calls_count) as total_calls,
  AVG(cost_usd) as avg_cost_per_call
FROM ai_purchasing_costs
GROUP BY date, service_name
ORDER BY date DESC, total_cost DESC;

COMMENT ON VIEW ai_purchasing_daily_costs IS 'Daily summary of AI purchasing costs by service';

-- Monthly AI cost summary
CREATE OR REPLACE VIEW ai_purchasing_monthly_costs AS
SELECT
  DATE_TRUNC('month', date) as month,
  service_name,
  SUM(cost_usd) as total_cost,
  SUM(total_tokens) as total_tokens,
  SUM(calls_count) as total_calls,
  AVG(cost_usd) as avg_cost_per_call
FROM ai_purchasing_costs
GROUP BY DATE_TRUNC('month', date), service_name
ORDER BY month DESC, total_cost DESC;

COMMENT ON VIEW ai_purchasing_monthly_costs IS 'Monthly summary of AI purchasing costs by service';

-- Active insights summary
CREATE OR REPLACE VIEW ai_active_insights AS
SELECT
  insight_type,
  priority,
  COUNT(*) as total_insights,
  SUM(CASE WHEN viewed = FALSE THEN 1 ELSE 0 END) as unviewed_count,
  SUM(estimated_impact_usd) as total_estimated_impact
FROM ai_purchasing_insights
WHERE dismissed = FALSE
  AND stale = FALSE
  AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
GROUP BY insight_type, priority
ORDER BY priority DESC, total_estimated_impact DESC;

COMMENT ON VIEW ai_active_insights IS 'Summary of active AI purchasing insights by type and priority';

-- ============================================================================
-- Functions
-- ============================================================================

-- Function to mark stale insights
CREATE OR REPLACE FUNCTION mark_stale_insights()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE ai_purchasing_insights
  SET
    stale = TRUE,
    updated_at = NOW()
  WHERE
    stale = FALSE
    AND valid_until IS NOT NULL
    AND valid_until < CURRENT_DATE;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mark_stale_insights IS 'Marks expired insights as stale';

-- Function to get monthly AI budget status
CREATE OR REPLACE FUNCTION get_ai_budget_status(
  p_month DATE DEFAULT CURRENT_DATE,
  p_budget_limit DECIMAL DEFAULT 20.00
)
RETURNS TABLE (
  month DATE,
  total_spent DECIMAL,
  budget_limit DECIMAL,
  remaining DECIMAL,
  percent_used DECIMAL,
  over_budget BOOLEAN,
  service_breakdown JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH monthly_costs AS (
    SELECT
      DATE_TRUNC('month', p_month)::DATE as month,
      SUM(cost_usd) as total_cost,
      jsonb_object_agg(
        service_name,
        ROUND(SUM(cost_usd)::numeric, 4)
      ) as breakdown
    FROM ai_purchasing_costs
    WHERE DATE_TRUNC('month', date) = DATE_TRUNC('month', p_month)
    GROUP BY DATE_TRUNC('month', p_month)
  )
  SELECT
    mc.month,
    ROUND(mc.total_cost::numeric, 4) as total_spent,
    p_budget_limit as budget_limit,
    ROUND((p_budget_limit - mc.total_cost)::numeric, 4) as remaining,
    ROUND(((mc.total_cost / p_budget_limit) * 100)::numeric, 2) as percent_used,
    (mc.total_cost > p_budget_limit) as over_budget,
    mc.breakdown as service_breakdown
  FROM monthly_costs mc;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_ai_budget_status IS 'Returns AI purchasing budget status for a given month';

-- ============================================================================
-- Row Level Security (RLS)
-- Enable RLS on all tables (configure policies based on your auth setup)
-- ============================================================================

ALTER TABLE ai_anomaly_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_vendor_email_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_consolidation_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_purchasing_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_purchasing_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_job_logs ENABLE ROW LEVEL SECURITY;

-- Example RLS policies (adjust based on your auth setup)
-- Allow all authenticated users to read
DROP POLICY IF EXISTS "Allow authenticated users to read anomaly logs" ON ai_anomaly_logs;
CREATE POLICY "Allow authenticated users to read anomaly logs"
  ON ai_anomaly_logs FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to read vendor emails" ON ai_vendor_email_cache;
CREATE POLICY "Allow authenticated users to read vendor emails"
  ON ai_vendor_email_cache FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to read consolidation opportunities" ON ai_consolidation_opportunities;
CREATE POLICY "Allow authenticated users to read consolidation opportunities"
  ON ai_consolidation_opportunities FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to read insights" ON ai_purchasing_insights;
CREATE POLICY "Allow authenticated users to read insights"
  ON ai_purchasing_insights FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to read costs" ON ai_purchasing_costs;
CREATE POLICY "Allow authenticated users to read costs"
  ON ai_purchasing_costs FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to read job logs" ON ai_job_logs;
CREATE POLICY "Allow authenticated users to read job logs"
  ON ai_job_logs FOR SELECT
  TO authenticated
  USING (true);

-- Allow service role to insert/update (for backend processes)
DROP POLICY IF EXISTS "Allow service role full access to anomaly logs" ON ai_anomaly_logs;
CREATE POLICY "Allow service role full access to anomaly logs"
  ON ai_anomaly_logs FOR ALL
  TO service_role
  USING (true);

DROP POLICY IF EXISTS "Allow service role full access to vendor emails" ON ai_vendor_email_cache;
CREATE POLICY "Allow service role full access to vendor emails"
  ON ai_vendor_email_cache FOR ALL
  TO service_role
  USING (true);

DROP POLICY IF EXISTS "Allow service role full access to consolidation opportunities" ON ai_consolidation_opportunities;
CREATE POLICY "Allow service role full access to consolidation opportunities"
  ON ai_consolidation_opportunities FOR ALL
  TO service_role
  USING (true);

DROP POLICY IF EXISTS "Allow service role full access to insights" ON ai_purchasing_insights;
CREATE POLICY "Allow service role full access to insights"
  ON ai_purchasing_insights FOR ALL
  TO service_role
  USING (true);

DROP POLICY IF EXISTS "Allow service role full access to costs" ON ai_purchasing_costs;
CREATE POLICY "Allow service role full access to costs"
  ON ai_purchasing_costs FOR ALL
  TO service_role
  USING (true);

DROP POLICY IF EXISTS "Allow service role full access to job logs" ON ai_job_logs;
CREATE POLICY "Allow service role full access to job logs"
  ON ai_job_logs FOR ALL
  TO service_role
  USING (true);

-- ============================================================================
-- Grants
-- ============================================================================

GRANT SELECT ON ai_anomaly_logs TO authenticated;
GRANT SELECT ON ai_vendor_email_cache TO authenticated;
GRANT SELECT, UPDATE ON ai_consolidation_opportunities TO authenticated;
GRANT SELECT, UPDATE ON ai_purchasing_insights TO authenticated;
GRANT SELECT ON ai_purchasing_costs TO authenticated;
GRANT SELECT ON ai_job_logs TO authenticated;

GRANT SELECT ON ai_purchasing_daily_costs TO authenticated;
GRANT SELECT ON ai_purchasing_monthly_costs TO authenticated;
GRANT SELECT ON ai_active_insights TO authenticated;

-- ============================================================================
-- Sample Data (for testing)
-- ============================================================================

-- Insert sample anomaly log
-- COMMENT: Uncomment to add sample data
-- INSERT INTO ai_anomaly_logs (
--   detection_type,
--   items_analyzed,
--   critical_count,
--   warning_count,
--   critical_anomalies,
--   model_used,
--   cost_usd
-- ) VALUES (
--   'daily',
--   500,
--   2,
--   5,
--   '[
--     {"sku": "BAS123", "issue": "Consumption dropped 85%", "cause": "Possible stockout", "action": "Investigate immediately"},
--     {"sku": "ACI701", "issue": "Order quantity 10x normal", "cause": "Possible data entry error", "action": "Review PO before sending"}
--   ]'::jsonb,
--   'claude-haiku-20250306',
--   0.05
-- );

-- ============================================================================
-- Migration Complete
-- ============================================================================

COMMENT ON SCHEMA public IS 'Purchasing AI Features Migration Complete - v1.0.0';
