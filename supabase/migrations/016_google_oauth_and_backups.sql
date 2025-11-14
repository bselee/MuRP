-- Migration: Google OAuth Tokens and Backup Functions
-- Description: Adds OAuth token storage and database backup/rollback functions
-- Date: 2025-11-14

-- =============================================================================
-- 1. OAUTH TOKENS TABLE
-- =============================================================================
-- Stores encrypted OAuth tokens for Google APIs (server-side only)
CREATE TABLE IF NOT EXISTS user_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  provider TEXT NOT NULL, -- 'google', 'microsoft', etc.
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  scopes TEXT[],
  token_type TEXT DEFAULT 'Bearer',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user ON user_oauth_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_provider ON user_oauth_tokens(provider);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expires ON user_oauth_tokens(expires_at);

-- Row Level Security
ALTER TABLE user_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only access their own tokens
CREATE POLICY "Users access own OAuth tokens"
  ON user_oauth_tokens FOR ALL
  USING (user_id = auth.uid()::uuid);

-- =============================================================================
-- 2. DATA BACKUP LOGS TABLE
-- =============================================================================
-- Tracks backup operations for audit trail
CREATE TABLE IF NOT EXISTS data_backup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_name TEXT NOT NULL,
  source_table TEXT NOT NULL,
  backup_table TEXT NOT NULL,
  row_count INTEGER,
  backup_size_bytes BIGINT,
  triggered_by TEXT,
  trigger_reason TEXT, -- 'manual', 'pre_sync', 'scheduled'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_logs_source ON data_backup_logs(source_table);
CREATE INDEX IF NOT EXISTS idx_backup_logs_created ON data_backup_logs(created_at DESC);

-- =============================================================================
-- 3. BACKUP TABLE FUNCTION
-- =============================================================================
-- Creates a timestamped backup of any table
CREATE OR REPLACE FUNCTION backup_table(
  p_source_table TEXT,
  p_backup_suffix TEXT DEFAULT NULL,
  p_triggered_by TEXT DEFAULT NULL
)
RETURNS TABLE(
  backup_table_name TEXT,
  rows_backed_up INTEGER
) AS $$
DECLARE
  v_backup_table TEXT;
  v_row_count INTEGER;
  v_timestamp TEXT;
BEGIN
  -- Generate backup table name
  v_timestamp := TO_CHAR(NOW(), 'YYYY_MM_DD_HH24_MI_SS');
  IF p_backup_suffix IS NOT NULL THEN
    v_backup_table := p_source_table || '_backup_' || p_backup_suffix || '_' || v_timestamp;
  ELSE
    v_backup_table := p_source_table || '_backup_' || v_timestamp;
  END IF;

  -- Create backup table as copy of source
  EXECUTE format('CREATE TABLE %I AS TABLE %I', v_backup_table, p_source_table);
  
  -- Get row count
  EXECUTE format('SELECT COUNT(*) FROM %I', v_backup_table) INTO v_row_count;

  -- Log the backup
  INSERT INTO data_backup_logs (
    backup_name,
    source_table,
    backup_table,
    row_count,
    triggered_by,
    trigger_reason
  ) VALUES (
    v_backup_table,
    p_source_table,
    v_backup_table,
    v_row_count,
    p_triggered_by,
    'manual'
  );

  -- Return result
  backup_table_name := v_backup_table;
  rows_backed_up := v_row_count;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 4. ROLLBACK FROM BACKUP FUNCTION
-- =============================================================================
-- Restores data from a backup table
CREATE OR REPLACE FUNCTION rollback_from_backup(
  p_target_table TEXT,
  p_backup_table TEXT
)
RETURNS TABLE(
  rows_restored INTEGER,
  rows_deleted INTEGER
) AS $$
DECLARE
  v_restored_count INTEGER;
  v_deleted_count INTEGER;
BEGIN
  -- Verify backup table exists
  IF NOT EXISTS (SELECT FROM pg_tables WHERE tablename = p_backup_table) THEN
    RAISE EXCEPTION 'Backup table % does not exist', p_backup_table;
  END IF;

  -- Get current row count before deletion
  EXECUTE format('SELECT COUNT(*) FROM %I', p_target_table) INTO v_deleted_count;

  -- Clear target table
  EXECUTE format('TRUNCATE TABLE %I', p_target_table);

  -- Restore from backup
  EXECUTE format('INSERT INTO %I SELECT * FROM %I', p_target_table, p_backup_table);
  
  -- Get restored count
  GET DIAGNOSTICS v_restored_count = ROW_COUNT;

  -- Return results
  rows_restored := v_restored_count;
  rows_deleted := v_deleted_count;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 5. LIST AVAILABLE BACKUPS FUNCTION
-- =============================================================================
-- Returns list of backup tables for a given source table
CREATE OR REPLACE FUNCTION list_backups(
  p_source_table TEXT
)
RETURNS TABLE(
  backup_table TEXT,
  row_count INTEGER,
  created_at TIMESTAMPTZ,
  triggered_by TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    backup_table,
    data_backup_logs.row_count,
    data_backup_logs.created_at,
    data_backup_logs.triggered_by
  FROM data_backup_logs
  WHERE source_table = p_source_table
  ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 6. CLEANUP OLD BACKUPS FUNCTION
-- =============================================================================
-- Removes backup tables older than specified days
CREATE OR REPLACE FUNCTION cleanup_old_backups(
  p_days_to_keep INTEGER DEFAULT 30
)
RETURNS TABLE(
  deleted_backup TEXT,
  deleted_at TIMESTAMPTZ
) AS $$
DECLARE
  v_backup RECORD;
BEGIN
  FOR v_backup IN 
    SELECT backup_table, created_at
    FROM data_backup_logs
    WHERE created_at < NOW() - (p_days_to_keep || ' days')::INTERVAL
  LOOP
    -- Drop the backup table if it exists
    EXECUTE format('DROP TABLE IF EXISTS %I', v_backup.backup_table);
    
    -- Delete from logs
    DELETE FROM data_backup_logs WHERE backup_table = v_backup.backup_table;
    
    -- Return result
    deleted_backup := v_backup.backup_table;
    deleted_at := NOW();
    RETURN NEXT;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 7. UPDATED_AT TRIGGER
-- =============================================================================
DROP TRIGGER IF EXISTS update_oauth_tokens_updated_at ON user_oauth_tokens;
CREATE TRIGGER update_oauth_tokens_updated_at BEFORE UPDATE ON user_oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- COMMENTS
-- =============================================================================
COMMENT ON TABLE user_oauth_tokens IS 'Encrypted OAuth tokens for third-party integrations (Google, Microsoft, etc.)';
COMMENT ON TABLE data_backup_logs IS 'Audit log of database backup operations';
COMMENT ON FUNCTION backup_table IS 'Creates timestamped backup of specified table';
COMMENT ON FUNCTION rollback_from_backup IS 'Restores data from backup table to target table';
COMMENT ON FUNCTION list_backups IS 'Lists all available backups for a source table';
COMMENT ON FUNCTION cleanup_old_backups IS 'Removes backup tables older than specified days';
