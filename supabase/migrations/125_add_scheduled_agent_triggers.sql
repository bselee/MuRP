-- Migration: 125_add_scheduled_agent_triggers.sql
-- Purpose: Add cron-scheduled triggers for autonomous agent execution
-- Builds on migration 120 (pg_cron setup) and 117 (event triggers)
-- ============================================================

-- ============================================================
-- ADD CRON-BASED SCHEDULED TRIGGERS FOR AUTONOMOUS AGENTS
-- ============================================================

-- Helper function to get agent UUID from identifier
CREATE OR REPLACE FUNCTION get_agent_id_for_cron(p_identifier TEXT)
RETURNS UUID AS $$
    SELECT id FROM public.agent_definitions WHERE identifier = p_identifier;
$$ LANGUAGE sql STABLE;

-- 1. MORNING STOCKOUT CHECK (6:00 AM daily)
-- Runs stockout-prevention-agent to flag critical items before workday starts
INSERT INTO public.event_triggers (event_type, agent_id, conditions, cron_expression, is_active)
SELECT
    'schedule.cron',
    get_agent_id_for_cron('stockout-prevention-agent'),
    '{"schedule_name": "morning_stockout_check"}'::jsonb,
    '0 6 * * *',  -- 6:00 AM daily
    true
WHERE get_agent_id_for_cron('stockout-prevention-agent') IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2. VENDOR PERFORMANCE CHECK (7:00 AM daily)
-- Runs vendor-watchdog-agent to update trust scores and flag issues
INSERT INTO public.event_triggers (event_type, agent_id, conditions, cron_expression, is_active)
SELECT
    'schedule.cron',
    get_agent_id_for_cron('vendor-watchdog-agent'),
    '{"schedule_name": "vendor_performance_daily"}'::jsonb,
    '0 7 * * *',  -- 7:00 AM daily
    true
WHERE get_agent_id_for_cron('vendor-watchdog-agent') IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. INVENTORY GUARDIAN NIGHTLY (2:00 AM daily)
-- Runs inventory-guardian-agent for full stock analysis
INSERT INTO public.event_triggers (event_type, agent_id, conditions, cron_expression, is_active)
SELECT
    'schedule.cron',
    get_agent_id_for_cron('inventory-guardian-agent'),
    '{"schedule_name": "nightly_inventory_check"}'::jsonb,
    '0 2 * * *',  -- 2:00 AM daily
    true
WHERE get_agent_id_for_cron('inventory-guardian-agent') IS NOT NULL
ON CONFLICT DO NOTHING;

-- 4. PO INTELLIGENCE HOURLY (top of every hour during business hours)
-- Runs po-intelligence-agent to check for PO updates, tracking changes
INSERT INTO public.event_triggers (event_type, agent_id, conditions, cron_expression, is_active)
SELECT
    'schedule.cron',
    get_agent_id_for_cron('po-intelligence-agent'),
    '{"schedule_name": "hourly_po_check"}'::jsonb,
    '0 8-18 * * 1-5',  -- Every hour 8am-6pm, Mon-Fri
    true
WHERE get_agent_id_for_cron('po-intelligence-agent') IS NOT NULL
ON CONFLICT DO NOTHING;

-- 5. COMPLIANCE VALIDATOR WEEKLY (Monday 9:00 AM)
-- Runs compliance-validator to check for expiring certifications
INSERT INTO public.event_triggers (event_type, agent_id, conditions, cron_expression, is_active)
SELECT
    'schedule.cron',
    get_agent_id_for_cron('compliance-validator'),
    '{"schedule_name": "weekly_compliance_check"}'::jsonb,
    '0 9 * * 1',  -- 9:00 AM Monday
    true
WHERE get_agent_id_for_cron('compliance-validator') IS NOT NULL
ON CONFLICT DO NOTHING;

-- 6. AFTERSHIP TRACKING SYNC (every 30 minutes)
-- This adds a frequent check for tracking updates via AfterShip
INSERT INTO public.event_triggers (event_type, agent_id, conditions, cron_expression, is_active)
SELECT
    'schedule.cron',
    get_agent_id_for_cron('email-tracking-specialist'),
    '{"schedule_name": "tracking_sync_30min", "action": "sync_aftership"}'::jsonb,
    '*/30 * * * *',  -- Every 30 minutes
    true
WHERE get_agent_id_for_cron('email-tracking-specialist') IS NOT NULL
ON CONFLICT DO NOTHING;

-- Cleanup helper
DROP FUNCTION IF EXISTS get_agent_id_for_cron(TEXT);

-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON TABLE public.event_triggers IS
'Event triggers that connect events (or cron schedules) to agent executions.
 When cron_expression is set, the scheduled-agent-runner checks it every 15 min.';
