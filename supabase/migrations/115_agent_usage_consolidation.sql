-- Migration: 115_agent_usage_consolidation.sql
-- Purpose: Add usage tracking columns to agent_definitions and provide
-- backward compatibility for code still using agent_configs table name.
--
-- This completes the consolidation started in migration 114 by:
--   1. Adding usage tracking columns to agent_definitions
--   2. Creating trigger to update usage stats
--   3. Creating a view 'agent_configs_compat' for backward compatibility
--   4. Adding last_used_at column for tracking recent activity
--
-- After this migration, agent_definitions is the ONLY table for agents.
-- ============================================================

-- ============================================================
-- ADD USAGE TRACKING COLUMNS TO agent_definitions
-- ============================================================

ALTER TABLE public.agent_definitions
ADD COLUMN IF NOT EXISTS total_runs INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS successful_runs INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_tokens_used BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_cost DECIMAL(12, 6) DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_duration_ms INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS emails_processed INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS emails_correlated INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

-- Add index for last_used_at queries
CREATE INDEX IF NOT EXISTS idx_agent_definitions_last_used ON public.agent_definitions(last_used_at DESC NULLS LAST);

-- ============================================================
-- TRIGGER: Update agent stats after agent_run_history insert
-- ============================================================

CREATE OR REPLACE FUNCTION update_agent_definition_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update if we have a completed run (ended_at is set)
    IF NEW.ended_at IS NOT NULL THEN
        UPDATE public.agent_definitions
        SET
            total_runs = total_runs + 1,
            successful_runs = CASE WHEN NEW.success THEN successful_runs + 1 ELSE successful_runs END,
            total_tokens_used = total_tokens_used + COALESCE(NEW.tokens_used, 0),
            total_cost = total_cost + COALESCE(NEW.estimated_cost, 0),
            avg_duration_ms = CASE
                WHEN total_runs > 0 THEN
                    ((avg_duration_ms * total_runs) + COALESCE(NEW.duration_ms, 0)) / (total_runs + 1)
                ELSE
                    COALESCE(NEW.duration_ms, 0)
            END,
            last_used_at = COALESCE(NEW.ended_at, now()),
            updated_at = now()
        WHERE identifier = NEW.agent_identifier;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on agent_run_history if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_run_history' AND table_schema = 'public') THEN
        DROP TRIGGER IF EXISTS agent_run_updates_definition ON public.agent_run_history;
        CREATE TRIGGER agent_run_updates_definition
        AFTER INSERT OR UPDATE ON public.agent_run_history
        FOR EACH ROW EXECUTE FUNCTION update_agent_definition_stats();
    END IF;
END $$;

-- ============================================================
-- BACKWARD COMPATIBILITY VIEW: agent_configs_compat
-- ============================================================
-- This view provides a compatible interface for code that still
-- expects the agent_configs schema. It maps to agent_definitions.

CREATE OR REPLACE VIEW public.agent_configs_compat AS
SELECT
    id,
    identifier AS agent_identifier,
    name AS display_name,
    description,
    autonomy_level,
    is_active,
    trust_score,
    parameters,
    system_prompt,
    total_runs,
    successful_runs,
    total_tokens_used,
    total_cost,
    avg_duration_ms,
    emails_processed,
    emails_correlated,
    last_used_at,
    created_at,
    updated_at
FROM public.agent_definitions;

COMMENT ON VIEW public.agent_configs_compat IS
'Backward compatibility view for agent_configs. Maps to agent_definitions table.
Use agent_definitions directly for new code.';

-- ============================================================
-- AGENT USAGE STATS VIEW
-- ============================================================
-- Provides a summary of agent usage with calculated metrics

CREATE OR REPLACE VIEW public.agent_usage_stats AS
SELECT
    ad.identifier,
    ad.name,
    ad.category,
    ad.autonomy_level,
    ad.is_active,
    ad.trust_score,
    ad.total_runs,
    ad.successful_runs,
    CASE
        WHEN ad.total_runs > 0
        THEN ROUND((ad.successful_runs::decimal / ad.total_runs) * 100, 1)
        ELSE 0
    END AS success_rate,
    ad.total_tokens_used,
    ad.total_cost,
    ad.avg_duration_ms,
    ad.emails_processed,
    ad.emails_correlated,
    CASE
        WHEN ad.emails_processed > 0
        THEN ROUND((ad.emails_correlated::decimal / ad.emails_processed) * 100, 1)
        ELSE 0
    END AS email_correlation_rate,
    ad.last_used_at,
    CASE
        WHEN ad.last_used_at IS NULL THEN 'never'
        WHEN ad.last_used_at > now() - INTERVAL '1 hour' THEN 'active'
        WHEN ad.last_used_at > now() - INTERVAL '24 hours' THEN 'recent'
        WHEN ad.last_used_at > now() - INTERVAL '7 days' THEN 'this_week'
        ELSE 'stale'
    END AS activity_status
