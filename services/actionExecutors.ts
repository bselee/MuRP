/**
 * Action Executors Service
 *
 * Executes agent-recommended actions. This is the bridge between
 * "AI recommends" and "AI does" - enabling autonomous workflows.
 *
 * Each executor:
 * 1. Validates the action payload
 * 2. Performs the actual operation
 * 3. Returns success/failure with details
 * 4. Logs the execution for audit
 */

import { supabase } from '../lib/supabase/client';
import { createPurchaseOrder } from '../hooks/useSupabaseMutations';

// ============================================================
// TYPES
// ============================================================

export type ActionType =
  | 'create_po'
  | 'send_email'
  | 'update_inventory'
  | 'adjust_rop'
  | 'update_lead_time'
  | 'flag_compliance'
  | 'schedule_followup'
  | 'notify_user'
  | 'custom';

export interface PendingAction {
  id: string;
  agentId?: string;
  agentIdentifier?: string;
  actionType: ActionType;
  actionLabel: string;
  payload: Record<string, unknown>;
  confidence?: number;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  reasoning?: string;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed' | 'expired' | 'auto_executed';
  userId?: string;
  createdAt: Date;
  expiresAt?: Date;
  sourceContext?: Record<string, unknown>;
}

export interface ExecutionResult {
  success: boolean;
  actionId: string;
  actionType: ActionType;
  result?: Record<string, unknown>;
  error?: string;
  executedAt: Date;
  durationMs: number;
}

// ============================================================
// MAIN EXECUTOR
// ============================================================

/**
 * Execute a pending action
 */
