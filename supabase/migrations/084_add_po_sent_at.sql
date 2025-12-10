-- ============================================================================
-- Migration 084: Add sent_at Timestamp to Finale Purchase Orders
-- Critical for agentic workflow tracking - marks when PO email was sent
-- ============================================================================

-- Add sent_at column to finale_purchase_orders
ALTER TABLE finale_purchase_orders
ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- Add index for efficient querying of sent POs
CREATE INDEX IF NOT EXISTS idx_finale_purchase_orders_sent_at 
ON finale_purchase_orders(sent_at) 
WHERE sent_at IS NOT NULL;

-- Add comment documenting the column's purpose
COMMENT ON COLUMN finale_purchase_orders.sent_at IS 
'Timestamp when PO was emailed to vendor. Triggers agentic follow-up processes and vendor performance tracking.';

-- Also add sent_at to purchase_orders if not exists (for internal POs)
ALTER TABLE purchase_orders
ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- Add index for internal POs
CREATE INDEX IF NOT EXISTS idx_purchase_orders_sent_at_not_null
ON purchase_orders(sent_at)
WHERE sent_at IS NOT NULL;

COMMENT ON COLUMN purchase_orders.sent_at IS
'Timestamp when PO was sent to vendor. Critical for vendor watchdog and air traffic controller agents.';
