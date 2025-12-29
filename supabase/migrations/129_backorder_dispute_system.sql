-- ============================================================================
-- Migration 129: Backorder and Invoice Dispute System
-- Autonomous handling of shortages via email-driven workflows
-- ============================================================================

-- ============================================================================
-- ADD COLUMNS TO PURCHASE_ORDERS
-- ============================================================================

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS backorder_processed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS backorder_processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS parent_po_id UUID REFERENCES purchase_orders(id),
  ADD COLUMN IF NOT EXISTS is_backorder BOOLEAN DEFAULT FALSE;

-- Index for finding backorders
CREATE INDEX IF NOT EXISTS idx_po_parent ON purchase_orders(parent_po_id)
  WHERE parent_po_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_po_backorder_pending
  ON purchase_orders(status, backorder_processed)
  WHERE status = 'partial' AND (backorder_processed IS NULL OR backorder_processed = FALSE);

-- ============================================================================
-- INVOICE DISPUTES TABLE
-- Track disputes with vendors via autonomous email workflow
-- ============================================================================

CREATE TABLE IF NOT EXISTS invoice_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES vendors(id),

  -- Dispute details
  dispute_type VARCHAR(50) NOT NULL,
    -- unshipped_items_charged, price_discrepancy, duplicate_invoice, wrong_items
  dispute_amount DECIMAL(12,2) NOT NULL,
  items JSONB DEFAULT '[]'::jsonb,
  description TEXT,

  -- Email workflow status
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
    -- draft, email_pending, email_sent, email_queued,
    -- vendor_responded, credit_received, escalated, resolved, closed

  -- Email tracking
  email_sent_at TIMESTAMPTZ,
  email_id VARCHAR(100),
  thread_id VARCHAR(100),

  -- Vendor response
  vendor_response_at TIMESTAMPTZ,
  vendor_response_type VARCHAR(30),
    -- credit_issued, will_ship, partial_credit, disputed, no_response
  vendor_response_amount DECIMAL(12,2),
  vendor_response_notes TEXT,

  -- Resolution
  resolution VARCHAR(50),
    -- credit_applied, items_shipped, write_off, escalated_to_management
  resolution_amount DECIMAL(12,2),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,

  -- Follow-up tracking
  followup_count INTEGER DEFAULT 0,
  last_followup_at TIMESTAMPTZ,
  next_followup_due TIMESTAMPTZ,
  escalated BOOLEAN DEFAULT FALSE,
  escalated_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_disputes_po_id ON invoice_disputes(po_id);
CREATE INDEX IF NOT EXISTS idx_disputes_vendor ON invoice_disputes(vendor_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON invoice_disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_pending
  ON invoice_disputes(status, next_followup_due)
  WHERE status IN ('email_sent', 'vendor_responded') AND resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_disputes_thread ON invoice_disputes(thread_id)
  WHERE thread_id IS NOT NULL;

COMMENT ON TABLE invoice_disputes IS 'Invoice disputes handled via autonomous email workflow';

-- ============================================================================
-- ADD UNIQUE CONSTRAINT TO PO_BACKORDERS
-- ============================================================================

-- Add unique constraint if not exists (for upsert operations)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'po_backorders_original_po_sku_unique'
  ) THEN
    ALTER TABLE po_backorders
      ADD CONSTRAINT po_backorders_original_po_sku_unique
      UNIQUE (original_po_id, sku);
  END IF;
END $$;

-- ============================================================================
-- VIEW: Active Disputes Dashboard
-- ============================================================================

CREATE OR REPLACE VIEW active_disputes_dashboard AS
SELECT
  d.id,
  d.po_id,
  po.order_id as po_number,
  v.name as vendor_name,
  v.contact_emails[1] as vendor_email,
  d.dispute_type,
  d.dispute_amount,
  d.status,
  d.email_sent_at,
  d.vendor_response_at,
  d.vendor_response_type,
  d.followup_count,
  d.next_followup_due,
  d.escalated,
  CASE
    WHEN d.next_followup_due < NOW() THEN 'overdue'
    WHEN d.next_followup_due < NOW() + INTERVAL '1 day' THEN 'due_today'
    ELSE 'pending'
  END as urgency,
  EXTRACT(DAY FROM NOW() - d.email_sent_at)::int as days_since_sent,
  jsonb_array_length(d.items) as item_count,
  d.created_at
FROM invoice_disputes d
JOIN purchase_orders po ON d.po_id = po.id
LEFT JOIN vendors v ON d.vendor_id = v.id
WHERE d.resolved_at IS NULL
ORDER BY
  d.escalated DESC,
  d.next_followup_due ASC NULLS LAST,
  d.dispute_amount DESC;

COMMENT ON VIEW active_disputes_dashboard IS 'Active invoice disputes requiring attention';

-- ============================================================================
-- VIEW: Backorder Summary
-- ============================================================================

CREATE OR REPLACE VIEW backorder_summary AS
SELECT
  bo.original_po_id,
  original_po.order_id as original_po_number,
  original_po.supplier_name as vendor_name,
  COUNT(*) as shortage_count,
  SUM(bo.shortage_quantity) as total_shortage_qty,
  SUM(bo.shortage_value) as total_shortage_value,
  bool_or(bo.will_cause_stockout) as any_stockout_risk,
  MIN(bo.days_until_stockout) as min_days_to_stockout,
  string_agg(DISTINCT bo.status, ', ') as statuses,
  bool_and(bo.vendor_invoiced_shortage = false) as all_correctly_invoiced,
  bo.backorder_po_id,
  backorder_po.order_id as backorder_po_number,
  backorder_po.status as backorder_status
