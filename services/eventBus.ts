/**
 * Event Bus Service
 *
 * Central event dispatch system for triggering agents and workflows
 * based on system events (email received, stock low, PO overdue, etc.)
 *
 * Events can be:
 * 1. Emitted by system components (email poller, inventory checks)
 * 2. Scheduled via cron expressions
 * 3. Manually triggered by users
 */

import { supabase } from '../lib/supabase/client';
import type { AgentDefinition } from '../types/agents';
import { executeAgentByIdentifier, type AgentExecutionResult } from './agentExecutor';

// ============================================================
// TYPES
// ============================================================

export type EventType =
  | 'email.received'      // New email in monitored inbox
  | 'email.processed'     // Email was processed by agent
  | 'stock.low'           // Stock fell below ROP
  | 'stock.critical'      // Stock critically low (< safety stock)
  | 'stock.out'           // Stockout detected
  | 'po.created'          // New PO created
  | 'po.sent'             // PO sent to vendor
  | 'po.overdue'          // PO delivery is overdue
  | 'po.received'         // PO was received
  | 'po.tracking_updated' // Tracking info updated
  | 'compliance.alert'    // Compliance issue detected
  | 'compliance.expiring' // Certification expiring soon
  | 'vendor.issue'        // Vendor reliability issue
  | 'schedule.cron'       // Scheduled cron trigger
  | 'workflow.step'       // Workflow step completed
  | 'agent.completed'     // Agent execution completed
  | 'manual';             // Manual user trigger

export interface EventPayload {
  type: EventType;
  data: Record<string, unknown>;
  timestamp: Date;
  source?: string;        // What component emitted this event
  userId?: string;        // User context (if applicable)
  correlationId?: string; // For tracing related events
}

export interface EventTrigger {
  id: string;
  eventType: EventType;
  agentId?: string;
  workflowId?: string;
  conditions: Record<string, unknown>;
  cronExpression?: string;
  isActive: boolean;
  lastTriggeredAt?: Date;
  nextTriggerAt?: Date;
}

export interface TriggerResult {
  triggerId: string;
  targetType: 'agent' | 'workflow';
  targetId: string;
  success: boolean;
  executionId?: string;
  error?: string;
}

// ============================================================
// EVENT BUS
// ============================================================

/**
 * Emit an event to trigger registered agents/workflows
 */
export async function emitEvent(event: EventPayload): Promise<TriggerResult[]> {
  const results: TriggerResult[] = [];

  try {
    // Find all active triggers for this event type
    const triggers = await findTriggersByEvent(event.type);

    for (const trigger of triggers) {
      // Check if conditions match
      if (!matchesConditions(event.data, trigger.conditions)) {
        continue;
      }

      // Invoke the target
      const result = await invokeTrigger(trigger, event);
      results.push(result);

      // Update last triggered timestamp
      await updateTriggerTimestamp(trigger.id);
    }

    // Log event emission
    await logEvent(event, results);

  } catch (error) {
    console.error('[emitEvent] Error:', error);
  }

  return results;
}

/**
 * Find all triggers registered for an event type
 */
async function findTriggersByEvent(eventType: EventType): Promise<EventTrigger[]> {
  const { data, error } = await supabase
    .from('event_triggers')
    .select('*')
    .eq('event_type', eventType)
    .eq('is_active', true);

  if (error) {
    console.error('[findTriggersByEvent] Error:', error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    eventType: row.event_type as EventType,
    agentId: row.agent_id,
    workflowId: row.workflow_id,
    conditions: row.conditions || {},
    cronExpression: row.cron_expression,
    isActive: row.is_active,
    lastTriggeredAt: row.last_triggered_at ? new Date(row.last_triggered_at) : undefined,
    nextTriggerAt: row.next_trigger_at ? new Date(row.next_trigger_at) : undefined,
  }));
}

/**
 * Check if event data matches trigger conditions
 */
