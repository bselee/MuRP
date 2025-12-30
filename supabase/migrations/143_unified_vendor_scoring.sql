-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 143: Unified Vendor Scoring
-- ════════════════════════════════════════════════════════════════════════════
--
-- Connects two vendor scoring systems:
-- 1. Vendor Watchdog Agent (delivery performance, lead times, trust)
-- 2. Vendor Confidence Service (communication, response times, threading)
--
-- Creates a unified view for ordering guidance based on:
-- - Response time (from email tracking)
-- - Follow-up frequency (how often followups needed)
-- - Delivery time reliability (from PO receipts)
-- - Overall vendor turnaround assessment
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- FUNCTION: Calculate vendor response metrics from email threads
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION calculate_vendor_email_metrics(p_vendor_id UUID)
RETURNS TABLE (
  avg_response_hours NUMERIC,
  response_count INTEGER,
  problem_response_count INTEGER,
  good_response_count INTEGER,
  followup_required_count INTEGER,
  response_score NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    -- Average response time in hours
    AVG(
      EXTRACT(EPOCH FROM (et.last_inbound_at - et.last_outbound_at)) / 3600
    )::NUMERIC as avg_response_hours,

    -- Total responses
    COUNT(*)::INTEGER as response_count,

    -- Problem responses (questions, delays, issues)
    COUNT(*) FILTER (
      WHERE et.last_response_type IN ('question', 'delay_notice', 'issue', 'info_request', 'unknown')
    )::INTEGER as problem_response_count,

    -- Good responses (confirmations, tracking, acknowledgments)
    COUNT(*) FILTER (
      WHERE et.last_response_type IN ('confirmation', 'tracking_provided', 'acknowledgment', 'price_quote')
    )::INTEGER as good_response_count,

    -- Threads that required followup
    COUNT(*) FILTER (
      WHERE et.followup_count > 0
    )::INTEGER as followup_required_count,

    -- Response score (0-10)
    CASE
      WHEN COUNT(*) = 0 THEN 5.0
      ELSE LEAST(10, GREATEST(0,
        -- Base: Good response ratio
        (COUNT(*) FILTER (WHERE et.last_response_type IN ('confirmation', 'tracking_provided', 'acknowledgment'))::NUMERIC / NULLIF(COUNT(*), 0) * 10) * 0.5 +
        -- Penalty for slow responses
        CASE
          WHEN AVG(EXTRACT(EPOCH FROM (et.last_inbound_at - et.last_outbound_at)) / 3600) IS NULL THEN 5
          WHEN AVG(EXTRACT(EPOCH FROM (et.last_inbound_at - et.last_outbound_at)) / 3600) < 24 THEN 10
          WHEN AVG(EXTRACT(EPOCH FROM (et.last_inbound_at - et.last_outbound_at)) / 3600) < 48 THEN 7
          WHEN AVG(EXTRACT(EPOCH FROM (et.last_inbound_at - et.last_outbound_at)) / 3600) < 72 THEN 5
          ELSE 2
        END * 0.3 +
        -- Bonus for not needing followups
        (1 - COUNT(*) FILTER (WHERE et.followup_count > 0)::NUMERIC / NULLIF(COUNT(*), 0)) * 10 * 0.2
      ))
    END::NUMERIC as response_score

  FROM email_threads et
  JOIN finale_purchase_orders fpo ON fpo.id = et.finale_po_id
  WHERE fpo.vendor_id::TEXT = p_vendor_id::TEXT
    AND et.last_inbound_at IS NOT NULL
    AND et.last_outbound_at IS NOT NULL
    AND et.last_inbound_at > NOW() - INTERVAL '180 days';
END;
$$;

COMMENT ON FUNCTION calculate_vendor_email_metrics IS
'Calculates vendor email response metrics from email threads for the last 180 days.
Returns avg response time, response counts, and a composite response score (0-10).';

-- ════════════════════════════════════════════════════════════════════════════
-- FUNCTION: Calculate vendor delivery metrics from PO history
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION calculate_vendor_delivery_metrics(p_vendor_id UUID)
RETURNS TABLE (
  total_pos INTEGER,
  on_time_count INTEGER,
  late_count INTEGER,
  avg_lead_days NUMERIC,
  on_time_rate NUMERIC,
  delivery_score NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_pos,

    -- On time = received within 2 days of expected
    COUNT(*) FILTER (
      WHERE fpo.received_date IS NOT NULL
        AND fpo.expected_date IS NOT NULL
        AND fpo.received_date::DATE <= (fpo.expected_date::DATE + INTERVAL '2 days')
    )::INTEGER as on_time_count,

    -- Late = more than 2 days after expected
    COUNT(*) FILTER (
      WHERE fpo.received_date IS NOT NULL
        AND fpo.expected_date IS NOT NULL
        AND fpo.received_date::DATE > (fpo.expected_date::DATE + INTERVAL '2 days')
    )::INTEGER as late_count,

    -- Average lead time (order to receipt)
    AVG(
      EXTRACT(DAY FROM (fpo.received_date::TIMESTAMP - fpo.order_date::TIMESTAMP))
    )::NUMERIC as avg_lead_days,

    -- On time rate
    CASE
      WHEN COUNT(*) FILTER (WHERE fpo.received_date IS NOT NULL AND fpo.expected_date IS NOT NULL) = 0 THEN 0.5
      ELSE COUNT(*) FILTER (
        WHERE fpo.received_date IS NOT NULL
          AND fpo.expected_date IS NOT NULL
          AND fpo.received_date::DATE <= (fpo.expected_date::DATE + INTERVAL '2 days')
      )::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE fpo.received_date IS NOT NULL AND fpo.expected_date IS NOT NULL), 0)
    END as on_time_rate,

    -- Delivery score (0-10)
    CASE
      WHEN COUNT(*) FILTER (WHERE fpo.received_date IS NOT NULL) = 0 THEN 5.0
      ELSE LEAST(10, GREATEST(0,
        CASE
          WHEN COUNT(*) FILTER (WHERE fpo.received_date IS NOT NULL AND fpo.expected_date IS NOT NULL) = 0 THEN 5
          ELSE COUNT(*) FILTER (
            WHERE fpo.received_date IS NOT NULL
              AND fpo.expected_date IS NOT NULL
              AND fpo.received_date::DATE <= (fpo.expected_date::DATE + INTERVAL '2 days')
          )::NUMERIC / NULLIF(COUNT(*) FILTER (WHERE fpo.received_date IS NOT NULL AND fpo.expected_date IS NOT NULL), 0) * 10
        END
      ))
    END::NUMERIC as delivery_score

  FROM finale_purchase_orders fpo
  WHERE fpo.vendor_id::TEXT = p_vendor_id::TEXT
    AND fpo.order_date > NOW() - INTERVAL '365 days';
