/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔔 VENDOR FOLLOW-UP AGENT - Automated Vendor Response Management
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This agent monitors vendor responses and takes action based on:
 * 1. Pending follow-ups (vendors who haven't responded in 48+ hours)
 * 2. Response classification (questions, delays, issues that need action)
 * 3. Vendor engagement scoring
 *
 * Actions based on autonomy level:
 * - MONITOR: Log alerts only, no actions
 * - ASSIST: Queue suggested actions for user approval
 * - AUTONOMOUS: Send follow-up emails automatically
 *
 * @module services/vendorFollowUpAgent
 */

import { supabase } from '../lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 Types
// ═══════════════════════════════════════════════════════════════════════════

export interface PendingFollowUp {
  thread_id: string;
  finale_po_id: string | null;
  po_number: string | null;
  vendor_name: string | null;
  subject: string | null;
  days_since_outbound: number;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  suggested_action: string | null;
  vendor_recently_active: boolean;
  primary_vendor_email: string | null;
}

export interface ResponseNeedingAction {
  thread_id: string;
  finale_po_id: string | null;
  po_number: string | null;
  vendor_name: string | null;
  last_response_type: string;
  response_action_type: string | null;
  urgency: string;
  priority: string;
  hours_since_response: number;
}

export interface FollowUpAgentResult {
  success: boolean;
  run_at: string;
  autonomy_level: 'monitor' | 'assist' | 'autonomous';
  stats: {
    pending_followups_found: number;
    responses_needing_action: number;
    actions_queued: number;
    actions_executed: number;
    skipped_recently_active: number;
  };
  actions: FollowUpAction[];
  errors: string[];
}

export interface FollowUpAction {
  type: 'send_followup' | 'escalate' | 'respond_to_vendor' | 'review_delay';
  thread_id: string;
  po_number: string | null;
  vendor_name: string | null;
  priority: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  status: 'queued' | 'executed' | 'skipped';
  result?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 Core Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run the vendor follow-up agent
 * Analyzes pending follow-ups and responses needing action
 */
export async function runVendorFollowUpAgent(
  autonomyLevel: 'monitor' | 'assist' | 'autonomous' = 'assist'
): Promise<FollowUpAgentResult> {
  const result: FollowUpAgentResult = {
    success: true,
    run_at: new Date().toISOString(),
    autonomy_level: autonomyLevel,
    stats: {
      pending_followups_found: 0,
      responses_needing_action: 0,
      actions_queued: 0,
      actions_executed: 0,
      skipped_recently_active: 0,
    },
    actions: [],
    errors: [],
  };

  try {
    // 1. Get pending follow-ups (vendors who haven't responded)
    const { data: pendingFollowups, error: followupError } = await supabase
      .from('pending_vendor_followups')
      .select('*')
      .order('days_since_outbound', { ascending: false });

    if (followupError) {
      result.errors.push(`Failed to fetch pending followups: ${followupError.message}`);
    } else if (pendingFollowups) {
      result.stats.pending_followups_found = pendingFollowups.length;

      for (const followup of pendingFollowups as PendingFollowUp[]) {
        // Skip if vendor is recently active (sent email elsewhere)
        if (followup.vendor_recently_active) {
          result.stats.skipped_recently_active++;
          continue;
        }

        // Skip low urgency (less than 48 hours)
        if (followup.urgency === 'low') continue;

        const action: FollowUpAction = {
          type: followup.urgency === 'critical' ? 'escalate' : 'send_followup',
          thread_id: followup.thread_id,
          po_number: followup.po_number,
          vendor_name: followup.vendor_name,
          priority: followup.urgency,
          description: followup.suggested_action ||
            `No response from ${followup.vendor_name} for ${followup.days_since_outbound.toFixed(1)} days`,
          status: 'queued',
        };

        if (autonomyLevel === 'autonomous' && followup.urgency !== 'critical') {
          // Auto-execute non-critical follow-ups
          const sendResult = await sendFollowUpEmail(followup);
          action.status = sendResult.success ? 'executed' : 'queued';
          action.result = sendResult.message;
          if (sendResult.success) {
            result.stats.actions_executed++;
          }
        } else {
          // Queue for user approval
          await queueAction(action);
          result.stats.actions_queued++;
        }

        result.actions.push(action);
      }
    }

    // 2. Get responses that need action (vendor asked a question, etc.)
    const { data: responsesNeeding, error: responseError } = await supabase
      .from('vendor_responses_needing_action')
      .select('*')
      .order('hours_since_response', { ascending: true });

    if (responseError) {
      result.errors.push(`Failed to fetch responses needing action: ${responseError.message}`);
    } else if (responsesNeeding) {
      result.stats.responses_needing_action = responsesNeeding.length;

      for (const response of responsesNeeding as ResponseNeedingAction[]) {
        const action: FollowUpAction = {
          type: response.last_response_type === 'delay_notice' ? 'review_delay' : 'respond_to_vendor',
          thread_id: response.thread_id,
          po_number: response.po_number,
          vendor_name: response.vendor_name,
          priority: response.priority as any || 'medium',
          description: response.response_action_type ||
            `Vendor ${response.vendor_name} needs a response (${response.last_response_type})`,
          status: 'queued',
        };

        // Always queue these for human review (vendor asked a question)
        await queueAction(action);
        result.stats.actions_queued++;
        result.actions.push(action);
      }
    }

    // 3. Generate new alerts for newly identified issues
    const { data: alertsGenerated } = await supabase.rpc('generate_followup_alerts');
    if (alertsGenerated && alertsGenerated > 0) {
      console.log(`[vendorFollowUpAgent] Generated ${alertsGenerated} new alerts`);
    }

    // 4. Run cross-thread correlation
    const { data: correlationsFound } = await supabase.rpc('correlate_vendor_responses');
    if (correlationsFound && correlationsFound > 0) {
      console.log(`[vendorFollowUpAgent] Found ${correlationsFound} cross-thread correlations`);
    }

  } catch (error: any) {
    result.success = false;
    result.errors.push(error.message || String(error));
  }

  // Log the run
  await logAgentRun(result);

  return result;
}

/**
 * Send a follow-up email for a pending thread
 */
async function sendFollowUpEmail(followup: PendingFollowUp): Promise<{ success: boolean; message: string }> {
  try {
    if (!followup.primary_vendor_email) {
      return { success: false, message: 'No vendor email address' };
    }

    // Call the follow-up runner edge function
    const { data, error } = await supabase.functions.invoke('po-followup-runner', {
      body: {
        thread_id: followup.thread_id,
        po_number: followup.po_number,
        vendor_email: followup.primary_vendor_email,
        mode: 'single',
      },
    });

    if (error) {
      return { success: false, message: error.message };
    }

    // Update thread status
    await supabase
      .from('email_threads')
      .update({
        followup_count: (await getFollowupCount(followup.thread_id)) + 1,
        last_followup_at: new Date().toISOString(),
        vendor_response_status: 'followup_sent',
        needs_followup: false,
        followup_due_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', followup.thread_id);

    return { success: true, message: 'Follow-up email sent' };
  } catch (error: any) {
    return { success: false, message: error.message || 'Unknown error' };
  }
}

async function getFollowupCount(threadId: string): Promise<number> {
  const { data } = await supabase
    .from('email_threads')
    .select('followup_count')
    .eq('id', threadId)
    .single();
  return data?.followup_count || 0;
}

/**
 * Queue an action for user approval
 */
async function queueAction(action: FollowUpAction): Promise<void> {
  try {
    await supabase.from('pending_actions_queue').insert({
      agent_identifier: 'vendor-followup',
      action_type: action.type,
      priority: action.priority,
      title: `${action.type === 'send_followup' ? 'Follow up' : 'Action needed'}: ${action.vendor_name || 'Unknown'} - PO ${action.po_number || 'N/A'}`,
      description: action.description,
      context: {
        thread_id: action.thread_id,
        po_number: action.po_number,
        vendor_name: action.vendor_name,
      },
      status: 'pending',
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[vendorFollowUpAgent] Failed to queue action:', error);
  }
}

/**
 * Log agent run for tracking
 */
async function logAgentRun(result: FollowUpAgentResult): Promise<void> {
  try {
    await supabase.from('workflow_executions').insert({
      workflow_id: 'vendor-followup-agent',
      status: result.success ? 'completed' : 'failed',
      started_at: result.run_at,
      completed_at: new Date().toISOString(),
      result_summary: {
        ...result.stats,
        errors: result.errors,
      },
    });
  } catch (error) {
    console.error('[vendorFollowUpAgent] Failed to log run:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📈 Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get summary of pending vendor follow-ups
 */
export async function getFollowUpSummary(): Promise<{
  critical: number;
  high: number;
  medium: number;
  low: number;
  responses_needing_action: number;
}> {
  const { data: followups } = await supabase
    .from('pending_vendor_followups')
    .select('urgency')
    .eq('vendor_recently_active', false);

  const { count: actionsNeeded } = await supabase
    .from('vendor_responses_needing_action')
    .select('*', { count: 'exact', head: true });

  const summary = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    responses_needing_action: actionsNeeded || 0,
  };

  if (followups) {
    for (const f of followups) {
      if (f.urgency in summary) {
        summary[f.urgency as keyof typeof summary]++;
      }
    }
  }

  return summary;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎁 Export
// ═══════════════════════════════════════════════════════════════════════════

export default {
  runVendorFollowUpAgent,
  getFollowUpSummary,
};
