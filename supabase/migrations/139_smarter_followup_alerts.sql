-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 139: Smarter Follow-Up Alerts - Avoid Nagging Vendors
-- ════════════════════════════════════════════════════════════════════════════
--
-- Requirements:
-- 1. Don't alert if we received a recent email from the same vendor
--    (even if it doesn't reference this specific PO)
-- 2. Don't alert if the PO has already been received
-- 3. Check vendor-wide activity, not just thread-specific
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- FUNCTION: Check if vendor has responded recently (any thread)
-- Returns TRUE if vendor sent us any email in the last N hours
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION vendor_has_recent_activity(
  p_vendor_email TEXT,
  p_within_hours INTEGER DEFAULT 48
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_has_activity BOOLEAN;
BEGIN
  -- Check if this vendor email has sent us ANY inbound message recently
  SELECT EXISTS (
    SELECT 1
    FROM email_thread_messages etm
    WHERE etm.direction = 'inbound'
      AND etm.sender_email ILIKE '%' || SPLIT_PART(p_vendor_email, '@', 2) || '%'
      AND COALESCE(etm.sent_at, etm.received_at) >= NOW() - (p_within_hours || ' hours')::INTERVAL
  ) INTO v_has_activity;

  RETURN v_has_activity;
END;
$$;

COMMENT ON FUNCTION vendor_has_recent_activity IS
'Checks if a vendor (by email domain) has sent any inbound email recently.
Used to avoid nagging vendors who are actively communicating on other threads.';

-- ════════════════════════════════════════════════════════════════════════════
-- UPDATED FUNCTION: Check for threads needing follow-up (SMARTER VERSION)
-- Now excludes:
-- - POs that have been received
-- - Threads where vendor has recent activity (any thread)
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
    -- No vendor response since our last outbound ON THIS THREAD
    AND (et.last_inbound_at IS NULL OR et.last_inbound_at < et.last_outbound_at)
    -- PO not yet received (CRITICAL: don't nag for received POs)
    AND fpo.status NOT IN ('RECEIVED', 'CLOSED', 'CANCELED', 'COMPLETED')
    -- More than 48 hours since our last outbound
    AND et.last_outbound_at < NOW() - INTERVAL '48 hours'
    -- Not already resolved
    AND et.vendor_response_status NOT IN ('resolved', 'responded')
    -- SMART CHECK: No recent activity from this vendor's domain (ANY thread)
    AND NOT vendor_has_recent_activity(et.primary_vendor_email, 48)
  ORDER BY hours_since_outbound DESC;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- UPDATED FUNCTION: Generate follow-up alerts (with smarter checks)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION generate_followup_alerts()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER := 0;
  v_thread RECORD;
  v_vendor_email TEXT;
  v_has_recent_vendor_activity BOOLEAN;
BEGIN
  FOR v_thread IN SELECT * FROM check_vendor_response_needed() LOOP
    -- Double-check: Get vendor email for this thread
    SELECT primary_vendor_email INTO v_vendor_email
    FROM email_threads
    WHERE id = v_thread.thread_id;

    -- Skip if vendor has any recent activity (belt and suspenders check)
    IF v_vendor_email IS NOT NULL THEN
      v_has_recent_vendor_activity := vendor_has_recent_activity(v_vendor_email, 48);
      IF v_has_recent_vendor_activity THEN
        -- Vendor is active - don't create alert, just log
        RAISE NOTICE 'Skipping alert for % - vendor has recent activity', v_thread.po_number;
        CONTINUE;
      END IF;
    END IF;

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
-- UPDATED VIEW: Pending Vendor Follow-Ups (with vendor activity check)
-- ════════════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS pending_vendor_followups;
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
  et.primary_vendor_email,
  EXTRACT(EPOCH FROM (NOW() - et.last_outbound_at)) / 3600 as hours_since_outbound,
  EXTRACT(EPOCH FROM (NOW() - et.last_outbound_at)) / 3600 / 24 as days_since_outbound,
  vfa.alert_type,
  vfa.suggested_action,
  vfa.status as alert_status,
  -- Check if vendor has recent activity
  vendor_has_recent_activity(et.primary_vendor_email, 48) as vendor_recently_active,
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
       AND et.vendor_response_status NOT IN ('resolved', 'responded')
       -- Exclude received POs
       AND (fpo.id IS NULL OR fpo.status NOT IN ('RECEIVED', 'CLOSED', 'CANCELED', 'COMPLETED')))
ORDER BY hours_since_outbound DESC;

-- ════════════════════════════════════════════════════════════════════════════
-- CLEANUP: Auto-resolve alerts for received POs
-- ════════════════════════════════════════════════════════════════════════════

UPDATE vendor_followup_alerts vfa
SET status = 'resolved',
    resolved_at = NOW(),
    action_taken = 'Auto-resolved: PO was received'
FROM finale_purchase_orders fpo
WHERE vfa.finale_po_id = fpo.id
  AND vfa.status = 'pending'
  AND fpo.status IN ('RECEIVED', 'CLOSED', 'CANCELED', 'COMPLETED');

-- Also clean up threads for received POs
UPDATE email_threads et
SET needs_followup = FALSE,
    vendor_response_status = 'resolved'
FROM finale_purchase_orders fpo
WHERE et.finale_po_id = fpo.id
  AND et.needs_followup = TRUE
  AND fpo.status IN ('RECEIVED', 'CLOSED', 'CANCELED', 'COMPLETED');

-- Log cleanup stats
DO $$
DECLARE
  v_resolved_alerts INTEGER;
  v_remaining_alerts INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_resolved_alerts
  FROM vendor_followup_alerts
  WHERE status = 'resolved'
    AND action_taken = 'Auto-resolved: PO was received';

  SELECT COUNT(*) INTO v_remaining_alerts
  FROM vendor_followup_alerts
  WHERE status = 'pending';

  RAISE NOTICE 'Auto-resolved alerts (PO received): %', v_resolved_alerts;
  RAISE NOTICE 'Remaining pending alerts: %', v_remaining_alerts;
END $$;
