/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 📊 AGENT USAGE TRACKING SERVICE - Monitor Agent Runs & Costs
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tracks every agent execution with timing, results, and cost metrics.
 * Provides analytics for optimizing agent performance and budget.
 *
 * @module services/agentUsageService
 */

import { supabase } from '../lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 Types
// ═══════════════════════════════════════════════════════════════════════════

export interface AgentRunRecord {
  id: string;
  agent_identifier: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  items_processed: number;
  alerts_generated: number;
  actions_taken: number;
  ai_calls_made: number;
  tokens_used: number;
  estimated_cost: number;
  output_log: string[];
  error_message: string | null;
  result_summary: Record<string, any> | null;
  trigger_type: 'manual' | 'scheduled' | 'event' | 'system';
  triggered_by: string | null;
}

export interface AgentUsageSummary {
  agent_identifier: string;
  display_name: string;
  autonomy_level: string;
  is_active: boolean;
  trust_score: number;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  success_rate_pct: number;
  total_tokens_used: number;
  total_cost: number;
  avg_duration_ms: number;
  last_run_at: string | null;
  runs_last_24h: number;
  cost_last_24h: number;
  runs_last_7d: number;
  cost_last_7d: number;
}

export interface AgentCostBreakdown {
  agent_identifier: string;
  display_name: string;
  total_cost: number;
  cost_last_24h: number;
  cost_last_7d: number;
  cost_last_30d: number;
  avg_cost_per_run: number;
  total_runs: number;
  tokens_used: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📝 Run Tracking Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start tracking an agent run
 * Returns run ID to update when complete
 */
export async function startAgentRun(
  agentIdentifier: string,
  triggerType: 'manual' | 'scheduled' | 'event' | 'system' = 'manual',
  triggeredBy?: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('agent_run_history')
      .insert({
        agent_identifier: agentIdentifier,
        started_at: new Date().toISOString(),
        status: 'running',
        trigger_type: triggerType,
        triggered_by: triggeredBy || null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[AgentUsage] Failed to start run tracking:', error);
      return null;
    }

    return data.id;
  } catch (error) {
    console.error('[AgentUsage] Error starting run:', error);
    return null;
  }
}

/**
 * Complete an agent run with results
 */
export async function completeAgentRun(
  runId: string,
  results: {
    status: 'completed' | 'failed';
    items_processed?: number;
    alerts_generated?: number;
    actions_taken?: number;
    ai_calls_made?: number;
    tokens_used?: number;
    estimated_cost?: number;
    output_log?: string[];
    error_message?: string;
    result_summary?: Record<string, any>;
  }
): Promise<boolean> {
  try {
    const completedAt = new Date();
    
    // Get start time to calculate duration
    const { data: runData } = await supabase
      .from('agent_run_history')
      .select('started_at')
      .eq('id', runId)
      .single();

    const startTime = runData ? new Date(runData.started_at) : completedAt;
    const durationMs = completedAt.getTime() - startTime.getTime();

    const { error } = await supabase
      .from('agent_run_history')
      .update({
        completed_at: completedAt.toISOString(),
        duration_ms: durationMs,
        status: results.status,
        items_processed: results.items_processed || 0,
        alerts_generated: results.alerts_generated || 0,
        actions_taken: results.actions_taken || 0,
        ai_calls_made: results.ai_calls_made || 0,
        tokens_used: results.tokens_used || 0,
        estimated_cost: results.estimated_cost || 0,
        output_log: results.output_log || [],
        error_message: results.error_message || null,
        result_summary: results.result_summary || null,
      })
      .eq('id', runId);

    if (error) {
      console.error('[AgentUsage] Failed to complete run:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[AgentUsage] Error completing run:', error);
    return false;
  }
}

/**
 * Helper to wrap agent execution with tracking
 */
export async function trackAgentExecution<T>(
  agentIdentifier: string,
  executeFn: () => Promise<{ 
    success: boolean; 
    output?: string[];
    summary?: Record<string, any>;
    error?: string;
  }>,
  options: {
    triggerType?: 'manual' | 'scheduled' | 'event' | 'system';
    triggeredBy?: string;
    estimatedTokensPerCall?: number;
    costPerToken?: number;
  } = {}
): Promise<T | null> {
  const runId = await startAgentRun(
    agentIdentifier,
    options.triggerType || 'manual',
    options.triggeredBy
  );

  if (!runId) {
    console.warn('[AgentUsage] Could not start tracking, executing anyway');
  }

  try {
    const result = await executeFn();

    if (runId) {
      await completeAgentRun(runId, {
        status: result.success ? 'completed' : 'failed',
        output_log: result.output || [],
        result_summary: result.summary,
        error_message: result.error,
        // Estimate tokens if AI was used
        tokens_used: options.estimatedTokensPerCall || 0,
        estimated_cost: (options.estimatedTokensPerCall || 0) * (options.costPerToken || 0.00001),
      });
    }

    return result as unknown as T;
  } catch (error) {
    if (runId) {
      await completeAgentRun(runId, {
        status: 'failed',
        error_message: (error as Error).message,
      });
    }
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 Analytics Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get usage summary for all agents
 */
export async function getAgentUsageSummary(): Promise<AgentUsageSummary[]> {
  try {
    const { data, error } = await supabase
      .from('agent_usage_summary')
      .select('*');

    if (error) {
      console.error('[AgentUsage] Failed to fetch summary:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('[AgentUsage] Error fetching summary:', error);
    return [];
  }
}

/**
 * Get detailed cost breakdown for all agents
 * Uses agent_definitions (unified source) instead of deprecated agent_configs
 */
export async function getAgentCostBreakdown(): Promise<AgentCostBreakdown[]> {
  try {
    // Get base agent info from unified agent_definitions table
    const { data: agents, error: agentsError } = await supabase
      .from('agent_definitions')
      .select('identifier, name, total_runs, total_cost, total_tokens_used');

    if (agentsError || !agents) {
      console.error('[AgentUsage] Failed to fetch agents:', agentsError);
      return [];
    }

    // Get time-based cost aggregates
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const breakdown: AgentCostBreakdown[] = [];

    for (const agent of agents) {
      // Get 24h cost
      const { data: cost24h } = await supabase
        .from('agent_run_history')
        .select('estimated_cost')
        .eq('agent_identifier', agent.identifier)
        .gte('started_at', last24h);

      // Get 7d cost
      const { data: cost7d } = await supabase
        .from('agent_run_history')
        .select('estimated_cost')
        .eq('agent_identifier', agent.identifier)
        .gte('started_at', last7d);

      // Get 30d cost
      const { data: cost30d } = await supabase
        .from('agent_run_history')
        .select('estimated_cost')
        .eq('agent_identifier', agent.identifier)
        .gte('started_at', last30d);

      const totalCost24h = cost24h?.reduce((sum, r) => sum + (r.estimated_cost || 0), 0) || 0;
      const totalCost7d = cost7d?.reduce((sum, r) => sum + (r.estimated_cost || 0), 0) || 0;
      const totalCost30d = cost30d?.reduce((sum, r) => sum + (r.estimated_cost || 0), 0) || 0;

      breakdown.push({
        agent_identifier: agent.identifier,
        display_name: agent.name,
        total_cost: agent.total_cost || 0,
        cost_last_24h: totalCost24h,
        cost_last_7d: totalCost7d,
        cost_last_30d: totalCost30d,
        avg_cost_per_run: agent.total_runs > 0
          ? (agent.total_cost || 0) / agent.total_runs
          : 0,
        total_runs: agent.total_runs || 0,
        tokens_used: agent.total_tokens_used || 0,
      });
    }

    return breakdown.sort((a, b) => b.total_cost - a.total_cost);
  } catch (error) {
    console.error('[AgentUsage] Error getting cost breakdown:', error);
    return [];
  }
}

/**
 * Get run history for a specific agent
 */
export async function getAgentRunHistory(
  agentIdentifier: string,
  limit: number = 50
): Promise<AgentRunRecord[]> {
  try {
    const { data, error } = await supabase
      .from('agent_run_history')
      .select('*')
      .eq('agent_identifier', agentIdentifier)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[AgentUsage] Failed to fetch run history:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('[AgentUsage] Error fetching run history:', error);
    return [];
  }
}

/**
 * Get total system-wide agent costs
 */
export async function getTotalAgentCosts(): Promise<{
  total_cost: number;
  cost_today: number;
  cost_this_week: number;
  cost_this_month: number;
  total_runs: number;
  total_tokens: number;
  most_expensive_agent: { name: string; cost: number } | null;
  most_active_agent: { name: string; runs: number } | null;
}> {
  try {
    const breakdown = await getAgentCostBreakdown();

    const totalCost = breakdown.reduce((sum, a) => sum + a.total_cost, 0);
    const costToday = breakdown.reduce((sum, a) => sum + a.cost_last_24h, 0);
    const costThisWeek = breakdown.reduce((sum, a) => sum + a.cost_last_7d, 0);
    const costThisMonth = breakdown.reduce((sum, a) => sum + a.cost_last_30d, 0);
    const totalRuns = breakdown.reduce((sum, a) => sum + a.total_runs, 0);
    const totalTokens = breakdown.reduce((sum, a) => sum + a.tokens_used, 0);

    const mostExpensive = breakdown.length > 0 
      ? { name: breakdown[0].display_name, cost: breakdown[0].total_cost }
      : null;

    const sortedByRuns = [...breakdown].sort((a, b) => b.total_runs - a.total_runs);
    const mostActive = sortedByRuns.length > 0
      ? { name: sortedByRuns[0].display_name, runs: sortedByRuns[0].total_runs }
      : null;

    return {
      total_cost: totalCost,
      cost_today: costToday,
      cost_this_week: costThisWeek,
      cost_this_month: costThisMonth,
      total_runs: totalRuns,
      total_tokens: totalTokens,
      most_expensive_agent: mostExpensive,
      most_active_agent: mostActive,
    };
  } catch (error) {
    console.error('[AgentUsage] Error calculating total costs:', error);
    return {
      total_cost: 0,
      cost_today: 0,
      cost_this_week: 0,
      cost_this_month: 0,
      total_runs: 0,
      total_tokens: 0,
      most_expensive_agent: null,
      most_active_agent: null,
    };
  }
}

export default {
  startAgentRun,
  completeAgentRun,
  trackAgentExecution,
  getAgentUsageSummary,
  getAgentCostBreakdown,
  getAgentRunHistory,
  getTotalAgentCosts,
};
