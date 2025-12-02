-- Migration: Sync Connection Health Table
-- Description: Adds table to track connection health status for each data type
-- Date: 2025-12-01

-- =============================================================================
-- 1. SYNC CONNECTION HEALTH TABLE
-- =============================================================================
-- Tracks the health status of connections to external data sources

CREATE TABLE IF NOT EXISTS sync_connection_health (
  data_type TEXT PRIMARY KEY, -- 'inventory', 'vendors', 'boms', 'purchase_orders'
  status TEXT NOT NULL DEFAULT 'unknown', -- 'healthy', 'unhealthy', 'degraded', 'unknown'
  last_check_time TIMESTAMPTZ NOT NULL,
  item_count INTEGER DEFAULT 0,
  error_message TEXT,
  consecutive_failures INTEGER DEFAULT 0,
  last_success_time TIMESTAMPTZ,
  last_failure_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_sync_connection_health_status
  ON sync_connection_health(status);

CREATE INDEX IF NOT EXISTS idx_sync_connection_health_last_check
  ON sync_connection_health(last_check_time DESC);

-- =============================================================================
-- 2. RLS POLICIES
-- =============================================================================

ALTER TABLE sync_connection_health ENABLE ROW LEVEL SECURITY;

-- Service role has full access
DROP POLICY IF EXISTS "Service role full access sync_connection_health" ON sync_connection_health;
CREATE POLICY "Service role full access sync_connection_health"
  ON sync_connection_health FOR ALL
  TO service_role
  USING (true);

-- Authenticated users can read connection health
DROP POLICY IF EXISTS "Authenticated users can read connection health" ON sync_connection_health;
CREATE POLICY "Authenticated users can read connection health"
  ON sync_connection_health FOR SELECT
  TO authenticated
  USING (true);

-- =============================================================================
-- 3. UPDATE FUNCTION FOR CONNECTION HEALTH
-- =============================================================================

-- Function to update connection health with failure tracking
CREATE OR REPLACE FUNCTION update_connection_health_status(
  p_data_type TEXT,
  p_status TEXT,
  p_item_count INTEGER DEFAULT 0,
  p_error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_current_record RECORD;
  v_consecutive_failures INTEGER;
BEGIN
  -- Get current record
  SELECT * INTO v_current_record
  FROM sync_connection_health
  WHERE data_type = p_data_type;

  -- Calculate consecutive failures
  IF p_status = 'healthy' THEN
    v_consecutive_failures := 0;
  ELSIF v_current_record.consecutive_failures IS NOT NULL THEN
    v_consecutive_failures := v_current_record.consecutive_failures + 1;
  ELSE
    v_consecutive_failures := 1;
  END IF;

  -- Upsert the record
  INSERT INTO sync_connection_health (
    data_type,
    status,
    last_check_time,
    item_count,
    error_message,
    consecutive_failures,
    last_success_time,
    last_failure_time,
    updated_at
  ) VALUES (
    p_data_type,
    p_status,
    NOW(),
    p_item_count,
    p_error_message,
    v_consecutive_failures,
    CASE WHEN p_status = 'healthy' THEN NOW() ELSE v_current_record.last_success_time END,
    CASE WHEN p_status != 'healthy' THEN NOW() ELSE v_current_record.last_failure_time END,
    NOW()
  ) ON CONFLICT (data_type) DO UPDATE SET
    status = EXCLUDED.status,
    last_check_time = EXCLUDED.last_check_time,
    item_count = EXCLUDED.item_count,
    error_message = EXCLUDED.error_message,
    consecutive_failures = EXCLUDED.consecutive_failures,
    last_success_time = EXCLUDED.last_success_time,
    last_failure_time = EXCLUDED.last_failure_time,
    updated_at = EXCLUDED.updated_at;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 4. HEALTH CHECK FUNCTION
-- =============================================================================

-- Function to get overall system health
CREATE OR REPLACE FUNCTION get_sync_system_health()
RETURNS TABLE(
  data_type TEXT,
  status TEXT,
  last_check_time TIMESTAMPTZ,
  item_count INTEGER,
  consecutive_failures INTEGER,
  overall_health TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sch.data_type,
    sch.status,
    sch.last_check_time,
    sch.item_count,
    sch.consecutive_failures,
    CASE
      WHEN sch.status = 'healthy' AND sch.consecutive_failures = 0 THEN 'excellent'
      WHEN sch.status = 'healthy' AND sch.consecutive_failures <= 2 THEN 'good'
      WHEN sch.status = 'degraded' THEN 'fair'
      WHEN sch.status = 'unhealthy' OR sch.consecutive_failures > 5 THEN 'poor'
      ELSE 'unknown'
    END as overall_health
  FROM sync_connection_health sch
  ORDER BY sch.data_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 5. COMMENTS AND GRANTS
-- =============================================================================

COMMENT ON TABLE sync_connection_health IS 'Tracks connection health status for each data sync type';
COMMENT ON COLUMN sync_connection_health.data_type IS 'Type of data being synced (inventory, vendors, boms, purchase_orders)';
COMMENT ON COLUMN sync_connection_health.status IS 'Current health status: healthy, unhealthy, degraded, unknown';
COMMENT ON COLUMN sync_connection_health.consecutive_failures IS 'Number of consecutive sync failures';
COMMENT ON FUNCTION update_connection_health_status IS 'Update connection health status with failure tracking';
COMMENT ON FUNCTION get_sync_system_health IS 'Get overall system health across all sync types';

-- Grant necessary permissions
GRANT SELECT ON sync_connection_health TO authenticated;