/**
 * Trust Score Calculator Service
 * 
 * ARCHITECTURE: Calculates and updates agent trust scores based on performance.
 * 
 * Trust Score Components:
 * - Success Rate: % of executions that succeed (weight: 50%)
 * - Accuracy: % of proposed actions that were confirmed/executed (weight: 30%)
 * - Response Time: Avg execution time vs baseline (weight: 10%)
 * - User Feedback: Explicit thumbs up/down on agent recommendations (weight: 10%)
 * 
 * Trust Score affects:
 * - Whether autonomous actions are auto-executed
 * - Agent ranking in recommendations
 * - Workflow chain priorities
 */

import { supabase } from '../lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface TrustScoreComponents {
  successRate: number;      // 0-1
  accuracyRate: number;     // 0-1
  responseTimeScore: number; // 0-1
  userFeedbackScore: number; // 0-1
}

export interface TrustScoreDetails {
  agentIdentifier: string;
  currentScore: number;
  components: TrustScoreComponents;
  executionCount: number;
  lastUpdated: Date;
  trend: 'improving' | 'stable' | 'declining';
}

export interface AgentPerformanceStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  totalActionsProposed: number;
  actionsConfirmed: number;
  actionsRejected: number;
  avgExecutionTimeMs: number;
  positiveRatings: number;
  negativeRatings: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Trust Score Calculation
// ═══════════════════════════════════════════════════════════════════════════

const WEIGHTS = {
  successRate: 0.50,
  accuracy: 0.30,
  responseTime: 0.10,
  feedback: 0.10,
};

// Baseline execution time in ms (for scoring)
const BASELINE_EXECUTION_TIME_MS = 5000;

/**
 * Calculate trust score from performance stats
 */
