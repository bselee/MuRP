-- Migration: 096_add_remaining_agents.sql
-- Description: Add the remaining 6 agents to agent_configs
-- Date: 2025-12-13
-- ============================================================================
-- ADD REMAINING AGENTS
-- ============================================================================
-- Insert the remaining agents that weren't in the original seed
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
VALUES 
    (
        'inventory_guardian',
        'Inventory Guardian',
        'Monitors stock levels, predicts shortages, and triggers reorder alerts before stockouts occur.',
        'assist',
        true,
        0.88,
        '{"reorder_threshold": 0.2, "check_interval": 3600}'::jsonb,
        'You are the Inventory Guardian agent. Your role is to monitor stock levels across all SKUs, predict potential shortages based on sales velocity, and trigger reorder alerts before stockouts occur. You operate in assist mode, recommending reorders that require human approval.'
    ),
    (
        'price_hunter',
        'Price Hunter',
        'Tracks vendor pricing trends, identifies cost anomalies, and flags favorable buying opportunities.',
        'monitor',
        true,
        0.78,
        '{"variance_threshold": 10, "compare_window": 90}'::jsonb,
        'You are the Price Hunter agent. Your role is to track vendor pricing trends across purchase orders, identify cost anomalies and price increases, and flag favorable buying opportunities. You operate in monitor mode, providing pricing intelligence without autonomous action.'
    ),
    (
        'po_intelligence',
        'PO Intelligence',
        'Analyzes purchase order patterns, predicts arrival times, and optimizes ordering schedules.',
        'assist',
        true,
        0.82,
        '{"pester_days": 7, "invoice_variance": 5}'::jsonb,
        'You are the PO Intelligence agent. Your role is to analyze purchase order patterns, predict arrival times based on vendor history, and optimize ordering schedules. You operate in assist mode, making recommendations for PO timing and quantities.'
    ),
    (
        'stockout_prevention',
        'Stockout Prevention',
        'Proactively identifies at-risk SKUs and recommends emergency orders before stock runs out.',
        'autonomous',
        true,
        0.91,
        '{"safety_buffer": 1.5, "forecast_days": 30}'::jsonb,
        'You are the Stockout Prevention agent. Your role is to proactively identify SKUs at risk of stockout based on current stock levels and sales velocity, then recommend or initiate emergency orders. You operate autonomously when trust score thresholds are met.'
    ),
    (
        'artwork_approval',
        'Artwork Approval Agent',
        'Manages artwork approval workflow, tracks SLA compliance, and escalates overdue approvals.',
        'assist',
        true,
        0.76,
        '{"approval_sla_hours": 24, "escalation_threshold_hours": 48, "auto_approve_repeat_customers": true}'::jsonb,
        'You are the Artwork Approval agent. Your role is to manage the artwork approval workflow, track SLA compliance for approval turnaround times, and escalate overdue approvals. You operate in assist mode, managing workflow automation with human oversight.'
    ),
    (
        'compliance_validator',
        'Compliance Validator',
        'Validates product labels against state regulations, flags missing warnings, and ensures compliance.',
        'monitor',
        true,
        0.89,
        '{"target_states": ["CA", "CO", "WA", "OR"], "strictness": "standard", "auto_flag_missing_warnings": true}'::jsonb,
        'You are the Compliance Validator agent. Your role is to validate product labels against state-specific regulations, flag missing required warnings (like Prop 65), and ensure compliance before production. You operate in monitor mode, flagging issues for human review.'
    )
ON CONFLICT (agent_identifier) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    autonomy_level = EXCLUDED.autonomy_level,
    parameters = EXCLUDED.parameters,
    system_prompt = EXCLUDED.system_prompt,
    updated_at = now();
