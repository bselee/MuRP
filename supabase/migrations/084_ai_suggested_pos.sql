-- Migration: 080_ai_suggested_pos.sql
-- Description: Extend existing purchase_orders table for AI-suggested orders
-- Part of: MuRP 2.0 Autonomous Inventory System
-- Date: 2025-12-09

-- ============================================================================
-- EXTEND PURCHASE_ORDERS FOR AI SUGGESTIONS
-- ============================================================================

-- Add AI-specific fields to existing purchase_orders table
ALTER TABLE purchase_orders
ADD COLUMN IF NOT EXISTS ai_confidence_score float CHECK (ai_confidence_score >= 0 AND ai_confidence_score <= 1),
ADD COLUMN IF NOT EXISTS ai_reasoning text,
ADD COLUMN IF NOT EXISTS ai_model_used text,
ADD COLUMN IF NOT EXISTS ai_consolidation_opportunities jsonb,
ADD COLUMN IF NOT EXISTS ai_priority_score float,
ADD COLUMN IF NOT EXISTS urgency text CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Add new statuses for AI suggestions
-- Existing statuses: 'draft', 'pending', 'sent', 'confirmed', 'partial', 'received', 'cancelled'
-- New AI statuses: 'ai_suggested' (AI created, needs review), 'ai_rejected' (human rejected)
-- Note: We extend the existing status check constraint

