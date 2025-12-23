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
import { getArrivalPredictions, getPesterAlerts, getInvoiceVariances, type PesterAlert } from './poIntelligenceAgent';
import { runFollowUpAutomation } from './followUpService';
import { validatePendingLabels, getComplianceSummary } from './complianceValidationAgent';
import { getThreadsRequiringAttention, getOpenAlerts, getAlertSummary, correlateEmailToPO } from './emailInboxManager';
import {
  triggerEmailPolling,
  extractTrackingInfo,
  getEmailsByPurpose,
  getUncorrelatedEmails,
  getEmailsWithTracking,
  type ParsedEmailContent,
} from './emailProcessingService';

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
  // These actually process emails from configured Gmail inboxes (Purchasing + AP)
  // ═══════════════════════════════════════════════════════════════════════════

  'email-parsing': async (ctx, params) => {
    // Trigger actual email polling from Gmail inboxes
    const pollingResults = await triggerEmailPolling();
    const findings: AgentFinding[] = [];
    const proposedActions: ProposedAction[] = [];

    // Process results from each inbox
    for (const result of pollingResults) {
      if (!result.success) {
        findings.push({
          type: 'warning' as const,
          severity: 'medium' as const,
          title: `Inbox Error: ${result.inboxName}`,
          description: result.error || 'Failed to process inbox',
          data: { inboxId: result.inboxId, purpose: result.purpose },
        });
        continue;
      }

      // Report processing stats
      if (result.stats.emailsProcessed > 0) {
        findings.push({
          type: 'info' as const,
          severity: 'low' as const,
          title: `Processed ${result.stats.emailsProcessed} emails from ${result.inboxName}`,
          description: `Inbox purpose: ${result.purpose}. Correlated ${result.stats.posCorrelated} to POs, found ${result.stats.trackingNumbersFound} tracking numbers.`,
          data: result.stats,
        });
      }

      // Report alerts generated
      if (result.stats.alertsGenerated > 0) {
        findings.push({
          type: 'alert' as const,
          severity: 'high' as const,
          title: `${result.stats.alertsGenerated} alerts from ${result.inboxName}`,
          description: `New alerts generated from incoming vendor emails`,
          data: { alertCount: result.stats.alertsGenerated },
        });
      }
    }

    // Also get threads requiring attention
    const threads = await getThreadsRequiringAttention();
    for (const thread of threads) {
      findings.push({
        type: thread.urgency_level === 'critical' ? 'alert' as const : 'info' as const,
        severity: thread.urgency_level === 'critical' ? 'critical' as const :
                  thread.urgency_level === 'high' ? 'high' as const : 'medium' as const,
        title: `Email Attention: ${thread.subject || 'No subject'}`,
        description: `${thread.message_count} messages, requires response: ${thread.requires_response}`,
        data: thread,
      });

      if (thread.requires_response) {
        proposedActions.push({
          id: `email-respond-${thread.id}-${Date.now()}`,
          type: 'schedule-followup',
          description: `Respond to vendor email: ${thread.subject}`,
          priority: thread.urgency_level === 'critical' ? 'critical' as const : 'high' as const,
          data: { threadId: thread.id, subject: thread.subject },
          requiresConfirmation: true,
        });
      }
    }

    return { findings, proposedActions };
  },

  'tracking-extraction': async (ctx, params) => {
    // Get emails with tracking information from both inbox types
    const emailsWithTracking = await getEmailsWithTracking(50);
    const findings: AgentFinding[] = [];

    // Group by carrier for summary
    const carrierCounts: Record<string, number> = {};
    const recentTracking: ParsedEmailContent[] = [];

    for (const email of emailsWithTracking) {
      const carrier = email.carrier || 'Unknown';
      carrierCounts[carrier] = (carrierCounts[carrier] || 0) + 1;

      // Get recent ones for detailed findings
      if (recentTracking.length < 10) {
        recentTracking.push(email);
      }
    }

    // Summary finding
    if (Object.keys(carrierCounts).length > 0) {
      findings.push({
        type: 'info' as const,
        severity: 'low' as const,
        title: 'Tracking Numbers Summary',
        description: Object.entries(carrierCounts)
          .map(([carrier, count]) => `${carrier}: ${count}`)
          .join(', '),
        data: { carrierCounts, totalTracking: emailsWithTracking.length },
      });
    }

    // Recent tracking details
    for (const email of recentTracking) {
      findings.push({
        type: 'info' as const,
        severity: email.poId ? 'low' as const : 'medium' as const,
        title: `Tracking: ${email.trackingNumber} (${email.carrier || 'Unknown'})`,
        description: email.poId
          ? `Linked to PO, ETA: ${email.eta || 'Unknown'}`
          : `Subject: ${email.subject}. Needs PO correlation.`,
        data: email,
      });
    }

    // Also get tracking alerts
    const alerts = await getOpenAlerts('tracking');
    for (const alert of alerts) {
      findings.push({
        type: 'alert' as const,
        severity: alert.severity === 'critical' ? 'critical' as const : 'high' as const,
        title: `Tracking Alert: ${alert.alert_type}`,
        description: alert.description || alert.message,
        data: alert,
      });
    }

    return { findings, proposedActions: [] };
  },

  'po-correlation': async (ctx, params) => {
    // Get uncorrelated emails that need manual PO matching
    const uncorrelatedEmails = await getUncorrelatedEmails(20);
    const findings: AgentFinding[] = [];
    const proposedActions: ProposedAction[] = [];

    // Get alert summary
    const summary = await getAlertSummary();

    if (summary.total_open > 0) {
      findings.push({
        type: 'info' as const,
        severity: summary.critical_count > 0 ? 'high' as const : 'medium' as const,
        title: 'Email Alert Summary',
        description: `${summary.total_open} open alerts: ${summary.critical_count || 0} critical, ${summary.high_count || 0} high priority`,
        data: summary,
      });
    }

    // Report uncorrelated emails
    if (uncorrelatedEmails.length > 0) {
      findings.push({
        type: 'warning' as const,
        severity: 'medium' as const,
        title: `${uncorrelatedEmails.length} emails need PO correlation`,
        description: 'These vendor emails could not be automatically matched to purchase orders',
        data: { count: uncorrelatedEmails.length },
      });

      // Add individual uncorrelated emails as findings
      for (const email of uncorrelatedEmails.slice(0, 5)) {
        findings.push({
          type: 'info' as const,
          severity: 'low' as const,
          title: `Uncorrelated: ${email.subject.slice(0, 50)}...`,
          description: `From: ${email.from}${email.trackingNumber ? `. Tracking: ${email.trackingNumber}` : ''}`,
          data: email,
        });

        // Propose manual correlation if tracking number found
        if (email.trackingNumber) {
          proposedActions.push({
            id: `correlate-${email.threadId}-${Date.now()}`,
            type: 'manual-correlation',
            description: `Match email with tracking ${email.trackingNumber} to a PO`,
            priority: 'medium' as const,
            data: { threadId: email.threadId, trackingNumber: email.trackingNumber, from: email.from },
            requiresConfirmation: true,
          });
        }
      }
    }

    return { findings, proposedActions };
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

  'po-followup': async (ctx, params) => {
    // Get POs that need follow-up (overdue, no tracking, out of stock items)
    const pesterAlerts = await getPesterAlerts();
    const findings: AgentFinding[] = [];
    const proposedActions: ProposedAction[] = [];

    // Group by priority for summary
    const urgent = pesterAlerts.filter(a => a.priority === 'urgent');
    const high = pesterAlerts.filter(a => a.priority === 'high');
    const medium = pesterAlerts.filter(a => a.priority === 'medium');

    // Add summary finding
    if (pesterAlerts.length > 0) {
      findings.push({
        type: 'alert' as const,
        severity: urgent.length > 0 ? 'critical' as const : high.length > 0 ? 'high' as const : 'medium' as const,
        title: `${pesterAlerts.length} POs Need Follow-Up`,
        description: `${urgent.length} urgent, ${high.length} high priority, ${medium.length} medium priority`,
        data: { counts: { urgent: urgent.length, high: high.length, medium: medium.length } },
      });
    }

    // Add individual alerts and propose follow-up actions
    for (const alert of pesterAlerts) {
      const reasonLabels: Record<string, string> = {
        out_of_stock: 'Out of Stock Items',
        overdue: 'Overdue Delivery',
        no_tracking: 'No Tracking Info',
        exception: 'Delivery Exception',
      };

      findings.push({
        type: 'alert' as const,
        severity: alert.priority === 'urgent' ? 'critical' as const :
                  alert.priority === 'high' ? 'high' as const : 'medium' as const,
        title: `${alert.po_number}: ${reasonLabels[alert.reason] || alert.reason}`,
        description: alert.days_overdue > 0
          ? `${alert.days_overdue} days overdue. Vendor: ${alert.vendor_name}. ${alert.items_affected.length > 0 ? `Affected: ${alert.items_affected.slice(0, 3).join(', ')}` : ''}`
          : `Vendor: ${alert.vendor_name}. Reason: ${alert.reason}`,
        data: alert,
      });

      // Propose follow-up email action
      if (alert.vendor_email) {
        proposedActions.push({
          id: `followup-${alert.po_id}-${Date.now()}`,
          type: 'send-email',
          description: `Send follow-up email to ${alert.vendor_name} for PO ${alert.po_number}`,
          priority: alert.priority === 'urgent' ? 'critical' as const :
                    alert.priority === 'high' ? 'high' as const : 'medium' as const,
          data: {
            poId: alert.po_id,
            poNumber: alert.po_number,
            vendorEmail: alert.vendor_email,
            vendorName: alert.vendor_name,
            reason: alert.reason,
            itemsAffected: alert.items_affected,
          },
          requiresConfirmation: alert.priority !== 'urgent', // Auto-send urgent ones if autonomous
        });
      }
    }

    // Try to trigger the follow-up automation
    if (ctx.triggerSource === 'scheduled' || ctx.triggerSource === 'event') {
      try {
        const result = await runFollowUpAutomation();
        if (result.sent && result.sent > 0) {
          findings.push({
            type: 'info' as const,
            severity: 'low' as const,
            title: `Sent ${result.sent} Follow-Up Emails`,
            description: 'Automated follow-up emails were sent to vendors',
            data: result,
          });
        }
      } catch (error) {
        findings.push({
          type: 'warning' as const,
          severity: 'medium' as const,
          title: 'Follow-Up Automation Failed',
          description: error instanceof Error ? error.message : 'Unknown error',
          data: { error: String(error) },
        });
      }
    }

    return { findings, proposedActions };
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Ingredient Compliance Agent capabilities
  // ═══════════════════════════════════════════════════════════════════════════

  'research-regulations': async (ctx, params) => {
    // This capability uses MCP tools via the Python server
    // The actual research is done by calling the MCP server externally
    // Here we just identify ingredients that need research
    const findings: AgentFinding[] = [];
    const proposedActions: ProposedAction[] = [];

    try {
      // Get ingredients missing compliance data for priority states
      const priorityStates = (params?.priority_states as string[]) || ['CA', 'OR', 'WA', 'TX', 'NM', 'NY'];

      // Get all unique ingredients from BOMs
      const { data: boms } = await supabase
        .from('boms')
        .select('components')
        .not('components', 'is', null);

      const ingredientSkus = new Set<string>();
      for (const bom of boms || []) {
        const components = bom.components as Array<{ sku: string; name: string }>;
        for (const comp of components || []) {
          if (comp.sku) ingredientSkus.add(comp.sku);
        }
      }

      // Check which ingredients have compliance data
      const { data: existingCompliance } = await supabase
        .from('ingredient_compliance_status')
        .select('ingredient_sku, state_code')
        .in('state_code', priorityStates);

      const complianceMap = new Map<string, Set<string>>();
      for (const record of existingCompliance || []) {
        if (!complianceMap.has(record.ingredient_sku)) {
          complianceMap.set(record.ingredient_sku, new Set());
        }
        complianceMap.get(record.ingredient_sku)!.add(record.state_code);
      }

      // Find ingredients missing compliance data
      const needsResearch: Array<{ sku: string; missingStates: string[] }> = [];
      for (const sku of ingredientSkus) {
        const coveredStates = complianceMap.get(sku) || new Set();
        const missingStates = priorityStates.filter(s => !coveredStates.has(s));
        if (missingStates.length > 0) {
          needsResearch.push({ sku, missingStates });
        }
      }

      if (needsResearch.length > 0) {
        findings.push({
          type: 'info',
          severity: 'medium',
          title: `${needsResearch.length} Ingredients Need Compliance Research`,
          description: `Found ${needsResearch.length} ingredients missing state compliance data. Use MCP tools to research regulations.`,
          data: { needsResearch: needsResearch.slice(0, 10) }, // First 10
        });

        // Propose research actions
        for (const item of needsResearch.slice(0, 5)) {
          proposedActions.push({
            id: `research-${item.sku}-${Date.now()}`,
            type: 'custom',
            description: `Research ${item.sku} compliance for ${item.missingStates.join(', ')}`,
            priority: 'medium',
            data: {
              action: 'research_ingredient_regulations',
              ingredient_sku: item.sku,
              states: item.missingStates,
            },
            requiresConfirmation: false,
          });
        }
      }

      return { findings, proposedActions };
    } catch (error) {
      findings.push({
        type: 'warning',
        severity: 'medium',
        title: 'Research Analysis Error',
        description: String(error),
      });
      return { findings, proposedActions };
    }
  },

  'populate-compliance': async (ctx, params) => {
    // This is triggered after research - just monitors current state
    const findings: AgentFinding[] = [];
    const proposedActions: ProposedAction[] = [];

    try {
      // Get counts of compliance data
      const { count: totalRecords } = await supabase
        .from('ingredient_compliance_status')
        .select('*', { count: 'exact', head: true });

      const { data: byStatus } = await supabase
        .from('ingredient_compliance_status')
        .select('compliance_status')
        .not('compliance_status', 'is', null);

      const statusCounts: Record<string, number> = {};
      for (const record of byStatus || []) {
        const status = record.compliance_status;
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      }

      findings.push({
        type: 'info',
        severity: 'low',
        title: 'Ingredient Compliance Database Status',
        description: `${totalRecords || 0} total compliance records. Prohibited: ${statusCounts['prohibited'] || 0}, Restricted: ${statusCounts['restricted'] || 0}, Compliant: ${statusCounts['compliant'] || 0}`,
        data: statusCounts,
      });

      return { findings, proposedActions };
    } catch (error) {
      findings.push({
        type: 'warning',
        severity: 'medium',
        title: 'Compliance Data Check Error',
        description: String(error),
      });
      return { findings, proposedActions };
    }
  },

  'research-sds': async (ctx, params) => {
    // Find ingredients missing SDS documents
    const findings: AgentFinding[] = [];
    const proposedActions: ProposedAction[] = [];

    try {
      // Get ingredients that need SDS but don't have one
      const { data: missingSDS } = await supabase
        .from('ingredient_compliance_status')
        .select('ingredient_sku, ingredient_name')
        .eq('sds_required', true)
        .eq('sds_status', 'missing');

      const uniqueSkus = [...new Set((missingSDS || []).map(r => r.ingredient_sku))];

      if (uniqueSkus.length > 0) {
        findings.push({
          type: 'warning',
          severity: 'medium',
          title: `${uniqueSkus.length} Ingredients Missing SDS`,
          description: `These ingredients require SDS documents for compliance verification.`,
          data: { skus: uniqueSkus.slice(0, 20) },
        });

        // Propose SDS research for top 5
        for (const sku of uniqueSkus.slice(0, 5)) {
          const record = missingSDS?.find(r => r.ingredient_sku === sku);
          proposedActions.push({
            id: `sds-research-${sku}-${Date.now()}`,
            type: 'custom',
            description: `Research SDS for ${record?.ingredient_name || sku}`,
            priority: 'medium',
            data: {
              action: 'research_ingredient_sds',
              ingredient_sku: sku,
              ingredient_name: record?.ingredient_name,
            },
            requiresConfirmation: false,
          });
        }
      }

      // Check for expiring SDS
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const { data: expiringSDS } = await supabase
        .from('ingredient_sds_documents')
        .select('ingredient_sku, ingredient_name, sds_expiration_date')
        .eq('status', 'active')
        .lte('sds_expiration_date', thirtyDaysFromNow.toISOString().split('T')[0])
        .gte('sds_expiration_date', new Date().toISOString().split('T')[0]);

      if ((expiringSDS?.length || 0) > 0) {
        findings.push({
          type: 'warning',
          severity: 'high',
          title: `${expiringSDS!.length} SDS Documents Expiring Soon`,
          description: `These SDS documents will expire within 30 days and need renewal.`,
          data: { expiring: expiringSDS },
        });
      }

      return { findings, proposedActions };
    } catch (error) {
      findings.push({
        type: 'warning',
        severity: 'medium',
        title: 'SDS Research Error',
        description: String(error),
      });
      return { findings, proposedActions };
    }
  },

  'cross-use-analysis': async (ctx, params) => {
    // Analyze ingredient usage across BOMs to prioritize compliance research
    const findings: AgentFinding[] = [];
    const proposedActions: ProposedAction[] = [];

    try {
      // Get all BOMs with components
      const { data: boms } = await supabase
        .from('boms')
        .select('id, name, finished_sku, components')
        .not('components', 'is', null);

      // Count ingredient usage
      const usageCounts = new Map<string, { count: number; boms: string[] }>();

      for (const bom of boms || []) {
        const components = bom.components as Array<{ sku: string; name: string }>;
        for (const comp of components || []) {
          if (!comp.sku) continue;
          if (!usageCounts.has(comp.sku)) {
            usageCounts.set(comp.sku, { count: 0, boms: [] });
          }
          const entry = usageCounts.get(comp.sku)!;
          entry.count++;
          entry.boms.push(bom.finished_sku);
        }
      }

      // Find high-impact ingredients (used in 3+ BOMs)
      const highImpact = Array.from(usageCounts.entries())
        .filter(([_, v]) => v.count >= 3)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10);

      if (highImpact.length > 0) {
        findings.push({
          type: 'info',
          severity: 'medium',
          title: `${highImpact.length} High-Impact Ingredients Identified`,
          description: `These ingredients are used across multiple products. Changes affect many BOMs.`,
          data: {
            highImpact: highImpact.map(([sku, data]) => ({
              sku,
              usedInBOMs: data.count,
              products: data.boms.slice(0, 5),
            })),
          },
        });
      }

      // Check for restricted/prohibited high-impact ingredients
      const { data: problemIngredients } = await supabase
        .from('ingredient_compliance_status')
        .select('ingredient_sku, state_code, compliance_status, restriction_details')
        .in('ingredient_sku', highImpact.map(([sku]) => sku))
        .in('compliance_status', ['prohibited', 'restricted']);

      if ((problemIngredients?.length || 0) > 0) {
        findings.push({
          type: 'alert',
          severity: 'high',
          title: 'High-Impact Ingredients Have Compliance Issues',
          description: `Found ${problemIngredients!.length} compliance issues in frequently-used ingredients.`,
          data: { issues: problemIngredients },
        });
      }

      return { findings, proposedActions };
    } catch (error) {
      findings.push({
        type: 'warning',
        severity: 'medium',
        title: 'Cross-Use Analysis Error',
        description: String(error),
      });
      return { findings, proposedActions };
    }
  },

  'check-ingredient-compliance': async (ctx, params) => {
    // Check overall ingredient compliance status
    const findings: AgentFinding[] = [];
    const proposedActions: ProposedAction[] = [];

    try {
      const priorityStates = (params?.priority_states as string[]) || ['CA', 'OR', 'WA'];

      // Get prohibited ingredients
      const { data: prohibited } = await supabase
        .from('ingredient_compliance_status')
        .select('ingredient_sku, ingredient_name, state_code, restriction_details')
        .eq('compliance_status', 'prohibited')
        .in('state_code', priorityStates);

      if ((prohibited?.length || 0) > 0) {
        findings.push({
          type: 'alert',
          severity: 'critical',
          title: `${prohibited!.length} Prohibited Ingredients Found`,
          description: `These ingredients cannot be used in products sold in the listed states.`,
          data: { prohibited },
        });
      }

      // Get restricted ingredients
      const { data: restricted } = await supabase
        .from('ingredient_compliance_status')
        .select('ingredient_sku, ingredient_name, state_code, restriction_type, restriction_details, max_concentration')
        .eq('compliance_status', 'restricted')
        .in('state_code', priorityStates);

      if ((restricted?.length || 0) > 0) {
        findings.push({
          type: 'warning',
          severity: 'high',
          title: `${restricted!.length} Restricted Ingredients`,
          description: `These ingredients have concentration limits or special requirements.`,
          data: { restricted },
        });
      }

      return { findings, proposedActions };
    } catch (error) {
      findings.push({
        type: 'warning',
        severity: 'medium',
        title: 'Compliance Check Error',
        description: String(error),
      });
      return { findings, proposedActions };
    }
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
