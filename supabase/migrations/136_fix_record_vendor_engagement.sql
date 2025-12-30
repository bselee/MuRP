-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 136: Fix record_vendor_engagement Function
-- ════════════════════════════════════════════════════════════════════════════
--
-- Problem: record_vendor_engagement() tries to SET response_rate which is a
-- GENERATED column. This causes errors when email thread updates trigger the
-- engagement recording flow.
--
-- Solution: Remove the explicit SET response_rate since it's auto-calculated.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION record_vendor_engagement(
  p_vendor_id UUID,
  p_finale_po_id UUID,
  p_event_type TEXT,  -- One of: po_sent, vendor_acknowledged, vendor_confirmed, tracking_provided, shipped, delivered, received_confirmed
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
  -- NOTE: Do NOT set response_rate - it's a GENERATED column (auto-calculated from emails_sent/emails_responded)
  IF p_event_type IN ('vendor_acknowledged', 'vendor_confirmed') THEN
    UPDATE vendor_performance_metrics
    SET
      emails_responded = emails_responded + 1,
      avg_response_time_hours = COALESCE(
        (avg_response_time_hours * (emails_responded - 1) + v_hours_since_sent) / emails_responded,
        v_hours_since_sent
      ),
      last_updated = NOW()
    WHERE vendor_id = p_vendor_id
      AND period_end = (SELECT MAX(period_end) FROM vendor_performance_metrics WHERE vendor_id = p_vendor_id);
  END IF;

  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION record_vendor_engagement IS
'Records vendor engagement event and updates metrics. Called by email poller, webhooks, etc.
Fixed in migration 136: Removed explicit SET response_rate since it is a GENERATED column.';
