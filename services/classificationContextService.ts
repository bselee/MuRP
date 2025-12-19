/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🏷️ CLASSIFICATION CONTEXT SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Central service for agents to understand item classifications and SOPs.
 * All agents should use this service before taking action on any inventory item.
 *
 * Key Capabilities:
 * - Get classification context for any SKU
 * - Get SOP rules for a flow type
 * - Check if an item should be in Stock Intelligence
 * - Log agent SOP interactions for learning
 * - Suggest classification changes based on patterns
 *
 * Usage:
 * ```typescript
 * import { getItemClassification, shouldIncludeInStockIntel, logAgentAction } from './classificationContextService';
 *
 * // Before processing an item
 * const context = await getItemClassification(sku);
 * if (!shouldIncludeInStockIntel(context)) {
 *   return; // Skip this item for stock intelligence
 * }
 *
 * // After taking an action
 * await logAgentAction('stockout-prevention', sku, 'generated_reorder_alert', 'low_stock_detected');
 * ```
 *
 * @module services/classificationContextService
 */

import { supabase } from '@/lib/supabase/client';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 Types
// ═══════════════════════════════════════════════════════════════════════════

export type FlowType = 'standard' | 'dropship' | 'special_order' | 'consignment' | 'made_to_order' | 'discontinued';
export type ReorderMethod = 'default' | 'manual' | 'sales_velocity' | 'do_not_reorder' | 'unknown';

export interface ItemClassificationContext {
  sku: string;
  name: string;
  category: string | null;
  status: string | null;
  flowType: FlowType;
  isDropship: boolean;
  reorderMethod: ReorderMethod;

  // Stock Intelligence settings
  stockIntelExclude: boolean;
  stockIntelExclusionReason: string | null;
  stockIntelOverride: boolean;
  visibleInStockIntel: boolean;
  shouldTriggerReorderAlerts: boolean;

  // Inventory data
  currentStock: number;
  onOrder: number;
  reorderPoint: number | null;
  moq: number | null;
  leadTimeDays: number | null;
  dailyVelocity: number | null;

  // SOP context
  flowTypeDisplay: string;
  sopSummary: string;
  sopRules: SOPRule[];
  agentActions: AgentActions;
  automationLevel: 'manual' | 'assisted' | 'autonomous';

  // Agent instruction
  agentInstructionSummary: string;
}

