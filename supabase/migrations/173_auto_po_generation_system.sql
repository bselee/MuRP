-- Migration: Auto PO Generation System
-- Purpose: Tables for automated PO generation with approval workflows and agent autonomy auditing

-- ═══════════════════════════════════════════════════════════════════════════
-- PO DRAFTS TABLE
-- ═══════════════════════════════════════════════════════════════════════════
-- Stores auto-generated PO drafts awaiting approval

CREATE TABLE IF NOT EXISTS public.po_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Vendor info
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
    vendor_name TEXT NOT NULL,

    -- Line items (JSONB array)
    items JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Totals
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    estimated_total NUMERIC(12,2) NOT NULL DEFAULT 0,

    -- Approval workflow
    approval_level TEXT NOT NULL DEFAULT 'manager' CHECK (approval_level IN ('auto', 'manager', 'director')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft',
        'pending_approval',
        'approved',
        'rejected',
        'submitted'
    )),

    -- Approval details
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    rejected_by UUID REFERENCES auth.users(id),
    rejected_at TIMESTAMPTZ,

    -- Conversion to PO
    converted_po_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,

    -- Metadata
    notes TEXT,
    source_agent_id UUID REFERENCES public.agent_definitions(id) ON DELETE SET NULL,
    trigger_context JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ  -- Auto-expire if not acted upon
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_po_drafts_status ON public.po_drafts(status);
CREATE INDEX IF NOT EXISTS idx_po_drafts_vendor_id ON public.po_drafts(vendor_id);
CREATE INDEX IF NOT EXISTS idx_po_drafts_created_at ON public.po_drafts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_po_drafts_approval_level ON public.po_drafts(approval_level) WHERE status = 'pending_approval';

-- RLS
ALTER TABLE public.po_drafts ENABLE ROW LEVEL SECURITY;

-- Users can view drafts (read-only for most users)
CREATE POLICY po_drafts_view ON public.po_drafts
    FOR SELECT
    USING (true);

-- Only managers/directors can approve
CREATE POLICY po_drafts_approve ON public.po_drafts
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles u
            WHERE u.id = auth.uid()
            AND (u.role IN ('Admin', 'Manager') OR u.department = 'Operations')
        )
    );

-- ═══════════════════════════════════════════════════════════════════════════
-- AGENT AUTONOMY AUDIT TABLE
-- ═══════════════════════════════════════════════════════════════════════════
-- Logs all autonomy checks for audit trail

CREATE TABLE IF NOT EXISTS public.agent_autonomy_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Agent reference
    agent_id UUID REFERENCES public.agent_definitions(id) ON DELETE SET NULL,
    agent_identifier TEXT NOT NULL,

    -- Action details
    action_type TEXT NOT NULL CHECK (action_type IN (
        'create_po',
        'send_email',
        'adjust_stock',
        'update_price',
        'update_rop',
        'update_lead_time',
        'flag_compliance',
        'schedule_followup',
        'notify_user',
        'approve_invoice',
        'execute_workflow'
    )),

    -- Check details (JSONB for flexibility)
    check_input JSONB NOT NULL DEFAULT '{}'::jsonb,
    check_result JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Outcome
    was_executed BOOLEAN NOT NULL DEFAULT false,
    execution_result TEXT CHECK (execution_result IN ('success', 'failure', 'rejected')),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_autonomy_audit_agent_id ON public.agent_autonomy_audit(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_autonomy_audit_action_type ON public.agent_autonomy_audit(action_type);
CREATE INDEX IF NOT EXISTS idx_agent_autonomy_audit_created_at ON public.agent_autonomy_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_autonomy_audit_was_executed ON public.agent_autonomy_audit(was_executed);

-- RLS
ALTER TABLE public.agent_autonomy_audit ENABLE ROW LEVEL SECURITY;

-- Admins can view audit log
CREATE POLICY agent_autonomy_audit_admin ON public.agent_autonomy_audit
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles u
            WHERE u.id = auth.uid()
            AND (u.role = 'Admin' OR u.department = 'Operations')
        )
    );

