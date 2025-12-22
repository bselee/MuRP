-- Migration 109: Add user_id to email inbox configs for per-user connections
--
-- Enables individual users to connect their own Gmail accounts for PO monitoring.
-- Previously, inbox configs were org-wide; now they support both org-wide and personal inboxes.
--
-- Part of: User Email Connection Flow
-- Goal: Allow non-technical users to connect Gmail with one click

-- ============================================================================
-- ADD USER_ID COLUMN
-- ============================================================================

-- Add user_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'email_inbox_configs' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE email_inbox_configs
            ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Add inbox_type column to distinguish Gmail from other providers
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'email_inbox_configs' AND column_name = 'inbox_type'
    ) THEN
        ALTER TABLE email_inbox_configs
            ADD COLUMN inbox_type TEXT DEFAULT 'gmail' CHECK (inbox_type IN ('gmail', 'outlook', 'imap'));
    END IF;
END $$;

-- Add inbox_purpose column to distinguish purchasing vs accounting vs general
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'email_inbox_configs' AND column_name = 'inbox_purpose'
    ) THEN
        ALTER TABLE email_inbox_configs
            ADD COLUMN inbox_purpose TEXT DEFAULT 'purchasing' CHECK (inbox_purpose IN ('purchasing', 'accounting', 'general'));
    END IF;
END $$;

-- Add direct refresh token storage (encrypted at rest by Supabase)
-- This is in addition to the _ref columns for backwards compatibility
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'email_inbox_configs' AND column_name = 'gmail_refresh_token'
    ) THEN
        ALTER TABLE email_inbox_configs
            ADD COLUMN gmail_refresh_token TEXT;
    END IF;
END $$;

-- Add OAuth expiration tracking
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'email_inbox_configs' AND column_name = 'oauth_expires_at'
    ) THEN
        ALTER TABLE email_inbox_configs
            ADD COLUMN oauth_expires_at TIMESTAMPTZ;
    END IF;
END $$;

-- Add last sync timestamp
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'email_inbox_configs' AND column_name = 'last_sync_at'
    ) THEN
        ALTER TABLE email_inbox_configs
            ADD COLUMN last_sync_at TIMESTAMPTZ;
    END IF;
