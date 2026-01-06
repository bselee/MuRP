/**
 * Agent Activity Logging Service
 *
 * Provides standardized logging for all agent activities.
 * Enables real-time visibility into what agents are doing.
 *
 * Usage:
 *   import { logAgentActivity, AgentActivityType } from './agentActivityService';
 *
 *   // Log an observation
 *   await logAgentActivity({
 *     agentIdentifier: 'stockout-prevention',
 *     activityType: 'observation',
 *     title: 'Low stock detected',
 *     description: 'SKU ABC123 has 5 units remaining, below ROP of 10',
 *     severity: 'warning',
 *     reasoning: { currentStock: 5, rop: 10, daysUntilStockout: 2 },
 *     relatedSku: 'ABC123',
 *   });
 *
 *   // Log an action with confidence
 *   await logAgentActivity({
 *     agentIdentifier: 'stockout-prevention',
 *     activityType: 'action',
 *     title: 'Created replenishment PO',
 *     description: 'Generated PO #12345 for 100 units',
 *     severity: 'success',
 *     confidenceScore: 0.92,
 *     financialImpact: 450.00,
 *     outputData: { poId: '12345', quantity: 100 },
 *   });
 */

import { supabase } from '../lib/supabase/client';

// ============================================================================
// Types
// ============================================================================

export type AgentActivityType =
  | 'observation'   // Agent noticed something
  | 'analysis'      // Agent analyzed data
  | 'decision'      // Agent made a recommendation
  | 'action'        // Agent executed something
  | 'completion'    // Agent finished a task
  | 'error'         // Something went wrong
  | 'checkpoint';   // Paused for human review

export type ActivitySeverity = 'info' | 'success' | 'warning' | 'error' | 'critical';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface AgentActivityInput {
  agentIdentifier: string;
  activityType: AgentActivityType;
  title: string;
  description?: string;
  severity?: ActivitySeverity;
  reasoning?: Record<string, unknown>;
  inputData?: Record<string, unknown>;
  outputData?: Record<string, unknown>;
  context?: Record<string, unknown>;
  confidenceScore?: number;  // 0-1
  riskLevel?: RiskLevel;
  financialImpact?: number;
  requiresHumanReview?: boolean;
  relatedPoId?: string;
  relatedVendorId?: string;
  relatedSku?: string;
  executionId?: string;
}

export interface AgentActivity extends AgentActivityInput {
  id: string;
  createdAt: string;
  humanReviewedAt?: string;
  humanApproved?: boolean;
  humanFeedback?: string;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Log an agent activity to the database
 */
export async function logAgentActivity(input: AgentActivityInput): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('log_agent_activity', {
      p_agent_identifier: input.agentIdentifier,
      p_activity_type: input.activityType,
      p_title: input.title,
      p_description: input.description || null,
      p_severity: input.severity || 'info',
      p_reasoning: input.reasoning || {},
      p_input_data: input.inputData || {},
      p_output_data: input.outputData || {},
      p_context: input.context || {},
      p_confidence_score: input.confidenceScore || null,
      p_risk_level: input.riskLevel || null,
      p_financial_impact: input.financialImpact || null,
      p_requires_review: input.requiresHumanReview || false,
      p_related_po_id: input.relatedPoId || null,
      p_related_vendor_id: input.relatedVendorId || null,
      p_related_sku: input.relatedSku || null,
      p_execution_id: input.executionId || null,
    });

    if (error) {
      console.error('[agentActivityService] Failed to log activity:', error);
      return null;
    }

    return data as string;
  } catch (err) {
    console.error('[agentActivityService] Error logging activity:', err);
    return null;
  }
}

/**
 * Get recent activity stream for an agent
 */
export async function getAgentActivityStream(
  limit = 50,
  agentIdentifier?: string
): Promise<AgentActivity[]> {
  try {
    let query = supabase
      .from('agent_activity_stream')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (agentIdentifier) {
      query = query.eq('agent_identifier', agentIdentifier);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[agentActivityService] Failed to fetch activity stream:', error);
      return [];
    }

    return (data || []).map(row => ({
      id: row.id,
      agentIdentifier: row.agent_identifier,
      activityType: row.activity_type,
      title: row.title,
      description: row.description,
      severity: row.severity,
      reasoning: row.reasoning,
      outputData: row.output_data,
      context: row.context,
      confidenceScore: row.confidence_score,
      riskLevel: row.risk_level,
      financialImpact: row.financial_impact,
      requiresHumanReview: row.requires_human_review,
      humanReviewedAt: row.human_reviewed_at,
      humanApproved: row.human_approved,
      humanFeedback: row.human_feedback,
      relatedSku: row.related_sku,
      relatedPoId: row.related_po_id,
      relatedVendorId: row.related_vendor_id,
      createdAt: row.created_at,
    }));
  } catch (err) {
    console.error('[agentActivityService] Error fetching stream:', err);
    return [];
  }
}

/**
 * Get pending items that need human review
 */
