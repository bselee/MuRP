/**
 * Agent Executor Service
 * 
 * ARCHITECTURE: Provides a unified execution interface for all agents.
 * 
 * This service bridges the gap between:
 * - Agent definitions in the database (static configuration)
 * - Actual execution logic (TypeScript functions)
 * 
 * Each agent's capabilities map to specific executor functions.
 */

import { supabase } from '../lib/supabase/client';
import type { AgentDefinition, AgentCapability } from '../types/agents';

// Agent service imports - wire capabilities to real implementations
import { getCriticalStockoutAlerts, type StockoutAlert } from './stockoutPreventionAgent';
import { assessPODelay, type PODelayAlert } from './airTrafficControllerAgent';
import { getVendorPerformance, getFlaggedVendors } from './vendorWatchdogAgent';
import { runInventoryHealthCheck, getReorderPointRecommendations, analyzeVelocityChanges } from './inventoryGuardianAgent';
import { getArrivalPredictions, getPesterAlerts, getInvoiceVariances } from './poIntelligenceAgent';
import { validatePendingLabels, getComplianceSummary } from './complianceValidationAgent';
import { getThreadsRequiringAttention, getOpenAlerts, getAlertSummary } from './emailInboxManager';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface AgentExecutionContext {
  userId: string;
  parameters: Record<string, any>;
  triggerSource: 'manual' | 'scheduled' | 'event' | 'keyword';
  triggerValue?: string;
}

export interface AgentExecutionResult {
  success: boolean;
  agentId: string;
  agentName: string;
  executedAt: Date;
  durationMs: number;
  findings: AgentFinding[];
  actionsProposed: ProposedAction[];
  actionsExecuted: ExecutedAction[];
  error?: string;
}

export interface AgentFinding {
  type: 'alert' | 'recommendation' | 'info' | 'warning';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  data?: Record<string, any>;
}

export interface ProposedAction {
  id: string;
  type: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  data: Record<string, any>;
  requiresConfirmation: boolean;
}

export interface ExecutedAction {
  id: string;
  type: string;
  description: string;
  result: any;
}

// ═══════════════════════════════════════════════════════════════════════════
// Capability Executors Registry
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Registry of capability executors.
 * Each capability ID maps to a function that executes that capability.
 */
type CapabilityExecutor = (
  context: AgentExecutionContext,
  params: Record<string, any>
) => Promise<{
  findings: AgentFinding[];
  proposedActions: ProposedAction[];
}>;

