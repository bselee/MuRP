-- Migration 070: Add sync log table for tracking API sync operations
-- Supports delta sync and metrics tracking

CREATE TABLE IF NOT EXISTS sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL, -- 'finale_rest', 'finale_csv', etc.
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'partial')),
  records_processed INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_inserted INTEGER DEFAULT 0,
  api_calls INTEGER DEFAULT 0,
  api_calls_saved INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying recent syncs by source
CREATE INDEX idx_sync_log_source_completed ON sync_log(source, completed_at DESC);

-- Index for status monitoring
CREATE INDEX idx_sync_log_status ON sync_log(status, completed_at DESC);

-- Add comment
COMMENT ON TABLE sync_log IS 'Tracks API sync operations for delta sync and performance monitoring';

-- Add columns to purchase_orders for Finale tracking
ALTER TABLE purchase_orders 
ADD COLUMN IF NOT EXISTS finale_po_id TEXT,
ADD COLUMN IF NOT EXISTS finale_supplier TEXT,
ADD COLUMN IF NOT EXISTS finale_last_modified TIMESTAMPTZ;

-- Add index for Finale PO lookups
CREATE INDEX IF NOT EXISTS idx_purchase_orders_finale_id ON purchase_orders(finale_po_id);

-- Add columns to inventory_items for Finale tracking
ALTER TABLE inventory_items
ADD COLUMN IF NOT EXISTS finale_product_id TEXT,
ADD COLUMN IF NOT EXISTS finale_last_modified TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}';

-- Add index for Finale product lookups
CREATE INDEX IF NOT EXISTS idx_inventory_items_finale_id ON inventory_items(finale_product_id);

-- Add index for last modified queries (delta sync)
CREATE INDEX IF NOT EXISTS idx_inventory_items_finale_modified ON inventory_items(finale_last_modified);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_finale_modified ON purchase_orders(finale_last_modified);