export async function getPendingAgentReviews(): Promise<AgentActivity[]> {
  try {
    const { data, error } = await supabase
      .from('pending_agent_reviews')
      .select('*');

    if (error) {
      console.error('[agentActivityService] Failed to fetch pending reviews:', error);
      return [];
    }

    return (data || []).map(row => ({
      id: row.id,
      agentIdentifier: row.agent_identifier,
      activityType: row.activity_type,
      title: row.title,
      description: row.description,
      severity: row.severity,
      reasoning: row.reasoning,
      outputData: row.output_data,
      context: row.context,
      confidenceScore: row.confidence_score,
      riskLevel: row.risk_level,
      financialImpact: row.financial_impact,
      requiresHumanReview: true,
      relatedSku: row.related_sku,
      relatedPoId: row.related_po_id,
      relatedVendorId: row.related_vendor_id,
      createdAt: row.created_at,
    }));
  } catch (err) {
    console.error('[agentActivityService] Error fetching pending reviews:', err);
    return [];
  }
}

/**
 * Record a human review decision for an activity
 */
export async function recordActivityReview(
  activityId: string,
  approved: boolean,
  feedback?: string,
  userId?: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('record_activity_review', {
      p_activity_id: activityId,
      p_approved: approved,
      p_feedback: feedback || null,
      p_user_id: userId || null,
    });

    if (error) {
      console.error('[agentActivityService] Failed to record review:', error);
      return false;
    }

    return data as boolean;
  } catch (err) {
    console.error('[agentActivityService] Error recording review:', err);
    return false;
  }
}

/**
 * Get agent performance metrics
 */
export async function getAgentPerformanceMetrics(): Promise<Record<string, unknown>[]> {
  try {
    const { data, error } = await supabase
      .from('agent_performance_metrics')
      .select('*');

    if (error) {
      console.error('[agentActivityService] Failed to fetch metrics:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[agentActivityService] Error fetching metrics:', err);
    return [];
  }
}

// ============================================================================
// Helper Functions for Common Agent Activities
// ============================================================================

/**
 * Log that an agent has observed something noteworthy
 */
export async function logObservation(
  agentIdentifier: string,
  title: string,
  details: {
    description?: string;
    data?: Record<string, unknown>;
    severity?: ActivitySeverity;
    relatedSku?: string;
    relatedVendorId?: string;
  }
): Promise<string | null> {
  return logAgentActivity({
    agentIdentifier,
    activityType: 'observation',
    title,
    description: details.description,
    severity: details.severity || 'info',
    inputData: details.data,
    relatedSku: details.relatedSku,
    relatedVendorId: details.relatedVendorId,
  });
}

/**
 * Log that an agent has analyzed data and reached a conclusion
 */
export async function logAnalysis(
  agentIdentifier: string,
  title: string,
  details: {
    description?: string;
    inputData?: Record<string, unknown>;
    conclusion?: Record<string, unknown>;
    confidence?: number;
  }
): Promise<string | null> {
  return logAgentActivity({
    agentIdentifier,
    activityType: 'analysis',
    title,
    description: details.description,
    severity: 'info',
    inputData: details.inputData,
    outputData: details.conclusion,
    confidenceScore: details.confidence,
  });
}

/**
 * Log that an agent recommends an action (may need human approval)
 */
export async function logDecision(
  agentIdentifier: string,
  title: string,
  details: {
    description?: string;
    reasoning?: Record<string, unknown>;
    recommendation?: Record<string, unknown>;
    confidence?: number;
    riskLevel?: RiskLevel;
    financialImpact?: number;
    requiresApproval?: boolean;
    relatedSku?: string;
    relatedPoId?: string;
    relatedVendorId?: string;
  }
): Promise<string | null> {
  const severity: ActivitySeverity =
    details.riskLevel === 'critical' ? 'critical' :
    details.riskLevel === 'high' ? 'warning' : 'info';

  return logAgentActivity({
    agentIdentifier,
    activityType: 'decision',
    title,
    description: details.description,
    severity,
    reasoning: details.reasoning,
    outputData: details.recommendation,
    confidenceScore: details.confidence,
    riskLevel: details.riskLevel,
    financialImpact: details.financialImpact,
    requiresHumanReview: details.requiresApproval || false,
    relatedSku: details.relatedSku,
    relatedPoId: details.relatedPoId,
    relatedVendorId: details.relatedVendorId,
  });
}

/**
 * Log that an agent has executed an action
 */
export async function logAction(
  agentIdentifier: string,
  title: string,
  details: {
    description?: string;
    result?: Record<string, unknown>;
    success?: boolean;
    financialImpact?: number;
    relatedSku?: string;
    relatedPoId?: string;
    relatedVendorId?: string;
  }
): Promise<string | null> {
  return logAgentActivity({
    agentIdentifier,
    activityType: 'action',
    title,
    description: details.description,
    severity: details.success === false ? 'error' : 'success',
    outputData: details.result,
    financialImpact: details.financialImpact,
    relatedSku: details.relatedSku,
    relatedPoId: details.relatedPoId,
    relatedVendorId: details.relatedVendorId,
  });
}

/**
 * Log an error that occurred during agent processing
 */
export async function logAgentError(
  agentIdentifier: string,
  title: string,
  details: {
    error: string;
    context?: Record<string, unknown>;
    relatedSku?: string;
    relatedPoId?: string;
  }
): Promise<string | null> {
  return logAgentActivity({
    agentIdentifier,
    activityType: 'error',
    title,
    description: details.error,
    severity: 'error',
    inputData: details.context,
    relatedSku: details.relatedSku,
    relatedPoId: details.relatedPoId,
  });
}
