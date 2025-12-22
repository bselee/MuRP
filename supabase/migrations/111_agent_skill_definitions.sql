-- Migration: Agent & Skill Definitions
-- Purpose: Store custom agent and skill configurations for the Agent Command Center
-- This enables CRUD operations on agents/skills while keeping built-ins in code

-- ============================================================
-- AGENT DEFINITIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    identifier TEXT NOT NULL UNIQUE,  -- Machine-readable: 'stock-intelligence'
    name TEXT NOT NULL,               -- Display: 'Stock Intelligence Analyst'
    description TEXT,
    category TEXT NOT NULL DEFAULT 'custom' CHECK (category IN ('inventory', 'compliance', 'operations', 'quality', 'analytics', 'custom')),
    icon TEXT,                        -- Icon identifier or emoji

    -- Behavior
    system_prompt TEXT NOT NULL,
    autonomy_level TEXT NOT NULL DEFAULT 'assist' CHECK (autonomy_level IN ('monitor', 'assist', 'autonomous')),
    capabilities JSONB DEFAULT '[]'::jsonb,   -- Array of capability objects
    triggers JSONB DEFAULT '[]'::jsonb,       -- Array of trigger objects

    -- Configuration
    parameters JSONB DEFAULT '{}'::jsonb,     -- Key-value parameters
    mcp_tools TEXT[] DEFAULT ARRAY[]::TEXT[], -- MCP tools this agent can access
    allowed_tools TEXT[] DEFAULT ARRAY['Read', 'Grep', 'Glob']::TEXT[],

    -- State
    is_active BOOLEAN NOT NULL DEFAULT true,
    trust_score NUMERIC(3,2) NOT NULL DEFAULT 0.70 CHECK (trust_score >= 0 AND trust_score <= 1),
    is_built_in BOOLEAN NOT NULL DEFAULT false,
    version TEXT NOT NULL DEFAULT '1.0.0',

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_definitions_category ON public.agent_definitions(category);
CREATE INDEX IF NOT EXISTS idx_agent_definitions_is_active ON public.agent_definitions(is_active);
CREATE INDEX IF NOT EXISTS idx_agent_definitions_identifier ON public.agent_definitions(identifier);

-- RLS
ALTER TABLE public.agent_definitions ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY agent_definitions_admin_all ON public.agent_definitions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles u
            WHERE u.id = auth.uid()
            AND u.role = 'Admin'
        )
    );

-- All users can view active agents
CREATE POLICY agent_definitions_view ON public.agent_definitions
    FOR SELECT
    USING (is_active = true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_agent_definitions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_definitions_updated_at ON public.agent_definitions;
CREATE TRIGGER agent_definitions_updated_at
    BEFORE UPDATE ON public.agent_definitions
    FOR EACH ROW
    EXECUTE FUNCTION update_agent_definitions_updated_at();


-- ============================================================
-- SKILL DEFINITIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.skill_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    identifier TEXT NOT NULL UNIQUE,  -- Machine-readable: 'deploy'
    name TEXT NOT NULL,               -- Display: 'Deploy to Main'
    command TEXT NOT NULL,            -- CLI command: '/deploy'
    description TEXT,
    category TEXT NOT NULL DEFAULT 'custom' CHECK (category IN ('deployment', 'quality', 'security', 'automation', 'custom')),
    icon TEXT,

    -- Behavior
    instructions TEXT NOT NULL,       -- Markdown instructions (SKILL.md content)
    allowed_tools TEXT[] DEFAULT ARRAY['Read', 'Bash']::TEXT[],

    -- State
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_built_in BOOLEAN NOT NULL DEFAULT false,
    usage_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ,

    -- Metadata
    version TEXT NOT NULL DEFAULT '1.0.0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_skill_definitions_category ON public.skill_definitions(category);
CREATE INDEX IF NOT EXISTS idx_skill_definitions_is_active ON public.skill_definitions(is_active);
CREATE INDEX IF NOT EXISTS idx_skill_definitions_command ON public.skill_definitions(command);

-- RLS
ALTER TABLE public.skill_definitions ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY skill_definitions_admin_all ON public.skill_definitions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles u
            WHERE u.id = auth.uid()
            AND u.role = 'Admin'
        )
    );

-- All users can view active skills
CREATE POLICY skill_definitions_view ON public.skill_definitions
    FOR SELECT
    USING (is_active = true);

-- Updated_at trigger
DROP TRIGGER IF EXISTS skill_definitions_updated_at ON public.skill_definitions;
CREATE TRIGGER skill_definitions_updated_at
    BEFORE UPDATE ON public.skill_definitions
    FOR EACH ROW
    EXECUTE FUNCTION update_agent_definitions_updated_at();


-- ============================================================
-- AGENT EXECUTION LOG TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_execution_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES public.agent_definitions(id) ON DELETE SET NULL,
    agent_identifier TEXT NOT NULL,   -- Preserved even if agent deleted

    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),

    input JSONB DEFAULT '{}'::jsonb,
    output JSONB,
    tokens_used INTEGER,
    duration_ms INTEGER,
    error TEXT,

    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_execution_log_agent_id ON public.agent_execution_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_execution_log_status ON public.agent_execution_log(status);
CREATE INDEX IF NOT EXISTS idx_agent_execution_log_started_at ON public.agent_execution_log(started_at DESC);

-- RLS
ALTER TABLE public.agent_execution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_execution_log_admin ON public.agent_execution_log
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles u
            WHERE u.id = auth.uid()
            AND u.role = 'Admin'
        )
    );

CREATE POLICY agent_execution_log_own ON public.agent_execution_log
    FOR SELECT
    USING (user_id = auth.uid());


-- ============================================================
-- WORKFLOW DEFINITIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.workflow_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,

    -- Schedule (cron expression, null for manual only)
    schedule TEXT,

    -- Workflow steps as JSONB array
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,

    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

-- RLS
ALTER TABLE public.workflow_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY workflow_definitions_admin ON public.workflow_definitions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles u
            WHERE u.id = auth.uid()
            AND u.role = 'Admin'
        )
    );

CREATE POLICY workflow_definitions_view ON public.workflow_definitions
    FOR SELECT
    USING (is_active = true);


-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON TABLE public.agent_definitions IS 'Custom AI agent configurations for the Agent Command Center';
COMMENT ON TABLE public.skill_definitions IS 'Custom skill definitions (CLI automation workflows)';
COMMENT ON TABLE public.agent_execution_log IS 'Execution history for agent invocations';
COMMENT ON TABLE public.workflow_definitions IS 'Multi-step workflow definitions combining agents and skills';

COMMENT ON COLUMN public.agent_definitions.identifier IS 'Unique machine-readable identifier, used in .claude/agents/ file naming';
COMMENT ON COLUMN public.agent_definitions.system_prompt IS 'The base instructions that guide agent behavior, in Markdown format';
COMMENT ON COLUMN public.agent_definitions.capabilities IS 'Array of {id, name, description} capability objects';
COMMENT ON COLUMN public.agent_definitions.triggers IS 'Array of {type, value, description} trigger objects';
COMMENT ON COLUMN public.agent_definitions.parameters IS 'Key-value pairs of configurable agent parameters';
COMMENT ON COLUMN public.agent_definitions.trust_score IS 'Confidence score 0-1, updated based on agent performance';

COMMENT ON COLUMN public.skill_definitions.command IS 'CLI invocation command, e.g., /deploy';
COMMENT ON COLUMN public.skill_definitions.instructions IS 'Skill instructions in Markdown format (SKILL.md content)';
