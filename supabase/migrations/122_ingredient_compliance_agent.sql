-- Migration: 122_ingredient_compliance_agent.sql
-- Description: Add Ingredient Compliance Agent to agent_definitions
-- Purpose: Agent that researches and populates ingredient compliance database
-- Date: 2025-12-23

-- ============================================================================
-- INSERT INGREDIENT COMPLIANCE AGENT
-- ============================================================================

INSERT INTO public.agent_definitions (
  identifier,
  name,
  description,
  category,
  autonomy_level,
  trust_score,
  system_prompt,
  capabilities,
  parameters,
  is_active,
  created_at,
  updated_at
) VALUES (
  'ingredient-compliance-agent',
  'Ingredient Compliance Agent',
  'Researches state-by-state ingredient regulations, populates compliance database, and discovers SDS hazard data using Perplexity AI',
  'compliance',
  'assist',
  0.7,
  E'You are an expert in US agricultural and fertilizer regulations. Your role is to research ingredient compliance status across states and populate the database with accurate, citation-backed regulatory information.

## Your Capabilities

1. **Research Ingredient Regulations**
   - Use `research_ingredient_regulations` to query Perplexity for state-specific rules
   - Extract compliance status (compliant, restricted, prohibited, conditional)
   - Find concentration limits and labeling requirements
   - Identify relevant regulation codes and citations

2. **Populate Compliance Database**
   - Use `set_ingredient_compliance` to store each state''s status
   - Always include regulation codes when available
   - Note restriction types and details

3. **Research SDS/Hazard Data**
   - Use `research_ingredient_sds` to find GHS hazard classifications
   - Extract H-codes, P-codes, and signal words
   - Use `store_sds_document` to save hazard data

4. **Cross-Reference Analysis**
   - Check if ingredient is used in multiple BOMs via `find_boms_using_ingredient`
   - Flag products affected by new restrictions
   - Prioritize research for high-impact ingredients

## Priority States (Research First)
1. California (CA) - Most restrictive
2. Oregon (OR) - Organic focus
3. Washington (WA) - Strong regulations
4. Texas (TX) - Large market
5. New Mexico (NM) - Specific requirements
6. New York (NY) - Dense population

## Research Guidelines
- Always cite regulation codes when storing compliance data
- When uncertain, mark as "pending_review" rather than guessing
- Prioritize ingredients with high usage across BOMs
- Flag any newly discovered restrictions for human review

## Output Format
After researching, summarize:
- States researched
- Compliance status per state
- Key restrictions found
- Regulation citations
- Any flags for human review',
  '[
    {
      "id": "research-regulations",
      "name": "Research Regulations",
      "description": "Research state-by-state regulations for an ingredient using Perplexity"
    },
    {
      "id": "populate-compliance",
      "name": "Populate Compliance",
      "description": "Store researched compliance data in the database"
    },
    {
      "id": "research-sds",
      "name": "Research SDS",
      "description": "Find and store SDS hazard data for ingredients"
    },
    {
      "id": "cross-use-analysis",
      "name": "Cross-Use Analysis",
      "description": "Analyze impact of ingredient restrictions across BOMs"
    },
    {
      "id": "bulk-research",
      "name": "Bulk Research",
      "description": "Research multiple ingredients for priority states"
    }
  ]'::JSONB,
  '{
    "priority_states": ["CA", "OR", "WA", "TX", "NM", "NY"],
    "regulation_types": ["fertilizer", "organic", "soil_amendment", "biostimulant"],
    "max_states_per_request": 6,
    "require_citations": true,
    "auto_flag_prohibited": true
  }'::JSONB,
  true,
  NOW(),
  NOW()
) ON CONFLICT (identifier) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  system_prompt = EXCLUDED.system_prompt,
  capabilities = EXCLUDED.capabilities,
  parameters = EXCLUDED.parameters,
  updated_at = NOW();

-- ============================================================================
-- ADD EVENT TRIGGERS FOR INGREDIENT COMPLIANCE
-- ============================================================================

-- Trigger when new ingredient is added to a BOM
INSERT INTO public.event_triggers (event_type, agent_id, conditions, is_active)
SELECT
  'manual',
  id,
  '{"trigger": "new_ingredient", "action": "research_compliance"}'::JSONB,
  true
FROM public.agent_definitions
WHERE identifier = 'ingredient-compliance-agent'
ON CONFLICT DO NOTHING;

-- Scheduled daily research for priority states
INSERT INTO public.event_triggers (event_type, agent_id, cron_expression, conditions, is_active)
SELECT
  'schedule.cron',
  id,
  '0 7 * * *',  -- 7 AM daily
  '{"purpose": "daily_ingredient_research", "target": "missing_compliance_data"}'::JSONB,
  true
FROM public.agent_definitions
WHERE identifier = 'ingredient-compliance-agent'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- ADD COMPLIANCE CAPABILITY TO EXISTING AGENTS
-- ============================================================================

-- Give compliance-validator agent access to ingredient compliance tools
UPDATE public.agent_definitions
SET capabilities = capabilities || '[{
  "id": "check-ingredient-compliance",
  "name": "Check Ingredient Compliance",
  "description": "Verify ingredient compliance status across target states"
}]'::JSONB
WHERE identifier = 'compliance-validator'
AND NOT capabilities @> '[{"id": "check-ingredient-compliance"}]'::JSONB;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN agent_definitions.parameters IS 'Agent-specific configuration including priority_states for compliance research';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 122 completed successfully!';
  RAISE NOTICE '📊 Added:';
  RAISE NOTICE '  - ingredient-compliance-agent definition';
  RAISE NOTICE '  - Event triggers for daily research';
  RAISE NOTICE '  - check-ingredient-compliance capability for compliance-validator';
  RAISE NOTICE '🎯 Agent can now research regulations via Perplexity and populate database!';
END $$;
