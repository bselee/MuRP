-- Migration 162: Agent Activity Transparency System
--
-- Creates infrastructure for real-time agent activity visibility.
-- Part of: Agent Transparency & Human-in-the-Loop Architecture
--
-- Goals:
-- 1. Show EVERY agent decision as it happens
-- 2. Enable human approval gates for critical decisions
-- 3. Track agent performance for trust building
-- 4. Provide audit trail for all autonomous actions

-- ============================================================================
-- AGENT ACTIVITY LOG TABLE
-- Records every action, decision, and observation from agents
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Agent identification
    agent_identifier TEXT NOT NULL,
    execution_id UUID REFERENCES agent_execution_log(id) ON DELETE SET NULL,

    -- Activity classification
    activity_type TEXT NOT NULL CHECK (activity_type IN (
        'observation',    -- Agent noticed something (e.g., "Stock low on SKU123")
        'analysis',       -- Agent analyzed data (e.g., "Calculated ROP based on 90-day velocity")
        'decision',       -- Agent made a recommendation (e.g., "Recommend ordering 100 units")
        'action',         -- Agent executed something (e.g., "Created PO #12345")
        'completion',     -- Agent finished a workflow
        'error',          -- Something went wrong
        'checkpoint'      -- Paused for human review
    )),

    -- Human-readable activity details
    title TEXT NOT NULL,                    -- Short title (e.g., "Stockout Risk Detected")
    description TEXT,                       -- Longer description
    severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'error', 'critical')),

    -- Structured data
    reasoning JSONB DEFAULT '{}'::jsonb,    -- Why the agent made this decision
    input_data JSONB DEFAULT '{}'::jsonb,   -- What the agent was working with
    output_data JSONB DEFAULT '{}'::jsonb,  -- What the agent produced
    context JSONB DEFAULT '{}'::jsonb,      -- Additional context (SKUs, POs, vendors involved)

    -- Confidence and risk assessment
    confidence_score DECIMAL(3,2) CHECK (confidence_score BETWEEN 0 AND 1),
    risk_level TEXT CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    financial_impact DECIMAL(12,2),         -- Dollar amount if applicable

    -- Human review workflow
    requires_human_review BOOLEAN DEFAULT FALSE,
    human_reviewed_at TIMESTAMPTZ,
    human_reviewed_by UUID REFERENCES auth.users(id),
    human_approved BOOLEAN,
    human_feedback TEXT,

    -- Related entities for navigation
    related_po_id UUID,                     -- Link to purchase order if relevant
    related_vendor_id UUID REFERENCES vendors(id),
    related_invoice_id UUID,                -- Link to invoice if relevant
    related_sku TEXT,                       -- SKU if relevant

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_agent_activity_agent ON agent_activity_log(agent_identifier, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_activity_type ON agent_activity_log(activity_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_activity_recent ON agent_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_activity_review ON agent_activity_log(requires_human_review, human_reviewed_at)
    WHERE requires_human_review = TRUE AND human_reviewed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_agent_activity_execution ON agent_activity_log(execution_id);
CREATE INDEX IF NOT EXISTS idx_agent_activity_severity ON agent_activity_log(severity, created_at DESC)
    WHERE severity IN ('warning', 'error', 'critical');

-- ============================================================================
-- FUNCTION: Log Agent Activity
-- Standardized way for agents to log their activities
-- ============================================================================

CREATE OR REPLACE FUNCTION log_agent_activity(
    p_agent_identifier TEXT,
    p_activity_type TEXT,
    p_title TEXT,
    p_description TEXT DEFAULT NULL,
    p_severity TEXT DEFAULT 'info',
    p_reasoning JSONB DEFAULT '{}'::jsonb,
    p_input_data JSONB DEFAULT '{}'::jsonb,
    p_output_data JSONB DEFAULT '{}'::jsonb,
    p_context JSONB DEFAULT '{}'::jsonb,
    p_confidence_score DECIMAL DEFAULT NULL,
    p_risk_level TEXT DEFAULT NULL,
    p_financial_impact DECIMAL DEFAULT NULL,
    p_requires_review BOOLEAN DEFAULT FALSE,
    p_related_po_id UUID DEFAULT NULL,
    p_related_vendor_id UUID DEFAULT NULL,
    p_related_sku TEXT DEFAULT NULL,
    p_execution_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_activity_id UUID;
BEGIN
    INSERT INTO agent_activity_log (
        agent_identifier,
        execution_id,
        activity_type,
        title,
        description,
        severity,
        reasoning,
        input_data,
        output_data,
        context,
        confidence_score,
        risk_level,
        financial_impact,
        requires_human_review,
        related_po_id,
        related_vendor_id,
        related_sku
    ) VALUES (
        p_agent_identifier,
        p_execution_id,
        p_activity_type,
        p_title,
        p_description,
        p_severity,
        p_reasoning,
        p_input_data,
        p_output_data,
        p_context,
        p_confidence_score,
        p_risk_level,
        p_financial_impact,
        p_requires_review,
        p_related_po_id,
        p_related_vendor_id,
        p_related_sku
    )
    RETURNING id INTO v_activity_id;

    RETURN v_activity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: Record Human Review Decision
-- ============================================================================

CREATE OR REPLACE FUNCTION record_activity_review(
    p_activity_id UUID,
    p_approved BOOLEAN,
    p_feedback TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE agent_activity_log
    SET
        human_reviewed_at = NOW(),
        human_reviewed_by = p_user_id,
        human_approved = p_approved,
        human_feedback = p_feedback,
        updated_at = NOW()
    WHERE id = p_activity_id
      AND requires_human_review = TRUE;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- VIEW: Recent Agent Activity Stream
-- Optimized view for the real-time activity feed
-- ============================================================================

CREATE OR REPLACE VIEW agent_activity_stream AS
SELECT
    aal.id,
    aal.agent_identifier,
    -- Human-readable agent name
    INITCAP(REPLACE(REPLACE(aal.agent_identifier, '_', ' '), '-', ' ')) as agent_name,
    aal.activity_type,
    aal.title,
    aal.description,
    aal.severity,
    aal.reasoning,
    aal.output_data,
    aal.context,
    aal.confidence_score,
    aal.risk_level,
    aal.financial_impact,
    aal.requires_human_review,
    aal.human_reviewed_at,
    aal.human_approved,
    aal.human_feedback,
    aal.related_sku,
    aal.related_po_id,
    aal.related_vendor_id,
    v.name as vendor_name,
    aal.created_at,
    -- Time since activity
    CASE
        WHEN aal.created_at > NOW() - INTERVAL '1 minute' THEN 'Just now'
        WHEN aal.created_at > NOW() - INTERVAL '1 hour' THEN
            EXTRACT(MINUTES FROM (NOW() - aal.created_at))::INTEGER || 'm ago'
        WHEN aal.created_at > NOW() - INTERVAL '24 hours' THEN
            EXTRACT(HOURS FROM (NOW() - aal.created_at))::INTEGER || 'h ago'
        ELSE TO_CHAR(aal.created_at, 'Mon DD HH24:MI')
    END as time_ago
FROM agent_activity_log aal
LEFT JOIN vendors v ON aal.related_vendor_id = v.id
ORDER BY aal.created_at DESC;

-- ============================================================================
-- VIEW: Pending Agent Reviews
-- Items requiring human approval
-- ============================================================================

CREATE OR REPLACE VIEW pending_agent_reviews AS
SELECT
    aal.id,
    aal.agent_identifier,
    INITCAP(REPLACE(REPLACE(aal.agent_identifier, '_', ' '), '-', ' ')) as agent_name,
    aal.activity_type,
    aal.title,
    aal.description,
    aal.severity,
    aal.reasoning,
    aal.output_data,
    aal.context,
    aal.confidence_score,
    aal.risk_level,
    aal.financial_impact,
    aal.related_sku,
    aal.related_po_id,
    aal.related_vendor_id,
    v.name as vendor_name,
    aal.created_at,
    EXTRACT(EPOCH FROM (NOW() - aal.created_at)) / 60 as waiting_minutes
FROM agent_activity_log aal
LEFT JOIN vendors v ON aal.related_vendor_id = v.id
WHERE aal.requires_human_review = TRUE
  AND aal.human_reviewed_at IS NULL
ORDER BY
    CASE aal.risk_level
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        ELSE 4
    END,
    aal.created_at ASC;

-- ============================================================================
-- VIEW: Agent Performance Metrics (Last 30 Days)
-- For trust building and autonomy progression
-- ============================================================================

CREATE OR REPLACE VIEW agent_performance_metrics AS
SELECT
    agent_identifier,
    INITCAP(REPLACE(REPLACE(agent_identifier, '_', ' '), '-', ' ')) as agent_name,

    -- Activity counts
    COUNT(*) as total_activities,
    COUNT(*) FILTER (WHERE activity_type = 'action') as actions_taken,
    COUNT(*) FILTER (WHERE activity_type = 'decision') as decisions_made,
    COUNT(*) FILTER (WHERE activity_type = 'error') as errors,

    -- Review stats
    COUNT(*) FILTER (WHERE requires_human_review = TRUE) as required_reviews,
    COUNT(*) FILTER (WHERE requires_human_review = TRUE AND human_approved = TRUE) as approved_reviews,
    COUNT(*) FILTER (WHERE requires_human_review = TRUE AND human_approved = FALSE) as rejected_reviews,
    COUNT(*) FILTER (WHERE requires_human_review = TRUE AND human_reviewed_at IS NULL) as pending_reviews,

    -- Calculated metrics
    CASE
        WHEN COUNT(*) FILTER (WHERE requires_human_review = TRUE AND human_reviewed_at IS NOT NULL) > 0
        THEN ROUND(
            COUNT(*) FILTER (WHERE requires_human_review = TRUE AND human_approved = TRUE)::DECIMAL /
            COUNT(*) FILTER (WHERE requires_human_review = TRUE AND human_reviewed_at IS NOT NULL) * 100,
            1
        )
        ELSE NULL
    END as approval_rate_percent,

    -- Confidence stats
    ROUND(AVG(confidence_score) * 100, 1) as avg_confidence_percent,
    ROUND(MIN(confidence_score) * 100, 1) as min_confidence_percent,

    -- Financial stats
    COALESCE(SUM(financial_impact) FILTER (WHERE human_approved = TRUE OR NOT requires_human_review), 0) as total_financial_impact,

    -- Error rate
    CASE
        WHEN COUNT(*) > 0
        THEN ROUND(COUNT(*) FILTER (WHERE activity_type = 'error')::DECIMAL / COUNT(*) * 100, 1)
        ELSE 0
    END as error_rate_percent,

    -- Activity timeline
    MIN(created_at) as first_activity,
    MAX(created_at) as last_activity

FROM agent_activity_log
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY agent_identifier
ORDER BY total_activities DESC;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE agent_activity_log ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view activity
CREATE POLICY "Authenticated users can view agent activity"
    ON agent_activity_log FOR SELECT TO authenticated
    USING (true);

-- Service role can insert/update
CREATE POLICY "Service role can manage agent activity"
    ON agent_activity_log FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- Authenticated users can update reviews they're assigned
CREATE POLICY "Users can record their reviews"
    ON agent_activity_log FOR UPDATE TO authenticated
    USING (requires_human_review = TRUE)
    WITH CHECK (requires_human_review = TRUE);

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION log_agent_activity TO service_role;
GRANT EXECUTE ON FUNCTION record_activity_review TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE agent_activity_log IS
    'Records all agent activities for transparency, auditing, and human-in-the-loop workflows';

COMMENT ON VIEW agent_activity_stream IS
    'Real-time feed of agent activities for dashboard display';

COMMENT ON VIEW pending_agent_reviews IS
    'Queue of agent decisions awaiting human approval';

COMMENT ON VIEW agent_performance_metrics IS
    'Agent performance statistics for trust scoring and autonomy progression';

COMMENT ON FUNCTION log_agent_activity IS
    'Standardized function for agents to log their activities with full context';
