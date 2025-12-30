-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION 141: Vendor Follow-Up Agent Definition
-- ════════════════════════════════════════════════════════════════════════════
--
-- Creates the agent definition for the Vendor Follow-Up Agent and
-- sets up the scheduled trigger for automated execution.
-- ════════════════════════════════════════════════════════════════════════════

-- Insert agent definition
INSERT INTO agent_definitions (
  identifier,
  name,
  description,
  system_prompt,
  is_active,
  autonomy_level,
  trust_score,
  parameters,
  capabilities
) VALUES (
  'vendor-followup',
  'Vendor Follow-Up Agent',
  'Monitors vendor response status, sends follow-up emails for unresponsive vendors, and flags responses requiring action (questions, delays, issues). Respects vendor activity across all threads to avoid nagging.',
  'You are the Vendor Follow-Up Agent. Your job is to ensure timely vendor communication by: 1) Identifying POs awaiting vendor response for 48+ hours, 2) Classifying vendor responses (confirmation, question, delay, etc.), 3) Suggesting or sending follow-up emails, 4) Avoiding nagging vendors who are actively communicating on other threads.',
  true,
  'assist',
  0.75,
  jsonb_build_object(
    'followup_threshold_hours', 48,
    'max_followups', 3,
    'skip_if_vendor_active_hours', 48,
    'auto_send_enabled', false
  ),
  '["check_pending_followups", "classify_vendor_responses", "send_followup_email", "escalate_unresponsive", "cross_thread_correlation"]'::jsonb
)
ON CONFLICT (identifier) DO UPDATE SET
  description = EXCLUDED.description,
  parameters = EXCLUDED.parameters,
  capabilities = EXCLUDED.capabilities,
  updated_at = NOW();

-- Create scheduled trigger for the agent (runs every 2 hours during business hours)
INSERT INTO event_triggers (
  event_type,
  agent_id,
  cron_expression,
  is_active,
  conditions
) VALUES (
  'schedule.cron',
  (SELECT id FROM agent_definitions WHERE identifier = 'vendor-followup'),
  '0 15,17,19,21,23 * * 1-5',  -- 8am, 10am, 12pm, 2pm, 4pm MT (Mon-Fri)
  true,
  jsonb_build_object(
    'schedule', 'every_2_hours',
    'business_hours_only', true,
    'timezone', 'America/Denver',
    'description', 'Check for vendor follow-ups every 2 hours during business hours'
  )
)
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- FUNCTION: Execute vendor follow-up agent via scheduled runner
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION execute_vendor_followup_agent()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_autonomy TEXT;
  v_pending_count INTEGER;
  v_actions_count INTEGER;
  v_responses_count INTEGER;
  v_skipped_count INTEGER;
BEGIN
  -- Get agent autonomy level
  SELECT autonomy_level INTO v_autonomy
  FROM agent_definitions
  WHERE identifier = 'vendor-followup'
    AND is_active = true;

  IF v_autonomy IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Agent not active or not found'
    );
  END IF;

  -- Count pending follow-ups (excluding recently active vendors)
  SELECT COUNT(*) INTO v_pending_count
  FROM pending_vendor_followups
  WHERE vendor_recently_active = false
    AND urgency IN ('critical', 'high', 'medium');

  -- Count responses needing action
  SELECT COUNT(*) INTO v_responses_count
  FROM vendor_responses_needing_action;

  -- Generate new alerts
  SELECT generate_followup_alerts() INTO v_actions_count;

  -- Run cross-thread correlation
  PERFORM correlate_vendor_responses();

  -- Count skipped due to recent activity
  SELECT COUNT(*) INTO v_skipped_count
  FROM pending_vendor_followups
  WHERE vendor_recently_active = true;

  -- Build result
  v_result := jsonb_build_object(
    'success', true,
    'run_at', NOW(),
    'autonomy_level', v_autonomy,
    'stats', jsonb_build_object(
      'pending_followups', v_pending_count,
      'responses_needing_action', v_responses_count,
      'new_alerts_generated', v_actions_count,
      'skipped_recently_active', v_skipped_count
    )
  );

  -- Log execution
  INSERT INTO workflow_executions (
    workflow_id,
    status,
    started_at,
    completed_at,
    result_summary
  ) VALUES (
    'vendor-followup-agent',
    'completed',
    NOW(),
    NOW(),
    v_result
  );

  RETURN v_result;
END;
$$;

-- Note: Scheduling is handled via the event_triggers table and
-- the scheduled-agent-runner edge function, not pg_cron directly

-- Log agent creation
DO $$
DECLARE
  v_agent_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_agent_count
  FROM agent_definitions
  WHERE identifier = 'vendor-followup';

  RAISE NOTICE 'Vendor Follow-Up Agent configured: %', v_agent_count;
END $$;
