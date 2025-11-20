-- Migration 030: Purchase Order Tracking Enhancements

-- Enum-like constraint for tracking status lifecycle
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS tracking_status TEXT DEFAULT 'awaiting_confirmation'
    CHECK (tracking_status IN (
      'awaiting_confirmation',
      'confirmed',
      'processing',
      'shipped',
      'in_transit',
      'out_for_delivery',
      'delivered',
      'exception',
      'cancelled'
    )),
  ADD COLUMN IF NOT EXISTS tracking_carrier VARCHAR(120),
  ADD COLUMN IF NOT EXISTS tracking_last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tracking_last_exception TEXT,
  ADD COLUMN IF NOT EXISTS tracking_estimated_delivery DATE,
  ADD COLUMN IF NOT EXISTS tracking_events JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_po_tracking_status
  ON purchase_orders(tracking_status);

CREATE INDEX IF NOT EXISTS idx_po_tracking_carrier
  ON purchase_orders(tracking_carrier);

-- Detailed tracking events table
CREATE TABLE IF NOT EXISTS po_tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  carrier VARCHAR(120),
  tracking_number VARCHAR(120),
  description TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_tracking_events_po_id
  ON po_tracking_events(po_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_po_tracking_events_status
  ON po_tracking_events(status);

COMMENT ON TABLE po_tracking_events IS 'Timeline of status changes pulled from carriers, vendor emails, or manual updates.';

-- Helper view for dashboards
CREATE OR REPLACE VIEW po_tracking_overview AS
SELECT
  po.id,
  po.order_id,
  po.vendor_id,
  po.tracking_number,
  po.tracking_carrier,
  po.tracking_status,
  po.tracking_estimated_delivery,
  po.tracking_last_checked_at,
  po.tracking_last_exception,
  (SELECT created_at FROM po_tracking_events e WHERE e.po_id = po.id ORDER BY created_at DESC LIMIT 1) AS last_event_at
FROM purchase_orders po
WHERE po.tracking_number IS NOT NULL;

COMMENT ON VIEW po_tracking_overview IS 'Latest tracking snapshot for purchase orders with tracking numbers.';
