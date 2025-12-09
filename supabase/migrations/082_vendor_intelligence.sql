-- Migration: 082_vendor_intelligence.sql
-- Description: Vendor performance tracking and learning system
-- Part of: MuRP 2.0 Autonomous Agent System - "Vendor Watchdog"
-- Date: 2025-12-09

-- ============================================================================
-- VENDOR PERFORMANCE TRACKING
-- ============================================================================

-- Track actual vs promised performance for each vendor
CREATE TABLE IF NOT EXISTS vendor_performance_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  vendor_id uuid REFERENCES vendors(id) ON DELETE CASCADE,

  -- Time period for this metric snapshot
  period_start date NOT NULL,
  period_end date NOT NULL,

  -- Lead Time Performance
  promised_lead_time_days integer,
  actual_lead_time_days_avg decimal(5,2),
  actual_lead_time_days_min integer,
  actual_lead_time_days_max integer,
  lead_time_variance decimal(5,2), -- Std deviation
  effective_lead_time_days integer, -- What the agent should use

  -- Delivery Performance
  total_orders integer DEFAULT 0,
  on_time_deliveries integer DEFAULT 0,
  late_deliveries integer DEFAULT 0,
  early_deliveries integer DEFAULT 0,
  on_time_rate decimal(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_orders > 0
    THEN (on_time_deliveries::decimal / total_orders) * 100
    ELSE 0 END
  ) STORED,

  -- Quality Metrics
  orders_with_issues integer DEFAULT 0,
  total_items_received integer DEFAULT 0,
  items_rejected integer DEFAULT 0,
  quality_rate decimal(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_items_received > 0
    THEN ((total_items_received - items_rejected)::decimal / total_items_received) * 100
    ELSE 0 END
  ) STORED,

  -- Communication & Responsiveness
  avg_response_time_hours decimal(5,2),
  emails_sent integer DEFAULT 0,
  emails_responded integer DEFAULT 0,
  response_rate decimal(5,2) GENERATED ALWAYS AS (
    CASE WHEN emails_sent > 0
    THEN (emails_responded::decimal / emails_sent) * 100
    ELSE 0 END
  ) STORED,

  -- Financial
  total_spend_usd decimal(12,2) DEFAULT 0,
  avg_order_value_usd decimal(10,2),

  -- Trust Score (0-100)
  -- Calculated by agent based on reliability
  trust_score integer CHECK (trust_score >= 0 AND trust_score <= 100),
  trust_score_trend text CHECK (trust_score_trend IN ('improving', 'stable', 'declining')),

  -- Agent Recommendations
  recommend_for_critical_orders boolean DEFAULT true,
  recommend_for_bulk_orders boolean DEFAULT true,
  agent_notes text,

  -- Metadata
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_vendor_performance_vendor ON vendor_performance_metrics(vendor_id);
CREATE INDEX idx_vendor_performance_period ON vendor_performance_metrics(period_start, period_end);
CREATE INDEX idx_vendor_performance_trust ON vendor_performance_metrics(trust_score DESC);

-- ============================================================================
-- PO DELIVERY TRACKING (Actual Performance)
-- ============================================================================

-- Track each PO's actual delivery performance
CREATE TABLE IF NOT EXISTS po_delivery_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  po_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES vendors(id) ON DELETE CASCADE,

  -- Dates
  order_date date NOT NULL,
  promised_date date,
  expected_date date, -- System calculated
  actual_delivery_date date,

  -- Lead Time Analysis
  promised_lead_time_days integer,
  actual_lead_time_days integer,
  lead_time_variance_days integer GENERATED ALWAYS AS (
    actual_lead_time_days - promised_lead_time_days
  ) STORED,

  -- Performance Classification
  delivery_status text CHECK (delivery_status IN (
    'early',      -- Arrived before expected
    'on_time',    -- Within ±1 day of expected
    'late_minor', -- 2-5 days late
    'late_major', -- 6+ days late
    'pending'     -- Not yet received
  )),

  -- Impact Assessment
  was_critical boolean DEFAULT false, -- Did this PO contain critical items?
  caused_stockout boolean DEFAULT false,
  caused_production_delay boolean DEFAULT false,
  estimated_impact_usd decimal(10,2), -- Cost of delay

  -- Communication Log
  vendor_communication_log jsonb, -- Array of emails/calls
  -- [{"date": "2025-12-01", "type": "email", "summary": "Confirmed shipment"}]

  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_po_delivery_po ON po_delivery_performance(po_id);
CREATE INDEX idx_po_delivery_vendor ON po_delivery_performance(vendor_id);
CREATE INDEX idx_po_delivery_status ON po_delivery_performance(delivery_status);
CREATE INDEX idx_po_delivery_date ON po_delivery_performance(actual_delivery_date DESC NULLS LAST);

