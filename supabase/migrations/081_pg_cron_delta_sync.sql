-- =============================================
-- MIGRATION 081: PG_CRON DELTA SYNC SCHEDULING
-- =============================================
-- Purpose: Set up scheduled automatic sync with delta/incremental logic
-- to minimize API calls while keeping data fresh
-- =============================================

-- Enable pg_cron and pg_net extensions (required for scheduled HTTP calls)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- =============================================
-- SYNC STATE TRACKING TABLE
-- =============================================
-- Tracks last successful sync time for delta calculations
CREATE TABLE IF NOT EXISTS finale_sync_state (
  id TEXT PRIMARY KEY DEFAULT 'main',
  last_full_sync_at TIMESTAMPTZ,
  last_delta_sync_at TIMESTAMPTZ,
  last_stock_sync_at TIMESTAMPTZ,
  last_po_sync_at TIMESTAMPTZ,
  sync_in_progress BOOLEAN DEFAULT FALSE,
  current_sync_started_at TIMESTAMPTZ,
  records_synced_today INTEGER DEFAULT 0,
  api_calls_today INTEGER DEFAULT 0,
  last_reset_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initialize sync state
INSERT INTO finale_sync_state (id) VALUES ('main')
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- SYNC HELPER FUNCTIONS
-- =============================================

-- Function to check if sync should run (prevents overlapping syncs)
CREATE OR REPLACE FUNCTION should_run_sync(sync_type TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  state RECORD;
  min_interval INTERVAL;
BEGIN
  -- Get current state
  SELECT * INTO state FROM finale_sync_state WHERE id = 'main';
  
  -- Prevent overlapping syncs
  IF state.sync_in_progress AND 
     state.current_sync_started_at > NOW() - INTERVAL '10 minutes' THEN
    RAISE NOTICE 'Sync already in progress since %', state.current_sync_started_at;
    RETURN FALSE;
  END IF;
  
  -- Define minimum intervals based on sync type
  CASE sync_type
    WHEN 'full' THEN min_interval := INTERVAL '4 hours';
    WHEN 'stock' THEN min_interval := INTERVAL '1 hour';
    WHEN 'po' THEN min_interval := INTERVAL '15 minutes';
    WHEN 'delta' THEN min_interval := INTERVAL '30 minutes';
    ELSE min_interval := INTERVAL '1 hour';
  END CASE;
  
  -- Check if enough time has passed since last sync of this type
  CASE sync_type
    WHEN 'full' THEN
      IF state.last_full_sync_at > NOW() - min_interval THEN
        RAISE NOTICE 'Full sync ran recently at %', state.last_full_sync_at;
        RETURN FALSE;
      END IF;
    WHEN 'stock' THEN
      IF state.last_stock_sync_at > NOW() - min_interval THEN
        RAISE NOTICE 'Stock sync ran recently at %', state.last_stock_sync_at;
        RETURN FALSE;
      END IF;
    WHEN 'po' THEN
      IF state.last_po_sync_at > NOW() - min_interval THEN
        RAISE NOTICE 'PO sync ran recently at %', state.last_po_sync_at;
        RETURN FALSE;
      END IF;
    WHEN 'delta' THEN
      IF state.last_delta_sync_at > NOW() - min_interval THEN
        RAISE NOTICE 'Delta sync ran recently at %', state.last_delta_sync_at;
        RETURN FALSE;
      END IF;
  END CASE;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to mark sync start
CREATE OR REPLACE FUNCTION mark_sync_start()
RETURNS VOID AS $$
BEGIN
  UPDATE finale_sync_state
  SET sync_in_progress = TRUE,
      current_sync_started_at = NOW(),
      updated_at = NOW()
  WHERE id = 'main';
END;
$$ LANGUAGE plpgsql;

-- Function to mark sync complete
CREATE OR REPLACE FUNCTION mark_sync_complete(sync_type TEXT, records_count INTEGER DEFAULT 0)
RETURNS VOID AS $$
BEGIN
  -- Reset daily counters if new day
  UPDATE finale_sync_state
  SET records_synced_today = 0,
      api_calls_today = 0,
      last_reset_date = CURRENT_DATE
  WHERE id = 'main' AND last_reset_date < CURRENT_DATE;
  
  -- Update appropriate timestamp based on sync type
  UPDATE finale_sync_state
  SET sync_in_progress = FALSE,
      current_sync_started_at = NULL,
      records_synced_today = records_synced_today + COALESCE(records_count, 0),
      api_calls_today = api_calls_today + 1,
      updated_at = NOW(),
      last_full_sync_at = CASE WHEN sync_type = 'full' THEN NOW() ELSE last_full_sync_at END,
      last_delta_sync_at = CASE WHEN sync_type = 'delta' THEN NOW() ELSE last_delta_sync_at END,
      last_stock_sync_at = CASE WHEN sync_type = 'stock' THEN NOW() ELSE last_stock_sync_at END,
      last_po_sync_at = CASE WHEN sync_type = 'po' THEN NOW() ELSE last_po_sync_at END
  WHERE id = 'main';
END;
$$ LANGUAGE plpgsql;

-- Function to get sync stats
CREATE OR REPLACE FUNCTION get_sync_stats()
RETURNS TABLE(
  last_full_sync TEXT,
  last_delta_sync TEXT,
  last_stock_sync TEXT,
  last_po_sync TEXT,
  is_syncing BOOLEAN,
  records_today INTEGER,
  api_calls_today INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(to_char(s.last_full_sync_at, 'YYYY-MM-DD HH24:MI:SS'), 'Never'),
    COALESCE(to_char(s.last_delta_sync_at, 'YYYY-MM-DD HH24:MI:SS'), 'Never'),
    COALESCE(to_char(s.last_stock_sync_at, 'YYYY-MM-DD HH24:MI:SS'), 'Never'),
    COALESCE(to_char(s.last_po_sync_at, 'YYYY-MM-DD HH24:MI:SS'), 'Never'),
    s.sync_in_progress,
    s.records_synced_today,
    s.api_calls_today
  FROM finale_sync_state s
  WHERE s.id = 'main';
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- SCHEDULED SYNC JOBS
-- =============================================
-- NOTE: These require the Supabase project URL and service role key
-- The actual HTTP calls are made via pg_net extension

-- Function to trigger auto-sync via HTTP
CREATE OR REPLACE FUNCTION trigger_auto_sync(sync_type TEXT DEFAULT 'all')
RETURNS JSONB AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
  request_id BIGINT;
BEGIN
  -- Get configuration from vault or environment
  -- In production, use Supabase Vault for secrets
  supabase_url := current_setting('app.settings.supabase_url', TRUE);
  service_role_key := current_setting('app.settings.supabase_service_role_key', TRUE);
  
  -- Fallback for development (these should be set in Supabase dashboard)
  IF supabase_url IS NULL THEN
    supabase_url := 'https://mpuevsmtowyexhsqugkm.supabase.co';
  END IF;
  
  -- Check if we should run
  IF NOT should_run_sync(sync_type) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'message', 'Sync skipped - too soon since last sync or sync in progress'
    );
  END IF;
  
  -- Mark sync as starting
  PERFORM mark_sync_start();
  
  -- Make HTTP request to auto-sync function
  SELECT net.http_post(
    url := supabase_url || '/functions/v1/auto-sync-finale',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object('syncType', sync_type)
  ) INTO request_id;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Sync triggered',
    'request_id', request_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- CRON SCHEDULE SETUP
-- =============================================
-- Schedule full sync every 6 hours at minutes 0 (6am, 12pm, 6pm, 12am MT)
-- Note: Times are in UTC, Mountain Time is UTC-7 (or UTC-6 during DST)
-- 6 AM MT = 13:00 UTC (winter) or 12:00 UTC (summer)

-- Remove existing schedules if they exist
SELECT cron.unschedule('finale-full-sync') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'finale-full-sync'
);
SELECT cron.unschedule('finale-po-sync') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'finale-po-sync'
);

