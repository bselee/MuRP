-- Migration 031: PO Email Tracking & AfterShip Config

-- ============================================================================
-- PO Email Tracking Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS po_email_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  vendor_email TEXT,
  gmail_message_id TEXT UNIQUE,
  gmail_thread_id TEXT,
  gmail_history_id TEXT,
  gmail_label_ids TEXT[],
  metadata JSONB,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  last_reply_at TIMESTAMPTZ,
  last_reply_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_email_tracking_po_id
  ON po_email_tracking(po_id);

CREATE INDEX IF NOT EXISTS idx_po_email_tracking_thread
  ON po_email_tracking(gmail_thread_id);

COMMENT ON TABLE po_email_tracking IS 'Stores Gmail metadata for purchase order emails to associate vendor replies with specific POs.';

ALTER TABLE po_email_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read po_email_tracking"
  ON po_email_tracking
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert po_email_tracking"
  ON po_email_tracking
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- AfterShip Configuration (app_settings)
-- ============================================================================
INSERT INTO app_settings (
  setting_key,
  setting_category,
  setting_value,
  display_name,
  description,
  is_secret,
  is_required,
  editable_by,
  visible_to
)
VALUES (
  'aftership_config',
  'shipping',
  jsonb_build_object(
    'enabled', false,
    'apiKey', null,
    'defaultSlug', 'ups',
    'lastSyncedAt', null
  ),
  'AfterShip Tracking',
  'Stores AfterShip API key, enablement flag, and default carrier slug for automated tracking updates.',
  TRUE,
  FALSE,
  ARRAY['admin'],
  ARRAY['admin']
)
ON CONFLICT (setting_key) DO NOTHING;
