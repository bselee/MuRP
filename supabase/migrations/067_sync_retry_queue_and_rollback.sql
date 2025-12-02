-- Migration: Retry Queue and Enhanced Backup System
-- Description: Adds retry queue for failed syncs and automatic rollback on empty data
-- Date: 2025-12-01

-- =============================================================================
-- 1. SYNC RETRY QUEUE TABLE
-- =============================================================================
-- Tracks failed sync attempts and manages retry logic with exponential backoff

CREATE TABLE IF NOT EXISTS sync_retry_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_type TEXT NOT NULL, -- 'inventory', 'vendors', 'boms', 'purchase_orders'
  operation TEXT NOT NULL, -- 'sync', 'backup', 'rollback'
  priority INTEGER DEFAULT 1, -- 1=low, 2=normal, 3=high, 4=critical
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed, cancelled

  -- Retry configuration
  max_retries INTEGER DEFAULT 3,
  retry_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  backoff_multiplier DECIMAL(3,2) DEFAULT 2.0, -- Exponential backoff multiplier

  -- Error tracking
  last_error_message TEXT,
  last_error_at TIMESTAMPTZ,
  consecutive_failures INTEGER DEFAULT 0,

  -- Context data (JSON for flexibility)
  context_data JSONB, -- Stores sync parameters, credentials info, etc.

  -- Rollback information
  backup_table_name TEXT, -- Name of backup table to restore from
  requires_rollback BOOLEAN DEFAULT FALSE,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'system',
  lock_token UUID, -- For distributed locking
  lock_expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_retry_queue_status_priority
  ON sync_retry_queue(status, priority DESC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_sync_retry_queue_next_retry
  ON sync_retry_queue(next_retry_at) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_sync_retry_queue_data_type
  ON sync_retry_queue(data_type, status);

-- Note: Removed idx_sync_retry_queue_lock due to NOW() immutability constraint
-- Lock cleanup will be handled by application logic instead

-- =============================================================================
-- 2. ENHANCED BACKUP LOGS EXTENSION
-- =============================================================================
-- Add rollback tracking to existing backup logs

ALTER TABLE data_backup_logs
ADD COLUMN IF NOT EXISTS rollback_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_rollback_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rollback_reason TEXT;

-- =============================================================================
-- 3. SYNC FAILURE LOGS TABLE
-- =============================================================================
-- Detailed logging of sync failures for analysis

CREATE TABLE IF NOT EXISTS sync_failure_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_type TEXT NOT NULL,
  operation TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_code TEXT,
  error_details JSONB,

  -- Context
  record_count INTEGER,
  duration_ms INTEGER,
  triggered_by TEXT DEFAULT 'system',

  -- Recovery info
  backup_available BOOLEAN DEFAULT FALSE,
  backup_table_name TEXT,
  auto_recovery_attempted BOOLEAN DEFAULT FALSE,
  recovery_successful BOOLEAN DEFAULT FALSE,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_failure_logs_data_type_created
  ON sync_failure_logs(data_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_failure_logs_operation
  ON sync_failure_logs(operation, created_at DESC);

-- =============================================================================
-- 4. FUNCTIONS FOR RETRY QUEUE MANAGEMENT
-- =============================================================================

-- Function to enqueue a failed sync for retry
CREATE OR REPLACE FUNCTION enqueue_sync_retry(
  p_data_type TEXT,
  p_operation TEXT,
  p_error_message TEXT,
  p_context_data JSONB DEFAULT NULL,
  p_priority INTEGER DEFAULT 1,
  p_max_retries INTEGER DEFAULT 3,
  p_requires_rollback BOOLEAN DEFAULT FALSE,
  p_backup_table_name TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_retry_id UUID;
  v_next_retry_at TIMESTAMPTZ;
BEGIN
  -- Calculate next retry time with exponential backoff (starting at 5 minutes)
  v_next_retry_at := NOW() + INTERVAL '5 minutes' * POWER(2, 0); -- First retry after 5 min

  INSERT INTO sync_retry_queue (
    data_type,
    operation,
    priority,
    status,
    max_retries,
    next_retry_at,
    last_error_message,
    last_error_at,
    context_data,
    requires_rollback,
    backup_table_name,
    created_by
  ) VALUES (
    p_data_type,
    p_operation,
    p_priority,
    'pending',
    p_max_retries,
    v_next_retry_at,
    p_error_message,
    NOW(),
    p_context_data,
    p_requires_rollback,
    p_backup_table_name,
    COALESCE(current_setting('request.jwt.claims', true)::json->>'sub', 'system')
  ) RETURNING id INTO v_retry_id;

  RETURN v_retry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to process next retry item
CREATE OR REPLACE FUNCTION process_next_retry()
RETURNS TABLE(
  retry_id UUID,
  data_type TEXT,
  operation TEXT,
  context_data JSONB,
  backup_table_name TEXT
) AS $$
DECLARE
  v_retry_record RECORD;
  v_lock_token UUID;
BEGIN
  -- Generate lock token
  v_lock_token := gen_random_uuid();

  -- Try to acquire lock on next pending retry
  UPDATE sync_retry_queue
  SET
    status = 'processing',
    lock_token = v_lock_token,
    lock_expires_at = NOW() + INTERVAL '10 minutes',
    updated_at = NOW()
  WHERE id = (
    SELECT id FROM sync_retry_queue
    WHERE status = 'pending'
      AND (next_retry_at IS NULL OR next_retry_at <= NOW())
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING id, data_type, operation, context_data, backup_table_name
  INTO v_retry_record;

  IF v_retry_record.id IS NOT NULL THEN
    RETURN QUERY SELECT
      v_retry_record.id,
      v_retry_record.data_type,
      v_retry_record.operation,
      v_retry_record.context_data,
      v_retry_record.backup_table_name;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark retry as completed or failed
CREATE OR REPLACE FUNCTION complete_retry(
  p_retry_id UUID,
  p_success BOOLEAN,
  p_error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_retry_record RECORD;
  v_new_status TEXT;
  v_new_next_retry_at TIMESTAMPTZ;
BEGIN
  -- Get current retry record
  SELECT * INTO v_retry_record
  FROM sync_retry_queue
  WHERE id = p_retry_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF p_success THEN
    -- Mark as completed
    v_new_status := 'completed';
    v_new_next_retry_at := NULL;
  ELSE
    -- Increment retry count and calculate next retry
    v_retry_record.retry_count := v_retry_record.retry_count + 1;
    v_retry_record.consecutive_failures := v_retry_record.consecutive_failures + 1;

    IF v_retry_record.retry_count >= v_retry_record.max_retries THEN
      -- Max retries reached
      v_new_status := 'failed';
      v_new_next_retry_at := NULL;
    ELSE
      -- Schedule next retry with exponential backoff
      v_new_status := 'pending';
      v_new_next_retry_at := NOW() + INTERVAL '5 minutes' * POWER(v_retry_record.backoff_multiplier, v_retry_record.retry_count);
    END IF;
  END IF;

  -- Update retry record
  UPDATE sync_retry_queue SET
    status = v_new_status,
    retry_count = v_retry_record.retry_count,
    consecutive_failures = v_retry_record.consecutive_failures,
    next_retry_at = v_new_next_retry_at,
    last_error_message = COALESCE(p_error_message, last_error_message),
    last_error_at = CASE WHEN p_error_message IS NOT NULL THEN NOW() ELSE last_error_at END,
    lock_token = NULL,
    lock_expires_at = NULL,
    updated_at = NOW()
  WHERE id = p_retry_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to trigger automatic rollback on empty data detection
CREATE OR REPLACE FUNCTION trigger_empty_data_rollback(
  p_data_type TEXT,
  p_table_name TEXT,
  p_error_message TEXT DEFAULT 'Empty data detected - automatic rollback triggered'
)
RETURNS TEXT AS $$
DECLARE
  v_backup_table TEXT;
  v_rollback_result TEXT;
BEGIN
  -- Find most recent successful backup for this data type
  SELECT backup_table INTO v_backup_table
  FROM data_backup_logs
  WHERE source_table = p_table_name
    AND row_count > 0
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_backup_table IS NULL THEN
    -- No backup available
    RETURN 'no_backup_available';
  END IF;

  -- Attempt rollback
  SELECT rollback_from_backup(p_table_name, v_backup_table) INTO v_rollback_result;

  -- Log the rollback
  UPDATE data_backup_logs
  SET
    rollback_count = rollback_count + 1,
    last_rollback_at = NOW(),
    rollback_reason = p_error_message
  WHERE backup_table = v_backup_table;

  -- Log failure
  INSERT INTO sync_failure_logs (
    data_type,
    operation,
    error_message,
    backup_available,
    backup_table_name,
    auto_recovery_attempted,
    recovery_successful
  ) VALUES (
    p_data_type,
    'sync',
    p_error_message,
    TRUE,
    v_backup_table,
    TRUE,
    TRUE
  );

  RETURN 'rollback_completed';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 5. ENHANCED BACKUP FUNCTION WITH AUTO-ROLLBACK
-- =============================================================================

-- Enhanced backup function that creates backup before sync operations
CREATE OR REPLACE FUNCTION backup_before_sync(
  p_data_type TEXT,
  p_table_name TEXT,
  p_triggered_by TEXT DEFAULT 'system'
)
RETURNS TEXT AS $$
DECLARE
  v_backup_table TEXT;
BEGIN
  -- Create backup with sync-specific suffix
  SELECT backup_table INTO v_backup_table
  FROM backup_table(p_table_name, '_sync_backup', p_triggered_by);

  RETURN v_backup_table;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 6. CLEANUP FUNCTIONS
-- =============================================================================

-- Clean up old retry queue items
CREATE OR REPLACE FUNCTION cleanup_old_retry_queue(
  p_days_to_keep INTEGER DEFAULT 7
)
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM sync_retry_queue
  WHERE status IN ('completed', 'failed', 'cancelled')
    AND updated_at < NOW() - (p_days_to_keep || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clean up expired locks
CREATE OR REPLACE FUNCTION cleanup_expired_retry_locks()
RETURNS INTEGER AS $$
DECLARE
  v_unlocked_count INTEGER;
BEGIN
  UPDATE sync_retry_queue
  SET
    status = 'pending',
    lock_token = NULL,
    lock_expires_at = NULL,
    updated_at = NOW()
  WHERE status = 'processing'
    AND lock_expires_at < NOW();

  GET DIAGNOSTICS v_unlocked_count = ROW_COUNT;
  RETURN v_unlocked_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 7. RLS POLICIES
-- =============================================================================

ALTER TABLE sync_retry_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_failure_logs ENABLE ROW LEVEL SECURITY;

-- Service role has full access
DROP POLICY IF EXISTS "Service role full access sync_retry_queue" ON sync_retry_queue;
CREATE POLICY "Service role full access sync_retry_queue"
  ON sync_retry_queue FOR ALL
  TO service_role
  USING (true);

DROP POLICY IF EXISTS "Service role full access sync_failure_logs" ON sync_failure_logs;
CREATE POLICY "Service role full access sync_failure_logs"
  ON sync_failure_logs FOR ALL
  TO service_role
  USING (true);

-- =============================================================================
-- 8. SCHEDULED CLEANUP
-- =============================================================================

-- Note: These would be called by cron jobs or scheduled functions
-- cleanup_old_retry_queue(7); -- Clean weekly
-- cleanup_expired_retry_locks(); -- Clean every hour

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

COMMENT ON TABLE sync_retry_queue IS 'Queue for managing failed sync retries with exponential backoff';
COMMENT ON TABLE sync_failure_logs IS 'Detailed logs of sync failures and recovery attempts';
COMMENT ON FUNCTION enqueue_sync_retry IS 'Enqueue a failed sync operation for retry';
COMMENT ON FUNCTION process_next_retry IS 'Get next retry item to process';
COMMENT ON FUNCTION complete_retry IS 'Mark retry as completed or schedule next attempt';
COMMENT ON FUNCTION trigger_empty_data_rollback IS 'Automatically rollback to last backup on empty data detection';
COMMENT ON FUNCTION backup_before_sync IS 'Create backup before sync operations for safety';

-- Grant necessary permissions
GRANT SELECT ON sync_retry_queue TO authenticated;
GRANT SELECT ON sync_failure_logs TO authenticated;