-- Migration: Stock Alert Email Support
-- Purpose: Add stock_alert attachment type for Stockie/Shopify inventory CSV processing
-- Uses existing pending_actions and email_tracking_alerts tables (no new tables needed)

-- ============================================================
-- Update email_attachments attachment_type constraint
-- ============================================================

-- Drop existing constraint and add new one with stock_alert type
ALTER TABLE email_attachments
  DROP CONSTRAINT IF EXISTS email_attachments_attachment_type_check;

ALTER TABLE email_attachments
  ADD CONSTRAINT email_attachments_attachment_type_check
  CHECK (attachment_type IN (
    'invoice',      -- Vendor invoice
    'statement',    -- Account statement
    'packing_slip', -- Shipping packing slip
    'pod',          -- Proof of delivery
    'quote',        -- Price quote
    'credit_memo',  -- Credit/refund document
    'stock_alert',  -- Inventory/stock alert CSV (Stockie, Shopify, etc.)
    'other'         -- Unclassified
  ));

-- ============================================================
-- Add stock_alerts_processed column to email_tracking_runs
-- ============================================================

ALTER TABLE email_tracking_runs
  ADD COLUMN IF NOT EXISTS stock_alerts_processed INTEGER DEFAULT 0;

COMMENT ON COLUMN email_tracking_runs.stock_alerts_processed IS 'Number of stock alert items processed from CSV attachments';

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON CONSTRAINT email_attachments_attachment_type_check ON email_attachments IS
  'Attachment classification types including stock_alert for inventory CSV processing';
