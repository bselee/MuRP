-- ============================================================================
-- Migration 130: Autonomy Triggers and Cron Job Fixes
-- Database triggers for automatic three-way match and backorder processing
-- ============================================================================

-- ============================================================================
-- ADD MISSING COLUMNS TO INVOICE_DISPUTES
-- ============================================================================

ALTER TABLE invoice_disputes
  ADD COLUMN IF NOT EXISTS vendor_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vendor_response_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS resolution_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS resolution_details JSONB,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS requires_human BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS follow_up_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_follow_up_due_at TIMESTAMPTZ;

-- ============================================================================
-- ADD VENDOR TRUST EVENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS vendor_trust_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  outcome VARCHAR(20) NOT NULL, -- positive, negative, neutral
  details JSONB DEFAULT '{}',
  trust_impact DECIMAL(5,4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_trust_events_vendor
  ON vendor_trust_events(vendor_id, created_at DESC);

COMMENT ON TABLE vendor_trust_events IS 'Trust score change events for vendors';

-- ============================================================================
-- RPC: INCREMENT VENDOR METRIC
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_vendor_metric(
  p_vendor_id UUID,
  p_metric_name TEXT,
  p_increment INTEGER DEFAULT 1
) RETURNS VOID AS $$
BEGIN
  -- Use dynamic SQL to increment the metric column
  EXECUTE format(
    'UPDATE vendors SET %I = COALESCE(%I, 0) + $1, updated_at = NOW() WHERE id = $2',
    p_metric_name, p_metric_name
  ) USING p_increment, p_vendor_id;
EXCEPTION
  WHEN undefined_column THEN
    -- Column doesn't exist, ignore
    NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_vendor_metric IS 'Safely increment a vendor metric column';

-- ============================================================================
-- FUNCTION: TRIGGER THREE-WAY MATCH ON INVOICE DETECTION
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_three_way_match_on_invoice()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger if invoice_detected_at was just set
  IF NEW.invoice_detected_at IS NOT NULL AND OLD.invoice_detected_at IS NULL THEN
    -- Mark PO as needing three-way match
    UPDATE purchase_orders
    SET
      three_way_match_status = 'pending',
      updated_at = NOW()
    WHERE id = NEW.id;

    -- Queue the three-way match runner via pg_net
    -- This calls the edge function asynchronously
    PERFORM net.http_post(
      url := current_setting('app.supabase_url', true) || '/functions/v1/three-way-match-runner',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('poId', NEW.id::text)
    );
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Don't fail the transaction if HTTP call fails
    RAISE WARNING 'Failed to trigger three-way-match: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_invoice_detected_three_way_match ON purchase_orders;
CREATE TRIGGER trigger_invoice_detected_three_way_match
  AFTER UPDATE OF invoice_detected_at ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_three_way_match_on_invoice();

COMMENT ON FUNCTION trigger_three_way_match_on_invoice IS 'Auto-trigger three-way match when invoice detected';

-- ============================================================================
-- FUNCTION: TRIGGER BACKORDER CHECK ON PARTIAL RECEIPT
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_backorder_check_on_partial()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger if status changed to 'partial' or 'PARTIALLY_RECEIVED'
  IF NEW.status IN ('partial', 'PARTIALLY_RECEIVED') AND
     (OLD.status IS NULL OR OLD.status NOT IN ('partial', 'PARTIALLY_RECEIVED')) THEN

    -- Queue the backorder processor via pg_net
    PERFORM net.http_post(
      url := current_setting('app.supabase_url', true) || '/functions/v1/backorder-processor',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('poId', NEW.id::text)
    );
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Don't fail the transaction if HTTP call fails
    RAISE WARNING 'Failed to trigger backorder-processor: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_partial_receipt_backorder ON purchase_orders;
CREATE TRIGGER trigger_partial_receipt_backorder
  AFTER UPDATE OF status ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_backorder_check_on_partial();

COMMENT ON FUNCTION trigger_backorder_check_on_partial IS 'Auto-trigger backorder check on partial receipt';

-- ============================================================================
-- UPDATE CRON JOBS TO USE PROPER SETTINGS
-- ============================================================================

-- Remove old cron jobs that use incorrect settings
SELECT cron.unschedule('daily-backorder-check') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-backorder-check'
);

SELECT cron.unschedule('daily-dispute-followup') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-dispute-followup'
);

