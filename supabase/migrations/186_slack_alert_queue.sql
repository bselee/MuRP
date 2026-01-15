-- ============================================================================
-- 186: Slack Alert Queue - Quality Gate for Notifications
-- ============================================================================
-- Provides deduplication, rate limiting, and verification for Slack alerts

-- Slack alert queue table
CREATE TABLE IF NOT EXISTS slack_alert_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL CHECK (alert_type IN ('stockout', 'po_overdue', 'requisition', 'agent_action', 'invoice', 'system')),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  payload JSONB NOT NULL DEFAULT '{}',
  dedup_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  suppressed_reason TEXT,
  channel_override TEXT,
  created_by UUID REFERENCES auth.users(id)
);

-- Indexes for efficient querying
CREATE INDEX idx_slack_alert_queue_dedup ON slack_alert_queue (dedup_key, created_at);
CREATE INDEX idx_slack_alert_queue_pending ON slack_alert_queue (verified_at, sent_at, suppressed_reason) WHERE verified_at IS NULL AND sent_at IS NULL AND suppressed_reason IS NULL;
CREATE INDEX idx_slack_alert_queue_ready ON slack_alert_queue (created_at) WHERE verified_at IS NOT NULL AND sent_at IS NULL AND suppressed_reason IS NULL;
CREATE INDEX idx_slack_alert_queue_type ON slack_alert_queue (alert_type, created_at);

-- Rube webhook log for audit trail
CREATE TABLE IF NOT EXISTS rube_webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id TEXT NOT NULL,
  execution_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error TEXT
);

CREATE INDEX idx_rube_webhook_recipe ON rube_webhook_log (recipe_id, received_at);

-- Enable RLS
ALTER TABLE slack_alert_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE rube_webhook_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for slack_alert_queue
CREATE POLICY "Authenticated users can read alerts" ON slack_alert_queue
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert alerts" ON slack_alert_queue
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update alerts" ON slack_alert_queue
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- RLS policies for rube_webhook_log
CREATE POLICY "Authenticated users can read webhook logs" ON rube_webhook_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can insert webhook logs" ON rube_webhook_log
  FOR INSERT TO service_role WITH CHECK (true);

-- Helper function to clean up old alerts (run daily via cron)
CREATE OR REPLACE FUNCTION cleanup_old_slack_alerts()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete alerts older than 30 days that have been sent or suppressed
  DELETE FROM slack_alert_queue
  WHERE created_at < NOW() - INTERVAL '30 days'
    AND (sent_at IS NOT NULL OR suppressed_reason IS NOT NULL);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION cleanup_old_slack_alerts() TO authenticated;

COMMENT ON TABLE slack_alert_queue IS 'Queue for Slack notifications with quality gate verification';
COMMENT ON TABLE rube_webhook_log IS 'Audit log for Rube webhook payloads';
