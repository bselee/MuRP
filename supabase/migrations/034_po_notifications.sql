-- 034_po_notifications.sql
-- Extend purchase order tracking with invoice awareness + notification helpers.

BEGIN;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS invoice_detected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_gmail_message_id TEXT,
  ADD COLUMN IF NOT EXISTS invoice_summary JSONB DEFAULT '{}'::jsonb;

UPDATE public.purchase_orders
SET invoice_summary = '{}'::jsonb
WHERE invoice_summary IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchase_orders_tracking_status_check'
  ) THEN
    ALTER TABLE public.purchase_orders
    DROP CONSTRAINT purchase_orders_tracking_status_check;
  END IF;
END $$;

ALTER TABLE public.purchase_orders
ADD CONSTRAINT purchase_orders_tracking_status_check
CHECK (
  tracking_status IN (
    'awaiting_confirmation',
    'confirmed',
    'processing',
    'shipped',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'exception',
    'cancelled',
    'invoice_received'
  )
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_invoice_detected
  ON public.purchase_orders(invoice_detected_at DESC NULLS LAST);

COMMIT;