export interface SOPRule {
  rule: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface SOPStep {
  step: number;
  action: string;
  details: string;
}

export interface AgentActions {
  can_generate_po_draft?: boolean;
  can_send_alerts?: boolean;
  can_update_rop?: boolean;
  can_suggest_classification_change?: boolean;
  requires_customer_order?: boolean;
  requires_approval?: boolean;
  can_generate_production_order?: boolean;
  can_check_bom_availability?: boolean;
  can_send_vendor_stock_alert?: boolean;
  can_generate_sales_report?: boolean;
  can_suggest_clearance?: boolean;
  can_archive?: boolean;
}

export interface FullSOP {
  flowType: FlowType;
  displayName: string;
  description: string;
  sopSummary: string;
  sopSteps: SOPStep[];
  sopRules: SOPRule[];
  sopExceptions: { condition: string; handling: string }[];
  agentActions: AgentActions;
  alertThresholds: Record<string, number>;
  automationLevel: 'manual' | 'assisted' | 'autonomous';
  includeInStockIntel: boolean;
  triggersReorderAlerts: boolean;
  reorderLogic: string | null;
  vendorCommunicationTemplate: string | null;
  requiresVendorConfirmation: boolean;
}

export interface ClassificationSuggestion {
  sku: string;
  suggestedFlowType: FlowType;
  currentFlowType: FlowType;
  confidenceScore: number;
  reasoning: string;
  evidence: Record<string, any>;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 Core Functions - Getting Classification Context
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get full classification context for an item
 * USE THIS before taking any action on an inventory item
 */
export async function getItemClassification(sku: string): Promise<ItemClassificationContext | null> {
  try {
    const { data, error } = await supabase
      .from('agent_classification_context')
      .select('*')
      .eq('sku', sku)
      .single();

    if (error || !data) {
      console.warn(`[ClassificationContext] No context found for SKU: ${sku}`);
      return null;
    }

    return transformContextFromDB(data);
  } catch (err) {
    console.error('[ClassificationContext] Error getting item classification:', err);
    return null;
  }
}

/**
 * Get classification context for multiple items efficiently
 */
export async function getItemsClassification(skus: string[]): Promise<Map<string, ItemClassificationContext>> {
  const result = new Map<string, ItemClassificationContext>();

  if (skus.length === 0) return result;

  try {
    const { data, error } = await supabase
      .from('agent_classification_context')
      .select('*')
      .in('sku', skus);

    if (error || !data) return result;

    for (const row of data) {
      const context = transformContextFromDB(row);
      result.set(context.sku, context);
    }
  } catch (err) {
    console.error('[ClassificationContext] Error getting batch classification:', err);
  }

  return result;
}

/**
 * Get all items that should be included in Stock Intelligence
 */
export async function getStockIntelItems(): Promise<ItemClassificationContext[]> {
  try {
    const { data, error } = await supabase
      .from('agent_classification_context')
      .select('*')
      .eq('visible_in_stock_intel', true);

    if (error || !data) return [];

    return data.map(transformContextFromDB);
  } catch (err) {
    console.error('[ClassificationContext] Error getting stock intel items:', err);
    return [];
  }
}

/**
 * Get all items for a specific flow type
 */
export async function getItemsByFlowType(flowType: FlowType): Promise<ItemClassificationContext[]> {
  try {
    const { data, error } = await supabase
      .from('agent_classification_context')
      .select('*')
      .eq('flow_type', flowType);

    if (error || !data) return [];

    return data.map(transformContextFromDB);
  } catch (err) {
    console.error('[ClassificationContext] Error getting items by flow type:', err);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📋 SOP Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get full SOP for a flow type
 */
export async function getFlowTypeSOP(flowType: FlowType): Promise<FullSOP | null> {
  try {
    const { data, error } = await supabase
      .from('item_flow_sops')
      .select('*')
      .eq('flow_type', flowType)
      .single();

    if (error || !data) return null;

    return {
      flowType: data.flow_type,
      displayName: data.display_name,
      description: data.description,
      sopSummary: data.sop_summary,
      sopSteps: data.sop_steps || [],
      sopRules: data.sop_rules || [],
      sopExceptions: data.sop_exceptions || [],
      agentActions: data.agent_actions || {},
      alertThresholds: data.alert_thresholds || {},
      automationLevel: data.automation_level || 'assisted',
      includeInStockIntel: data.include_in_stock_intel,
      triggersReorderAlerts: data.triggers_reorder_alerts,
      reorderLogic: data.reorder_logic,
      vendorCommunicationTemplate: data.vendor_communication_template,
      requiresVendorConfirmation: data.requires_vendor_confirmation,
    };
  } catch (err) {
    console.error('[ClassificationContext] Error getting SOP:', err);
    return null;
  }
}

/**
 * Get all SOPs for agent reference
 */
export async function getAllSOPs(): Promise<FullSOP[]> {
  try {
    const { data, error } = await supabase
      .from('item_flow_sops')
      .select('*')
      .order('flow_type');

    if (error || !data) return [];

    return data.map(d => ({
      flowType: d.flow_type,
      displayName: d.display_name,
      description: d.description,
      sopSummary: d.sop_summary,
      sopSteps: d.sop_steps || [],
      sopRules: d.sop_rules || [],
      sopExceptions: d.sop_exceptions || [],
      agentActions: d.agent_actions || {},
      alertThresholds: d.alert_thresholds || {},
      automationLevel: d.automation_level || 'assisted',
      includeInStockIntel: d.include_in_stock_intel,
      triggersReorderAlerts: d.triggers_reorder_alerts,
      reorderLogic: d.reorder_logic,
      vendorCommunicationTemplate: d.vendor_communication_template,
      requiresVendorConfirmation: d.requires_vendor_confirmation,
    }));
  } catch (err) {
    console.error('[ClassificationContext] Error getting all SOPs:', err);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ✅ Decision Helpers - Quick Checks for Agents
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Quick check: Should this item appear in Stock Intelligence?
 */
export function shouldIncludeInStockIntel(context: ItemClassificationContext | null): boolean {
  if (!context) return false;
  return context.visibleInStockIntel;
}

/**
 * Quick check: Should this item trigger reorder alerts?
 */
export function shouldTriggerReorderAlerts(context: ItemClassificationContext | null): boolean {
  if (!context) return false;
  return context.shouldTriggerReorderAlerts;
}

/**
 * Quick check: Can agent generate a PO draft for this item?
 */
export function canGeneratePODraft(context: ItemClassificationContext | null): boolean {
  if (!context) return false;
  return context.agentActions.can_generate_po_draft ?? false;
}

/**
 * Quick check: Does this item require a customer order before agent action?
 */
export function requiresCustomerOrder(context: ItemClassificationContext | null): boolean {
  if (!context) return false;
  return context.agentActions.requires_customer_order ?? false;
}

/**
 * Get the critical rules for an item (must follow)
 */
export function getCriticalRules(context: ItemClassificationContext | null): SOPRule[] {
  if (!context) return [];
  return context.sopRules.filter(r => r.priority === 'critical');
}

// ═══════════════════════════════════════════════════════════════════════════
// 📝 Agent Logging - Track SOP Interactions for Learning
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Log an agent action for learning and audit
 */
export async function logAgentAction(
  agentName: string,
  sku: string | null,
  action: string,
  ruleApplied: string | null = null,
  exceptionReason: string | null = null,
  context: Record<string, any> = {}
): Promise<void> {
  try {
    // Get flow type for this SKU
    let flowType = 'standard';
    if (sku) {
      const classification = await getItemClassification(sku);
      if (classification) {
        flowType = classification.flowType;
      }
    }

    await supabase.from('agent_sop_interactions').insert({
      agent_name: agentName,
      flow_type: flowType,
      sku,
      interaction_type: exceptionReason ? 'rule_exception' : 'action_taken',
      action_taken: action,
      rule_applied: ruleApplied,
      exception_reason: exceptionReason,
      context_snapshot: context,
    });
  } catch (err) {
    console.error('[ClassificationContext] Error logging agent action:', err);
  }
}

/**
 * Log when agent queries SOP (for tracking SOP usage patterns)
 */
export async function logSOPQuery(agentName: string, flowType: FlowType): Promise<void> {
  try {
    await supabase.from('agent_sop_interactions').insert({
      agent_name: agentName,
      flow_type: flowType,
      interaction_type: 'sop_query',
    });
  } catch (err) {
    // Non-critical, don't throw
    console.debug('[ClassificationContext] Could not log SOP query:', err);
  }
}

/**
 * Record the outcome of an agent action
 */
export async function recordActionOutcome(
  interactionId: string,
  outcome: 'success' | 'partial' | 'failed',
  notes: string | null = null
): Promise<void> {
  try {
    await supabase
      .from('agent_sop_interactions')
      .update({ outcome, outcome_notes: notes })
      .eq('id', interactionId);
  } catch (err) {
    console.error('[ClassificationContext] Error recording outcome:', err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔮 Classification Suggestions - Agent Learning
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Agent suggests a classification change based on observed patterns
 */
export async function suggestClassificationChange(
  agentName: string,
  sku: string,
  suggestedFlowType: FlowType,
  confidence: number,
  reasoning: string,
  evidence: Record<string, any> = {}
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('suggest_classification_change', {
      p_sku: sku,
      p_suggested_flow_type: suggestedFlowType,
      p_agent_name: agentName,
      p_confidence: confidence,
      p_reasoning: reasoning,
      p_evidence: evidence,
    });

    if (error) {
      console.error('[ClassificationContext] Error suggesting classification:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('[ClassificationContext] Error suggesting classification:', err);
    return null;
  }
}

/**
 * Get pending classification suggestions for review
 */
export async function getPendingSuggestions(): Promise<ClassificationSuggestion[]> {
  try {
    const { data, error } = await supabase
      .from('agent_classification_suggestions')
      .select('*')
      .eq('status', 'pending')
      .order('confidence_score', { ascending: false });

    if (error || !data) return [];

    return data.map(d => ({
      sku: d.sku,
      suggestedFlowType: d.suggested_flow_type,
      currentFlowType: d.current_flow_type,
      confidenceScore: d.confidence_score,
      reasoning: d.reasoning,
      evidence: d.evidence || {},
    }));
  } catch (err) {
    console.error('[ClassificationContext] Error getting pending suggestions:', err);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

function transformContextFromDB(data: any): ItemClassificationContext {
  return {
    sku: data.sku,
    name: data.name,
    category: data.category,
    status: data.status,
    flowType: data.flow_type || 'standard',
    isDropship: data.is_dropship || false,
    reorderMethod: data.reorder_method || 'default',
    stockIntelExclude: data.stock_intel_exclude || false,
    stockIntelExclusionReason: data.stock_intel_exclusion_reason,
    stockIntelOverride: data.stock_intel_override || false,
    visibleInStockIntel: data.visible_in_stock_intel,
    shouldTriggerReorderAlerts: data.should_trigger_reorder_alerts,
    currentStock: data.current_stock || 0,
    onOrder: data.on_order || 0,
    reorderPoint: data.reorder_point,
    moq: data.moq,
    leadTimeDays: data.lead_time_days,
    dailyVelocity: data.daily_velocity,
    flowTypeDisplay: data.flow_type_display || 'Standard',
    sopSummary: data.sop_summary || '',
    sopRules: data.sop_rules || [],
    agentActions: data.agent_actions || {},
    automationLevel: data.automation_level || 'assisted',
    agentInstructionSummary: data.agent_instruction_summary || '',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📤 Exports
// ═══════════════════════════════════════════════════════════════════════════

export default {
  // Context getters
  getItemClassification,
  getItemsClassification,
  getStockIntelItems,
  getItemsByFlowType,

  // SOP getters
  getFlowTypeSOP,
  getAllSOPs,

  // Decision helpers
  shouldIncludeInStockIntel,
  shouldTriggerReorderAlerts,
  canGeneratePODraft,
  requiresCustomerOrder,
  getCriticalRules,

  // Logging
  logAgentAction,
  logSOPQuery,
  recordActionOutcome,

  // Suggestions
  suggestClassificationChange,
  getPendingSuggestions,
};
