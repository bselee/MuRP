-- ═══════════════════════════════════════════════════════════════════════════
-- 🎯 AI GATEWAY INTEGRATION MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- This migration adds all necessary tables, columns, and functions for
-- Vercel AI Gateway integration with comprehensive usage tracking.
--
-- Features:
-- ✨ AI usage tracking table
-- ✨ Monthly usage counters on user profiles
-- ✨ Stored procedures for efficient counter updates
-- ✨ Indexes for optimal query performance
--
-- Migration: 015_ai_gateway_integration
-- Created: 2025-11-14
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1️⃣ Add usage tracking columns to user_compliance_profiles
-- ───────────────────────────────────────────────────────────────────────────

-- Add chat messages counter (for basic tier: 100/month limit)
ALTER TABLE user_compliance_profiles
ADD COLUMN IF NOT EXISTS chat_messages_this_month INTEGER DEFAULT 0;

-- Add last reset date (for monthly counter resets)
ALTER TABLE user_compliance_profiles
ADD COLUMN IF NOT EXISTS last_chat_reset_date TIMESTAMP DEFAULT NOW();

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_compliance_tier
ON user_compliance_profiles(compliance_tier);

CREATE INDEX IF NOT EXISTS idx_user_last_reset
ON user_compliance_profiles(last_chat_reset_date);

