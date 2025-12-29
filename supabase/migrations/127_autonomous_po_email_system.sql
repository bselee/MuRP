-- ============================================================================
-- Migration 127: Autonomous PO Email System
-- Trust-gated email sending with progressive autonomy
-- ============================================================================

-- ============================================================================
-- PO EMAIL DRAFTS TABLE
-- Stores email drafts for approval workflow
-- ============================================================================

CREATE TABLE IF NOT EXISTS po_email_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  po_number VARCHAR(50),

  -- Vendor info
  vendor_name VARCHAR(255),
  vendor_email VARCHAR(255) NOT NULL,

  -- Email content
  subject VARCHAR(500) NOT NULL,
  body TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
    -- draft: Created but not ready for sending
    -- pending_approval: Awaiting human approval
    -- approved: Approved and sent
    -- rejected: Rejected by user
    -- expired: Approval window expired

  -- Trust score context
  trust_score_at_creation DECIMAL(3,2),
  requires_review BOOLEAN DEFAULT FALSE,

  -- Approval workflow
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  rejected_at TIMESTAMPTZ,

  -- Sending
  sent_at TIMESTAMPTZ,
  gmail_message_id VARCHAR(100),
  gmail_thread_id VARCHAR(100),

  -- Expiration
  expires_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_po_email_drafts_po_id ON po_email_drafts(po_id);
CREATE INDEX IF NOT EXISTS idx_po_email_drafts_status ON po_email_drafts(status);
CREATE INDEX IF NOT EXISTS idx_po_email_drafts_pending
  ON po_email_drafts(status, created_at DESC)
  WHERE status = 'pending_approval';
CREATE INDEX IF NOT EXISTS idx_po_email_drafts_expires
  ON po_email_drafts(expires_at)
  WHERE status = 'pending_approval' AND expires_at IS NOT NULL;

COMMENT ON TABLE po_email_drafts IS 'PO email drafts for trust-gated autonomous sending';

-- ============================================================================
-- ADD COLUMNS TO PURCHASE_ORDERS
-- ============================================================================

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS last_email_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS last_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_send_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_followup_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup_count INTEGER DEFAULT 0;

-- ============================================================================
-- ADD COLUMNS TO VENDORS
-- ============================================================================

-- Add auto-send email preference to vendors
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS auto_send_email BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS preferred_email_template VARCHAR(50) DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS email_response_rate DECIMAL(3,2);
    -- Calculated: replies / emails sent

-- ============================================================================
-- PO EMAIL AGENT DEFINITION
-- Register the email sender agent
-- ============================================================================

INSERT INTO agent_definitions (
  identifier,
  name,
  description,
  category,
  capabilities,
  autonomy_level,
  trust_score,
  is_active,
  execution_config
) VALUES (
  'po_email_sender',
  'PO Email Sender',
  'Sends purchase order emails to vendors with trust-based autonomy. Auto-sends at high trust, queues for approval at medium trust.',
  'purchasing',
  ARRAY['send_po_email', 'draft_email', 'queue_for_approval'],
  'assist',
  0.70,  -- Start at medium trust
  TRUE,
  '{
    "max_concurrent": 5,
    "rate_limit_per_hour": 50,
    "retry_on_failure": true,
    "max_retries": 2
  }'::jsonb
) ON CONFLICT (identifier) DO UPDATE SET
  description = EXCLUDED.description,
  capabilities = EXCLUDED.capabilities,
  updated_at = NOW();

-- ============================================================================
-- FUNCTION: Expire old pending emails
-- ============================================================================

CREATE OR REPLACE FUNCTION expire_pending_email_drafts()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  WITH expired AS (
    UPDATE po_email_drafts
    SET
      status = 'expired',
      updated_at = NOW()
    WHERE status = 'pending_approval'
      AND expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO expired_count FROM expired;

  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION expire_pending_email_drafts IS 'Mark expired email drafts as expired';

-- ============================================================================
-- VIEW: Pending Email Approvals
-- ============================================================================

CREATE OR REPLACE VIEW pending_email_approvals AS
SELECT
  ped.id,
  ped.po_id,
  ped.po_number,
  ped.vendor_name,
  ped.vendor_email,
  ped.subject,
  LEFT(ped.body, 200) as body_preview,
  ped.trust_score_at_creation,
  ped.created_at,
  ped.expires_at,
  EXTRACT(EPOCH FROM (ped.expires_at - NOW())) / 3600 as hours_until_expiry,
  po.total_amount as po_total,
  po.expected_date
FROM po_email_drafts ped
JOIN purchase_orders po ON ped.po_id = po.id
WHERE ped.status = 'pending_approval'
ORDER BY ped.created_at ASC;

COMMENT ON VIEW pending_email_approvals IS 'Emails awaiting human approval';

-- ============================================================================
-- VIEW: Email Sending Performance
-- ============================================================================

CREATE OR REPLACE VIEW email_sending_performance AS
SELECT
  DATE_TRUNC('day', created_at) as date,
  COUNT(*) FILTER (WHERE status = 'approved') as manually_approved,
  COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
  COUNT(*) FILTER (WHERE status = 'expired') as expired,
  AVG(trust_score_at_creation) as avg_trust_score
FROM po_email_drafts
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date DESC;

COMMENT ON VIEW email_sending_performance IS 'Email sending metrics for trust score analysis';

-- ============================================================================
-- TRIGGER: Update timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_po_email_draft_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_po_email_draft_timestamp ON po_email_drafts;
CREATE TRIGGER trigger_update_po_email_draft_timestamp
  BEFORE UPDATE ON po_email_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_po_email_draft_timestamp();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE po_email_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read po_email_drafts" ON po_email_drafts;
CREATE POLICY "Allow authenticated read po_email_drafts"
  ON po_email_drafts FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated write po_email_drafts" ON po_email_drafts;
CREATE POLICY "Allow authenticated write po_email_drafts"
  ON po_email_drafts FOR ALL
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow service role full access po_email_drafts" ON po_email_drafts;
CREATE POLICY "Allow service role full access po_email_drafts"
  ON po_email_drafts FOR ALL
  TO service_role
  USING (true);

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON po_email_drafts TO authenticated;
GRANT SELECT ON pending_email_approvals TO authenticated;
GRANT SELECT ON email_sending_performance TO authenticated;

-- ============================================================================
-- ADD CRON JOB FOR EXPIRING DRAFTS
-- ============================================================================

-- This runs hourly to expire old pending emails
SELECT cron.schedule(
  'expire-pending-emails',
  '0 * * * *',  -- Every hour
  $$SELECT expire_pending_email_drafts()$$
);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON SCHEMA public IS 'Autonomous PO Email System - Migration 127 Complete';