FROM public.agent_definitions ad
WHERE ad.is_active = true
ORDER BY ad.total_runs DESC, ad.name;

COMMENT ON VIEW public.agent_usage_stats IS
'Agent usage statistics with calculated metrics like success rate and activity status.';

-- ============================================================
-- MIGRATE DATA FROM agent_configs IF IT HAS USAGE DATA
-- ============================================================
-- Copy usage stats from agent_configs to agent_definitions if they exist

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'agent_configs' AND table_schema = 'public'
    ) THEN
        -- Update agent_definitions with usage stats from agent_configs
        -- Map snake_case identifiers to kebab-case
        UPDATE public.agent_definitions ad
        SET
            total_runs = COALESCE(ac.total_runs, ad.total_runs),
            successful_runs = COALESCE(ac.successful_runs, ad.successful_runs),
            total_tokens_used = COALESCE(ac.total_tokens_used, ad.total_tokens_used),
            total_cost = COALESCE(ac.total_cost, ad.total_cost),
            avg_duration_ms = COALESCE(ac.avg_duration_ms, ad.avg_duration_ms),
            emails_processed = COALESCE(ac.emails_processed, ad.emails_processed),
            emails_correlated = COALESCE(ac.emails_correlated, ad.emails_correlated),
            updated_at = now()
        FROM public.agent_configs ac
        WHERE
            -- Match by identifier (convert snake_case to kebab-case)
            ad.identifier = REPLACE(ac.agent_identifier, '_', '-')
            OR ad.identifier = ac.agent_identifier;

        RAISE NOTICE 'Migrated usage stats from agent_configs to agent_definitions';
    END IF;
END $$;

-- ============================================================
-- RPC FUNCTIONS FOR USAGE TRACKING
-- ============================================================

-- Function to increment email processing stats
CREATE OR REPLACE FUNCTION increment_agent_emails_processed(
    p_agent_identifier TEXT,
    p_emails_processed INTEGER DEFAULT 0,
    p_emails_correlated INTEGER DEFAULT 0
)
RETURNS void AS $$
BEGIN
    UPDATE public.agent_definitions
    SET
        emails_processed = emails_processed + p_emails_processed,
        emails_correlated = emails_correlated + p_emails_correlated,
        last_used_at = now(),
        updated_at = now()
    WHERE identifier = p_agent_identifier;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record an agent run completion
CREATE OR REPLACE FUNCTION record_agent_run(
    p_agent_identifier TEXT,
    p_success BOOLEAN DEFAULT true,
    p_tokens_used INTEGER DEFAULT 0,
    p_cost DECIMAL DEFAULT 0,
    p_duration_ms INTEGER DEFAULT 0
)
RETURNS void AS $$
BEGIN
    UPDATE public.agent_definitions
    SET
        total_runs = total_runs + 1,
        successful_runs = CASE WHEN p_success THEN successful_runs + 1 ELSE successful_runs END,
        total_tokens_used = total_tokens_used + COALESCE(p_tokens_used, 0),
        total_cost = total_cost + COALESCE(p_cost, 0),
        avg_duration_ms = CASE
            WHEN total_runs > 0 THEN
                ((avg_duration_ms * total_runs) + COALESCE(p_duration_ms, 0)) / (total_runs + 1)
            ELSE
                COALESCE(p_duration_ms, 0)
        END,
        last_used_at = now(),
        updated_at = now()
    WHERE identifier = p_agent_identifier;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON COLUMN public.agent_definitions.total_runs IS 'Total number of times this agent has been executed';
COMMENT ON COLUMN public.agent_definitions.successful_runs IS 'Number of successful executions';
COMMENT ON COLUMN public.agent_definitions.total_tokens_used IS 'Total AI tokens consumed by this agent';
COMMENT ON COLUMN public.agent_definitions.total_cost IS 'Estimated total cost in USD for this agent';
COMMENT ON COLUMN public.agent_definitions.avg_duration_ms IS 'Average execution duration in milliseconds';
COMMENT ON COLUMN public.agent_definitions.emails_processed IS 'Number of emails processed (for email tracking agent)';
COMMENT ON COLUMN public.agent_definitions.emails_correlated IS 'Number of emails correlated to POs (for email tracking agent)';
COMMENT ON COLUMN public.agent_definitions.last_used_at IS 'Timestamp of last agent execution';