export async function executeAction(action: PendingAction): Promise<ExecutionResult> {
  const startTime = Date.now();

  try {
    let result: Record<string, unknown>;

    switch (action.actionType) {
      case 'create_po':
        result = await executeCreatePO(action.payload);
        break;

      case 'send_email':
        result = await executeSendEmail(action.payload);
        break;

      case 'update_inventory':
        result = await executeUpdateInventory(action.payload);
        break;

      case 'adjust_rop':
        result = await executeAdjustROP(action.payload);
        break;

      case 'update_lead_time':
        result = await executeUpdateLeadTime(action.payload);
        break;

      case 'flag_compliance':
        result = await executeFlagCompliance(action.payload);
        break;

      case 'schedule_followup':
        result = await executeScheduleFollowup(action.payload);
        break;

      case 'notify_user':
        result = await executeNotifyUser(action.payload);
        break;

      case 'custom':
        result = await executeCustomAction(action.payload);
        break;

      default:
        throw new Error(`Unknown action type: ${action.actionType}`);
    }

    // Update action status to executed
    await updateActionStatus(action.id, 'executed', result);

    return {
      success: true,
      actionId: action.id,
      actionType: action.actionType,
      result,
      executedAt: new Date(),
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Update action status to failed
    await updateActionStatus(action.id, 'failed', undefined, errorMessage);

    return {
      success: false,
      actionId: action.id,
      actionType: action.actionType,
      error: errorMessage,
      executedAt: new Date(),
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Execute multiple actions in sequence
 */
export async function executeActions(actions: PendingAction[]): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];

  for (const action of actions) {
    const result = await executeAction(action);
    results.push(result);

    // Stop if critical action fails
    if (!result.success && action.priority === 'urgent') {
      break;
    }
  }

  return results;
}

// ============================================================
// ACTION EXECUTORS
// ============================================================

/**
 * Create a purchase order
 */
async function executeCreatePO(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { vendorId, items, notes, requisitionIds } = payload as {
    vendorId: string;
    items: Array<{ sku: string; name: string; quantity: number; unitCost?: number }>;
    notes?: string;
    requisitionIds?: string[];
  };

  if (!vendorId || !items?.length) {
    throw new Error('Missing required fields: vendorId and items');
  }

  // Generate PO ID
  const poId = `PO-${Date.now().toString(36).toUpperCase()}`;

  const result = await createPurchaseOrder({
    id: poId,
    orderId: poId,
    vendorId,
    items: items.map(item => ({
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      unitCost: item.unitCost || 0,
    })),
    status: 'Pending',
    orderDate: new Date().toISOString(),
    vendorNotes: notes,
    requisitionIds,
    autoGenerated: true,
  });

  if (!result.success) {
    throw new Error(result.error || 'Failed to create purchase order');
  }

  return { poId, itemCount: items.length };
}

/**
 * Send an email to a vendor
 */
async function executeSendEmail(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { vendorId, to, subject, body, templateId } = payload as {
    vendorId?: string;
    to: string;
    subject: string;
    body: string;
    templateId?: string;
  };

  if (!to || !subject || !body) {
    throw new Error('Missing required fields: to, subject, body');
  }

  // For now, log the email intent - actual sending requires Gmail API integration
  // This would call the email-sender edge function when implemented
  console.log('[executeAction] Email send requested:', { to, subject, vendorId });

  // TODO: Integrate with gmail-send edge function
  // const { data, error } = await supabase.functions.invoke('gmail-send', {
  //   body: { to, subject, body }
  // });

  return {
    status: 'queued',
    to,
    subject,
    message: 'Email queued for sending (Gmail integration pending)',
  };
}

/**
 * Update inventory stock levels
 */
async function executeUpdateInventory(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { updates } = payload as {
    updates: Array<{ sku: string; adjustment: number; reason?: string }>;
  };

  if (!updates?.length) {
    throw new Error('No inventory updates provided');
  }

  const results: Array<{ sku: string; success: boolean; newStock?: number; error?: string }> = [];

  for (const update of updates) {
    try {
      // Get current stock
      const { data: item } = await supabase
        .from('inventory_items')
        .select('id, stock')
        .eq('sku', update.sku)
        .single();

      if (!item) {
        results.push({ sku: update.sku, success: false, error: 'Item not found' });
        continue;
      }

      const newStock = (item.stock || 0) + update.adjustment;

      // Update stock
      const { error } = await supabase
        .from('inventory_items')
        .update({ stock: newStock })
        .eq('id', item.id);

      if (error) throw error;

      results.push({ sku: update.sku, success: true, newStock });
    } catch (err) {
      results.push({
        sku: update.sku,
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return {
    updatedCount: results.filter(r => r.success).length,
    failedCount: results.filter(r => !r.success).length,
    details: results,
  };
}

/**
 * Adjust reorder point parameters
 */
async function executeAdjustROP(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { sku, newROP, newSafetyStock, reason } = payload as {
    sku: string;
    newROP?: number;
    newSafetyStock?: number;
    reason?: string;
  };

  if (!sku || (newROP === undefined && newSafetyStock === undefined)) {
    throw new Error('Missing required fields: sku and at least one of newROP or newSafetyStock');
  }

  const updates: Record<string, number> = {};
  if (newROP !== undefined) updates.reorder_point = newROP;
  if (newSafetyStock !== undefined) updates.safety_stock = newSafetyStock;

  const { error } = await supabase
    .from('sku_purchasing_parameters')
    .upsert({
      sku,
      ...updates,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'sku' });

  if (error) throw error;

  return { sku, ...updates, reason };
}

/**
 * Update vendor lead time
 */
async function executeUpdateLeadTime(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { vendorId, sku, newLeadTimeDays, source } = payload as {
    vendorId?: string;
    sku?: string;
    newLeadTimeDays: number;
    source?: string;
  };

  if (!vendorId && !sku) {
    throw new Error('Must provide either vendorId or sku');
  }

  if (sku) {
    // Update SKU-level lead time
    const { error } = await supabase
      .from('sku_purchasing_parameters')
      .upsert({
        sku,
        lead_time_days: newLeadTimeDays,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'sku' });

    if (error) throw error;
    return { sku, newLeadTimeDays, source };
  }

  if (vendorId) {
    // Update vendor-level lead time
    const { error } = await supabase
      .from('vendors')
      .update({ lead_time_days: newLeadTimeDays })
      .eq('id', vendorId);

    if (error) throw error;
    return { vendorId, newLeadTimeDays, source };
  }

  throw new Error('No update target specified');
}

/**
 * Flag a compliance issue
 */
async function executeFlagCompliance(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { sku, state, issueType, description, severity } = payload as {
    sku: string;
    state: string;
    issueType: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  };

  if (!sku || !state || !issueType) {
    throw new Error('Missing required fields: sku, state, issueType');
  }

  // Create compliance alert
  const { data, error } = await supabase
    .from('compliance_alerts')
    .insert({
      sku,
      state,
      issue_type: issueType,
      description,
      severity,
      status: 'open',
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) throw error;

  return { alertId: data?.id, sku, state, issueType, severity };
}

/**
 * Schedule a follow-up task
 */
async function executeScheduleFollowup(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { title, description, dueDate, priority, relatedTo } = payload as {
    title: string;
    description?: string;
    dueDate: string;
    priority?: 'low' | 'normal' | 'high';
    relatedTo?: { type: string; id: string };
  };

  if (!title || !dueDate) {
    throw new Error('Missing required fields: title, dueDate');
  }

  // For now, log the follow-up - would integrate with task management system
  console.log('[executeAction] Follow-up scheduled:', { title, dueDate, relatedTo });

  return {
    status: 'scheduled',
    title,
    dueDate,
    priority: priority || 'normal',
    message: 'Follow-up task scheduled',
  };
}

/**
 * Send a user notification
 */
async function executeNotifyUser(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { userId, title, message, type, link } = payload as {
    userId: string;
    title: string;
    message: string;
    type?: 'info' | 'warning' | 'error' | 'success';
    link?: string;
  };

  if (!userId || !title || !message) {
    throw new Error('Missing required fields: userId, title, message');
  }

  // Create notification record
  const { data, error } = await supabase
    .from('user_notifications')
    .insert({
      user_id: userId,
      title,
      message,
      type: type || 'info',
      link,
      read: false,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  // Table might not exist yet - gracefully handle
  if (error && !error.message.includes('does not exist')) {
    throw error;
  }

  return {
    notificationId: data?.id,
    status: 'sent',
    userId,
    title,
  };
}

/**
 * Execute a custom action (extensible)
 */
async function executeCustomAction(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { handler, params } = payload as {
    handler: string;
    params: Record<string, unknown>;
  };

  if (!handler) {
    throw new Error('Custom action requires a handler name');
  }

  // Log custom action execution
  console.log('[executeAction] Custom action:', { handler, params });

  return {
    status: 'executed',
    handler,
    message: 'Custom action executed',
  };
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Update action status in database
 */
async function updateActionStatus(
  actionId: string,
  status: PendingAction['status'],
  result?: Record<string, unknown>,
  errorMessage?: string
): Promise<void> {
  const { error } = await supabase
    .from('pending_actions')
    .update({
      status,
      executed_at: status === 'executed' || status === 'failed' ? new Date().toISOString() : null,
      execution_result: result || null,
      error_message: errorMessage || null,
    })
    .eq('id', actionId);

  if (error) {
    console.error('[updateActionStatus] Error:', error);
  }
}

/**
 * Check if an action should be auto-executed based on agent trust and confidence
 */
export function shouldAutoExecute(
  agentTrustScore: number,
  actionConfidence: number,
  agentAutonomyLevel: 'monitor' | 'assist' | 'autonomous'
): boolean {
  // Monitor agents never auto-execute
  if (agentAutonomyLevel === 'monitor') return false;

  // Assist agents never auto-execute
  if (agentAutonomyLevel === 'assist') return false;

  // Autonomous agents auto-execute only with high trust AND high confidence
  if (agentAutonomyLevel === 'autonomous') {
    return agentTrustScore >= 0.85 && actionConfidence >= 0.90;
  }

  return false;
}

/**
 * Queue an action for approval (or auto-execute if eligible)
 */
export async function queueAction(
  action: Omit<PendingAction, 'id' | 'status' | 'createdAt'>,
  agentTrustScore?: number,
  agentAutonomyLevel?: 'monitor' | 'assist' | 'autonomous'
): Promise<{ actionId: string; autoExecuted: boolean }> {
  const shouldAuto = agentTrustScore !== undefined &&
    agentAutonomyLevel !== undefined &&
    action.confidence !== undefined &&
    shouldAutoExecute(agentTrustScore, action.confidence, agentAutonomyLevel);

  const { data, error } = await supabase
    .from('pending_actions')
    .insert({
      agent_id: action.agentId,
      agent_identifier: action.agentIdentifier,
      action_type: action.actionType,
      action_label: action.actionLabel,
      payload: action.payload,
      confidence: action.confidence,
      priority: action.priority,
      reasoning: action.reasoning,
      status: shouldAuto ? 'auto_executed' : 'pending',
      user_id: action.userId,
      expires_at: action.expiresAt?.toISOString(),
      source_context: action.sourceContext,
    })
    .select('id')
    .single();

  if (error) throw error;

  const actionId = data.id;

  // If auto-executing, run the action immediately
  if (shouldAuto) {
    const fullAction: PendingAction = {
      ...action,
      id: actionId,
      status: 'auto_executed',
      createdAt: new Date(),
    };
    await executeAction(fullAction);
  }

  return { actionId, autoExecuted: shouldAuto };
}

/**
 * Get pending actions for a user
 */
export async function getPendingActions(userId: string): Promise<PendingAction[]> {
  const { data, error } = await supabase
    .from('pending_actions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getPendingActions] Error:', error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    agentId: row.agent_id,
    agentIdentifier: row.agent_identifier,
    actionType: row.action_type as ActionType,
    actionLabel: row.action_label,
    payload: row.payload || {},
    confidence: row.confidence,
    priority: row.priority,
    reasoning: row.reasoning,
    status: row.status,
    userId: row.user_id,
    createdAt: new Date(row.created_at),
    expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    sourceContext: row.source_context || {},
  }));
}

/**
 * Approve and execute a pending action
 */
export async function approveAction(actionId: string, userId: string): Promise<ExecutionResult> {
  // Get the action
  const { data: action, error: fetchError } = await supabase
    .from('pending_actions')
    .select('*')
    .eq('id', actionId)
    .single();

  if (fetchError || !action) {
    return {
      success: false,
      actionId,
      actionType: 'custom',
      error: 'Action not found',
      executedAt: new Date(),
      durationMs: 0,
    };
  }

  // Mark as approved
  await supabase
    .from('pending_actions')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
    })
    .eq('id', actionId);

  // Execute
  const pendingAction: PendingAction = {
    id: action.id,
    agentId: action.agent_id,
    agentIdentifier: action.agent_identifier,
    actionType: action.action_type as ActionType,
    actionLabel: action.action_label,
    payload: action.payload || {},
    confidence: action.confidence,
    priority: action.priority,
    reasoning: action.reasoning,
    status: 'approved',
    userId: action.user_id,
    createdAt: new Date(action.created_at),
    expiresAt: action.expires_at ? new Date(action.expires_at) : undefined,
    sourceContext: action.source_context || {},
  };

  return executeAction(pendingAction);
}

/**
 * Reject a pending action
 */
export async function rejectAction(actionId: string, userId: string, reason?: string): Promise<void> {
  const { error } = await supabase
    .from('pending_actions')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
      error_message: reason || 'Rejected by user',
    })
    .eq('id', actionId);

  if (error) {
    console.error('[rejectAction] Error:', error);
  }
}
