-- Migration: Pending Actions Queue
-- Purpose: Persistent queue for agent-recommended actions awaiting approval or auto-execution
-- This enables the shift from "AI-assisted" to "AI-autonomous" workflows

-- ============================================================
-- PENDING ACTIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pending_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Agent reference (nullable for manual/system actions)
    agent_id UUID REFERENCES public.agent_definitions(id) ON DELETE SET NULL,
    agent_identifier TEXT,  -- Preserved even if agent deleted

    -- Action details
    action_type TEXT NOT NULL CHECK (action_type IN (
        'create_po',           -- Create purchase order
        'send_email',          -- Send vendor email
        'update_inventory',    -- Update stock levels
        'adjust_rop',          -- Adjust reorder point parameters
        'update_lead_time',    -- Update vendor lead time
        'flag_compliance',     -- Flag compliance issue
        'schedule_followup',   -- Schedule follow-up task
        'notify_user',         -- Send user notification
        'custom'               -- Custom action type
    )),
    action_label TEXT NOT NULL,          -- Human-readable: "Create PO for 50 units of SKU-123"
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Confidence and priority
    confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    reasoning TEXT,                       -- Why agent recommended this action

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',      -- Awaiting approval
        'approved',     -- User approved, ready to execute
        'rejected',     -- User rejected
        'executed',     -- Successfully executed
        'failed',       -- Execution failed
        'expired',      -- Past expiration without action
        'auto_executed' -- Automatically executed (high trust)
    )),

    -- Execution details
    executed_at TIMESTAMPTZ,
    execution_result JSONB,
    error_message TEXT,

    -- Timing
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,               -- Auto-expire if not acted upon
    reviewed_at TIMESTAMPTZ,              -- When user reviewed
    reviewed_by UUID REFERENCES auth.users(id),

    -- Context
    user_id UUID REFERENCES auth.users(id),
    workflow_execution_id UUID,           -- Link to workflow if part of one
    source_context JSONB DEFAULT '{}'::jsonb  -- Additional context (email_id, inventory_item_id, etc.)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_pending_actions_status ON public.pending_actions(status);
CREATE INDEX IF NOT EXISTS idx_pending_actions_user_id ON public.pending_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_pending_actions_agent_id ON public.pending_actions(agent_id);
CREATE INDEX IF NOT EXISTS idx_pending_actions_created_at ON public.pending_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_actions_priority ON public.pending_actions(priority);
CREATE INDEX IF NOT EXISTS idx_pending_actions_action_type ON public.pending_actions(action_type);

-- Composite index for pending actions dashboard
CREATE INDEX IF NOT EXISTS idx_pending_actions_pending_list
    ON public.pending_actions(user_id, status, priority, created_at DESC)
    WHERE status = 'pending';

-- RLS
ALTER TABLE public.pending_actions ENABLE ROW LEVEL SECURITY;

-- Users can view and manage their own pending actions
CREATE POLICY pending_actions_own ON public.pending_actions
    FOR ALL
    USING (user_id = auth.uid() OR reviewed_by = auth.uid());

-- Admins can view all pending actions
CREATE POLICY pending_actions_admin ON public.pending_actions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles u
            WHERE u.id = auth.uid()
            AND (u.role = 'Admin' OR u.department = 'Operations')
        )
    );


-- ============================================================
-- EVENT TRIGGERS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.event_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Trigger definition
    event_type TEXT NOT NULL CHECK (event_type IN (
        'email.received',      -- New email in monitored inbox
        'stock.low',           -- Stock fell below ROP
        'stock.critical',      -- Stock critically low
        'po.overdue',          -- PO delivery is overdue
        'po.received',         -- PO was received
        'compliance.alert',    -- Compliance issue detected
        'schedule.cron',       -- Scheduled cron trigger
        'manual'               -- Manual invocation
    )),

    -- What to trigger
    agent_id UUID REFERENCES public.agent_definitions(id) ON DELETE CASCADE,
    workflow_id UUID REFERENCES public.workflow_definitions(id) ON DELETE CASCADE,

    -- Conditions (JSONB for flexible filtering)
    conditions JSONB DEFAULT '{}'::jsonb,  -- e.g., {"vendor_id": "...", "category": "..."}

    -- Schedule (for cron triggers)
    cron_expression TEXT,                   -- e.g., "0 6 * * *" for daily at 6 AM
    last_triggered_at TIMESTAMPTZ,
    next_trigger_at TIMESTAMPTZ,

    -- State
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),

    -- Ensure either agent_id or workflow_id is set
    CONSTRAINT trigger_target_check CHECK (
        (agent_id IS NOT NULL AND workflow_id IS NULL) OR
        (agent_id IS NULL AND workflow_id IS NOT NULL)
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_event_triggers_event_type ON public.event_triggers(event_type);
CREATE INDEX IF NOT EXISTS idx_event_triggers_agent_id ON public.event_triggers(agent_id);
CREATE INDEX IF NOT EXISTS idx_event_triggers_workflow_id ON public.event_triggers(workflow_id);
CREATE INDEX IF NOT EXISTS idx_event_triggers_next_trigger ON public.event_triggers(next_trigger_at)
    WHERE is_active = true AND cron_expression IS NOT NULL;

-- RLS
ALTER TABLE public.event_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_triggers_admin ON public.event_triggers
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles u
            WHERE u.id = auth.uid()
            AND (u.role = 'Admin' OR u.department = 'Operations')
        )
    );