-- Schedule full sync at 6 AM and 6 PM Mountain Time (approximate)
-- Using 13:00 and 01:00 UTC for winter, adjust seasonally if needed
SELECT cron.schedule(
  'finale-full-sync',
  '0 13,1 * * *',  -- Run at 1 AM and 1 PM UTC (roughly 6 AM and 6 PM MT)
  $$SELECT trigger_auto_sync('all')$$
);

-- Schedule PO-only sync every hour (less API intensive)
SELECT cron.schedule(
  'finale-po-sync',
  '30 * * * *',  -- Every hour at minute 30
  $$SELECT trigger_auto_sync('graphql')$$  -- GraphQL has PO sync
);

-- =============================================
-- DELTA SYNC TRACKING
-- =============================================
-- Track which records have changed for delta sync
CREATE TABLE IF NOT EXISTS finale_sync_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,  -- 'product', 'vendor', 'po', 'inventory'
  entity_id TEXT NOT NULL,
  finale_url TEXT,
  change_type TEXT NOT NULL,  -- 'created', 'updated', 'deleted'
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ,
  sync_batch_id UUID,
  UNIQUE(entity_type, entity_id, change_type, changed_at)
);

CREATE INDEX IF NOT EXISTS idx_sync_changes_entity ON finale_sync_changes(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_changes_pending ON finale_sync_changes(synced_at) WHERE synced_at IS NULL;

-- Function to get pending changes for delta sync
CREATE OR REPLACE FUNCTION get_pending_sync_changes(limit_count INTEGER DEFAULT 1000)
RETURNS TABLE(
  entity_type TEXT,
  entity_ids TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  WITH pending AS (
    SELECT 
      sc.entity_type,
      array_agg(DISTINCT sc.entity_id) as ids
    FROM finale_sync_changes sc
    WHERE sc.synced_at IS NULL
    GROUP BY sc.entity_type
  )
  SELECT p.entity_type, p.ids[1:limit_count]
  FROM pending p;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- RLS POLICIES
-- =============================================
ALTER TABLE finale_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE finale_sync_changes ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view sync state
DROP POLICY IF EXISTS "Allow read sync_state" ON finale_sync_state;
CREATE POLICY "Allow read sync_state" ON finale_sync_state
  FOR SELECT TO authenticated USING (true);

-- Service role has full access
DROP POLICY IF EXISTS "Service role sync_state" ON finale_sync_state;
CREATE POLICY "Service role sync_state" ON finale_sync_state
  FOR ALL TO service_role USING (true);

DROP POLICY IF EXISTS "Allow read sync_changes" ON finale_sync_changes;
CREATE POLICY "Allow read sync_changes" ON finale_sync_changes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Service role sync_changes" ON finale_sync_changes;
CREATE POLICY "Service role sync_changes" ON finale_sync_changes
  FOR ALL TO service_role USING (true);

-- =============================================
-- VIEW FOR MONITORING
-- =============================================
CREATE OR REPLACE VIEW sync_dashboard AS
SELECT 
  s.last_full_sync_at,
  s.last_delta_sync_at,
  s.last_stock_sync_at,
  s.last_po_sync_at,
  s.sync_in_progress,
  s.records_synced_today,
  s.api_calls_today,
  (SELECT COUNT(*) FROM finale_sync_changes WHERE synced_at IS NULL) as pending_changes,
  (SELECT COUNT(*) FROM finale_products) as total_products,
  (SELECT COUNT(*) FROM finale_vendors) as total_vendors,
  (SELECT COUNT(*) FROM finale_purchase_orders) as total_pos,
  (SELECT COUNT(*) FROM finale_boms) as total_bom_components
FROM finale_sync_state s
WHERE s.id = 'main';

-- =============================================
-- DOCUMENTATION
-- =============================================
COMMENT ON TABLE finale_sync_state IS 'Tracks sync state for delta/incremental syncing to minimize API calls';
COMMENT ON TABLE finale_sync_changes IS 'Tracks individual record changes for delta sync batching';
COMMENT ON FUNCTION should_run_sync(TEXT) IS 'Checks if enough time has passed since last sync of given type';
COMMENT ON FUNCTION trigger_auto_sync(TEXT) IS 'Triggers auto-sync edge function via HTTP, respecting rate limits';
COMMENT ON VIEW sync_dashboard IS 'Dashboard view for monitoring sync health and statistics';

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 081: pg_cron delta sync setup complete';
  RAISE NOTICE '  ✓ finale_sync_state table created';
  RAISE NOTICE '  ✓ finale_sync_changes table created';
  RAISE NOTICE '  ✓ Sync helper functions created';
  RAISE NOTICE '  ✓ Cron jobs scheduled:';
  RAISE NOTICE '    - Full sync: 1 AM and 1 PM UTC (every 12 hours)';
  RAISE NOTICE '    - PO sync: Every hour at minute 30';
  RAISE NOTICE '  ✓ sync_dashboard view created';
END $$;
