/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UNIFIED AUTONOMY GATE - Centralized Agent Permission Control
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Centralized permission checking for all agent actions before execution.
 * Ensures consistent enforcement of autonomy levels, trust scores, and bounds.
 *
 * Key Features:
 * - Unified permission checking for all agent action types
 * - Dollar amount bounds per agent and action type
 * - Category/SKU exclusion lists
 * - Trust score minimum thresholds
 * - Progressive autonomy based on trust score history
 * - Comprehensive audit trail
 *
 * Autonomy Levels:
 * - monitor: Observe and report only - never execute
 * - assist: Recommend actions for human approval
 * - autonomous: Auto-execute within defined bounds
 *
 * @module services/agentAutonomyGate
 */

import { supabase } from '../lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 Types
// ═══════════════════════════════════════════════════════════════════════════

export type AgentActionType =
  | 'create_po'          // Create purchase order
  | 'send_email'         // Send vendor email
  | 'adjust_stock'       // Update inventory levels
  | 'update_price'       // Modify pricing
  | 'update_rop'         // Adjust reorder point
  | 'update_lead_time'   // Update vendor lead time
  | 'flag_compliance'    // Flag compliance issue
  | 'schedule_followup'  // Schedule follow-up task
  | 'notify_user'        // Send user notification
  | 'approve_invoice'    // Auto-approve invoice
  | 'execute_workflow';  // Execute a workflow

export type AutonomyLevel = 'monitor' | 'assist' | 'autonomous';

export interface AutonomyCheck {
  agentId: string;
  agentIdentifier?: string;
  action: AgentActionType;
  targetValue?: number;          // Dollar amount for financial actions
  targetSku?: string;            // SKU for inventory actions
  targetVendorId?: string;       // Vendor for PO/email actions
  targetCategory?: string;       // Category for bulk actions
  context?: Record<string, any>; // Additional context
}

export interface AutonomyCheckResult {
  allowed: boolean;
  reason: string;
  requiresApproval: boolean;
  approvalLevel?: 'user' | 'manager' | 'director';
  agentAutonomyLevel: AutonomyLevel;
  trustScore: number;
  bounds: ActionBounds;
  warnings?: string[];
}

export interface ActionBounds {
  maxDollarAmount: number;
  maxItemsPerAction: number;
  excludedCategories: string[];
  excludedSkus: string[];
  excludedVendors: string[];
  requiresApprovalAbove: number;
  allowedTimeWindow?: { start: string; end: string }; // HH:MM format
}

export interface AgentAutonomyConfig {
  agentId: string;
  identifier: string;
  autonomyLevel: AutonomyLevel;
  trustScore: number;
  actionBounds: Record<AgentActionType, ActionBounds>;
  globalExclusions: {
    categories: string[];
    skus: string[];
    vendors: string[];
  };
  lastUpdated: string;
}

export interface AutonomyAuditLog {
  id: string;
  agentId: string;
  agentIdentifier: string;
  action: AgentActionType;
  checkInput: AutonomyCheck;
  checkResult: AutonomyCheckResult;
  wasExecuted: boolean;
  executionResult?: 'success' | 'failure' | 'rejected';
  createdAt: string;
}

