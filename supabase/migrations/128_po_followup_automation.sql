-- ============================================================================
-- Migration 128: PO Follow-Up Automation
-- Automatic follow-up emails for overdue POs via pg_cron
-- ============================================================================

-- ============================================================================
-- ADD COLUMNS TO PURCHASE_ORDERS FOR FOLLOW-UP TRACKING
-- ============================================================================

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS follow_up_required BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_follow_up_stage INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_follow_up_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS follow_up_status VARCHAR(30),
    -- pending_response, responded, escalated, resolved
  ADD COLUMN IF NOT EXISTS vendor_response_status VARCHAR(30),
  ADD COLUMN IF NOT EXISTS next_follow_up_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_followup_enabled BOOLEAN DEFAULT TRUE;

-- Index for finding POs needing follow-up
CREATE INDEX IF NOT EXISTS idx_po_followup_due
  ON purchase_orders(next_follow_up_due_at, follow_up_required)
  WHERE follow_up_required = TRUE AND auto_followup_enabled = TRUE;

-- ============================================================================
-- FUNCTION: Identify POs Needing Follow-Up
-- ============================================================================

CREATE OR REPLACE FUNCTION identify_pos_needing_followup()
RETURNS TABLE (
  po_id UUID,
  po_number VARCHAR,
  vendor_name VARCHAR,
  days_overdue INTEGER,
  followup_stage INTEGER,
  reason TEXT
) AS $$
BEGIN
  RETURN QUERY

  -- 1. POs past expected date with no tracking
  SELECT
    po.id,
    po.order_id,
    po.supplier_name,
    (CURRENT_DATE - po.expected_date::date)::integer as days_overdue,
    COALESCE(po.last_follow_up_stage, 0) + 1,
    'Past expected date, no tracking'::text
  FROM purchase_orders po
  WHERE po.status IN ('sent', 'confirmed')
    AND po.expected_date < CURRENT_DATE
    AND po.tracking_number IS NULL
    AND po.auto_followup_enabled = TRUE
    AND (
      po.last_follow_up_sent_at IS NULL
      OR po.last_follow_up_sent_at < CURRENT_TIMESTAMP - INTERVAL '3 days'
    )

  UNION ALL

  -- 2. POs sent but no confirmation after 2 business days
  SELECT
    po.id,
    po.order_id,
    po.supplier_name,
    EXTRACT(DAY FROM CURRENT_TIMESTAMP - po.sent_at)::integer,
    COALESCE(po.last_follow_up_stage, 0) + 1,
    'No vendor confirmation'::text
  FROM purchase_orders po
  WHERE po.status = 'sent'
    AND po.sent_at < CURRENT_TIMESTAMP - INTERVAL '2 days'
    AND po.confirmed_at IS NULL
    AND po.auto_followup_enabled = TRUE
    AND (
      po.last_follow_up_sent_at IS NULL
      OR po.last_follow_up_sent_at < CURRENT_TIMESTAMP - INTERVAL '2 days'
    )

  UNION ALL

  -- 3. POs with stale tracking (no update in 5+ days)
  SELECT
    po.id,
    po.order_id,
    po.supplier_name,
    EXTRACT(DAY FROM CURRENT_TIMESTAMP - COALESCE(at.last_checkpoint_time, po.tracking_last_checked_at))::integer,
    COALESCE(po.last_follow_up_stage, 0) + 1,
    'Tracking stale'::text
  FROM purchase_orders po
  LEFT JOIN aftership_trackings at ON po.id = at.po_id
  WHERE po.status IN ('sent', 'confirmed')
    AND po.tracking_number IS NOT NULL
    AND at.tag NOT IN ('Delivered', 'Exception')
    AND COALESCE(at.last_checkpoint_time, po.tracking_last_checked_at) < CURRENT_TIMESTAMP - INTERVAL '5 days'
    AND po.auto_followup_enabled = TRUE
    AND (
      po.last_follow_up_sent_at IS NULL
      OR po.last_follow_up_sent_at < CURRENT_TIMESTAMP - INTERVAL '3 days'
    )

  ORDER BY days_overdue DESC
  LIMIT 50;