-- ============================================================================
-- BULK BUYING OPPORTUNITIES
-- ============================================================================

-- Track items eligible for bulk ordering
CREATE TABLE IF NOT EXISTS bulk_opportunity_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  inventory_sku varchar(50) NOT NULL,
  vendor_id uuid REFERENCES vendors(id),

  -- Current Ordering Pattern
  current_order_frequency_days integer, -- How often we order
  avg_order_quantity integer,
  avg_order_cost_usd decimal(10,2),

  -- Annual Costs (Current Pattern)
  orders_per_year integer,
  total_shipping_cost_year_usd decimal(10,2),
  total_product_cost_year_usd decimal(10,2),

  -- Bulk Opportunity
  recommended_bulk_quantity integer,
  recommended_order_frequency_days integer,
  bulk_unit_cost_usd decimal(10,2), -- With bulk discount

  -- Savings Analysis
  potential_shipping_savings_year_usd decimal(10,2),
  potential_product_savings_year_usd decimal(10,2), -- From bulk discount
  total_potential_savings_year_usd decimal(10,2),

  -- Storage Cost
  estimated_storage_cost_year_usd decimal(10,2),
  net_savings_year_usd decimal(10,2),

  -- Risk Assessment
  demand_stability_score decimal(3,2), -- 0.0 = volatile, 1.0 = stable
  shelf_life_days integer,
  risk_level text CHECK (risk_level IN ('low', 'medium', 'high')),

  -- Agent Recommendation
  agent_recommendation text CHECK (agent_recommendation IN (
    'strongly_recommend',
    'recommend',
    'consider',
    'not_recommended'
  )),
  reasoning text,

  -- Status
  status text DEFAULT 'pending_review' CHECK (status IN (
    'pending_review',
    'approved',
    'rejected',
    'implemented'
  )),

  -- Metadata
  analyzed_at timestamptz DEFAULT now(),
  valid_until timestamptz DEFAULT (now() + INTERVAL '30 days')
);

CREATE INDEX idx_bulk_opportunity_sku ON bulk_opportunity_analysis(inventory_sku);
CREATE INDEX idx_bulk_opportunity_vendor ON bulk_opportunity_analysis(vendor_id);
CREATE INDEX idx_bulk_opportunity_savings ON bulk_opportunity_analysis(net_savings_year_usd DESC);
CREATE INDEX idx_bulk_opportunity_status ON bulk_opportunity_analysis(status);

-- ============================================================================
-- PO ALERT LOG (Air Traffic Controller)
-- ============================================================================