END;
$$;

COMMENT ON FUNCTION calculate_vendor_delivery_metrics IS
'Calculates vendor delivery metrics from PO history for the last 365 days.
Returns on-time rate, lead time stats, and a composite delivery score (0-10).';

-- ════════════════════════════════════════════════════════════════════════════
-- VIEW: Unified Vendor Score for Ordering Guidance
-- Combines response time, followup frequency, and delivery reliability
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW vendor_ordering_guidance AS
SELECT
  v.id as vendor_id,
  v.name as vendor_name,
  v.contact_emails[1] as vendor_email,  -- First email in array
  v.lead_time_days as stated_lead_time,

  -- Email Response Metrics
  em.avg_response_hours,
  em.response_count,
  em.problem_response_count,
  em.good_response_count,
  em.followup_required_count,
  em.response_score,

  -- Delivery Metrics
  dm.total_pos,
  dm.on_time_count,
  dm.late_count,
  dm.avg_lead_days as actual_avg_lead_days,
  dm.on_time_rate,
  dm.delivery_score,

  -- Confidence Profile (if exists)
  vcp.confidence_score,
  vcp.followup_response_score,
  vcp.response_latency_score,
  vcp.communication_status,
  vcp.trend,

  -- ════════════════════════════════════════════════════════════════════
  -- UNIFIED ORDERING GUIDANCE SCORE (0-100)
  -- Weights: Response (25%), Followup (20%), Delivery (35%), Confidence (20%)
  -- ════════════════════════════════════════════════════════════════════
  ROUND(
    COALESCE(em.response_score, 5) * 2.5 +       -- 25% - Response speed & quality
    COALESCE(vcp.followup_response_score, 5) * 2 +  -- 20% - Low followup needed
    COALESCE(dm.delivery_score, 5) * 3.5 +       -- 35% - On-time delivery
    COALESCE(vcp.confidence_score, 5) * 2         -- 20% - Overall confidence
  , 0)::INTEGER as ordering_score,

  -- Ordering recommendation tier
  CASE
    WHEN COALESCE(em.response_score, 5) * 2.5 +
         COALESCE(vcp.followup_response_score, 5) * 2 +
         COALESCE(dm.delivery_score, 5) * 3.5 +
         COALESCE(vcp.confidence_score, 5) * 2 >= 80 THEN 'preferred'
    WHEN COALESCE(em.response_score, 5) * 2.5 +
         COALESCE(vcp.followup_response_score, 5) * 2 +
         COALESCE(dm.delivery_score, 5) * 3.5 +
         COALESCE(vcp.confidence_score, 5) * 2 >= 60 THEN 'standard'
    WHEN COALESCE(em.response_score, 5) * 2.5 +
         COALESCE(vcp.followup_response_score, 5) * 2 +
         COALESCE(dm.delivery_score, 5) * 3.5 +
         COALESCE(vcp.confidence_score, 5) * 2 >= 40 THEN 'caution'
    ELSE 'avoid'
  END as ordering_tier,

  -- Lead time recommendation (use actual if significantly different from stated)
  CASE
    WHEN dm.avg_lead_days IS NULL THEN v.lead_time_days
    WHEN ABS(dm.avg_lead_days - COALESCE(v.lead_time_days, 14)) > 5 THEN
      CEIL(dm.avg_lead_days + 3)::INTEGER -- Add 3 day buffer to actual
    ELSE v.lead_time_days
  END as recommended_lead_days,

  -- Ordering guidance text
  CASE
    WHEN em.avg_response_hours > 72 AND dm.on_time_rate < 0.7 THEN
      'CAUTION: Slow responses and poor delivery. Plan extra buffer time.'
    WHEN em.avg_response_hours > 48 THEN
      'Note: Slow email responses. Allow extra time for confirmation.'
    WHEN em.followup_required_count > em.response_count * 0.3 THEN
      'Note: Often requires follow-up. Monitor orders closely.'
    WHEN dm.on_time_rate < 0.7 THEN
      'CAUTION: Frequent late deliveries. Add buffer to lead time.'
    WHEN dm.delivery_score >= 8 AND em.response_score >= 8 THEN
      'EXCELLENT: Reliable vendor. Good for critical orders.'
    WHEN dm.delivery_score >= 6 AND em.response_score >= 6 THEN
      'GOOD: Solid performance. Standard ordering procedures.'
    ELSE
      'STANDARD: Monitor performance. Use stated lead times.'
  END as ordering_guidance