const capabilityExecutors: Record<string, CapabilityExecutor> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // Stock Intelligence / Stockout Prevention capabilities
  // ═══════════════════════════════════════════════════════════════════════════

  'rop-calculation': async (ctx, params) => {
    const recommendations = await getReorderPointRecommendations();
    return {
      findings: recommendations.map(rec => ({
        type: 'recommendation' as const,
        severity: rec.urgency === 'critical' ? 'critical' as const : 'medium' as const,
        title: `ROP Update: ${rec.sku}`,
        description: `Current ROP: ${rec.currentROP} → Suggested: ${rec.suggestedROP} (based on ${rec.reason})`,
        data: rec,
      })),
      proposedActions: recommendations
        .filter(r => Math.abs(r.suggestedROP - r.currentROP) > r.currentROP * 0.1) // >10% change
        .map(rec => ({
          id: `rop-${rec.sku}-${Date.now()}`,
          type: 'adjust-rop',
          description: `Adjust ROP for ${rec.sku}: ${rec.currentROP} → ${rec.suggestedROP}`,
          priority: rec.urgency === 'critical' ? 'high' as const : 'medium' as const,
          data: { sku: rec.sku, newROP: rec.suggestedROP, reason: rec.reason },
          requiresConfirmation: true,
        })),
    };
  },

  'velocity-analysis': async (ctx, params) => {
    const changes = await analyzeVelocityChanges();
    return {
      findings: changes.map(change => ({
        type: change.changePercent > 50 ? 'alert' as const : 'info' as const,
        severity: change.changePercent > 100 ? 'high' as const : 'medium' as const,
        title: `Velocity ${change.direction}: ${change.sku}`,
        description: `${change.productName} velocity changed ${change.changePercent.toFixed(0)}% (${change.previousVelocity.toFixed(1)} → ${change.currentVelocity.toFixed(1)} units/day)`,
        data: change,
      })),
      proposedActions: [],
    };
  },

  'stockout-prediction': async (ctx, params) => {
    const alerts = await getCriticalStockoutAlerts();
    return {
      findings: alerts.map((alert: StockoutAlert) => ({
        type: 'alert' as const,
        severity: alert.daysUntilStockout <= 7 ? 'critical' as const : 'high' as const,
        title: `Stockout Risk: ${alert.sku}`,
        description: `${alert.productName} - ${alert.daysUntilStockout} days until stockout`,
        data: alert,
      })),
      proposedActions: alerts
        .filter((a: StockoutAlert) => a.suggestedOrderQty > 0)
        .map((alert: StockoutAlert) => ({
          id: `po-${alert.sku}-${Date.now()}`,
          type: 'create-po',
          description: `Create PO for ${alert.sku} - Qty: ${alert.suggestedOrderQty}`,
          priority: alert.daysUntilStockout <= 3 ? 'critical' as const : 'high' as const,
          data: {
            sku: alert.sku,
            quantity: alert.suggestedOrderQty,
            vendorId: alert.vendorId,
          },
          requiresConfirmation: true,
        })),
    };
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Email Tracking capabilities (email-tracking-specialist)
  // ═══════════════════════════════════════════════════════════════════════════

  'email-parsing': async (ctx, params) => {
    // Get threads that require attention (unresolved, high urgency, etc.)
    const threads = await getThreadsRequiringAttention();
    return {
      findings: threads.map((thread: any) => ({
        type: thread.urgency_level === 'critical' ? 'alert' as const : 'info' as const,
        severity: thread.urgency_level === 'critical' ? 'critical' as const :
                  thread.urgency_level === 'high' ? 'high' as const : 'medium' as const,
        title: `Email Attention: ${thread.subject || 'No subject'}`,
        description: `${thread.message_count} messages, requires response: ${thread.requires_response}`,
        data: thread,
      })),
      proposedActions: threads
        .filter((t: any) => t.requires_response)
        .map((thread: any) => ({
          id: `email-respond-${thread.id}-${Date.now()}`,
          type: 'schedule-followup',
          description: `Respond to vendor email: ${thread.subject}`,
          priority: thread.urgency_level === 'critical' ? 'critical' as const : 'high' as const,
          data: { threadId: thread.id, subject: thread.subject },
          requiresConfirmation: true,
        })),
    };
  },

  'tracking-extraction': async (ctx, params) => {
    // Get open alerts related to tracking
    const alerts = await getOpenAlerts('tracking');
    return {
      findings: alerts.map((alert: any) => ({
        type: 'info' as const,
        severity: alert.severity === 'critical' ? 'critical' as const : 'medium' as const,
        title: `Tracking Alert: ${alert.alert_type}`,
        description: alert.description || alert.message,
        data: alert,
      })),
      proposedActions: [],
    };
  },

  'po-correlation': async (ctx, params) => {
    // Get summary of correlation stats
    const summary = await getAlertSummary();
    const findings: AgentFinding[] = [];

    if (summary.total > 0) {
      findings.push({
        type: 'info' as const,
        severity: 'low' as const,
        title: 'Email Correlation Summary',
        description: `${summary.total} open alerts: ${summary.critical || 0} critical, ${summary.high || 0} high priority`,
        data: summary,
      });
    }

    return { findings, proposedActions: [] };
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Vendor Watchdog capabilities
  // ═══════════════════════════════════════════════════════════════════════════

  'vendor-scoring': async (ctx, params) => {
    const flaggedVendors = await getFlaggedVendors();
    return {
      findings: flaggedVendors.map(v => ({
        type: 'warning' as const,
        severity: v.reliabilityScore < 0.5 ? 'high' as const : 'medium' as const,
        title: `Vendor Performance Issue: ${v.vendorName}`,
        description: `${v.issue} - Reliability: ${(v.reliabilityScore * 100).toFixed(0)}%`,
        data: v,
      })),
      proposedActions: [],
    };
  },

  'lead-time-tracking': async (ctx, params) => {
    // Get vendor performance metrics which include lead time data
    const performance = await getVendorPerformance();
    const vendorsWithLeadTimeIssues = performance.filter((v: any) =>
      v.averageLeadTimeVariance && Math.abs(v.averageLeadTimeVariance) > 3 // > 3 days variance
    );
    return {
      findings: vendorsWithLeadTimeIssues.map((v: any) => ({
        type: 'info' as const,
        severity: Math.abs(v.averageLeadTimeVariance) > 7 ? 'high' as const : 'medium' as const,
        title: `Lead Time Variance: ${v.vendorName}`,
        description: `Average ${v.averageLeadTimeVariance > 0 ? 'late' : 'early'} by ${Math.abs(v.averageLeadTimeVariance).toFixed(1)} days (${v.onTimeDeliveryRate}% on-time)`,
        data: v,
      })),
      proposedActions: vendorsWithLeadTimeIssues
        .filter((v: any) => v.averageLeadTimeVariance > 5) // Consistently late
        .map((v: any) => ({
          id: `lead-time-adjust-${v.vendorId}-${Date.now()}`,
          type: 'update-lead-time',
          description: `Increase lead time buffer for ${v.vendorName} by ${Math.ceil(v.averageLeadTimeVariance)} days`,
          priority: 'medium' as const,
          data: { vendorId: v.vendorId, suggestedBuffer: Math.ceil(v.averageLeadTimeVariance) },
          requiresConfirmation: true,
        })),
    };
  },

  'performance-alerts': async (ctx, params) => {
    const flagged = await getFlaggedVendors();
    return {
      findings: flagged.map(v => ({
        type: 'alert' as const,
        severity: v.reliabilityScore < 0.5 ? 'critical' as const : 'high' as const,
        title: `Vendor Alert: ${v.vendorName}`,
        description: v.issue,
        data: v,
      })),
      proposedActions: flagged
        .filter(v => v.reliabilityScore < 0.5)
        .map(v => ({
          id: `vendor-review-${v.vendorId}-${Date.now()}`,
          type: 'notify-user',
          description: `Review vendor ${v.vendorName} - reliability dropped to ${(v.reliabilityScore * 100).toFixed(0)}%`,
          priority: 'high' as const,
          data: { vendorId: v.vendorId, vendorName: v.vendorName, issue: v.issue },
          requiresConfirmation: false,
        })),
    };
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PO Intelligence capabilities
  // ═══════════════════════════════════════════════════════════════════════════

  'po-tracking': async (ctx, params) => {
    const predictions = await getArrivalPredictions();
    const lateOrders = predictions.filter(p => p.status === 'late' || p.status === 'at_risk');
    return {
      findings: lateOrders.map(po => ({
        type: po.status === 'late' ? 'alert' as const : 'warning' as const,
        severity: po.status === 'late' ? 'high' as const : 'medium' as const,
        title: `PO ${po.poNumber} ${po.status === 'late' ? 'LATE' : 'At Risk'}`,
        description: `Expected: ${po.expectedDate}, Predicted: ${po.predictedDate} (${po.daysVariance} days ${po.daysVariance > 0 ? 'late' : 'early'})`,
        data: po,
      })),
      proposedActions: [],
    };
  },

  'consolidation': async (ctx, params) => {
    // Analyze pending POs to find consolidation opportunities
    const { data: pendingPOs } = await supabase
      .from('purchase_orders')
      .select('id, order_id, vendor_id, supplier_name, status, expected_date')
      .in('status', ['draft', 'pending'])
      .order('vendor_id');

    // Group by vendor to find consolidation opportunities
    const vendorGroups: Record<string, any[]> = {};
    for (const po of pendingPOs || []) {
      const vendorId = po.vendor_id || 'unknown';
      if (!vendorGroups[vendorId]) vendorGroups[vendorId] = [];
      vendorGroups[vendorId].push(po);
    }

    const consolidationOpportunities = Object.entries(vendorGroups)
      .filter(([_, pos]) => pos.length > 1)
      .map(([vendorId, pos]) => ({
        vendorId,
        vendorName: pos[0]?.supplier_name || 'Unknown Vendor',
        poCount: pos.length,
        poIds: pos.map(p => p.order_id),
      }));

    return {
      findings: consolidationOpportunities.map(opp => ({
        type: 'recommendation' as const,
        severity: opp.poCount >= 3 ? 'high' as const : 'medium' as const,
        title: `Consolidation: ${opp.vendorName}`,
        description: `${opp.poCount} pending POs could be combined for shipping savings`,
        data: opp,
      })),
      proposedActions: consolidationOpportunities
        .filter(opp => opp.poCount >= 2)
        .map(opp => ({
          id: `consolidate-${opp.vendorId}-${Date.now()}`,
          type: 'consolidate-po',
          description: `Consolidate ${opp.poCount} POs for ${opp.vendorName}`,
          priority: opp.poCount >= 3 ? 'high' as const : 'medium' as const,
          data: opp,
          requiresConfirmation: true,
        })),
    };
  },

  'cost-optimization': async (ctx, params) => {
    const variances = await getInvoiceVariances();
    const significantVariances = variances.filter(v => Math.abs(v.variancePercent) > 5);
    return {
      findings: significantVariances.map(v => ({
        type: 'warning' as const,
        severity: v.variancePercent > 10 ? 'high' as const : 'medium' as const,
        title: `Invoice Variance: PO ${v.poNumber}`,
        description: `${v.variancePercent > 0 ? 'Over' : 'Under'} by ${Math.abs(v.variancePercent).toFixed(1)}% ($${Math.abs(v.varianceAmount).toFixed(2)})`,
        data: v,
      })),
      proposedActions: [],
    };
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Compliance capabilities
  // ═══════════════════════════════════════════════════════════════════════════

  'label-validation': async (ctx, params) => {
    const pendingValidations = await validatePendingLabels();
    return {
      findings: pendingValidations.map(v => ({
        type: v.status === 'failed' ? 'alert' as const : 'info' as const,
        severity: v.status === 'failed' ? 'high' as const : 'low' as const,
        title: `Label Validation: ${v.productName}`,
        description: `${v.status === 'passed' ? '✓ Passed' : v.status === 'failed' ? '✗ Failed' : 'Pending'} - ${v.issues?.join(', ') || 'No issues'}`,
        data: v,
      })),
      proposedActions: pendingValidations
        .filter(v => v.status === 'failed')
        .map(v => ({
          id: `compliance-fix-${v.productId}-${Date.now()}`,
          type: 'flag-compliance',
          description: `Fix compliance issues for ${v.productName}: ${v.issues?.join(', ')}`,
          priority: 'high' as const,
          data: { productId: v.productId, productName: v.productName, issues: v.issues },
          requiresConfirmation: true,
        })),
    };
  },

  'document-tracking': async (ctx, params) => {
    const summary = await getComplianceSummary();
    const expiringDocs = summary.expiringDocuments || [];
    return {
      findings: expiringDocs.map((doc: any) => ({
        type: 'warning' as const,
        severity: doc.daysUntilExpiry <= 30 ? 'high' as const : 'medium' as const,
        title: `Document Expiring: ${doc.documentName}`,
        description: `Expires in ${doc.daysUntilExpiry} days (${doc.expiryDate})`,
        data: doc,
      })),
      proposedActions: expiringDocs
        .filter((doc: any) => doc.daysUntilExpiry <= 30)
        .map((doc: any) => ({
          id: `doc-renew-${doc.documentId}-${Date.now()}`,
          type: 'schedule-followup',
          description: `Renew ${doc.documentName} before ${doc.expiryDate}`,
          priority: doc.daysUntilExpiry <= 7 ? 'critical' as const : 'high' as const,
          data: doc,
          requiresConfirmation: true,
        })),
    };
  },

  'regulatory-monitoring': async (ctx, params) => {
    // Check for expiring certifications and compliance deadlines
    const summary = await getComplianceSummary();
    const expiringCerts = summary.expiringCertifications || [];
    const pendingActions = summary.pendingActions || [];

    const findings: AgentFinding[] = [];

    // Add expiring certifications as findings
    findings.push(...expiringCerts.map((cert: any) => ({
      type: 'warning' as const,
      severity: cert.daysUntilExpiry <= 30 ? 'high' as const : 'medium' as const,
      title: `Certification Expiring: ${cert.name}`,
      description: `${cert.state} ${cert.type} expires in ${cert.daysUntilExpiry} days`,
      data: cert,
    })));

    // Add pending regulatory actions
    findings.push(...pendingActions.map((action: any) => ({
      type: 'alert' as const,
      severity: action.priority === 'urgent' ? 'critical' as const : 'high' as const,
      title: `Regulatory Action Required: ${action.title}`,
      description: action.description,
      data: action,
    })));

    return {
      findings,
      proposedActions: expiringCerts
        .filter((cert: any) => cert.daysUntilExpiry <= 30)
        .map((cert: any) => ({
          id: `renew-cert-${cert.id}-${Date.now()}`,
          type: 'schedule-followup',
          description: `Renew ${cert.name} for ${cert.state}`,
          priority: cert.daysUntilExpiry <= 7 ? 'critical' as const : 'high' as const,
          data: cert,
          requiresConfirmation: true,
        })),
    };
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Inventory Guardian capabilities
  // ═══════════════════════════════════════════════════════════════════════════

  'stock-monitoring': async (ctx, params) => {
    const healthCheck = await runInventoryHealthCheck();
    return {
      findings: healthCheck.issues.map((issue: any) => ({
        type: issue.severity === 'critical' ? 'alert' as const : 'warning' as const,
        severity: issue.severity as 'critical' | 'high' | 'medium' | 'low',
        title: issue.title,
        description: issue.description,
        data: issue,
      })),
      proposedActions: [],
    };
  },

  'anomaly-detection': async (ctx, params) => {
    const healthCheck = await runInventoryHealthCheck();
    const anomalies = healthCheck.anomalies || [];
    return {
      findings: anomalies.map((anomaly: any) => ({
        type: 'warning' as const,
        severity: 'medium' as const,
        title: `Inventory Anomaly: ${anomaly.sku}`,
        description: anomaly.description,
        data: anomaly,
      })),
      proposedActions: [],
    };
  },

  'discrepancy-resolution': async (ctx, params) => {
    // Check for inventory discrepancies - items where stock count may not match system
    const { data: items } = await supabase
      .from('inventory_items')
      .select('sku, name, stock, last_count_date, last_count_quantity')
      .not('last_count_date', 'is', null);

    const discrepancies = (items || [])
      .filter((item: any) => {
        const countDiff = Math.abs((item.stock || 0) - (item.last_count_quantity || 0));
        return countDiff > 0 && item.last_count_quantity !== null;
      })
      .map((item: any) => ({
        sku: item.sku,
        name: item.name,
        systemStock: item.stock,
        countedStock: item.last_count_quantity,
        difference: item.stock - item.last_count_quantity,
        lastCountDate: item.last_count_date,
      }));

    return {
      findings: discrepancies.map(d => ({
        type: 'warning' as const,
        severity: Math.abs(d.difference) > 10 ? 'high' as const : 'medium' as const,
        title: `Stock Discrepancy: ${d.sku}`,
        description: `System: ${d.systemStock}, Counted: ${d.countedStock} (Diff: ${d.difference > 0 ? '+' : ''}${d.difference})`,
        data: d,
      })),
      proposedActions: discrepancies
        .filter(d => Math.abs(d.difference) > 5)
        .map(d => ({
          id: `adjust-stock-${d.sku}-${Date.now()}`,
          type: 'update-inventory',
          description: `Adjust ${d.sku} stock to ${d.countedStock} (counted value)`,
          priority: Math.abs(d.difference) > 20 ? 'high' as const : 'medium' as const,
          data: { sku: d.sku, newStock: d.countedStock, reason: 'Count reconciliation' },
          requiresConfirmation: true,
        })),
    };
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Agent Executor
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execute an agent by running all its capabilities
 */
export async function executeAgent(
  agent: AgentDefinition,
  context: AgentExecutionContext
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const allFindings: AgentFinding[] = [];
  const allProposed: ProposedAction[] = [];
  const allExecuted: ExecutedAction[] = [];

  try {
    // Execute each capability
    for (const capability of agent.capabilities) {
      const executor = capabilityExecutors[capability.id];
      
      if (!executor) {
        console.warn(`No executor found for capability: ${capability.id}`);
        continue;
      }

      try {
        const result = await executor(context, agent.parameters);
        allFindings.push(...result.findings);
        allProposed.push(...result.proposedActions);
      } catch (capError) {
        console.error(`Error executing capability ${capability.id}:`, capError);
        allFindings.push({
          type: 'warning',
          severity: 'medium',
          title: `Capability Error: ${capability.name}`,
          description: String(capError),
        });
      }
    }

    // If autonomy is 'autonomous' and trust score is high enough, execute actions
    if (agent.autonomyLevel === 'autonomous' && agent.trustScore >= 0.8) {
      for (const action of allProposed.filter(a => !a.requiresConfirmation)) {
        try {
          const result = await executeAction(action, context);
          allExecuted.push({
            id: action.id,
            type: action.type,
            description: action.description,
            result,
          });
        } catch (actionError) {
          console.error(`Error executing action ${action.id}:`, actionError);
        }
      }
    }

    // Log execution
    await logAgentExecution(agent.identifier, 'success', Date.now() - startTime, {
      findingsCount: allFindings.length,
      proposedCount: allProposed.length,
      executedCount: allExecuted.length,
    });

    return {
      success: true,
      agentId: agent.id,
      agentName: agent.name,
      executedAt: new Date(),
      durationMs: Date.now() - startTime,
      findings: allFindings,
      actionsProposed: allProposed,
      actionsExecuted: allExecuted,
    };

  } catch (error) {
    await logAgentExecution(agent.identifier, 'error', Date.now() - startTime, {
      error: String(error),
    });

    return {
      success: false,
      agentId: agent.id,
      agentName: agent.name,
      executedAt: new Date(),
      durationMs: Date.now() - startTime,
      findings: allFindings,
      actionsProposed: allProposed,
      actionsExecuted: allExecuted,
      error: String(error),
    };
  }
}

/**
 * Execute a single proposed action
 */
async function executeAction(
  action: ProposedAction,
  context: AgentExecutionContext
): Promise<any> {
  switch (action.type) {
    case 'create-po':
      // Would call PO creation service
      console.log('Creating PO:', action.data);
      return { success: true, poId: 'mock-po-id' };

    case 'send-email':
      // Would call email service
      console.log('Sending email:', action.data);
      return { success: true };

    case 'update-inventory':
      // Would call inventory update
      console.log('Updating inventory:', action.data);
      return { success: true };

    default:
      console.warn(`Unknown action type: ${action.type}`);
      return { success: false, error: 'Unknown action type' };
  }
}

/**
 * Log agent execution to database
 */
async function logAgentExecution(
  agentIdentifier: string,
  status: 'success' | 'error',
  durationMs: number,
  details: Record<string, any>
): Promise<void> {
  try {
    await supabase
      .from('agent_usage_tracking')
      .insert({
        agent_identifier: agentIdentifier,
        execution_status: status,
        execution_duration_ms: durationMs,
        execution_details: details,
      });
  } catch (error) {
    console.error('Failed to log agent execution:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Agent Lookup & Loading
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load an agent by identifier and execute it
 */
export async function executeAgentByIdentifier(
  identifier: string,
  context: AgentExecutionContext
): Promise<AgentExecutionResult | null> {
  const { data: agent, error } = await supabase
    .from('agent_definitions')
    .select('*')
    .eq('identifier', identifier)
    .eq('is_active', true)
    .single();

  if (error || !agent) {
    console.error(`Agent not found: ${identifier}`);
    return null;
  }

  // Transform database record to AgentDefinition
  const agentDef: AgentDefinition = {
    id: agent.id,
    identifier: agent.identifier,
    name: agent.name,
    description: agent.description,
    category: agent.category,
    icon: agent.icon,
    systemPrompt: agent.system_prompt,
    autonomyLevel: agent.autonomy_level,
    capabilities: agent.capabilities || [],
    triggers: agent.triggers || [],
    parameters: agent.parameters || {},
    mcpTools: agent.mcp_tools,
    allowedTools: agent.allowed_tools,
    isActive: agent.is_active,
    trustScore: agent.trust_score,
    isBuiltIn: agent.is_built_in,
    version: agent.version,
    createdAt: new Date(agent.created_at),
    updatedAt: new Date(agent.updated_at),
    createdBy: agent.created_by,
  };

  return executeAgent(agentDef, context);
}

/**
 * Register a new capability executor
 */
export function registerCapabilityExecutor(
  capabilityId: string,
  executor: CapabilityExecutor
): void {
  capabilityExecutors[capabilityId] = executor;
}

export { capabilityExecutors };