END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION identify_pos_needing_followup IS 'Find POs that need automated follow-up';

-- ============================================================================
-- FUNCTION: Schedule Next Follow-Ups
-- ============================================================================

CREATE OR REPLACE FUNCTION schedule_next_followups()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  -- Schedule follow-ups for identified POs
  WITH candidates AS (
    SELECT * FROM identify_pos_needing_followup()
  )
  UPDATE purchase_orders po
  SET
    follow_up_required = TRUE,
    next_follow_up_due_at = CURRENT_TIMESTAMP,
    updated_at = NOW()
  FROM candidates c
  WHERE po.id = c.po_id
    AND po.follow_up_required = FALSE;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION schedule_next_followups IS 'Mark POs as needing follow-up';

-- ============================================================================
-- VIEW: Overdue POs Dashboard
-- ============================================================================

CREATE OR REPLACE VIEW overdue_pos_dashboard AS
SELECT
  po.id,
  po.order_id,
  po.supplier_name,
  po.status,
  po.order_date,
  po.expected_date,
  (CURRENT_DATE - po.expected_date::date) as days_overdue,
  po.total_amount,
  po.tracking_number,
  po.tracking_status,
  po.last_follow_up_stage,
  po.last_follow_up_sent_at,
  po.follow_up_status,
  po.auto_followup_enabled,
  CASE
    WHEN po.tracking_number IS NULL THEN 'No tracking'
    WHEN po.confirmed_at IS NULL THEN 'Not confirmed'
    WHEN po.tracking_status = 'in_transit' THEN 'In transit'
    ELSE 'Unknown'
  END as delay_reason,
  v.contact_emails[1] as vendor_email
FROM purchase_orders po
LEFT JOIN vendors v ON po.vendor_id = v.id
WHERE po.status IN ('sent', 'confirmed', 'partial')
  AND (
    po.expected_date < CURRENT_DATE
    OR (po.sent_at < CURRENT_TIMESTAMP - INTERVAL '3 days' AND po.confirmed_at IS NULL)
  )
ORDER BY
  (CURRENT_DATE - po.expected_date::date) DESC NULLS LAST,
  po.total_amount DESC;

COMMENT ON VIEW overdue_pos_dashboard IS 'POs that are overdue or need attention';

-- ============================================================================
-- PO FOLLOW-UP CAMPAIGNS TABLE (if not exists)
-- ============================================================================

CREATE TABLE IF NOT EXISTS po_followup_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  trigger_type VARCHAR(30) NOT NULL,
    -- tracking_missing, invoice_missing, no_confirmation, overdue
  active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add priority column if it doesn't exist
ALTER TABLE po_followup_campaigns ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 10;

-- Update check constraint to allow new trigger types
ALTER TABLE po_followup_campaigns DROP CONSTRAINT IF EXISTS po_followup_campaigns_trigger_type_check;
ALTER TABLE po_followup_campaigns ADD CONSTRAINT po_followup_campaigns_trigger_type_check 
  CHECK (trigger_type IN ('tracking_missing', 'invoice_missing', 'custom', 'no_confirmation', 'overdue'));

-- Default campaigns
INSERT INTO po_followup_campaigns (name, description, trigger_type, active, priority)
VALUES
  ('Tracking Missing', 'Follow up when vendor hasn''t provided tracking', 'tracking_missing', true, 10),
  ('No Confirmation', 'Follow up when vendor hasn''t confirmed order', 'no_confirmation', true, 20),
  ('Overdue Orders', 'Follow up when order is past expected date', 'overdue', true, 5)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PO FOLLOW-UP RULES TABLE (if not exists)
-- ============================================================================