FROM vendors v
LEFT JOIN LATERAL calculate_vendor_email_metrics(v.id) em ON true
LEFT JOIN LATERAL calculate_vendor_delivery_metrics(v.id) dm ON true
LEFT JOIN vendor_confidence_profiles vcp ON vcp.vendor_id = v.id
WHERE v.is_active = true OR v.is_active IS NULL;

COMMENT ON VIEW vendor_ordering_guidance IS
'Unified vendor scoring for ordering decisions. Combines:
- Response speed and quality from email tracking
- Follow-up frequency (how often manual intervention needed)
- Delivery reliability from PO history
- Overall confidence score

Use ordering_score (0-100) and ordering_tier for vendor selection.
Use recommended_lead_days for planning.';

-- ════════════════════════════════════════════════════════════════════════════
-- SIMPLIFIED VENDOR SCORE (1-10) with Real Examples
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_vendor_score_with_examples(p_vendor_id UUID)
RETURNS TABLE (
  vendor_id UUID,
  vendor_name TEXT,
  score INTEGER,           -- Simple 1-10 score
  score_breakdown JSONB,   -- Component scores
  recent_examples JSONB,   -- Real PO examples with delivery times
  issues_summary JSONB,    -- Any problems/odd circumstances from emails
  recommendation TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_vendor_name TEXT;
  v_response_score NUMERIC;
  v_delivery_score NUMERIC;
  v_followup_score NUMERIC;
  v_unified_score INTEGER;
BEGIN
  -- Get vendor name
  SELECT name INTO v_vendor_name FROM vendors WHERE id = p_vendor_id;

  -- Calculate component scores
  SELECT em.response_score INTO v_response_score
  FROM calculate_vendor_email_metrics(p_vendor_id) em;

  SELECT dm.delivery_score INTO v_delivery_score
  FROM calculate_vendor_delivery_metrics(p_vendor_id) dm;

  SELECT followup_response_score INTO v_followup_score
  FROM vendor_confidence_profiles WHERE vendor_id = p_vendor_id;

  -- Calculate unified 1-10 score
  v_unified_score := ROUND(
    (COALESCE(v_response_score, 5) * 0.30 +     -- 30% response quality
     COALESCE(v_delivery_score, 5) * 0.45 +     -- 45% delivery reliability
     COALESCE(v_followup_score, 5) * 0.25)      -- 25% low followup needed
  )::INTEGER;

  RETURN QUERY
  SELECT
    p_vendor_id as vendor_id,
    v_vendor_name as vendor_name,
    v_unified_score as score,

    -- Score breakdown
    jsonb_build_object(
      'response_speed', ROUND(COALESCE(v_response_score, 5), 1),
      'delivery_reliability', ROUND(COALESCE(v_delivery_score, 5), 1),
      'low_followup_needed', ROUND(COALESCE(v_followup_score, 5), 1)
    ) as score_breakdown,

    -- Recent real examples (last 5 completed POs with times)
    (
      SELECT COALESCE(jsonb_agg(examples ORDER BY order_date DESC), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'po_number', fpo.order_id,
          'order_date', fpo.order_date,
          'expected_date', fpo.expected_date,
          'received_date', fpo.received_date,
          'lead_days', EXTRACT(DAY FROM (fpo.received_date::TIMESTAMP - fpo.order_date::TIMESTAMP)),
          'days_vs_expected', CASE
            WHEN fpo.expected_date IS NOT NULL AND fpo.received_date IS NOT NULL THEN
              EXTRACT(DAY FROM (fpo.received_date::TIMESTAMP - fpo.expected_date::TIMESTAMP))
            ELSE NULL
          END,
          'status', CASE
            WHEN fpo.expected_date IS NULL THEN 'no_eta'
            WHEN fpo.received_date::DATE <= fpo.expected_date::DATE THEN 'on_time'
            WHEN fpo.received_date::DATE <= (fpo.expected_date::DATE + INTERVAL '3 days') THEN 'slightly_late'
            ELSE 'late'
          END
        ) as examples,
        fpo.order_date
        FROM finale_purchase_orders fpo
        WHERE fpo.vendor_id::TEXT = p_vendor_id::TEXT
          AND fpo.received_date IS NOT NULL
        ORDER BY fpo.order_date DESC
        LIMIT 5
      ) recent_pos
    ) as recent_examples,

    -- Issues/odd circumstances from email threads
    (
      SELECT COALESCE(jsonb_agg(issues), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'po_number', fpo.order_id,
          'issue_type', et.last_response_type,
          'action_needed', et.response_action_type,
          'date', et.last_inbound_at,
          'resolved', NOT COALESCE(et.response_requires_action, false),
          'followup_count', et.followup_count,
          'summary', CASE et.last_response_type
            WHEN 'delay_notice' THEN 'Vendor reported delay'
            WHEN 'question' THEN 'Vendor asked a question'
            WHEN 'issue' THEN 'Problem reported'
            WHEN 'info_request' THEN 'More info needed'
            ELSE 'Needs review'
          END
        ) as issues
        FROM email_threads et
        JOIN finale_purchase_orders fpo ON fpo.id = et.finale_po_id
        WHERE fpo.vendor_id::TEXT = p_vendor_id::TEXT
          AND et.last_response_type IN ('delay_notice', 'question', 'issue', 'info_request', 'unknown')
          AND et.last_inbound_at > NOW() - INTERVAL '180 days'
        ORDER BY et.last_inbound_at DESC
        LIMIT 10
      ) recent_issues
    ) as issues_summary,

    -- Plain text recommendation
    CASE
      WHEN v_unified_score >= 9 THEN 'Excellent vendor. Use for critical orders.'
      WHEN v_unified_score >= 7 THEN 'Good vendor. Reliable for standard orders.'
      WHEN v_unified_score >= 5 THEN 'Average vendor. Monitor orders closely.'
      WHEN v_unified_score >= 3 THEN 'Below average. Add buffer time to orders.'
      ELSE 'Poor performance. Consider alternatives.'
    END as recommendation;