-- ═══════════════════════════════════════════════════════════════════════════
-- PO APPROVAL THRESHOLDS SETTING
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.app_settings (setting_key, setting_value, description, created_at, updated_at)
VALUES (
    'po_approval_thresholds',
    '{
        "autoApproveLimit": 1000,
        "managerApprovalLimit": 10000,
        "directorApprovalLimit": 10000,
        "minTrustScoreForAuto": 0.85
    }'::jsonb,
    'Thresholds for automatic PO approval based on dollar amount',
    now(),
    now()
)
ON CONFLICT (setting_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- AGENT GLOBAL EXCLUSIONS SETTING
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.app_settings (setting_key, setting_value, description, created_at, updated_at)
VALUES (
    'agent_global_exclusions',
    '{
        "categories": ["dropship", "discontinued", "deprecated", "Deprecating"],
        "skus": [],
        "vendors": []
    }'::jsonb,
    'Global exclusions applied to all agent autonomous actions',
    now(),
    now()
)
ON CONFLICT (setting_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- VIEWS
-- ═══════════════════════════════════════════════════════════════════════════

-- Pending drafts summary for dashboard
CREATE OR REPLACE VIEW public.po_drafts_summary AS
SELECT
    status,
    approval_level,
    COUNT(*) as count,
    SUM(estimated_total) as total_value,
    MIN(created_at) as oldest_draft,
    MAX(created_at) as newest_draft
FROM public.po_drafts
GROUP BY status, approval_level;

-- Agent autonomy stats
CREATE OR REPLACE VIEW public.agent_autonomy_stats AS
SELECT
    agent_id,
    agent_identifier,
    COUNT(*) as total_checks,
    COUNT(*) FILTER (WHERE was_executed = true) as executed_count,
    COUNT(*) FILTER (WHERE was_executed = false) as blocked_count,
    COUNT(*) FILTER (WHERE execution_result = 'success') as success_count,
    COUNT(*) FILTER (WHERE execution_result = 'rejected') as rejected_count,
    CASE
        WHEN COUNT(*) FILTER (WHERE was_executed = true) > 0
        THEN COUNT(*) FILTER (WHERE execution_result = 'success')::numeric /
             COUNT(*) FILTER (WHERE was_executed = true)::numeric
        ELSE 0
    END as success_rate
FROM public.agent_autonomy_audit
WHERE created_at > now() - interval '30 days'
GROUP BY agent_id, agent_identifier;

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to expire old drafts
CREATE OR REPLACE FUNCTION public.expire_po_drafts()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.po_drafts
    SET status = 'rejected',
        notes = COALESCE(notes, '') || ' [Auto-expired due to inactivity]',
        updated_at = now()
    WHERE status = 'pending_approval'
    AND expires_at IS NOT NULL
    AND expires_at < now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get agent autonomy summary
CREATE OR REPLACE FUNCTION public.get_agent_autonomy_summary(p_agent_id UUID)
RETURNS TABLE (
    action_type TEXT,
    total_checks BIGINT,
    allowed_count BIGINT,
    blocked_count BIGINT,
    success_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        aaa.action_type,
        COUNT(*) as total_checks,
        COUNT(*) FILTER (WHERE was_executed = true) as allowed_count,
        COUNT(*) FILTER (WHERE was_executed = false) as blocked_count,
        CASE
            WHEN COUNT(*) FILTER (WHERE was_executed = true) > 0
            THEN COUNT(*) FILTER (WHERE execution_result = 'success')::numeric /
                 COUNT(*) FILTER (WHERE was_executed = true)::numeric
            ELSE 0
        END as success_rate
    FROM public.agent_autonomy_audit aaa
    WHERE aaa.agent_id = p_agent_id
    AND aaa.created_at > now() - interval '30 days'
    GROUP BY aaa.action_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE public.po_drafts IS 'Auto-generated PO drafts awaiting approval in the PO generation workflow';
COMMENT ON TABLE public.agent_autonomy_audit IS 'Audit trail for all agent autonomy permission checks';
COMMENT ON COLUMN public.po_drafts.approval_level IS 'Required approval level: auto (no approval), manager, or director';
COMMENT ON COLUMN public.po_drafts.items IS 'Array of line items with sku, productName, quantity, unitCost, lineTotal, abcClass';
COMMENT ON COLUMN public.agent_autonomy_audit.check_input IS 'Input to autonomy check including action, targetValue, targetSku, etc.';
COMMENT ON COLUMN public.agent_autonomy_audit.check_result IS 'Result of autonomy check including allowed, reason, requiresApproval, bounds';
