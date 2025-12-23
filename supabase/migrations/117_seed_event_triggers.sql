-- Migration: 117_seed_event_triggers.sql
-- Purpose: Expand event types and seed default event triggers for built-in agents
-- This completes the event-driven agent execution system
-- ============================================================

-- ============================================================
-- UPDATE EVENT TRIGGERS TABLE TO SUPPORT MORE EVENT TYPES
-- ============================================================

-- Drop the constraint first, then re-add with expanded list
ALTER TABLE public.event_triggers
DROP CONSTRAINT IF EXISTS event_triggers_event_type_check;

ALTER TABLE public.event_triggers
ADD CONSTRAINT event_triggers_event_type_check
CHECK (event_type IN (
    -- Email events
    'email.received',
    'email.processed',
    -- Stock events
    'stock.low',
    'stock.critical',
    'stock.out',
    -- PO events
    'po.created',
    'po.sent',
    'po.overdue',
    'po.received',
    'po.tracking_updated',
    -- Compliance events
    'compliance.alert',
    'compliance.expiring',
    -- Vendor events
    'vendor.issue',
    -- System events
    'schedule.cron',
    'workflow.step',
    'agent.completed',
    'manual'
));

-- ============================================================
-- SEED EVENT TRIGGERS FOR BUILT-IN AGENTS
-- ============================================================

-- Helper function to get agent UUID from identifier
CREATE OR REPLACE FUNCTION get_agent_id(p_identifier TEXT)
RETURNS UUID AS $$
    SELECT id FROM public.agent_definitions WHERE identifier = p_identifier;
$$ LANGUAGE sql STABLE;

-- 1. Stock Intelligence Analyst triggers
INSERT INTO public.event_triggers (event_type, agent_id, conditions, is_active)
SELECT 'stock.low', get_agent_id('stock-intelligence-analyst'), '{}'::jsonb, true
WHERE get_agent_id('stock-intelligence-analyst') IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.event_triggers (event_type, agent_id, conditions, is_active)
SELECT 'stock.critical', get_agent_id('stock-intelligence-analyst'), '{}'::jsonb, true
WHERE get_agent_id('stock-intelligence-analyst') IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.event_triggers (event_type, agent_id, conditions, is_active)
SELECT 'stock.out', get_agent_id('stockout-prevention-agent'), '{}'::jsonb, true
WHERE get_agent_id('stockout-prevention-agent') IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2. Email Tracking Specialist triggers
INSERT INTO public.event_triggers (event_type, agent_id, conditions, is_active)
SELECT 'email.received', get_agent_id('email-tracking-specialist'), '{}'::jsonb, true
WHERE get_agent_id('email-tracking-specialist') IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. Vendor Watchdog triggers
INSERT INTO public.event_triggers (event_type, agent_id, conditions, is_active)
SELECT 'po.received', get_agent_id('vendor-watchdog-agent'), '{}'::jsonb, true
WHERE get_agent_id('vendor-watchdog-agent') IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.event_triggers (event_type, agent_id, conditions, is_active)
SELECT 'po.overdue', get_agent_id('vendor-watchdog-agent'), '{}'::jsonb, true
WHERE get_agent_id('vendor-watchdog-agent') IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.event_triggers (event_type, agent_id, conditions, is_active)
SELECT 'vendor.issue', get_agent_id('vendor-watchdog-agent'), '{}'::jsonb, true
WHERE get_agent_id('vendor-watchdog-agent') IS NOT NULL
ON CONFLICT DO NOTHING;

-- 4. PO Intelligence Agent triggers
INSERT INTO public.event_triggers (event_type, agent_id, conditions, is_active)
SELECT 'po.created', get_agent_id('po-intelligence-agent'), '{}'::jsonb, true
WHERE get_agent_id('po-intelligence-agent') IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.event_triggers (event_type, agent_id, conditions, is_active)
SELECT 'po.tracking_updated', get_agent_id('po-intelligence-agent'), '{}'::jsonb, true
WHERE get_agent_id('po-intelligence-agent') IS NOT NULL
ON CONFLICT DO NOTHING;

