-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 138: Vendor Response Tracking with 2-Day Follow-Up Alerts
-- ════════════════════════════════════════════════════════════════════════════
--
-- Requirements:
-- 1. All PO emails initially sent will have a PO # attached
-- 2. Vendor replies need to be tracked
-- 3. If no response within 2 days, a follow-up is needed
-- 4. Vendor not responding needs to be noted
-- 5. Scan for vendor replies elsewhere to correlate responses
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- ADD RESPONSE TRACKING COLUMNS TO EMAIL_THREADS
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE email_threads
ADD COLUMN IF NOT EXISTS needs_followup BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS followup_due_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS followup_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS vendor_response_status TEXT CHECK (vendor_response_status IN (
  'awaiting_initial',     -- Sent PO, waiting for first response
  'responded',            -- Vendor has responded
  'followup_needed',      -- 2+ days since our last outbound, no vendor response
  'followup_sent',        -- We sent a follow-up
  'unresponsive',         -- Multiple follow-ups with no response
  'resolved'              -- Issue resolved (received confirmation/tracking)
)) DEFAULT 'awaiting_initial';

-- ════════════════════════════════════════════════════════════════════════════
-- VENDOR RESPONSE ALERTS TABLE
-- Track follow-up alerts and actions taken
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vendor_followup_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Links
  email_thread_id UUID REFERENCES email_threads(id) ON DELETE CASCADE,
  finale_po_id UUID REFERENCES finale_purchase_orders(id) ON DELETE SET NULL,
  vendor_id UUID,  -- From finale_vendors

  -- Alert details
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'no_response_48h',      -- No response within 48 hours
    'no_response_72h',      -- No response within 72 hours
    'unresponsive',         -- Multiple follow-ups with no response
    'followup_suggested',   -- System suggests follow-up
    'escalation_needed'     -- Needs human intervention
  )),

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',              -- Alert needs attention
    'dismissed',            -- User dismissed alert
    'action_taken',         -- Follow-up sent
    'resolved'              -- Vendor responded
  )),

  -- Timing
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,

  -- Context
  po_number TEXT,
  vendor_name TEXT,
  days_since_outbound DECIMAL(5,2),
  suggested_action TEXT,

  -- Actions taken
  action_taken TEXT,
  action_taken_at TIMESTAMPTZ,
  action_taken_by UUID REFERENCES auth.users(id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_vendor_followup_alerts_pending
  ON vendor_followup_alerts(status, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_vendor_followup_alerts_thread
  ON vendor_followup_alerts(email_thread_id);

CREATE INDEX IF NOT EXISTS idx_vendor_followup_alerts_po
  ON vendor_followup_alerts(finale_po_id);

-- ════════════════════════════════════════════════════════════════════════════
-- FUNCTION: Check for threads needing follow-up
-- Run periodically to identify POs without vendor responses
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION check_vendor_response_needed()
RETURNS TABLE (
  thread_id UUID,
  finale_po_id UUID,
  po_number VARCHAR(100),
  vendor_name VARCHAR(200),
  hours_since_outbound DECIMAL,
  last_outbound_at TIMESTAMPTZ,
  followup_count INTEGER,
  alert_type TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    et.id as thread_id,
    et.finale_po_id,
    fpo.order_id as po_number,
    fpo.vendor_name,
    EXTRACT(EPOCH FROM (NOW() - et.last_outbound_at)) / 3600 as hours_since_outbound,
    et.last_outbound_at,
    et.followup_count,
    CASE
      WHEN et.followup_count >= 2 THEN 'unresponsive'
      WHEN EXTRACT(EPOCH FROM (NOW() - et.last_outbound_at)) / 3600 > 72 THEN 'no_response_72h'
      WHEN EXTRACT(EPOCH FROM (NOW() - et.last_outbound_at)) / 3600 > 48 THEN 'no_response_48h'
      ELSE 'followup_suggested'
    END as alert_type
  FROM email_threads et
  JOIN finale_purchase_orders fpo ON fpo.id = et.finale_po_id
  WHERE et.finale_po_id IS NOT NULL
    AND et.last_outbound_at IS NOT NULL
    -- No vendor response since our last outbound
    AND (et.last_inbound_at IS NULL OR et.last_inbound_at < et.last_outbound_at)
    -- PO not yet received
    AND fpo.status NOT IN ('RECEIVED', 'CLOSED', 'CANCELED')
    -- More than 48 hours since our last outbound
    AND et.last_outbound_at < NOW() - INTERVAL '48 hours'
    -- Not already resolved
    AND et.vendor_response_status NOT IN ('resolved', 'responded')
  ORDER BY hours_since_outbound DESC;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- FUNCTION: Create follow-up alerts for unresponsive vendors
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION generate_followup_alerts()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER := 0;
  v_thread RECORD;
BEGIN
  FOR v_thread IN SELECT * FROM check_vendor_response_needed() LOOP
    -- Check if we already have a pending alert for this thread
    IF NOT EXISTS (
      SELECT 1 FROM vendor_followup_alerts
      WHERE email_thread_id = v_thread.thread_id
        AND status = 'pending'
    ) THEN
      -- Create new alert
      INSERT INTO vendor_followup_alerts (
        email_thread_id,
        finale_po_id,
        vendor_name,
        po_number,
        alert_type,
        days_since_outbound,
        suggested_action
      ) VALUES (
        v_thread.thread_id,
        v_thread.finale_po_id,
        v_thread.vendor_name,
        v_thread.po_number,
        v_thread.alert_type,
        v_thread.hours_since_outbound / 24,
        CASE v_thread.alert_type
          WHEN 'no_response_48h' THEN 'Send a polite follow-up email requesting confirmation'
          WHEN 'no_response_72h' THEN 'Send urgent follow-up - consider alternate vendor'
          WHEN 'unresponsive' THEN 'Escalate to management - vendor may be unreliable'
          ELSE 'Review thread and determine next steps'
        END
      );
      v_count := v_count + 1;

      -- Update thread status
      UPDATE email_threads
      SET needs_followup = TRUE,
          followup_due_at = NOW() + INTERVAL '24 hours',
          vendor_response_status = 'followup_needed'
      WHERE id = v_thread.thread_id;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- TRIGGER: Auto-update response status when vendor replies
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_vendor_response_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- When last_inbound_at is updated and is after last_outbound_at
  -- it means vendor has responded
  IF NEW.last_inbound_at IS NOT NULL
     AND (OLD.last_inbound_at IS NULL OR NEW.last_inbound_at != OLD.last_inbound_at)
     AND NEW.last_inbound_at > COALESCE(NEW.last_outbound_at, '1970-01-01') THEN

    NEW.vendor_response_status := 'responded';
    NEW.needs_followup := FALSE;

    -- Resolve any pending alerts for this thread
    UPDATE vendor_followup_alerts
    SET status = 'resolved',
        resolved_at = NOW()
    WHERE email_thread_id = NEW.id
      AND status = 'pending';
  END IF;

  -- When we send an outbound message, reset to awaiting
  IF NEW.last_outbound_at IS NOT NULL
     AND (OLD.last_outbound_at IS NULL OR NEW.last_outbound_at != OLD.last_outbound_at) THEN

    -- Only if no inbound after this outbound
    IF NEW.last_inbound_at IS NULL OR NEW.last_inbound_at < NEW.last_outbound_at THEN
      -- Check if this is a follow-up
      IF OLD.vendor_response_status = 'followup_needed' THEN
        NEW.followup_count := COALESCE(OLD.followup_count, 0) + 1;
        NEW.last_followup_at := NEW.last_outbound_at;
        NEW.vendor_response_status := 'followup_sent';
      ELSE
        NEW.vendor_response_status := 'awaiting_initial';
      END IF;

      -- Set follow-up due date
      NEW.followup_due_at := NEW.last_outbound_at + INTERVAL '48 hours';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_update_vendor_response_status ON email_threads;
CREATE TRIGGER tr_update_vendor_response_status
  BEFORE UPDATE ON email_threads
  FOR EACH ROW
  EXECUTE FUNCTION update_vendor_response_status();

-- ════════════════════════════════════════════════════════════════════════════
-- VIEW: Pending Vendor Follow-Ups
-- Quick access to threads needing attention
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW pending_vendor_followups AS
SELECT
  et.id as thread_id,
  et.finale_po_id,
  fpo.order_id as po_number,
  fpo.vendor_name,
  et.subject,
  et.vendor_response_status,
  et.followup_count,
  et.last_outbound_at,
  et.last_inbound_at,
  et.followup_due_at,
  EXTRACT(EPOCH FROM (NOW() - et.last_outbound_at)) / 3600 as hours_since_outbound,
  EXTRACT(EPOCH FROM (NOW() - et.last_outbound_at)) / 3600 / 24 as days_since_outbound,
  vfa.alert_type,
  vfa.suggested_action,
  vfa.status as alert_status,
  CASE
    WHEN et.followup_count >= 2 THEN 'critical'
    WHEN EXTRACT(EPOCH FROM (NOW() - et.last_outbound_at)) / 3600 > 72 THEN 'high'
    WHEN EXTRACT(EPOCH FROM (NOW() - et.last_outbound_at)) / 3600 > 48 THEN 'medium'
    ELSE 'low'
  END as urgency
FROM email_threads et
LEFT JOIN finale_purchase_orders fpo ON fpo.id = et.finale_po_id
LEFT JOIN vendor_followup_alerts vfa ON vfa.email_thread_id = et.id AND vfa.status = 'pending'
WHERE et.needs_followup = TRUE
   OR (et.last_outbound_at IS NOT NULL
       AND (et.last_inbound_at IS NULL OR et.last_inbound_at < et.last_outbound_at)
       AND et.vendor_response_status NOT IN ('resolved', 'responded'))
ORDER BY hours_since_outbound DESC;

-- ════════════════════════════════════════════════════════════════════════════
-- FUNCTION: Correlate vendor responses across all threads
-- Scans for vendor replies in other threads that might relate to a PO
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION find_vendor_responses_elsewhere(
  p_vendor_email TEXT,
  p_po_number TEXT,
  p_since TIMESTAMPTZ DEFAULT NOW() - INTERVAL '7 days'
)
RETURNS TABLE (
  thread_id UUID,
  message_id UUID,
  subject TEXT,
  body_preview TEXT,
  sent_at TIMESTAMPTZ,
  mentions_po BOOLEAN,
  mentions_tracking BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    et.id as thread_id,
    etm.id as message_id,
    etm.subject,
    etm.body_preview,
    COALESCE(etm.sent_at, etm.received_at) as sent_at,
    (etm.subject ILIKE '%' || p_po_number || '%'
     OR etm.body_preview ILIKE '%' || p_po_number || '%') as mentions_po,
    (etm.extracted_tracking_number IS NOT NULL
     OR etm.body_preview ILIKE '%tracking%'
     OR etm.body_preview ILIKE '%shipped%') as mentions_tracking
  FROM email_thread_messages etm
  JOIN email_threads et ON et.id = etm.thread_id
  WHERE etm.direction = 'inbound'
    AND etm.from_email ILIKE '%' || p_vendor_email || '%'
    AND COALESCE(etm.sent_at, etm.received_at) >= p_since
    -- Look in threads OTHER than those already linked to this PO
    AND (et.finale_po_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM finale_purchase_orders fpo
      WHERE fpo.id = et.finale_po_id
        AND fpo.order_number = p_po_number
    ))
  ORDER BY sent_at DESC;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- FUNCTION: Auto-correlate vendor responses from other threads
-- Run after email sync to find missed correlations
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION correlate_vendor_responses()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER := 0;
  v_thread RECORD;
  v_match RECORD;
BEGIN
  -- For each thread awaiting response
  FOR v_thread IN
    SELECT
      et.id as thread_id,
      et.primary_vendor_email,
      fpo.order_id as po_number
    FROM email_threads et
    JOIN finale_purchase_orders fpo ON fpo.id = et.finale_po_id
    WHERE et.vendor_response_status IN ('awaiting_initial', 'followup_needed', 'followup_sent')
      AND et.primary_vendor_email IS NOT NULL
  LOOP
    -- Check for responses in other threads
    FOR v_match IN
      SELECT * FROM find_vendor_responses_elsewhere(
        v_thread.primary_vendor_email,
        v_thread.po_number,
        NOW() - INTERVAL '7 days'
      )
      WHERE mentions_po = TRUE
    LOOP
      -- Found a match - update the original thread
      UPDATE email_threads
      SET vendor_response_status = 'responded',
          needs_followup = FALSE,
          correlation_details = jsonb_build_object(
            'found_in_thread', v_match.thread_id,
            'found_in_message', v_match.message_id,
            'matched_at', NOW()
          )
      WHERE id = v_thread.thread_id;

      -- Create engagement event
      PERFORM record_vendor_engagement(
        (SELECT vendor_id FROM finale_purchase_orders WHERE order_number = v_thread.po_number LIMIT 1),
        (SELECT id FROM finale_purchase_orders WHERE order_number = v_thread.po_number LIMIT 1),
        'vendor_acknowledged',
        'email_correlation',
        FALSE,
        TRUE,
        jsonb_build_object(
          'original_thread', v_thread.thread_id,
          'found_in_thread', v_match.thread_id,
          'correlation_type', 'cross_thread'
        )
      );

      v_count := v_count + 1;
      EXIT; -- Only need first match
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- Initial backfill: Set response status for existing threads
-- ════════════════════════════════════════════════════════════════════════════

UPDATE email_threads
SET vendor_response_status = CASE
  WHEN last_inbound_at IS NOT NULL AND last_inbound_at > COALESCE(last_outbound_at, '1970-01-01')
    THEN 'responded'
  WHEN last_outbound_at IS NOT NULL
    THEN 'awaiting_initial'
  ELSE 'awaiting_initial'
END,
followup_due_at = CASE
  WHEN last_outbound_at IS NOT NULL
       AND (last_inbound_at IS NULL OR last_inbound_at < last_outbound_at)
    THEN last_outbound_at + INTERVAL '48 hours'
  ELSE NULL
END,
needs_followup = CASE
  WHEN last_outbound_at IS NOT NULL
       AND (last_inbound_at IS NULL OR last_inbound_at < last_outbound_at)
       AND last_outbound_at < NOW() - INTERVAL '48 hours'
    THEN TRUE
  ELSE FALSE
END
WHERE finale_po_id IS NOT NULL;

-- Generate initial alerts
SELECT generate_followup_alerts();

-- Log stats
DO $$
DECLARE
  v_awaiting INTEGER;
  v_responded INTEGER;
  v_followup INTEGER;
  v_alerts INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_awaiting
  FROM email_threads
  WHERE vendor_response_status = 'awaiting_initial';

  SELECT COUNT(*) INTO v_responded
  FROM email_threads
  WHERE vendor_response_status = 'responded';

  SELECT COUNT(*) INTO v_followup
  FROM email_threads
  WHERE needs_followup = TRUE;

  SELECT COUNT(*) INTO v_alerts
  FROM vendor_followup_alerts
  WHERE status = 'pending';

  RAISE NOTICE 'Vendor Response Tracking Stats:';
  RAISE NOTICE '  Awaiting response: %', v_awaiting;
  RAISE NOTICE '  Vendor responded: %', v_responded;
  RAISE NOTICE '  Needs follow-up: %', v_followup;
  RAISE NOTICE '  Pending alerts: %', v_alerts;
END $$;
