-- ============================================================================
-- Migration 180: Fix should_run_sync Function
-- ============================================================================
-- The function was missing ELSE clauses in CASE statements, causing errors
-- when sync_type is 'products', 'graphql', or 'all'
-- ============================================================================

CREATE OR REPLACE FUNCTION should_run_sync(sync_type TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  state RECORD;
  min_interval INTERVAL;
  last_sync TIMESTAMPTZ;
BEGIN
  -- Get current state
  SELECT * INTO state FROM finale_sync_state WHERE id = 'main';

  -- If no state record exists, allow sync
  IF state IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Prevent overlapping syncs
  IF state.sync_in_progress AND
     state.current_sync_started_at > NOW() - INTERVAL '10 minutes' THEN
    RAISE NOTICE 'Sync already in progress since %', state.current_sync_started_at;
    RETURN FALSE;
  END IF;

  -- Define minimum intervals based on sync type
  min_interval := CASE sync_type
    WHEN 'full' THEN INTERVAL '4 hours'
    WHEN 'all' THEN INTERVAL '4 hours'
    WHEN 'stock' THEN INTERVAL '1 hour'
    WHEN 'po' THEN INTERVAL '15 minutes'
    WHEN 'delta' THEN INTERVAL '30 minutes'
    WHEN 'graphql' THEN INTERVAL '30 minutes'
    WHEN 'products' THEN INTERVAL '30 minutes'
    ELSE INTERVAL '1 hour'
  END;

  -- Get last sync time based on sync type
  last_sync := CASE sync_type
    WHEN 'full' THEN state.last_full_sync_at
    WHEN 'all' THEN state.last_full_sync_at
    WHEN 'stock' THEN state.last_stock_sync_at
    WHEN 'po' THEN state.last_po_sync_at
    WHEN 'delta' THEN state.last_delta_sync_at
    WHEN 'graphql' THEN COALESCE(state.last_sync_triggered_at, state.last_delta_sync_at)
    WHEN 'products' THEN COALESCE(state.last_sync_triggered_at, state.last_delta_sync_at)
    ELSE state.last_full_sync_at
  END;

  -- Check if enough time has passed
  IF last_sync IS NOT NULL AND last_sync > NOW() - min_interval THEN
    RAISE NOTICE '% sync ran recently at %', sync_type, last_sync;
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION should_run_sync IS 'Checks if enough time has passed since last sync. Handles: full, all, stock, po, delta, graphql, products';
