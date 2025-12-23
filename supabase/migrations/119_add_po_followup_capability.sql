-- Migration: 119_add_po_followup_capability.sql
-- Purpose: Add the po-followup capability to PO Intelligence Agent
-- and create event trigger for overdue PO follow-ups
-- ============================================================

-- ============================================================
-- UPDATE PO INTELLIGENCE AGENT CAPABILITIES
-- ============================================================

-- Add po-followup capability to the PO Intelligence Agent
UPDATE public.agent_definitions
SET capabilities = capabilities || '[{
    "id": "po-followup",
    "name": "PO Follow-Up",
    "description": "Send follow-up emails to vendors for overdue POs, missing tracking, or out-of-stock items"
}]'::jsonb
WHERE identifier = 'po-intelligence'
AND NOT capabilities @> '[{"id": "po-followup"}]'::jsonb;

-- ============================================================
-- CREATE EVENT TRIGGER FOR PO FOLLOW-UP
-- ============================================================

-- Helper function to get agent UUID from identifier
CREATE OR REPLACE FUNCTION get_agent_id(p_identifier TEXT)
RETURNS UUID AS $$
    SELECT id FROM public.agent_definitions WHERE identifier = p_identifier;
$$ LANGUAGE sql STABLE;

-- Trigger on overdue POs (scheduled check every 4 hours)
INSERT INTO public.event_triggers (event_type, agent_id, cron_expression, conditions, is_active)
SELECT 'schedule.cron', get_agent_id('po-intelligence'), '0 */4 * * *', '{"purpose": "po_followup_check"}'::jsonb, true
WHERE get_agent_id('po-intelligence') IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM public.event_triggers
    WHERE agent_id = get_agent_id('po-intelligence')
    AND conditions->>'purpose' = 'po_followup_check'
);

-- Trigger when PO becomes overdue
INSERT INTO public.event_triggers (event_type, agent_id, conditions, is_active)
SELECT 'po.overdue', get_agent_id('po-intelligence'), '{"action": "send_followup"}'::jsonb, true
WHERE get_agent_id('po-intelligence') IS NOT NULL
ON CONFLICT DO NOTHING;

-- Cleanup helper function
DROP FUNCTION IF EXISTS get_agent_id(TEXT);

-- ============================================================
-- UPDATE EMAIL TRACKING SPECIALIST FOR INBOX PURPOSE
-- ============================================================

-- Ensure the email-tracking-specialist has info about inbox purposes
UPDATE public.agent_definitions
SET system_prompt = system_prompt || E'

## Inbox Types (CRITICAL)

Users configure TWO Gmail inboxes in Settings:
1. **Purchasing Inbox** (inbox_purpose = ''purchasing'')
   - Vendor communications, PO updates, tracking numbers
   - Managed by purchasing team

2. **Accounting/AP Inbox** (inbox_purpose = ''accounting'')
   - Invoices, payment confirmations, financial documents
   - Managed by accounts payable team

Always respect inbox purpose when processing emails. Purchasing emails go to purchasing actions, AP emails go to accounting actions.'
WHERE identifier = 'email-tracking-specialist'
AND system_prompt NOT LIKE '%Inbox Types (CRITICAL)%';

-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON CONSTRAINT event_triggers_event_type_check ON public.event_triggers
IS 'Valid event types for triggering agents';
