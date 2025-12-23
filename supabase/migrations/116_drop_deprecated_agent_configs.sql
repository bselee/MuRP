-- Migration 116: Drop deprecated agent_configs table
-- 
-- ARCHITECTURE DECISION: agent_definitions is the SINGLE SOURCE OF TRUTH
-- 
-- The agent_configs table was created for workflow orchestration but has been
-- superseded by agent_definitions which provides a unified agent registry.
-- 
-- Workflow orchestrator now reads from agent_definitions.identifier
-- Agent Command Center now reads from agent_definitions
-- 
-- This migration removes the redundant agent_configs table and its dependencies.

-- Step 1: Drop views that depend on agent_configs
DROP VIEW IF EXISTS public.agent_usage_summary CASCADE;
DROP VIEW IF EXISTS public.email_tracking_agent_stats CASCADE;

-- Step 2: Drop foreign key constraint from agent_run_history
ALTER TABLE IF EXISTS public.agent_run_history 
    DROP CONSTRAINT IF EXISTS agent_run_history_agent_identifier_fkey;

-- Step 3: Drop the deprecated agent_configs table and its policies
DROP POLICY IF EXISTS agent_configs_admin ON public.agent_configs;
DROP POLICY IF EXISTS agent_configs_view ON public.agent_configs;
DROP TABLE IF EXISTS public.agent_configs;

-- Step 4: Recreate the views using agent_definitions instead
CREATE OR REPLACE VIEW public.agent_usage_summary AS
SELECT 
    ad.identifier as agent_identifier,
    ad.name as display_name,
    ad.autonomy_level,
    ad.trust_score,
    ad.is_active,
    COALESCE(stats.total_runs, 0) as total_runs,
    COALESCE(stats.successful_runs, 0) as successful_runs,
    COALESCE(stats.failed_runs, 0) as failed_runs,
    COALESCE(stats.avg_duration_ms, 0) as avg_duration_ms,
    stats.last_run_at
FROM public.agent_definitions ad
LEFT JOIN (
    SELECT 
        agent_identifier,
        COUNT(*) as total_runs,
        COUNT(*) FILTER (WHERE status = 'completed') as successful_runs,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_runs,
        AVG(duration_ms) as avg_duration_ms,
        MAX(created_at) as last_run_at
    FROM public.agent_run_history
    GROUP BY agent_identifier
) stats ON ad.identifier = stats.agent_identifier;

-- Step 5: Add comment to agent_definitions documenting it as single source of truth
COMMENT ON TABLE public.agent_definitions IS 
'Single source of truth for all agents in the system.
Used by: Agent Command Center UI, workflowOrchestrator.ts, agentManagementService.ts
Identifiers use kebab-case (e.g., stockout-prevention, email-tracking-specialist)
Built-in agents are seeded via migration 113 and marked with is_built_in=true';

-- Step 6: Grant access to the new view
GRANT SELECT ON public.agent_usage_summary TO authenticated;
GRANT SELECT ON public.agent_usage_summary TO anon;
