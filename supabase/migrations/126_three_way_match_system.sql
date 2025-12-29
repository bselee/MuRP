-- ============================================================================
-- Migration 126: Three-Way Match System
-- PO vs Invoice vs Receipt verification for AP automation
-- ============================================================================

-- ============================================================================
-- THREE-WAY MATCH RESULTS TABLE
-- Stores match results for audit trail and reporting
-- ============================================================================

CREATE TABLE IF NOT EXISTS po_three_way_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,

  -- Match Status
  match_status VARCHAR(20) NOT NULL DEFAULT 'pending_data',
    -- matched: All three sources agree within tolerance
    -- partial_match: Minor discrepancies within tolerance
    -- mismatch: Significant discrepancies requiring review
    -- pending_data: Waiting for invoice or receipt data

  overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
  can_auto_approve BOOLEAN DEFAULT FALSE,

  -- Match Details (JSONB for flexibility)
  line_items JSONB DEFAULT '[]'::jsonb,
  totals JSONB DEFAULT '{}'::jsonb,
  discrepancies JSONB DEFAULT '[]'::jsonb,
  recommendations JSONB DEFAULT '[]'::jsonb,

  -- Resolution
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolution_action VARCHAR(50),
    -- approved, rejected, backorder_created, dispute_filed, manually_overridden
  resolution_notes TEXT,

  -- Timestamps
  matched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(po_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_three_way_match_po_id ON po_three_way_matches(po_id);
CREATE INDEX IF NOT EXISTS idx_three_way_match_status ON po_three_way_matches(match_status);
CREATE INDEX IF NOT EXISTS idx_three_way_match_score ON po_three_way_matches(overall_score);
CREATE INDEX IF NOT EXISTS idx_three_way_match_unresolved
  ON po_three_way_matches(match_status, resolved_at)
  WHERE resolved_at IS NULL AND match_status IN ('mismatch', 'partial_match');

COMMENT ON TABLE po_three_way_matches IS 'Three-way match results: PO vs Invoice vs Receipt';

-- ============================================================================
-- ADD COLUMNS TO PURCHASE_ORDERS
-- ============================================================================

-- Add three-way match tracking columns to purchase_orders
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS three_way_match_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS three_way_match_score INTEGER,
  ADD COLUMN IF NOT EXISTS last_three_way_match TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS invoice_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_approved BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS payment_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_approved_by UUID;

-- Index for finding POs needing match
CREATE INDEX IF NOT EXISTS idx_po_three_way_match_status
  ON purchase_orders(three_way_match_status)
  WHERE status IN ('partial', 'received');

-- ============================================================================
-- BACKORDER TRACKING TABLE
-- For tracking follow-up POs created from shortages
-- ============================================================================

CREATE TABLE IF NOT EXISTS po_backorders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Links
  original_po_id UUID NOT NULL REFERENCES purchase_orders(id),
  backorder_po_id UUID REFERENCES purchase_orders(id),

  -- Shortage details
  sku VARCHAR(50) NOT NULL,
  item_name VARCHAR(255),
  shortage_quantity INTEGER NOT NULL,
  shortage_value DECIMAL(10,2),

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'identified',
    -- identified: Shortage detected
    -- pending_review: Awaiting human decision
    -- backorder_created: Follow-up PO created
    -- resolved: Issue resolved (vendor credit, write-off, etc.)
    -- cancelled: Decided not to reorder

  -- Stock impact assessment
  will_cause_stockout BOOLEAN DEFAULT FALSE,
  days_until_stockout INTEGER,
  daily_velocity DECIMAL(10,2),

  -- Decision tracking
  decision VARCHAR(50),
    -- create_backorder, request_credit, write_off, vendor_replacing
  decision_reason TEXT,
  decided_by UUID,
  decided_at TIMESTAMPTZ,

  -- Vendor charged check (critical for backorder decision)
  vendor_invoiced_shortage BOOLEAN,
    -- TRUE: Vendor only charged for what was shipped (good)
    -- FALSE: Vendor charged for full PO (dispute needed)
    -- NULL: Unknown, needs review

  -- Timestamps
  identified_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_backorders_original_po ON po_backorders(original_po_id);
CREATE INDEX IF NOT EXISTS idx_backorders_status ON po_backorders(status);
CREATE INDEX IF NOT EXISTS idx_backorders_sku ON po_backorders(sku);
CREATE INDEX IF NOT EXISTS idx_backorders_pending
  ON po_backorders(status, will_cause_stockout DESC)
  WHERE status IN ('identified', 'pending_review');

COMMENT ON TABLE po_backorders IS 'Tracks shortages and backorder decisions from three-way match';

-- ============================================================================
-- VIEW: POs Needing Three-Way Match Review
-- ============================================================================

CREATE OR REPLACE VIEW pos_needing_match_review AS
SELECT
  po.id,
  po.order_id,
  po.supplier_name,
  po.status,
  po.total_amount,
  po.expected_date,
  po.received_at,
  twm.match_status,
  twm.overall_score,
  twm.can_auto_approve,
  COALESCE(
    jsonb_array_length(twm.discrepancies),
    0
  ) as discrepancy_count,
  COALESCE(
    (SELECT COUNT(*) FROM jsonb_array_elements(twm.discrepancies) d
     WHERE d->>'severity' = 'critical'),
    0
  )::int as critical_discrepancies,
  twm.matched_at,
  pid.id IS NOT NULL as has_invoice,
  pid.status as invoice_status
FROM purchase_orders po
LEFT JOIN po_three_way_matches twm ON po.id = twm.po_id
LEFT JOIN po_invoice_data pid ON po.id = pid.po_id
WHERE po.status IN ('partial', 'received')
  AND (twm.resolved_at IS NULL OR twm.match_status = 'pending_data')
ORDER BY
  CASE twm.match_status
    WHEN 'mismatch' THEN 1
    WHEN 'partial_match' THEN 2
    WHEN 'pending_data' THEN 3
    ELSE 4
  END,
  twm.overall_score ASC NULLS LAST,
  po.received_at DESC;

COMMENT ON VIEW pos_needing_match_review IS 'POs requiring three-way match review';

-- ============================================================================
-- VIEW: Pending Backorders
-- ============================================================================

CREATE OR REPLACE VIEW pending_backorders AS
SELECT
  bo.id,
  bo.original_po_id,
  po.order_id as original_po_number,
  po.supplier_name,
  bo.sku,
  bo.item_name,
  bo.shortage_quantity,
  bo.shortage_value,
  bo.status,
  bo.will_cause_stockout,
  bo.days_until_stockout,
  bo.vendor_invoiced_shortage,
  bo.identified_at,
  ii.stock as current_stock,
  ii.reorder_point
FROM po_backorders bo
JOIN purchase_orders po ON bo.original_po_id = po.id
LEFT JOIN inventory_items ii ON bo.sku = ii.sku
WHERE bo.status IN ('identified', 'pending_review')
ORDER BY
  bo.will_cause_stockout DESC,
  bo.days_until_stockout ASC NULLS LAST,
  bo.shortage_value DESC;

COMMENT ON VIEW pending_backorders IS 'Backorders pending decision';

-- ============================================================================
-- FUNCTION: Auto-approve matching POs
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_approve_matching_pos()
RETURNS TABLE (
  po_id UUID,
  po_number VARCHAR,
  action_taken VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  WITH approved AS (
    UPDATE po_three_way_matches twm
    SET
      resolved_at = NOW(),
      resolution_action = 'approved',
      resolution_notes = 'Auto-approved: All items within tolerance'
    FROM purchase_orders po
    WHERE twm.po_id = po.id
      AND twm.can_auto_approve = TRUE
      AND twm.resolved_at IS NULL
      AND twm.match_status IN ('matched', 'partial_match')
    RETURNING twm.po_id, po.order_id
  )
  UPDATE purchase_orders po
  SET
    invoice_verified = TRUE,
    invoice_verified_at = NOW(),
    payment_approved = TRUE,
    payment_approved_at = NOW()
  FROM approved a
  WHERE po.id = a.po_id
  RETURNING po.id, po.order_id, 'auto_approved'::VARCHAR;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_approve_matching_pos IS 'Auto-approve POs that pass three-way match within tolerance';

-- ============================================================================
-- TRIGGER: Update three-way match on receipt
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_check_three_way_match()
RETURNS TRIGGER AS $$
BEGIN
  -- When receipt quantities change, invalidate existing match
  IF TG_OP = 'UPDATE' AND
     OLD.quantity_received IS DISTINCT FROM NEW.quantity_received THEN

    UPDATE po_three_way_matches
    SET
      match_status = 'pending_data',
      updated_at = NOW()
    WHERE po_id = NEW.po_id
      AND resolved_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_receipt_invalidates_match ON purchase_order_items;
CREATE TRIGGER trigger_receipt_invalidates_match
  AFTER UPDATE ON purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION trigger_check_three_way_match();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE po_three_way_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_backorders ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
DROP POLICY IF EXISTS "Allow authenticated read po_three_way_matches" ON po_three_way_matches;
CREATE POLICY "Allow authenticated read po_three_way_matches"
  ON po_three_way_matches FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated read po_backorders" ON po_backorders;
CREATE POLICY "Allow authenticated read po_backorders"
  ON po_backorders FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to write
DROP POLICY IF EXISTS "Allow authenticated write po_three_way_matches" ON po_three_way_matches;
CREATE POLICY "Allow authenticated write po_three_way_matches"
  ON po_three_way_matches FOR ALL
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated write po_backorders" ON po_backorders;
CREATE POLICY "Allow authenticated write po_backorders"
  ON po_backorders FOR ALL
  TO authenticated
  USING (true);

-- Service role full access
DROP POLICY IF EXISTS "Allow service role full access po_three_way_matches" ON po_three_way_matches;
CREATE POLICY "Allow service role full access po_three_way_matches"
  ON po_three_way_matches FOR ALL
  TO service_role
  USING (true);

DROP POLICY IF EXISTS "Allow service role full access po_backorders" ON po_backorders;
CREATE POLICY "Allow service role full access po_backorders"
  ON po_backorders FOR ALL
  TO service_role
  USING (true);

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON po_three_way_matches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON po_backorders TO authenticated;
GRANT SELECT ON pos_needing_match_review TO authenticated;
GRANT SELECT ON pending_backorders TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON SCHEMA public IS 'Three-Way Match System - Migration 126 Complete';
