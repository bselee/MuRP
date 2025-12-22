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
-- This migration removes the redundant agent_configs table.

-- Drop the deprecated agent_configs table and its policies
DROP POLICY IF EXISTS agent_configs_admin ON public.agent_configs;
DROP POLICY IF EXISTS agent_configs_view ON public.agent_configs;
DROP TABLE IF EXISTS public.agent_configs;

-- Add comment to agent_definitions documenting it as single source of truth
COMMENT ON TABLE public.agent_definitions IS 
'Single source of truth for all agents in the system.
Used by: Agent Command Center UI, workflowOrchestrator.ts, agentManagementService.ts
Identifiers use kebab-case (e.g., stockout-prevention, email-tracking-specialist)
Built-in agents are seeded via migration 113 and marked with is_built_in=true';

-- Ensure workflow_agents view still works (should be fine since it reads from agent_definitions)
-- The view was created in migration 114 and doesn't reference agent_configs
