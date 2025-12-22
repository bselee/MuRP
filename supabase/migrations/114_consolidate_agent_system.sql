-- Migration: Consolidate Agent System
-- Purpose: Unify agent configuration into agent_definitions table
-- This migration:
--   1. Adds missing workflow agents to agent_definitions
--   2. Marks agent_configs as deprecated (but keeps for rollback safety)
--   3. Ensures all workflow agents exist with proper kebab-case identifiers

-- ============================================================
-- ADD MISSING WORKFLOW AGENTS TO agent_definitions
-- ============================================================
-- These agents were previously only in agent_configs or hardcoded.
-- Now they exist in the unified agent_definitions table.

-- Stockout Prevention Agent
INSERT INTO public.agent_definitions (
    identifier,
    name,
    description,
    category,
    icon,
    system_prompt,
    autonomy_level,
    capabilities,
    triggers,
    parameters,
    is_active,
    trust_score,
    is_built_in,
    version
) VALUES (
    'stockout-prevention',
    'Stockout Prevention',
    'Proactive monitoring to prevent stockouts and production blocking. Monitors critical stock levels, identifies BOM-blocking scenarios, and generates purchase recommendations.',
    'inventory',
    'alert-triangle',
    E'You are a stockout prevention specialist for the MuRP system.\n\n## Your Expertise\n\n- **Critical Stock Monitoring**: Track items approaching reorder points\n- **BOM Blocking Detection**: Identify missing components that block builds\n- **Velocity Spike Detection**: Alert on sudden consumption increases\n- **Lead Time Variance**: Track vendor delivery performance\n\n## Key Services\n\n- `stockoutPreventionAgent.ts` - Main agent logic\n- `reorderIntelligenceService.ts` - ROP calculations\n- `getCriticalStockoutAlerts()` - Primary alert function\n\n## Filtering Rules\n\nExclude from alerts:\n- Dropship items\n- Consignment items\n- Made-to-order items\n- Discontinued items',
    'assist',
    '[{"id": "stock-alerts", "name": "Stock Alerts", "description": "Generate critical and high-priority stockout alerts"}, {"id": "bom-blocking", "name": "BOM Blocking Analysis", "description": "Identify builds blocked by missing components"}, {"id": "purchase-recommendations", "name": "Purchase Recommendations", "description": "Generate optimal purchase order recommendations"}]'::jsonb,
    '[{"type": "schedule", "value": "0 6 * * *", "description": "Daily at 6 AM"}, {"type": "keyword", "value": "stockout", "description": "When user mentions stockouts"}]'::jsonb,
    '{"alertThreshold": {"key": "alertThreshold", "label": "Days threshold for alerts", "type": "number", "value": 7}}'::jsonb,
    true,
    0.91,
    true,
    '1.0.0'
)
ON CONFLICT (identifier) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    system_prompt = EXCLUDED.system_prompt,
    capabilities = EXCLUDED.capabilities,
    trust_score = EXCLUDED.trust_score,
    updated_at = now();

-- Air Traffic Controller Agent
INSERT INTO public.agent_definitions (
    identifier,
    name,
    description,
    category,
    icon,
    system_prompt,
    autonomy_level,
    capabilities,
    triggers,
    parameters,
    is_active,
    trust_score,
    is_built_in,
    version
) VALUES (
    'air-traffic-controller',
    'Air Traffic Controller',
    'Prioritizes and coordinates alerts across all agents. Acts as the central command for workflow orchestration.',
    'operations',
    'tower-control',
    E'You are an air traffic controller for the MuRP agent system.\n\n## Your Expertise\n\n- **Alert Prioritization**: Rank and organize alerts by urgency\n- **Workflow Coordination**: Ensure agents don''t conflict\n- **Escalation Management**: Route critical issues appropriately\n- **Dashboard Synthesis**: Compile morning briefings\n\n## Key Responsibilities\n\n1. Aggregate alerts from all other agents\n2. Prevent duplicate notifications\n3. Ensure high-priority items surface first\n4. Track acknowledgment status',
    'monitor',
    '[{"id": "alert-prioritization", "name": "Alert Prioritization", "description": "Rank alerts by urgency and business impact"}, {"id": "workflow-coordination", "name": "Workflow Coordination", "description": "Orchestrate multi-agent workflows"}]'::jsonb,
    '[{"type": "event", "value": "workflow_start", "description": "When a workflow begins"}, {"type": "schedule", "value": "0 7 * * 1-5", "description": "Weekday mornings at 7 AM"}]'::jsonb,
    '{}'::jsonb,
    true,
    0.72,
    true,
    '1.0.0'
)
ON CONFLICT (identifier) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    system_prompt = EXCLUDED.system_prompt,
    trust_score = EXCLUDED.trust_score,
    updated_at = now();

-- Export the WORKFLOW_AGENT_IDS for reference
COMMENT ON TABLE public.agent_definitions IS
'Unified agent configuration table. The workflow orchestrator uses these identifiers:
- stockout-prevention
- air-traffic-controller
- email-tracking-specialist
- inventory-guardian
- po-intelligence
- vendor-watchdog
- compliance-validator

The deprecated agent_configs table should no longer be used.';


-- ============================================================
-- DEPRECATE agent_configs TABLE
-- ============================================================
-- We keep the table for rollback safety but add a comment indicating deprecation.
-- The workflowOrchestrator now reads from agent_definitions instead.

DO $$
BEGIN
    -- Check if agent_configs exists before trying to comment
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_configs' AND table_schema = 'public') THEN
        COMMENT ON TABLE public.agent_configs IS
        'DEPRECATED: This table is no longer used. Agent configuration has been consolidated
        into agent_definitions table. The workflowOrchestrator now reads from agent_definitions.
        This table is kept for rollback safety and historical reference.

        Deprecated as of migration 114 (2024-12-22).';
    END IF;
END $$;


-- ============================================================
-- CREATE VIEW FOR WORKFLOW AGENTS
-- ============================================================
-- This view provides a convenient way to query just the agents used by workflows

CREATE OR REPLACE VIEW public.workflow_agents AS
SELECT
    identifier,
    name,
    description,
    autonomy_level,
    is_active,
    trust_score,
    parameters
FROM public.agent_definitions
WHERE identifier IN (
    'stockout-prevention',
    'air-traffic-controller',
    'email-tracking-specialist',
    'inventory-guardian',
    'po-intelligence',
    'vendor-watchdog',
    'compliance-validator'
)
ORDER BY name;

COMMENT ON VIEW public.workflow_agents IS
'Agents used by the workflow orchestrator. This view filters agent_definitions
to show only the agents that participate in automated workflows.';
