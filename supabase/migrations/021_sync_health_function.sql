-- Migration: Sync Health Function & Secure Policies
-- Purpose: tighten sync metadata permissions and expose a server-side
--          health check used by the UI for freshness indicators.

-- Drop overly-permissive policies so only service role can write.
DROP POLICY IF EXISTS "Anyone can insert sync metadata" ON sync_metadata;
DROP POLICY IF EXISTS "Anyone can update sync metadata" ON sync_metadata;
DROP POLICY IF EXISTS "Anyone can read sync metadata" ON sync_metadata;

-- Allow clients to read sync metadata (writes happen via service role / Edge function).
CREATE POLICY "Public read sync metadata"
  ON sync_metadata FOR SELECT
  TO authenticated, anon
  USING (true);

-- Function: get_sync_health()
-- Returns freshness + staleness info for each managed data stream
-- (inventory, vendors, boms) so the frontend can reason about health
-- without duplicating logic.
CREATE OR REPLACE FUNCTION get_sync_health()
RETURNS TABLE (
  data_type TEXT,
  last_sync_time TIMESTAMPTZ,
  item_count INTEGER,
  success BOOLEAN,
  minutes_since_sync INTEGER,
  expected_interval_minutes INTEGER,
  is_stale BOOLEAN
) AS $$
WITH expected AS (
  SELECT * FROM (
    VALUES
      ('inventory'::text, 5),
      ('vendors'::text, 60),
      ('boms'::text, 60)
  ) AS t(data_type, expected_interval_minutes)
)
SELECT
  e.data_type,
  s.last_sync_time,
  COALESCE(s.item_count, 0) AS item_count,
  COALESCE(s.success, false) AS success,
  CASE
    WHEN s.last_sync_time IS NULL THEN NULL
    ELSE FLOOR(EXTRACT(EPOCH FROM (NOW() - s.last_sync_time)) / 60)::INT
  END AS minutes_since_sync,
  e.expected_interval_minutes,
  CASE
    WHEN s.last_sync_time IS NULL THEN true
    WHEN COALESCE(s.success, false) = false THEN true
    WHEN FLOOR(EXTRACT(EPOCH FROM (NOW() - s.last_sync_time)) / 60) > e.expected_interval_minutes THEN true
    ELSE false
  END AS is_stale
FROM expected e
LEFT JOIN sync_metadata s ON s.data_type = e.data_type;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION get_sync_health() TO authenticated, anon;
