-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 142: Integrate Email Response Tracking with Vendor Confidence
-- ════════════════════════════════════════════════════════════════════════════
--
-- Connects the email thread response tracking (migrations 137-141) with the
-- vendor confidence scoring system (migration 053). Key integrations:
--
-- 1. Record vendor response latency as interaction events when emails arrive
-- 2. Add followup_response_score to vendor confidence (how often followup needed)
-- 3. Track response classification quality (confirmation vs problem responses)
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- ADD NEW SCORING COLUMN: followup_response_score
-- Measures how often the vendor responds without needing followups
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE vendor_confidence_profiles
ADD COLUMN IF NOT EXISTS followup_response_score NUMERIC(4,2) DEFAULT 5.0;

ALTER TABLE vendor_confidence_history
ADD COLUMN IF NOT EXISTS followup_response_score NUMERIC(4,2);

COMMENT ON COLUMN vendor_confidence_profiles.followup_response_score IS
'Score based on how often vendor responds without needing follow-up emails (0-10)';

-- ════════════════════════════════════════════════════════════════════════════
-- FUNCTION: Record vendor email response as interaction event
-- Called when a vendor responds to an email thread
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION record_vendor_email_response(
  p_thread_id UUID,
  p_vendor_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_thread RECORD;
  v_vendor_id UUID;
  v_response_latency_minutes NUMERIC;
  v_is_problem_response BOOLEAN;
BEGIN
  -- Get thread details
  SELECT
    et.id,
    et.finale_po_id,
    et.last_outbound_at,
    et.last_inbound_at,
    et.last_response_type,
    et.response_requires_action,
    et.followup_count,
    fpo.vendor_id
  INTO v_thread
  FROM email_threads et
  LEFT JOIN finale_purchase_orders fpo ON fpo.id = et.finale_po_id
  WHERE et.id = p_thread_id;

  IF v_thread.id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Determine vendor ID (from param, thread, or PO)
  v_vendor_id := COALESCE(
    p_vendor_id,
    v_thread.vendor_id
  );

  IF v_vendor_id IS NULL THEN
    -- Try to find vendor by email domain from the thread
    -- Skip if no vendor found
    RETURN FALSE;
  END IF;

  -- Calculate response latency in minutes
  IF v_thread.last_outbound_at IS NOT NULL AND v_thread.last_inbound_at IS NOT NULL THEN
    v_response_latency_minutes := EXTRACT(EPOCH FROM (
      v_thread.last_inbound_at - v_thread.last_outbound_at
    )) / 60;
  ELSE
    v_response_latency_minutes := NULL;
  END IF;

  -- Determine if this was a problem response
  v_is_problem_response := v_thread.response_requires_action OR
    v_thread.last_response_type IN ('question', 'delay_notice', 'issue', 'info_request', 'unknown');

  -- Record the interaction event
  INSERT INTO vendor_interaction_events (
    vendor_id,
    po_id,
    event_type,
    response_latency_minutes,
    is_threaded,
    payload,
    trigger_source
  ) VALUES (
    v_vendor_id,
    v_thread.finale_po_id,
    CASE
      WHEN v_is_problem_response THEN 'email_response_problem'
      ELSE 'email_response_good'
    END,
    v_response_latency_minutes,
    TRUE, -- Email responses are always threaded
    jsonb_build_object(
      'thread_id', v_thread.id,
      'response_type', v_thread.last_response_type,
      'requires_action', v_thread.response_requires_action,
      'followup_count', v_thread.followup_count
    ),
    'email_tracking'
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION record_vendor_email_response IS
'Records a vendor email response as an interaction event for confidence scoring.
Called when a vendor replies to an email thread.';

-- ════════════════════════════════════════════════════════════════════════════
-- TRIGGER: Auto-record vendor response events when emails arrive
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION trigger_record_vendor_response_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only process when vendor has responded (last_inbound_at changed)
  IF NEW.last_inbound_at IS NOT NULL AND
     (OLD.last_inbound_at IS NULL OR NEW.last_inbound_at != OLD.last_inbound_at) THEN

    -- Record the response event (asynchronously, don't fail if it doesn't work)
    BEGIN
      PERFORM record_vendor_email_response(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      -- Log but don't fail
      RAISE WARNING 'Failed to record vendor response event for thread %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_record_vendor_response_event ON email_threads;
CREATE TRIGGER tr_record_vendor_response_event
  AFTER UPDATE ON email_threads
  FOR EACH ROW
  EXECUTE FUNCTION trigger_record_vendor_response_event();

-- ════════════════════════════════════════════════════════════════════════════
-- UPDATE: Enhanced confidence calculation with followup tracking
-- ════════════════════════════════════════════════════════════════════════════

-- Drop the old function to change return type
DROP FUNCTION IF EXISTS calculate_vendor_confidence_factors(UUID);

CREATE OR REPLACE FUNCTION calculate_vendor_confidence_factors(_vendor_id UUID)
RETURNS TABLE (
  response_latency_score NUMERIC,
  threading_score NUMERIC,
  completeness_score NUMERIC,
  invoice_accuracy_score NUMERIC,
  lead_time_score NUMERIC,
  followup_response_score NUMERIC,
  interactions INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  avg_latency NUMERIC;
  threaded_ratio NUMERIC;
  completeness_avg NUMERIC;
  on_time_ratio NUMERIC;
  invoice_accuracy_avg NUMERIC;
  good_response_ratio NUMERIC;
  total_events INTEGER;
BEGIN
  SELECT
    AVG(vie.response_latency_minutes),
    AVG(CASE WHEN vie.is_threaded THEN 1 ELSE 0 END)::NUMERIC,
    AVG(vie.extraction_confidence),
    AVG(CASE WHEN vie.delivered_on_time THEN 1 ELSE 0 END)::NUMERIC,
    AVG(1 - COALESCE(vie.invoice_variance_percent, 0) / 100.0),
    -- Calculate good response ratio (responses without needing followup)
    AVG(CASE
      WHEN vie.event_type = 'email_response_good' THEN 1
      WHEN vie.event_type = 'email_response_problem' THEN 0
      ELSE NULL
    END)::NUMERIC,
    COUNT(*)
  INTO
    avg_latency,
    threaded_ratio,
    completeness_avg,
    on_time_ratio,
    invoice_accuracy_avg,
    good_response_ratio,
    total_events
  FROM vendor_interaction_events vie
  WHERE vie.vendor_id = _vendor_id;

  response_latency_score := CASE
    WHEN avg_latency IS NULL THEN 5
    WHEN avg_latency <= 240 THEN 10    -- 4 hours
    WHEN avg_latency <= 480 THEN 9     -- 8 hours
    WHEN avg_latency <= 1440 THEN 7    -- 1 day
    WHEN avg_latency <= 2880 THEN 5    -- 2 days
    WHEN avg_latency <= 4320 THEN 3    -- 3 days
    ELSE 1
  END;

  threading_score := CASE
    WHEN threaded_ratio IS NULL THEN 5
    WHEN threaded_ratio >= 0.95 THEN 10
    WHEN threaded_ratio >= 0.85 THEN 8
    WHEN threaded_ratio >= 0.70 THEN 6
    WHEN threaded_ratio >= 0.50 THEN 4
    ELSE 2
  END;

  completeness_score := COALESCE(ROUND(GREATEST(LEAST(completeness_avg * 10, 10), 0)::NUMERIC, 2), 5);

  invoice_accuracy_score := CASE
    WHEN invoice_accuracy_avg IS NULL THEN 5
    WHEN invoice_accuracy_avg >= 1 THEN 10
    WHEN invoice_accuracy_avg >= 0.9 THEN 8
    WHEN invoice_accuracy_avg >= 0.7 THEN 6
    WHEN invoice_accuracy_avg >= 0.5 THEN 4
    ELSE 2
  END;

  lead_time_score := CASE
    WHEN on_time_ratio IS NULL THEN 5
    WHEN on_time_ratio >= 0.95 THEN 10
    WHEN on_time_ratio >= 0.85 THEN 8
    WHEN on_time_ratio >= 0.70 THEN 6
    WHEN on_time_ratio >= 0.50 THEN 4
    ELSE 2
  END;

  -- Followup response score: How often vendor responds well without issues
  followup_response_score := CASE
    WHEN good_response_ratio IS NULL THEN 5
    WHEN good_response_ratio >= 0.95 THEN 10
    WHEN good_response_ratio >= 0.85 THEN 8
    WHEN good_response_ratio >= 0.70 THEN 6
    WHEN good_response_ratio >= 0.50 THEN 4
    ELSE 2
  END;

  interactions := COALESCE(total_events, 0);
  RETURN NEXT;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- UPDATE: Recalculate confidence with new followup score
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION recalculate_vendor_confidence(_vendor_id UUID, _trigger TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  factors RECORD;
  total_score NUMERIC;
  previous_score NUMERIC;
BEGIN
  SELECT * INTO factors FROM calculate_vendor_confidence_factors(_vendor_id);

  -- Updated weights: include followup_response_score (15%)
  -- Adjust other weights: response_latency 20%, threading 10%, completeness 15%,
  -- invoice_accuracy 25%, lead_time 15%, followup_response 15%
  total_score :=
    ROUND(
      (COALESCE(factors.response_latency_score, 5) * 0.20) +
      (COALESCE(factors.threading_score, 5) * 0.10) +
      (COALESCE(factors.completeness_score, 5) * 0.15) +
      (COALESCE(factors.invoice_accuracy_score, 5) * 0.25) +
      (COALESCE(factors.lead_time_score, 5) * 0.15) +
      (COALESCE(factors.followup_response_score, 5) * 0.15)
    , 2);

  SELECT confidence_score INTO previous_score FROM vendor_confidence_profiles WHERE vendor_id = _vendor_id;

  INSERT INTO vendor_confidence_history (
    vendor_id,
    confidence_score,
    response_latency_score,
    threading_score,
    completeness_score,
    invoice_accuracy_score,
    lead_time_score,
    followup_response_score,
    communication_status
  ) VALUES (
    _vendor_id,
    total_score,
    factors.response_latency_score,
    factors.threading_score,
    factors.completeness_score,
    factors.invoice_accuracy_score,
    factors.lead_time_score,
    factors.followup_response_score,
    get_communication_status_from_score(total_score)
  );

  UPDATE vendor_confidence_profiles
  SET
    confidence_score = total_score,
    response_latency_score = factors.response_latency_score,
    threading_score = factors.threading_score,
    completeness_score = factors.completeness_score,
    invoice_accuracy_score = factors.invoice_accuracy_score,
    lead_time_score = factors.lead_time_score,
    followup_response_score = factors.followup_response_score,
    interactions_count = factors.interactions,
    last_recalculated_at = NOW(),
    template_strictness = get_template_strictness_from_score(total_score),
    communication_status = get_communication_status_from_score(total_score),
    trend = CASE
      WHEN previous_score IS NULL OR total_score = previous_score THEN 'stable'
      WHEN total_score > previous_score THEN 'improving'
      ELSE 'declining'
    END,
    updated_at = NOW()
  WHERE vendor_id = _vendor_id;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- VIEW: Vendor confidence with email response summary
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW vendor_confidence_summary AS
SELECT
  vcp.id,
  vcp.vendor_id,
  v.name as vendor_name,
  vcp.confidence_score,
  vcp.response_latency_score,
  vcp.threading_score,
  vcp.completeness_score,
  vcp.invoice_accuracy_score,
  vcp.lead_time_score,
  vcp.followup_response_score,
  vcp.trend,
  vcp.template_strictness,
  vcp.communication_status,
  vcp.interactions_count,
  vcp.last_recalculated_at,
  -- Email response stats
  (
    SELECT COUNT(*)
    FROM email_threads et
    JOIN finale_purchase_orders fpo ON fpo.id = et.finale_po_id
    WHERE fpo.vendor_id::TEXT = v.id::TEXT
      AND et.last_inbound_at IS NOT NULL
  ) as email_responses_count,
  (
    SELECT AVG(EXTRACT(EPOCH FROM (et.last_inbound_at - et.last_outbound_at)) / 60)
    FROM email_threads et
    JOIN finale_purchase_orders fpo ON fpo.id = et.finale_po_id
    WHERE fpo.vendor_id::TEXT = v.id::TEXT
      AND et.last_inbound_at IS NOT NULL
      AND et.last_outbound_at IS NOT NULL
  ) as avg_response_time_minutes,
  (
    SELECT COUNT(*) FILTER (WHERE et.response_requires_action = TRUE)
    FROM email_threads et
    JOIN finale_purchase_orders fpo ON fpo.id = et.finale_po_id
    WHERE fpo.vendor_id::TEXT = v.id::TEXT
  ) as problem_responses_count
FROM vendor_confidence_profiles vcp
JOIN vendors v ON v.id = vcp.vendor_id;

-- ════════════════════════════════════════════════════════════════════════════
-- BACKFILL: Record events for existing email thread responses
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_thread RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_thread IN
    SELECT et.id, fpo.vendor_id
    FROM email_threads et
    JOIN finale_purchase_orders fpo ON fpo.id = et.finale_po_id
    WHERE et.last_inbound_at IS NOT NULL
      AND fpo.vendor_id IS NOT NULL
      -- Only process threads from last 90 days
      AND et.last_inbound_at > NOW() - INTERVAL '90 days'
  LOOP
    BEGIN
      PERFORM record_vendor_email_response(v_thread.id, v_thread.vendor_id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Skip errors
      NULL;
    END;
  END LOOP;

  RAISE NOTICE 'Recorded % vendor email response events', v_count;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Log migration stats
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_profiles_count INTEGER;
  v_events_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_profiles_count FROM vendor_confidence_profiles;
  SELECT COUNT(*) INTO v_events_count FROM vendor_interaction_events WHERE event_type LIKE 'email_response%';

  RAISE NOTICE 'Vendor Confidence Email Integration:';
  RAISE NOTICE '  Vendor profiles: %', v_profiles_count;
  RAISE NOTICE '  Email response events: %', v_events_count;
END $$;