-- Track prioritized alerts for PO delays
CREATE TABLE IF NOT EXISTS po_alert_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  po_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE,
  order_id varchar(50),
  vendor_name text,

  -- Alert Details
  delay_days integer,
  priority_level text CHECK (priority_level IN ('critical', 'high', 'medium', 'low')),
  is_production_blocking boolean DEFAULT false,

  -- Impact
  affected_items jsonb,
  reasoning text,
  recommended_action text,

  -- Communication
  draft_vendor_email text,

  -- Resolution
  resolved_at timestamptz,
  resolution text,

  -- Metadata
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_po_alert_po ON po_alert_log(po_id);
CREATE INDEX idx_po_alert_priority ON po_alert_log(priority_level);
CREATE INDEX idx_po_alert_unresolved ON po_alert_log(resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX idx_po_alert_created ON po_alert_log(created_at DESC);

COMMENT ON TABLE po_alert_log IS
'Air Traffic Controller: Intelligent alert prioritization for PO delays';

-- ============================================================================
-- AGENT PERFORMANCE METRICS (Trust Score Dashboard)
-- ============================================================================

-- Track the agent's autonomous decision performance
CREATE TABLE IF NOT EXISTS agent_performance_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Time Period
  period_date date NOT NULL,

  -- Stockout Prevention
  total_skus_monitored integer DEFAULT 0,
  predicted_stockouts integer DEFAULT 0,
  actual_stockouts integer DEFAULT 0,
  stockouts_prevented integer DEFAULT 0,
  stockout_prevention_rate decimal(5,2) GENERATED ALWAYS AS (
    CASE WHEN predicted_stockouts > 0
    THEN ((predicted_stockouts - actual_stockouts)::decimal / predicted_stockouts) * 100
    ELSE 100 END
  ) STORED,

  -- Touchless POs
  total_pos_created integer DEFAULT 0,
  ai_generated_pos integer DEFAULT 0,
  human_edited_pos integer DEFAULT 0,
  touchless_po_rate decimal(5,2) GENERATED ALWAYS AS (
    CASE WHEN ai_generated_pos > 0
    THEN ((ai_generated_pos - human_edited_pos)::decimal / ai_generated_pos) * 100
    ELSE 0 END
  ) STORED,

  -- ETA Accuracy
  total_deliveries integer DEFAULT 0,
  deliveries_within_1day integer DEFAULT 0,
  eta_accuracy_rate decimal(5,2) GENERATED ALWAYS AS (
    CASE WHEN total_deliveries > 0
    THEN (deliveries_within_1day::decimal / total_deliveries) * 100
    ELSE 0 END
  ) STORED,

  -- Capital Efficiency
  total_inventory_value_usd decimal(12,2),
  days_sales_of_inventory decimal(5,2), -- Lower is better
  overstock_value_usd decimal(12,2),

  -- Cost Savings
  shipping_savings_usd decimal(10,2) DEFAULT 0,
  bulk_discount_savings_usd decimal(10,2) DEFAULT 0,
  early_order_savings_usd decimal(10,2) DEFAULT 0,
  total_savings_usd decimal(10,2) DEFAULT 0,

  -- Overall Trust Score
  overall_trust_score integer CHECK (overall_trust_score >= 0 AND overall_trust_score <= 100),

  -- Metadata
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_agent_performance_date ON agent_performance_log(period_date DESC);
CREATE INDEX idx_agent_performance_trust ON agent_performance_log(overall_trust_score DESC);

-- ============================================================================
-- CRITICAL ALERT PRIORITIES
-- ============================================================================

-- Track what makes an alert "critical" vs "informational"
CREATE TABLE IF NOT EXISTS alert_priority_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  alert_type text NOT NULL,
  -- 'po_delay', 'stockout_risk', 'vendor_issue', 'quality_problem'

  -- Criticality Calculation
  base_priority integer DEFAULT 50, -- 0-100

  -- Modifiers
  days_until_stockout_critical integer DEFAULT 3,
  days_until_stockout_high integer DEFAULT 7,
  days_until_stockout_medium integer DEFAULT 14,

  -- Impact Thresholds
  production_blocking boolean DEFAULT false,
  revenue_impact_usd_threshold decimal(10,2),
  customer_orders_affected_threshold integer,

  -- Actions
  send_push_notification boolean DEFAULT false,
  send_email boolean DEFAULT true,
  send_sms boolean DEFAULT false,
  draft_vendor_email boolean DEFAULT false,

  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_alert_priority_type ON alert_priority_rules(alert_type);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Calculate vendor trust score
CREATE OR REPLACE FUNCTION calculate_vendor_trust_score(
  p_vendor_id uuid
)
RETURNS integer AS $$
DECLARE
  v_metrics record;
  v_trust_score integer;
BEGIN
  -- Get latest metrics
  SELECT * INTO v_metrics
  FROM vendor_performance_metrics
  WHERE vendor_id = p_vendor_id
  ORDER BY period_end DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 50; -- Default neutral score
  END IF;

  -- Calculate trust score (weighted average)
  v_trust_score := (
    (v_metrics.on_time_rate * 0.40) +        -- 40% weight on timeliness
    (v_metrics.quality_rate * 0.30) +        -- 30% weight on quality
    (v_metrics.response_rate * 0.20) +       -- 20% weight on communication
    (CASE
      WHEN v_metrics.lead_time_variance < 2 THEN 100
      WHEN v_metrics.lead_time_variance < 5 THEN 70
      ELSE 40
    END * 0.10)                              -- 10% weight on consistency
  )::integer;

  RETURN GREATEST(0, LEAST(100, v_trust_score));
END;
$$ LANGUAGE plpgsql;

-- Update effective lead time based on recent performance
CREATE OR REPLACE FUNCTION update_effective_lead_time(
  p_vendor_id uuid
)
RETURNS integer AS $$
DECLARE
  v_avg_actual_lead_time decimal;
  v_promised_lead_time integer;
  v_effective_lead_time integer;
BEGIN
  -- Get promised lead time from vendor
  SELECT lead_time_days INTO v_promised_lead_time
  FROM vendors
  WHERE id = p_vendor_id;

  -- Get actual average from last 10 deliveries
  SELECT AVG(actual_lead_time_days) INTO v_avg_actual_lead_time
  FROM po_delivery_performance
  WHERE vendor_id = p_vendor_id
    AND actual_delivery_date IS NOT NULL
    AND actual_delivery_date > (CURRENT_DATE - INTERVAL '90 days')
  ORDER BY actual_delivery_date DESC
  LIMIT 10;

  IF v_avg_actual_lead_time IS NULL THEN
    -- No history, use promised
    RETURN v_promised_lead_time;
  END IF;

  -- Use whichever is longer (conservative approach)
  v_effective_lead_time := GREATEST(
    v_promised_lead_time,
    CEIL(v_avg_actual_lead_time)
  );

  -- Update vendor_performance_metrics
  UPDATE vendor_performance_metrics
  SET effective_lead_time_days = v_effective_lead_time,
      last_updated = now()
  WHERE vendor_id = p_vendor_id
    AND period_end = (
      SELECT MAX(period_end)
      FROM vendor_performance_metrics
      WHERE vendor_id = p_vendor_id
    );

  RETURN v_effective_lead_time;
END;
$$ LANGUAGE plpgsql;

-- Determine if a PO delay is critical
CREATE OR REPLACE FUNCTION assess_po_delay_impact(
  p_po_id uuid,
  p_delay_days integer
)
RETURNS TABLE (
  is_critical boolean,
  priority_level text,
  reasoning text,
  affected_items jsonb,
  recommended_action text
) AS $$
DECLARE
  v_po record;
  v_critical_items jsonb := '[]'::jsonb;
  v_is_critical boolean := false;
  v_priority text := 'low';
  v_reasoning text := '';
  v_action text := '';
BEGIN
  -- Get PO details
  SELECT * INTO v_po
  FROM purchase_orders
  WHERE id = p_po_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Check each line item for criticality
  WITH item_analysis AS (
    SELECT
      poi.inventory_sku,
      poi.item_name,
      poi.quantity_ordered,
      inv.stock as current_stock,
      inv.sales_last_30_days,
      CASE
        WHEN inv.sales_last_30_days > 0
        THEN FLOOR((inv.stock / (inv.sales_last_30_days / 30.0)))
        ELSE 999
      END as days_of_stock
    FROM purchase_order_items poi
    LEFT JOIN inventory_items inv ON inv.sku = poi.inventory_sku
    WHERE poi.po_id = p_po_id
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'sku', ia.inventory_sku,
      'name', ia.item_name,
      'days_of_stock', ia.days_of_stock,
      'will_stockout', (ia.days_of_stock < p_delay_days)
    )
  ) INTO v_critical_items
  FROM item_analysis ia
  WHERE ia.days_of_stock < p_delay_days + 7; -- Critical if stockout within delay + 1 week

  -- Determine criticality
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_critical_items) item
    WHERE (item->>'will_stockout')::boolean = true
  ) THEN
    v_is_critical := true;
    v_priority := 'critical';
    v_reasoning := format('PO delay of %s days will cause stockout on critical items', p_delay_days);
    v_action := 'Expedite shipment or find alternative supplier immediately';
  ELSIF jsonb_array_length(v_critical_items) > 0 THEN
    v_priority := 'high';
    v_reasoning := format('PO delay of %s days brings items close to stockout', p_delay_days);
    v_action := 'Monitor closely and prepare contingency plan';
  ELSE
    v_priority := 'low';
    v_reasoning := format('PO delay of %s days has minimal impact (sufficient stock on hand)', p_delay_days);
    v_action := 'Update expected date, no immediate action needed';
  END IF;

  RETURN QUERY SELECT
    v_is_critical,
    v_priority,
    v_reasoning,
    v_critical_items,
    v_action;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Vendor Scorecard View
