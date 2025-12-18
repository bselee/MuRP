-- Migration 095: Add missing columns to purchase order tables
-- Fixes database schema errors for PO intelligence features

-- Add tracking_status column to finale_purchase_orders
-- This column tracks shipment status for delivery predictions
ALTER TABLE finale_purchase_orders
ADD COLUMN IF NOT EXISTS tracking_status TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN finale_purchase_orders.tracking_status IS 'Shipment tracking status: pending, in_transit, out_for_delivery, delivered, exception';

-- Note: purchase_orders.total column already exists (confirmed via schema check)
-- No need to add or update it