// Default bounds for different action types
const DEFAULT_BOUNDS: Record<AgentActionType, ActionBounds> = {
  create_po: {
    maxDollarAmount: 5000,
    maxItemsPerAction: 50,
    excludedCategories: ['dropship', 'discontinued'],
    excludedSkus: [],
    excludedVendors: [],
    requiresApprovalAbove: 1000,
  },
  send_email: {
    maxDollarAmount: Infinity,
    maxItemsPerAction: 10,
    excludedCategories: [],
    excludedSkus: [],
    excludedVendors: [],
    requiresApprovalAbove: Infinity,
  },
  adjust_stock: {
    maxDollarAmount: 10000,
    maxItemsPerAction: 20,
    excludedCategories: ['finished_goods'],
    excludedSkus: [],
    excludedVendors: [],
    requiresApprovalAbove: 5000,
  },
  update_price: {
    maxDollarAmount: 500,
    maxItemsPerAction: 10,
    excludedCategories: [],
    excludedSkus: [],
    excludedVendors: [],
    requiresApprovalAbove: 100,
  },
  update_rop: {
    maxDollarAmount: Infinity,
    maxItemsPerAction: 100,
    excludedCategories: [],
    excludedSkus: [],
    excludedVendors: [],
    requiresApprovalAbove: Infinity,
  },
  update_lead_time: {
    maxDollarAmount: Infinity,
    maxItemsPerAction: 50,
    excludedCategories: [],
    excludedSkus: [],
    excludedVendors: [],
    requiresApprovalAbove: Infinity,
  },
  flag_compliance: {
    maxDollarAmount: Infinity,
    maxItemsPerAction: 100,
    excludedCategories: [],
    excludedSkus: [],
    excludedVendors: [],
    requiresApprovalAbove: Infinity,
  },
  schedule_followup: {
    maxDollarAmount: Infinity,
    maxItemsPerAction: 20,
    excludedCategories: [],
    excludedSkus: [],
    excludedVendors: [],
    requiresApprovalAbove: Infinity,
  },
  notify_user: {
    maxDollarAmount: Infinity,
    maxItemsPerAction: 50,
    excludedCategories: [],
    excludedSkus: [],
    excludedVendors: [],
    requiresApprovalAbove: Infinity,
  },
  approve_invoice: {
    maxDollarAmount: 2000,
    maxItemsPerAction: 5,
    excludedCategories: [],
    excludedSkus: [],
    excludedVendors: [],
    requiresApprovalAbove: 500,
  },
  execute_workflow: {
    maxDollarAmount: 10000,
    maxItemsPerAction: 100,
    excludedCategories: [],
    excludedSkus: [],
    excludedVendors: [],
    requiresApprovalAbove: 5000,
  },
};

// Trust score thresholds for autonomy progression
const TRUST_THRESHOLDS = {
  monitor: 0,          // Can always monitor
  assist: 0.30,        // Need 30% trust to assist
  autonomous: 0.70,    // Need 70% trust for autonomous actions
  autoApprove: 0.85,   // Need 85% trust to auto-approve without bounds check
};

// ═══════════════════════════════════════════════════════════════════════════
// 🔒 PERMISSION CHECKING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Main function: Check if an agent can execute an action autonomously
 */