function matchesConditions(
  eventData: Record<string, unknown>,
  conditions: Record<string, unknown>
): boolean {
  // Empty conditions = match all
  if (!conditions || Object.keys(conditions).length === 0) {
    return true;
  }

  for (const [key, expectedValue] of Object.entries(conditions)) {
    const actualValue = eventData[key];

    // Handle array conditions (any match)
    if (Array.isArray(expectedValue)) {
      if (!expectedValue.includes(actualValue)) {
        return false;
      }
      continue;
    }

    // Handle object conditions (nested matching)
    if (typeof expectedValue === 'object' && expectedValue !== null) {
      if (typeof actualValue !== 'object' || actualValue === null) {
        return false;
      }
      if (!matchesConditions(
        actualValue as Record<string, unknown>,
        expectedValue as Record<string, unknown>
      )) {
        return false;
      }
      continue;
    }

    // Simple equality
    if (actualValue !== expectedValue) {
      return false;
    }
  }

  return true;
}

/**
 * Invoke a trigger's target (agent or workflow)
 */
async function invokeTrigger(
  trigger: EventTrigger,
  event: EventPayload
): Promise<TriggerResult> {
  try {
    if (trigger.agentId) {
      const executionId = await invokeAgent(trigger.agentId, event.data, event.userId);
      return {
        triggerId: trigger.id,
        targetType: 'agent',
        targetId: trigger.agentId,
        success: true,
        executionId,
      };
    }

    if (trigger.workflowId) {
      const executionId = await invokeWorkflow(trigger.workflowId, event.data, event.userId);
      return {
        triggerId: trigger.id,
        targetType: 'workflow',
        targetId: trigger.workflowId,
        success: true,
        executionId,
      };
    }

    return {
      triggerId: trigger.id,
      targetType: 'agent',
      targetId: '',
      success: false,
      error: 'Trigger has no target',
    };

  } catch (error) {
    return {
      triggerId: trigger.id,
      targetType: trigger.agentId ? 'agent' : 'workflow',
      targetId: trigger.agentId || trigger.workflowId || '',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Invoke an agent with event data
 * Uses the unified agentExecutor to run the agent's capabilities
 */
async function invokeAgent(
  agentId: string,
  eventData: Record<string, unknown>,
  userId?: string
): Promise<string> {
  // Look up agent identifier from ID (triggers store agent_id as UUID)
  const { data: agentDef } = await supabase
    .from('agent_definitions')
    .select('identifier')
    .eq('id', agentId)
    .single();

  const agentIdentifier = agentDef?.identifier || agentId;

  // Execute the agent using the unified executor
  const result = await executeAgentByIdentifier(agentIdentifier, {
    userId: userId || 'system',
    parameters: eventData,
    triggerSource: 'event',
    triggerValue: JSON.stringify(eventData),
  });

  if (!result) {
    throw new Error(`Agent not found or inactive: ${agentIdentifier}`);
  }

  // Log findings and actions if any
  if (result.findings.length > 0 || result.actionsProposed.length > 0) {
    console.log(`[EventBus] Agent ${result.agentName} completed:`, {
      findings: result.findings.length,
      proposed: result.actionsProposed.length,
      executed: result.actionsExecuted.length,
    });
  }

  return result.agentId;
}

/**
 * Invoke a workflow with event data
 */
async function invokeWorkflow(
  workflowId: string,
  eventData: Record<string, unknown>,
  userId?: string
): Promise<string> {
  // Get workflow definition
  const { data: workflow, error: workflowError } = await supabase
    .from('workflow_definitions')
    .select('*')
    .eq('id', workflowId)
    .single();

  if (workflowError || !workflow) {
    throw new Error('Workflow not found');
  }

  // Create execution entry
  const { data: execution, error } = await supabase
    .from('workflow_executions')
    .insert({
      workflow_id: workflowId,
      workflow_name: workflow.name,
      status: 'running',
      steps_total: Array.isArray(workflow.steps) ? workflow.steps.length : 0,
      trigger_type: 'event',
      trigger_event: eventData,
      input_data: eventData,
      user_id: userId,
    })
    .select('id')
    .single();

  if (error) throw error;

  // Workflow execution would be handled by workflowOrchestrator
  // For now, mark as started
  return execution.id;
}

/**
 * Update trigger's last triggered timestamp
 */
async function updateTriggerTimestamp(triggerId: string): Promise<void> {
  await supabase
    .from('event_triggers')
    .update({
      last_triggered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', triggerId);
}

/**
 * Log event for audit trail
 */
async function logEvent(event: EventPayload, results: TriggerResult[]): Promise<void> {
  // Could log to an events table for audit/debugging
  console.log('[EventBus]', {
    type: event.type,
    source: event.source,
    triggersInvoked: results.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
  });
}

// ============================================================
// TRIGGER MANAGEMENT
// ============================================================

/**
 * Register a new event trigger
 */
export async function registerTrigger(trigger: Omit<EventTrigger, 'id'>): Promise<string> {
  const { data, error } = await supabase
    .from('event_triggers')
    .insert({
      event_type: trigger.eventType,
      agent_id: trigger.agentId,
      workflow_id: trigger.workflowId,
      conditions: trigger.conditions,
      cron_expression: trigger.cronExpression,
      is_active: trigger.isActive,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

/**
 * Unregister an event trigger
 */
export async function unregisterTrigger(triggerId: string): Promise<void> {
  const { error } = await supabase
    .from('event_triggers')
    .delete()
    .eq('id', triggerId);

  if (error) throw error;
}

/**
 * Enable/disable a trigger
 */
export async function setTriggerActive(triggerId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('event_triggers')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', triggerId);

  if (error) throw error;
}

/**
 * Get all triggers for an agent
 */
export async function getAgentTriggers(agentId: string): Promise<EventTrigger[]> {
  const { data, error } = await supabase
    .from('event_triggers')
    .select('*')
    .eq('agent_id', agentId);

  if (error) {
    console.error('[getAgentTriggers] Error:', error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    eventType: row.event_type as EventType,
    agentId: row.agent_id,
    workflowId: row.workflow_id,
    conditions: row.conditions || {},
    cronExpression: row.cron_expression,
    isActive: row.is_active,
    lastTriggeredAt: row.last_triggered_at ? new Date(row.last_triggered_at) : undefined,
    nextTriggerAt: row.next_trigger_at ? new Date(row.next_trigger_at) : undefined,
  }));
}

// ============================================================
// CRON SCHEDULING
// ============================================================

/**
 * Parse a cron expression and check if it matches current time
 * Supports: minute hour day-of-month month day-of-week
 */
export function cronMatches(expression: string, date: Date = new Date()): boolean {
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
  // Wildcard
  if (field === '*') return true;

  // Exact match
  if (field === String(value)) return true;

  // List (e.g., "1,3,5")
  if (field.includes(',')) {
    return field.split(',').map(Number).includes(value);
  }

  // Range (e.g., "1-5")
  if (field.includes('-')) {
    const [start, end] = field.split('-').map(Number);
    return value >= start && value <= end;
  }

  // Step (e.g., "*/15")
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10);
    return value % step === 0;
  }

  return false;
}

/**
 * Get scheduled triggers that are due to run
 */
export async function getDueTriggers(): Promise<EventTrigger[]> {
  const now = new Date();

  const { data, error } = await supabase
    .from('event_triggers')
    .select('*')
    .eq('is_active', true)
    .not('cron_expression', 'is', null);

  if (error) {
    console.error('[getDueTriggers] Error:', error);
    return [];
  }

  return (data || [])
    .filter(row => row.cron_expression && cronMatches(row.cron_expression, now))
    .map(row => ({
      id: row.id,
      eventType: 'schedule.cron' as EventType,
      agentId: row.agent_id,
      workflowId: row.workflow_id,
      conditions: row.conditions || {},
      cronExpression: row.cron_expression,
      isActive: row.is_active,
      lastTriggeredAt: row.last_triggered_at ? new Date(row.last_triggered_at) : undefined,
      nextTriggerAt: row.next_trigger_at ? new Date(row.next_trigger_at) : undefined,
    }));
}

/**
 * Run all due scheduled triggers
 * Called by edge function on a schedule (every minute)
 */
export async function runScheduledTriggers(): Promise<TriggerResult[]> {
  const dueTriggers = await getDueTriggers();
  const results: TriggerResult[] = [];

  for (const trigger of dueTriggers) {
    const event: EventPayload = {
      type: 'schedule.cron',
      data: { cronExpression: trigger.cronExpression },
      timestamp: new Date(),
      source: 'scheduler',
    };

    const result = await invokeTrigger(trigger, event);
    results.push(result);

    // Update timestamp
    await updateTriggerTimestamp(trigger.id);
  }

  return results;
}

// ============================================================
// CONVENIENCE EMITTERS
// ============================================================

/**
 * Emit stock low event
 */
export async function emitStockLow(
  sku: string,
  currentStock: number,
  reorderPoint: number,
  userId?: string
): Promise<TriggerResult[]> {
  return emitEvent({
    type: 'stock.low',
    data: { sku, currentStock, reorderPoint },
    timestamp: new Date(),
    source: 'inventory-monitor',
    userId,
  });
}

/**
 * Emit email received event
 */
export async function emitEmailReceived(
  messageId: string,
  from: string,
  subject: string,
  vendorId?: string,
  poId?: string,
  userId?: string
): Promise<TriggerResult[]> {
  return emitEvent({
    type: 'email.received',
    data: { messageId, from, subject, vendorId, poId },
    timestamp: new Date(),
    source: 'email-poller',
    userId,
  });
}

/**
 * Emit PO overdue event
 */
export async function emitPOOverdue(
  poId: string,
  vendorId: string,
  expectedDate: Date,
  daysOverdue: number,
  userId?: string
): Promise<TriggerResult[]> {
  return emitEvent({
    type: 'po.overdue',
    data: { poId, vendorId, expectedDate: expectedDate.toISOString(), daysOverdue },
    timestamp: new Date(),
    source: 'po-monitor',
    userId,
  });
}

/**
 * Emit compliance alert event
 */
export async function emitComplianceAlert(
  sku: string,
  state: string,
  issueType: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  userId?: string
): Promise<TriggerResult[]> {
  return emitEvent({
    type: 'compliance.alert',
    data: { sku, state, issueType, severity },
    timestamp: new Date(),
    source: 'compliance-monitor',
    userId,
  });
}

/**
 * Check for overdue POs and emit events
 * Should be called periodically (e.g., every 4 hours via cron)
 */
export async function checkAndEmitOverduePOs(): Promise<TriggerResult[]> {
  const results: TriggerResult[] = [];

  try {
    // Get POs that are overdue (expected_date < now and not received)
    const { data: overduePOs, error } = await supabase
      .from('purchase_orders')
      .select('id, order_id, vendor_id, supplier_name, expected_date, status')
      .lt('expected_date', new Date().toISOString())
      .in('status', ['sent', 'pending', 'draft'])
      .order('expected_date');

    if (error) {
      console.error('[checkAndEmitOverduePOs] Query error:', error);
      return results;
    }

    for (const po of overduePOs || []) {
      const expectedDate = new Date(po.expected_date);
      const daysOverdue = Math.floor((Date.now() - expectedDate.getTime()) / (1000 * 60 * 60 * 24));

      const eventResults = await emitPOOverdue(
        po.id,
        po.vendor_id || '',
        expectedDate,
        daysOverdue
      );

      results.push(...eventResults);
    }

    console.log(`[checkAndEmitOverduePOs] Checked ${overduePOs?.length || 0} overdue POs, emitted ${results.length} events`);
  } catch (err) {
    console.error('[checkAndEmitOverduePOs] Error:', err);
  }

  return results;
}

/**
 * Check for expiring compliance items and emit events
 * Should be called periodically (e.g., daily)
 */
export async function checkAndEmitExpiringCompliance(): Promise<TriggerResult[]> {
  const results: TriggerResult[] = [];

  try {
    // Get compliance documents expiring within 30 days
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const { data: expiringDocs, error } = await supabase
      .from('compliance_documents')
      .select('id, name, expiry_date, state, document_type')
      .lt('expiry_date', thirtyDaysFromNow.toISOString())
      .gt('expiry_date', new Date().toISOString());

    if (error) {
      console.error('[checkAndEmitExpiringCompliance] Query error:', error);
      return results;
    }

    for (const doc of expiringDocs || []) {
      const expiryDate = new Date(doc.expiry_date);
      const daysUntilExpiry = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      const eventResults = await emitEvent({
        type: 'compliance.expiring',
        data: {
          documentId: doc.id,
          name: doc.name,
          state: doc.state,
          type: doc.document_type,
          expiryDate: doc.expiry_date,
          daysUntilExpiry,
        },
        timestamp: new Date(),
        source: 'compliance-monitor',
      });

      results.push(...eventResults);
    }

    console.log(`[checkAndEmitExpiringCompliance] Checked ${expiringDocs?.length || 0} expiring documents`);
  } catch (err) {
    console.error('[checkAndEmitExpiringCompliance] Error:', err);
  }

  return results;
}
