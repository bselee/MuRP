-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 134: Vendor Engagement Score System
-- ════════════════════════════════════════════════════════════════════════════
--
-- Tracks vendor engagement across the full PO lifecycle:
-- 1. Time from PO sent → first vendor response
-- 2. Time from response → shipping/tracking provided
-- 3. Time from tracking → actual reception
-- 4. Overall engagement quality score (0-10 scale)
--
-- User requirement: "correlate vendor score with time sent to response,
-- response to shipping/tracking to actual reception. If no response low on
-- list, complete engagement 10 score."
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- VENDOR ENGAGEMENT EVENTS TABLE
-- Track each milestone in the PO engagement lifecycle
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vendor_engagement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Links
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
  po_id UUID, -- Can be purchase_orders or finale_purchase_orders
  finale_po_id UUID REFERENCES finale_purchase_orders(id) ON DELETE SET NULL,
  email_thread_id UUID REFERENCES email_threads(id) ON DELETE SET NULL,

  -- Event Type
  event_type TEXT NOT NULL CHECK (event_type IN (
    'po_sent',              -- Initial PO email sent
    'vendor_acknowledged',  -- Vendor replied (even generic)
    'vendor_confirmed',     -- Vendor confirmed order/availability
    'tracking_provided',    -- Tracking number received
    'shipped',             -- Carrier shows in-transit
    'delivered',           -- Package delivered
    'received_confirmed'   -- PO marked as received in system
  )),

  -- Timing
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Time since previous event (calculated)
  hours_since_po_sent DECIMAL(10,2),
  hours_since_last_event DECIMAL(10,2),

  -- Quality indicators
  was_proactive BOOLEAN DEFAULT FALSE, -- Did vendor reach out proactively?
  was_automated BOOLEAN DEFAULT FALSE, -- Was this an auto-reply?
  confidence DECIMAL(3,2) DEFAULT 1.0, -- How confident are we in this event?

  -- Context
  source TEXT CHECK (source IN ('email', 'manual', 'aftership', 'finale_sync', 'system')),
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_engagement_vendor ON vendor_engagement_events(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_engagement_po ON vendor_engagement_events(po_id);
CREATE INDEX IF NOT EXISTS idx_vendor_engagement_finale_po ON vendor_engagement_events(finale_po_id);
CREATE INDEX IF NOT EXISTS idx_vendor_engagement_type ON vendor_engagement_events(event_type);
CREATE INDEX IF NOT EXISTS idx_vendor_engagement_at ON vendor_engagement_events(event_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- VENDOR ENGAGEMENT SCORE VIEW
-- Calculate engagement score per vendor (0-10 scale)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW vendor_engagement_scores AS
WITH vendor_po_cycles AS (
  -- Get each PO's engagement cycle
  SELECT
    e.vendor_id,
    e.finale_po_id,
    MIN(CASE WHEN e.event_type = 'po_sent' THEN e.event_at END) as sent_at,
    MIN(CASE WHEN e.event_type IN ('vendor_acknowledged', 'vendor_confirmed') THEN e.event_at END) as first_response_at,
    MIN(CASE WHEN e.event_type = 'tracking_provided' THEN e.event_at END) as tracking_at,
    MIN(CASE WHEN e.event_type = 'delivered' THEN e.event_at END) as delivered_at,
    MIN(CASE WHEN e.event_type = 'received_confirmed' THEN e.event_at END) as received_at,
    COUNT(DISTINCT CASE WHEN e.event_type IN ('vendor_acknowledged', 'vendor_confirmed') THEN e.id END) as response_count,
    BOOL_OR(e.was_proactive) as had_proactive_response
  FROM vendor_engagement_events e
  WHERE e.event_at > NOW() - INTERVAL '90 days'  -- Last 90 days
  GROUP BY e.vendor_id, e.finale_po_id
  HAVING MIN(CASE WHEN e.event_type = 'po_sent' THEN e.event_at END) IS NOT NULL
),
vendor_metrics AS (
  SELECT
    vpc.vendor_id,
    COUNT(*) as total_pos,

    -- Response metrics
    COUNT(vpc.first_response_at) as pos_with_response,
    AVG(EXTRACT(EPOCH FROM (vpc.first_response_at - vpc.sent_at)) / 3600) as avg_response_hours,

    -- Tracking metrics
    COUNT(vpc.tracking_at) as pos_with_tracking,
    AVG(EXTRACT(EPOCH FROM (vpc.tracking_at - COALESCE(vpc.first_response_at, vpc.sent_at))) / 3600) as avg_tracking_hours,

    -- Delivery metrics
    COUNT(vpc.delivered_at) as pos_delivered,
    AVG(EXTRACT(EPOCH FROM (vpc.delivered_at - vpc.tracking_at)) / 3600) as avg_transit_hours,

    -- Completion metrics
    COUNT(vpc.received_at) as pos_received,

    -- Quality metrics
    SUM(CASE WHEN vpc.had_proactive_response THEN 1 ELSE 0 END) as proactive_responses,
    AVG(vpc.response_count) as avg_responses_per_po
  FROM vendor_po_cycles vpc
  GROUP BY vpc.vendor_id
)
SELECT
  vm.vendor_id,
  v.name as vendor_name,
  vm.total_pos,
  vm.pos_with_response,
  vm.avg_response_hours,
  vm.pos_with_tracking,
  vm.avg_tracking_hours,
  vm.pos_delivered,
  vm.avg_transit_hours,
  vm.pos_received,
  vm.proactive_responses,
  vm.avg_responses_per_po,

  -- Response Rate (0-100%)
  ROUND((vm.pos_with_response::DECIMAL / NULLIF(vm.total_pos, 0)) * 100, 1) as response_rate,

  -- Tracking Rate (0-100%)
  ROUND((vm.pos_with_tracking::DECIMAL / NULLIF(vm.total_pos, 0)) * 100, 1) as tracking_rate,

  -- Completion Rate (0-100%)
  ROUND((vm.pos_received::DECIMAL / NULLIF(vm.total_pos, 0)) * 100, 1) as completion_rate,

  -- ENGAGEMENT SCORE (0-10)
  -- Scoring logic:
  -- - Base: 5 points for responding at all
  -- - +2 points for fast response (<24h)
  -- - +1 point for providing tracking
  -- - +1 point for on-time delivery
  -- - +1 point for proactive communication
  -- No response = 0 score
  CASE
    WHEN vm.pos_with_response = 0 THEN 0
    ELSE LEAST(10, GREATEST(0,
      5.0  -- Base for responding
      + CASE WHEN vm.avg_response_hours IS NOT NULL AND vm.avg_response_hours < 24 THEN 2.0
             WHEN vm.avg_response_hours IS NOT NULL AND vm.avg_response_hours < 48 THEN 1.0
             ELSE 0 END
      + CASE WHEN vm.pos_with_tracking > vm.total_pos * 0.8 THEN 1.0
             WHEN vm.pos_with_tracking > vm.total_pos * 0.5 THEN 0.5
             ELSE 0 END
      + CASE WHEN vm.pos_received > vm.total_pos * 0.9 THEN 1.0
             WHEN vm.pos_received > vm.total_pos * 0.7 THEN 0.5
             ELSE 0 END
      + CASE WHEN vm.proactive_responses > vm.total_pos * 0.5 THEN 1.0 ELSE 0 END
    ))
  END as engagement_score,

  -- Score breakdown explanation
  CASE
    WHEN vm.pos_with_response = 0 THEN 'No responses received - needs attention'
    WHEN vm.avg_response_hours IS NOT NULL AND vm.avg_response_hours < 24
      AND vm.pos_with_tracking > vm.total_pos * 0.8
      AND vm.pos_received > vm.total_pos * 0.9 THEN 'Excellent - fast, complete engagement'
    WHEN vm.avg_response_hours IS NOT NULL AND vm.avg_response_hours < 48 THEN 'Good - responsive vendor'
    ELSE 'Average - room for improvement'
  END as engagement_summary,

  -- Last activity
  (SELECT MAX(e.event_at) FROM vendor_engagement_events e WHERE e.vendor_id = vm.vendor_id) as last_engagement_at

FROM vendor_metrics vm
JOIN vendors v ON v.id = vm.vendor_id;

COMMENT ON VIEW vendor_engagement_scores IS
'Calculates vendor engagement score (0-10) based on response time, tracking, and completion metrics';

-- ════════════════════════════════════════════════════════════════════════════
-- FUNCTION: Record Engagement Event
-- Called by email-inbox-poller, aftership-webhook, etc.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION record_vendor_engagement(
  p_vendor_id UUID,
  p_finale_po_id UUID,
  p_event_type TEXT,
  p_source TEXT DEFAULT 'system',
  p_was_proactive BOOLEAN DEFAULT FALSE,
  p_was_automated BOOLEAN DEFAULT FALSE,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id UUID;
  v_sent_at TIMESTAMPTZ;
  v_last_event_at TIMESTAMPTZ;
  v_hours_since_sent DECIMAL(10,2);
  v_hours_since_last DECIMAL(10,2);
BEGIN
  -- Get po_sent timestamp for this PO
  SELECT event_at INTO v_sent_at
  FROM vendor_engagement_events
  WHERE finale_po_id = p_finale_po_id AND event_type = 'po_sent'
  ORDER BY event_at ASC
  LIMIT 1;

  -- Get last event timestamp
  SELECT event_at INTO v_last_event_at
  FROM vendor_engagement_events
  WHERE finale_po_id = p_finale_po_id
  ORDER BY event_at DESC
  LIMIT 1;

  -- Calculate hours
  IF v_sent_at IS NOT NULL THEN
    v_hours_since_sent := EXTRACT(EPOCH FROM (NOW() - v_sent_at)) / 3600;
  END IF;

  IF v_last_event_at IS NOT NULL THEN
    v_hours_since_last := EXTRACT(EPOCH FROM (NOW() - v_last_event_at)) / 3600;
  END IF;

  -- Insert event
  INSERT INTO vendor_engagement_events (
    vendor_id,
    finale_po_id,
    event_type,
    event_at,
    hours_since_po_sent,
    hours_since_last_event,
    was_proactive,
    was_automated,
    source,
    metadata
  ) VALUES (
    p_vendor_id,
    p_finale_po_id,
    p_event_type,
    NOW(),
    v_hours_since_sent,
    v_hours_since_last,
    p_was_proactive,
    p_was_automated,
    p_source,
    p_metadata
  )
  RETURNING id INTO v_event_id;

  -- Update vendor_performance_metrics with new response time if applicable
  IF p_event_type IN ('vendor_acknowledged', 'vendor_confirmed') THEN
    -- Update avg_response_time_hours
    UPDATE vendor_performance_metrics
    SET
      emails_responded = emails_responded + 1,
      avg_response_time_hours = COALESCE(
        (avg_response_time_hours * (emails_responded - 1) + v_hours_since_sent) / emails_responded,
        v_hours_since_sent
      ),
      response_rate = CASE
        WHEN emails_sent > 0 THEN (emails_responded::DECIMAL / emails_sent) * 100
        ELSE 0
      END,
      last_updated = NOW()
    WHERE vendor_id = p_vendor_id
      AND period_end = (SELECT MAX(period_end) FROM vendor_performance_metrics WHERE vendor_id = p_vendor_id);
  END IF;

  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION record_vendor_engagement IS
'Records vendor engagement event and updates metrics. Called by email poller, webhooks, etc.';

-- ════════════════════════════════════════════════════════════════════════════
-- TRIGGER: Auto-record engagement on email thread updates
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION tr_email_thread_engagement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_vendor_id UUID;
BEGIN
  -- Only process if this thread is linked to a Finale PO
  IF NEW.finale_po_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get vendor ID from Finale PO
  SELECT vendor_id INTO v_vendor_id
  FROM finale_purchase_orders
  WHERE id = NEW.finale_po_id;

  IF v_vendor_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Record vendor response if last_inbound_at changed
  IF (OLD.last_inbound_at IS DISTINCT FROM NEW.last_inbound_at)
     AND NEW.last_inbound_at IS NOT NULL THEN
    PERFORM record_vendor_engagement(
      v_vendor_id,
      NEW.finale_po_id,
      'vendor_acknowledged',
      'email',
      FALSE,
      FALSE,
      jsonb_build_object('thread_id', NEW.id, 'subject', NEW.subject)
    );
  END IF;

  -- Record tracking provided if has_tracking_info became true
  IF (OLD.has_tracking_info IS DISTINCT FROM NEW.has_tracking_info)
     AND NEW.has_tracking_info = TRUE THEN
    PERFORM record_vendor_engagement(
      v_vendor_id,
      NEW.finale_po_id,
      'tracking_provided',
      'email',
      FALSE,
      FALSE,
      jsonb_build_object(
        'thread_id', NEW.id,
        'tracking_numbers', NEW.tracking_numbers
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS tr_email_thread_engagement ON email_threads;
CREATE TRIGGER tr_email_thread_engagement
  AFTER UPDATE ON email_threads
  FOR EACH ROW
  EXECUTE FUNCTION tr_email_thread_engagement();

-- ════════════════════════════════════════════════════════════════════════════
-- FUNCTION: Calculate overall vendor engagement quality
-- Returns 0-100 score combining all engagement factors
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION calculate_vendor_engagement_quality(p_vendor_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_score DECIMAL(5,2);
  v_engagement RECORD;
BEGIN
  -- Get engagement metrics
  SELECT * INTO v_engagement
  FROM vendor_engagement_scores
  WHERE vendor_id = p_vendor_id;

  IF NOT FOUND OR v_engagement.total_pos = 0 THEN
    RETURN 50; -- Neutral default
  END IF;

  -- Convert 0-10 engagement score to 0-100
  v_score := v_engagement.engagement_score * 10;

  RETURN GREATEST(0, LEAST(100, ROUND(v_score)));
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- UPDATE VENDOR SCORECARD VIEW
-- Include engagement score in vendor scorecard
-- ════════════════════════════════════════════════════════════════════════════

-- First drop the dependent view if it exists
DROP VIEW IF EXISTS vendor_scorecard CASCADE;

CREATE OR REPLACE VIEW vendor_scorecard AS
SELECT
  v.id,
  v.name,
  v.lead_time_days as promised_lead_time,
  vpm.effective_lead_time_days,
  vpm.on_time_rate,
  vpm.quality_rate,
  vpm.response_rate,
  vpm.avg_response_time_hours,
  vpm.trust_score,
  vpm.trust_score_trend,
  vpm.total_spend_usd,
  vpm.recommend_for_critical_orders,
  vpm.recommend_for_bulk_orders,
  vpm.agent_notes,
  vpm.period_end as metrics_as_of,
  -- New engagement metrics
  ves.engagement_score,
  ves.response_rate as email_response_rate,
  ves.tracking_rate,
  ves.completion_rate,
  ves.avg_response_hours as engagement_response_hours,
  ves.engagement_summary,
  ves.last_engagement_at
FROM vendors v
LEFT JOIN LATERAL (
  SELECT *
  FROM vendor_performance_metrics
  WHERE vendor_id = v.id
  ORDER BY period_end DESC
  LIMIT 1
) vpm ON true
LEFT JOIN vendor_engagement_scores ves ON ves.vendor_id = v.id;

COMMENT ON VIEW vendor_scorecard IS 'Complete vendor performance scorecard including engagement metrics';

-- ════════════════════════════════════════════════════════════════════════════
-- GRANTS
-- ════════════════════════════════════════════════════════════════════════════

GRANT SELECT ON vendor_engagement_events TO authenticated, anon, service_role;
GRANT INSERT, UPDATE ON vendor_engagement_events TO authenticated, service_role;
GRANT SELECT ON vendor_engagement_scores TO authenticated, anon, service_role;
GRANT SELECT ON vendor_scorecard TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION record_vendor_engagement TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION calculate_vendor_engagement_quality TO authenticated, service_role;