-- ───────────────────────────────────────────────────────────────────────────
-- 2️⃣ Create AI usage tracking table
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User and tier information
  user_id TEXT NOT NULL,
  compliance_tier TEXT NOT NULL CHECK (compliance_tier IN ('basic', 'full_ai')),

  -- Feature and model information
  feature_type TEXT NOT NULL CHECK (feature_type IN ('chat', 'compliance', 'vision', 'embedding')),
  model_used TEXT NOT NULL,

  -- Token usage
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,

  -- Cost tracking
  estimated_cost DECIMAL(10, 6) NOT NULL DEFAULT 0.00,

  -- Additional metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_usage_user_id ON ai_usage_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_created_at ON ai_usage_tracking(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_feature_type ON ai_usage_tracking(feature_type);
CREATE INDEX IF NOT EXISTS idx_usage_user_date ON ai_usage_tracking(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_tier ON ai_usage_tracking(compliance_tier);

-- Composite index for common queries (user + date range + feature)
CREATE INDEX IF NOT EXISTS idx_usage_user_date_feature
ON ai_usage_tracking(user_id, created_at DESC, feature_type);

-- Add Row Level Security
ALTER TABLE ai_usage_tracking ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own usage data
CREATE POLICY "Users can view own usage"
ON ai_usage_tracking FOR SELECT
USING (user_id = current_setting('app.user_id', true)::TEXT);

-- Policy: Service role can insert usage records
CREATE POLICY "Service can insert usage"
ON ai_usage_tracking FOR INSERT
WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 3️⃣ Create stored procedures for counter management
-- ───────────────────────────────────────────────────────────────────────────

-- Increment chat message counter
CREATE OR REPLACE FUNCTION increment_chat_messages(p_user_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE user_compliance_profiles
  SET chat_messages_this_month = COALESCE(chat_messages_this_month, 0) + 1
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Decrement trial checks (for basic tier compliance scans)
CREATE OR REPLACE FUNCTION decrement_trial_checks(p_user_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE user_compliance_profiles
  SET trial_checks_remaining = GREATEST(COALESCE(trial_checks_remaining, 0) - 1, 0)
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Increment compliance checks (for full AI tier)
CREATE OR REPLACE FUNCTION increment_compliance_checks(p_user_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE user_compliance_profiles
  SET checks_this_month = COALESCE(checks_this_month, 0) + 1,
      total_checks_lifetime = COALESCE(total_checks_lifetime, 0) + 1
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- ───────────────────────────────────────────────────────────────────────────
-- 4️⃣ Create aggregate functions for usage statistics
-- ───────────────────────────────────────────────────────────────────────────

-- Get monthly usage summary for a user
CREATE OR REPLACE FUNCTION get_monthly_usage_summary(
  p_user_id TEXT,
  p_start_date TIMESTAMP,
  p_end_date TIMESTAMP
)
RETURNS TABLE (
  total_requests BIGINT,
  total_tokens BIGINT,
  total_cost DECIMAL,
  chat_requests BIGINT,
  compliance_requests BIGINT,
  vision_requests BIGINT,
  embedding_requests BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_requests,
    SUM(total_tokens)::BIGINT as total_tokens,
    SUM(estimated_cost)::DECIMAL as total_cost,
    SUM(CASE WHEN feature_type = 'chat' THEN 1 ELSE 0 END)::BIGINT as chat_requests,
    SUM(CASE WHEN feature_type = 'compliance' THEN 1 ELSE 0 END)::BIGINT as compliance_requests,
    SUM(CASE WHEN feature_type = 'vision' THEN 1 ELSE 0 END)::BIGINT as vision_requests,
    SUM(CASE WHEN feature_type = 'embedding' THEN 1 ELSE 0 END)::BIGINT as embedding_requests
  FROM ai_usage_tracking
  WHERE user_id = p_user_id
    AND created_at >= p_start_date
    AND created_at <= p_end_date;
END;
$$ LANGUAGE plpgsql;

-- Get cost breakdown by feature
CREATE OR REPLACE FUNCTION get_cost_by_feature(
  p_user_id TEXT,
  p_start_date TIMESTAMP,
  p_end_date TIMESTAMP
)
RETURNS TABLE (
  feature_type TEXT,
  request_count BIGINT,
  total_cost DECIMAL,
  avg_cost_per_request DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    aut.feature_type,
    COUNT(*)::BIGINT as request_count,
    SUM(aut.estimated_cost)::DECIMAL as total_cost,
    AVG(aut.estimated_cost)::DECIMAL as avg_cost_per_request
  FROM ai_usage_tracking aut
  WHERE aut.user_id = p_user_id
    AND aut.created_at >= p_start_date
    AND aut.created_at <= p_end_date
  GROUP BY aut.feature_type
  ORDER BY total_cost DESC;
END;
$$ LANGUAGE plpgsql;

-- ───────────────────────────────────────────────────────────────────────────
-- 5️⃣ Create monthly reset trigger
-- ───────────────────────────────────────────────────────────────────────────

-- Function to automatically reset counters on first access of new month
CREATE OR REPLACE FUNCTION check_and_reset_monthly_counters()
RETURNS TRIGGER AS $$
DECLARE
  last_reset DATE;
  current_month DATE;
BEGIN
  last_reset := DATE(OLD.last_chat_reset_date);
  current_month := CURRENT_DATE;

  -- If we're in a new month, reset counters
  IF EXTRACT(MONTH FROM last_reset) != EXTRACT(MONTH FROM current_month)
     OR EXTRACT(YEAR FROM last_reset) != EXTRACT(YEAR FROM current_month) THEN

    NEW.chat_messages_this_month := 0;
    NEW.checks_this_month := 0;
    NEW.last_chat_reset_date := NOW();

    RAISE NOTICE 'Reset monthly counters for user %', NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: Trigger disabled for now, resets handled in application code via checkAndResetIfNeeded()
-- CREATE TRIGGER trigger_reset_monthly_counters
-- BEFORE UPDATE ON user_compliance_profiles
-- FOR EACH ROW
-- EXECUTE FUNCTION check_and_reset_monthly_counters();

-- ───────────────────────────────────────────────────────────────────────────
-- 6️⃣ Add helpful comments
-- ───────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE ai_usage_tracking IS
'Tracks all AI Gateway usage including tokens, costs, and feature attribution';

COMMENT ON COLUMN ai_usage_tracking.feature_type IS
'Type of AI feature: chat, compliance, vision, or embedding';

COMMENT ON COLUMN ai_usage_tracking.estimated_cost IS
'Estimated cost in USD based on token usage and model pricing';

COMMENT ON COLUMN user_compliance_profiles.chat_messages_this_month IS
'Counter for chat messages this month (100 limit for basic tier)';

COMMENT ON COLUMN user_compliance_profiles.last_chat_reset_date IS
'Last time monthly counters were reset (first day of month)';

-- ───────────────────────────────────────────────────────────────────────────
-- 7️⃣ Verify migration
-- ───────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  RAISE NOTICE '✅ AI Gateway Integration Migration Complete!';
  RAISE NOTICE '📊 Tables created: ai_usage_tracking';
  RAISE NOTICE '🔧 Functions created: increment_chat_messages, decrement_trial_checks, increment_compliance_checks';
  RAISE NOTICE '📈 Aggregate functions: get_monthly_usage_summary, get_cost_by_feature';
  RAISE NOTICE '🎯 Ready for beautiful AI tracking!';
END $$;