CREATE TABLE IF NOT EXISTS po_followup_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES po_followup_campaigns(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL,
  wait_hours INTEGER NOT NULL DEFAULT 72,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  instructions TEXT,
  escalate_after_stage INTEGER,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns to existing table
ALTER TABLE po_followup_rules ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES po_followup_campaigns(id) ON DELETE CASCADE;
ALTER TABLE po_followup_rules ADD COLUMN IF NOT EXISTS escalate_after_stage INTEGER;

-- Default rules
INSERT INTO po_followup_rules (campaign_id, stage, wait_hours, subject_template, body_template)
SELECT
  c.id,
  1,
  48,
  'Following up: Order {{po_number}}',
  'Hi there,

We placed order {{po_number}} on {{order_date}} ({{order_age_days}} days ago).

Could you please provide the tracking number when the order ships?

Thank you!'
FROM po_followup_campaigns c
WHERE c.trigger_type = 'tracking_missing'
ON CONFLICT DO NOTHING;

INSERT INTO po_followup_rules (campaign_id, stage, wait_hours, subject_template, body_template)
SELECT
  c.id,
  2,
  72,
  'Second follow-up: Order {{po_number}} - Tracking needed',
  'Hi,

This is our second request for tracking information on order {{po_number}}.

The order was placed {{order_age_days}} days ago. Please provide tracking or an update on the shipment status.

Thank you!'
FROM po_followup_campaigns c
WHERE c.trigger_type = 'tracking_missing'
ON CONFLICT DO NOTHING;

INSERT INTO po_followup_rules (campaign_id, stage, wait_hours, subject_template, body_template, escalate_after_stage)
SELECT
  c.id,
  3,
  48,
  'URGENT: Order {{po_number}} - Immediate attention required',
  'Hi,

We still have not received tracking for order {{po_number}} placed {{order_age_days}} days ago.

This is now urgent. Please provide tracking information immediately or let us know if there are any issues with the order.

If we do not hear back within 24 hours, we may need to escalate this matter.

Thank you.',
  3
FROM po_followup_campaigns c
WHERE c.trigger_type = 'tracking_missing'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PO FOLLOW-UP CAMPAIGN STATE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS po_followup_campaign_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES po_followup_campaigns(id) ON DELETE CASCADE,
  last_stage INTEGER DEFAULT 0,
  last_sent_at TIMESTAMPTZ,
  status VARCHAR(30) DEFAULT 'pending',
    -- pending, pending_response, responded, escalated, completed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(po_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_state_pending
  ON po_followup_campaign_state(status, campaign_id)
  WHERE status IN ('pending', 'pending_response');

-- ============================================================================
-- ADD PG_CRON JOBS
-- ============================================================================

-- Run follow-up check every morning at 8am
SELECT cron.schedule(
  'daily-po-followup-check',
  '0 8 * * *',  -- 8:00 AM daily
  $$SELECT schedule_next_followups()$$
);

-- Run follow-up runner every 2 hours during business hours
SELECT cron.schedule(
  'po-followup-runner',
  '0 9,11,13,15,17 * * 1-5',  -- 9am, 11am, 1pm, 3pm, 5pm Mon-Fri
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/po-followup-runner',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )$$
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE po_followup_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_followup_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_followup_campaign_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read po_followup_campaigns"
  ON po_followup_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read po_followup_rules"
  ON po_followup_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read po_followup_campaign_state"
  ON po_followup_campaign_state FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow service role full access po_followup_campaigns"
  ON po_followup_campaigns FOR ALL TO service_role USING (true);
CREATE POLICY "Allow service role full access po_followup_rules"
  ON po_followup_rules FOR ALL TO service_role USING (true);
CREATE POLICY "Allow service role full access po_followup_campaign_state"
  ON po_followup_campaign_state FOR ALL TO service_role USING (true);

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT ON po_followup_campaigns TO authenticated;
GRANT SELECT ON po_followup_rules TO authenticated;
GRANT SELECT ON po_followup_campaign_state TO authenticated;
GRANT SELECT ON overdue_pos_dashboard TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON SCHEMA public IS 'PO Follow-Up Automation - Migration 128 Complete';
