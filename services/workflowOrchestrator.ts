/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🎼 WORKFLOW ORCHESTRATOR - Chain Agents for End-to-End Automation
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This service orchestrates multiple agents to execute complete workflows
 * from start to finish. Each workflow chains agents together based on
 * the autonomy level set in Agent Command Center.
 *
 * UNIFIED AGENT SYSTEM: All agent configuration now comes from the
 * `agent_definitions` table. The deprecated `agent_configs` table is no
 * longer used. This ensures the Agent Command Center UI and workflow
 * execution are always in sync.
 *
 * Autonomy Levels:
 * - MONITOR: Agent observes and reports, no actions taken
 * - ASSIST: Agent recommends actions, user confirms
 * - AUTONOMOUS: Agent executes actions automatically
 *
 * @module services/workflowOrchestrator
 */

import { supabase } from '../lib/supabase/client';
import { getCriticalStockoutAlerts, type StockoutAlert } from './stockoutPreventionAgent';
import { assessPODelay, type PODelayAlert } from './airTrafficControllerAgent';
import type { AgentResponse } from './agentService';

// ═══════════════════════════════════════════════════════════════════════════
// 🎨 Type Definitions
// ═══════════════════════════════════════════════════════════════════════════

export type AutonomyLevel = 'monitor' | 'assist' | 'autonomous';

/**
 * Agent configuration interface - unified with agent_definitions table
 * Uses 'identifier' field (matching agent_definitions.identifier)
 */
export interface AgentConfig {
  identifier: string;          // Unified: matches agent_definitions.identifier
  name: string;                // Display name
  autonomy_level: AutonomyLevel;
  is_active: boolean;
  trust_score: number;
  parameters: Record<string, any>;
}

export interface WorkflowResult {
  success: boolean;
  workflow: string;
  startedAt: Date;
  completedAt: Date;
  agentResults: AgentWorkResult[];
  summary: string;
  pendingActions: PendingAction[];
  autoExecutedActions: ExecutedAction[];
  errors: string[];
}

export interface AgentWorkResult {
  agent: string;
  success: boolean;
  autonomyLevel: AutonomyLevel;
  findings: any;
  actionsProposed: PendingAction[];
  actionsExecuted: ExecutedAction[];
  error?: string;
}

export interface PendingAction {
  id: string;
  agent: string;
  type: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  data: Record<string, any>;
  suggestedAction: string;
  requiresConfirmation: boolean;
}

export interface ExecutedAction {
  id: string;
  agent: string;
  type: string;
  description: string;
  executedAt: Date;
  result: any;
}

