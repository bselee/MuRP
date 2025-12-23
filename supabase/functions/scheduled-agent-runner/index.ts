/**
 * Scheduled Agent Runner
 *
 * Edge function that runs scheduled agent triggers.
 * Called every 15 minutes via pg_cron.
 *
 * This function:
 * 1. Queries event_triggers where cron_expression is set and is_active = true
 * 2. For each trigger, checks if the cron matches the current time
 * 3. Executes the associated agent by creating an execution log entry
 * 4. Also runs periodic checks for overdue POs and expiring compliance
 *
 * Schedule via migration:
 *   SELECT cron.schedule('agent-runner-15min', '*/15 * * * *', ...);
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================
// CRON MATCHING (matches eventBus.ts logic)
// ============================================================

function cronMatches(expression: string, date: Date = new Date()): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  const checks = [
    { field: minute, value: date.getMinutes() },
    { field: hour, value: date.getHours() },
    { field: dayOfMonth, value: date.getDate() },
    { field: month, value: date.getMonth() + 1 },
    { field: dayOfWeek, value: date.getDay() },
  ];

  return checks.every(({ field, value }) => matchesCronField(field, value));
}

function matchesCronField(field: string, value: number): boolean {
  if (field === '*') return true;
  if (field === String(value)) return true;
  if (field.includes(',')) return field.split(',').map(Number).includes(value);
  if (field.includes('-')) {
    const [start, end] = field.split('-').map(Number);
    return value >= start && value <= end;
  }
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10);
    return value % step === 0;
  }
  return false;
}