export function calculateTrustScore(stats: AgentPerformanceStats): TrustScoreComponents & { overall: number } {
  // Success Rate: successful / total (default 0.7 if no data)
  const successRate = stats.totalExecutions > 0
    ? stats.successfulExecutions / stats.totalExecutions
    : 0.7;

  // Accuracy Rate: confirmed actions / total proposed (default 0.7 if no data)
  const accuracyRate = stats.totalActionsProposed > 0
    ? stats.actionsConfirmed / stats.totalActionsProposed
    : 0.7;

  // Response Time Score: 1.0 if faster than baseline, decreasing as slower
  // Score = 1 - (actualTime - baseline) / (2 * baseline), clamped 0-1
  const responseTimeScore = stats.avgExecutionTimeMs > 0
    ? Math.max(0, Math.min(1, 1 - (stats.avgExecutionTimeMs - BASELINE_EXECUTION_TIME_MS) / (2 * BASELINE_EXECUTION_TIME_MS)))
    : 0.8;

  // User Feedback Score: positive / total ratings (default 0.8 if no data)
  const totalRatings = stats.positiveRatings + stats.negativeRatings;
  const userFeedbackScore = totalRatings > 0
    ? stats.positiveRatings / totalRatings
    : 0.8;

  // Weighted overall score
  const overall =
    successRate * WEIGHTS.successRate +
    accuracyRate * WEIGHTS.accuracy +
    responseTimeScore * WEIGHTS.responseTime +
    userFeedbackScore * WEIGHTS.feedback;

  return {
    successRate,
    accuracyRate: accuracyRate,
    responseTimeScore,
    userFeedbackScore,
    overall: Math.round(overall * 100) / 100, // Round to 2 decimals
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Performance Stats Loading
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get performance stats for an agent from usage tracking
 */
export async function getAgentPerformanceStats(agentIdentifier: string): Promise<AgentPerformanceStats | null> {
  try {
    // Try to get from agent_usage_tracking table
    const { data: usageData, error: usageError } = await supabase
      .from('agent_usage_tracking')
      .select('*')
      .eq('agent_identifier', agentIdentifier);

    if (usageError) {
      console.warn('Could not load agent usage tracking:', usageError);
    }

    // Calculate stats from raw data
    const executions = usageData || [];
    const successful = executions.filter(e => e.execution_status === 'success').length;
    const failed = executions.filter(e => e.execution_status === 'error').length;
    
    // Sum up action counts from execution_details
    let totalProposed = 0;
    let totalConfirmed = 0;
    let totalRejected = 0;
    let totalTime = 0;
    
    for (const exec of executions) {
      const details = exec.execution_details || {};
      totalProposed += details.proposedCount || 0;
      totalConfirmed += details.executedCount || 0;
      totalTime += exec.execution_duration_ms || 0;
    }

    // Get feedback from a hypothetical agent_feedback table (or pending_actions outcomes)
    const { data: feedbackData, error: feedbackError } = await supabase
      .from('pending_actions')
      .select('status')
      .eq('agent', agentIdentifier);

    let positiveRatings = 0;
    let negativeRatings = 0;

    if (!feedbackError && feedbackData) {
      positiveRatings = feedbackData.filter(f => f.status === 'executed').length;
      negativeRatings = feedbackData.filter(f => f.status === 'rejected').length;
      totalConfirmed = positiveRatings;
      totalRejected = negativeRatings;
      totalProposed = feedbackData.length;
    }

    return {
      totalExecutions: executions.length,
      successfulExecutions: successful,
      failedExecutions: failed,
      totalActionsProposed: totalProposed,
      actionsConfirmed: totalConfirmed,
      actionsRejected: totalRejected,
      avgExecutionTimeMs: executions.length > 0 ? totalTime / executions.length : 0,
      positiveRatings,
      negativeRatings,
    };

  } catch (err) {
    console.error('Error getting agent performance stats:', err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Trust Score Update Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate and update trust score for an agent
 */
export async function updateAgentTrustScore(agentIdentifier: string): Promise<TrustScoreDetails | null> {
  const stats = await getAgentPerformanceStats(agentIdentifier);
  
  if (!stats) {
    return null;
  }

  const scores = calculateTrustScore(stats);

  // Get previous score to calculate trend
  const { data: agentData } = await supabase
    .from('agent_definitions')
    .select('trust_score')
    .eq('identifier', agentIdentifier)
    .single();

  const previousScore = agentData?.trust_score || 0.7;
  const scoreDiff = scores.overall - previousScore;
  const trend: 'improving' | 'stable' | 'declining' = 
    scoreDiff > 0.02 ? 'improving' :
    scoreDiff < -0.02 ? 'declining' : 'stable';

  // Update trust score in database
  const { error: updateError } = await supabase
    .from('agent_definitions')
    .update({ 
      trust_score: scores.overall,
      updated_at: new Date().toISOString(),
    })
    .eq('identifier', agentIdentifier);

  if (updateError) {
    console.error('Failed to update trust score:', updateError);
  }

  return {
    agentIdentifier,
    currentScore: scores.overall,
    components: {
      successRate: scores.successRate,
      accuracyRate: scores.accuracyRate,
      responseTimeScore: scores.responseTimeScore,
      userFeedbackScore: scores.userFeedbackScore,
    },
    executionCount: stats.totalExecutions,
    lastUpdated: new Date(),
    trend,
  };
}

/**
 * Update trust scores for all active agents
 */
export async function updateAllTrustScores(): Promise<TrustScoreDetails[]> {
  const { data: agents, error } = await supabase
    .from('agent_definitions')
    .select('identifier')
    .eq('is_active', true);

  if (error || !agents) {
    console.error('Failed to get agents for trust score update:', error);
    return [];
  }

  const results: TrustScoreDetails[] = [];

  for (const agent of agents) {
    const details = await updateAgentTrustScore(agent.identifier);
    if (details) {
      results.push(details);
    }
  }

  return results;
}

/**
 * Get trust score details without updating
 */
export async function getTrustScoreDetails(agentIdentifier: string): Promise<TrustScoreDetails | null> {
  const stats = await getAgentPerformanceStats(agentIdentifier);
  
  if (!stats) {
    return null;
  }

  const scores = calculateTrustScore(stats);

  const { data: agentData } = await supabase
    .from('agent_definitions')
    .select('trust_score')
    .eq('identifier', agentIdentifier)
    .single();

  const previousScore = agentData?.trust_score || scores.overall;
  const scoreDiff = scores.overall - previousScore;
  const trend: 'improving' | 'stable' | 'declining' = 
    scoreDiff > 0.02 ? 'improving' :
    scoreDiff < -0.02 ? 'declining' : 'stable';

  return {
    agentIdentifier,
    currentScore: scores.overall,
    components: {
      successRate: scores.successRate,
      accuracyRate: scores.accuracyRate,
      responseTimeScore: scores.responseTimeScore,
      userFeedbackScore: scores.userFeedbackScore,
    },
    executionCount: stats.totalExecutions,
    lastUpdated: new Date(),
    trend,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Trust Score Thresholds
// ═══════════════════════════════════════════════════════════════════════════

export const TrustThresholds = {
  /** Minimum score required for autonomous execution */
  AUTONOMOUS_EXECUTION: 0.80,
  
  /** Score below which agent is flagged for review */
  REVIEW_REQUIRED: 0.60,
  
  /** Score below which agent is auto-disabled */
  AUTO_DISABLE: 0.40,
  
  /** Initial trust score for new agents */
  INITIAL_SCORE: 0.70,
} as const;

/**
 * Check if agent meets trust threshold for autonomous execution
 */
export function canExecuteAutonomously(trustScore: number): boolean {
  return trustScore >= TrustThresholds.AUTONOMOUS_EXECUTION;
}

/**
 * Check if agent needs review due to low trust score
 */
export function needsReview(trustScore: number): boolean {
  return trustScore <= TrustThresholds.REVIEW_REQUIRED;
}