export async function canExecuteAutonomously(check: AutonomyCheck): Promise<AutonomyCheckResult> {
  const warnings: string[] = [];

  // Get agent configuration
  const agentConfig = await getAgentAutonomyConfig(check.agentId);

  if (!agentConfig) {
    return {
      allowed: false,
      reason: 'Agent not found or not configured',
      requiresApproval: true,
      approvalLevel: 'manager',
      agentAutonomyLevel: 'monitor',
      trustScore: 0,
      bounds: DEFAULT_BOUNDS[check.action],
    };
  }

  // Get bounds for this action type
  const bounds = agentConfig.actionBounds[check.action] || DEFAULT_BOUNDS[check.action];

  // Start with base result
  const result: AutonomyCheckResult = {
    allowed: false,
    reason: '',
    requiresApproval: false,
    agentAutonomyLevel: agentConfig.autonomyLevel,
    trustScore: agentConfig.trustScore,
    bounds,
    warnings,
  };

  // Check 1: Autonomy Level
  if (agentConfig.autonomyLevel === 'monitor') {
    result.reason = 'Agent is in monitor-only mode';
    result.requiresApproval = true;
    result.approvalLevel = 'user';
    await logAutonomyCheck(check, result, false);
    return result;
  }

  // Check 2: Trust Score Threshold
  if (agentConfig.trustScore < TRUST_THRESHOLDS.assist) {
    result.reason = `Trust score (${agentConfig.trustScore.toFixed(2)}) below minimum for action`;
    result.requiresApproval = true;
    result.approvalLevel = 'user';
    await logAutonomyCheck(check, result, false);
    return result;
  }

  // Check 3: Category Exclusions
  if (check.targetCategory) {
    const excludedCategories = [
      ...bounds.excludedCategories,
      ...agentConfig.globalExclusions.categories,
    ];
    if (excludedCategories.some(c => c.toLowerCase() === check.targetCategory?.toLowerCase())) {
      result.reason = `Category "${check.targetCategory}" is excluded from autonomous actions`;
      result.requiresApproval = true;
      result.approvalLevel = 'manager';
      await logAutonomyCheck(check, result, false);
      return result;
    }
  }

  // Check 4: SKU Exclusions
  if (check.targetSku) {
    const excludedSkus = [
      ...bounds.excludedSkus,
      ...agentConfig.globalExclusions.skus,
    ];
    if (excludedSkus.includes(check.targetSku)) {
      result.reason = `SKU "${check.targetSku}" is excluded from autonomous actions`;
      result.requiresApproval = true;
      result.approvalLevel = 'user';
      await logAutonomyCheck(check, result, false);
      return result;
    }
  }

  // Check 5: Vendor Exclusions
  if (check.targetVendorId) {
    const excludedVendors = [
      ...bounds.excludedVendors,
      ...agentConfig.globalExclusions.vendors,
    ];
    if (excludedVendors.includes(check.targetVendorId)) {
      result.reason = `Vendor is excluded from autonomous actions`;
      result.requiresApproval = true;
      result.approvalLevel = 'manager';
      await logAutonomyCheck(check, result, false);
      return result;
    }
  }

  // Check 6: Dollar Amount Bounds
  if (check.targetValue !== undefined) {
    if (check.targetValue > bounds.maxDollarAmount) {
      result.reason = `Value $${check.targetValue.toFixed(2)} exceeds max bound $${bounds.maxDollarAmount.toFixed(2)}`;
      result.requiresApproval = true;
      result.approvalLevel = check.targetValue > 10000 ? 'director' : 'manager';
      await logAutonomyCheck(check, result, false);
      return result;
    }

    // Check approval threshold (less strict than max bound)
    if (check.targetValue > bounds.requiresApprovalAbove) {
      if (agentConfig.autonomyLevel !== 'autonomous' || agentConfig.trustScore < TRUST_THRESHOLDS.autoApprove) {
        result.reason = `Value $${check.targetValue.toFixed(2)} requires approval (threshold: $${bounds.requiresApprovalAbove.toFixed(2)})`;
        result.requiresApproval = true;
        result.approvalLevel = 'user';
        result.allowed = false;
        await logAutonomyCheck(check, result, false);
        return result;
      } else {
        warnings.push(`Auto-approving high-value action ($${check.targetValue.toFixed(2)}) due to high trust score`);
      }
    }
  }

  // Check 7: Time Window (if configured)
  if (bounds.allowedTimeWindow) {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    if (currentTime < bounds.allowedTimeWindow.start || currentTime > bounds.allowedTimeWindow.end) {
      result.reason = `Action not allowed outside time window (${bounds.allowedTimeWindow.start} - ${bounds.allowedTimeWindow.end})`;
      result.requiresApproval = true;
      result.approvalLevel = 'user';
      await logAutonomyCheck(check, result, false);
      return result;
    }
  }

  // Check 8: Assist mode requires approval for execution
  if (agentConfig.autonomyLevel === 'assist') {
    result.allowed = false;
    result.requiresApproval = true;
    result.approvalLevel = 'user';
    result.reason = 'Agent is in assist mode - requires user approval to execute';
    await logAutonomyCheck(check, result, false);
    return result;
  }

  // Check 9: Final autonomous mode check
  if (agentConfig.autonomyLevel === 'autonomous' && agentConfig.trustScore >= TRUST_THRESHOLDS.autonomous) {
    result.allowed = true;
    result.requiresApproval = false;
    result.reason = 'Action allowed within autonomy bounds';
    result.warnings = warnings.length > 0 ? warnings : undefined;
    await logAutonomyCheck(check, result, true);
    return result;
  }

  // Default: Not allowed
  result.reason = 'Action does not meet autonomous execution criteria';
  result.requiresApproval = true;
  result.approvalLevel = 'user';
  await logAutonomyCheck(check, result, false);
  return result;
}

/**
 * Quick check for monitor-only operations (no execution)
 */
export async function canMonitor(agentId: string): Promise<boolean> {
  const { data: agent } = await supabase
    .from('agent_definitions')
    .select('is_active')
    .eq('id', agentId)
    .maybeSingle();

  return agent?.is_active === true;
}

/**
 * Check if agent can propose actions (assist or higher)
 */