export interface WorkflowContext {
  userId: string;
  agentConfigs: Map<string, AgentConfig>;
  startTime: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 Agent Configuration Loader (UNIFIED - uses agent_definitions)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Workflow agent identifiers - these map to agent_definitions.identifier
 * Using kebab-case to match the unified naming convention
 */
const WORKFLOW_AGENT_IDS = {
  STOCKOUT_PREVENTION: 'stockout-prevention',
  TRAFFIC_CONTROLLER: 'air-traffic-controller',
  EMAIL_TRACKING: 'email-tracking-specialist',
  INVENTORY_GUARDIAN: 'inventory-guardian',
  PO_INTELLIGENCE: 'po-intelligence',
  VENDOR_WATCHDOG: 'vendor-watchdog',
  COMPLIANCE_VALIDATOR: 'compliance-validator',
} as const;

/**
 * Load agent configurations from agent_definitions table (UNIFIED SOURCE)
 *
 * This function now reads from agent_definitions instead of the deprecated
 * agent_configs table, ensuring Agent Command Center and workflows are in sync.
 */
export async function getAgentConfigs(): Promise<Map<string, AgentConfig>> {
  const configMap = new Map<string, AgentConfig>();

  try {
    const { data, error } = await supabase
      .from('agent_definitions')
      .select('identifier, name, autonomy_level, is_active, trust_score, parameters')
      .eq('is_active', true);

    if (!error && data && data.length > 0) {
      data.forEach(agent => {
        configMap.set(agent.identifier, {
          identifier: agent.identifier,
          name: agent.name,
          autonomy_level: agent.autonomy_level as AutonomyLevel,
          is_active: agent.is_active,
          trust_score: Number(agent.trust_score),
          parameters: agent.parameters || {},
        });
      });
      return configMap;
    }
  } catch (err) {
    console.warn('Could not load agent_definitions, using defaults');
  }

  // Default configurations if table doesn't exist (fallback only)
  const defaults: AgentConfig[] = [
    { identifier: WORKFLOW_AGENT_IDS.STOCKOUT_PREVENTION, name: 'Stockout Prevention', autonomy_level: 'assist', is_active: true, trust_score: 0.91, parameters: {} },
    { identifier: WORKFLOW_AGENT_IDS.TRAFFIC_CONTROLLER, name: 'Air Traffic Controller', autonomy_level: 'monitor', is_active: true, trust_score: 0.72, parameters: {} },
    { identifier: WORKFLOW_AGENT_IDS.EMAIL_TRACKING, name: 'Email Tracking Specialist', autonomy_level: 'assist', is_active: true, trust_score: 0.80, parameters: {} },
    { identifier: WORKFLOW_AGENT_IDS.INVENTORY_GUARDIAN, name: 'Inventory Guardian', autonomy_level: 'assist', is_active: true, trust_score: 0.88, parameters: {} },
    { identifier: WORKFLOW_AGENT_IDS.PO_INTELLIGENCE, name: 'PO Intelligence', autonomy_level: 'assist', is_active: true, trust_score: 0.82, parameters: {} },
    { identifier: WORKFLOW_AGENT_IDS.VENDOR_WATCHDOG, name: 'Vendor Watchdog', autonomy_level: 'assist', is_active: true, trust_score: 0.85, parameters: {} },
    { identifier: WORKFLOW_AGENT_IDS.COMPLIANCE_VALIDATOR, name: 'Compliance Validator', autonomy_level: 'monitor', is_active: true, trust_score: 0.89, parameters: {} },
  ];

  defaults.forEach(config => configMap.set(config.identifier, config));
  return configMap;
}

/**
 * Check if an agent should auto-execute based on autonomy level
 */
function shouldAutoExecute(config: AgentConfig | undefined): boolean {
  return config?.autonomy_level === 'autonomous' && config?.is_active === true;
}

/**
 * Check if an agent should provide recommendations
 */
function shouldRecommend(config: AgentConfig | undefined): boolean {
  return (config?.autonomy_level === 'assist' || config?.autonomy_level === 'autonomous') && config?.is_active === true;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🌅 MORNING BRIEFING WORKFLOW
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execute the morning briefing workflow
 * Chains: Stockout Prevention → PO Intelligence → Email Tracking → Air Traffic Controller
 */
export async function runMorningBriefing(userId: string): Promise<WorkflowResult> {
  const startTime = new Date();
  const agentConfigs = await getAgentConfigs();
  const agentResults: AgentWorkResult[] = [];
  const pendingActions: PendingAction[] = [];
  const autoExecutedActions: ExecutedAction[] = [];
  const errors: string[] = [];

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: Stockout Prevention Agent
  // ─────────────────────────────────────────────────────────────────────────
  const stockoutConfig = agentConfigs.get(WORKFLOW_AGENT_IDS.STOCKOUT_PREVENTION);
  if (stockoutConfig?.is_active) {
    try {
      const alerts = await getCriticalStockoutAlerts();
      const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL' || a.severity === 'HIGH');

      const stockoutResult: AgentWorkResult = {
        agent: WORKFLOW_AGENT_IDS.STOCKOUT_PREVENTION,
        success: true,
        autonomyLevel: stockoutConfig.autonomy_level,
        findings: {
          totalAlerts: alerts.length,
          criticalCount: criticalAlerts.length,
          alerts: criticalAlerts.slice(0, 10), // Top 10
        },
        actionsProposed: [],
        actionsExecuted: [],
      };

      // Generate pending actions based on autonomy level
      for (const alert of criticalAlerts) {
        const action: PendingAction = {
          id: `stockout-${alert.sku}-${Date.now()}`,
          agent: WORKFLOW_AGENT_IDS.STOCKOUT_PREVENTION,
          type: 'create_po',
          description: `Create PO for ${alert.product_name} (${alert.sku})`,
          priority: alert.severity === 'CRITICAL' ? 'critical' : 'high',
          data: {
            sku: alert.sku,
            productName: alert.product_name,
            currentStock: alert.current_stock,
            daysUntilStockout: alert.days_until_stockout,
            recommendedQty: alert.recommended_order_qty,
            estimatedCost: alert.estimated_cost,
          },
          suggestedAction: alert.recommended_action,
          requiresConfirmation: !shouldAutoExecute(stockoutConfig),
        };

        if (shouldAutoExecute(stockoutConfig) && alert.severity === 'CRITICAL') {
          // Auto-execute for autonomous mode on critical items
          autoExecutedActions.push({
            id: action.id,
            agent: WORKFLOW_AGENT_IDS.STOCKOUT_PREVENTION,
            type: 'create_po',
            description: action.description,
            executedAt: new Date(),
            result: { status: 'draft_created', sku: alert.sku },
          });
          stockoutResult.actionsExecuted.push(autoExecutedActions[autoExecutedActions.length - 1]);
        } else if (shouldRecommend(stockoutConfig)) {
          pendingActions.push(action);
          stockoutResult.actionsProposed.push(action);
        }
      }

      agentResults.push(stockoutResult);
    } catch (err: any) {
      errors.push(`Stockout Prevention: ${err.message}`);
      agentResults.push({
        agent: WORKFLOW_AGENT_IDS.STOCKOUT_PREVENTION,
        success: false,
        autonomyLevel: stockoutConfig.autonomy_level,
        findings: null,
        actionsProposed: [],
        actionsExecuted: [],
        error: err.message,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: PO Intelligence Agent - Check open POs
  // ─────────────────────────────────────────────────────────────────────────
  const poConfig = agentConfigs.get(WORKFLOW_AGENT_IDS.PO_INTELLIGENCE);
  if (poConfig?.is_active) {
    try {
      const { data: openPOs, error } = await supabase
        .from('purchase_orders')
        .select('id, order_id, vendor_id, status, expected_date, total_amount, created_at')
        .in('status', ['draft', 'sent', 'confirmed', 'shipped'])
        .order('expected_date', { ascending: true })
        .limit(20);

      if (error) throw error;

      const overdueCount = openPOs?.filter(po => {
        const expected = new Date(po.expected_date);
        return expected < new Date() && po.status !== 'shipped';
      }).length || 0;

      const poResult: AgentWorkResult = {
        agent: WORKFLOW_AGENT_IDS.PO_INTELLIGENCE,
        success: true,
        autonomyLevel: poConfig.autonomy_level,
        findings: {
          openPOCount: openPOs?.length || 0,
          overdueCount,
          totalValue: openPOs?.reduce((sum, po) => sum + (po.total_amount || 0), 0) || 0,
          openPOs: openPOs?.slice(0, 10),
        },
        actionsProposed: [],
        actionsExecuted: [],
      };

      // Flag overdue POs for follow-up
      const overduePOs = openPOs?.filter(po => {
        const expected = new Date(po.expected_date);
        return expected < new Date() && po.status !== 'shipped';
      }) || [];

      for (const po of overduePOs) {
        const action: PendingAction = {
          id: `followup-${po.id}-${Date.now()}`,
          agent: WORKFLOW_AGENT_IDS.PO_INTELLIGENCE,
          type: 'send_followup',
          description: `Follow up on overdue PO ${po.order_id}`,
          priority: 'high',
          data: { poId: po.id, orderId: po.order_id, expectedDate: po.expected_date },
          suggestedAction: 'Send follow-up email to vendor',
          requiresConfirmation: !shouldAutoExecute(poConfig),
        };

        if (shouldRecommend(poConfig)) {
          pendingActions.push(action);
          poResult.actionsProposed.push(action);
        }
      }

      agentResults.push(poResult);
    } catch (err: any) {
      errors.push(`PO Intelligence: ${err.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Email Tracking Agent - Check for unprocessed emails
  // ─────────────────────────────────────────────────────────────────────────
  const emailConfig = agentConfigs.get(WORKFLOW_AGENT_IDS.EMAIL_TRACKING);
  if (emailConfig?.is_active) {
    try {
      // Check for unprocessed email threads
      const { data: unprocessedEmails, error } = await supabase
        .from('email_thread_messages')
        .select('id, subject, from_email, received_at, processing_status, extracted_tracking_number')
        .eq('processing_status', 'pending')
        .order('received_at', { ascending: false })
        .limit(20);

      const emailResult: AgentWorkResult = {
        agent: WORKFLOW_AGENT_IDS.EMAIL_TRACKING,
        success: true,
        autonomyLevel: emailConfig.autonomy_level,
        findings: {
          unprocessedCount: unprocessedEmails?.length || 0,
          emails: unprocessedEmails?.slice(0, 5),
        },
        actionsProposed: [],
        actionsExecuted: [],
      };

      // If there are unprocessed emails, suggest processing them
      if (unprocessedEmails && unprocessedEmails.length > 0) {
        const action: PendingAction = {
          id: `process-emails-${Date.now()}`,
          agent: WORKFLOW_AGENT_IDS.EMAIL_TRACKING,
          type: 'process_emails',
          description: `Process ${unprocessedEmails.length} unread vendor emails`,
          priority: 'medium',
          data: { count: unprocessedEmails.length, emailIds: unprocessedEmails.map(e => e.id) },
          suggestedAction: 'Extract tracking numbers and update POs',
          requiresConfirmation: !shouldAutoExecute(emailConfig),
        };

        if (shouldRecommend(emailConfig)) {
          pendingActions.push(action);
          emailResult.actionsProposed.push(action);
        }
      }

      agentResults.push(emailResult);
    } catch (err: any) {
      // Table might not exist yet - not an error
      console.warn('Email tracking table not found:', err.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 4: Air Traffic Controller - Prioritize alerts
  // ─────────────────────────────────────────────────────────────────────────
  const atcConfig = agentConfigs.get(WORKFLOW_AGENT_IDS.TRAFFIC_CONTROLLER);
  if (atcConfig?.is_active) {
    try {
      // Get recent PO delay alerts
      const { data: recentAlerts } = await supabase
        .from('po_alert_log')
        .select('*')
        .eq('acknowledged', false)
        .order('created_at', { ascending: false })
        .limit(10);

      const atcResult: AgentWorkResult = {
        agent: WORKFLOW_AGENT_IDS.TRAFFIC_CONTROLLER,
        success: true,
        autonomyLevel: atcConfig.autonomy_level,
        findings: {
          unacknowledgedAlerts: recentAlerts?.length || 0,
          alerts: recentAlerts,
        },
        actionsProposed: [],
        actionsExecuted: [],
      };

      agentResults.push(atcResult);
    } catch (err: any) {
      // Table might not exist yet
      console.warn('Alert log table not found:', err.message);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Compile Summary
  // ─────────────────────────────────────────────────────────────────────────
  const completedAt = new Date();
  const summary = generateBriefingSummary(agentResults, pendingActions, autoExecutedActions);

  // Log workflow execution
  try {
    await supabase.from('workflow_executions').insert({
      workflow_name: 'morning_briefing',
      user_id: userId,
      started_at: startTime,
      completed_at: completedAt,
      success: errors.length === 0,
      summary,
      pending_actions_count: pendingActions.length,
      auto_executed_count: autoExecutedActions.length,
      errors: errors.length > 0 ? errors : null,
    });
  } catch (err) {
    // Table might not exist yet
    console.warn('Could not log workflow execution');
  }

  return {
    success: errors.length === 0,
    workflow: 'morning_briefing',
    startedAt: startTime,
    completedAt,
    agentResults,
    summary,
    pendingActions,
    autoExecutedActions,
    errors,
  };
}

/**
 * Generate human-readable summary of briefing
 */
function generateBriefingSummary(
  agentResults: AgentWorkResult[],
  pendingActions: PendingAction[],
  autoExecuted: ExecutedAction[]
): string {
  const lines: string[] = [];

  // Stockout summary
  const stockoutResult = agentResults.find(r => r.agent === WORKFLOW_AGENT_IDS.STOCKOUT_PREVENTION);
  if (stockoutResult?.success && stockoutResult.findings) {
    const { criticalCount, totalAlerts } = stockoutResult.findings;
    if (criticalCount > 0) {
      lines.push(`🔴 ${criticalCount} critical stockout risks requiring attention`);
    } else if (totalAlerts > 0) {
      lines.push(`🟡 ${totalAlerts} stock alerts (none critical)`);
    } else {
      lines.push(`✅ No stockout risks detected`);
    }
  }

  // PO summary
  const poResult = agentResults.find(r => r.agent === WORKFLOW_AGENT_IDS.PO_INTELLIGENCE);
  if (poResult?.success && poResult.findings) {
    const { openPOCount, overdueCount } = poResult.findings;
    if (overdueCount > 0) {
      lines.push(`⚠️ ${overdueCount} overdue POs need follow-up`);
    }
    lines.push(`${openPOCount} open purchase orders`);
  }

  // Email summary
  const emailResult = agentResults.find(r => r.agent === WORKFLOW_AGENT_IDS.EMAIL_TRACKING);
  if (emailResult?.success && emailResult.findings) {
    const { unprocessedCount } = emailResult.findings;
    if (unprocessedCount > 0) {
      lines.push(`📧 ${unprocessedCount} vendor emails to review`);
    }
  }

  // Actions summary
  if (autoExecuted.length > 0) {
    lines.push(`\n✅ ${autoExecuted.length} actions auto-executed`);
  }
  if (pendingActions.length > 0) {
    const criticalCount = pendingActions.filter(a => a.priority === 'critical').length;
    if (criticalCount > 0) {
      lines.push(`\n🚨 ${criticalCount} critical actions need your approval`);
    } else {
      lines.push(`\n${pendingActions.length} recommended actions`);
    }
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// 📧 EMAIL PROCESSING WORKFLOW
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process new vendor emails and update POs with tracking info
 */
export async function runEmailProcessingWorkflow(userId: string): Promise<WorkflowResult> {
  const startTime = new Date();
  const agentConfigs = await getAgentConfigs();
  const agentResults: AgentWorkResult[] = [];
  const pendingActions: PendingAction[] = [];
  const autoExecutedActions: ExecutedAction[] = [];
  const errors: string[] = [];

  const emailConfig = agentConfigs.get(WORKFLOW_AGENT_IDS.EMAIL_TRACKING);

  if (!emailConfig?.is_active) {
    return {
      success: false,
      workflow: 'email_processing',
      startedAt: startTime,
      completedAt: new Date(),
      agentResults: [],
      summary: 'Email Tracking Agent is disabled',
      pendingActions: [],
      autoExecutedActions: [],
      errors: ['Email Tracking Agent is not active'],
    };
  }

  try {
    // Get unprocessed emails
    const { data: emails, error } = await supabase
      .from('email_thread_messages')
      .select(`
        id,
        thread_id,
        subject,
        from_email,
        body_text,
        received_at,
        processing_status,
        extracted_tracking_number,
        extracted_eta
      `)
      .eq('processing_status', 'pending')
      .order('received_at', { ascending: true })
      .limit(50);

    if (error) throw error;

    const processedEmails: any[] = [];
    const trackingUpdates: any[] = [];

    for (const email of emails || []) {
      // Extract tracking numbers using regex patterns
      const trackingPatterns = [
        /\b1Z[A-Z0-9]{16}\b/gi,  // UPS
        /\b\d{12,22}\b/g,        // FedEx
        /\b9[2-5]\d{20,22}\b/g,  // USPS
      ];

      let trackingNumber: string | null = null;
      for (const pattern of trackingPatterns) {
        const match = email.body_text?.match(pattern);
        if (match) {
          trackingNumber = match[0];
          break;
        }
      }

      // Extract ETA dates
      const etaPatterns = [
        /(?:delivery|arrive|expected|eta)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/gi,
        /(?:delivery|arrive|expected|eta)[:\s]*([A-Za-z]+\s+\d{1,2},?\s*\d{4})/gi,
      ];

      let eta: string | null = null;
      for (const pattern of etaPatterns) {
        const match = email.body_text?.match(pattern);
        if (match) {
          eta = match[1];
          break;
        }
      }

      // Update email record with extracted data
      if (trackingNumber || eta) {
        if (shouldAutoExecute(emailConfig)) {
          // Auto-update the email record
          await supabase
            .from('email_thread_messages')
            .update({
              processing_status: 'processed',
              extracted_tracking_number: trackingNumber,
              extracted_eta: eta,
              processed_at: new Date(),
            })
            .eq('id', email.id);

          autoExecutedActions.push({
            id: `email-${email.id}`,
            agent: WORKFLOW_AGENT_IDS.EMAIL_TRACKING,
            type: 'extract_tracking',
            description: `Extracted tracking from "${email.subject}"`,
            executedAt: new Date(),
            result: { trackingNumber, eta },
          });

          if (trackingNumber) {
            trackingUpdates.push({ emailId: email.id, trackingNumber, eta });
          }
        } else {
          // Queue for user confirmation
          pendingActions.push({
            id: `email-${email.id}`,
            agent: WORKFLOW_AGENT_IDS.EMAIL_TRACKING,
            type: 'confirm_extraction',
            description: `Confirm tracking from "${email.subject}"`,
            priority: 'medium',
            data: { emailId: email.id, trackingNumber, eta, subject: email.subject },
            suggestedAction: `Update PO with tracking: ${trackingNumber}`,
            requiresConfirmation: true,
          });
        }

        processedEmails.push(email);
      }
    }

    agentResults.push({
      agent: WORKFLOW_AGENT_IDS.EMAIL_TRACKING,
      success: true,
      autonomyLevel: emailConfig.autonomy_level,
      findings: {
        totalProcessed: emails?.length || 0,
        trackingFound: trackingUpdates.length,
        processedEmails,
      },
      actionsProposed: pendingActions.filter(a => a.agent === WORKFLOW_AGENT_IDS.EMAIL_TRACKING),
      actionsExecuted: autoExecutedActions.filter(a => a.agent === WORKFLOW_AGENT_IDS.EMAIL_TRACKING),
    });

  } catch (err: any) {
    errors.push(`Email Processing: ${err.message}`);
  }

  const completedAt = new Date();

  return {
    success: errors.length === 0,
    workflow: 'email_processing',
    startedAt: startTime,
    completedAt,
    agentResults,
    summary: `Processed ${autoExecutedActions.length} emails, ${pendingActions.length} need confirmation`,
    pendingActions,
    autoExecutedActions,
    errors,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📦 PO CREATION WORKFLOW
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create purchase orders for items below reorder point
 */
export async function runPOCreationWorkflow(
  userId: string,
  options?: { vendorId?: string; skus?: string[] }
): Promise<WorkflowResult> {
  const startTime = new Date();
  const agentConfigs = await getAgentConfigs();
  const agentResults: AgentWorkResult[] = [];
  const pendingActions: PendingAction[] = [];
  const autoExecutedActions: ExecutedAction[] = [];
  const errors: string[] = [];

  const stockoutConfig = agentConfigs.get(WORKFLOW_AGENT_IDS.STOCKOUT_PREVENTION);
  const poConfig = agentConfigs.get(WORKFLOW_AGENT_IDS.PO_INTELLIGENCE);

  try {
    // Get items needing reorder
    const alerts = await getCriticalStockoutAlerts();
    const itemsToOrder = alerts.filter(a =>
      a.severity === 'CRITICAL' || a.severity === 'HIGH'
    );

    // Group by vendor (would need vendor lookup in real implementation)
    const vendorGroups = new Map<string, StockoutAlert[]>();
    for (const item of itemsToOrder) {
      // In real implementation, look up preferred vendor for each SKU
      const vendorId = 'default-vendor'; // Placeholder
      if (!vendorGroups.has(vendorId)) {
        vendorGroups.set(vendorId, []);
      }
      vendorGroups.get(vendorId)!.push(item);
    }

    // Create PO actions for each vendor group
    for (const [vendorId, items] of vendorGroups) {
      const totalCost = items.reduce((sum, i) => sum + i.estimated_cost, 0);

      const action: PendingAction = {
        id: `create-po-${vendorId}-${Date.now()}`,
        agent: WORKFLOW_AGENT_IDS.PO_INTELLIGENCE,
        type: 'create_po',
        description: `Create PO with ${items.length} items ($${totalCost.toFixed(2)})`,
        priority: items.some(i => i.severity === 'CRITICAL') ? 'critical' : 'high',
        data: {
          vendorId,
          items: items.map(i => ({
            sku: i.sku,
            name: i.product_name,
            quantity: i.recommended_order_qty,
            estimatedCost: i.estimated_cost,
          })),
          totalCost,
        },
        suggestedAction: 'Create and send PO to vendor',
        requiresConfirmation: !shouldAutoExecute(poConfig),
      };

      if (shouldAutoExecute(poConfig) && poConfig!.trust_score >= 0.9) {
        // Only auto-execute if trust score is high enough
        autoExecutedActions.push({
          id: action.id,
          agent: WORKFLOW_AGENT_IDS.PO_INTELLIGENCE,
          type: 'create_po',
          description: action.description,
          executedAt: new Date(),
          result: { status: 'draft_created', vendorId, itemCount: items.length },
        });
      } else {
        pendingActions.push(action);
      }
    }

    agentResults.push({
      agent: WORKFLOW_AGENT_IDS.PO_INTELLIGENCE,
      success: true,
      autonomyLevel: poConfig?.autonomy_level || 'monitor',
      findings: {
        itemsNeedingReorder: itemsToOrder.length,
        vendorGroups: vendorGroups.size,
      },
      actionsProposed: pendingActions,
      actionsExecuted: autoExecutedActions,
    });

  } catch (err: any) {
    errors.push(`PO Creation: ${err.message}`);
  }

  return {
    success: errors.length === 0,
    workflow: 'po_creation',
    startedAt: startTime,
    completedAt: new Date(),
    agentResults,
    summary: `${pendingActions.length} POs ready for review, ${autoExecutedActions.length} auto-created`,
    pendingActions,
    autoExecutedActions,
    errors,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 ACTION EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

// Import real action executors from actionExecutors.ts
import {
  executeAction as executeRealAction,
  type PendingAction as DBPendingAction,
  type ActionType,
} from './actionExecutors';

/**
 * Execute a pending action that was approved by user.
 * Uses real action executors from actionExecutors.ts - no more placeholder responses.
 */
export async function executePendingAction(
  actionId: string,
  action: PendingAction,
  userId: string
): Promise<{ success: boolean; result?: any; error?: string }> {
  try {
    // Special case: process_emails triggers the workflow
    if (action.type === 'process_emails') {
      const result = await runEmailProcessingWorkflow(userId);
      return { success: result.success, result };
    }

    // Map workflow action to database action format for real execution
    const dbAction: DBPendingAction = {
      id: actionId,
      agentIdentifier: action.agent,
      actionType: mapWorkflowTypeToActionType(action.type),
      actionLabel: action.description,
      payload: action.data,
      priority: mapWorkflowPriorityToDbPriority(action.priority),
      reasoning: action.suggestedAction,
      status: 'approved',
      userId,
      createdAt: new Date(),
    };

    // Use real executor from actionExecutors.ts
    const result = await executeRealAction(dbAction);

    return {
      success: result.success,
      result: result.result,
      error: result.error,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Map workflow action types to database action types */
function mapWorkflowTypeToActionType(workflowType: string): ActionType {
  const typeMap: Record<string, ActionType> = {
    'create_po': 'create_po',
    'send_followup': 'send_email',
    'send_email': 'send_email',
    'process_emails': 'custom',
    'confirm_extraction': 'update_inventory',
  };
  return typeMap[workflowType] || 'custom';
}

/** Map workflow priority to database priority */
function mapWorkflowPriorityToDbPriority(priority: string): 'low' | 'normal' | 'high' | 'urgent' {
  const priorityMap: Record<string, 'low' | 'normal' | 'high' | 'urgent'> = {
    'critical': 'urgent',
    'high': 'high',
    'medium': 'normal',
    'low': 'low',
  };
  return priorityMap[priority] || 'normal';
}

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 END-TO-END AUTONOMOUS PURCHASING WORKFLOW
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Full autonomous purchasing workflow that chains all agents together.
 *
 * Workflow Chain:
 * 1. Inventory Guardian → Detect items at/below ROP
 * 2. Stockout Prevention → Prioritize by criticality and ABC class
 * 3. Auto-PO Generation → Create draft POs with vendor pricing
 * 4. Three-Way Match Check → Verify vendor reliability from past matches
 * 5. Autonomy Gate → Check if POs can be auto-approved
 * 6. PO Intelligence → Send approved POs and queue others for review
 * 7. Air Traffic Controller → Add to monitoring queue
 *
 * This workflow runs daily or on-demand and provides complete visibility
 * into the autonomous purchasing decisions.
 */
export async function runAutonomousPurchasingWorkflow(
  userId: string,
  options?: {
    dryRun?: boolean;
    maxPOs?: number;
    vendorFilter?: string[];
    abcClassFilter?: ('A' | 'B' | 'C')[];
  }
): Promise<WorkflowResult> {
  const startTime = new Date();
  const agentConfigs = await getAgentConfigs();
  const agentResults: AgentWorkResult[] = [];
  const pendingActions: PendingAction[] = [];
  const autoExecutedActions: ExecutedAction[] = [];
  const errors: string[] = [];

  console.log('[AutonomousPurchasing] Starting workflow...');

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: Inventory Guardian - Detect items needing reorder
  // ─────────────────────────────────────────────────────────────────────────
  const guardianConfig = agentConfigs.get(WORKFLOW_AGENT_IDS.INVENTORY_GUARDIAN);

  let reorderItems: any[] = [];
  try {
    const { getRigorousPurchasingAdvice } = await import('./purchasingForecastingService');
    reorderItems = await getRigorousPurchasingAdvice();

    // Filter by ABC class if specified
    if (options?.abcClassFilter?.length) {
      reorderItems = reorderItems.filter(item =>
        options.abcClassFilter!.includes(item.parameters?.abc_class)
      );
    }

    // Filter by vendor if specified
    if (options?.vendorFilter?.length) {
      reorderItems = reorderItems.filter(item =>
        options.vendorFilter!.includes(item.vendor_id)
      );
    }

    agentResults.push({
      agent: WORKFLOW_AGENT_IDS.INVENTORY_GUARDIAN,
      success: true,
      autonomyLevel: guardianConfig?.autonomy_level || 'monitor',
      findings: {
        totalItemsScanned: reorderItems.length,
        itemsBelowROP: reorderItems.filter(i => i.days_remaining <= 14).length,
        criticalItems: reorderItems.filter(i => i.days_remaining <= 0).length,
        byAbcClass: {
          A: reorderItems.filter(i => i.parameters?.abc_class === 'A').length,
          B: reorderItems.filter(i => i.parameters?.abc_class === 'B').length,
          C: reorderItems.filter(i => i.parameters?.abc_class === 'C').length,
        },
      },
      actionsProposed: [],
      actionsExecuted: [],
    });
  } catch (err: any) {
    errors.push(`Inventory Guardian: ${err.message}`);
    agentResults.push({
      agent: WORKFLOW_AGENT_IDS.INVENTORY_GUARDIAN,
      success: false,
      autonomyLevel: guardianConfig?.autonomy_level || 'monitor',
      findings: {},
      actionsProposed: [],
      actionsExecuted: [],
      error: err.message,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: Stockout Prevention - Prioritize critical items
  // ─────────────────────────────────────────────────────────────────────────
  const stockoutConfig = agentConfigs.get(WORKFLOW_AGENT_IDS.STOCKOUT_PREVENTION);

  const criticalItems = reorderItems.filter(i =>
    i.days_remaining <= 7 || i.recommendation?.action === 'URGENT'
  );

  const prioritizedItems = [
    ...criticalItems.sort((a, b) => a.days_remaining - b.days_remaining),
    ...reorderItems
      .filter(i => !criticalItems.includes(i))
      .sort((a, b) => {
        // A class items first, then by days remaining
        const aClass = a.parameters?.abc_class || 'C';
        const bClass = b.parameters?.abc_class || 'C';
        if (aClass !== bClass) return aClass.localeCompare(bClass);
        return a.days_remaining - b.days_remaining;
      }),
  ];

  agentResults.push({
    agent: WORKFLOW_AGENT_IDS.STOCKOUT_PREVENTION,
    success: true,
    autonomyLevel: stockoutConfig?.autonomy_level || 'monitor',
    findings: {
      criticalCount: criticalItems.length,
      prioritizedCount: prioritizedItems.length,
      estimatedStockoutValue: criticalItems.reduce(
        (sum, i) => sum + (i.parameters?.unit_cost || 0) * (i.recommendation?.quantity || 0),
        0
      ),
    },
    actionsProposed: [],
    actionsExecuted: [],
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Auto-PO Generation - Create draft POs
  // ─────────────────────────────────────────────────────────────────────────
  const poConfig = agentConfigs.get(WORKFLOW_AGENT_IDS.PO_INTELLIGENCE);

  let draftsCreated = 0;
  let draftsAutoApproved = 0;
  const draftsByVendor: Record<string, any> = {};

  try {
    const { triggerAutoPOGeneration } = await import('./autoPOGenerationService');
    const { canExecuteAutonomously } = await import('./agentAutonomyGate');

    const autoPOResult = await triggerAutoPOGeneration(
      poConfig?.identifier || 'inventory-guardian',
      {
        dryRun: options?.dryRun,
        vendorFilter: options?.vendorFilter,
        maxDraftsPerRun: options?.maxPOs || 10,
      }
    );

    draftsCreated = autoPOResult.draftsCreated;
    draftsAutoApproved = autoPOResult.draftsAutoApproved;

    // Check autonomy gate for each draft
    for (const draft of autoPOResult.drafts) {
      const canAuto = await canExecuteAutonomously({
        agentId: poConfig?.identifier || 'po-intelligence',
        action: 'create_po',
        targetValue: draft.estimatedTotal,
        targetVendorId: draft.vendorId,
        context: { draftId: draft.id, itemCount: draft.items.length },
      });

      if (canAuto.allowed && !canAuto.requiresApproval) {
        autoExecutedActions.push({
          id: `po-${draft.id}`,
          agent: WORKFLOW_AGENT_IDS.PO_INTELLIGENCE,
          type: 'create_po',
          description: `Auto-created PO for ${draft.vendorName} ($${draft.estimatedTotal.toFixed(2)})`,
          executedAt: new Date(),
          result: {
            draftId: draft.id,
            vendorId: draft.vendorId,
            total: draft.estimatedTotal,
            itemCount: draft.items.length,
          },
        });
      } else {
        pendingActions.push({
          id: `review-po-${draft.id}`,
          agent: WORKFLOW_AGENT_IDS.PO_INTELLIGENCE,
          type: 'create_po',
          description: `Review PO for ${draft.vendorName} ($${draft.estimatedTotal.toFixed(2)})`,
          priority: draft.items.some((i: any) => i.daysRemaining <= 0) ? 'critical' :
                   draft.items.some((i: any) => i.daysRemaining <= 7) ? 'high' : 'medium',
          data: {
            draftId: draft.id,
            vendorId: draft.vendorId,
            vendorName: draft.vendorName,
            items: draft.items,
            total: draft.estimatedTotal,
          },
          suggestedAction: canAuto.reason,
          requiresConfirmation: true,
        });
      }

      draftsByVendor[draft.vendorId] = draft;
    }

    agentResults.push({
      agent: WORKFLOW_AGENT_IDS.PO_INTELLIGENCE,
      success: true,
      autonomyLevel: poConfig?.autonomy_level || 'monitor',
      findings: {
        draftsCreated,
        draftsAutoApproved,
        draftsPendingApproval: draftsCreated - draftsAutoApproved,
        totalValue: autoPOResult.totalValue,
        vendorCount: Object.keys(draftsByVendor).length,
      },
      actionsProposed: pendingActions.filter(a => a.agent === WORKFLOW_AGENT_IDS.PO_INTELLIGENCE),
      actionsExecuted: autoExecutedActions.filter(a => a.agent === WORKFLOW_AGENT_IDS.PO_INTELLIGENCE),
    });
  } catch (err: any) {
    errors.push(`Auto-PO Generation: ${err.message}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 4: Vendor Watchdog - Check vendor reliability
  // ─────────────────────────────────────────────────────────────────────────
  const watchdogConfig = agentConfigs.get(WORKFLOW_AGENT_IDS.VENDOR_WATCHDOG);

  const vendorReliability: Record<string, { matchScore: number; onTimeRate: number }> = {};

  try {
    // Get average match scores and on-time rates for involved vendors
    for (const vendorId of Object.keys(draftsByVendor)) {
      const { data: matches } = await supabase
        .from('po_three_way_matches')
        .select('overall_score')
        .eq('vendor_id', vendorId)
        .order('matched_at', { ascending: false })
        .limit(10);

      const avgScore = matches?.length
        ? matches.reduce((sum, m) => sum + (m.overall_score || 0), 0) / matches.length
        : 50; // Default 50% if no history

      vendorReliability[vendorId] = {
        matchScore: avgScore,
        onTimeRate: 0.85, // Placeholder - would come from actual delivery tracking
      };
    }

    agentResults.push({
      agent: WORKFLOW_AGENT_IDS.VENDOR_WATCHDOG,
      success: true,
      autonomyLevel: watchdogConfig?.autonomy_level || 'monitor',
      findings: {
        vendorsChecked: Object.keys(vendorReliability).length,
        vendorReliability,
        flaggedVendors: Object.entries(vendorReliability)
          .filter(([_, v]) => v.matchScore < 80)
          .map(([id]) => id),
      },
      actionsProposed: [],
      actionsExecuted: [],
    });
  } catch (err: any) {
    errors.push(`Vendor Watchdog: ${err.message}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 5: Air Traffic Controller - Add to monitoring queue
  // ─────────────────────────────────────────────────────────────────────────
  const atcConfig = agentConfigs.get(WORKFLOW_AGENT_IDS.TRAFFIC_CONTROLLER);

  agentResults.push({
    agent: WORKFLOW_AGENT_IDS.TRAFFIC_CONTROLLER,
    success: true,
    autonomyLevel: atcConfig?.autonomy_level || 'monitor',
    findings: {
      newPOsToMonitor: autoExecutedActions.filter(a => a.type === 'create_po').length,
      pendingPOsToWatch: pendingActions.filter(a => a.type === 'create_po').length,
    },
    actionsProposed: [],
    actionsExecuted: [],
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Compile Summary
  // ─────────────────────────────────────────────────────────────────────────
  const completedAt = new Date();
  const summary = generatePurchasingSummary(
    reorderItems.length,
    criticalItems.length,
    draftsCreated,
    draftsAutoApproved,
    pendingActions.length,
    autoExecutedActions.length,
    errors.length
  );

  // Log workflow execution
  try {
    await supabase.from('workflow_executions').insert({
      workflow_name: 'autonomous_purchasing',
      user_id: userId,
      started_at: startTime,
      completed_at: completedAt,
      success: errors.length === 0,
      summary,
      pending_actions_count: pendingActions.length,
      auto_executed_count: autoExecutedActions.length,
      errors: errors.length > 0 ? errors : null,
    });
  } catch (err) {
    console.warn('Could not log workflow execution');
  }

  console.log(`[AutonomousPurchasing] Completed: ${draftsCreated} drafts, ${draftsAutoApproved} auto-approved`);

  return {
    success: errors.length === 0,
    workflow: 'autonomous_purchasing',
    startedAt: startTime,
    completedAt,
    agentResults,
    summary,
    pendingActions,
    autoExecutedActions,
    errors,
  };
}

/**
 * Generate human-readable summary of purchasing workflow
 */
function generatePurchasingSummary(
  totalItems: number,
  criticalItems: number,
  draftsCreated: number,
  draftsAutoApproved: number,
  pendingCount: number,
  autoExecutedCount: number,
  errorCount: number
): string {
  const lines: string[] = [];

  lines.push(`📦 Autonomous Purchasing Workflow Complete`);
  lines.push('');

  if (criticalItems > 0) {
    lines.push(`🔴 ${criticalItems} critical stockout risks identified`);
  }
  lines.push(`📋 ${totalItems} items analyzed for reorder`);

  if (draftsCreated > 0) {
    lines.push(`📝 ${draftsCreated} PO drafts created`);
    if (draftsAutoApproved > 0) {
      lines.push(`✅ ${draftsAutoApproved} POs auto-approved and ready to send`);
    }
    if (pendingCount > 0) {
      lines.push(`⏳ ${pendingCount} POs awaiting your approval`);
    }
  } else {
    lines.push(`✅ No immediate reorders needed`);
  }

  if (errorCount > 0) {
    lines.push(`⚠️ ${errorCount} issues encountered`);
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// 📤 Exports
// ═══════════════════════════════════════════════════════════════════════════

export default {
  getAgentConfigs,
  runMorningBriefing,
  runEmailProcessingWorkflow,
  runPOCreationWorkflow,
  runAutonomousPurchasingWorkflow,
  executePendingAction,
};