END;
$$;

COMMENT ON FUNCTION get_vendor_score_with_examples IS
'Returns a simple 1-10 vendor score with:
- Score breakdown (response, delivery, followup)
- Real PO examples showing actual lead times
- Issues/problems from email conversations
- Plain text recommendation

Use this for vendor scorecards and ordering decisions.';

-- ════════════════════════════════════════════════════════════════════════════
-- Function to get ordering guidance for a specific vendor
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_vendor_ordering_guidance(p_vendor_id UUID)
RETURNS TABLE (
  vendor_id UUID,
  vendor_name TEXT,
  ordering_score INTEGER,
  ordering_tier TEXT,
  recommended_lead_days INTEGER,
  ordering_guidance TEXT,
  response_score NUMERIC,
  delivery_score NUMERIC,
  on_time_rate NUMERIC,
  avg_response_hours NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vog.vendor_id,
    vog.vendor_name,
    vog.ordering_score,
    vog.ordering_tier,
    vog.recommended_lead_days,
    vog.ordering_guidance,
    vog.response_score,
    vog.delivery_score,
    vog.on_time_rate,
    vog.avg_response_hours
  FROM vendor_ordering_guidance vog
  WHERE vog.vendor_id = p_vendor_id;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- Integrate with Vendor Watchdog: Record delivery events
-- Updates confidence when POs are received
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION trigger_record_po_delivery_for_confidence()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_vendor_id UUID;
  v_was_on_time BOOLEAN;
BEGIN
  -- Only process when status changes to RECEIVED
  IF NEW.status IN ('RECEIVED', 'Received') AND
     (OLD.status IS NULL OR OLD.status NOT IN ('RECEIVED', 'Received')) THEN

    v_vendor_id := NEW.vendor_id;

    IF v_vendor_id IS NOT NULL THEN
      -- Determine if on time
      v_was_on_time := (
        NEW.expected_date IS NULL OR
        NEW.received_date::DATE <= (NEW.expected_date::DATE + INTERVAL '2 days')
      );

      -- Record as interaction event for confidence scoring
      INSERT INTO vendor_interaction_events (
        vendor_id,
        po_id,
        event_type,
        delivered_on_time,
        payload,
        trigger_source
      ) VALUES (
        v_vendor_id,
        NEW.id,
        'po_delivery',
        v_was_on_time,
        jsonb_build_object(
          'order_id', NEW.order_id,
          'expected_date', NEW.expected_date,
          'received_date', NEW.received_date
        ),
        'po_receipt'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_record_po_delivery_confidence ON finale_purchase_orders;
CREATE TRIGGER tr_record_po_delivery_confidence
  AFTER UPDATE ON finale_purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_record_po_delivery_for_confidence();

-- ════════════════════════════════════════════════════════════════════════════
-- Log migration stats
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_vendor_count INTEGER;
  v_with_email_data INTEGER;
  v_with_delivery_data INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_vendor_count
  FROM vendors WHERE is_active = true OR is_active IS NULL;

  SELECT COUNT(DISTINCT fpo.vendor_id) INTO v_with_email_data
  FROM finale_purchase_orders fpo
  JOIN email_threads et ON et.finale_po_id = fpo.id
  WHERE et.last_inbound_at IS NOT NULL;

  SELECT COUNT(DISTINCT vendor_id) INTO v_with_delivery_data
  FROM finale_purchase_orders
  WHERE received_date IS NOT NULL;

  RAISE NOTICE 'Unified Vendor Scoring:';
  RAISE NOTICE '  Total active vendors: %', v_vendor_count;
  RAISE NOTICE '  Vendors with email response data: %', v_with_email_data;
  RAISE NOTICE '  Vendors with delivery data: %', v_with_delivery_data;
END $$;
