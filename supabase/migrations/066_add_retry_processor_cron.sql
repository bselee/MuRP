-- Migration: Add Cron Job for Sync Retry Processor
-- Description: Schedules automatic processing of sync retry queue
-- Date: 2025-12-01

-- =============================================================================
-- SCHEDULE RETRY PROCESSOR CRON JOB
-- =============================================================================

-- Create a cron job to process sync retries every 2 minutes
-- This ensures failed syncs are retried automatically without manual intervention
SELECT cron.schedule(
  'process-sync-retries',
  '*/2 * * * *', -- Every 2 minutes
  $$
  SELECT
    net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/process-sync-retries',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================