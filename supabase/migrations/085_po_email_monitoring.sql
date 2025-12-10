-- Migration 085: PO Email Monitoring Infrastructure
-- 
-- Adds support for automated monitoring of vendor email responses after PO sent.
-- Tracks communication processing, agent handoffs, and last check timestamps.
-- Schedules periodic monitoring via pg_cron.

-- Add monitoring fields to po_vendor_communications
ALTER TABLE po_vendor_communications 
ADD COLUMN IF NOT EXISTS processed_by_monitor BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS monitor_processed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS monitor_handoff_to TEXT CHECK (
  monitor_handoff_to IN (
    'air_traffic_controller',
    'document_analyzer', 
    'vendor_watchdog',
    'human_review',
    'none'
  )
);

COMMENT ON COLUMN po_vendor_communications.processed_by_monitor IS 
  'Indicates if this communication has been processed by the email monitoring service';

COMMENT ON COLUMN po_vendor_communications.monitor_processed_at IS 
  'Timestamp when monitoring service processed this communication';

COMMENT ON COLUMN po_vendor_communications.monitor_handoff_to IS 
  'Which agent this communication was routed to: air_traffic_controller, document_analyzer, vendor_watchdog, human_review, or none';

-- Add last check timestamp to purchase_orders
ALTER TABLE purchase_orders 
ADD COLUMN IF NOT EXISTS last_monitor_check TIMESTAMPTZ;

COMMENT ON COLUMN purchase_orders.last_monitor_check IS 
  'Last time the email monitor checked for vendor responses for this PO';

-- Add response category to po_vendor_communications (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'po_vendor_communications' 
    AND column_name = 'response_category'
  ) THEN
    ALTER TABLE po_vendor_communications 
    ADD COLUMN response_category TEXT CHECK (
      response_category IN (
        'confirmation',
        'tracking_provided',
        'invoice_attached',
        'packing_slip',
        'backorder_notice',
        'delay_notice',
        'price_change',
        'cancellation',
        'question_raised',
        'other'
      )
    );
    
    COMMENT ON COLUMN po_vendor_communications.response_category IS 
      'Category of vendor response for intelligent agent routing';
  END IF;
END $$;

-- Create index for unprocessed communications
CREATE INDEX IF NOT EXISTS idx_po_vendor_comms_unprocessed 
ON po_vendor_communications(direction, processed_by_monitor) 
WHERE processed_by_monitor IS NULL OR processed_by_monitor = false;

-- Create index for monitoring queries
CREATE INDEX IF NOT EXISTS idx_purchase_orders_monitoring 
ON purchase_orders(sent_at, status) 
WHERE sent_at IS NOT NULL;

-- Create index for vendor response status
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor_response 
ON purchase_orders(vendor_response_status) 
WHERE vendor_response_status IS NULL OR vendor_response_status = 'pending_response';

-- Schedule PO email monitoring to run every 5 minutes
-- Uses pg_cron extension to invoke the edge function
SELECT cron.schedule(
  'po-email-monitor-scan',
  '*/5 * * * *', -- Every 5 minutes
  $$
  SELECT
    net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/po-email-monitor',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

COMMENT ON EXTENSION cron IS 'Scheduled PO email monitoring runs every 5 minutes to check for vendor responses';

-- Grant necessary permissions
GRANT SELECT, UPDATE ON purchase_orders TO service_role;
GRANT SELECT, UPDATE ON finale_purchase_orders TO service_role;
GRANT SELECT, UPDATE ON po_vendor_communications TO service_role;
GRANT SELECT ON vendors TO service_role;
GRANT SELECT ON finale_vendors TO service_role;
