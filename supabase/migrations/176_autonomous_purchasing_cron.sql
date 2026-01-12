-- ════════════════════════════════════════════════════════════════════════════
-- Migration 176: Autonomous Purchasing Cron Job
-- ════════════════════════════════════════════════════════════════════════════
-- Sets up scheduled job for daily autonomous purchasing workflow
-- Runs at 6:00 AM UTC daily (before business hours)
-- ════════════════════════════════════════════════════════════════════════════

-- Create agent_action_audit table for tracking autonomous decisions
CREATE TABLE IF NOT EXISTS agent_action_audit (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    agent_id TEXT NOT NULL,
    agent_name TEXT,
    action_type TEXT NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ('approved', 'denied', 'escalated')),
    trust_score_at_action DECIMAL(5,4),
    autonomy_level TEXT,
    target_value DECIMAL(12,2),
    target_sku TEXT,
    target_vendor_id UUID,
    context JSONB,
    execution_success BOOLEAN,
    execution_result JSONB,
    execution_error TEXT,
    executed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_agent_action_audit_agent ON agent_action_audit(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_action_audit_created ON agent_action_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_action_audit_action ON agent_action_audit(action_type);

-- Enable RLS
ALTER TABLE agent_action_audit ENABLE ROW LEVEL SECURITY;

-- RLS policies for agent_action_audit
CREATE POLICY "Allow authenticated read" ON agent_action_audit
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow service role full access" ON agent_action_audit
    FOR ALL TO service_role USING (true);

-- Create po_drafts table if not exists (for auto-generated PO drafts)
CREATE TABLE IF NOT EXISTS po_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID REFERENCES vendors(id),
    vendor_name TEXT,
    items JSONB NOT NULL,
    subtotal DECIMAL(12,2),
    estimated_total DECIMAL(12,2),
    approval_level TEXT CHECK (approval_level IN ('auto', 'manager', 'director')),
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'submitted')),
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for po_drafts
CREATE INDEX IF NOT EXISTS idx_po_drafts_status ON po_drafts(status);
CREATE INDEX IF NOT EXISTS idx_po_drafts_vendor ON po_drafts(vendor_id);
CREATE INDEX IF NOT EXISTS idx_po_drafts_created ON po_drafts(created_at DESC);

-- Enable RLS on po_drafts
ALTER TABLE po_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read po_drafts" ON po_drafts
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert po_drafts" ON po_drafts
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update po_drafts" ON po_drafts
    FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow service role full access po_drafts" ON po_drafts
    FOR ALL TO service_role USING (true);

-- Create agent_autonomy_audit table for permission check logging
CREATE TABLE IF NOT EXISTS agent_autonomy_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL,
    agent_identifier TEXT,
    action_type TEXT NOT NULL,
    check_input JSONB,
    check_result JSONB,
    was_executed BOOLEAN DEFAULT false,
    execution_result TEXT CHECK (execution_result IN ('success', 'failure', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for agent_autonomy_audit
CREATE INDEX IF NOT EXISTS idx_agent_autonomy_audit_agent ON agent_autonomy_audit(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_autonomy_audit_created ON agent_autonomy_audit(created_at DESC);

-- Enable RLS
ALTER TABLE agent_autonomy_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read autonomy_audit" ON agent_autonomy_audit
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert autonomy_audit" ON agent_autonomy_audit
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow service role full access autonomy_audit" ON agent_autonomy_audit
    FOR ALL TO service_role USING (true);

-- Function to increment agent trust score
CREATE OR REPLACE FUNCTION increment_agent_trust_score(
    p_agent_id TEXT,
    p_delta DECIMAL(5,4),
    p_max_score DECIMAL(5,4) DEFAULT 0.99
)
RETURNS DECIMAL(5,4) AS $$
DECLARE
    v_current_score DECIMAL(5,4);
    v_new_score DECIMAL(5,4);
BEGIN
    -- Get current score
    SELECT COALESCE(trust_score, 0.5) INTO v_current_score
    FROM agent_definitions
    WHERE identifier = p_agent_id;

    IF v_current_score IS NULL THEN
        RETURN NULL;
    END IF;

    -- Calculate new score with bounds
    v_new_score := GREATEST(0, LEAST(p_max_score, v_current_score + p_delta));

    -- Update the agent
    UPDATE agent_definitions
    SET trust_score = v_new_score,
        updated_at = NOW()
    WHERE identifier = p_agent_id;

    RETURN v_new_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule the autonomous purchasing workflow to run daily at 6 AM UTC
-- This calls an edge function that runs the full workflow
SELECT cron.schedule(
    'autonomous-purchasing-daily',
    '0 6 * * *',  -- 6:00 AM UTC daily
    $$
    SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/scheduled-agent-runner',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        ),
        body := jsonb_build_object(
            'workflow', 'autonomous_purchasing',
            'options', jsonb_build_object(
                'maxPOs', 10,
                'dryRun', false
            )
        )
    );
    $$
) ON CONFLICT (jobname) DO UPDATE SET schedule = '0 6 * * *';

-- Also run a lighter check at noon for critical items only
SELECT cron.schedule(
    'autonomous-purchasing-midday',
    '0 12 * * 1-5',  -- 12:00 PM UTC, weekdays only
    $$
    SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/scheduled-agent-runner',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        ),
        body := jsonb_build_object(
            'workflow', 'autonomous_purchasing',
            'options', jsonb_build_object(
                'maxPOs', 5,
                'abcClassFilter', ARRAY['A'],
                'dryRun', false
            )
        )
    );
    $$
) ON CONFLICT (jobname) DO UPDATE SET schedule = '0 12 * * 1-5';

-- Add comment
COMMENT ON TABLE agent_action_audit IS 'Audit trail for all autonomous agent actions';
COMMENT ON TABLE po_drafts IS 'Auto-generated PO drafts awaiting approval';
COMMENT ON TABLE agent_autonomy_audit IS 'Permission check logs for autonomy gate decisions';