-- 5. Compliance Validation Agent triggers
INSERT INTO public.event_triggers (event_type, agent_id, conditions, is_active)
SELECT 'compliance.alert', get_agent_id('compliance-validation-agent'), '{}'::jsonb, true
WHERE get_agent_id('compliance-validation-agent') IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.event_triggers (event_type, agent_id, conditions, is_active)
SELECT 'compliance.expiring', get_agent_id('compliance-validation-agent'), '{}'::jsonb, true
WHERE get_agent_id('compliance-validation-agent') IS NOT NULL
ON CONFLICT DO NOTHING;

-- 6. Air Traffic Controller (monitors PO delays)
INSERT INTO public.event_triggers (event_type, agent_id, conditions, is_active)
SELECT 'po.overdue', get_agent_id('air-traffic-controller-agent'), '{}'::jsonb, true
WHERE get_agent_id('air-traffic-controller-agent') IS NOT NULL
ON CONFLICT DO NOTHING;

-- 7. Inventory Guardian Agent triggers
INSERT INTO public.event_triggers (event_type, agent_id, conditions, is_active)
SELECT 'stock.low', get_agent_id('inventory-guardian-agent'), '{}'::jsonb, true
WHERE get_agent_id('inventory-guardian-agent') IS NOT NULL
ON CONFLICT DO NOTHING;

-- ============================================================
-- SCHEDULED TRIGGERS (Cron-based)
-- ============================================================

-- Daily morning briefing at 6 AM (Stock Intelligence review)
INSERT INTO public.event_triggers (event_type, agent_id, cron_expression, conditions, is_active)
SELECT 'schedule.cron', get_agent_id('stock-intelligence-analyst'), '0 6 * * *', '{"purpose": "daily_review"}'::jsonb, true
WHERE get_agent_id('stock-intelligence-analyst') IS NOT NULL
ON CONFLICT DO NOTHING;

-- Check for overdue POs every 4 hours
INSERT INTO public.event_triggers (event_type, agent_id, cron_expression, conditions, is_active)
SELECT 'schedule.cron', get_agent_id('po-intelligence-agent'), '0 */4 * * *', '{"purpose": "overdue_check"}'::jsonb, true
WHERE get_agent_id('po-intelligence-agent') IS NOT NULL
ON CONFLICT DO NOTHING;

-- Vendor performance weekly review (Monday 8 AM)
INSERT INTO public.event_triggers (event_type, agent_id, cron_expression, conditions, is_active)
SELECT 'schedule.cron', get_agent_id('vendor-watchdog-agent'), '0 8 * * 1', '{"purpose": "weekly_review"}'::jsonb, true
WHERE get_agent_id('vendor-watchdog-agent') IS NOT NULL
ON CONFLICT DO NOTHING;

-- ============================================================
-- CLEANUP HELPER FUNCTION
-- ============================================================

DROP FUNCTION IF EXISTS get_agent_id(TEXT);

-- ============================================================
-- CREATE VIEW FOR ACTIVE TRIGGERS
-- ============================================================

CREATE OR REPLACE VIEW public.active_event_triggers AS
SELECT
    et.id,
    et.event_type,
    et.agent_id,
    ad.identifier AS agent_identifier,
    ad.name AS agent_name,
    et.workflow_id,
    wd.name AS workflow_name,
    et.conditions,
    et.cron_expression,
    et.is_active,
    et.last_triggered_at,
    et.next_trigger_at,
    et.created_at
FROM public.event_triggers et
LEFT JOIN public.agent_definitions ad ON et.agent_id = ad.id
LEFT JOIN public.workflow_definitions wd ON et.workflow_id = wd.id
WHERE et.is_active = true
ORDER BY et.event_type, ad.name;

COMMENT ON VIEW public.active_event_triggers IS 'Active event triggers with agent/workflow details';

-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON TABLE public.event_triggers IS 'Event-to-agent/workflow mappings. System emits events, triggers invoke agents.';