export async function canAssist(agentId: string): Promise<boolean> {
  const { data: agent } = await supabase
    .from('agent_definitions')
    .select('is_active, autonomy_level, trust_score')
    .eq('id', agentId)
    .maybeSingle();

  if (!agent?.is_active) return false;

  return (
    (agent.autonomy_level === 'assist' || agent.autonomy_level === 'autonomous') &&
    (agent.trust_score || 0) >= TRUST_THRESHOLDS.assist
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 CONFIGURATION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get agent autonomy configuration
 */
async function getAgentAutonomyConfig(agentId: string): Promise<AgentAutonomyConfig | null> {
  const { data: agent, error } = await supabase
    .from('agent_definitions')
    .select('*')
    .eq('id', agentId)
    .maybeSingle();

  if (error || !agent) return null;

  // Get custom bounds from settings (if any)
  const { data: customBounds } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', `agent_bounds_${agent.identifier}`)
    .maybeSingle();

  // Merge default bounds with custom bounds
  const actionBounds: Record<AgentActionType, ActionBounds> = { ...DEFAULT_BOUNDS };
  if (customBounds?.setting_value) {
    for (const [action, bounds] of Object.entries(customBounds.setting_value)) {
      if (actionBounds[action as AgentActionType]) {
        actionBounds[action as AgentActionType] = {
          ...actionBounds[action as AgentActionType],
          ...(bounds as Partial<ActionBounds>),
        };
      }
    }
  }

  // Get global exclusions
  const { data: globalExclusions } = await supabase
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', 'agent_global_exclusions')
    .maybeSingle();

  return {
    agentId: agent.id,
    identifier: agent.identifier,
    autonomyLevel: agent.autonomy_level as AutonomyLevel,
    trustScore: agent.trust_score || 0.5,
    actionBounds,
    globalExclusions: globalExclusions?.setting_value || {
      categories: ['dropship', 'discontinued', 'deprecated'],
      skus: [],
      vendors: [],
    },
    lastUpdated: agent.updated_at,
  };
}

/**
 * Update agent bounds for specific action
 */
export async function updateAgentBounds(
  agentIdentifier: string,
  action: AgentActionType,
  bounds: Partial<ActionBounds>
): Promise<{ success: boolean; error?: string }> {
  try {
    const settingKey = `agent_bounds_${agentIdentifier}`;

    // Get existing bounds
    const { data: existing } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', settingKey)
      .maybeSingle();

    const currentBounds = existing?.setting_value || {};
    const updatedBounds = {
      ...currentBounds,
      [action]: {
        ...(currentBounds[action] || DEFAULT_BOUNDS[action]),
        ...bounds,
      },
    };

    // Upsert
    const { error } = await supabase.from('app_settings').upsert({
      setting_key: settingKey,
      setting_value: updatedBounds,
      updated_at: new Date().toISOString(),
    });

    if (error) throw error;
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📈 TRUST SCORE PROGRESSION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Update agent trust score based on action outcome
 */
export async function updateTrustScore(
  agentId: string,
  outcome: 'success' | 'failure' | 'rejected' | 'corrected',
  magnitude: number = 1.0
): Promise<number> {
  const { data: agent } = await supabase
    .from('agent_definitions')
    .select('trust_score')
    .eq('id', agentId)
    .single();

  if (!agent) return 0;

  let currentScore = agent.trust_score || 0.5;
  let delta = 0;

  switch (outcome) {
    case 'success':
      delta = 0.01 * magnitude;  // Small positive for success
      break;
    case 'failure':
      delta = -0.05 * magnitude; // Moderate negative for failure
      break;
    case 'rejected':
      delta = -0.08 * magnitude; // Larger negative for user rejection
      break;
    case 'corrected':
      delta = -0.03 * magnitude; // Small negative for correction
      break;
  }

  // Apply delta with dampening near extremes
  const distanceToEdge = outcome.startsWith('success')
    ? (1 - currentScore)
    : currentScore;
  const dampenedDelta = delta * Math.min(1, distanceToEdge * 2);

  const newScore = Math.max(0, Math.min(1, currentScore + dampenedDelta));

  // Update in database
  await supabase
    .from('agent_definitions')
    .update({
      trust_score: newScore,
      updated_at: new Date().toISOString(),
    })
    .eq('id', agentId);

  return newScore;
}

/**
 * Check if agent qualifies for autonomy upgrade
 */
export async function checkAutonomyUpgrade(agentId: string): Promise<{
  eligible: boolean;
  currentLevel: AutonomyLevel;
  recommendedLevel?: AutonomyLevel;
  reason: string;
}> {
  const { data: agent } = await supabase
    .from('agent_definitions')
    .select('autonomy_level, trust_score')
    .eq('id', agentId)
    .single();

  if (!agent) {
    return { eligible: false, currentLevel: 'monitor', reason: 'Agent not found' };
  }

  const currentLevel = agent.autonomy_level as AutonomyLevel;
  const trustScore = agent.trust_score || 0;

  // Get recent execution stats
  const { data: recentExecutions } = await supabase
    .from('agent_execution_log')
    .select('outcome, user_feedback')
    .eq('agent_id', agentId)
    .gte('started_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order('started_at', { ascending: false })
    .limit(50);

  const successCount = recentExecutions?.filter(e =>
    e.outcome === 'success' && e.user_feedback !== 'rejected'
  ).length || 0;

  const rejectionCount = recentExecutions?.filter(e =>
    e.user_feedback === 'rejected'
  ).length || 0;

  // Upgrade criteria
  if (currentLevel === 'monitor') {
    if (successCount >= 10 && rejectionCount < 2 && trustScore >= TRUST_THRESHOLDS.assist) {
      return {
        eligible: true,
        currentLevel,
        recommendedLevel: 'assist',
        reason: `${successCount} successful executions with <5% rejection rate`,
      };
    }
  }

  if (currentLevel === 'assist') {
    if (successCount >= 50 && rejectionCount < 3 && trustScore >= TRUST_THRESHOLDS.autonomous) {
      return {
        eligible: true,
        currentLevel,
        recommendedLevel: 'autonomous',
        reason: `${successCount} successful assists with <5% rejection rate and ${(trustScore * 100).toFixed(0)}% trust score`,
      };
    }
  }

  return {
    eligible: false,
    currentLevel,
    reason: currentLevel === 'autonomous'
      ? 'Already at maximum autonomy level'
      : `Needs more successful executions or higher trust score (current: ${(trustScore * 100).toFixed(0)}%)`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📝 AUDIT LOGGING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Log autonomy check for audit trail
 * @param check - The autonomy check request
 * @param result - The result of the autonomy check
 * @param wasExecuted - Whether the action was executed
 * @param executionResult - Optional result of execution ('success' | 'failure' | 'rejected')
 */
export async function logAutonomyCheck(
  check: AutonomyCheck,
  result: AutonomyCheckResult,
  wasExecuted: boolean,
  executionResult?: 'success' | 'failure' | 'rejected'
): Promise<void> {
  try {
    await supabase.from('agent_autonomy_audit').insert({
      agent_id: check.agentId,
      agent_identifier: check.agentIdentifier || 'unknown',
      action_type: check.action,
      check_input: check,
      check_result: result,
      was_executed: wasExecuted,
      execution_result: executionResult,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to log autonomy check:', err);
    // Don't throw - logging failure shouldn't block the action
  }
}

/**
 * Get audit log for agent
 */
export async function getAutonomyAuditLog(
  agentId: string,
  limit: number = 100
): Promise<AutonomyAuditLog[]> {
  const { data, error } = await supabase
    .from('agent_autonomy_audit')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch audit log:', error);
    return [];
  }

  return (data || []).map(d => ({
    id: d.id,
    agentId: d.agent_id,
    agentIdentifier: d.agent_identifier,
    action: d.action_type,
    checkInput: d.check_input,
    checkResult: d.check_result,
    wasExecuted: d.was_executed,
    executionResult: d.execution_result,
    createdAt: d.created_at,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎁 Exports
// ═══════════════════════════════════════════════════════════════════════════

export default {
  // Permission checks
  canExecuteAutonomously,
  canMonitor,
  canAssist,

  // Configuration
  updateAgentBounds,

  // Trust score
  updateTrustScore,
  checkAutonomyUpgrade,

  // Audit
  getAutonomyAuditLog,

  // Constants
  TRUST_THRESHOLDS,
  DEFAULT_BOUNDS,
};