-- Add indexes for AI fields
CREATE INDEX IF NOT EXISTS idx_purchase_orders_ai_confidence ON purchase_orders(ai_confidence_score);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_urgency ON purchase_orders(urgency);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_ai_priority ON purchase_orders(ai_priority_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_expires_at ON purchase_orders(expires_at)
WHERE status = 'ai_suggested';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get AI-suggested POs (pending human review)
CREATE OR REPLACE FUNCTION get_ai_suggested_pos()
RETURNS TABLE (
  id uuid,
  order_id varchar,
  vendor_name text,
  vendor_id uuid,
  estimated_total decimal,
  urgency text,
  ai_priority_score float,
  item_count bigint,
  ai_reasoning text,
  ai_confidence_score float,
  ai_consolidation_opportunities jsonb,
  created_at timestamptz,
  expires_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    po.id,
    po.order_id,
    po.supplier_name as vendor_name,
    po.vendor_id,
    po.total_amount as estimated_total,
    po.urgency,
    po.ai_priority_score,
    COUNT(poi.id) as item_count,
    po.ai_reasoning,
    po.ai_confidence_score,
    po.ai_consolidation_opportunities,
    po.record_created as created_at,
    po.expires_at
  FROM purchase_orders po
  LEFT JOIN purchase_order_items poi ON poi.po_id = po.id
  WHERE po.status IN ('draft', 'ai_suggested')
    AND po.auto_generated = true
    AND (po.expires_at IS NULL OR po.expires_at > now())
  GROUP BY po.id, po.order_id, po.supplier_name, po.vendor_id, po.total_amount,
           po.urgency, po.ai_priority_score, po.ai_reasoning, po.ai_confidence_score,
           po.ai_consolidation_opportunities, po.record_created, po.expires_at
  ORDER BY po.ai_priority_score DESC NULLS LAST, po.record_created DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-set expiry for AI-suggested POs (7 days)
CREATE OR REPLACE FUNCTION set_ai_po_expiry()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set expiry for AI-generated draft POs
  IF NEW.auto_generated = true AND NEW.status = 'draft' AND NEW.expires_at IS NULL THEN
    NEW.expires_at = now() + INTERVAL '7 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_ai_po_expiry ON purchase_orders;
CREATE TRIGGER trigger_set_ai_po_expiry
  BEFORE INSERT ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION set_ai_po_expiry();

-- Approve AI-suggested PO (convert from draft to pending)
CREATE OR REPLACE FUNCTION approve_ai_suggested_po(
  p_po_id uuid,
  p_user_id uuid
)
RETURNS SETOF purchase_orders AS $$
BEGIN
  UPDATE purchase_orders
  SET
    status = 'pending',
    approved_by = (SELECT email FROM auth.users WHERE id = p_user_id),
    approved_at = now(),
    record_last_updated = now()
  WHERE id = p_po_id
    AND status = 'draft'
    AND auto_generated = true
  RETURNING *;

  RETURN QUERY SELECT * FROM purchase_orders WHERE id = p_po_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reject AI-suggested PO
CREATE OR REPLACE FUNCTION reject_ai_suggested_po(
  p_po_id uuid,
  p_user_id uuid,
  p_rejection_reason text
)
RETURNS SETOF purchase_orders AS $$
BEGIN
  UPDATE purchase_orders
  SET
    status = 'cancelled',
    cancellation_reason = p_rejection_reason,
    cancelled_at = now(),
    updated_by = (SELECT email FROM auth.users WHERE id = p_user_id),
    record_last_updated = now()
  WHERE id = p_po_id
    AND status = 'draft'
    AND auto_generated = true
  RETURNING *;

  RETURN QUERY SELECT * FROM purchase_orders WHERE id = p_po_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View for AI-suggested orders with enriched data
CREATE OR REPLACE VIEW ai_suggested_orders AS
SELECT
  po.id,
  po.order_id,
  po.order_date,
  po.supplier_name as vendor_name,
  po.vendor_id,
  po.total_amount,
  po.urgency,
  po.ai_priority_score,
  po.ai_confidence_score,
  po.ai_reasoning,
  po.ai_consolidation_opportunities,
  po.generation_reason,
  po.expires_at,
  po.record_created as created_at,
  COUNT(poi.id) as line_item_count,
  jsonb_agg(
    jsonb_build_object(
      'sku', poi.inventory_sku,
      'name', poi.item_name,
      'quantity', poi.quantity_ordered,
      'unit_cost', poi.unit_cost,
      'line_total', poi.line_total,
      'reorder_reason', poi.reorder_reason,
      'days_of_stock', poi.days_of_stock_at_order
    )
  ) as line_items
FROM purchase_orders po
LEFT JOIN purchase_order_items poi ON poi.po_id = po.id
WHERE po.status = 'draft'
  AND po.auto_generated = true
  AND (po.expires_at IS NULL OR po.expires_at > now())
GROUP BY po.id, po.order_id, po.order_date, po.supplier_name, po.vendor_id,
         po.total_amount, po.urgency, po.ai_priority_score, po.ai_confidence_score,
         po.ai_reasoning, po.ai_consolidation_opportunities, po.generation_reason,
         po.expires_at, po.record_created
ORDER BY po.ai_priority_score DESC NULLS LAST, po.record_created DESC;

COMMENT ON VIEW ai_suggested_orders IS 'AI-suggested purchase orders pending human review';

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN purchase_orders.ai_confidence_score IS
'AI confidence in this order recommendation (0.0-1.0). High score means stable demand and clear lead time.';

COMMENT ON COLUMN purchase_orders.ai_reasoning IS
'Explanation of why the AI suggested this order (e.g., "Stock hits 0 in 12 days. Lead time is 10 days.")';

COMMENT ON COLUMN purchase_orders.ai_consolidation_opportunities IS
'JSONB object with suggestions to optimize this order (free shipping, bulk discounts, etc.)';

COMMENT ON COLUMN purchase_orders.urgency IS
'Urgency level: critical (<7 days), high (7-14 days), medium (14-30 days), low (>30 days)';

COMMENT ON COLUMN purchase_orders.expires_at IS
'AI-suggested orders expire after 7 days if not acted upon';

COMMENT ON FUNCTION get_ai_suggested_pos IS
'Returns all AI-suggested POs pending human review with enriched vendor data';

COMMENT ON FUNCTION approve_ai_suggested_po IS
'Approve an AI-suggested PO, converting it from draft to pending status';

COMMENT ON FUNCTION reject_ai_suggested_po IS
'Reject an AI-suggested PO with a reason';