-- Add new cron jobs that call edge functions via pg_net
-- Note: pg_net will use SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from vault

-- Daily backorder check at 10am
SELECT cron.schedule(
  'daily-backorder-check-v2',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url', true) || '/functions/v1/backorder-processor',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )
  $$
);

-- Hourly three-way match check during business hours
SELECT cron.schedule(
  'hourly-three-way-match',
  '0 8-18 * * 1-5',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url', true) || '/functions/v1/three-way-match-runner',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )
  $$
);

-- ============================================================================
-- CREATE ALERT RPC FOR DISPUTE ESCALATION
-- ============================================================================

CREATE OR REPLACE FUNCTION create_email_tracking_alert(
  p_alert_type TEXT,
  p_severity TEXT,
  p_title TEXT,
  p_description TEXT,
  p_thread_id TEXT DEFAULT NULL,
  p_po_id TEXT DEFAULT NULL,
  p_requires_human BOOLEAN DEFAULT FALSE,
  p_route_to_agent TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  alert_id UUID;
BEGIN
  INSERT INTO email_tracking_alerts (
    alert_type,
    severity,
    title,
    description,
    email_thread_id,
    po_id,
    requires_human,
    route_to_agent,
    metadata,
    status
  ) VALUES (
    p_alert_type,
    p_severity,
    p_title,
    p_description,
    p_thread_id::UUID,
    p_po_id::UUID,
    p_requires_human,
    p_route_to_agent,
    COALESCE(p_metadata, '{}'::jsonb),
    'open'
  )
  RETURNING id INTO alert_id;

  RETURN alert_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to create alert: %', SQLERRM;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_email_tracking_alert(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB) IS 'Create an email tracking alert for human review';

-- ============================================================================
-- VIEW: AUTONOMY SYSTEM STATUS
-- Dashboard view showing status of all autonomous systems
-- ============================================================================

CREATE OR REPLACE VIEW autonomy_system_status AS
SELECT
  'Three-Way Match' as system_name,
  (SELECT COUNT(*) FROM purchase_orders WHERE three_way_match_status = 'pending') as pending_count,
  (SELECT COUNT(*) FROM purchase_orders WHERE three_way_match_status = 'matched' AND payment_approved = true) as auto_approved_count,
  (SELECT COUNT(*) FROM purchase_orders WHERE three_way_match_status = 'discrepancy') as needs_review_count,
  (SELECT MAX(matched_at) FROM po_three_way_matches) as last_run_at

UNION ALL

SELECT
  'Backorder Processor',
  (SELECT COUNT(*) FROM po_backorders WHERE status = 'pending'),
  (SELECT COUNT(*) FROM po_backorders WHERE status = 'reordered'),
  (SELECT COUNT(*) FROM po_backorders WHERE status = 'disputed'),
  (SELECT MAX(created_at) FROM po_backorders)

UNION ALL

SELECT
  'Invoice Disputes',
  (SELECT COUNT(*) FROM invoice_disputes WHERE status = 'open'),
  (SELECT COUNT(*) FROM invoice_disputes WHERE status = 'resolved'),
  (SELECT COUNT(*) FROM invoice_disputes WHERE status = 'escalated'),
  (SELECT MAX(created_at) FROM invoice_disputes)

UNION ALL

SELECT
  'PO Follow-Up',
  (SELECT COUNT(*) FROM purchase_orders WHERE follow_up_required = true),
  (SELECT COUNT(*) FROM po_email_tracking WHERE metadata->>'auto' = 'true'),
  (SELECT COUNT(*) FROM purchase_orders WHERE follow_up_status = 'pending_response'),
  (SELECT MAX(last_follow_up_sent_at) FROM purchase_orders);

COMMENT ON VIEW autonomy_system_status IS 'Overview of all autonomous processing systems';

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT ON vendor_trust_events TO authenticated;
GRANT SELECT, INSERT ON vendor_trust_events TO service_role;
GRANT SELECT ON autonomy_system_status TO authenticated;

-- Enable RLS
ALTER TABLE vendor_trust_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read vendor_trust_events"
  ON vendor_trust_events FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow service role full access vendor_trust_events"
  ON vendor_trust_events FOR ALL TO service_role USING (true);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON SCHEMA public IS 'Autonomy Triggers and Cron Fixes - Migration 130 Complete';
