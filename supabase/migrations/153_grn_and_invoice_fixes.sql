-- Migration 153: GRN Table and Invoice Processing Fixes
--
-- Fixes critical issues identified in THREE_WAY_MATCH_FIX_PLAN.md:
-- 1. Creates po_receipt_events (GRN) table for receipt timestamp tracking
-- 2. Adds trigger to auto-log receipt events when quantity_received changes
-- 3. Fixes invoice_processing_dashboard view (wrong column name)
--
-- See: docs/THREE_WAY_MATCH_FIX_PLAN.md

-- ============================================================================
-- PHASE 0: CREATE GRN (Goods Receipt) TABLE
-- ============================================================================
-- Three-way match requires knowing WHEN goods were received, not just quantity.
-- This table tracks individual receipt events with timestamps.

CREATE TABLE IF NOT EXISTS po_receipt_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to PO (at least one must be set)
  finale_po_id UUID REFERENCES finale_purchase_orders(id) ON DELETE SET NULL,
  po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,

  -- What was received
  sku VARCHAR(100) NOT NULL,
  product_id UUID REFERENCES finale_products(id) ON DELETE SET NULL,
  quantity_received DECIMAL(12,4) NOT NULL CHECK (quantity_received > 0),

  -- When and how
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source VARCHAR(50) NOT NULL CHECK (source IN (
    'finale_sync',       -- Auto-detected from Finale quantity_received change
    'manual',            -- User manually entered in UI
    'email_detection',   -- Extracted from vendor email (e.g., "shipped X units")
    'packing_slip',      -- Extracted from packing slip attachment
    'api_webhook'        -- From external system webhook
  )),
  source_reference TEXT,  -- e.g., email_thread_id, packing_slip_attachment_id

  -- Optional metadata
  condition VARCHAR(50) CHECK (condition IN ('good', 'damaged', 'partial', 'refused')),
  notes TEXT,
  recorded_by UUID,  -- User who recorded (null for auto-detection)

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- At least one PO reference required
  CONSTRAINT po_receipt_events_po_required CHECK (
    finale_po_id IS NOT NULL OR po_id IS NOT NULL
  )
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_po_receipt_events_finale_po ON po_receipt_events(finale_po_id);
CREATE INDEX IF NOT EXISTS idx_po_receipt_events_po ON po_receipt_events(po_id);
CREATE INDEX IF NOT EXISTS idx_po_receipt_events_sku ON po_receipt_events(sku);
CREATE INDEX IF NOT EXISTS idx_po_receipt_events_received_at ON po_receipt_events(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_po_receipt_events_source ON po_receipt_events(source);

COMMENT ON TABLE po_receipt_events IS 'Goods Receipt Note (GRN) events tracking when items were received, for three-way match compliance auditing';
COMMENT ON COLUMN po_receipt_events.source IS 'How receipt was detected: finale_sync, manual, email_detection, packing_slip, api_webhook';
COMMENT ON COLUMN po_receipt_events.condition IS 'Condition of received goods: good, damaged, partial, refused';

-- ============================================================================
-- TRIGGER: Auto-log receipt events when finale_po_line_items.quantity_received changes
-- ============================================================================

CREATE OR REPLACE FUNCTION log_finale_receipt_event()
RETURNS TRIGGER AS $$
DECLARE
  v_finale_po_id UUID;
BEGIN
  -- Only log if quantity_received increased
  IF NEW.quantity_received > COALESCE(OLD.quantity_received, 0) THEN
    -- Get the finale_po_id from the line item
    SELECT finale_po_id INTO v_finale_po_id
    FROM finale_po_line_items
    WHERE id = NEW.id;

    -- Insert receipt event for the delta
    INSERT INTO po_receipt_events (
      finale_po_id,
      sku,
      product_id,
      quantity_received,
      received_at,
      source,
      source_reference,
      notes
    ) VALUES (
      v_finale_po_id,
      COALESCE(NEW.product_sku, NEW.product_id),
      NEW.product_id::uuid,
      NEW.quantity_received - COALESCE(OLD.quantity_received, 0),
      NOW(),
      'finale_sync',
      'finale_po_line_items:' || NEW.id::text,
      'Auto-logged from Finale sync. Previous qty: ' || COALESCE(OLD.quantity_received, 0)::text
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if present, then create
DROP TRIGGER IF EXISTS trg_log_finale_receipt ON finale_po_line_items;

CREATE TRIGGER trg_log_finale_receipt
  AFTER UPDATE OF quantity_received ON finale_po_line_items
  FOR EACH ROW
  EXECUTE FUNCTION log_finale_receipt_event();

COMMENT ON FUNCTION log_finale_receipt_event() IS 'Auto-logs receipt events when Finale sync updates quantity_received';

-- ============================================================================
-- FIX: invoice_processing_dashboard view uses wrong column
-- ============================================================================
-- Migration 152 created view querying 'classification' but correct column is 'attachment_type'

CREATE OR REPLACE VIEW invoice_processing_dashboard AS
SELECT
  -- Pending extraction count (FIXED: use attachment_type not classification)
  (SELECT COUNT(*) FROM email_attachments
   WHERE attachment_type IN ('invoice', 'packing_slip')
   AND processed_at IS NULL) as pending_extraction,

  -- Pending review count
  (SELECT COUNT(*) FROM vendor_invoice_documents
   WHERE status IN ('pending_review', 'variance_detected', 'pending_match')
   AND is_duplicate = FALSE) as pending_review,

  -- Pending three-way match count
  (SELECT COUNT(*) FROM finale_purchase_orders fpo
   LEFT JOIN po_three_way_matches twm ON fpo.id = twm.po_id
   WHERE fpo.status IN ('partial', 'received', 'SUBMITTED', 'PARTIALLY_RECEIVED')
   AND (twm.resolved_at IS NULL OR twm.match_status = 'pending_data')) as pending_match,

  -- Auto-approved today
  (SELECT COUNT(*) FROM po_three_way_matches
   WHERE resolved_at >= CURRENT_DATE
   AND resolution_action = 'approved') as auto_approved_today,

  -- Discrepancies needing review
  (SELECT COUNT(*) FROM po_three_way_matches
   WHERE match_status IN ('mismatch', 'partial_match')
   AND resolved_at IS NULL) as discrepancies_pending,

  -- Last extraction run
  (SELECT MAX(completed_at) FROM agent_execution_log
   WHERE agent_identifier = 'invoice-extractor') as last_extraction_run,

  -- Last three-way match run
  (SELECT MAX(completed_at) FROM agent_execution_log
   WHERE agent_identifier = 'three-way-match-runner') as last_match_run,

  -- Receipt events in last 24h (NEW)
  (SELECT COUNT(*) FROM po_receipt_events
   WHERE received_at >= NOW() - INTERVAL '24 hours') as receipts_logged_24h;

COMMENT ON VIEW invoice_processing_dashboard IS
  'Real-time dashboard for invoice processing pipeline health (fixed in migration 153)';

GRANT SELECT ON invoice_processing_dashboard TO authenticated;

-- ============================================================================
-- HELPER VIEW: Receipt summary by PO
-- ============================================================================

CREATE OR REPLACE VIEW po_receipt_summary AS
SELECT
  COALESCE(pre.finale_po_id, pre.po_id) as po_id,
  pre.sku,
  SUM(pre.quantity_received) as total_received,
  MIN(pre.received_at) as first_receipt,
  MAX(pre.received_at) as last_receipt,
  COUNT(*) as receipt_count,
  array_agg(DISTINCT pre.source) as sources,
  bool_or(pre.condition = 'damaged') as has_damaged,
  bool_or(pre.condition = 'refused') as has_refused
FROM po_receipt_events pre
GROUP BY COALESCE(pre.finale_po_id, pre.po_id), pre.sku;

COMMENT ON VIEW po_receipt_summary IS 'Aggregated receipt data by PO and SKU for three-way matching';

GRANT SELECT ON po_receipt_summary TO authenticated;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE po_receipt_events ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all receipt events
CREATE POLICY "Allow authenticated read on po_receipt_events"
  ON po_receipt_events FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert receipt events
CREATE POLICY "Allow authenticated insert on po_receipt_events"
  ON po_receipt_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update their own receipt events
CREATE POLICY "Allow authenticated update on po_receipt_events"
  ON po_receipt_events FOR UPDATE
  TO authenticated
  USING (recorded_by = auth.uid() OR recorded_by IS NULL);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  v_table_exists BOOLEAN;
  v_trigger_exists BOOLEAN;
  v_view_exists BOOLEAN;
BEGIN
  -- Check table exists
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'po_receipt_events'
  ) INTO v_table_exists;

  -- Check trigger exists
  SELECT EXISTS(
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_log_finale_receipt'
  ) INTO v_trigger_exists;

  -- Check view was updated
  SELECT EXISTS(
    SELECT 1 FROM information_schema.views
    WHERE table_name = 'invoice_processing_dashboard'
  ) INTO v_view_exists;

  IF v_table_exists AND v_trigger_exists AND v_view_exists THEN
    RAISE NOTICE '✓ Migration 153 completed successfully:';
    RAISE NOTICE '  - po_receipt_events table created';
    RAISE NOTICE '  - trg_log_finale_receipt trigger created';
    RAISE NOTICE '  - invoice_processing_dashboard view fixed (attachment_type)';
    RAISE NOTICE '  - po_receipt_summary view created';
  ELSE
    RAISE WARNING '⚠ Migration 153 incomplete - some objects missing';
  END IF;
END $$;
