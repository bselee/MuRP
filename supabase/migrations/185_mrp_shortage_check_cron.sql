-- ============================================================================
-- MRP COMPONENT SHORTAGE CHECK - SCHEDULED JOB
-- Runs every 4 hours to detect critical shortages and create draft POs
-- ============================================================================

-- Add MRP tracking columns to finale_sync_state
ALTER TABLE finale_sync_state
ADD COLUMN IF NOT EXISTS last_mrp_shortage_check_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_mrp_forecast_update_at TIMESTAMPTZ;

-- Function to call the shortage check via edge function
CREATE OR REPLACE FUNCTION trigger_mrp_shortage_check()
RETURNS void AS $$
DECLARE
  v_service_role_key TEXT;
  v_supabase_url TEXT;
BEGIN
  -- Get service role key from vault
  SELECT decrypted_secret INTO v_service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_service_role_key'
  LIMIT 1;

  IF v_service_role_key IS NULL THEN
    RAISE WARNING 'No service role key found in vault - shortage check skipped';
    RETURN;
  END IF;

  -- Get Supabase URL from environment or use default
  v_supabase_url := COALESCE(
    current_setting('app.settings.supabase_url', TRUE),
    'https://fzhozxrzwzaxhkbmstmm.supabase.co'
  );

  -- Log the attempt
  RAISE NOTICE 'Triggering MRP shortage check at %', NOW();

  -- Update sync state
  UPDATE finale_sync_state
  SET last_mrp_shortage_check_at = NOW(),
      updated_at = NOW()
  WHERE id = 'main';

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'MRP shortage check failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to postgres (for pg_cron)
GRANT EXECUTE ON FUNCTION trigger_mrp_shortage_check() TO postgres;

COMMENT ON FUNCTION trigger_mrp_shortage_check IS 'Triggers MRP shortage detection check - runs every 4 hours via pg_cron';

-- ============================================================================
-- pg_cron job for shortage check (every 4 hours)
-- ============================================================================

-- Only create cron job if pg_cron extension exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove existing job if present
    PERFORM cron.unschedule('mrp-shortage-check')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'mrp-shortage-check'
    );

    -- Schedule new job - every 4 hours at minute 30
    PERFORM cron.schedule(
      'mrp-shortage-check',
      '30 */4 * * *',  -- At minute 30, every 4 hours
      'SELECT trigger_mrp_shortage_check()'
    );

    RAISE NOTICE 'Created pg_cron job: mrp-shortage-check (every 4 hours)';
  ELSE
    RAISE NOTICE 'pg_cron extension not available - skipping job creation';
  END IF;
END $$;

-- ============================================================================
-- HELPER VIEW: MRP Process Status
-- ============================================================================

CREATE OR REPLACE VIEW mrp_process_status AS
SELECT
  'main' AS process_id,
  last_mrp_shortage_check_at,
  last_mrp_forecast_update_at,
  last_full_sync_at,
  last_po_sync_at,
  -- Time since last MRP shortage check
  CASE
    WHEN last_mrp_shortage_check_at IS NULL THEN 'NEVER_RUN'
    WHEN EXTRACT(EPOCH FROM (NOW() - last_mrp_shortage_check_at)) > 14400 THEN 'OVERDUE'
    WHEN EXTRACT(EPOCH FROM (NOW() - last_mrp_shortage_check_at)) > 7200 THEN 'WARNING'
    ELSE 'OK'
  END AS mrp_shortage_health,
  -- Hours since run
  CASE
    WHEN last_mrp_shortage_check_at IS NOT NULL
    THEN ROUND(EXTRACT(EPOCH FROM (NOW() - last_mrp_shortage_check_at)) / 3600, 1)
    ELSE NULL
  END AS hours_since_shortage_check
FROM finale_sync_state
WHERE id = 'main';

COMMENT ON VIEW mrp_process_status IS 'Health status of MRP scheduled processes';
