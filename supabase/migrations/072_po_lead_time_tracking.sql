-- Migration 072: Purchase Order Lead Time Tracking for Vendor Confidence

-- New table to track PO status transitions with timestamps
CREATE TABLE IF NOT EXISTS po_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  previous_status VARCHAR(50),
  new_status VARCHAR(50) NOT NULL,
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CHECK (new_status IN ('draft', 'pending', 'sent', 'confirmed', 'committed', 'partial', 'received', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_po_status_history_po_id 
  ON po_status_history(po_id, status_changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_po_status_history_vendor_id 
  ON po_status_history(vendor_id, status_changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_po_status_history_status 
  ON po_status_history(new_status, status_changed_at DESC);

COMMENT ON TABLE po_status_history IS 'Immutable log of all PO status changes with timestamps for lead time analysis';

-- Add columns to track commitment and actual delivery times
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS committed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actual_lead_days INTEGER GENERATED ALWAYS AS (
    CASE 
      WHEN received_at IS NOT NULL AND committed_at IS NOT NULL 
        THEN EXTRACT(DAY FROM (received_at - committed_at))::INTEGER
      ELSE NULL
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_po_committed_at 
  ON purchase_orders(committed_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_po_received_at 
  ON purchase_orders(received_at DESC NULLS LAST);

COMMENT ON COLUMN purchase_orders.committed_at IS 'Timestamp when PO status transitioned to confirmed/committed';
COMMENT ON COLUMN purchase_orders.received_at IS 'Timestamp when PO was actually received (status = received)';
COMMENT ON COLUMN purchase_orders.actual_lead_days IS 'Actual days from committed to received (read-only calculated field)';

-- Table to aggregate vendor lead time metrics
CREATE TABLE IF NOT EXISTS vendor_lead_time_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  
  -- Lead time statistics
  avg_lead_days NUMERIC(5, 2),
  median_lead_days NUMERIC(5, 2),
  min_lead_days INTEGER,
  max_lead_days INTEGER,
  stddev_lead_days NUMERIC(5, 2),
  
  -- On-time delivery metrics
  total_pos_completed INTEGER DEFAULT 0,
  pos_on_time INTEGER DEFAULT 0,
  pos_late INTEGER DEFAULT 0,
  on_time_percentage NUMERIC(5, 2),
  
  -- Recent trend (last 30 days)
  avg_lead_days_30d NUMERIC(5, 2),
  on_time_percentage_30d NUMERIC(5, 2),
  recent_pos_count INTEGER DEFAULT 0,
  
  -- Confidence factors
  lead_time_variance_score NUMERIC(3, 2), -- 0-1: lower is better (more consistent)
  lead_time_reliability_score NUMERIC(3, 2), -- 0-1: on-time delivery percentage
  lead_time_predictability_score NUMERIC(3, 2), -- 0-1: based on variance vs avg
  
  -- Metadata
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT DEFAULT 'system',
  
  UNIQUE(vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_lead_time_metrics_vendor_id 
  ON vendor_lead_time_metrics(vendor_id);

CREATE INDEX IF NOT EXISTS idx_vendor_lead_time_metrics_reliability 
  ON vendor_lead_time_metrics(lead_time_reliability_score DESC);

COMMENT ON TABLE vendor_lead_time_metrics IS 'Aggregated lead time statistics per vendor for confidence scoring';

-- Function to update PO status history and timestamps
CREATE OR REPLACE FUNCTION update_po_status_with_history()
RETURNS TRIGGER AS $$
BEGIN
  -- Only track if status actually changed
  IF (NEW.status IS DISTINCT FROM OLD.status) THEN
    -- Record the status change
    INSERT INTO po_status_history (
      po_id,
      vendor_id,
      previous_status,
      new_status,
      status_changed_at,
      changed_by
    ) VALUES (
      NEW.id,
      NEW.vendor_id,
      OLD.status,
      NEW.status,
      NOW(),
      auth.uid()
    );
    
    -- Update committed_at timestamp when transitioning to confirmed/committed
    IF (NEW.status IN ('confirmed', 'committed') AND OLD.status NOT IN ('confirmed', 'committed')) THEN
      NEW.committed_at = NOW();
    END IF;
    
    -- Update received_at timestamp when transitioning to received
    IF (NEW.status = 'received' AND OLD.status != 'received') THEN
      NEW.received_at = NOW();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop old trigger if it exists
DROP TRIGGER IF EXISTS po_status_with_history_trigger ON purchase_orders;

-- Create trigger
CREATE TRIGGER po_status_with_history_trigger
BEFORE UPDATE ON purchase_orders
FOR EACH ROW
EXECUTE FUNCTION update_po_status_with_history();

COMMENT ON FUNCTION update_po_status_with_history() IS 'Automatically tracks status changes and records commitment/delivery timestamps';

-- Function to calculate vendor lead time metrics
CREATE OR REPLACE FUNCTION calculate_vendor_lead_time_metrics(p_vendor_id UUID)
RETURNS TABLE (
  vendor_id UUID,
  avg_lead_days NUMERIC,
  median_lead_days NUMERIC,
  on_time_percentage NUMERIC,
  lead_time_reliability_score NUMERIC,
  pos_completed INTEGER,
  pos_on_time INTEGER
) AS $$
DECLARE
  v_avg_lead NUMERIC(5, 2);
  v_median_lead NUMERIC(5, 2);
  v_stddev_lead NUMERIC(5, 2);
  v_min_lead INTEGER;
  v_max_lead INTEGER;
  v_total_pos INTEGER;
  v_on_time_pos INTEGER;
  v_on_time_pct NUMERIC(5, 2);
  v_variance_score NUMERIC(3, 2);
  v_reliability_score NUMERIC(3, 2);
  v_predictability_score NUMERIC(3, 2);
  v_avg_30d NUMERIC(5, 2);
  v_on_time_30d NUMERIC(5, 2);
  v_count_30d INTEGER;
BEGIN
  -- Get all completed POs for vendor with actual lead times
  SELECT
    COALESCE(AVG(po.actual_lead_days)::NUMERIC(5,2), 0),
    COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY po.actual_lead_days)::NUMERIC(5,2), 0),
    COALESCE(STDDEV(po.actual_lead_days)::NUMERIC(5,2), 0),
    COALESCE(MIN(po.actual_lead_days), 0),
    COALESCE(MAX(po.actual_lead_days), 0),
    COUNT(*)::INTEGER
  INTO
    v_avg_lead,
    v_median_lead,
    v_stddev_lead,
    v_min_lead,
    v_max_lead,
    v_total_pos
  FROM purchase_orders po
  WHERE po.vendor_id = p_vendor_id
    AND po.received_at IS NOT NULL
    AND po.committed_at IS NOT NULL
    AND po.status = 'received';

  -- Count on-time deliveries (received within estimated date + 2 day buffer)
  SELECT COUNT(*)::INTEGER INTO v_on_time_pos
  FROM purchase_orders po
  WHERE po.vendor_id = p_vendor_id
    AND po.received_at IS NOT NULL
    AND po.estimated_date IS NOT NULL
    AND po.received_at <= (po.estimated_date::TIMESTAMPTZ + INTERVAL '2 days')
    AND po.status = 'received';

  -- Calculate on-time percentage
  v_on_time_pct := CASE 
    WHEN v_total_pos > 0 THEN (v_on_time_pos::NUMERIC / v_total_pos * 100)::NUMERIC(5,2)
    ELSE 0
  END;

  -- Calculate variance score (0-1, lower variance = higher score)
  -- Normalize stddev relative to average (coefficient of variation)
  v_variance_score := CASE
    WHEN v_avg_lead > 0 AND v_stddev_lead > 0 
      THEN LEAST(1.0, (v_stddev_lead / v_avg_lead)::NUMERIC(3,2))
    WHEN v_stddev_lead = 0 THEN 1.0 -- Perfect consistency
    ELSE 0.5
  END;

  -- Reliability score = on-time percentage / 100 (0-1 scale)
  v_reliability_score := LEAST(1.0, (v_on_time_pct / 100)::NUMERIC(3,2));

  -- Predictability = inverse of variance (consistent delivery = predictable)
  v_predictability_score := CASE
    WHEN v_variance_score > 0 THEN (1.0 - v_variance_score)::NUMERIC(3,2)
    ELSE 0.5
  END;

  -- Get last 30 days metrics
  SELECT
    COALESCE(AVG(po.actual_lead_days)::NUMERIC(5,2), 0),
    COALESCE(SUM(CASE WHEN po.received_at <= (po.estimated_date::TIMESTAMPTZ + INTERVAL '2 days') THEN 1 ELSE 0 END)::NUMERIC / COUNT(*)::NUMERIC * 100, 0)::NUMERIC(5,2),
    COUNT(*)::INTEGER
  INTO
    v_avg_30d,
    v_on_time_30d,
    v_count_30d
  FROM purchase_orders po
  WHERE po.vendor_id = p_vendor_id
    AND po.received_at IS NOT NULL
    AND po.committed_at IS NOT NULL
    AND po.committed_at >= NOW() - INTERVAL '30 days'
    AND po.status = 'received';

  -- Update or insert metrics
  INSERT INTO vendor_lead_time_metrics (
    vendor_id,
    avg_lead_days,
    median_lead_days,
    min_lead_days,
    max_lead_days,
    stddev_lead_days,
    total_pos_completed,
    pos_on_time,
    pos_late,
    on_time_percentage,
    avg_lead_days_30d,
    on_time_percentage_30d,
    recent_pos_count,
    lead_time_variance_score,
    lead_time_reliability_score,
    lead_time_predictability_score,
    calculated_at,
    last_updated_at,
    updated_by
  ) VALUES (
    p_vendor_id,
    v_avg_lead,
    v_median_lead,
    v_min_lead,
    v_max_lead,
    v_stddev_lead,
    v_total_pos,
    v_on_time_pos,
    (v_total_pos - v_on_time_pos),
    v_on_time_pct,
    v_avg_30d,
    v_on_time_30d,
    v_count_30d,
    v_variance_score,
    v_reliability_score,
    v_predictability_score,
    NOW(),
    NOW(),
    'system'
  )
  ON CONFLICT (vendor_id) DO UPDATE SET
    avg_lead_days = EXCLUDED.avg_lead_days,
    median_lead_days = EXCLUDED.median_lead_days,
    min_lead_days = EXCLUDED.min_lead_days,
    max_lead_days = EXCLUDED.max_lead_days,
    stddev_lead_days = EXCLUDED.stddev_lead_days,
    total_pos_completed = EXCLUDED.total_pos_completed,
    pos_on_time = EXCLUDED.pos_on_time,
    pos_late = EXCLUDED.pos_late,
    on_time_percentage = EXCLUDED.on_time_percentage,
    avg_lead_days_30d = EXCLUDED.avg_lead_days_30d,
    on_time_percentage_30d = EXCLUDED.on_time_percentage_30d,
    recent_pos_count = EXCLUDED.recent_pos_count,
    lead_time_variance_score = EXCLUDED.lead_time_variance_score,
    lead_time_reliability_score = EXCLUDED.lead_time_reliability_score,
    lead_time_predictability_score = EXCLUDED.lead_time_predictability_score,
    last_updated_at = EXCLUDED.last_updated_at;

  RETURN QUERY
  SELECT
    p_vendor_id,
    v_avg_lead,
    v_median_lead,
    v_on_time_pct,
    v_reliability_score,
    v_total_pos,
    v_on_time_pos;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION calculate_vendor_lead_time_metrics(UUID) IS 'Calculate and update vendor lead time statistics and confidence factors';

-- View for easy access to vendor lead time analysis
CREATE OR REPLACE VIEW vendor_lead_time_analysis AS
SELECT
  v.id,
  v.name,
  vlt.avg_lead_days,
  vlt.median_lead_days,
  vlt.min_lead_days,
  vlt.max_lead_days,
  vlt.stddev_lead_days,
  vlt.total_pos_completed,
  vlt.pos_on_time,
  vlt.pos_late,
  vlt.on_time_percentage,
  vlt.avg_lead_days_30d,
  vlt.on_time_percentage_30d,
  vlt.recent_pos_count,
  vlt.lead_time_variance_score,
  vlt.lead_time_reliability_score,
  vlt.lead_time_predictability_score,
  -- Combined lead time confidence score (0-100)
  ROUND((
    (vlt.lead_time_reliability_score * 0.5) + -- 50% weight: on-time delivery
    ((1.0 - vlt.lead_time_variance_score) * 0.3) + -- 30% weight: consistency
    (vlt.lead_time_predictability_score * 0.2) -- 20% weight: predictability
  ) * 100)::INTEGER AS lead_time_confidence_score,
  vlt.last_updated_at,
  -- Risk assessment
  CASE
    WHEN vlt.on_time_percentage >= 95 AND vlt.lead_time_variance_score < 0.3 THEN 'Low Risk'
    WHEN vlt.on_time_percentage >= 80 AND vlt.lead_time_variance_score < 0.5 THEN 'Medium Risk'
    WHEN vlt.on_time_percentage < 70 OR vlt.lead_time_variance_score > 0.7 THEN 'High Risk'
    ELSE 'Medium Risk'
  END AS lead_time_risk_level
FROM vendors v
LEFT JOIN vendor_lead_time_metrics vlt ON v.id = vlt.vendor_id;

COMMENT ON VIEW vendor_lead_time_analysis IS 'Comprehensive vendor lead time analysis with risk assessment';

-- Grant permissions
GRANT SELECT ON vendor_lead_time_metrics TO authenticated;
GRANT SELECT ON po_status_history TO authenticated;
GRANT SELECT ON vendor_lead_time_analysis TO authenticated;
