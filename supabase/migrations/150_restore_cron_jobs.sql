-- Migration 150: Restore pg_cron Jobs for Finale Sync
--
-- The cron jobs created in migration 081 appear to be missing.
-- This migration recreates them and initializes sync state.
--

-- ============================================================================
-- INITIALIZE SYNC STATE
-- ============================================================================

-- Ensure sync state table has the main record
INSERT INTO finale_sync_state (id) VALUES ('main')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- RESTORE CRON JOBS
-- ============================================================================

-- Remove existing schedules if they exist (safe to call even if missing)
DO $$
BEGIN
  PERFORM cron.unschedule('finale-full-sync');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'finale-full-sync job did not exist';
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('finale-po-sync');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'finale-po-sync job did not exist';
END $$;

-- Schedule full sync at 1 AM and 1 PM UTC (6 AM and 6 PM MT approximately)
SELECT cron.schedule(
  'finale-full-sync',
  '0 13,1 * * *',
  $$SELECT trigger_auto_sync('all')$$
);

-- Schedule PO-only sync every hour at minute 30
SELECT cron.schedule(
  'finale-po-sync',
  '30 * * * *',
  $$SELECT trigger_auto_sync('graphql')$$
);

-- ============================================================================
-- VERIFY
-- ============================================================================

DO $$
DECLARE
  job_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO job_count FROM cron.job WHERE jobname IN ('finale-full-sync', 'finale-po-sync');

  IF job_count = 2 THEN
    RAISE NOTICE '✓ Both cron jobs restored successfully';
  ELSE
    RAISE WARNING '⚠ Expected 2 cron jobs, found %', job_count;
  END IF;

  RAISE NOTICE 'Cron jobs scheduled:';
  RAISE NOTICE '  - finale-full-sync: 0 13,1 * * * (twice daily)';
  RAISE NOTICE '  - finale-po-sync: 30 * * * * (hourly)';
END $$;
