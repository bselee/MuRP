-- Migration: 120_schedule_agent_runner.sql
-- Purpose: Schedule the scheduled-agent-runner edge function and email-inbox-poller
-- This enables automated agent execution based on cron triggers
-- ============================================================

-- ============================================================
-- HELPER FUNCTION FOR AGENT USAGE TRACKING
-- ============================================================

CREATE OR REPLACE FUNCTION increment_agent_usage(agent_identifier TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE public.agent_definitions
    SET
        usage_count = COALESCE(usage_count, 0) + 1,
        last_used_at = NOW(),
        updated_at = NOW()
    WHERE identifier = agent_identifier;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- SCHEDULE EDGE FUNCTIONS VIA PG_CRON
-- ============================================================

DO $$
DECLARE
    v_supabase_url TEXT;
    v_service_role_key TEXT;
BEGIN
    -- Get config from vault or env (these need to be set in your Supabase project)
    -- Note: In production, these come from Supabase's internal config
    v_supabase_url := current_setting('app.settings.supabase_url', true);
    v_service_role_key := current_setting('app.settings.service_role_key', true);

    -- Check if pg_cron extension is available
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

        -- ================================================================
        -- 1. SCHEDULED AGENT RUNNER (every 15 minutes)
        -- ================================================================

        -- Remove existing job if present
        PERFORM cron.unschedule('scheduled-agent-runner-15min')
        WHERE EXISTS (
            SELECT 1 FROM cron.job WHERE jobname = 'scheduled-agent-runner-15min'
        );

        -- Schedule new job
        IF v_supabase_url IS NOT NULL AND v_service_role_key IS NOT NULL THEN
            PERFORM cron.schedule(
                'scheduled-agent-runner-15min',
                '*/15 * * * *',
                format($sql$
                    SELECT net.http_post(
                        url := '%s/functions/v1/scheduled-agent-runner',
                        headers := jsonb_build_object(
                            'Authorization', 'Bearer %s',
                            'Content-Type', 'application/json'
                        ),
                        body := '{}'::jsonb
                    )
                $sql$, v_supabase_url, v_service_role_key)
            );
            RAISE NOTICE 'Scheduled: scheduled-agent-runner-15min (every 15 minutes)';
        ELSE
            RAISE NOTICE 'SUPABASE_URL or SERVICE_ROLE_KEY not available - use external scheduler for scheduled-agent-runner';
        END IF;

        -- ================================================================
        -- 2. EMAIL INBOX POLLER (every 5 minutes)
        -- ================================================================

        PERFORM cron.unschedule('email-inbox-poller-5min')
        WHERE EXISTS (
            SELECT 1 FROM cron.job WHERE jobname = 'email-inbox-poller-5min'
        );

        IF v_supabase_url IS NOT NULL AND v_service_role_key IS NOT NULL THEN
            PERFORM cron.schedule(
                'email-inbox-poller-5min',
                '*/5 * * * *',
                format($sql$
                    SELECT net.http_post(
                        url := '%s/functions/v1/email-inbox-poller',
                        headers := jsonb_build_object(
                            'Authorization', 'Bearer %s',
                            'Content-Type', 'application/json'
                        ),
                        body := '{"source": "cron"}'::jsonb
                    )
                $sql$, v_supabase_url, v_service_role_key)
            );
            RAISE NOTICE 'Scheduled: email-inbox-poller-5min (every 5 minutes)';
        ELSE
            RAISE NOTICE 'SUPABASE_URL or SERVICE_ROLE_KEY not available - use external scheduler for email-inbox-poller';
        END IF;

        -- ================================================================
        -- 3. PO FOLLOWUP RUNNER (every 4 hours)
        -- ================================================================

        PERFORM cron.unschedule('po-followup-runner-4h')
        WHERE EXISTS (
            SELECT 1 FROM cron.job WHERE jobname = 'po-followup-runner-4h'
        );

        IF v_supabase_url IS NOT NULL AND v_service_role_key IS NOT NULL THEN
            PERFORM cron.schedule(
                'po-followup-runner-4h',
                '0 */4 * * *',
                format($sql$
                    SELECT net.http_post(
                        url := '%s/functions/v1/po-followup-runner',
                        headers := jsonb_build_object(
                            'Authorization', 'Bearer %s',
                            'Content-Type', 'application/json'
                        ),
                        body := '{}'::jsonb
                    )
                $sql$, v_supabase_url, v_service_role_key)
            );
            RAISE NOTICE 'Scheduled: po-followup-runner-4h (every 4 hours)';
        ELSE
            RAISE NOTICE 'SUPABASE_URL or SERVICE_ROLE_KEY not available - use external scheduler for po-followup-runner';
        END IF;

    ELSE
        RAISE NOTICE 'pg_cron extension not available. Set up external cron scheduling:';
        RAISE NOTICE '  - scheduled-agent-runner: every 15 minutes';
        RAISE NOTICE '  - email-inbox-poller: every 5 minutes';
        RAISE NOTICE '  - po-followup-runner: every 4 hours';
        RAISE NOTICE 'Options: Vercel cron, GitHub Actions, or Supabase Dashboard cron triggers';
    END IF;
END $$;

-- ============================================================
-- ADD COMPLIANCE.EXPIRING EVENT TRIGGER FOR COMPLIANCE AGENT
-- ============================================================

-- Helper function to get agent UUID from identifier
CREATE OR REPLACE FUNCTION get_agent_id_temp(p_identifier TEXT)
RETURNS UUID AS $$
    SELECT id FROM public.agent_definitions WHERE identifier = p_identifier;
$$ LANGUAGE sql STABLE;

-- Add compliance.expiring trigger for compliance-validator agent
INSERT INTO public.event_triggers (event_type, agent_id, conditions, is_active)
SELECT 'compliance.expiring', get_agent_id_temp('compliance-validator'), '{}'::jsonb, true
WHERE get_agent_id_temp('compliance-validator') IS NOT NULL
ON CONFLICT DO NOTHING;

-- Cleanup helper
DROP FUNCTION IF EXISTS get_agent_id_temp(TEXT);

-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON FUNCTION increment_agent_usage(TEXT) IS
'Increment usage_count and update last_used_at for an agent by identifier';
