-- Migration 152: Invoice Processing Cron Jobs
--
-- Adds scheduled tasks to process pending invoices and run three-way matching.
-- This gives the invoice system its "heartbeat" - without these cron jobs,
-- invoices pile up in pending_extraction status with nothing to process them.
--
-- Cron Jobs Added:
-- 1. invoice-extraction: Every 10 minutes - Process pending invoice attachments
-- 2. three-way-match: Every 15 minutes - Run 3-way matching on received POs
-- 3. invoice-alerts: Daily at 8 AM - Generate alerts for stale invoices

-- ============================================================================
-- INVOICE EXTRACTION CRON JOB (Every 10 minutes)
-- ============================================================================

-- Remove if exists
DO $$
BEGIN
  PERFORM cron.unschedule('invoice-extraction');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'invoice-extraction job did not exist';
END $$;

-- Schedule invoice extraction every 10 minutes
SELECT cron.schedule(
  'invoice-extraction',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/invoice-extractor',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('source', 'cron', 'batch_size', 10)
  )
  $$
);

-- Note: Cannot comment on cron.job columns (extension-owned)

-- ============================================================================
-- THREE-WAY MATCH CRON JOB (Every 15 minutes)
-- ============================================================================

DO $$
BEGIN
  PERFORM cron.unschedule('three-way-match');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'three-way-match job did not exist';
END $$;

-- Schedule three-way matching every 15 minutes
SELECT cron.schedule(
  'three-way-match',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/three-way-match-runner',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('source', 'cron', 'batch_size', 50)
  )
  $$
);

-- ============================================================================
-- STALE INVOICE ALERTS CRON JOB (Daily at 8 AM)
-- ============================================================================

DO $$
BEGIN
  PERFORM cron.unschedule('invoice-stale-alerts');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'invoice-stale-alerts job did not exist';
END $$;

-- Schedule daily at 8 AM UTC (2 AM MT)
SELECT cron.schedule(
  'invoice-stale-alerts',
  '0 8 * * *',
  $$
  INSERT INTO pending_actions_queue (
    action_type,
    priority,
    title,
    description,
    entity_type,
    metadata,
    status,
    created_at
  )
  SELECT
    'invoice_review_reminder',
    CASE
      WHEN vid.created_at < NOW() - INTERVAL '7 days' THEN 'critical'
      WHEN vid.created_at < NOW() - INTERVAL '3 days' THEN 'high'
      ELSE 'medium'
    END,
    'Invoice Pending Review: ' || COALESCE(vid.invoice_number, 'Unknown'),
    'Invoice from ' || COALESCE(vid.vendor_name_on_invoice, 'Unknown Vendor') ||
      ' (Total: $' || COALESCE(vid.total_amount::text, '?') || ') ' ||
      'has been pending review for ' ||
      EXTRACT(DAY FROM NOW() - vid.created_at)::int || ' days',
    'invoice',
    jsonb_build_object(
      'invoice_id', vid.id,
      'invoice_number', vid.invoice_number,
      'vendor_name', vid.vendor_name_on_invoice,
      'total_amount', vid.total_amount,
      'pending_since', vid.created_at,
      'matched_po_id', vid.matched_po_id,
      'has_variances', vid.has_variances
    ),
    'pending',
    NOW()
  FROM vendor_invoice_documents vid
  WHERE vid.status IN ('pending_review', 'variance_detected', 'pending_match')
    AND vid.is_duplicate = FALSE
    AND vid.created_at < NOW() - INTERVAL '24 hours'
  ON CONFLICT DO NOTHING
  $$
);

-- ============================================================================
-- VERIFY CRON JOBS
-- ============================================================================

DO $$
DECLARE
  job_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO job_count
  FROM cron.job
  WHERE jobname IN ('invoice-extraction', 'three-way-match', 'invoice-stale-alerts');

  IF job_count = 3 THEN
    RAISE NOTICE '✓ All 3 invoice processing cron jobs created successfully';
  ELSE
    RAISE WARNING '⚠ Expected 3 cron jobs, found %', job_count;
  END IF;

  RAISE NOTICE 'Invoice cron jobs scheduled:';
  RAISE NOTICE '  - invoice-extraction: */10 * * * * (every 10 minutes)';
  RAISE NOTICE '  - three-way-match: */15 * * * * (every 15 minutes)';
  RAISE NOTICE '  - invoice-stale-alerts: 0 8 * * * (daily at 8 AM UTC)';
END $$;

-- ============================================================================
-- HELPER VIEW: Invoice Processing Status Dashboard
-- ============================================================================

CREATE OR REPLACE VIEW invoice_processing_dashboard AS
SELECT
  -- Pending extraction count (use attachment_type, not classification)
  (SELECT COUNT(*) FROM email_attachments
   WHERE attachment_type IN ('invoice', 'packing_slip')
   AND processed_at IS NULL) as pending_extraction,

  -- Pending review count
  (SELECT COUNT(*) FROM vendor_invoice_documents
   WHERE status IN ('pending_review', 'variance_detected', 'pending_match')
   AND is_duplicate = FALSE) as pending_review,

  -- Pending three-way match count
  (SELECT COUNT(*) FROM purchase_orders po
   LEFT JOIN po_three_way_matches twm ON po.id = twm.po_id
   WHERE po.status IN ('partial', 'received')
   AND (twm.resolved_at IS NULL OR twm.match_status = 'pending_data')) as pending_match,

  -- Auto-approved today
  (SELECT COUNT(*) FROM po_three_way_matches
   WHERE resolved_at >= CURRENT_DATE
   AND resolution_action = 'approved') as auto_approved_today,

  -- Discrepancies needing review
  (SELECT COUNT(*) FROM po_three_way_matches
   WHERE match_status IN ('mismatch', 'partial_match')
   AND resolved_at IS NULL) as discrepancies_pending,

  -- Last extraction run
  (SELECT MAX(completed_at) FROM agent_execution_log
   WHERE agent_identifier = 'invoice-extractor') as last_extraction_run,

  -- Last three-way match run
  (SELECT MAX(completed_at) FROM agent_execution_log
   WHERE agent_identifier = 'three-way-match-runner') as last_match_run;

COMMENT ON VIEW invoice_processing_dashboard IS
  'Real-time dashboard for invoice processing pipeline health';

GRANT SELECT ON invoice_processing_dashboard TO authenticated;
