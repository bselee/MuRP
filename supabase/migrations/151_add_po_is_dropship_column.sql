-- Migration 151: Add is_dropship column to finale_purchase_orders
--
-- The sync-finale-graphql function transforms PO data with an is_dropship flag
-- but the column was missing from the table.
--

ALTER TABLE finale_purchase_orders
ADD COLUMN IF NOT EXISTS is_dropship BOOLEAN DEFAULT false;

-- Also add is_active if missing (used by sync to track stale POs)
ALTER TABLE finale_purchase_orders
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Index for filtering active/dropship POs
CREATE INDEX IF NOT EXISTS idx_finale_pos_active ON finale_purchase_orders(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_finale_pos_dropship ON finale_purchase_orders(is_dropship) WHERE is_dropship = true;

COMMENT ON COLUMN finale_purchase_orders.is_dropship IS 'True if order ID contains DropshipPO pattern';
COMMENT ON COLUMN finale_purchase_orders.is_active IS 'False for POs older than 24 months (cleaned up by sync)';