END $$;

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_email_inbox_user_id
    ON email_inbox_configs(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_inbox_user_active
    ON email_inbox_configs(user_id, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_email_inbox_purpose
    ON email_inbox_configs(inbox_purpose);

-- Unique constraint: one inbox per purpose per user (allows multiple purposes)
-- This allows a user to have both a purchasing AND an accounting email
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_inbox_user_purpose_unique
    ON email_inbox_configs(user_id, inbox_purpose) WHERE user_id IS NOT NULL;

-- ============================================================================
-- UPDATED RLS POLICIES
-- ============================================================================

-- Users can read their own inbox configs or org-wide configs (user_id IS NULL)
DROP POLICY IF EXISTS "Users can read own or org inbox configs" ON email_inbox_configs;
CREATE POLICY "Users can read own or org inbox configs"
    ON email_inbox_configs FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR user_id IS NULL);

-- Users can only modify their own inbox configs (not org-wide ones unless admin)
DROP POLICY IF EXISTS "Users can manage own inbox configs" ON email_inbox_configs;
CREATE POLICY "Users can manage own inbox configs"
    ON email_inbox_configs FOR ALL TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- WORKFLOW_EXECUTIONS TABLE (for logging workflow runs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_name TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL,
    success BOOLEAN NOT NULL,
    summary TEXT,
    pending_actions_count INTEGER DEFAULT 0,
    auto_executed_count INTEGER DEFAULT 0,
    errors JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_exec_user ON workflow_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_exec_name ON workflow_executions(workflow_name);
CREATE INDEX IF NOT EXISTS idx_workflow_exec_time ON workflow_executions(started_at DESC);

ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own workflow executions" ON workflow_executions;
CREATE POLICY "Users can read own workflow executions"
    ON workflow_executions FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can insert workflow executions" ON workflow_executions;
CREATE POLICY "Users can insert workflow executions"
    ON workflow_executions FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- ============================================================================
-- AGENT_CONFIGS TABLE (if not exists from migration 104)
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_identifier TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    autonomy_level TEXT DEFAULT 'monitor' CHECK (autonomy_level IN ('monitor', 'assist', 'autonomous')),
    is_active BOOLEAN DEFAULT true,
    trust_score DECIMAL(3,2) DEFAULT 0.70,
    parameters JSONB DEFAULT '{}'::jsonb,
    system_prompt TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_configs_identifier ON agent_configs(agent_identifier);
CREATE INDEX IF NOT EXISTS idx_agent_configs_active ON agent_configs(is_active) WHERE is_active = true;

ALTER TABLE agent_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read agent configs" ON agent_configs;
CREATE POLICY "Allow authenticated read agent configs"
    ON agent_configs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated manage agent configs" ON agent_configs;
CREATE POLICY "Allow authenticated manage agent configs"
    ON agent_configs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed default agent configs if table is empty
INSERT INTO agent_configs (agent_identifier, display_name, description, autonomy_level, trust_score)
SELECT * FROM (VALUES
    ('stockout_prevention', 'Stockout Prevention', 'Proactively identifies at-risk SKUs and recommends emergency orders before stock runs out.', 'assist', 0.91),
    ('traffic_controller', 'Air Traffic Controller', 'Intelligently prioritizes alerts based on actual impact. Reduces alert fatigue by surfacing only critical delays.', 'monitor', 0.72),
    ('email_tracking', 'Email Tracking Agent', 'Monitors purchasing email inbox(es), correlates vendor emails to POs, extracts tracking/ETA information.', 'assist', 0.80),
    ('inventory_guardian', 'Inventory Guardian', 'Monitors stock levels, predicts shortages, and triggers reorder alerts before stockouts occur.', 'assist', 0.88),
    ('po_intelligence', 'PO Intelligence', 'Analyzes purchase order patterns, predicts arrival times, and optimizes ordering schedules.', 'assist', 0.82),
    ('vendor_watchdog', 'Vendor Watchdog', 'Learns from vendor behavior, tracks lead times, and silently adjusts planning to prevent stockouts.', 'assist', 0.85),
    ('compliance_validator', 'Compliance Validator', 'Validates product labels against state regulations, flags missing warnings, and ensures compliance.', 'monitor', 0.89),
    ('price_hunter', 'Price Hunter', 'Tracks vendor pricing trends, identifies cost anomalies, and flags favorable buying opportunities.', 'monitor', 0.78),
    ('artwork_approval', 'Artwork Approval Agent', 'Manages artwork approval workflow, tracks SLA compliance, and escalates overdue approvals.', 'assist', 0.76),
    ('trust_score', 'Trust Score Agent', 'Measures progress toward autonomous operations. Tracks stockout prevention, touchless POs, and ETA accuracy.', 'autonomous', 0.94)
) AS v(agent_identifier, display_name, description, autonomy_level, trust_score)
WHERE NOT EXISTS (SELECT 1 FROM agent_configs LIMIT 1);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN email_inbox_configs.user_id IS
    'User who owns this inbox config. NULL = org-wide/shared inbox.';

COMMENT ON COLUMN email_inbox_configs.gmail_refresh_token IS
    'OAuth refresh token (encrypted at rest). Used for direct storage instead of env var references.';

COMMENT ON TABLE workflow_executions IS
    'Log of workflow orchestrator runs for audit and debugging.';

COMMENT ON TABLE agent_configs IS
    'Configuration for AI agents including autonomy levels and trust scores.';

-- ============================================================================
-- OAUTH_STATES TABLE (for CSRF protection in OAuth flows)
-- ============================================================================

CREATE TABLE IF NOT EXISTS oauth_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    state TEXT NOT NULL UNIQUE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL DEFAULT 'default',
    inbox_purpose TEXT CHECK (inbox_purpose IN ('purchasing', 'accounting', 'general')),
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_state ON oauth_states(state);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);

ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;

-- Service role needs full access for edge functions
DROP POLICY IF EXISTS "Service role manages oauth states" ON oauth_states;
CREATE POLICY "Service role manages oauth states"
    ON oauth_states FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Clean up expired states (can be run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
RETURNS void AS $$
BEGIN
    DELETE FROM oauth_states WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE oauth_states IS
    'Temporary storage for OAuth state tokens to prevent CSRF attacks.';

COMMENT ON COLUMN email_inbox_configs.inbox_purpose IS
    'Purpose of inbox: purchasing (PO tracking), accounting (invoices), or general.';
