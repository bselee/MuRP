-- ============================================================================
-- Migration 179: Fix App Settings for Auto-Sync
-- ============================================================================
-- The trigger_auto_sync() function needs proper authentication to call
-- edge functions. This updates the function to handle missing config gracefully.
--
-- To enable scheduled syncs, set the service role key in Supabase Dashboard:
-- Database > Extensions > Vault > New Secret:
--   Name: supabase_service_role_key
--   Value: <your service role key>
-- ============================================================================

-- Update trigger_auto_sync to use vault for the service role key
CREATE OR REPLACE FUNCTION trigger_auto_sync(sync_type TEXT DEFAULT 'all')
RETURNS JSONB AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
  request_id BIGINT;
  function_name TEXT;
BEGIN
  -- Get Supabase URL
  supabase_url := current_setting('app.settings.supabase_url', TRUE);
  IF supabase_url IS NULL THEN
    supabase_url := 'https://mpuevsmtowyexhsqugkm.supabase.co';
  END IF;

  -- Try to get service role key from vault first, then app.settings
  BEGIN
    SELECT decrypted_secret INTO service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_service_role_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    service_role_key := NULL;
  END;

  IF service_role_key IS NULL THEN
    service_role_key := current_setting('app.settings.supabase_service_role_key', TRUE);
  END IF;

  -- If still no key, we can't make authenticated calls
  IF service_role_key IS NULL OR service_role_key = '' THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'No service role key configured. Set via Supabase Dashboard > Database > Extensions > Vault',
      'sync_type', sync_type
    );
  END IF;

  -- Check if we should run (rate limiting)
  IF NOT should_run_sync(sync_type) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'skipped', TRUE,
      'reason', 'Rate limited - sync ran recently',
      'sync_type', sync_type
    );
  END IF;

  -- Determine which function to call
  IF sync_type = 'graphql' OR sync_type = 'products' THEN
    function_name := 'sync-finale-graphql';
  ELSE
    function_name := 'auto-sync-finale';
  END IF;

  -- Make HTTP request to edge function
  SELECT net.http_post(
    url := supabase_url || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'syncType', sync_type,
      'triggeredBy', 'pg_cron',
      'timestamp', NOW()::TEXT
    )
  ) INTO request_id;

  -- Update sync state
  UPDATE finale_sync_state
  SET
    last_sync_triggered_at = NOW(),
    last_sync_type = sync_type
  WHERE id = 'main';

  RETURN jsonb_build_object(
    'success', TRUE,
    'request_id', request_id,
    'function', function_name,
    'sync_type', sync_type,
    'triggered_at', NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add last_sync_triggered_at column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'finale_sync_state'
    AND column_name = 'last_sync_triggered_at'
  ) THEN
    ALTER TABLE finale_sync_state ADD COLUMN last_sync_triggered_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'finale_sync_state'
    AND column_name = 'last_sync_type'
  ) THEN
    ALTER TABLE finale_sync_state ADD COLUMN last_sync_type TEXT;
  END IF;
END $$;

-- Grant execute to authenticated users (needed for manual triggers from app)
GRANT EXECUTE ON FUNCTION trigger_auto_sync(TEXT) TO authenticated;

COMMENT ON FUNCTION trigger_auto_sync IS 'Triggers Finale sync via edge function. Requires service_role_key in vault or app.settings';