// ============================================================
// MAIN HANDLER
// ============================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  const now = new Date();
  const results = {
    success: true,
    timestamp: now.toISOString(),
    triggersChecked: 0,
    triggersExecuted: 0,
    overduePoEvents: 0,
    expiringComplianceEvents: 0,
    executionDetails: [] as any[],
    errors: [] as string[],
  };

  try {
    console.log('[scheduled-agent-runner] Starting at', now.toISOString());

    // ============================================================
    // 1. GET AND RUN DUE CRON TRIGGERS
    // ============================================================

    const { data: cronTriggers, error: triggerError } = await supabase
      .from('event_triggers')
      .select(`
        id,
        event_type,
        agent_id,
        workflow_id,
        conditions,
        cron_expression,
        last_triggered_at,
        agent_definitions!event_triggers_agent_id_fkey (
          id, identifier, name, is_active, capabilities
        )
      `)
      .eq('is_active', true)
      .not('cron_expression', 'is', null);

    if (triggerError) {
      console.error('[scheduled-agent-runner] Trigger query error:', triggerError);
      results.errors.push(`Trigger query: ${triggerError.message}`);
    }

    for (const trigger of cronTriggers || []) {
      results.triggersChecked++;

      // Check if cron matches current time
      if (!trigger.cron_expression || !cronMatches(trigger.cron_expression, now)) {
        continue;
      }

      // Prevent double-runs within 14 minutes
      if (trigger.last_triggered_at) {
        const lastRun = new Date(trigger.last_triggered_at);
        const minutesSince = (now.getTime() - lastRun.getTime()) / (1000 * 60);
        if (minutesSince < 14) {
          console.log(`[scheduled-agent-runner] Skipping ${trigger.id} - ran ${minutesSince.toFixed(0)}m ago`);
          continue;
        }
      }

      // Get agent details
      const agent = (trigger as any).agent_definitions;
      if (!agent || !agent.is_active) {
        console.log(`[scheduled-agent-runner] Skipping ${trigger.id} - agent inactive`);
        continue;
      }

      console.log(`[scheduled-agent-runner] Executing agent: ${agent.identifier}`);

      // Create execution log
      const { data: execLog } = await supabase
        .from('agent_execution_log')
        .insert({
          agent_id: agent.id,
          agent_identifier: agent.identifier,
          trigger_type: 'scheduled',
          trigger_value: trigger.cron_expression,
          status: 'completed',
          started_at: now.toISOString(),
          completed_at: new Date().toISOString(),
          duration_ms: 0,
          findings_count: 0,
          actions_proposed: 0,
          actions_executed: 0,
          outcome: 'success',
          output: {
            triggerId: trigger.id,
            cronExpression: trigger.cron_expression,
            conditions: trigger.conditions,
            note: 'Scheduled execution logged - full capability execution runs in frontend/API context',
          },
        })
        .select('id')
        .single();

      // Update trigger timestamp
      await supabase
        .from('event_triggers')
        .update({
          last_triggered_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', trigger.id);

      // Update agent usage
      await supabase.rpc('increment_agent_usage', { agent_identifier: agent.identifier });

      results.triggersExecuted++;
      results.executionDetails.push({
        triggerId: trigger.id,
        agentIdentifier: agent.identifier,
        cronExpression: trigger.cron_expression,
        executionLogId: execLog?.id,
      });
    }

    // ============================================================
    // 2. CHECK FOR OVERDUE POs (every 4 hours)
    // ============================================================

    const hour = now.getHours();
    if (hour % 4 === 0 && now.getMinutes() < 15) {
      const { data: overduePOs } = await supabase
        .from('purchase_orders')
        .select('id, order_id, vendor_id, expected_date')
        .lt('expected_date', now.toISOString())
        .in('status', ['sent', 'pending', 'confirmed'])
        .limit(100);

      // Find po.overdue triggers
      const { data: poOverdueTriggers } = await supabase
        .from('event_triggers')
        .select('id, agent_id')
        .eq('event_type', 'po.overdue')
        .eq('is_active', true);

      for (const po of overduePOs || []) {
        for (const trigger of poOverdueTriggers || []) {
          if (!trigger.agent_id) continue;

          const { data: agent } = await supabase
            .from('agent_definitions')
            .select('id, identifier, is_active')
            .eq('id', trigger.agent_id)
            .single();

          if (!agent?.is_active) continue;

          // Log the event-triggered execution
          await supabase.from('agent_execution_log').insert({
            agent_id: agent.id,
            agent_identifier: agent.identifier,
            trigger_type: 'event',
            trigger_value: `po.overdue:${po.order_id}`,
            status: 'completed',
            started_at: now.toISOString(),
            completed_at: new Date().toISOString(),
            outcome: 'success',
            output: { poId: po.id, orderId: po.order_id, eventType: 'po.overdue' },
          });

          results.overduePoEvents++;
        }
      }

      console.log(`[scheduled-agent-runner] Overdue PO check: ${overduePOs?.length || 0} POs, ${results.overduePoEvents} events`);
    }

    // ============================================================
    // 3. CHECK FOR EXPIRING COMPLIANCE (daily at 8 AM)
    // ============================================================

    if (hour === 8 && now.getMinutes() < 15) {
      const thirtyDaysOut = new Date(now);
      thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);

      const { data: expiringDocs } = await supabase
        .from('compliance_documents')
        .select('id, name, expiry_date, state')
        .lt('expiry_date', thirtyDaysOut.toISOString())
        .gt('expiry_date', now.toISOString())
        .limit(100);

      // Find compliance.expiring triggers
      const { data: complianceTriggers } = await supabase
        .from('event_triggers')
        .select('id, agent_id')
        .eq('event_type', 'compliance.expiring')
        .eq('is_active', true);

      for (const doc of expiringDocs || []) {
        for (const trigger of complianceTriggers || []) {
          if (!trigger.agent_id) continue;

          const { data: agent } = await supabase
            .from('agent_definitions')
            .select('id, identifier, is_active')
            .eq('id', trigger.agent_id)
            .single();

          if (!agent?.is_active) continue;

          await supabase.from('agent_execution_log').insert({
            agent_id: agent.id,
            agent_identifier: agent.identifier,
            trigger_type: 'event',
            trigger_value: `compliance.expiring:${doc.name}`,
            status: 'completed',
            started_at: now.toISOString(),
            completed_at: new Date().toISOString(),
            outcome: 'success',
            output: { documentId: doc.id, name: doc.name, eventType: 'compliance.expiring' },
          });

          results.expiringComplianceEvents++;
        }
      }

      console.log(`[scheduled-agent-runner] Compliance check: ${expiringDocs?.length || 0} docs, ${results.expiringComplianceEvents} events`);
    }

    // ============================================================
    // DONE
    // ============================================================

    const duration = Date.now() - startTime;
    console.log(`[scheduled-agent-runner] Completed in ${duration}ms`, results);

    return new Response(JSON.stringify({
      ...results,
      duration_ms: duration,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[scheduled-agent-runner] Fatal error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - startTime,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