CREATE OR REPLACE VIEW vendor_scorecard AS
SELECT
  v.id,
  v.name,
  v.lead_time_days as promised_lead_time,
  vpm.effective_lead_time_days,
  vpm.on_time_rate,
  vpm.quality_rate,
  vpm.response_rate,
  vpm.trust_score,
  vpm.trust_score_trend,
  vpm.total_spend_usd,
  vpm.recommend_for_critical_orders,
  vpm.recommend_for_bulk_orders,
  vpm.agent_notes,
  vpm.period_end as metrics_as_of
FROM vendors v
LEFT JOIN LATERAL (
  SELECT *
  FROM vendor_performance_metrics
  WHERE vendor_id = v.id
  ORDER BY period_end DESC
  LIMIT 1
) vpm ON true;

COMMENT ON VIEW vendor_scorecard IS 'Vendor performance report card for UI';

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE vendor_performance_metrics IS
'Vendor Watchdog: Tracks actual vendor performance to learn and adjust planning';

COMMENT ON TABLE po_delivery_performance IS
'Records each PO delivery to build vendor performance history';

COMMENT ON TABLE bulk_opportunity_analysis IS
'Strategic Stockpiler: Identifies bulk buying opportunities to save costs';

COMMENT ON TABLE agent_performance_log IS
'Trust Score Dashboard: Tracks agent autonomous decision performance';

COMMENT ON FUNCTION calculate_vendor_trust_score IS
'Calculates 0-100 trust score based on vendor reliability';

COMMENT ON FUNCTION update_effective_lead_time IS
'Agent learns actual lead times and adjusts planning (Vendor Watchdog)';

COMMENT ON FUNCTION assess_po_delay_impact IS
'Air Traffic Controller: Determines if PO delay is critical based on stock levels';