CREATE POLICY event_triggers_view ON public.event_triggers
    FOR SELECT
    USING (is_active = true);


-- ============================================================
-- ENHANCE AGENT EXECUTION LOG
-- ============================================================

-- Add outcome tracking columns
ALTER TABLE public.agent_execution_log
    ADD COLUMN IF NOT EXISTS outcome TEXT CHECK (outcome IN ('success', 'partial', 'failed', 'cancelled')),
    ADD COLUMN IF NOT EXISTS user_feedback TEXT CHECK (user_feedback IN ('approved', 'corrected', 'rejected', 'pending')),
    ADD COLUMN IF NOT EXISTS correction_notes TEXT,
    ADD COLUMN IF NOT EXISTS actions_generated INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS actions_executed INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS actions_rejected INTEGER DEFAULT 0;

-- Index for trust score calculation queries
CREATE INDEX IF NOT EXISTS idx_agent_execution_log_outcome
    ON public.agent_execution_log(agent_id, outcome, user_feedback, started_at DESC);


-- ============================================================
-- AGENT TRAINING EXAMPLES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_training_examples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES public.agent_definitions(id) ON DELETE CASCADE,
    agent_identifier TEXT NOT NULL,

    -- Training data
    input JSONB NOT NULL,
    original_output JSONB NOT NULL,
    corrected_output JSONB NOT NULL,
    correction_type TEXT CHECK (correction_type IN ('parameter', 'action', 'format', 'priority', 'other')),

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    applied_at TIMESTAMPTZ,  -- When correction was applied to agent parameters
    notes TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_training_examples_agent_id ON public.agent_training_examples(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_training_examples_created_at ON public.agent_training_examples(created_at DESC);

-- RLS
ALTER TABLE public.agent_training_examples ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_training_examples_admin ON public.agent_training_examples
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles u
            WHERE u.id = auth.uid()
            AND (u.role = 'Admin' OR u.department = 'Operations')
        )
    );


-- ============================================================
-- WORKFLOW EXECUTIONS TABLE (Enhance existing table from migration 109)
-- ============================================================

-- Add missing columns to existing workflow_executions table
ALTER TABLE public.workflow_executions
    ADD COLUMN IF NOT EXISTS workflow_id UUID REFERENCES public.workflow_definitions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed',
    ADD COLUMN IF NOT EXISTS current_step_index INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS steps_completed INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS steps_total INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS step_results JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS final_output JSONB,
    ADD COLUMN IF NOT EXISTS error_message TEXT,
    ADD COLUMN IF NOT EXISTS trigger_type TEXT,
    ADD COLUMN IF NOT EXISTS trigger_event JSONB,
    ADD COLUMN IF NOT EXISTS input_data JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
    ADD COLUMN IF NOT EXISTS tokens_used INTEGER,
    ADD COLUMN IF NOT EXISTS actions_generated INTEGER DEFAULT 0;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON public.workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON public.workflow_executions(status);


-- ============================================================
-- VIEWS
-- ============================================================

-- Pending actions summary for dashboard
CREATE OR REPLACE VIEW public.pending_actions_summary AS
SELECT
    user_id,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
    COUNT(*) FILTER (WHERE status = 'pending' AND priority = 'urgent') as urgent_count,
    COUNT(*) FILTER (WHERE status = 'pending' AND priority = 'high') as high_priority_count,
    COUNT(*) FILTER (WHERE status = 'executed' AND created_at > now() - interval '24 hours') as executed_today,
    COUNT(*) FILTER (WHERE status = 'auto_executed' AND created_at > now() - interval '24 hours') as auto_executed_today,
    COUNT(*) FILTER (WHERE status = 'rejected' AND created_at > now() - interval '24 hours') as rejected_today
