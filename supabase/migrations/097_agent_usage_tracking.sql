-- Migration: 097_agent_usage_tracking.sql
-- Description: Add comprehensive agent usage and cost tracking
-- Date: 2025-12-13
-- ============================================================================
-- AGENT RUN HISTORY TABLE
-- ============================================================================
-- Track every agent execution with timing and cost metrics
CREATE TABLE IF NOT EXISTS agent_run_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Agent reference
    agent_identifier text NOT NULL REFERENCES agent_configs(agent_identifier),
    
    -- Execution details
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    duration_ms integer,
    
    -- Status
    status text NOT NULL DEFAULT 'running' CHECK (
        status IN ('running', 'completed', 'failed', 'cancelled')
    ),
    
    -- Results summary
    items_processed integer DEFAULT 0,
    alerts_generated integer DEFAULT 0,
    actions_taken integer DEFAULT 0,
    
    -- Cost tracking (if AI calls made)
    ai_calls_made integer DEFAULT 0,
    tokens_used integer DEFAULT 0,
    estimated_cost decimal(10, 6) DEFAULT 0,
    
    -- Output storage
    output_log text[],
    error_message text,
    result_summary jsonb,
    
    -- Triggered by
    trigger_type text CHECK (
        trigger_type IN ('manual', 'scheduled', 'event', 'system')
    ),
    triggered_by text, -- user_id or system identifier
    
    -- Metadata
    created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- ADD CUMULATIVE TRACKING TO AGENT_CONFIGS
-- ============================================================================
ALTER TABLE agent_configs 
ADD COLUMN IF NOT EXISTS total_runs integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS successful_runs integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS failed_runs integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_tokens_used bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_cost decimal(12, 6) DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_run_at timestamptz,
ADD COLUMN IF NOT EXISTS avg_duration_ms integer DEFAULT 0;

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_agent_run_history_agent ON agent_run_history(agent_identifier);
CREATE INDEX IF NOT EXISTS idx_agent_run_history_started ON agent_run_history(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_run_history_status ON agent_run_history(status);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE agent_run_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow authenticated users to read agent runs" ON agent_run_history;
DROP POLICY IF EXISTS "Allow authenticated users to insert agent runs" ON agent_run_history;
DROP POLICY IF EXISTS "Allow authenticated users to update agent runs" ON agent_run_history;

-- Allow authenticated users to read agent run history
CREATE POLICY "Allow authenticated users to read agent runs" ON agent_run_history 
FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to insert agent run records
CREATE POLICY "Allow authenticated users to insert agent runs" ON agent_run_history 
FOR INSERT TO authenticated WITH CHECK (true);

-- Allow authenticated users to update agent run records
CREATE POLICY "Allow authenticated users to update agent runs" ON agent_run_history 
FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- FUNCTION: Update agent config stats after run completes
-- ============================================================================
CREATE OR REPLACE FUNCTION update_agent_stats_on_run_complete()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update on status change to completed or failed
    IF NEW.status IN ('completed', 'failed') AND OLD.status = 'running' THEN
        UPDATE agent_configs
        SET 
            total_runs = total_runs + 1,
            successful_runs = CASE WHEN NEW.status = 'completed' THEN successful_runs + 1 ELSE successful_runs END,
            failed_runs = CASE WHEN NEW.status = 'failed' THEN failed_runs + 1 ELSE failed_runs END,
            total_tokens_used = total_tokens_used + COALESCE(NEW.tokens_used, 0),
            total_cost = total_cost + COALESCE(NEW.estimated_cost, 0),
            last_run_at = NEW.completed_at,
            avg_duration_ms = (
                (avg_duration_ms * (total_runs) + COALESCE(NEW.duration_ms, 0)) / (total_runs + 1)
            ),
            updated_at = now()
        WHERE agent_identifier = NEW.agent_identifier;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_agent_stats ON agent_run_history;
CREATE TRIGGER trigger_update_agent_stats
    AFTER UPDATE ON agent_run_history
    FOR EACH ROW
    EXECUTE FUNCTION update_agent_stats_on_run_complete();

-- ============================================================================
-- VIEW: Agent Usage Summary
-- ============================================================================
CREATE OR REPLACE VIEW agent_usage_summary AS
SELECT 
    ac.agent_identifier,
    ac.display_name,
    ac.autonomy_level,
    ac.is_active,
    ac.trust_score,
    ac.total_runs,
    ac.successful_runs,
    ac.failed_runs,
    CASE WHEN ac.total_runs > 0 
        THEN ROUND((ac.successful_runs::decimal / ac.total_runs) * 100, 1) 
        ELSE 0 
    END as success_rate_pct,
    ac.total_tokens_used,
    ac.total_cost,
    ac.avg_duration_ms,
    ac.last_run_at,
    -- Last 24h stats
    (
        SELECT COUNT(*) 
        FROM agent_run_history arh 
        WHERE arh.agent_identifier = ac.agent_identifier 
        AND arh.started_at > now() - interval '24 hours'
    ) as runs_last_24h,
    (
        SELECT COALESCE(SUM(estimated_cost), 0) 
        FROM agent_run_history arh 
        WHERE arh.agent_identifier = ac.agent_identifier 
        AND arh.started_at > now() - interval '24 hours'
    ) as cost_last_24h,
    -- Last 7d stats
    (
        SELECT COUNT(*) 
        FROM agent_run_history arh 
        WHERE arh.agent_identifier = ac.agent_identifier 
        AND arh.started_at > now() - interval '7 days'
    ) as runs_last_7d,
    (
        SELECT COALESCE(SUM(estimated_cost), 0) 
        FROM agent_run_history arh 
        WHERE arh.agent_identifier = ac.agent_identifier 
        AND arh.started_at > now() - interval '7 days'
    ) as cost_last_7d
FROM agent_configs ac
ORDER BY ac.total_runs DESC;

COMMENT ON VIEW agent_usage_summary IS 'Comprehensive agent usage and cost summary';
