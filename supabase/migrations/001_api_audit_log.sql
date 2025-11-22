-- Migration: API Audit Log
-- Description: Creates tables for tracking API usage, costs, and security events
-- Author: TGF MRP Team
-- Date: 2025-10-31

-- ============================================================================
-- API Audit Log Table
-- ============================================================================
-- Tracks every API request made through the secure proxy
-- Used for security monitoring, debugging, and cost tracking

CREATE TABLE IF NOT EXISTS api_audit_log (
  id BIGSERIAL PRIMARY KEY,
  
  -- Request identification
  request_id UUID NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- User information
  user_id UUID NOT NULL,
  
  -- Request details
  service VARCHAR(50) NOT NULL,           -- 'finale', 'gemini', etc.
  action VARCHAR(100) NOT NULL,           -- 'pullInventory', 'generateText', etc.
  
  -- Execution details
  success BOOLEAN NOT NULL,
  execution_time_ms INTEGER NOT NULL,
  error_message TEXT,
  response_size_bytes INTEGER,
  
  -- Cost tracking (optional)
  estimated_cost_usd DECIMAL(10, 6),
  
  -- Metadata
  ip_address INET,
  user_agent TEXT,
  
  -- Indexes for common queries
  CONSTRAINT api_audit_log_service_check CHECK (service IN ('finale', 'gemini', 'supabase', 'other'))
);

-- Indexes for performance
CREATE INDEX idx_api_audit_log_timestamp ON api_audit_log(timestamp DESC);
CREATE INDEX idx_api_audit_log_user_id ON api_audit_log(user_id);
CREATE INDEX idx_api_audit_log_service ON api_audit_log(service);
CREATE INDEX idx_api_audit_log_success ON api_audit_log(success);
CREATE INDEX idx_api_audit_log_request_id ON api_audit_log(request_id);

-- Composite index for user activity reports
CREATE INDEX idx_api_audit_log_user_timestamp ON api_audit_log(user_id, timestamp DESC);

-- ============================================================================
-- API Rate Limit Tracking
-- ============================================================================
-- Tracks rate limit consumption for monitoring and alerting

CREATE TABLE IF NOT EXISTS api_rate_limit_tracking (
  id BIGSERIAL PRIMARY KEY,
  
  user_id UUID NOT NULL,
  service VARCHAR(50) NOT NULL,
  
  -- Time window
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  
  -- Usage counters
  request_count INTEGER NOT NULL DEFAULT 0,
  limit_hit_count INTEGER NOT NULL DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rate_limit_tracking_user_window ON api_rate_limit_tracking(user_id, window_start DESC);

-- ============================================================================
-- Secure Credentials Vault (optional - use Supabase Vault in production)
-- ============================================================================
-- Only used if Supabase Vault is not available
-- This table should have Row Level Security (RLS) enabled

CREATE TABLE IF NOT EXISTS vault (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,     -- 'finale_credentials', 'gemini_api_key', etc.
  secret TEXT NOT NULL,                   -- Encrypted JSON or string
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);

-- Only service role can access vault
ALTER TABLE vault ENABLE ROW LEVEL SECURITY;

CREATE POLICY vault_service_role_only ON vault
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- API Cost Summary View
-- ============================================================================
-- Aggregated view for cost monitoring dashboard

CREATE OR REPLACE VIEW api_cost_summary AS
SELECT
  DATE_TRUNC('day', timestamp) AS date,
  service,
  COUNT(*) AS total_requests,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) AS successful_requests,
  SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) AS failed_requests,
  AVG(execution_time_ms) AS avg_execution_time_ms,
  SUM(estimated_cost_usd) AS total_cost_usd
FROM api_audit_log
GROUP BY DATE_TRUNC('day', timestamp), service
ORDER BY date DESC, service;

-- ============================================================================
-- User API Usage View
-- ============================================================================
-- Per-user usage statistics

CREATE OR REPLACE VIEW user_api_usage AS
SELECT
  user_id,
  service,
  COUNT(*) AS total_requests,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) AS successful_requests,
  SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) AS failed_requests,
  AVG(execution_time_ms) AS avg_execution_time_ms,
  MAX(timestamp) AS last_request_at
FROM api_audit_log
GROUP BY user_id, service;

-- ============================================================================
-- Functions
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_audit_logs(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM api_audit_log
  WHERE timestamp < NOW() - INTERVAL '1 day' * days_to_keep;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get rate limit status for a user
CREATE OR REPLACE FUNCTION get_rate_limit_status(
  p_user_id UUID,
  p_service VARCHAR(50),
  p_window_minutes INTEGER DEFAULT 60
)
RETURNS TABLE (
  request_count BIGINT,
  limit_remaining INTEGER,
  window_reset_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS request_count,
    GREATEST(0, 60 - COUNT(*)::INTEGER) AS limit_remaining,
    (NOW() + INTERVAL '1 minute' * p_window_minutes)::TIMESTAMPTZ AS window_reset_at
  FROM api_audit_log
  WHERE
    user_id = p_user_id
    AND service = p_service
    AND timestamp > NOW() - INTERVAL '1 minute' * p_window_minutes;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE api_audit_log IS 'Comprehensive audit trail of all API requests through the secure proxy';
COMMENT ON TABLE api_rate_limit_tracking IS 'Tracks rate limit consumption for monitoring and alerting';
COMMENT ON TABLE vault IS 'Secure storage for API credentials and secrets (use Supabase Vault in production)';
COMMENT ON VIEW api_cost_summary IS 'Daily aggregated API costs and usage statistics';
COMMENT ON VIEW user_api_usage IS 'Per-user API usage statistics';

-- ============================================================================
-- Grants (adjust based on your setup)
-- ============================================================================

-- Grant read access to audit logs for authenticated users (their own logs only)
GRANT SELECT ON api_audit_log TO authenticated;

-- Create RLS policy for users to see only their own logs
ALTER TABLE api_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_audit_log_select ON api_audit_log
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can see all logs
CREATE POLICY admin_audit_log_all ON api_audit_log
  FOR ALL
  TO authenticated
  USING (
    auth.jwt() ->> 'role' = 'admin'
    OR auth.jwt() ->> 'role' = 'service_role'
  );