FROM public.pending_actions
GROUP BY user_id;

-- Agent trust score with trend
CREATE OR REPLACE VIEW public.agent_trust_scores AS
SELECT
    ad.id as agent_id,
    ad.identifier,
    ad.name,
    ad.trust_score as current_trust_score,
    COUNT(ael.id) FILTER (WHERE ael.started_at > now() - interval '30 days') as executions_30d,
    COUNT(ael.id) FILTER (WHERE ael.outcome = 'success' AND ael.started_at > now() - interval '30 days') as successes_30d,
    COUNT(ael.id) FILTER (WHERE ael.user_feedback = 'approved' AND ael.started_at > now() - interval '30 days') as approvals_30d,
    COUNT(ael.id) FILTER (WHERE ael.user_feedback = 'rejected' AND ael.started_at > now() - interval '30 days') as rejections_30d,
    CASE
        WHEN COUNT(ael.id) FILTER (WHERE ael.started_at > now() - interval '7 days') >
             COUNT(ael.id) FILTER (WHERE ael.started_at BETWEEN now() - interval '14 days' AND now() - interval '7 days')
        THEN 'improving'
        WHEN COUNT(ael.id) FILTER (WHERE ael.started_at > now() - interval '7 days') <
             COUNT(ael.id) FILTER (WHERE ael.started_at BETWEEN now() - interval '14 days' AND now() - interval '7 days')
        THEN 'declining'
        ELSE 'stable'
    END as trend
FROM public.agent_definitions ad
LEFT JOIN public.agent_execution_log ael ON ad.id = ael.agent_id
GROUP BY ad.id, ad.identifier, ad.name, ad.trust_score;


-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Function to calculate and update agent trust score
CREATE OR REPLACE FUNCTION public.calculate_agent_trust_score(p_agent_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    v_score NUMERIC(3,2) := 0.50;  -- Base score
    v_record RECORD;
BEGIN
    FOR v_record IN
        SELECT outcome, user_feedback
        FROM public.agent_execution_log
        WHERE agent_id = p_agent_id
        AND started_at > now() - interval '30 days'
        ORDER BY started_at DESC
        LIMIT 100
    LOOP
        IF v_record.outcome = 'success' AND v_record.user_feedback = 'approved' THEN
            v_score := v_score + 0.02;
        ELSIF v_record.user_feedback = 'corrected' THEN
            v_score := v_score - 0.05;
        ELSIF v_record.user_feedback = 'rejected' THEN
            v_score := v_score - 0.10;
        ELSIF v_record.outcome = 'failed' THEN
            v_score := v_score - 0.08;
        END IF;
    END LOOP;

    -- Clamp between 0 and 1
    v_score := GREATEST(0, LEAST(1, v_score));

    -- Update the agent's trust score
    UPDATE public.agent_definitions
    SET trust_score = v_score, updated_at = now()
    WHERE id = p_agent_id;

    RETURN v_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Function to expire old pending actions
CREATE OR REPLACE FUNCTION public.expire_pending_actions()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.pending_actions
    SET status = 'expired'
    WHERE status = 'pending'
    AND expires_at IS NOT NULL
    AND expires_at < now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON TABLE public.pending_actions IS 'Queue of agent-recommended actions awaiting user approval or auto-execution';
COMMENT ON TABLE public.event_triggers IS 'Event-to-agent/workflow mappings for automated invocation';
COMMENT ON TABLE public.agent_training_examples IS 'User corrections to agent outputs for learning';
COMMENT ON TABLE public.workflow_executions IS 'Execution history for multi-step workflows';

COMMENT ON COLUMN public.pending_actions.confidence IS 'Agent confidence in this action (0-1), affects auto-execution eligibility';
COMMENT ON COLUMN public.pending_actions.reasoning IS 'Agent explanation for why this action was recommended';
COMMENT ON COLUMN public.event_triggers.conditions IS 'JSON conditions that must match for trigger to fire';
COMMENT ON COLUMN public.event_triggers.cron_expression IS 'Cron schedule for time-based triggers (e.g., "0 6 * * *")';
