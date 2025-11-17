-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 023: Vendor Automation Settings
-- ═══════════════════════════════════════════════════════════════════════════
-- Description: Add vendor-level purchase order automation controls
-- Created: 2025-11-17
--
-- Features:
-- - Per-vendor auto-PO settings (opt-in)
-- - Automation thresholds (only auto-create for critical items)
-- - Recurring PO detection flags
-- - Auto-send email preferences
-- ═══════════════════════════════════════════════════════════════════════════

-- Add automation columns to vendors table
ALTER TABLE vendors
ADD COLUMN IF NOT EXISTS auto_po_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS auto_po_threshold VARCHAR(20) DEFAULT 'critical',
ADD COLUMN IF NOT EXISTS auto_send_email BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_recurring_vendor BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS automation_notes TEXT;

-- Add comments
COMMENT ON COLUMN vendors.auto_po_enabled IS 'Enable automatic draft PO creation for this vendor';
COMMENT ON COLUMN vendors.auto_po_threshold IS 'Minimum urgency to auto-create PO: critical, high, normal, low';
COMMENT ON COLUMN vendors.auto_send_email IS 'Automatically send PO via email (requires auto_po_enabled)';
COMMENT ON COLUMN vendors.is_recurring_vendor IS 'Flag for vendors with predictable, recurring orders';
COMMENT ON COLUMN vendors.automation_notes IS 'Internal notes about automation preferences for this vendor';

-- Add automation tracking to purchase_orders table
ALTER TABLE purchase_orders
ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Add comments
COMMENT ON COLUMN purchase_orders.auto_generated IS 'True if PO was auto-created by reorder scanner';
COMMENT ON COLUMN purchase_orders.auto_approved IS 'True if PO was auto-sent without manual review';
COMMENT ON COLUMN purchase_orders.reviewed_by IS 'User who reviewed the auto-generated PO';
COMMENT ON COLUMN purchase_orders.reviewed_at IS 'When the PO was reviewed/approved';

-- Add PO pattern tracking for recurring detection
CREATE TABLE IF NOT EXISTS po_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id VARCHAR(50) NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  item_skus TEXT[], -- Array of SKUs commonly ordered together
  frequency_days INTEGER, -- Average days between orders
  last_order_date DATE,
  order_count INTEGER DEFAULT 1,
  is_recurring BOOLEAN DEFAULT FALSE,
  confidence_score DECIMAL(3,2) DEFAULT 0.0, -- 0.0 to 1.0
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX idx_po_patterns_vendor ON po_patterns(vendor_id);
CREATE INDEX idx_po_patterns_recurring ON po_patterns(is_recurring) WHERE is_recurring = TRUE;

-- Add comments
COMMENT ON TABLE po_patterns IS 'Tracks recurring purchase order patterns for automation optimization';
COMMENT ON COLUMN po_patterns.item_skus IS 'Array of SKUs commonly ordered together from this vendor';
COMMENT ON COLUMN po_patterns.frequency_days IS 'Average number of days between orders to this vendor';
COMMENT ON COLUMN po_patterns.confidence_score IS 'How confident we are this is a true recurring pattern (0.0-1.0)';

-- Create view for automation dashboard
CREATE OR REPLACE VIEW vendor_automation_summary AS
SELECT
  v.id AS vendor_id,
  v.name AS vendor_name,
  v.auto_po_enabled,
  v.auto_po_threshold,
  v.auto_send_email,
  v.is_recurring_vendor,
  COUNT(DISTINCT po.id) FILTER (WHERE po.auto_generated = TRUE) AS auto_pos_created,
  COUNT(DISTINCT po.id) FILTER (WHERE po.auto_generated = TRUE AND po.auto_approved = TRUE) AS auto_pos_sent,
  COUNT(DISTINCT po.id) FILTER (WHERE po.auto_generated = TRUE AND po.status = 'cancelled') AS auto_pos_discarded,
  MAX(po.order_date) FILTER (WHERE po.auto_generated = TRUE) AS last_auto_po_date,
  pp.frequency_days AS avg_order_frequency,
  pp.confidence_score AS recurring_confidence
FROM vendors v
LEFT JOIN purchase_orders po ON po.vendor_id = v.id
LEFT JOIN po_patterns pp ON pp.vendor_id = v.id AND pp.is_recurring = TRUE
GROUP BY v.id, v.name, v.auto_po_enabled, v.auto_po_threshold, v.auto_send_email,
         v.is_recurring_vendor, pp.frequency_days, pp.confidence_score;

COMMENT ON VIEW vendor_automation_summary IS 'Summary of vendor automation settings and performance';

-- Grant permissions
GRANT SELECT ON vendor_automation_summary TO authenticated;
GRANT SELECT ON po_patterns TO authenticated;
GRANT INSERT, UPDATE ON po_patterns TO authenticated;