FROM po_backorders bo
JOIN purchase_orders original_po ON bo.original_po_id = original_po.id
LEFT JOIN purchase_orders backorder_po ON bo.backorder_po_id = backorder_po.id
GROUP BY
  bo.original_po_id,
  original_po.order_id,
  original_po.supplier_name,
  bo.backorder_po_id,
  backorder_po.order_id,
  backorder_po.status
ORDER BY any_stockout_risk DESC, min_days_to_stockout ASC NULLS LAST;

COMMENT ON VIEW backorder_summary IS 'Summary of backorders by original PO';

-- ============================================================================
-- FUNCTION: Process dispute email response
-- Called when vendor replies to dispute email
-- ============================================================================

CREATE OR REPLACE FUNCTION process_dispute_response(
  p_thread_id TEXT,
  p_response_type TEXT,
  p_response_amount DECIMAL DEFAULT NULL,
  p_response_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_dispute_id UUID;
BEGIN
  -- Find dispute by thread ID
  SELECT id INTO v_dispute_id
  FROM invoice_disputes
  WHERE thread_id = p_thread_id
  LIMIT 1;

  IF v_dispute_id IS NULL THEN
    RAISE EXCEPTION 'No dispute found for thread %', p_thread_id;
  END IF;

  -- Update dispute with response
  UPDATE invoice_disputes
  SET
    status = 'vendor_responded',
    vendor_response_at = NOW(),
    vendor_response_type = p_response_type,
    vendor_response_amount = p_response_amount,
    vendor_response_notes = p_response_notes,
    updated_at = NOW()
  WHERE id = v_dispute_id;

  -- If credit issued, mark for resolution
  IF p_response_type = 'credit_issued' THEN
    UPDATE invoice_disputes
    SET
      resolution = 'credit_applied',
      resolution_amount = COALESCE(p_response_amount, dispute_amount),
      resolved_at = NOW()
    WHERE id = v_dispute_id;
  END IF;

  -- If vendor will ship missing items, update backorders
  IF p_response_type = 'will_ship' THEN
    UPDATE po_backorders
    SET
      status = 'vendor_replacing',
      decision = 'vendor_replacing',
      decision_reason = p_response_notes,
      updated_at = NOW()
    WHERE original_po_id = (SELECT po_id FROM invoice_disputes WHERE id = v_dispute_id);
  END IF;

  RETURN v_dispute_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION process_dispute_response IS 'Process vendor response to invoice dispute';

-- ============================================================================
-- FUNCTION: Schedule dispute follow-ups
-- ============================================================================

CREATE OR REPLACE FUNCTION schedule_dispute_followups()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  -- Set next follow-up for disputes that need attention
  WITH needs_followup AS (
    SELECT id
    FROM invoice_disputes
    WHERE status = 'email_sent'
      AND vendor_response_at IS NULL
      AND (
        next_followup_due IS NULL
        OR next_followup_due < NOW()
      )
      AND followup_count < 3
  )
  UPDATE invoice_disputes d
  SET
    next_followup_due = CASE
      WHEN followup_count = 0 THEN NOW() + INTERVAL '3 days'
      WHEN followup_count = 1 THEN NOW() + INTERVAL '2 days'
      ELSE NOW() + INTERVAL '1 day'
    END,
    updated_at = NOW()
  FROM needs_followup nf
  WHERE d.id = nf.id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- Escalate disputes with 3+ follow-ups and no response
  UPDATE invoice_disputes
  SET
    escalated = TRUE,
    escalated_at = NOW(),
    status = 'escalated',
    updated_at = NOW()
  WHERE status = 'email_sent'
    AND vendor_response_at IS NULL
    AND followup_count >= 3
    AND escalated = FALSE;

  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION schedule_dispute_followups IS 'Schedule follow-ups for unresolved disputes';

-- ============================================================================
-- ADD PG_CRON JOBS
-- ============================================================================

-- Check for partial receipts needing backorder analysis (daily 10am)
SELECT cron.schedule(
  'daily-backorder-check',
  '0 10 * * *',  -- 10:00 AM daily
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/scheduled-agent-runner',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{"agent": "backorder_reorder_agent", "action": "process_partial_receipts"}'::jsonb
  )$$
);

-- Check disputes needing follow-up (daily 9am)
SELECT cron.schedule(
  'daily-dispute-followup',
  '0 9 * * *',  -- 9:00 AM daily
  $$SELECT schedule_dispute_followups()$$
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE invoice_disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read invoice_disputes" ON invoice_disputes;
CREATE POLICY "Allow authenticated read invoice_disputes"
  ON invoice_disputes FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated write invoice_disputes" ON invoice_disputes;
CREATE POLICY "Allow authenticated write invoice_disputes"
  ON invoice_disputes FOR ALL
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow service role full access invoice_disputes" ON invoice_disputes;
CREATE POLICY "Allow service role full access invoice_disputes"
  ON invoice_disputes FOR ALL
  TO service_role
  USING (true);

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON invoice_disputes TO authenticated;
GRANT SELECT ON active_disputes_dashboard TO authenticated;
GRANT SELECT ON backorder_summary TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON SCHEMA public IS 'Backorder and Dispute System - Migration 129 Complete';
