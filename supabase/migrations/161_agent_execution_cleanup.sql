-- Migration 161: Agent Execution Cleanup & Monitoring
--
-- Fixes the issue of agent executions stuck at "running" status indefinitely.
-- Adds automatic cleanup of stale entries and monitoring functions.

-- ============================================================================
-- FUNCTION: Clean up stuck agent executions
-- Marks executions that have been "running" for too long as "failed"
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_stuck_agent_executions(
    p_max_age_hours INTEGER DEFAULT 2,  -- Executions older than this are stuck
    p_dry_run BOOLEAN DEFAULT FALSE     -- If true, just report what would be cleaned
)
RETURNS TABLE (
    cleaned_count INTEGER,
    cleaned_ids UUID[]
) AS $$
DECLARE
    v_cutoff TIMESTAMPTZ;
    v_cleaned_ids UUID[];
    v_count INTEGER;
BEGIN
    v_cutoff := NOW() - (p_max_age_hours || ' hours')::INTERVAL;

    IF p_dry_run THEN
        -- Just return count and IDs that would be cleaned
        SELECT
            COUNT(*)::INTEGER,
            ARRAY_AGG(id)
        INTO v_count, v_cleaned_ids
        FROM agent_execution_log
        WHERE status = 'running'
          AND started_at < v_cutoff;

        RETURN QUERY SELECT COALESCE(v_count, 0), COALESCE(v_cleaned_ids, ARRAY[]::UUID[]);
        RETURN;
    END IF;

    -- Actually clean up stuck entries
    WITH updated AS (
        UPDATE agent_execution_log
        SET
            status = 'failed',
            outcome = 'failed',
            completed_at = NOW(),
            duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
            error = 'Execution timed out - marked as failed by automatic cleanup',
            updated_at = NOW()
        WHERE status = 'running'
          AND started_at < v_cutoff
        RETURNING id
    )
    SELECT
        COUNT(*)::INTEGER,
        ARRAY_AGG(id)
    INTO v_count, v_cleaned_ids
    FROM updated;

    -- Also clean up agent_run_history table (legacy table)
    UPDATE agent_run_history
    SET
        status = 'failed',
        completed_at = NOW(),
        duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
        error_message = 'Execution timed out - marked as failed by automatic cleanup'
    WHERE status = 'running'
      AND started_at < v_cutoff;

    RETURN QUERY SELECT COALESCE(v_count, 0), COALESCE(v_cleaned_ids, ARRAY[]::UUID[]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_stuck_agent_executions IS
    'Marks agent executions stuck at "running" status as "failed". Use dry_run=true to preview.';

-- ============================================================================
-- ADD updated_at COLUMN IF MISSING
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agent_execution_log' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE agent_execution_log ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- ============================================================================
-- VIEW: Agent execution health status
-- Shows recent execution stats and alerts on stuck entries
-- ============================================================================

CREATE OR REPLACE VIEW agent_execution_health AS
WITH recent_executions AS (
    SELECT
        agent_identifier,
        status,
        outcome,
        started_at,
        completed_at,
        duration_ms,
        error
    FROM agent_execution_log
    WHERE started_at > NOW() - INTERVAL '7 days'
),
stuck_executions AS (
    SELECT COUNT(*) as stuck_count
    FROM agent_execution_log
    WHERE status = 'running'
      AND started_at < NOW() - INTERVAL '2 hours'
)
SELECT
    -- Execution counts
    (SELECT COUNT(*) FROM recent_executions) as total_executions_7d,
    (SELECT COUNT(*) FROM recent_executions WHERE outcome = 'success') as successful_7d,
    (SELECT COUNT(*) FROM recent_executions WHERE outcome = 'failed') as failed_7d,
    (SELECT COUNT(*) FROM recent_executions WHERE status = 'running') as currently_running,
    (SELECT stuck_count FROM stuck_executions) as stuck_executions,

    -- Success rate
    CASE
        WHEN (SELECT COUNT(*) FROM recent_executions WHERE outcome IS NOT NULL) > 0
        THEN ROUND(
            (SELECT COUNT(*)::DECIMAL FROM recent_executions WHERE outcome = 'success') /
            (SELECT COUNT(*)::DECIMAL FROM recent_executions WHERE outcome IS NOT NULL) * 100,
            1
        )
        ELSE 0
    END as success_rate_percent,

    -- Avg duration
    (SELECT AVG(duration_ms) FROM recent_executions WHERE duration_ms IS NOT NULL)::INTEGER as avg_duration_ms,

    -- Last execution
    (SELECT MAX(started_at) FROM recent_executions) as last_execution_at,

    -- Health status
    CASE
        WHEN (SELECT stuck_count FROM stuck_executions) > 5 THEN 'critical'
        WHEN (SELECT stuck_count FROM stuck_executions) > 0 THEN 'warning'
        WHEN (SELECT COUNT(*) FROM recent_executions WHERE outcome = 'failed') >
             (SELECT COUNT(*) FROM recent_executions WHERE outcome = 'success') THEN 'warning'
        ELSE 'healthy'
    END as health_status;

COMMENT ON VIEW agent_execution_health IS
    'Summary view of agent execution health with stuck execution detection';

-- ============================================================================
-- FUNCTION: Get agent activity summary with actual results
-- Provides detailed breakdown of what agents actually did
-- ============================================================================

CREATE OR REPLACE FUNCTION get_agent_activity_details(
    p_hours INTEGER DEFAULT 24,
    p_agent_identifier TEXT DEFAULT NULL
)
RETURNS TABLE (
    agent_identifier TEXT,
    agent_name TEXT,
    total_runs INTEGER,
    successful_runs INTEGER,
    failed_runs INTEGER,
    actions_generated INTEGER,
    actions_executed INTEGER,
    actions_rejected INTEGER,
    avg_duration_ms INTEGER,
    last_run_at TIMESTAMPTZ,
    last_outcome TEXT,
    sample_results JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ael.agent_identifier,
        INITCAP(REPLACE(REPLACE(ael.agent_identifier, '_', ' '), '-', ' ')) as agent_name,
        COUNT(*)::INTEGER as total_runs,
        COUNT(*) FILTER (WHERE ael.outcome = 'success')::INTEGER as successful_runs,
        COUNT(*) FILTER (WHERE ael.outcome = 'failed')::INTEGER as failed_runs,
        COALESCE(SUM(ael.actions_generated)::INTEGER, 0) as actions_generated,
        COALESCE(SUM(ael.actions_executed)::INTEGER, 0) as actions_executed,
        COALESCE(SUM(ael.actions_rejected)::INTEGER, 0) as actions_rejected,
        COALESCE(AVG(ael.duration_ms)::INTEGER, 0) as avg_duration_ms,
        MAX(ael.started_at) as last_run_at,
        (SELECT outcome FROM agent_execution_log sub
         WHERE sub.agent_identifier = ael.agent_identifier
         ORDER BY started_at DESC LIMIT 1) as last_outcome,
        -- Get sample of recent results
        (SELECT jsonb_agg(
            jsonb_build_object(
                'started_at', sub.started_at,
                'outcome', sub.outcome,
                'actions', sub.actions_executed,
                'duration_ms', sub.duration_ms
            )
         ) FROM (
            SELECT started_at, outcome, actions_executed, duration_ms
            FROM agent_execution_log sub2
            WHERE sub2.agent_identifier = ael.agent_identifier
            ORDER BY started_at DESC
            LIMIT 3
         ) sub
        ) as sample_results
    FROM agent_execution_log ael
    WHERE ael.started_at > NOW() - (p_hours || ' hours')::INTERVAL
      AND (p_agent_identifier IS NULL OR ael.agent_identifier = p_agent_identifier)
    GROUP BY ael.agent_identifier
    ORDER BY MAX(ael.started_at) DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_agent_activity_details IS
    'Returns detailed activity summary per agent with actual results and sample outputs';

-- ============================================================================
-- CRON JOB: Auto-cleanup stuck executions every hour
-- ============================================================================

DO $$
BEGIN
    -- Remove existing job if present
    PERFORM cron.unschedule('cleanup-stuck-executions');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'cleanup-stuck-executions',
    '0 * * * *',  -- Every hour at minute 0
    $$SELECT cleanup_stuck_agent_executions(2, FALSE)$$
);

-- ============================================================================
-- INITIAL CLEANUP: Clean any currently stuck entries
-- ============================================================================

-- Run cleanup with 2-hour threshold
SELECT * FROM cleanup_stuck_agent_executions(2, FALSE);

-- ============================================================================
-- GRANT ACCESS
-- ============================================================================

GRANT EXECUTE ON FUNCTION cleanup_stuck_agent_executions TO authenticated;
GRANT EXECUTE ON FUNCTION get_agent_activity_details TO authenticated;
