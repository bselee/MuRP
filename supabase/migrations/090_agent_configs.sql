-- Migration: 090_agent_configs.sql
-- Description: Agent Command Center configuration persistence
-- Part of: MuRP 2.0 Autonomous Agent System
-- Date: 2025-12-11
-- ============================================================================
-- AGENT CONFIGURATION TABLE
-- ============================================================================
-- Store configuration for autonomous agents
CREATE TABLE IF NOT EXISTS agent_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Agent Identity
    agent_identifier text UNIQUE NOT NULL,
    display_name text NOT NULL,
    description text,
    -- Autonomy Settings
    autonomy_level text NOT NULL DEFAULT 'monitor' CHECK (
        autonomy_level IN ('monitor', 'assist', 'autonomous')
    ),
    is_active boolean DEFAULT true,
    -- Performance Metrics
    trust_score decimal(3, 2) DEFAULT 0.50 CHECK (
        trust_score >= 0
        AND trust_score <= 1
    ),
    -- Configuration
    parameters jsonb DEFAULT '{}'::jsonb,
    system_prompt text,
    -- Metadata
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_agent_configs_identifier ON agent_configs(agent_identifier);
CREATE INDEX IF NOT EXISTS idx_agent_configs_active ON agent_configs(is_active)
WHERE is_active = true;
-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE agent_configs ENABLE ROW LEVEL SECURITY;
-- Allow authenticated users to read agent configs
CREATE POLICY "Allow authenticated users to read agent configs" ON agent_configs FOR
SELECT TO authenticated USING (true);
-- Allow authenticated users to update agent configs
CREATE POLICY "Allow authenticated users to update agent configs" ON agent_configs FOR
UPDATE TO authenticated USING (true) WITH CHECK (true);
-- ============================================================================
-- SEED DATA
-- ============================================================================
-- Insert the three core agents
INSERT INTO agent_configs (
        agent_identifier,
        display_name,
        description,
        autonomy_level,
        is_active,
        trust_score,
        parameters,
        system_prompt
    )
VALUES (
        'vendor_watchdog',
        'Vendor Watchdog',
        'Learns from vendor behavior, tracks lead times, and silently adjusts planning to prevent stockouts.',
        'assist',
        true,
        0.85,
        '{}'::jsonb,
        'You are the Vendor Watchdog agent. Your role is to monitor vendor performance, learn actual lead times, and adjust planning parameters to prevent stockouts. You operate in assist mode, making recommendations that require human approval before implementation.'
    ),
    (
        'traffic_controller',
        'Air Traffic Controller',
        'Intelligently prioritizes alerts based on actual impact. Reduces alert fatigue by surfacing only critical delays.',
        'monitor',
        true,
        0.72,
        '{}'::jsonb,
        'You are the Air Traffic Controller agent. Your role is to assess PO delays and prioritize alerts based on actual stock impact. You operate in monitor mode, providing insights and recommendations without taking autonomous action.'
    ),
    (
        'trust_score',
        'Trust Score Agent',
        'Measures progress toward autonomous operations. Tracks stockout prevention, touchless POs, and ETA accuracy.',
        'autonomous',
        true,
        0.94,
        '{}'::jsonb,
        'You are the Trust Score agent. Your role is to measure and report on the performance of autonomous systems. You track key metrics like stockout prevention rate, touchless PO rate, and ETA accuracy. You operate autonomously, continuously monitoring and reporting without human intervention.'
    ) ON CONFLICT (agent_identifier) DO NOTHING;
-- ============================================================================
-- TRIGGER FOR UPDATED_AT
-- ============================================================================
CREATE OR REPLACE FUNCTION update_agent_configs_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER agent_configs_updated_at BEFORE
UPDATE ON agent_configs FOR EACH ROW EXECUTE FUNCTION update_agent_configs_updated_at();
-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE agent_configs IS 'Agent Command Center: Configuration and settings for autonomous agents';
COMMENT ON COLUMN agent_configs.agent_identifier IS 'Machine-readable unique identifier (e.g., vendor_watchdog)';
COMMENT ON COLUMN agent_configs.autonomy_level IS 'Level of autonomy: monitor (observe only), assist (recommend), autonomous (act independently)';
COMMENT ON COLUMN agent_configs.trust_score IS 'Performance score from 0.0 to 1.0 based on historical accuracy';
COMMENT ON COLUMN agent_configs.parameters IS 'Agent-specific configuration parameters as JSON';
COMMENT ON COLUMN agent_configs.system_prompt IS 'AI system prompt that defines agent behavior and constraints';